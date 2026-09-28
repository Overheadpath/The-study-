"""Looking at a clip: a small preview copy, timeline pictures, and the moments that matter.

Everything comes from one ffmpeg pass so a laptop only decodes the clip once:
  * proxy.mp4   - 720p, 30 fps copy the app plays and uses for quick previews
  * scene.txt   - big changes on screen
  * luma.txt    - how bright the picture is (menus are bright, loading screens dark)
  * audio.txt   - loudness every 0.1 s (steals, hits and alarms are loud)
  * blackdetect / freezedetect lines in the log - dark screens and parts where nothing moves
"""

import math
import re
from pathlib import Path

from . import ffmpeg_tools as ff

PROXY_SHORT_SIDE = 720
PROXY_FPS = 30
THUMB_COUNT = 16
THUMB_WIDTH = 160


def _even(n):
    return max(2, int(round(n / 2.0)) * 2)


def proxy_size(width, height):
    if width >= height:
        ph = min(PROXY_SHORT_SIDE, _even(height))
        return _even(width * ph / height), ph
    pw = min(PROXY_SHORT_SIDE, _even(width))
    return pw, _even(height * pw / width)


def analyze_clip(src, info, out_dir, on_progress=None, cancel=None):
    """Make the proxy + thumbnails and find moments. Returns the analysis dict."""
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in ("scene.txt", "luma.txt", "audio.txt"):
        (out_dir / name).unlink(missing_ok=True)

    pw, ph = proxy_size(info.width, info.height)
    # The checks are chained (they pass frames through) and end in a real null output:
    # ffmpeg 7.0 can crash when branches end in nullsink inside the graph.
    graph = [
        "[0:v]setpts=PTS-STARTPTS,split=2[pv][av]",
        f"[pv]scale={pw}:{ph}:flags=bicubic,fps={PROXY_FPS},format=yuv420p,setsar=1[proxyv]",
        "[av]scale=192:-2:flags=fast_bilinear,fps=10,format=yuv420p,"
        "blackdetect=d=0.3:pix_th=0.10:pic_th=0.92,freezedetect=n=-48dB:d=1.5,"
        "signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=luma.txt,"
        "select='gt(scene\\,0.22)',metadata=print:file=scene.txt[vcheck]",
    ]
    proxy_maps = ["-map", "[proxyv]"]
    check_maps = ["-map", "[vcheck]"]
    if info.has_audio:
        graph += [
            "[0:a]asetpts=PTS-STARTPTS,aresample=48000,asplit=2[pa][aa]",
            "[aa]asetnsamples=n=4800:p=0,astats=metadata=1:reset=1,"
            "ametadata=print:key=lavfi.astats.Overall.RMS_level:file=audio.txt[acheck]",
        ]
        proxy_maps += ["-map", "[pa]", "-c:a", "aac", "-b:a", "128k", "-ac", "2"]
        check_maps += ["-map", "[acheck]"]
    args = ["-i", str(Path(src).resolve()), "-filter_complex", ";".join(graph)]
    args += proxy_maps + ff.h264_args("draft") + [
        "-g", str(PROXY_FPS), "-pix_fmt", "yuv420p", "-movflags", "+faststart", "proxy.mp4"]
    args += check_maps + ["-f", "null", "-"]
    log = ff.run(args, duration=info.duration, on_progress=on_progress, cancel=cancel,
                 cwd=out_dir, loglevel="info")

    make_thumbnails(out_dir / "proxy.mp4", info.duration, out_dir, cancel=cancel)

    scene = _read_metadata(out_dir / "scene.txt", "lavfi.scene_score")
    luma = _read_metadata(out_dir / "luma.txt", "lavfi.signalstats.YAVG")
    audio = _read_metadata(out_dir / "audio.txt", "lavfi.astats.Overall.RMS_level")
    black = _parse_black(log, info.duration)
    freeze = _parse_freeze(log, info.duration)
    result = find_moments(info.duration, scene, black, freeze, luma, audio)
    result["proxy"] = {"width": pw, "height": ph, "fps": PROXY_FPS}
    result["thumbs"] = {"count": THUMB_COUNT, "width": THUMB_WIDTH,
                        "height": _even(THUMB_WIDTH * ph / pw)}
    return result


def make_thumbnails(proxy, duration, out_dir, cancel=None):
    """A strip of small pictures for the timeline, plus one poster picture."""
    rate = max(THUMB_COUNT / max(duration, 0.1), 0.01)
    ff.run(["-i", str(proxy), "-vf",
            f"fps={rate:.6f},scale={THUMB_WIDTH}:-2,tile={THUMB_COUNT}x1",
            "-frames:v", "1", "-q:v", "4", "thumbs.jpg"], cwd=out_dir, cancel=cancel)
    ff.run(["-ss", f"{min(1.0, duration * 0.3):.3f}", "-i", str(proxy), "-vf", "scale=640:-2",
            "-frames:v", "1", "-q:v", "4", "poster.jpg"], cwd=out_dir, cancel=cancel)


def _read_metadata(path, key):
    """[(time, value)] from an ffmpeg metadata=print file."""
    points = []
    try:
        text = Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return points
    t = None
    for line in text.splitlines():
        if line.startswith("frame:"):
            m = re.search(r"pts_time:(-?[\d.]+)", line)
            t = float(m.group(1)) if m else None
        elif line.startswith(key + "=") and t is not None:
            raw = line.split("=", 1)[1].strip()
            try:
                value = float(raw)
            except ValueError:
                value = float("-inf") if "inf" in raw else None
            if value is not None:
                points.append((t, value))
    return points


def _parse_black(log, duration):
    spans = []
    for m in re.finditer(r"black_start:\s*(-?[\d.]+)\s+black_end:\s*(-?[\d.]+)", log):
        spans.append((max(0.0, float(m.group(1))), min(duration, float(m.group(2)))))
    return spans


def _parse_freeze(log, duration):
    spans = []
    start = None
    for line in log.splitlines():
        m = re.search(r"freeze_start:\s*(-?[\d.]+)", line)
        if m:
            start = max(0.0, float(m.group(1)))
            continue
        m = re.search(r"freeze_end:\s*(-?[\d.]+)", line)
        if m and start is not None:
            spans.append((start, min(duration, float(m.group(1)))))
            start = None
    if start is not None:
        spans.append((start, duration))
    return spans


def _mean(values):
    values = [v for v in values if math.isfinite(v)]
    return sum(values) / len(values) if values else None


def _median(values):
    values = sorted(v for v in values if math.isfinite(v))
    if not values:
        return None
    mid = len(values) // 2
    return values[mid] if len(values) % 2 else (values[mid - 1] + values[mid]) / 2


def _spaced(candidates, spacing, limit):
    """Best-scoring candidates at least `spacing` seconds apart."""
    chosen = []
    for c in sorted(candidates, key=lambda c: -c["score"]):
        if all(abs(c["t"] - o["t"]) >= spacing for o in chosen):
            chosen.append(c)
        if len(chosen) >= limit:
            break
    return sorted(chosen, key=lambda c: c["t"])


def _inside(t, spans, pad=0.0):
    return any(a - pad <= t <= b + pad for a, b in spans)


def find_moments(duration, scene, black, freeze, luma, audio):
    moments = []
    black = [(a, b) for a, b in black if b - a >= 0.3]
    for a, b in black:
        moments.append({"t": round(a, 2), "end": round(b, 2), "kind": "dark",
                        "label": "Dark screen (loading?)"})

    stills = []
    for a, b in freeze:
        if b - a < 1.5 or any(a >= ba - 0.2 and b <= bb + 0.2 for ba, bb in black):
            continue
        brightness = _mean([v for t, v in luma if a <= t <= b])
        label = "Nothing moving"
        if brightness is not None and brightness > 150:
            label = "Still, bright screen (menu or home page?)"
        elif brightness is not None and brightness < 35:
            label = "Still, dark screen (loading?)"
        stills.append((a, b))
        moments.append({"t": round(a, 2), "end": round(b, 2), "kind": "still", "label": label})

    dead = black + stills

    cuts = [{"t": t, "score": s} for t, s in scene if s >= 0.3 and 0.2 < t < duration - 0.2]
    for c in _spaced(cuts, 1.0, 8):
        moments.append({"t": round(c["t"], 2), "kind": "change", "score": round(c["score"], 2),
                        "label": "Big change on screen"})

    loud_candidates = []
    finite = [(t, v) for t, v in audio if math.isfinite(v)]
    median = _median([v for _, v in finite])
    if median is not None:
        for i, (t, v) in enumerate(finite):
            if v < -32 or v < median + 8:
                continue
            window = [w for tt, w in finite if abs(tt - t) <= 0.6]
            if v < max(window):
                continue
            # Report when the sound starts, not its loudest point: edits should hit on the onset.
            onset = t
            for j in range(i - 1, -1, -1):
                tt, w = finite[j]
                if t - tt > 0.8 or w < v - 6:
                    break
                onset = tt
            before = _mean([w for tt, w in finite if onset - 1.0 <= tt < onset - 0.05])
            jump = v - before if before is not None else 0.0
            score = (v - median) + max(0.0, jump)
            loud_candidates.append({"t": onset, "score": score, "db": v, "jump": jump})
    louds = _spaced(loud_candidates, 1.2, 8)
    for c in louds:
        sudden = c["jump"] >= 10
        moments.append({"t": round(c["t"], 2), "kind": "loud", "score": round(c["score"], 1),
                        "label": "Sudden loud sound" if sudden else "Loud sound"})

    moments.sort(key=lambda m: (m["t"], m["kind"]))

    dead_start = 0.0
    for a, b in sorted(dead):
        if a <= dead_start + 0.5:
            dead_start = max(dead_start, b)
    dead_start = round(dead_start, 2) if dead_start > 0.3 else 0.0
    dead_end = None
    for a, b in sorted(dead, key=lambda s: -s[1]):
        if b >= duration - 0.5 and a > dead_start:
            dead_end = round(a, 2)
            break

    highlight = None
    live_louds = [c for c in louds if not _inside(c["t"], dead, 0.2)]
    live_cuts = [c for c in _spaced(cuts, 1.0, 8) if not _inside(c["t"], dead, 0.2)]
    if live_louds:
        highlight = max(live_louds, key=lambda c: c["score"])["t"]
    elif live_cuts:
        highlight = max(live_cuts, key=lambda c: c["score"])["t"]
    return {
        "moments": moments,
        "dead_start": dead_start,
        "dead_end": dead_end,
        "highlight": round(highlight, 2) if highlight is not None else None,
    }


def describe(info, analysis, markers=None, vision=None):
    """A short text about the clip for the AI to read."""
    lines = [
        f"Clip: {info.duration:.1f} s long, {info.width}x{info.height}, "
        f"{info.fps:g} fps, {'with' if info.has_audio else 'no'} sound."
    ]
    if analysis:
        found = analysis.get("moments") or []
        if found:
            lines.append("Things I noticed (times are in the original clip):")
            for m in found[:14]:
                when = f"{m['t']:.1f}-{m['end']:.1f} s" if "end" in m else f"{m['t']:.1f} s"
                lines.append(f"- {when}: {m['label']}")
        if analysis.get("dead_start"):
            lines.append(f"Boring start (loading/menu) ends at {analysis['dead_start']:.1f} s.")
        if analysis.get("dead_end") is not None:
            lines.append(f"Boring ending (menu/nothing moving) starts at {analysis['dead_end']:.1f} s.")
        if analysis.get("highlight") is not None:
            lines.append(f"My best guess for the main moment: {analysis['highlight']:.1f} s.")
    if markers:
        lines.append("Moments the user marked:")
        for mk in markers:
            lines.append(f"- \"{mk['label']}\" at {mk['t']:.1f} s")
    if vision:
        lines.append("What I saw when I watched the clip:")
        for v in vision[:24]:
            lines.append(f"- {v['t']:.1f} s: {v['what']}")
    return "\n".join(lines)
