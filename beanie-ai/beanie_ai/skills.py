"""Beanie edit skills: ready-made edit recipes for steal clips.

Each skill turns one moment (the steal, the fail...) into a list of plan actions.
The AI picks a skill and a moment, then tweaks the result. The same recipes back
the quick buttons in the app, so they work even without the AI.
"""

import random

from . import plan as P

W_CAPTIONS = ["EZ STEAL 😈", "TOO EASY 🔥", "THEY DIDN'T SEE IT 👀", "W STEAL 🏆", "SECURED 💰"]
L_CAPTIONS = ["bro thought 💀", "NOT THE LASERS 💀", "it was all going so well...", "L STEAL 💀",
              "caught in 4K 📸"]
SUSPENSE_CAPTIONS = ["wait for it... 👀", "he has no idea... 👀", "3... 2... 1..."]
HYPE_CAPTIONS = ["LET'S GOOO 🔥", "INSANE STEAL 🤯", "NO WAY 😱"]

SKILLS = {
    "steal_w": {
        "title": "W steal edit",
        "about": "A winning steal: trims to the action, slow-mo + zoom + flash + boom on the grab, "
                 "hype caption at the start and a victory sound at the end.",
    },
    "fail_l": {
        "title": "L fail edit 💀",
        "about": "A fail (base locked, got hit, got caught): ends right after the fail with a black & white "
                 "freeze, zoom, big 💀, boom and a funny caption.",
    },
    "suspense": {
        "title": "Suspense build-up",
        "about": "Builds tension before the moment: ticking clock, slow push-in zoom and slow-mo, "
                 "then flash + bass drop + shake on the moment.",
    },
    "hype": {
        "title": "Hype edit",
        "about": "Fast and loud: bright colors, quick zooms on the loud moments, air horn and shake on the "
                 "main moment.",
    },
    "clean": {
        "title": "Clean vertical",
        "about": "Just the good part in 9:16 with a blurred background: cuts the boring start and end, no effects.",
    },
    "cut_boring": {
        "title": "Cut the boring parts",
        "about": "Removes loading screens, menus and parts where nothing moves.",
    },
    "slowmo": {
        "title": "Slow-mo moment",
        "about": "Slows down 1.5 s around the moment with a whoosh.",
    },
    "freeze_skull": {
        "title": "Freeze + 💀",
        "about": "Freezes the moment in black & white with a big 💀 and a boom (doesn't trim).",
    },
}


def moment(action, plan, ctx):
    """The moment a skill is about: the time asked for, else the last marker, else the analysis guess."""
    duration = ctx["duration"]
    raw = action.get("at")
    t = P.parse_time(raw, ctx) if raw is not None else None
    if t == "start":
        t = 0.0
    elif t == "end":
        t = duration
    if t is None:
        markers = ctx.get("markers") or []
        if markers:
            t = float(markers[-1]["t"])
        elif ctx.get("highlight") is not None:
            t = float(ctx["highlight"])
        else:
            t = duration / 2
    return round(max(0.0, min(duration, t)), 3)


def _live_range(ctx):
    """The part of the clip that isn't loading screens or menus."""
    start = float(ctx.get("dead_start") or 0.0)
    end = ctx.get("dead_end")
    end = float(end) if end is not None else ctx["duration"]
    if end - start < 1.0:
        return 0.0, ctx["duration"]
    return start, end


def _keep_around(m, before, after, ctx):
    lo, hi = _live_range(ctx)
    start = max(lo, m - before)
    end = min(hi, m + after)
    if end - start < 1.0:
        start, end = max(0.0, m - before), min(ctx["duration"], m + after)
    return {"do": "keep", "start": round(start, 3), "end": round(end, 3)}


def _pick(options, rng):
    return rng.choice(options)


def expand(action, plan, ctx, rng=None):
    """Actions for an apply_skill action. Returns (actions, label).

    The full-edit skills (W, L, suspense, hype) start from a clean plan so switching
    from one to another doesn't pile effects up; the smaller ones add to what's there.
    """
    rng = rng or random
    name = str(action.get("skill", "")).strip().lower()
    name = {"w": "steal_w", "win": "steal_w", "steal": "steal_w", "l": "fail_l", "fail": "fail_l",
            "freeze": "freeze_skull", "skull": "freeze_skull", "boring": "cut_boring"}.get(name, name)
    if name not in SKILLS:
        raise ValueError(f"I don't have a skill called '{action.get('skill')}'. I have: {', '.join(SKILLS)}.")
    m = moment(action, plan, ctx)
    duration = ctx["duration"]
    acts = []

    if name == "steal_w":
        acts.append({"do": "clear"})
        keep = _keep_around(m, 4.0, 3.0, ctx)
        acts += [keep,
                 {"do": "speed", "start": max(keep["start"], m - 0.6), "end": min(keep["end"], m + 0.4),
                  "factor": 0.5},
                 {"do": "zoom", "at": m, "duration": 1.4, "amount": 1.35},
                 {"do": "flash", "at": m},
                 {"do": "sound", "name": "whoosh", "at": max(keep["start"], m - 0.6)},
                 {"do": "sound", "name": "boom", "at": m},
                 {"do": "text", "text": _pick(W_CAPTIONS, rng), "at": "start", "duration": 2.5, "position": "top"},
                 {"do": "sticker", "emoji": _pick(["🔥", "😈", "🏆"], rng), "at": "end", "duration": 1.6,
                  "position": "middle", "size": "big"},
                 {"do": "sound", "name": "victory", "at": "end"},
                 {"do": "color", "style": "vibrant"}]
    elif name == "fail_l":
        acts.append({"do": "clear"})
        keep = _keep_around(m, 4.0, 0.4, ctx)
        acts += [keep,
                 {"do": "freeze", "at": m, "duration": 2.2, "bw": True},
                 {"do": "zoom", "at": m, "duration": 2.2, "amount": 1.5},
                 {"do": "sticker", "emoji": "💀", "at": m, "duration": 2.2, "position": "middle", "size": "big"},
                 {"do": "sound", "name": "boom", "at": m},
                 {"do": "text", "text": _pick(L_CAPTIONS, rng), "at": m, "duration": 2.2, "position": "top"}]
    elif name == "suspense":
        acts.append({"do": "clear"})
        keep = _keep_around(m, 6.0, 3.0, ctx)
        start = keep["start"]
        acts += [keep,
                 {"do": "sound", "name": "tick", "at": max(start, m - 2.6)},
                 {"do": "speed", "start": max(start, m - 1.2), "end": m, "factor": 0.5},
                 {"do": "zoom", "at": max(start, m - 1.2), "duration": 2.4, "amount": 1.2},
                 {"do": "text", "text": _pick(SUSPENSE_CAPTIONS, rng), "at": "start", "duration": 2.5,
                  "position": "top"},
                 {"do": "flash", "at": m},
                 {"do": "shake", "at": m, "duration": 0.5},
                 {"do": "sound", "name": "bass_drop", "at": m}]
    elif name == "hype":
        louds = [mm["t"] for mm in ctx.get("moments") or [] if mm.get("kind") == "loud" and abs(mm["t"] - m) > 1.0]
        acts += [{"do": "clear"}, _keep_around(m, 6.0, 4.0, ctx), {"do": "color", "style": "vibrant"},
                 {"do": "text", "text": _pick(HYPE_CAPTIONS, rng), "at": "start", "duration": 2.0, "position": "top"},
                 {"do": "zoom", "at": m, "duration": 1.0, "amount": 1.4},
                 {"do": "shake", "at": m, "duration": 0.6},
                 {"do": "sound", "name": "airhorn", "at": m},
                 {"do": "sticker", "emoji": "🔥", "at": "end", "duration": 1.4, "position": "middle"}]
        keep = acts[1]
        for t in louds[:3]:
            if keep["start"] <= t <= keep["end"]:
                acts += [{"do": "zoom", "at": t, "duration": 0.5, "amount": 1.25},
                         {"do": "sound", "name": "whoosh", "at": max(keep["start"], t - 0.3)}]
    elif name == "clean":
        lo, hi = _live_range(ctx)
        acts += [{"do": "delete", "what": "all"}, {"do": "format", "format": "vertical", "fit": "blur"},
                 {"do": "keep", "start": lo, "end": hi}]
    elif name == "cut_boring":
        lo, hi = _live_range(ctx)
        acts.append({"do": "keep", "start": lo, "end": hi})
        for mm in ctx.get("moments") or []:
            if mm.get("kind") in ("dark", "still") and "end" in mm and mm["end"] - mm["t"] >= 1.5:
                if mm["t"] > lo + 0.1 and mm["end"] < hi - 0.1:
                    acts.append({"do": "remove", "start": mm["t"], "end": mm["end"]})
    elif name == "slowmo":
        acts += [{"do": "speed", "start": max(0.0, m - 0.75), "end": min(duration, m + 0.75), "factor": 0.4},
                 {"do": "sound", "name": "whoosh", "at": max(0.0, m - 0.75)}]
    elif name == "freeze_skull":
        acts += [{"do": "freeze", "at": m, "duration": 2.0, "bw": True},
                 {"do": "zoom", "at": m, "duration": 2.0, "amount": 1.4},
                 {"do": "sticker", "emoji": "💀", "at": m, "duration": 2.0, "position": "middle", "size": "big"},
                 {"do": "sound", "name": "boom", "at": m}]

    # Drop sounds this PC doesn't have (a user sound can't replace a built-in by accident).
    sounds = set(ctx.get("sounds") or [])
    acts = [a for a in acts if a.get("do") != "sound" or a.get("name") in sounds]
    return acts, f"{SKILLS[name]['title']} at {m:.1f}s"


def playbook_text():
    """The skill list for the AI's instructions."""
    return "\n".join(f"- {name}: {s['title']} - {s['about']}" for name, s in SKILLS.items())
