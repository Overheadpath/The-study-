"""Sound effects.

The built-in sounds are made from math by ffmpeg the first time they're needed, so they're
original (no copyrighted meme sounds). People can add their own sound files to the
"My Sounds" folder and the AI can use them by name.
"""

import hashlib
import math
import re
import threading

from . import config
from . import ffmpeg_tools as ff

_lock = threading.Lock()
PEAK_DB = -4.0


def _chirp(f_end, f_start, k):
    """Phase (in cycles) of a tone that slides from f_start down/up to f_end."""
    return f"({f_end}*t+{f_start - f_end}*(1-exp(-{k}*t))/{k})"


def _env(start, end, attack=40, release=14):
    return f"between(t,{start},{end})*min(1,(t-{start})*{attack})*min(1,({end}-t)*{release})"


def _fail_horn():
    notes = [(0.0, 0.42, 233.08), (0.48, 0.9, 220.0), (0.96, 1.38, 207.65), (1.44, 2.85, 196.0)]
    parts = []
    for i, (s, e, f) in enumerate(notes):
        u = f"(t-{s})"
        vib = f"+0.55*sin(2*PI*5.5*{u})*gte({u},0.35)" if i == 3 else ""
        ph = f"(2*PI*{f}*{u}{vib})"
        tone = f"tanh(2.5*(sin({ph})+0.5*sin(2*{ph})+0.3*sin(3*{ph})))"
        parts.append(f"{tone}*{_env(s, e, 30, 10)}")
    return "0.32*(" + "+".join(parts) + ")"


def _victory():
    notes = [(0.0, 0.1, 523.25), (0.1, 0.2, 659.25), (0.2, 0.3, 783.99)]
    parts = [f"tanh(6*sin(2*PI*{f}*(t-{s})))*{_env(s, e, 200, 60)}" for s, e, f in notes]
    parts.append("tanh(6*sin(2*PI*1046.5*(t-0.3)))*gte(t,0.3)*exp(-2.2*(t-0.3))*min(1,(1.25-t)*20)")
    return "0.2*(" + "+".join(parts) + ")"


def _tick():
    times, t, gap = [], 0.0, 0.5
    while t < 2.45:
        times.append(round(t, 3))
        t += gap
        gap = max(0.07, gap * 0.8)
    clicks = [f"gte(t,{s})*(sin(2*PI*2400*(t-{s}))*exp(-260*(t-{s}))"
              f"+0.5*sin(2*PI*1200*(t-{s}))*exp(-200*(t-{s})))" for s in times]
    return "0.6*(" + "+".join(clicks) + ")"


def _heartbeat():
    beats = [0.0, 0.26, 0.85, 1.11]
    parts = [f"gte(t,{s})*(sin(2*PI*58*(t-{s}))+0.3*sin(2*PI*116*(t-{s})))*exp(-16*(t-{s}))" for s in beats]
    return "0.85*(" + "+".join(parts) + ")"


def _airhorn():
    saw = "+".join(f"2*({f}*t-floor({f}*t+0.5))" for f in (452, 455.5, 459))
    env = "+".join(_env(s, e, 60, 25) for s, e in ((0.0, 0.3), (0.36, 0.52), (0.58, 1.45)))
    return f"0.5*tanh(1.6*({saw})/3*({env}))"


# name: (seconds, expression, extra filters, what it's good for)
BUILTIN = {
    "boom": (1.4, f"0.85*tanh(2.4*(sin(2*PI*{_chirp(42, 137, 9)})*exp(-3*t)*min(1,t*300)"
                  "+0.5*(2*random(0)-1)*exp(-70*t)))", "lowpass=f=900",
             "deep boom - the classic hit for a reveal, the steal, or a fail"),
    "bass_drop": (1.8, f"0.9*tanh(2*sin(2*PI*{_chirp(32, 122, 2.6)})*exp(-1.3*t)*min(1,t*200))",
                  "lowpass=f=400", "long deep bass drop - right after a riser build-up"),
    "hit": (0.4, f"0.8*tanh(2*(sin(2*PI*{_chirp(90, 250, 30)})*exp(-11*t)+0.8*(2*random(0)-1)*exp(-45*t)))",
            "lowpass=f=2500", "short punchy hit - someone gets hit or slapped"),
    "whoosh": (0.8, "st(0,ld(0)+(0.02+0.3*pow(sin(PI*t/0.8),2))*((2*random(1)-1)-ld(0)))"
                    "*pow(sin(PI*t/0.8),1.5)*2.6", "highpass=f=150",
               "fast whoosh - zooms, speed-ups, transitions"),
    "riser": (2.5, "0.8*tanh((0.5*sin(2*PI*(180*t+37.333*t*t*t))"
                   "+1.4*st(0,ld(0)+(0.01+0.4*pow(t/2.5,2))*((2*random(1)-1)-ld(0))))*pow(t/2.5,2)*1.4)",
              "highpass=f=80", "2.5 s rising tension - start it 2.5 s BEFORE the big moment"),
    "tick": (2.6, _tick(), "highpass=f=400", "ticking clock that speeds up - suspense before a steal"),
    "alarm": (1.8, "0.55*tanh(3*sin(2*PI*700*t-150*cos(4*PI*t)))*min(1,t*50)*min(1,(1.8-t)*8)", "",
              "siren alarm - base alarm, getting caught, running away"),
    "ding": (1.4, "0.5*(sin(2*PI*1318.5*t)+0.45*sin(2*PI*2637*t)*exp(-2*t)+0.25*sin(2*PI*3951.1*t)"
                  "*exp(-4*t))*exp(-3.2*t)*min(1,t*400)", "", "bright ding - success, item collected"),
    "cash": (1.0, "0.5*(2*random(0)-1)*exp(-35*t)+gte(t,0.07)*0.45*sin(2*PI*1568*(t-0.07))*exp(-6*(t-0.07))"
                  "+gte(t,0.15)*0.5*(sin(2*PI*2093*(t-0.15))+0.3*sin(2*PI*4186*(t-0.15)))*exp(-4*(t-0.15))",
             "highpass=f=300", "cha-ching - money, W, getting rich"),
    "pop": (0.18, f"0.8*sin(2*PI*{_chirp(260, 900, 45)})*exp(-28*t)*min(1,t*800)", "",
            "little pop - a sticker or caption appearing"),
    "fail_horn": (2.9, _fail_horn(), "lowpass=f=3000", "sad trombone 'wah wah wah' - fails (L)"),
    "victory": (1.3, _victory(), "", "retro victory jingle - W, steal complete"),
    "heartbeat": (1.6, _heartbeat(), "lowpass=f=300", "heartbeat - tense sneaking moments"),
    "glitch": (0.6, "0.35*tanh(8*sin(2*PI*(180+1400*abs(sin(floor(t*22)*12.9898)))*t))*gt(sin(2*PI*9*t),-0.6)",
               "", "digital glitch - laggy or weird moments"),
    "airhorn": (1.5, _airhorn(), "highpass=f=300,lowpass=f=5000", "air horn blasts - hype moments"),
}

_RECIPE_HASH = hashlib.sha1(repr(sorted(BUILTIN.items())).encode()).hexdigest()[:8]


def _builtin_dir():
    path = config.app_data_dir() / f"sounds-{_RECIPE_HASH}"
    path.mkdir(parents=True, exist_ok=True)
    return path


def clean_name(stem):
    return re.sub(r"[^a-z0-9]+", "_", stem.lower()).strip("_") or "sound"


def user_sounds():
    found = {}
    folder = config.my_sounds_dir()
    for p in sorted(folder.iterdir()) if folder.exists() else []:
        if p.is_file() and p.suffix.lower() in config.AUDIO_EXTENSIONS:
            found[clean_name(p.stem)] = p
    return found


def user_music():
    found = {}
    folder = config.my_music_dir()
    for p in sorted(folder.iterdir()) if folder.exists() else []:
        if p.is_file() and p.suffix.lower() in config.AUDIO_EXTENSIONS:
            found[clean_name(p.stem)] = p
    return found


def catalog():
    """Every sound the AI can use: {name: description}. The user's own sounds win on name clashes."""
    sounds = {name: spec[3] for name, spec in BUILTIN.items()}
    for name in user_sounds():
        sounds[name] = "your own sound (from the My Sounds folder)"
    return sounds


def path_for(name):
    """File for a sound, making built-in ones on first use."""
    mine = user_sounds()
    if name in mine:
        return mine[name]
    if name not in BUILTIN:
        raise KeyError(name)
    out = _builtin_dir() / f"{name}.wav"
    with _lock:
        if not out.exists():
            seconds, expr, filters, _ = BUILTIN[name]
            chain = "aformat=sample_fmts=fltp" + (f",{filters}" if filters else "")
            raw = out.with_suffix(".raw.wav")
            ff.run(["-f", "lavfi", "-i", f"aevalsrc='{expr}':s=48000:d={seconds}:c=mono",
                    "-af", chain, "-ac", "2", "-ar", "48000", str(raw)])
            # Every built-in sound peaks at the same level so none is too loud or too quiet.
            gain = PEAK_DB - check_level(raw)
            tmp = out.with_suffix(".tmp.wav")
            ff.run(["-i", str(raw), "-af", f"volume={gain:.2f}dB", "-c:a", "pcm_s16le", str(tmp)])
            raw.unlink(missing_ok=True)
            tmp.replace(out)
    return out


def music_path(name):
    songs = user_music()
    if name not in songs:
        raise KeyError(name)
    return songs[name]


def length(name):
    """Seconds a sound lasts (built-in ones only; others count as 2 s)."""
    return BUILTIN[name][0] if name in BUILTIN and name not in user_sounds() else 2.0


def check_level(path):
    """Peak level in dB of a sound file - used by the tests."""
    log = ff.run(["-i", str(path), "-af", "volumedetect", "-f", "null", "-"], loglevel="info")
    m = re.search(r"max_volume:\s*(-?[\d.]+) dB", log)
    return float(m.group(1)) if m else -math.inf
