"""Where Beanie AI keeps its files, and the settings people can change."""

import json
import os
import sys
import threading
from pathlib import Path

DEFAULT_PORT = 7419
DEFAULT_MODEL = "gemma3:4b"
DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434"

# Models the setup screen offers, smallest first. Any other Ollama model name works too.
RECOMMENDED_MODELS = [
    {"name": "llama3.2:3b", "size": "2.0 GB", "note": "Fastest. Good for older laptops. Can't watch clips."},
    {"name": "gemma3:4b", "size": "3.3 GB", "note": "Best all-rounder. Can watch your clips. (Recommended)"},
    {"name": "gemma3:12b", "size": "8.1 GB", "note": "Smartest. Needs a gaming PC with a good graphics card."},
]

DEFAULT_SETTINGS = {
    "model": DEFAULT_MODEL,
    "ollama_url": DEFAULT_OLLAMA_URL,
    # Clear commands like "cut 0 to 3" are done right away without waiting for the AI.
    "instant_commands": True,
    # Make a quick preview after every change.
    "auto_preview": True,
}

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v", ".wmv", ".flv", ".ts"}
AUDIO_EXTENSIONS = {".mp3", ".wav", ".ogg", ".m4a", ".aac", ".flac", ".opus"}


def _windows_known_folder(guid_text):
    """The real path of a Windows special folder (it can be moved into OneDrive)."""
    import ctypes
    from ctypes import wintypes

    class GUID(ctypes.Structure):
        _fields_ = [
            ("Data1", wintypes.DWORD),
            ("Data2", wintypes.WORD),
            ("Data3", wintypes.WORD),
            ("Data4", wintypes.BYTE * 8),
        ]

    import uuid

    u = uuid.UUID(guid_text)
    guid = GUID(u.time_low, u.time_mid, u.time_hi_version, (wintypes.BYTE * 8).from_buffer_copy(u.bytes[8:]))
    path_ptr = ctypes.c_wchar_p()
    shell32 = ctypes.windll.shell32
    if shell32.SHGetKnownFolderPath(ctypes.byref(guid), 0, None, ctypes.byref(path_ptr)) != 0:
        return None
    try:
        return Path(path_ptr.value)
    finally:
        ctypes.windll.ole32.CoTaskMemFree(path_ptr)


def videos_folder():
    """The user's Videos folder (where Xbox Game Bar saves recordings)."""
    if os.environ.get("BEANIE_AI_HOME"):
        return Path(os.environ["BEANIE_AI_HOME"]) / "Videos"
    if sys.platform == "win32":
        try:
            found = _windows_known_folder("18989B1D-99B5-455B-841C-AB7C74E4DDFC")
            if found:
                return found
        except Exception:
            pass
    if sys.platform == "darwin":
        return Path.home() / "Movies"
    return Path.home() / "Videos"


def _home_override():
    value = os.environ.get("BEANIE_AI_HOME")
    return Path(value) if value else None


def app_data_dir():
    """Working files: projects, previews, caches. Not synced by OneDrive."""
    override = _home_override()
    if override:
        path = override / "appdata"
    elif sys.platform == "win32":
        path = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local")) / "BeanieAI"
    elif sys.platform == "darwin":
        path = Path.home() / "Library" / "Application Support" / "Beanie AI"
    else:
        path = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")) / "beanie-ai"
    path.mkdir(parents=True, exist_ok=True)
    return path


def user_dir():
    """The folder people see: finished videos, their own sounds and music."""
    override = _home_override()
    path = (override / "user") if override else (videos_folder() / "Beanie AI")
    for sub in ("Exports", "My Sounds", "My Music"):
        (path / sub).mkdir(parents=True, exist_ok=True)
    return path


def exports_dir():
    return user_dir() / "Exports"


def my_sounds_dir():
    return user_dir() / "My Sounds"


def my_music_dir():
    return user_dir() / "My Music"


def projects_dir():
    path = app_data_dir() / "projects"
    path.mkdir(parents=True, exist_ok=True)
    return path


def recording_folders():
    """Folders where screen recorders usually save clips, most likely first."""
    videos = videos_folder()
    candidates = [
        videos / "Captures",  # Xbox Game Bar and Snipping Tool
        videos / "Medal" / "Clips",
        videos / "Medal",
        videos,  # OBS default
        videos / "Screen Recordings",
        Path.home() / "Desktop",
        Path.home() / "Downloads",
    ]
    seen = []
    for c in candidates:
        if c not in seen:
            seen.append(c)
    return seen


class Settings:
    """Settings saved in settings.json in the app data folder."""

    def __init__(self, path=None):
        self.path = Path(path) if path else app_data_dir() / "settings.json"
        self._lock = threading.Lock()
        self._values = dict(DEFAULT_SETTINGS)
        try:
            stored = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(stored, dict):
                for key in DEFAULT_SETTINGS:
                    if key in stored and isinstance(stored[key], type(DEFAULT_SETTINGS[key])):
                        self._values[key] = stored[key]
        except (OSError, ValueError):
            pass

    def get(self, key):
        with self._lock:
            return self._values.get(key, DEFAULT_SETTINGS.get(key))

    def all(self):
        with self._lock:
            return dict(self._values)

    def update(self, changes):
        with self._lock:
            for key, value in (changes or {}).items():
                if key in DEFAULT_SETTINGS and isinstance(value, type(DEFAULT_SETTINGS[key])):
                    if isinstance(value, str):
                        value = value.strip()[:300]
                    self._values[key] = value
            data = json.dumps(self._values, indent=2)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(data, encoding="utf-8")
        os.replace(tmp, self.path)
        return self.all()
