"""Shared test helpers: synthetic clips with known moments."""

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from beanie_ai import ffmpeg_tools as ff  # noqa: E402

_cache = {}


def isolated_home():
    """Point Beanie AI's folders at a fresh temp folder."""
    home = tempfile.mkdtemp(prefix="beanie-test-")
    os.environ["BEANIE_AI_HOME"] = home
    return Path(home)


def make_test_clip(folder=None, width=640, height=360, with_audio=True):
    """A 13 s clip laid out like a real recording:

    0.0-1.5   black (loading screen)
    1.5-8.0   moving picture, loud beep at 6.0 (the "steal")
    8.0-10.5  still, bright picture (a menu)
    10.5-13.0 moving picture, loud beep at 11.5
    """
    key = (width, height, with_audio)
    if key in _cache and Path(_cache[key]).exists():
        return Path(_cache[key])
    folder = Path(folder or tempfile.mkdtemp(prefix="beanie-clip-"))
    out = folder / f"clip_{width}x{height}{'' if with_audio else '_silent'}.mp4"
    size = f"{width}x{height}"
    args = [
        "-f", "lavfi", "-i", f"color=c=black:s={size}:r=30:d=1.5",
        "-f", "lavfi", "-i", f"testsrc2=s={size}:r=30:d=6.5",
        "-f", "lavfi", "-i", f"color=c=0xF0F0F0:s={size}:r=30:d=2.5",
        "-f", "lavfi", "-i", f"mandelbrot=s={size}:r=30",
    ]
    graph = "[3:v]trim=duration=2.5,setpts=PTS-STARTPTS[m];[0:v][1:v][2:v][m]concat=n=4:v=1:a=0,format=yuv420p[v]"
    maps = ["-map", "[v]"]
    if with_audio:
        args += [
            "-f", "lavfi", "-i", "anoisesrc=d=13:c=pink:a=0.02:r=48000",
            "-f", "lavfi", "-i",
            "aevalsrc='0.8*sin(2*PI*880*t)*between(t,6,6.3)+0.8*sin(2*PI*660*t)*between(t,11.5,11.8)':d=13:s=48000",
        ]
        graph += ";[4:a][5:a]amix=inputs=2:normalize=0,aformat=channel_layouts=stereo[a]"
        maps += ["-map", "[a]", "-c:a", "aac", "-b:a", "128k"]
    ff.run(args + ["-filter_complex", graph] + maps +
           ["-c:v", "libx264" if "libx264" in ff.encoders() else "mpeg4", "-r", "30", "-t", "13", str(out)])
    _cache[key] = str(out)
    return out


def frame_at(video, t, out_png):
    """Save one frame as a PNG and return its path."""
    ff.run(["-ss", f"{t:.3f}", "-i", str(video), "-frames:v", "1", str(out_png)])
    return Path(out_png)


def mean_color(video, t, x=None, y=None, w=None, h=None):
    """Average (R, G, B) of a frame, or of a box in it."""
    import subprocess

    crop = f"crop={w}:{h}:{x}:{y}," if w else ""
    proc = subprocess.run(
        [ff.ffmpeg_exe(), "-hide_banner", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", str(video),
         "-frames:v", "1", "-vf", f"{crop}scale=1:1:flags=area,format=rgb24", "-f", "rawvideo", "-"],
        capture_output=True,
    )
    data = proc.stdout
    return tuple(data[:3]) if len(data) >= 3 else (0, 0, 0)
