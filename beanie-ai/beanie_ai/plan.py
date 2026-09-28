"""The edit plan: every change to a clip, stored as plain data.

The AI, the instant-command parser and the buttons all change the plan through actions
(small dicts like {"do": "zoom", "at": 6.0}). apply_actions checks and fixes every value,
so whatever the AI writes, the plan stays something the renderer can make.

Times the AI and user talk about are clip times: seconds in the original recording.
Timeline turns those into times in the finished video (after cuts, speed changes and freezes).
"""

import copy
import hashlib
import json
import re
import secrets

POSITIONS = ("top", "middle", "bottom")
SIZES = ("small", "medium", "big")
FORMATS = ("vertical", "original", "square")
FITS = ("blur", "crop", "bars")
COLORS = ("none", "vibrant", "cinematic", "bw", "warm", "cold", "retro")
TEXT_COLORS = ("white", "yellow", "red", "green", "blue", "pink", "orange", "purple", "black")
LIST_KINDS = ("remove", "speed", "freeze", "zoom", "shake", "flash", "text", "sticker", "sound")
LIMITS = {"remove": 12, "speed": 8, "freeze": 6, "zoom": 12, "shake": 12, "flash": 12,
          "text": 12, "sticker": 12, "sound": 24}
ACTIONS = ("apply_skill", "keep", "remove", "speed", "freeze", "zoom", "shake", "flash", "text",
           "sticker", "sound", "music", "format", "color", "volume", "delete", "clear")

KIND_ALIASES = {
    "cut": "remove", "cuts": "remove", "removes": "remove",
    "slowmo": "speed", "slow-mo": "speed", "slow_mo": "speed", "speeds": "speed",
    "freezes": "freeze", "zooms": "zoom", "shakes": "shake", "flashes": "flash",
    "texts": "text", "caption": "text", "captions": "text", "words": "text", "title": "text",
    "stickers": "sticker", "emoji": "sticker", "emojis": "sticker",
    "sounds": "sound", "sfx": "sound", "effect": "sound", "songs": "music", "song": "music",
    "trim": "keep", "colour": "color", "filter": "color",
}

POSITION_ALIASES = {"center": "middle", "centre": "middle", "mid": "middle", "up": "top",
                    "down": "bottom", "above": "top", "below": "bottom"}
SIZE_ALIASES = {"large": "big", "huge": "big", "giant": "big", "medium-size": "medium",
                "normal": "medium", "tiny": "small", "little": "small"}


def new_plan():
    return {
        "format": "vertical",   # vertical 9:16, original, or square
        "fit": "blur",          # how a wide video fits a tall frame: blur (nothing cut), crop, or bars
        "focus_x": 0.5,         # crop mode: which part to keep, 0 = left edge, 1 = right edge
        "keep": None,           # {"start", "end"}: the part of the clip to use (None = all)
        "remove": [],           # parts cut out
        "speed": [],            # slow-mo / fast parts
        "freeze": [],           # freeze frames
        "zoom": [],
        "shake": [],
        "flash": [],
        "text": [],             # captions
        "sticker": [],          # emoji stickers
        "sound": [],            # sound effects
        "music": None,          # {"name", "volume"}
        "color": "none",
        "game_volume": 1.0,
    }


def _new_id():
    return secrets.token_hex(3)


def _num(value, default=None):
    if isinstance(value, bool):
        return default
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        m = re.fullmatch(r"\s*(-?\d+(?:\.\d+)?)\s*(?:x|×|%|s|sec|secs|seconds?)?\s*", value)
        if m:
            v = float(m.group(1))
            return v / 100 if value.strip().endswith("%") else v
    return default


def _clamp(v, lo, hi):
    return max(lo, min(hi, v))


def parse_time(value, ctx):
    """A clip time in seconds, or 'start' / 'end'. None if it can't be understood.

    Understands 12, "12.5", "12s", "0:12", "1:02.5", "start", "end", marker names
    ("steal") and "highlight" (the best moment the analysis found).
    """
    duration = ctx.get("duration", 0.0)
    if value is None:
        return None
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return round(_clamp(float(value), 0.0, duration), 3)
    if not isinstance(value, str):
        return None
    text = value.strip().lower()
    if text in ("start", "beginning", "begin", "0", "the start", "the beginning"):
        return "start"
    if text in ("end", "the end", "ending", "last"):
        return "end"
    m = re.fullmatch(r"(\d+):(\d{1,2}(?:\.\d+)?)", text)
    if m:
        return round(_clamp(int(m.group(1)) * 60 + float(m.group(2)), 0.0, duration), 3)
    n = _num(text)
    if n is not None:
        return round(_clamp(n, 0.0, duration), 3)
    wanted = text.replace("the ", "").replace("my ", "").strip()
    for mk in ctx.get("markers") or []:
        label = str(mk.get("label", "")).lower().strip()
        if wanted and label and (wanted == label or wanted in label or label in wanted):
            return round(_clamp(float(mk["t"]), 0.0, duration), 3)
    if wanted in ("highlight", "best", "best moment", "main moment", "moment", "mark", "marker", "steal"):
        markers = ctx.get("markers") or []
        if markers:
            return round(float(markers[-1]["t"]), 3)
        if ctx.get("highlight") is not None:
            return round(float(ctx["highlight"]), 3)
    return None


def _pick(value, options, aliases=None, default=None):
    if isinstance(value, str):
        v = value.strip().lower()
        v = (aliases or {}).get(v, v)
        if v in options:
            return v
    return default


class ActionResult:
    def __init__(self):
        self.done = []       # short descriptions of what changed
        self.warnings = []   # things that were fixed or skipped


def apply_actions(plan, actions, ctx):
    """Apply actions to a copy of plan. Returns (new_plan, ActionResult)."""
    plan = copy.deepcopy(plan) if plan else new_plan()
    result = ActionResult()
    queue = list(actions or [])[:40]
    expanded = 0
    while queue:
        action = queue.pop(0)
        if not isinstance(action, dict):
            continue
        do = str(action.get("do", "")).strip().lower()
        if do == "apply_skill":
            expand = ctx.get("expand_skill")
            if expand and expanded < 4:
                expanded += 1
                try:
                    more, label = expand(action, plan, ctx)
                except ValueError as e:
                    result.warnings.append(str(e))
                    continue
                queue = list(more) + queue
                if label:
                    result.done.append(label)
            continue
        handler = _HANDLERS.get(do)
        if not handler:
            if do:
                result.warnings.append(f"I don't know how to '{do}' yet.")
            continue
        try:
            handler(plan, action, ctx, result)
        except (TypeError, ValueError, KeyError) as e:
            result.warnings.append(f"Skipped a '{do}' step ({e}).")
    return plan, result


def _time_or_warn(action, key, ctx, result, default=None):
    raw = action.get(key, default)
    t = parse_time(raw, ctx)
    if t is None and raw is not None:
        result.warnings.append(f"I couldn't tell what time '{raw}' means.")
    return t


def _add(plan, kind, item, result):
    items = plan[kind]
    if len(items) >= LIMITS[kind]:
        result.warnings.append(f"That's the most {kind} steps one video can have ({LIMITS[kind]}).")
        return False
    item["id"] = _new_id()
    items.append(item)
    return True


def _do_keep(plan, a, ctx, r):
    duration = ctx["duration"]
    start = parse_time(a.get("start", 0), ctx)
    end = parse_time(a.get("end", duration), ctx)
    start = 0.0 if start in (None, "start") else (duration if start == "end" else start)
    end = duration if end in (None, "end") else (0.0 if end == "start" else end)
    if end < start:
        start, end = end, start
    if end - start < 0.3:
        r.warnings.append("That part is too short to make a video from.")
        return
    if start <= 0.01 and end >= duration - 0.01:
        plan["keep"] = None
        r.done.append("Using the whole clip")
    else:
        plan["keep"] = {"start": start, "end": end}
        r.done.append(f"Using {start:.1f}s to {end:.1f}s")


def _range(a, ctx, r):
    duration = ctx["duration"]
    start = parse_time(a.get("start"), ctx)
    end = parse_time(a.get("end"), ctx)
    if start == "start":
        start = 0.0
    if end == "end":
        end = duration
    if start == "end" or end == "start":
        start, end = None, None
    if start is None and end is None:
        at = parse_time(a.get("at"), ctx)
        if isinstance(at, float):
            length = _num(a.get("duration"), 1.0)
            start, end = at, min(duration, at + length)
    if start is None or end is None:
        raise ValueError("it needs a start and an end time")
    if end < start:
        start, end = end, start
    return round(start, 3), round(end, 3)


def _do_remove(plan, a, ctx, r):
    start, end = _range(a, ctx, r)
    if end - start < 0.05:
        r.warnings.append("That part is too short to cut out.")
        return
    merged = [{"start": start, "end": end}]
    for old in plan["remove"]:
        if old["end"] < start or old["start"] > end:
            merged.append(old)
        else:
            merged[0]["start"] = min(merged[0]["start"], old["start"])
            merged[0]["end"] = max(merged[0]["end"], old["end"])
    plan["remove"] = []
    for item in sorted(merged, key=lambda i: i["start"]):
        if not _add(plan, "remove", {"start": item["start"], "end": item["end"]}, r):
            break
    r.done.append(f"Cut out {start:.1f}s to {end:.1f}s")


def _do_speed(plan, a, ctx, r):
    start, end = _range(a, ctx, r)
    factor = _clamp(_num(a.get("factor"), 0.5), 0.25, 4.0)
    if end - start < 0.1:
        r.warnings.append("That part is too short to change the speed of.")
        return
    kept = []
    for old in plan["speed"]:
        if old["end"] <= start or old["start"] >= end:
            kept.append(old)
            continue
        if old["start"] < start:
            kept.append({**old, "end": start, "id": _new_id()})
        if old["end"] > end:
            kept.append({**old, "start": end, "id": _new_id()})
    plan["speed"] = sorted(kept, key=lambda i: i["start"])
    if abs(factor - 1.0) < 0.01:
        r.done.append(f"Normal speed from {start:.1f}s to {end:.1f}s")
        return
    if _add(plan, "speed", {"start": start, "end": end, "factor": round(factor, 3)}, r):
        plan["speed"].sort(key=lambda i: i["start"])
        what = f"Slow-mo {factor:g}x" if factor < 1 else f"Speed up {factor:g}x"
        r.done.append(f"{what} from {start:.1f}s to {end:.1f}s")


def _point(a, ctx, r, allow_special=True):
    t = _time_or_warn(a, "at", ctx, r)
    if t is None:
        raise ValueError("it needs a time")
    if not allow_special and isinstance(t, str):
        t = ctx["duration"] if t == "end" else 0.0
    return t


def _fmt_at(t):
    if isinstance(t, str):
        return {"start": "the start", "end": "the end"}.get(t, t)
    return f"{t:.1f}s"


def _do_freeze(plan, a, ctx, r):
    at = _point(a, ctx, r)
    duration = round(_clamp(_num(a.get("duration"), 1.5), 0.2, 6.0), 2)
    bw = bool(a.get("bw", a.get("black_and_white", False)))
    plan["freeze"] = [f for f in plan["freeze"] if f["at"] != at]
    if _add(plan, "freeze", {"at": at, "duration": duration, "bw": bw}, r):
        r.done.append(f"Freeze at {_fmt_at(at)} for {duration:g}s" + (" (black & white)" if bw else ""))


def _do_zoom(plan, a, ctx, r):
    at = _point(a, ctx, r)
    item = {
        "at": at,
        "duration": round(_clamp(_num(a.get("duration"), 1.0), 0.2, 10.0), 2),
        "amount": round(_clamp(_num(a.get("amount"), 1.4), 1.05, 3.0), 2),
        "x": round(_clamp(_num(a.get("x"), 0.5), 0.0, 1.0), 3),
        "y": round(_clamp(_num(a.get("y"), 0.5), 0.0, 1.0), 3),
    }
    if _add(plan, "zoom", item, r):
        r.done.append(f"Zoom {item['amount']:g}x at {_fmt_at(at)}")


def _do_shake(plan, a, ctx, r):
    at = _point(a, ctx, r)
    item = {"at": at, "duration": round(_clamp(_num(a.get("duration"), 0.5), 0.1, 5.0), 2),
            "strength": round(_clamp(_num(a.get("strength"), 1.0), 0.2, 3.0), 2)}
    if _add(plan, "shake", item, r):
        r.done.append(f"Shake at {_fmt_at(at)}")


def _do_flash(plan, a, ctx, r):
    at = _point(a, ctx, r)
    if _add(plan, "flash", {"at": at}, r):
        r.done.append(f"Flash at {_fmt_at(at)}")


def _clean_text(value, limit):
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit]


def _do_text(plan, a, ctx, r):
    text = _clean_text(a.get("text"), 80)
    if not text:
        raise ValueError("there were no words to show")
    at = _point(a, ctx, r) if a.get("at") is not None else "start"
    item = {
        "text": text,
        "at": at,
        "duration": round(_clamp(_num(a.get("duration"), 2.5), 0.3, 30.0), 2),
        "position": _pick(a.get("position"), POSITIONS, POSITION_ALIASES, "top"),
        "size": _pick(a.get("size"), SIZES, SIZE_ALIASES, "medium"),
        "color": _pick(a.get("color"), TEXT_COLORS, None, "white"),
    }
    if _add(plan, "text", item, r):
        r.done.append(f"Caption \"{text}\" at {_fmt_at(at)}")


def _do_sticker(plan, a, ctx, r):
    emoji = _clean_text(a.get("emoji") or a.get("text"), 16)
    if not emoji:
        raise ValueError("there was no emoji")
    at = _point(a, ctx, r) if a.get("at") is not None else "end"
    item = {
        "emoji": emoji,
        "at": at,
        "duration": round(_clamp(_num(a.get("duration"), 1.5), 0.3, 30.0), 2),
        "position": _pick(a.get("position"), POSITIONS, POSITION_ALIASES, "middle"),
        "size": _pick(a.get("size"), SIZES, SIZE_ALIASES, "big"),
    }
    if _add(plan, "sticker", item, r):
        r.done.append(f"{emoji} sticker at {_fmt_at(at)}")


def _match_name(name, available):
    """Find a sound by a loose name: 'Vine Boom' finds 'vine_boom', 'boom' finds 'boom'."""
    if not name:
        return None
    want = re.sub(r"[^a-z0-9]+", "", str(name).lower())
    if not want:
        return None
    names = list(available or [])
    squashed = {n: re.sub(r"[^a-z0-9]+", "", n.lower()) for n in names}
    for n in names:
        if squashed[n] == want:
            return n
    for n in names:
        if want in squashed[n] or squashed[n] in want:
            return n
    return None


def _do_sound(plan, a, ctx, r):
    available = ctx.get("sounds") or []
    name = _match_name(a.get("name"), available)
    if not name:
        r.warnings.append(f"I don't have a sound called '{a.get('name')}'. "
                          f"I have: {', '.join(sorted(available)[:20])}.")
        return
    at = _point(a, ctx, r)
    item = {"name": name, "at": at, "volume": round(_clamp(_num(a.get("volume"), 1.0), 0.0, 2.0), 2)}
    if _add(plan, "sound", item, r):
        r.done.append(f"Sound '{name}' at {_fmt_at(at)}")


def _do_music(plan, a, ctx, r):
    raw = a.get("name")
    if raw is None or str(raw).strip().lower() in ("", "none", "off", "no", "stop"):
        plan["music"] = None
        r.done.append("No music")
        return
    name = _match_name(raw, ctx.get("music") or [])
    if not name:
        songs = ctx.get("music") or []
        r.warnings.append("Put songs in the 'My Music' folder first." if not songs else
                          f"I don't have a song called '{raw}'. I have: {', '.join(songs[:12])}.")
        return
    plan["music"] = {"name": name, "volume": round(_clamp(_num(a.get("volume"), 0.35), 0.0, 1.5), 2)}
    r.done.append(f"Music: {name}")


def _do_format(plan, a, ctx, r):
    fmt = _pick(a.get("format"), FORMATS, {"tiktok": "vertical", "shorts": "vertical", "portrait": "vertical",
                                            "tall": "vertical", "9:16": "vertical", "landscape": "original",
                                            "wide": "original", "16:9": "original", "youtube": "original",
                                            "1:1": "square", "instagram": "square"})
    fit = _pick(a.get("fit"), FITS, {"blurred": "blur", "background": "blur", "zoom": "crop", "fill": "crop",
                                      "cropped": "crop", "black": "bars", "letterbox": "bars", "fit": "bars"})
    if fmt:
        plan["format"] = fmt
    if fit:
        plan["fit"] = fit
    x = _num(a.get("x"))
    if x is not None:
        plan["focus_x"] = round(_clamp(x, 0.0, 1.0), 3)
    if not (fmt or fit or x is not None):
        raise ValueError("it needs a format like vertical, original or square")
    names = {"vertical": "Vertical 9:16", "original": "Original shape", "square": "Square 1:1"}
    fits = {"blur": "blurred background", "crop": "cropped to fill", "bars": "black bars"}
    extra = f" ({fits[plan['fit']]})" if plan["format"] != "original" else ""
    r.done.append(names[plan["format"]] + extra)


def _do_color(plan, a, ctx, r):
    style = _pick(a.get("style") or a.get("name"), COLORS,
                  {"off": "none", "normal": "none", "vivid": "vibrant", "saturated": "vibrant",
                   "black and white": "bw", "black & white": "bw", "grey": "bw", "gray": "bw",
                   "movie": "cinematic", "film": "cinematic", "cool": "cold", "blue": "cold",
                   "orange": "warm", "old": "retro", "vintage": "retro"})
    if not style:
        raise ValueError(f"the color style should be one of: {', '.join(COLORS)}")
    plan["color"] = style
    r.done.append("Normal colors" if style == "none" else f"Color: {style}")


def _do_volume(plan, a, ctx, r):
    value = _num(a.get("value", a.get("volume")))
    if value is None:
        raise ValueError("it needs a volume")
    if value > 2.0:
        value = value / 100.0
    plan["game_volume"] = round(_clamp(value, 0.0, 2.0), 2)
    r.done.append(f"Game sound at {int(plan['game_volume'] * 100)}%")


def _do_delete(plan, a, ctx, r):
    item_id = a.get("id")
    if item_id:
        for kind in LIST_KINDS:
            before = len(plan[kind])
            plan[kind] = [i for i in plan[kind] if i.get("id") != item_id]
            if len(plan[kind]) < before:
                r.done.append(f"Removed a {kind} step")
                return
        for key, value in (("keep", None), ("music", None), ("color", "none"), ("game_volume", 1.0)):
            if item_id == key:
                plan[key] = value
                r.done.append(f"Removed the {key} step")
                return
        if item_id == "format":
            plan["format"], plan["fit"], plan["focus_x"] = "original", "blur", 0.5
            r.done.append("Back to the original shape")
            return
        r.warnings.append("That step was already gone.")
        return
    what = str(a.get("what", "")).strip().lower()
    what = KIND_ALIASES.get(what, what)
    if what in ("all", "everything", "effects"):
        kinds = LIST_KINDS if what != "effects" else ("zoom", "shake", "flash", "freeze", "speed")
        for kind in kinds:
            plan[kind] = []
        if what != "effects":
            plan["keep"], plan["music"], plan["color"] = None, None, "none"
        r.done.append("Removed all effects" if what == "effects" else "Removed everything")
        return
    if what in ("keep", "music", "color"):
        plan[what] = None if what != "color" else "none"
        r.done.append(f"Removed the {what} step")
        return
    if what not in LIST_KINDS:
        raise ValueError(f"I can remove: {', '.join(LIST_KINDS)}")
    items = plan[what]
    if not items:
        r.warnings.append(f"There's no {what} to remove.")
        return
    name = str(a.get("name") or "").strip().lower()
    if name:
        def label(i):
            return str(i.get("name") or i.get("emoji") or i.get("text") or "").lower()
        keep = [i for i in items if name not in label(i) and label(i) not in name]
        if len(keep) == len(items):
            r.warnings.append(f"There's no {what} called '{name}'.")
        else:
            plan[what] = keep
            r.done.append(f"Removed {len(items) - len(keep)} {what} step(s)")
        return
    at = parse_time(a.get("at"), ctx) if a.get("at") is not None else None
    index = a.get("index")
    if isinstance(at, float):
        def dist(i):
            t = i.get("at", i.get("start"))
            return abs(t - at) if isinstance(t, (int, float)) else 1e9
        target = min(items, key=dist)
        plan[what] = [i for i in items if i is not target]
        r.done.append(f"Removed the {what} near {at:.1f}s")
    elif (isinstance(index, int) and not isinstance(index, bool)) or str(index).lower() in ("last", "first"):
        idx = {"last": -1, "first": 0}.get(str(index).lower(), index)
        if -len(items) <= idx < len(items):
            items.pop(idx)
            r.done.append(f"Removed a {what} step")
        else:
            r.warnings.append(f"There isn't a {what} number {idx + 1}.")
    else:
        plan[what] = []
        r.done.append(f"Removed all {what} steps")


def _do_clear(plan, a, ctx, r):
    fresh = new_plan()
    for key in ("format", "fit", "focus_x"):
        fresh[key] = plan.get(key, fresh[key])
    plan.clear()
    plan.update(fresh)
    r.done.append("Started over")


_HANDLERS = {
    "keep": _do_keep, "trim": _do_keep, "remove": _do_remove, "cut": _do_remove,
    "speed": _do_speed, "slowmo": _do_speed, "freeze": _do_freeze, "zoom": _do_zoom,
    "shake": _do_shake, "flash": _do_flash, "text": _do_text, "caption": _do_text,
    "sticker": _do_sticker, "emoji": _do_sticker, "sound": _do_sound, "sfx": _do_sound,
    "music": _do_music, "format": _do_format, "color": _do_color, "volume": _do_volume,
    "delete": _do_delete, "clear": _do_clear,
}


# ---------------------------------------------------------------- the timeline

class Timeline:
    """Maps clip time to finished-video time for a plan.

    segments are, in order: {"kind": "clip", "src_start", "src_end", "speed", "out_start", "out_end"}
    or {"kind": "freeze", "src_at", "duration", "bw", "out_start", "out_end"}.
    """

    def __init__(self, plan, clip_duration, fps=30.0):
        self.plan = plan
        self.clip_duration = clip_duration
        self.frame = 1.0 / max(fps, 1.0)
        self.moved = []  # freeze times that were inside cut-out parts
        self.segments = self._build()
        self.duration = self.segments[-1]["out_end"] if self.segments else 0.0

    def kept_range(self):
        keep = self.plan.get("keep")
        if keep:
            return max(0.0, keep["start"]), min(self.clip_duration, keep["end"])
        return 0.0, self.clip_duration

    def _build(self):
        start, end = self.kept_range()
        intervals = [(start, end)]
        for rm in sorted(self.plan.get("remove", []), key=lambda i: i["start"]):
            nxt = []
            for a, b in intervals:
                if rm["end"] <= a or rm["start"] >= b:
                    nxt.append((a, b))
                    continue
                if rm["start"] > a:
                    nxt.append((a, rm["start"]))
                if rm["end"] < b:
                    nxt.append((rm["end"], b))
            intervals = nxt
        intervals = [(a, b) for a, b in intervals if b - a >= 0.04]
        if not intervals:
            intervals = [(start, end)]

        speeds = self.plan.get("speed", [])
        pieces = []
        for a, b in intervals:
            points = {a, b}
            for s in speeds:
                if s["end"] > a and s["start"] < b:
                    points.add(max(a, s["start"]))
                    points.add(min(b, s["end"]))
            pts = sorted(points)
            for p, q in zip(pts, pts[1:]):
                if q - p < 0.02:
                    continue
                mid = (p + q) / 2
                factor = 1.0
                for s in speeds:
                    if s["start"] <= mid <= s["end"]:
                        factor = s["factor"]
                pieces.append({"kind": "clip", "src_start": p, "src_end": q, "speed": factor})

        last_frame = max(0.0, end - self.frame)
        for fr in sorted(self.plan.get("freeze", []), key=lambda f: self._freeze_time(f["at"], start, end)):
            t = self._freeze_time(fr["at"], start, end)
            freeze = {"kind": "freeze", "src_at": min(t, last_frame), "duration": fr["duration"],
                      "bw": fr.get("bw", False)}
            placed = False
            for i, piece in enumerate(pieces):
                if piece["kind"] != "clip":
                    continue
                if piece["src_start"] - 1e-6 <= t <= piece["src_end"] + 1e-6:
                    if t - piece["src_start"] < 0.02:
                        pieces.insert(i, freeze)
                    elif piece["src_end"] - t < 0.02:
                        pieces.insert(i + 1, freeze)
                    else:
                        left = dict(piece, src_end=t)
                        right = dict(piece, src_start=t)
                        pieces[i:i + 1] = [left, freeze, right]
                    placed = True
                    break
            if not placed:
                later = [i for i, p in enumerate(pieces) if p["kind"] == "clip" and p["src_start"] >= t]
                self.moved.append(t)
                if later:
                    freeze["src_at"] = pieces[later[0]]["src_start"]
                    pieces.insert(later[0], freeze)
                else:
                    clips = [p for p in pieces if p["kind"] == "clip"]
                    freeze["src_at"] = max(0.0, clips[-1]["src_end"] - self.frame) if clips else 0.0
                    pieces.append(freeze)

        out = 0.0
        for p in pieces:
            p["out_start"] = round(out, 4)
            if p["kind"] == "clip":
                out += (p["src_end"] - p["src_start"]) / p["speed"]
            else:
                out += p["duration"]
            p["out_end"] = round(out, 4)
        return pieces

    def _freeze_time(self, at, start, end):
        if at == "start":
            return start
        if at == "end" or at is None:
            return end
        return float(at)

    def to_output(self, t):
        """Finished-video time for clip time t. Cut-out times move to the next kept moment.

        A time that has a freeze lands on the start of the freeze, so a sticker or sound
        "at the freeze" shows during it.
        """
        for seg in self.segments:
            if seg["kind"] == "freeze" and abs(seg["src_at"] - t) < 0.02:
                return seg["out_start"]
            if seg["kind"] == "clip" and seg["src_start"] - 1e-6 <= t <= seg["src_end"] + 1e-6:
                return seg["out_start"] + (t - seg["src_start"]) / seg["speed"]
        for seg in self.segments:
            if seg["kind"] == "clip" and seg["src_start"] >= t:
                return seg["out_start"]
        return self.duration

    def to_source(self, t_out):
        """Clip time shown at finished-video time t_out."""
        for seg in self.segments:
            if seg["out_start"] - 1e-6 <= t_out <= seg["out_end"] + 1e-6:
                if seg["kind"] == "freeze":
                    return seg["src_at"]
                return seg["src_start"] + (t_out - seg["out_start"]) * seg["speed"]
        return self.segments[-1]["src_end"] if self.segments else 0.0

    def is_cut(self, t):
        """True if clip time t isn't in the finished video."""
        return not any(seg["kind"] == "clip" and seg["src_start"] - 1e-6 <= t <= seg["src_end"] + 1e-6
                       for seg in self.segments)

    def place(self, at, length):
        """Finished-video (start, end) for something shown for `length` seconds at clip time `at`."""
        if at == "start":
            start = 0.0
        elif at == "end":
            start = max(0.0, self.duration - length)
        else:
            start = self.to_output(float(at))
        start = max(0.0, min(start, max(0.0, self.duration - 0.05)))
        return start, min(self.duration, start + length)


# ---------------------------------------------------------------- describing plans

def overlay_spec(kind, item):
    """What an overlay picture looks like (captions and stickers are drawn by the browser)."""
    if kind == "text":
        return {"kind": "text", "text": item["text"], "size": item["size"], "color": item["color"]}
    return {"kind": "sticker", "emoji": item["emoji"], "size": item["size"]}


def overlay_key(kind, item):
    spec = json.dumps(overlay_spec(kind, item), sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(spec.encode("utf-8")).hexdigest()[:16]


def overlays(plan):
    """Every caption/sticker picture this plan needs: [{key, spec}]."""
    found = {}
    for kind in ("text", "sticker"):
        for item in plan.get(kind, []):
            found[overlay_key(kind, item)] = overlay_spec(kind, item)
    return [{"key": k, "spec": v} for k, v in found.items()]


def steps(plan):
    """The plan as a list of steps for the screen: [{id, icon, text}]."""
    out = []
    names = {"vertical": "Vertical 9:16", "original": "Original shape", "square": "Square 1:1"}
    fits = {"blur": "blurred background", "crop": "cropped to fill", "bars": "black bars"}
    fmt = names[plan["format"]] + (f", {fits[plan['fit']]}" if plan["format"] != "original" else "")
    out.append({"id": "format", "icon": "📱", "text": fmt})
    if plan.get("keep"):
        k = plan["keep"]
        out.append({"id": "keep", "icon": "✂️", "text": f"Use {k['start']:.1f}s – {k['end']:.1f}s"})
    for i in plan["remove"]:
        out.append({"id": i["id"], "icon": "🗑️", "text": f"Cut out {i['start']:.1f}s – {i['end']:.1f}s"})
    for i in plan["speed"]:
        icon, word = ("🐢", "Slow-mo") if i["factor"] < 1 else ("⏩", "Speed up")
        out.append({"id": i["id"], "icon": icon,
                    "text": f"{word} {i['factor']:g}x, {i['start']:.1f}s – {i['end']:.1f}s"})
    for i in plan["freeze"]:
        out.append({"id": i["id"], "icon": "🧊", "text": f"Freeze at {_fmt_at(i['at'])} for {i['duration']:g}s"
                    + (" (B&W)" if i.get("bw") else "")})
    for i in plan["zoom"]:
        out.append({"id": i["id"], "icon": "🔍", "text": f"Zoom {i['amount']:g}x at {_fmt_at(i['at'])}"})
    for i in plan["shake"]:
        out.append({"id": i["id"], "icon": "📳", "text": f"Shake at {_fmt_at(i['at'])}"})
    for i in plan["flash"]:
        out.append({"id": i["id"], "icon": "⚡", "text": f"Flash at {_fmt_at(i['at'])}"})
    for i in plan["text"]:
        out.append({"id": i["id"], "icon": "💬",
                    "text": f"“{i['text']}” {i['position']}, at {_fmt_at(i['at'])}"})
    for i in plan["sticker"]:
        out.append({"id": i["id"], "icon": i["emoji"], "text": f"Sticker at {_fmt_at(i['at'])}"})
    for i in plan["sound"]:
        out.append({"id": i["id"], "icon": "🔊", "text": f"{i['name']} at {_fmt_at(i['at'])}"})
    if plan.get("music"):
        out.append({"id": "music", "icon": "🎵", "text": f"Music: {plan['music']['name']}"})
    if plan.get("color", "none") != "none":
        out.append({"id": "color", "icon": "🎨", "text": f"Color: {plan['color']}"})
    if plan.get("game_volume", 1.0) != 1.0:
        out.append({"id": "game_volume", "icon": "🔈", "text": f"Game sound {int(plan['game_volume'] * 100)}%"})
    return out


def summary(plan):
    """The plan in a few lines for the AI to read."""
    lines = [f"{s['icon']} {s['text']}" for s in steps(plan)]
    return "\n".join(lines)
