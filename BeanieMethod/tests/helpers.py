"""Shared test helpers: synthetic clips with known moments, and a browser with Beanie Pro loaded."""

import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

EXTENSION = Path(__file__).resolve().parents[1]

_cache = {}


def ffmpeg_exe():
    """ffmpeg from PATH, else the one that comes with the imageio-ffmpeg package."""
    exe = os.environ.get("BEANIE_FFMPEG") or shutil.which("ffmpeg")
    if exe:
        return exe
    import imageio_ffmpeg  # pip install imageio-ffmpeg

    return imageio_ffmpeg.get_ffmpeg_exe()


def run_ffmpeg(args):
    proc = subprocess.run([ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-y", *args],
                          capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr[-2000:])
    return proc


def make_test_clip(codec="vp9", width=640, height=360, folder=None):
    """A 13 s clip laid out like a real recording:

    0.0-1.5   black (loading screen)
    1.5-8.0   moving picture, loud beep at 6.0 (the "steal")
    8.0-10.5  still, bright picture (a menu)
    10.5-13.0 moving picture, loud beep at 11.5

    codec "vp9" (VP9 + Opus, which every Chromium can read) or "h264" (H.264 + AAC, like Windows
    recordings; needs Google Chrome).
    """
    key = (codec, width, height)
    if key in _cache and Path(_cache[key]).exists():
        return Path(_cache[key])
    folder = Path(folder or tempfile.mkdtemp(prefix="beanie-clip-"))
    out = folder / f"Roblox_{codec}_{width}x{height}.mp4"
    size = f"{width}x{height}"
    args = [
        "-f", "lavfi", "-i", f"color=c=black:s={size}:r=30:d=1.5",
        "-f", "lavfi", "-i", f"testsrc2=s={size}:r=30:d=6.5",
        "-f", "lavfi", "-i", f"color=c=0xF0F0F0:s={size}:r=30:d=2.5",
        "-f", "lavfi", "-i", f"mandelbrot=s={size}:r=30",
        "-f", "lavfi", "-i", "anoisesrc=d=13:c=pink:a=0.02:r=48000",
        "-f", "lavfi", "-i",
        "aevalsrc='0.8*sin(2*PI*880*t)*between(t,6,6.3)+0.8*sin(2*PI*660*t)*between(t,11.5,11.8)':d=13:s=48000",
    ]
    graph = ("[3:v]trim=duration=2.5,setpts=PTS-STARTPTS[m];[0:v][1:v][2:v][m]concat=n=4:v=1:a=0,format=yuv420p[v];"
             "[4:a][5:a]amix=inputs=2:normalize=0,aformat=channel_layouts=stereo[a]")
    if codec == "h264":
        enc = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-g", "60", "-c:a", "aac", "-b:a", "128k"]
    else:
        enc = ["-c:v", "libvpx-vp9", "-b:v", "1500k", "-deadline", "realtime", "-cpu-used", "8", "-g", "60",
               "-c:a", "libopus", "-b:a", "96k"]
    run_ffmpeg(args + ["-filter_complex", graph, "-map", "[v]", "-map", "[a]", *enc,
                       "-r", "30", "-t", "13", "-movflags", "+faststart", str(out)])
    _cache[key] = str(out)
    return out


def probe(path):
    """{duration, width, height, video, audio} of a video, read with ffmpeg."""
    proc = subprocess.run([ffmpeg_exe(), "-hide_banner", "-i", str(path)], capture_output=True, text=True)
    log = proc.stderr
    import re

    info = {"video": None, "audio": None, "width": None, "height": None, "duration": None}
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", log)
    if m:
        info["duration"] = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    m = re.search(r"Stream #\S+.*Video: (\w+).*?, (\d{2,5})x(\d{2,5})", log)
    if m:
        info["video"], info["width"], info["height"] = m.group(1), int(m.group(2)), int(m.group(3))
    m = re.search(r"Stream #\S+.*Audio: (\w+)", log)
    if m:
        info["audio"] = m.group(1)
    return info


def mean_color(path, t):
    """Average (R, G, B) of the frame at t."""
    proc = subprocess.run(
        [ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", str(path), "-frames:v", "1",
         "-vf", "scale=1:1:flags=area,format=rgb24", "-f", "rawvideo", "-"], capture_output=True)
    return tuple(proc.stdout[:3]) if len(proc.stdout) >= 3 else (0, 0, 0)


def chromium_path():
    """The browser to test with: BEANIE_CHROMIUM, else Playwright's own."""
    env = os.environ.get("BEANIE_CHROMIUM")
    if env:
        return env
    for p in ("/opt/pw-browsers/chromium-1194/chrome-linux/chrome",):
        if Path(p).exists():
            return p
    return None


def dump(obj):
    return json.dumps(obj, indent=1, ensure_ascii=False)
