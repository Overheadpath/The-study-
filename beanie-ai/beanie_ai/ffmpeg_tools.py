"""Finding ffmpeg, reading clip info, and running ffmpeg with progress."""

import os
import re
import shutil
import subprocess
import sys
import threading
from dataclasses import asdict, dataclass
from pathlib import Path


class FFmpegError(RuntimeError):
    """ffmpeg failed. The message ends with the last lines ffmpeg printed."""


class Cancelled(RuntimeError):
    pass


_lock = threading.Lock()
_ffmpeg_exe = None
_encoders = None


def ffmpeg_exe():
    """Path of the ffmpeg program: BEANIE_FFMPEG, the one bundled with imageio-ffmpeg, or ffmpeg on PATH."""
    global _ffmpeg_exe
    with _lock:
        if _ffmpeg_exe:
            return _ffmpeg_exe
        candidates = []
        if os.environ.get("BEANIE_FFMPEG"):
            candidates.append(os.environ["BEANIE_FFMPEG"])
        try:
            import imageio_ffmpeg

            candidates.append(imageio_ffmpeg.get_ffmpeg_exe())
        except Exception:
            pass
        on_path = shutil.which("ffmpeg")
        if on_path:
            candidates.append(on_path)
        for c in candidates:
            if c and Path(c).exists():
                _ffmpeg_exe = str(c)
                return _ffmpeg_exe
        raise FFmpegError("ffmpeg was not found. Run the launcher again so it can install it.")


def _popen_kwargs():
    kwargs = {}
    if sys.platform == "win32":
        kwargs["creationflags"] = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    return kwargs


def ffmpeg_version():
    out = subprocess.run(
        [ffmpeg_exe(), "-hide_banner", "-version"],
        capture_output=True, text=True, encoding="utf-8", errors="replace", **_popen_kwargs(),
    ).stdout
    m = re.search(r"ffmpeg version (\S+)", out)
    return m.group(1) if m else "unknown"


def encoders():
    """Names of the video/audio encoders this ffmpeg has."""
    global _encoders
    if _encoders is None:
        out = subprocess.run(
            [ffmpeg_exe(), "-hide_banner", "-encoders"],
            capture_output=True, text=True, encoding="utf-8", errors="replace", **_popen_kwargs(),
        ).stdout
        names = set()
        for line in out.splitlines():
            parts = line.split()
            if len(parts) >= 2 and len(parts[0]) == 6 and parts[0][0] in "VAS":
                names.add(parts[1])
        _encoders = names
    return _encoders


def h264_args(quality):
    """Encoder arguments for an H.264 video. quality is 'draft', 'preview' or 'export'."""
    have = encoders()
    if "libx264" in have:
        preset, crf = {"draft": ("ultrafast", 30), "preview": ("veryfast", 26), "export": ("medium", 18)}[quality]
        args = ["-c:v", "libx264", "-preset", preset, "-crf", str(crf)]
        if quality == "export":
            args += ["-profile:v", "high"]
        return args
    bitrate = {"draft": "2M", "preview": "3M", "export": "12M"}[quality]
    for name in ("h264_mf", "h264_nvenc", "h264_qsv", "h264_amf", "libopenh264"):
        if name in have:
            return ["-c:v", name, "-b:v", bitrate]
    return ["-c:v", "mpeg4", "-q:v", "3" if quality == "export" else "6"]


@dataclass
class ClipInfo:
    duration: float
    width: int
    height: int
    fps: float
    has_audio: bool
    video_codec: str = ""
    audio_rate: int = 0
    rotation: int = 0

    def to_dict(self):
        return asdict(self)

    @classmethod
    def from_dict(cls, data):
        return cls(**{k: data[k] for k in cls.__dataclass_fields__ if k in data})


def probe(path):
    """Read duration, size, frame rate and audio from a video file."""
    proc = subprocess.run(
        [ffmpeg_exe(), "-hide_banner", "-nostdin", "-i", str(path)],
        capture_output=True, text=True, encoding="utf-8", errors="replace", **_popen_kwargs(),
    )
    return parse_probe(proc.stderr)


def parse_probe(text):
    duration = 0.0
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", text)
    if m:
        duration = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))

    width = height = 0
    fps = 0.0
    codec = ""
    rotation = 0
    video_found = False
    has_audio = False
    audio_rate = 0
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if "Stream #" in line and ": Video:" in line and not video_found:
            if "attached pic" in line:
                continue
            video_found = True
            cm = re.search(r": Video:\s*([\w-]+)", line)
            codec = cm.group(1) if cm else ""
            sm = re.search(r",\s*(\d{2,5})x(\d{2,5})[\s,\[]", line + " ")
            if sm:
                width, height = int(sm.group(1)), int(sm.group(2))
            fm = re.search(r",\s*([\d.]+)\s*fps", line)
            tm = re.search(r",\s*([\d.]+)(k?)\s*tbr", line)
            fps_value = float(fm.group(1)) if fm else 0.0
            tbr_value = (float(tm.group(1)) * (1000 if tm.group(2) else 1)) if tm else 0.0
            # Screen recordings often have a variable frame rate; the average ("fps") can be odd.
            if 10 <= fps_value <= 240:
                fps = fps_value
            elif 10 <= tbr_value <= 240:
                fps = tbr_value
            else:
                fps = 30.0
            for extra in lines[i + 1:i + 8]:
                rm = re.search(r"rotation of (-?[\d.]+) degrees", extra)
                if rm:
                    rotation = int(round(float(rm.group(1))))
                    break
                if "Stream #" in extra:
                    break
        elif "Stream #" in line and ": Audio:" in line and not has_audio:
            has_audio = True
            am = re.search(r",\s*(\d+)\s*Hz", line)
            audio_rate = int(am.group(1)) if am else 48000

    if not video_found or width == 0:
        if "No such file" in text or "Invalid data" in text:
            raise FFmpegError("That file isn't a video I can open.")
        raise FFmpegError("I couldn't find any video in that file.")
    if abs(rotation) % 180 == 90:
        # ffmpeg turns the picture upright when it decodes, so width and height swap.
        width, height = height, width
    return ClipInfo(
        duration=round(duration, 3), width=width, height=height, fps=round(fps, 3),
        has_audio=has_audio, video_codec=codec, audio_rate=audio_rate, rotation=rotation,
    )


def run(args, duration=None, on_progress=None, cancel=None, cwd=None, loglevel="error", timeout=None):
    """Run ffmpeg with the given arguments.

    on_progress(fraction) is called as ffmpeg works when duration (seconds of output) is known.
    cancel is a threading.Event; setting it stops ffmpeg and raises Cancelled.
    Returns everything ffmpeg printed to stderr.
    """
    cmd = [ffmpeg_exe(), "-hide_banner", "-nostdin", "-y", "-loglevel", loglevel,
           "-progress", "pipe:1", "-nostats"] + [str(a) for a in args]
    proc = subprocess.Popen(
        cmd, cwd=str(cwd) if cwd else None,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL,
        **_popen_kwargs(),
    )
    err_chunks = []

    def read_stderr():
        for raw in iter(proc.stderr.readline, b""):
            err_chunks.append(raw.decode("utf-8", "replace"))
            if len(err_chunks) > 20000:
                del err_chunks[:10000]

    reader = threading.Thread(target=read_stderr, daemon=True)
    reader.start()

    watcher = None
    if cancel is not None:
        def watch():
            while proc.poll() is None:
                if cancel.wait(0.2):
                    try:
                        proc.kill()
                    except OSError:
                        pass
                    return
        watcher = threading.Thread(target=watch, daemon=True)
        watcher.start()

    for raw in iter(proc.stdout.readline, b""):
        line = raw.decode("utf-8", "replace").strip()
        if on_progress and duration and (line.startswith("out_time_us=") or line.startswith("out_time_ms=")):
            try:
                seconds = int(line.split("=", 1)[1]) / 1_000_000
            except ValueError:
                continue
            on_progress(max(0.0, min(1.0, seconds / duration)))
    try:
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait()
    reader.join(timeout=5)
    proc.stdout.close()
    proc.stderr.close()
    stderr = "".join(err_chunks)
    if cancel is not None and cancel.is_set():
        raise Cancelled("Stopped.")
    if proc.returncode != 0:
        tail = "\n".join(stderr.strip().splitlines()[-12:])
        raise FFmpegError(f"ffmpeg failed (code {proc.returncode}).\n{tail}")
    if on_progress and duration:
        on_progress(1.0)
    return stderr


def grab_frame(path, t, width=512, quality=5):
    """One frame as JPEG bytes (fast seek)."""
    proc = subprocess.run(
        [ffmpeg_exe(), "-hide_banner", "-nostdin", "-loglevel", "error", "-ss", f"{max(0.0, t):.3f}",
         "-i", str(path), "-frames:v", "1", "-vf", f"scale={width}:-2", "-q:v", str(quality),
         "-f", "image2pipe", "-c:v", "mjpeg", "-"],
        capture_output=True, **_popen_kwargs(),
    )
    if proc.returncode != 0 or not proc.stdout:
        raise FFmpegError("Couldn't read a picture from the video.")
    return proc.stdout


def filter_path(path):
    """A file path written so it can sit inside an ffmpeg filter option (Windows drive colons need escaping)."""
    text = str(path).replace("\\", "/")
    return text.replace(":", "\\:").replace("'", "\\'")
