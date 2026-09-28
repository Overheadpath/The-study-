"""Turning an edit plan into a finished video with one ffmpeg command.

The picture goes through these steps:
  1. frame rate made steady, picture cut/scaled to the size the layout needs
  2. split into the plan's segments (kept parts, slow-mo parts, freeze frames) and joined again
  3. zoom / shake / color / flash on the gameplay picture
  4. layout: 9:16 with a blurred copy behind it, cropped to fill, black bars, or original shape
  5. captions and emoji stickers (pictures drawn by the browser) pop in on top
The sound is the game audio (cut and stretched the same way), plus sound effects and music.
"""

from pathlib import Path

from . import ffmpeg_tools as ff
from . import plan as P
from . import sfx

EXPORT_WIDTH = 1080
TEXT_POP = "if(lt(t,0.1),0.7+3.5*t,if(lt(t,0.18),1.05-0.625*(t-0.1),1))"
STICKER_POP = "if(lt(t,0.12),0.3+7.0833*t,if(lt(t,0.22),1.15-1.5*(t-0.12),1))"


class RenderError(RuntimeError):
    pass


def _even(n):
    return max(2, int(round(n / 2.0)) * 2)


def _f(x):
    """A number written short for ffmpeg expressions."""
    return f"{x:.4f}".rstrip("0").rstrip(".") if isinstance(x, float) else str(x)


def canvas_size(plan, info, scale=1.0):
    fmt = plan.get("format", "vertical")
    if fmt == "vertical":
        w, h = 1080, 1920
    elif fmt == "square":
        w, h = 1080, 1080
    elif info.width >= info.height:
        h = min(1080, info.height)
        w = info.width * h / info.height
    else:
        w = min(1080, info.width)
        h = info.height * w / info.width
    return _even(w * scale), _even(h * scale)


def output_fps(info, quality):
    if quality != "export":
        return 30
    return 60 if info.fps >= 50 else 30


def _snap(t, fps):
    return round(t * fps) / fps


def _atempo_chain(factor):
    parts = []
    while factor < 0.5:
        parts.append("atempo=0.5")
        factor /= 0.5
    while factor > 100:
        parts.append("atempo=100")
        factor /= 100
    if abs(factor - 1.0) > 1e-3:
        parts.append(f"atempo={factor:.5f}")
    return parts


def _window(start, length, ramp=0.15):
    """1 during [start, start+length], ramping in and out; 0 elsewhere."""
    r = max(0.03, min(ramp, length / 3))
    return f"clip((t-{_f(start)})/{_f(r)},0,1)*clip(({_f(start + length)}-t)/{_f(r)},0,1)"


COLOR_FILTERS = {
    "none": [],
    "vibrant": ["eq=saturation=1.45:contrast=1.08"],
    "cinematic": ["eq=contrast=1.12:saturation=0.92",
                  "colorbalance=rs=-0.05:bs=0.08:rh=0.08:bh=-0.06"],
    "bw": ["hue=s=0", "eq=contrast=1.15"],
    "warm": ["colorbalance=rm=0.08:gm=0.02:bm=-0.08", "eq=saturation=1.1"],
    "cold": ["colorbalance=rm=-0.06:bm=0.1"],
    "retro": ["curves=preset=vintage", "eq=saturation=0.85", "noise=alls=10:allf=t"],
}


class Layout:
    """Where the gameplay picture sits on the canvas."""

    def __init__(self, plan, info, canvas):
        self.cw, self.ch = canvas
        self.fmt = plan.get("format", "vertical")
        self.fit = plan.get("fit", "blur") if self.fmt != "original" else "fill"
        aspect = info.width / info.height
        if self.fit in ("blur", "bars"):
            s = min(self.cw / info.width, self.ch / info.height)
            self.content = (_even(info.width * s), _even(info.height * s))
        else:
            self.content = (self.cw, self.ch)
        self.crop_aspect = self.cw / self.ch if self.fit == "crop" else None
        self.fg_top = (self.ch - self.content[1]) / 2
        self.fg_bottom = self.fg_top + self.content[1]
        self.aspect = aspect

    def center(self, position):
        if position == "middle":
            return self.cw / 2, self.ch / 2
        space = self.fg_top if self.fit in ("blur", "bars") else 0
        if position == "top":
            return self.cw / 2, (space / 2 if space >= 0.12 * self.ch else 0.14 * self.ch)
        return self.cw / 2, (self.ch - space / 2 if space >= 0.12 * self.ch else 0.86 * self.ch)


def build(plan, info, src, out_path, quality="preview", overlay_dir=None, has_audio=None,
          src_size=None):
    """The ffmpeg arguments for a plan. Returns (args, details).

    info describes the original clip (its shape decides the layout); src can be the smaller
    preview copy, whose size is src_size.
    """
    scale = 1.0 if quality == "export" else 0.5
    fps = output_fps(info, quality)
    canvas = canvas_size(plan, info, scale)
    layout = Layout(plan, info, canvas)
    timeline = P.Timeline(plan, info.duration, fps)
    total = timeline.duration
    if total < 0.2:
        raise RenderError("The video would be empty. Try keeping a longer part of the clip.")
    if has_audio is None:
        has_audio = info.has_audio
    warnings = [f"The freeze at {t:.1f}s was in a cut-out part, so I moved it." for t in timeline.moved]

    inputs = ["-i", str(src)]
    n_inputs = 1
    graph = []

    # Zooms look sharper when the picture is worked on a bit bigger than it's shown,
    # but never bigger than the pixels the clip really has.
    cw0, ch0 = layout.content
    sw, sh = src_size or (info.width, info.height)
    if layout.crop_aspect:
        region = (min(sw, sh * layout.crop_aspect), min(sh, sw / layout.crop_aspect))
    else:
        region = (sw, sh)
    headroom = 1.5 if (plan.get("zoom") or plan.get("shake")) else 1.0
    factor = min(headroom, max(1.0, min(region[0] / cw0, region[1] / ch0)))
    ww, wh = _even(cw0 * factor), _even(ch0 * factor)

    # 1. steady frame rate, cut to shape, work size
    pre = ["setpts=PTS-STARTPTS", f"fps={fps}"]
    if layout.crop_aspect:
        a = layout.crop_aspect
        fx = plan.get("focus_x", 0.5)
        pre.append(f"crop=w='min(iw,ih*{_f(a)})':h='min(ih,iw/{_f(a)})':x='(iw-ow)*{_f(fx)}':y='(ih-oh)/2'")
    pre += [f"scale={ww}:{wh}:flags=bicubic", "setsar=1", "format=yuv420p"]

    # 2. segments
    segs = []
    min_len = 1.5 / fps
    for seg in timeline.segments:
        if seg["kind"] == "clip":
            a, b = _snap(seg["src_start"], fps), _snap(seg["src_end"], fps)
            if b - a >= min_len:
                segs.append(("clip", a, b, seg["speed"]))
        else:
            at = _snap(min(seg["src_at"], max(0.0, info.duration - 2.0 / fps)), fps)
            segs.append(("freeze", at, seg["duration"], seg.get("bw", False)))
    if not segs:
        raise RenderError("The video would be empty. Try keeping a longer part of the clip.")
    n = len(segs)
    n_audio = sum(1 for s in segs if s[0] == "clip")
    graph.append(f"[0:v]{','.join(pre)},split={n}" + "".join(f"[s{i}]" for i in range(n)))
    if has_audio and n_audio:
        graph.append("[0:a]asetpts=PTS-STARTPTS,aresample=48000,"
                     f"aformat=sample_fmts=fltp:channel_layouts=stereo,asplit={n_audio}"
                     + "".join(f"[x{i}]" for i in range(n_audio)))
    ai = 0
    pairs = []
    for i, s in enumerate(segs):
        if s[0] == "clip":
            _, a, b, speed = s
            vs = f"[s{i}]trim=start={_f(a)}:end={_f(b)},setpts=(PTS-STARTPTS)/{_f(speed)}[v{i}]"
            out_len = (b - a) / speed
            if has_audio:
                chain = [f"atrim=start={_f(a)}:end={_f(b)}", "asetpts=PTS-STARTPTS"] + _atempo_chain(speed)
                aus = f"[x{ai}]{','.join(chain)}[a{i}]"
                ai += 1
            else:
                aus = f"aevalsrc=0:c=stereo:s=48000:d={_f(out_len)}[a{i}]"
        else:
            _, at, length, bw = s
            extra = ",hue=s=0" if bw else ""
            vs = (f"[s{i}]trim=start={_f(at)}:duration={_f(0.9 / fps)},setpts=PTS-STARTPTS,"
                  f"tpad=stop_mode=clone:stop_duration={_f(length)},trim=duration={_f(length)}{extra}[v{i}]")
            aus = f"aevalsrc=0:c=stereo:s=48000:d={_f(length)}[a{i}]"
        graph += [vs, aus]
        pairs.append(f"[v{i}][a{i}]")
    graph.append("".join(pairs) + f"concat=n={n}:v=1:a=1[vc][ac]")

    # 3. effects on the gameplay picture
    fx = [f"fps={fps}"]
    zooms = plan.get("zoom", [])
    shakes = plan.get("shake", [])
    if zooms or shakes:
        z_terms, fx_terms, fy_terms, sx_terms, sy_terms = [], [], [], [], []
        for z in zooms:
            start, end = timeline.place(z["at"], z["duration"])
            w = _window(start, end - start)
            z_terms.append(f"{_f(z['amount'] - 1)}*{w}")
            fx_terms.append(f"{_f(z['x'] - 0.5)}*{w}")
            fy_terms.append(f"{_f(z['y'] - 0.5)}*{w}")
        for sh in shakes:
            start, end = timeline.place(sh["at"], sh["duration"])
            w = _window(start, end - start, ramp=0.05)
            z_terms.append(f"{_f(0.06 * sh['strength'])}*{w}")
            sx_terms.append(f"{_f(0.45)}*{w}*sin(2*PI*13*t)")
            sy_terms.append(f"{_f(0.45)}*{w}*cos(2*PI*17*t)")
        Z = "(1+" + "+".join(z_terms) + ")"
        FX = "clip(0.5" + "".join("+" + t for t in fx_terms + sx_terms) + ",0,1)"
        FY = "clip(0.5" + "".join("+" + t for t in fy_terms + sy_terms) + ",0,1)"
        fx.append(f"scale=w='trunc({ww}*{Z}/2)*2':h='trunc({wh}*{Z}/2)*2':eval=frame:flags=bicubic")
        fx.append(f"crop=w={ww}:h={wh}:x='({ww}*{Z}-{ww})*{FX}':y='({wh}*{Z}-{wh})*{FY}'")
    fx += COLOR_FILTERS.get(plan.get("color", "none"), [])
    flashes = plan.get("flash", [])
    if flashes:
        terms = []
        for fl in flashes:
            t0, _ = timeline.place(fl["at"], 0.4)
            terms.append(f"0.85*exp(-9*(t-{_f(t0)}))*between(t,{_f(t0)},{_f(t0 + 0.6)})")
        fx.append(f"eq=brightness='min(0.85,{'+'.join(terms)})':eval=frame")
    cw, ch = layout.content
    if (ww, wh) != (cw, ch):
        fx.append(f"scale={cw}:{ch}:flags=bicubic")
    fx.append("setsar=1")
    graph.append(f"[vc]{','.join(fx)}[content]")

    # 4. layout
    CW, CH = canvas
    if layout.fit == "blur":
        bw_, bh_ = _even(CW / 4), _even(CH / 4)
        graph.append(
            "[content]split=2[cb][cf];"
            f"[cb]scale={bw_}:{bh_}:force_original_aspect_ratio=increase,crop={bw_}:{bh_},"
            f"boxblur=luma_radius=8:luma_power=2,scale={CW}:{CH},eq=brightness=-0.07:saturation=1.15[bg];"
            "[bg][cf]overlay=x=(W-w)/2:y=(H-h)/2,format=yuv420p[L0]")
    elif layout.fit == "bars":
        graph.append(f"[content]pad={CW}:{CH}:(ow-iw)/2:(oh-ih)/2:black[L0]")
    else:
        graph.append(f"[content]scale={CW}:{CH},setsar=1[L0]")

    # 5. captions and stickers
    last = "L0"
    k = 0
    for kind in ("text", "sticker"):
        for item in plan.get(kind, []):
            key = P.overlay_key(kind, item)
            png = Path(overlay_dir or ".") / f"{key}.png"
            if not png.exists():
                warnings.append(f"Skipped the {'caption' if kind == 'text' else 'sticker'} "
                                f"'{item.get('text') or item.get('emoji')}' (its picture wasn't ready).")
                continue
            start, end = timeline.place(item["at"], item["duration"])
            if end - start < 0.05:
                continue
            cx, cy = layout.center(item["position"])
            pop = TEXT_POP if kind == "text" else STICKER_POP
            inputs += ["-loop", "1", "-framerate", str(fps), "-t", _f(end - start + 0.05), "-i", str(png)]
            idx = n_inputs
            n_inputs += 1
            graph.append(f"[{idx}:v]format=rgba,scale=w='max(2,trunc(iw*{_f(scale)}*{pop}))':h=-1:eval=frame,"
                         f"setpts=PTS+{_f(start)}/TB[ov{k}]")
            graph.append(f"[{last}][ov{k}]overlay=x='max(0,min(W-w,{_f(cx)}-w/2))':"
                         f"y='max(0,min(H-h,{_f(cy)}-h/2))':eof_action=pass:"
                         f"enable='between(t,{_f(start)},{_f(end)})'[L{k + 1}]")
            last = f"L{k + 1}"
            k += 1
    graph.append(f"[{last}]format=yuv420p[vout]")

    # sound: game audio + effects + music
    mix = [f"[ac]volume={_f(float(plan.get('game_volume', 1.0)))}[game]"]
    mix_inputs = ["[game]"]
    for j, snd in enumerate(plan.get("sound", [])):
        try:
            path = sfx.path_for(snd["name"])
        except KeyError:
            warnings.append(f"Skipped the sound '{snd['name']}' (I can't find it any more).")
            continue
        if snd["at"] == "end":
            when = max(0.0, total - min(sfx.length(snd["name"]), 1.5))
        else:
            when, _ = timeline.place(snd["at"], 0.0)
        if when >= total - 0.05:
            continue
        inputs += ["-i", str(path)]
        idx = n_inputs
        n_inputs += 1
        ms = int(round(when * 1000))
        mix.append(f"[{idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                   f"volume={_f(float(snd.get('volume', 1.0)))},adelay=delays={ms}:all=1[fx{j}]")
        mix_inputs.append(f"[fx{j}]")
    music = plan.get("music")
    if music:
        try:
            path = sfx.music_path(music["name"])
            inputs += ["-stream_loop", "-1", "-i", str(path)]
            idx = n_inputs
            n_inputs += 1
            fade = max(0.0, total - 1.5)
            mix.append(f"[{idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
                       f"volume={_f(float(music.get('volume', 0.35)))},atrim=duration={_f(total)},"
                       f"afade=t=out:st={_f(fade)}:d=1.5[music]")
            mix_inputs.append("[music]")
        except KeyError:
            warnings.append(f"Skipped the music '{music['name']}' (I can't find it any more).")
    if len(mix_inputs) > 1:
        mix.append("".join(mix_inputs) + f"amix=inputs={len(mix_inputs)}:duration=first:"
                   "dropout_transition=0:normalize=0,alimiter=limit=0.9:level=false[aout]")
    else:
        mix.append("[game]alimiter=limit=0.9:level=false[aout]")
    graph += mix

    args = inputs + ["-filter_complex", ";".join(graph), "-map", "[vout]", "-map", "[aout]"]
    args += ff.h264_args(quality) + ["-pix_fmt", "yuv420p", "-r", str(fps),
                                     "-c:a", "aac", "-b:a", "192k" if quality == "export" else "128k",
                                     "-ar", "48000", "-ac", "2", "-movflags", "+faststart",
                                     "-t", _f(total + 0.01), str(out_path)]
    details = {"duration": round(total, 3), "fps": fps, "width": CW, "height": CH, "warnings": warnings}
    return args, details


def render(plan, info, src, out_path, quality="preview", overlay_dir=None, on_progress=None,
           cancel=None, src_size=None, has_audio=None):
    """Make the video. Returns details: duration, fps, width, height, warnings."""
    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_name(out_path.stem + ".part.mp4")
    args, details = build(plan, info, src, tmp, quality, overlay_dir, has_audio=has_audio,
                          src_size=src_size)
    try:
        ff.run(args, duration=details["duration"], on_progress=on_progress, cancel=cancel)
        tmp.replace(out_path)
    finally:
        tmp.unlink(missing_ok=True)
    return details
