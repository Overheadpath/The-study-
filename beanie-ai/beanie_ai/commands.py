"""Instant commands: clear edit requests understood without the AI.

"cut out 5 to 7", "add a skull at the end", "slow mo at 6", "boom at 6"...
parse() turns a message into plan actions. It's careful: if any part of the
message isn't understood, the message goes to the AI instead (with this parse as a hint).
When the AI isn't set up yet, whatever was understood is used.
"""

import re

from . import sfx

T = r"(\d+:\d{1,2}(?:\.\d+)?|\d+(?:\.\d+)?)\s*(?:s\b|secs?\b|seconds?\b)?"
SPECIAL_TIMES = {"the start": "start", "the beginning": "start", "start": "start", "beginning": "start",
                 "the end": "end", "end": "end", "the ending": "end"}
HERE_WORDS = ("right here", "here", "right now", "this moment", "this part", "this spot")
MOMENT_WORDS = r"\bthe (?:steal|grab|moment|best part|highlight|main moment|fail|hit)\b"

# Whole emoji, including skin tones, flags and joined emoji like 🏃‍♂️.
EMOJI_RE = re.compile(
    "(?:[\U0001F1E6-\U0001F1FF]{2}"
    "|[\U0001F300-\U0001FAFF☀-➿⭐⭕‼⁉❗❓❤]"
    "(?:️|[\U0001F3FB-\U0001F3FF]|‍[\U0001F300-\U0001FAFF☀-➿♀♂]️?)*)"
)

EMOJI_WORDS = {
    "skull": "💀", "skulls": "💀", "fire": "🔥", "flame": "🔥", "laughing": "😂", "laughing face": "😂",
    "crying": "😭", "sob": "😭", "money bag": "💰", "money": "💰", "eyes": "👀", "moai": "🗿",
    "stone face": "🗿", "clown": "🤡", "goat": "🐐", "sunglasses": "😎", "cool face": "😎", "devil": "😈",
    "trophy": "🏆", "crown": "👑", "100": "💯", "shocked": "😱", "scream": "😱", "mind blown": "🤯",
    "exploding head": "🤯", "thumbs up": "👍", "nerd": "🤓", "raised eyebrow": "🤨", "sus": "🤨",
    "brain": "🧠", "ghost": "👻", "rocket": "🚀", "star": "⭐", "heart": "❤️", "angry": "😡",
    "zzz": "💤", "question mark": "❓", "warning": "⚠️", "check mark": "✅", "cap": "🧢", "salute": "🫡",
    "pleading": "🥺", "party": "🥳", "cold face": "🥶", "w": "🏆",
}
EMOJI_CUE = r"\b(?:add|put|stick|slap|throw|place|drop|show|pop|emoji|sticker)\b"

SOUND_WORDS = {
    "boom": ["vine boom", "boom", "bam"], "bass_drop": ["bass drop"], "hit": ["hit sound", "punch sound",
    "slap sound", "punch", "slap"], "whoosh": ["whoosh", "swoosh", "woosh", "swish"],
    "riser": ["riser", "build up sound", "buildup sound"], "tick": ["ticking", "tick", "clock"],
    "alarm": ["alarm", "siren"], "ding": ["ding", "bell"],
    "cash": ["cha ching", "cha-ching", "ka ching", "ka-ching", "cash register", "cash sound", "cash"],
    "pop": ["pop sound", "pop"], "fail_horn": ["sad trombone", "fail horn", "wah wah", "trombone", "fail sound"],
    "victory": ["victory", "win sound", "tada", "ta-da", "ta da"], "heartbeat": ["heartbeat", "heart beat"],
    "glitch": ["glitch"], "airhorn": ["air horn", "airhorn", "mlg horn"],
}
SOUND_CUE = r"\b(?:sound|sfx|noise|play|add|put)\b"

SKILL_PATTERNS = [
    ("cut_boring", r"\b(?:cut|remove|delete|skip|get rid of)\b.*\b(?:boring|loading|dead|menu|afk)\b"),
    ("fail_l", r"\b(?:fail|l)\s*(?:edit|version|video|tiktok|clip)\b|\b(?:make|turn)\b.*\b(?:fail|an? l)\b"),
    ("steal_w", r"\b(?:w|win|winning|steal|success|tiktok|full)\s*(?:edit|version)\b"
                r"|\b(?:make|turn)\b.*\b(?:a w|an edit|a tiktok)\b|\bedit it\b"),
    ("suspense", r"\b(?:suspense|build[- ]?up|dramatic|tension)\b"),
    ("hype", r"\bhype\b|\bmake it (?:epic|lit|crazy)\b"),
    ("clean", r"\b(?:clean|simple|plain)\b.*\b(?:edit|version|vertical|one)\b|\bno effects\b"),
]

KIND_WORDS = {
    "zoom": "zoom", "zooms": "zoom", "sticker": "sticker", "stickers": "sticker", "emoji": "sticker",
    "emojis": "sticker", "text": "text", "texts": "text", "caption": "text", "captions": "text",
    "title": "text", "words": "text", "sound": "sound", "sounds": "sound", "sfx": "sound",
    "sound effects": "sound", "music": "music", "song": "music", "slowmo": "speed", "speed": "speed",
    "freeze": "freeze", "freezes": "freeze", "flash": "flash", "flashes": "flash", "shake": "shake",
    "shakes": "shake", "color": "color", "colour": "color", "filter": "color", "effects": "effects",
    "everything": "all", "cuts": "remove", "trim": "keep",
}

QUESTION_START = re.compile(r"^(?:what|why|how|who|when|where|which|can you|could you|should|is it|"
                            r"do you|does|are you|will|would|help|explain|tell me|idk|i don't know)\b")
# A separator outside double quotes (so captions can contain commas and "and").
OUTSIDE_QUOTES = r'(?=(?:[^"]*"[^"]*")*[^"]*$)'
SEPARATORS = re.compile(r'\s*(?:[,;]|\band then\b|\bthen\b|\balso\b|\band\b|\bplus\b)\s*' + OUTSIDE_QUOTES)


class Parsed:
    def __init__(self):
        self.actions = []
        self.special = None      # "undo" or "redo"
        self.confident = False   # True if every part of the message was understood

    def __repr__(self):
        return f"Parsed({self.actions}, special={self.special}, confident={self.confident})"


def _normalize(text):
    text = text.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
    text = re.sub(r"\bblack\s*(?:and|&|n)\s*white\b|\bb\s*&\s*w\b|\bb/w\b", "bw", text, flags=re.I)
    text = re.sub(r"\bslow[\s-]*mo(?:tion)?\b", "slowmo", text, flags=re.I)
    text = re.sub(r"\bzoom\s*in\b", "zoom", text, flags=re.I)
    text = re.sub(rf"\bbetween\s+{T}\s+and\s+{T}", r"from \1 to \2", text, flags=re.I)
    return text.strip()


def _time_value(raw, ctx):
    raw = raw.strip().lower()
    if raw in SPECIAL_TIMES:
        return SPECIAL_TIMES[raw]
    m = re.fullmatch(r"(\d+):(\d{1,2}(?:\.\d+)?)", raw)
    if m:
        return int(m.group(1)) * 60 + float(m.group(2))
    try:
        return float(raw)
    except ValueError:
        return None


def _marker_time(clause, ctx):
    for mk in ctx.get("markers") or []:
        label = str(mk.get("label", "")).lower().strip()
        if label and re.search(r"\b" + re.escape(label) + r"\b", clause):
            return float(mk["t"])
    if re.search(MOMENT_WORDS, clause):
        markers = ctx.get("markers") or []
        if markers:
            return float(markers[-1]["t"])
        if ctx.get("highlight") is not None:
            return float(ctx["highlight"])
    return None


def _times(clause, ctx):
    """start / end / at / duration found in one part of a message."""
    found = {}
    m = re.search(rf"(?:from\s+)?{T}\s*(?:-|–|to|until|till|through)\s*(?:{T}|(the end|end))", clause)
    if m:
        found["start"] = _time_value(m.group(1), ctx)
        found["end"] = _time_value(m.group(2) or m.group(3), ctx)
    m = re.search(r"\b(?:at|@|around|on|in)\s+(the (?:very )?(?:start|beginning|end|ending))\b", clause)
    if m:
        found["at"] = SPECIAL_TIMES.get(m.group(1).replace("very ", ""))
    elif re.search(r"\bto the end\b|\bat the finish\b", clause) and "start" not in found:
        found["at"] = "end"
    m = re.search(rf"\b(?:at|@|around|on)\s+{T}", clause)
    if m and "at" not in found:
        found["at"] = _time_value(m.group(1), ctx)
    if "at" not in found and ctx.get("now") is not None:
        if any(re.search(rf"\b{w}\b", clause) for w in HERE_WORDS):
            found["at"] = float(ctx["now"])
    if "at" not in found:
        marker = _marker_time(clause, ctx)
        if marker is not None:
            found["at"] = marker
        elif re.search(MOMENT_WORDS, clause):
            found["unknown_moment"] = True
    m = re.search(rf"\bfor\s+{T}", clause)
    if m:
        found["duration"] = _time_value(m.group(1), ctx)
    return {k: v for k, v in found.items() if v is not None}


def _factor(clause, default):
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:x|times)\b", clause)
    if m:
        return float(m.group(1))
    for word, value in (("quarter speed", 0.25), ("half speed", 0.5), ("double speed", 2.0),
                        ("super slow", 0.25), ("really slow", 0.3), ("very slow", 0.3)):
        if word in clause:
            return value
    return default


def _position(clause):
    for word, pos in (("top", "top"), ("bottom", "bottom"), ("middle", "middle"), ("center", "middle"),
                      ("centre", "middle")):
        if re.search(rf"\b{word}\b", clause):
            return pos
    return None


def _size(clause):
    for word, size in (("huge", "big"), ("giant", "big"), ("big", "big"), ("large", "big"), ("small", "small"),
                       ("tiny", "small"), ("little", "small"), ("medium", "medium")):
        if re.search(rf"\b{word}\b", clause):
            return size
    return None


def _sound_names(clause, ctx):
    available = set(ctx.get("sounds") or sfx.catalog())
    names = []
    rest = clause
    for name in sorted((n for n in available if n not in sfx.BUILTIN), key=len, reverse=True):
        spoken = name.replace("_", " ")
        if re.search(rf"\b{re.escape(spoken)}\b", rest):
            names.append(name)
            rest = re.sub(rf"\b{re.escape(spoken)}\b", " ", rest)
    for name, words in SOUND_WORDS.items():
        for w in words:
            if re.search(rf"\b{re.escape(w)}\b", rest):
                if name in available and name not in names:
                    names.append(name)
                rest = re.sub(rf"\b{re.escape(w)}\b", " ", rest)
                break
    return names


def _emojis(clause, need_cue=True):
    """Emoji in a clause: real emoji always; emoji names ("skull") only with a cue like "add"."""
    found = EMOJI_RE.findall(clause)
    lowered = clause.lower()
    if not need_cue or re.search(EMOJI_CUE, lowered):
        for word, emoji in sorted(EMOJI_WORDS.items(), key=lambda kv: -len(kv[0])):
            if word == "w":
                continue
            if re.search(rf"\b{re.escape(word)}\b", lowered):
                found.append(emoji)
                lowered = re.sub(rf"\b{re.escape(word)}\b", " ", lowered)
    return found


def _with_look(act, clause, times):
    if times.get("duration"):
        act["duration"] = times["duration"]
    pos = _position(clause)
    if pos:
        act["position"] = pos
    size = _size(clause)
    if size:
        act["size"] = size
    return act


def _parse_clause(raw, ctx, parsed):
    """Actions for one part of a message ([] if it wasn't understood)."""
    quoted = re.findall(r'"([^"]{1,80})"', raw)
    outside = re.sub(r'"[^"]*"', " ", raw)
    clause = re.sub(r"\s+", " ", outside.lower()).strip(" .!")
    clause = re.sub(r"^(?:please|pls|plz|ok|okay|yo|bro|now|and|also|then)\s+", "", clause)
    if not clause and not quoted:
        return []
    times = _times(clause, ctx)

    if re.fullmatch(r"(?:undo|go back|take (?:that|it) back|undo (?:that|it)|back)", clause):
        parsed.special = "undo"
        return ["undo"]
    if re.fullmatch(r"(?:redo|redo (?:that|it)|put it back)", clause):
        parsed.special = "redo"
        return ["redo"]
    if re.search(r"\b(?:start over|reset|clear (?:everything|all|it)|remove everything|delete everything)\b", clause):
        return [{"do": "clear"}]

    for skill, pattern in SKILL_PATTERNS:
        if re.search(pattern, clause):
            act = {"do": "apply_skill", "skill": skill}
            if "at" in times:
                act["at"] = times["at"]
            elif times.get("unknown_moment") and skill not in ("cut_boring", "clean"):
                act["at"] = "highlight"
            return [act]

    # "cut the first 3 seconds" / "cut the last 2 seconds"
    m = re.search(rf"\b(?:cut|trim|remove|skip|delete)\s+(?:off\s+)?the first\s+{T}", clause)
    if m:
        return [{"do": "keep", "start": _time_value(m.group(1), ctx), "end": "end"}]
    m = re.search(rf"\b(?:cut|trim|remove|skip|delete)\s+(?:off\s+)?the last\s+{T}", clause)
    if m:
        last = _time_value(m.group(1), ctx)
        return [{"do": "keep", "start": "start", "end": max(0.0, ctx.get("duration", 0) - last)}]

    # removing things: "remove the zoom", "no music", "delete the boom"
    delete = re.match(r"^(?:remove|delete|get rid of|take off|take out|lose|no more|no)\s+"
                      r"(?:the\s+|all\s+(?:the\s+)?|that\s+|those\s+)?(.+)$", clause)
    if delete and "start" not in times:
        target = delete.group(1).strip()
        sounds = _sound_names(target, ctx)
        emojis = _emojis(target, need_cue=False)
        kind = None
        for word, k in sorted(KIND_WORDS.items(), key=lambda kv: -len(kv[0])):
            if re.search(rf"\b{re.escape(word)}\b", target):
                kind = k
                break
        if kind == "music":
            return [{"do": "music", "name": "none"}]
        if kind in ("all", "effects"):
            return [{"do": "delete", "what": kind}]
        if kind == "color":
            return [{"do": "color", "style": "none"}]
        if sounds and kind in (None, "sound"):
            return [{"do": "delete", "what": "sound", "name": s} for s in sounds]
        if emojis and kind in (None, "sticker"):
            return [{"do": "delete", "what": "sticker", "name": e} for e in emojis]
        if quoted and kind in (None, "text"):
            return [{"do": "delete", "what": "text", "name": q} for q in quoted]
        if kind:
            act = {"do": "delete", "what": kind}
            if isinstance(times.get("at"), float):
                act["at"] = times["at"]
            return [act]

    # ranges: "cut out 5 to 7" removes, "trim 3 to 12" / "keep 3-12" keeps
    has_range = "start" in times and "end" in times
    if has_range and re.search(r"\b(?:cut|remove|delete|skip|chop)\b", clause) \
            and not re.search(r"\b(?:keep|trim|only|use)\b", clause):
        return [{"do": "remove", "start": times["start"], "end": times["end"]}]
    if has_range and re.search(r"\b(?:trim|keep|use|only)\b", clause):
        return [{"do": "keep", "start": times["start"], "end": times["end"]}]
    m = re.search(rf"\b(?:start|begin)\s+(?:it\s+|the video\s+|the clip\s+)?(?:at|from)\s+{T}", clause)
    if m:
        return [{"do": "keep", "start": _time_value(m.group(1), ctx), "end": "end"}]
    m = re.search(rf"\b(?:end|stop|finish)\s+(?:it\s+|the video\s+|the clip\s+)?(?:at|by)\s+{T}", clause)
    if m:
        return [{"do": "keep", "start": "start", "end": _time_value(m.group(1), ctx)}]

    acts = []
    if re.search(r"\b(?:vertical|tiktok|shorts|reels|9:16|portrait|phone)\b", clause):
        fit = "crop" if re.search(r"\b(?:crop|fill|zoomed)\b", clause) else (
            "bars" if re.search(r"\bbars?\b|\bletterbox", clause) else "blur")
        acts.append({"do": "format", "format": "vertical", "fit": fit})
    elif re.search(r"\bsquare\b|\b1:1\b", clause):
        acts.append({"do": "format", "format": "square"})
    elif re.search(r"\b(?:landscape|original (?:size|shape)|widescreen|16:9|youtube)\b", clause):
        acts.append({"do": "format", "format": "original"})
    elif re.search(r"\bblack bars\b|\bletterbox", clause):
        acts.append({"do": "format", "fit": "bars"})
    elif re.search(r"\bblur(?:red)? background\b", clause):
        acts.append({"do": "format", "fit": "blur"})
    elif re.fullmatch(r"(?:make it )?crop(?: it)?(?: to fill)?", clause):
        acts.append({"do": "format", "fit": "crop"})

    if re.search(r"\bslowmo\b|\bslow (?:it )?down\b", clause):
        factor = min(0.9, _factor(clause, 0.5))
        if has_range:
            acts.append({"do": "speed", "start": times["start"], "end": times["end"], "factor": factor})
        elif isinstance(times.get("at"), float):
            half = (times.get("duration") or 1.2) / 2
            acts.append({"do": "speed", "start": max(0.0, times["at"] - half), "end": times["at"] + half,
                         "factor": factor})
        elif times.get("unknown_moment"):
            return []
        else:
            acts.append({"do": "apply_skill", "skill": "slowmo"})
    elif re.search(r"\bspeed (?:it )?up\b|\bfast[- ]?forward\b|\bfaster\b", clause):
        if not has_range:
            return []
        acts.append({"do": "speed", "start": times["start"], "end": times["end"],
                     "factor": max(1.1, _factor(clause, 2.0))})

    needs_time = times.get("unknown_moment") or "at" not in times
    if re.search(r"\bfreeze\b", clause):
        if times.get("unknown_moment"):
            return []
        act = {"do": "freeze", "at": times.get("at", "end"), "duration": times.get("duration", 1.5)}
        if re.search(r"\bbw\b|\bgr[ae]y\b", clause):
            act["bw"] = True
        acts.append(act)
    elif re.search(r"\bbw\b", clause):
        acts.append({"do": "color", "style": "bw"})

    if re.search(r"\bzoom\b", clause):
        if needs_time:
            return []
        act = {"do": "zoom", "at": times["at"], "duration": times.get("duration", 1.2)}
        amount = _factor(clause, None)
        if amount:
            act["amount"] = amount
        for word, x in (("left", 0.2), ("right", 0.8)):
            if re.search(rf"\b{word}\b", clause):
                act["x"] = x
        for word, y in (("top", 0.25), ("bottom", 0.75)):
            if re.search(rf"\b{word}\b", clause):
                act["y"] = y
        acts.append(act)
    if re.search(r"\bshake\b", clause):
        if needs_time:
            return []
        acts.append({"do": "shake", "at": times["at"], "duration": times.get("duration", 0.5)})
    if re.search(r"\bflash\b", clause):
        if needs_time:
            return []
        acts.append({"do": "flash", "at": times["at"]})

    for style, pattern in (("vibrant", r"\b(?:vibrant|colou?rful|saturated|brighter colou?rs?)\b"),
                           ("cinematic", r"\b(?:cinematic|movie look|film look)\b"),
                           ("warm", r"\bwarm(?:er)? (?:colou?rs?|look|filter)\b"),
                           ("cold", r"\b(?:cold|cool) (?:colou?rs?|look|filter)\b"),
                           ("retro", r"\b(?:retro|vintage|old school)\b"),
                           ("none", r"\b(?:normal|no) (?:colou?rs?|filter)\b")):
        if re.search(pattern, clause):
            acts.append({"do": "color", "style": style})
            break

    if re.search(r"\bmute\b", clause) and not re.search(r"\bmusic\b", clause):
        acts.append({"do": "volume", "value": 0})
    m = re.search(r"\b(?:game|video)\s+(?:sound|audio|volume)\s+(?:to\s+|at\s+)?(\d+)\s*%", clause)
    if m:
        acts.append({"do": "volume", "value": int(m.group(1)) / 100})

    if re.search(r"\b(?:stop|turn off)\s+(?:the\s+)?music\b|\bmusic off\b", clause):
        acts.append({"do": "music", "name": "none"})
    else:
        m = re.search(r"\b(?:add|play|use|put)\s+(?:the\s+|my\s+)?(?:song|music)\s+(.+?)(?:\s+(?:at|on)\s+.*)?$",
                      clause)
        if m:
            acts.append({"do": "music", "name": m.group(1).strip()})

    for words in quoted:
        acts.append(_with_look({"do": "text", "text": words, "at": times.get("at", "start")}, clause, times))
    # Emoji names count without "add"/"put" only in short commands with a time: "skull at 5".
    short_with_time = len(clause.split()) <= 4 and "at" in times
    for emoji in _emojis(outside, need_cue=not short_with_time):
        if times.get("unknown_moment"):
            return []
        acts.append(_with_look({"do": "sticker", "emoji": emoji, "at": times.get("at", "end")}, clause, times))

    sounds = _sound_names(clause, ctx)
    if sounds and (re.search(SOUND_CUE, clause) or len(clause.split()) <= 5):
        if "at" not in times:
            return []
        for name in sounds:
            acts.append({"do": "sound", "name": name, "at": times["at"]})
    return acts


def parse(message, ctx):
    """Understand a chat message as edit commands when it clearly is one."""
    parsed = Parsed()
    text = _normalize(message or "")
    if not text or len(text) > 400:
        return parsed
    is_question = "?" in text or QUESTION_START.match(text.lower()) is not None
    parts = [p.strip(" .!") for p in SEPARATORS.split(text)]
    parts = [p for p in parts if p]
    understood = 0
    for part in parts:
        acts = _parse_clause(part, ctx, parsed)
        if acts:
            understood += 1
            parsed.actions += [a for a in acts if isinstance(a, dict)]
    words = len(re.findall(r"\w+", text))
    parsed.confident = understood == len(parts) and understood > 0 and not is_question and words <= 30
    return parsed
