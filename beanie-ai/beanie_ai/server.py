"""The local web server. The app's screen (a page in your browser) talks to it.

It only listens on this PC (127.0.0.1). Requests must name this PC as the host and every
change must carry the X-Beanie header, so other websites can't control the app.
"""

import json
import os
import random
import re
import subprocess
import sys
import threading
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from . import APP_NAME, VERSION
from . import brain as B
from . import commands, config
from . import ffmpeg_tools as ff
from . import plan as P
from . import projects as PR
from . import render as R
from . import sfx, skills

STATIC = Path(__file__).parent / "static"
STATIC_TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
                ".ico": "image/x-icon", ".json": "application/json"}
INSTANT_OPENERS = ["Done!", "Got it!", "Easy.", "Say less.", "Bet.", "On it!"]


def instant_reply(result):
    if result.done:
        text = f"{random.choice(INSTANT_OPENERS)} " + "; ".join(result.done) + "."
    else:
        text = "Hmm, that didn't change anything."
    if result.warnings:
        text += " " + " ".join(result.warnings)
    return text


FAQ = [
    (r"\brecord", "To record in Roblox: press **Win + Alt + R** to start and stop. Even better, turn on "
                  "**Record what happened** (Windows Settings → Gaming → Captures) and press **Win + Alt + G** right "
                  "after a steal to save the last 30 seconds. Your recordings show up in Beanie automatically."),
    (r"\bwhat can you do\b|\bhelp\b|\bcommands?\b",
     "I turn your steal clips into TikTok edits! Try: **make a W edit**, **fail edit**, **suspense edit**, "
     "**hype edit**, **cut the boring parts**, **cut out 0 to 3**, **zoom at 6**, **slow mo at 6**, "
     "**freeze at 6 black and white**, **add a skull at the end**, **boom at 6**, "
     '**add text "EZ STEAL" at the top**, **make it vertical**, **undo**. Then press **Export HD video**.'),
    (r"\bexport|\bsave|\bwhere\b.*\b(video|file)", "Press **⬇️ Export HD video** under the edit. Finished videos go to "
     "your **Videos → Beanie AI → Exports** folder, ready for TikTok."),
    (r"\bsounds?\b|\bsfx\b|\bmusic\b", "Click **🔊 Sounds** at the top to hear my sound effects. Put your own sounds "
     "in **My Sounds** and songs in **My Music**, then ask for them by name."),
]


def faq_answer(message):
    text = message.lower()
    for pattern, answer in FAQ:
        if re.search(pattern, text):
            return answer
    return None


def offline_reply(status, model):
    if status.get("online"):
        return (f"My AI brain ({model}) isn't downloaded yet. Click **Set up AI** at the top to get it. "
                "Until then I can still do simple things like \"cut out 0 to 3\", \"add a skull at the end\", "
                "\"zoom at 6\" or \"make a W edit\".")
    return ("My AI brain isn't running yet, so I can only do simple commands like \"cut out 0 to 3\", "
            "\"add a skull at the end\", \"zoom at 6\" or \"make a W edit\". Click **Set up AI** at the top "
            "to install it. It's free and runs on your PC.")


class App:
    def __init__(self, port):
        self.port = port
        self.settings = config.Settings()
        self.brain = B.Brain(self.settings)
        self.store = PR.ProjectStore()
        self._status = (0.0, None)
        self._status_lock = threading.Lock()
        self.lobby = []  # chat before any clip is added
        self.thumb_cache = {}
        self.allowed_hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}

    def brain_status(self, fresh=False):
        with self._status_lock:
            when, status = self._status
            if fresh or status is None or time.time() - when > 4:
                status = self.brain.status()
                self._status = (time.time(), status)
            return status

    def forget_status(self):
        with self._status_lock:
            self._status = (0.0, None)

    # ------------------------------------------------------------------ chat
    def chat(self, project, message, now, emit):
        message = (message or "").strip()[:2000]
        if not message:
            emit({"type": "error", "message": "Type something first 🙂"})
            return
        if project is None:
            return self.lobby_chat(message, emit)
        with project.chat_lock:
            if project.data["status"] != "ready":
                emit({"type": "error", "message": "Hang on, I'm still looking at your clip..."})
                return
            project.add_chat("user", message)
            ctx = project.action_ctx(now)
            parsed = commands.parse(message, ctx)
            if parsed.special:
                ok = project.undo() if parsed.special == "undo" else project.redo()
                words = {"undo": ("Undone ↩️", "There's nothing to undo."),
                         "redo": ("Redone ↪️", "There's nothing to redo.")}[parsed.special]
                return self._finish(project, words[0] if ok else words[1], [], [], emit)
            status = self.brain_status()
            ready = bool(status.get("ready"))
            instant = parsed.actions and parsed.confident and (self.settings.get("instant_commands") or not ready)
            if instant or (parsed.actions and not ready):
                result = project.apply(parsed.actions, now)
                reply = instant_reply(result)
                if not ready and not parsed.confident:
                    reply += " (I only understood part of that. Set up my AI brain for the rest!)"
                return self._finish(project, reply, result.done, result.warnings, emit)
            if not ready:
                reply = faq_answer(message) or offline_reply(status, self.settings.get("model"))
                return self._finish(project, reply, [], [], emit)
            try:
                answer = self.brain.respond(
                    project.history_for_ai(), message, project.clip_notes(), P.summary(project.plan),
                    sfx.catalog(), guess=parsed.actions or None, songs=list(sfx.user_music()),
                    on_text=lambda text: emit({"type": "text", "text": text}))
            except (B.BrainOffline, B.BrainError) as e:
                self.forget_status()
                if parsed.actions:
                    result = project.apply(parsed.actions, now)
                    return self._finish(project, f"My AI brain had a problem ({e}), so I did what I understood: "
                                        + instant_reply(result), result.done, result.warnings, emit)
                return self._finish(project, f"My AI brain isn't answering: {e}", [], [], emit)
            result = project.apply(answer["actions"], now)
            reply = answer["reply"]
            if answer["actions"] and not result.done and result.warnings:
                reply += "\n(I couldn't do that part: " + " ".join(result.warnings) + ")"
            return self._finish(project, reply, result.done, result.warnings, emit, streamed=True)

    def _finish(self, project, reply, done, warnings, emit, streamed=False):
        # Instant replies already say what changed; AI replies get the list of changes too.
        project.add_chat("assistant", reply, done if streamed else None, warnings if streamed else None)
        emit({"type": "done", "reply": reply, "done": done, "warnings": warnings, "streamed": streamed,
              "project": project.state()})

    def lobby_chat(self, message, emit):
        self.lobby.append({"role": "user", "content": message})
        status = self.brain_status()
        if not status.get("ready"):
            reply = faq_answer(message) or (
                "Hi, I'm Beanie 👋 Add a clip on the right (drop it in, or pick a recent recording) and tell me "
                "how to edit it." + ("" if status.get("online") else
                                     " Click **Set up AI** at the top to give me my full brain."))
        else:
            try:
                answer = self.brain.respond(self.lobby[-12:-1], message, "No clip added yet.", "(no clip)",
                                            sfx.catalog(), on_text=lambda t: emit({"type": "text", "text": t}))
                reply = answer["reply"]
            except (B.BrainOffline, B.BrainError) as e:
                self.forget_status()
                reply = f"My AI brain isn't answering: {e}"
        self.lobby.append({"role": "assistant", "content": reply})
        self.lobby = self.lobby[-40:]
        emit({"type": "done", "reply": reply, "done": [], "warnings": [], "streamed": True})

    # ------------------------------------------------------------------ render + watch
    def render(self, project, quality, emit, client_gone):
        if project.data["status"] != "ready":
            emit({"type": "error", "message": "The clip isn't ready yet."})
            return
        plan = project.plan
        missing = [o for o in P.overlays(plan) if not (project.overlay_dir / f"{o['key']}.png").exists()]
        if missing:
            emit({"type": "need_overlays", "overlays": missing})
            return
        cancel = project.start_job(quality)
        if cancel is None:
            emit({"type": "busy", "message": busy_message(project)})
            return
        try:
            version = project.data["plan_version"]
            a = project.analysis
            last = [-1.0]

            def progress(f):
                if quality == "preview" and client_gone():
                    cancel.set()
                if f - last[0] >= 0.02 or f >= 1:
                    last[0] = f
                    emit({"type": "progress", "value": round(f, 3)})

            if quality == "preview":
                out = project.dir / f"preview-{version}.mp4"
                details = R.render(plan, project.info, project.proxy_path, out, "preview", project.overlay_dir,
                                   on_progress=progress, cancel=cancel,
                                   src_size=(a["proxy"]["width"], a["proxy"]["height"]))
                poster = out.with_suffix(".jpg")
                try:
                    poster.write_bytes(ff.grab_frame(out, min(1.0, details["duration"] * 0.3), width=540, quality=4))
                except ff.FFmpegError:
                    poster = None
                with project.lock:
                    project.data["preview"] = {"file": out.name, "plan_version": version,
                                               "duration": details["duration"], "time": time.time(),
                                               "poster": poster.name if poster else None}
                    project.save()
                keep = {out.name, poster.name if poster else ""}
                for old in list(project.dir.glob("preview-*.mp4")) + list(project.dir.glob("preview-*.jpg")):
                    if old.name not in keep:
                        try:
                            old.unlink()
                        except OSError:
                            pass  # still being played; it goes next time
            else:
                out = PR.export_name(project)
                details = R.render(plan, project.info, project.source_path, out, "export", project.overlay_dir,
                                   on_progress=progress, cancel=cancel)
                with project.lock:
                    project.data.setdefault("exports", []).append(
                        {"file": out.name, "duration": details["duration"], "time": time.time()})
                    project.save()
            emit({"type": "done", "quality": quality, "file": out.name, "details": details,
                  "project": project.state()})
        except ff.Cancelled:
            emit({"type": "cancelled"})
        except (ff.FFmpegError, R.RenderError, OSError) as e:
            emit({"type": "error", "message": str(e)})
        finally:
            project.end_job(cancel)

    def watch(self, project, emit):
        status = self.brain_status(fresh=True)
        if not status.get("ready"):
            emit({"type": "error", "message": "Set up my AI brain first (top right)."})
            return
        if not status.get("vision"):
            emit({"type": "error", "message": f"The AI model {self.settings.get('model')} can't see pictures. "
                                              "Pick gemma3:4b in Set up AI."})
            return
        cancel = project.start_job("watch")
        if cancel is None:
            emit({"type": "busy", "message": busy_message(project)})
            return
        try:
            a = project.analysis or {}
            duration = project.info.duration
            lo = a.get("dead_start") or 0.0
            hi = a.get("dead_end") or duration
            if hi - lo < 1.0:
                lo, hi = 0.0, duration
            count = int(min(16, max(6, (hi - lo) / 1.5)))
            times = [lo + (hi - lo) * (i + 0.5) / count for i in range(count)]
            frames = [(t, ff.grab_frame(project.proxy_path, t)) for t in times]
            emit({"type": "progress", "value": 0.02})
            seen = self.brain.watch(frames, on_progress=lambda f: emit({"type": "progress", "value": round(f, 3)}),
                                    cancel=cancel)
            if cancel.is_set():
                emit({"type": "cancelled"})
                return
            with project.lock:
                project.data["vision"] = seen
                project.save()
            t, kind = B.moment_from_vision(seen)
            if t is not None:
                project.add_marker(t, kind)
                reply = (f"I watched your clip 👀 Looks like the {kind} happens around {t:.1f}s, so I marked it. "
                         "Say \"make a W edit\" or \"fail edit\" and I'll use that moment.")
            else:
                reply = "I watched your clip 👀 but couldn't spot the steal. Pause at it and press Mark."
            project.add_chat("assistant", reply)
            emit({"type": "done", "reply": reply, "project": project.state()})
        except (B.BrainOffline, B.BrainError, ff.FFmpegError) as e:
            self.forget_status()
            emit({"type": "error", "message": str(e)})
        finally:
            project.end_job(cancel)

    # ------------------------------------------------------------------ misc
    def status(self):
        try:
            ffmpeg = {"ok": True, "version": ff.ffmpeg_version(), "encoder": ff.h264_args("export")[1]}
        except ff.FFmpegError as e:
            ffmpeg = {"ok": False, "error": str(e)}
        return {
            "app": APP_NAME, "version": VERSION, "ffmpeg": ffmpeg, "brain": self.brain_status(),
            "settings": self.settings.all(), "recommended_models": config.RECOMMENDED_MODELS,
            "sounds": sfx.catalog(), "music": list(sfx.user_music()),
            "folders": {"exports": str(config.exports_dir()), "sounds": str(config.my_sounds_dir()),
                        "music": str(config.my_music_dir())},
            "skills": {k: v["title"] for k, v in skills.SKILLS.items()},
            "lobby": self.lobby[-40:],
        }

    def open_folder(self, what, file=None):
        if what == "export" and file:
            target = config.exports_dir() / Path(file).name
            if not target.exists():
                return False
            if sys.platform == "win32":
                subprocess.Popen(f'explorer /select,"{target}"')  # opens the folder with the video selected
                return True
            target = target.parent
        else:
            target = {"exports": config.exports_dir(), "sounds": config.my_sounds_dir(),
                      "music": config.my_music_dir()}.get(what)
            if target is None:
                return False
        if sys.platform == "win32":
            os.startfile(str(target))  # noqa: S606 (opens Explorer on the user's own folder)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", str(target)])
        else:
            subprocess.Popen(["xdg-open", str(target)])
        return True


def busy_message(project):
    doing = {"export": "exporting your video", "watch": "watching your clip"}.get(project.job_kind(), "working")
    return f"I'm busy {doing}. Try again when it's done."


def clip_time(project, t, view):
    """A player time as a clip time. Times from the edited preview are mapped back to the clip."""
    if isinstance(t, bool) or not isinstance(t, (int, float)):
        return None
    if view == "edited" and project.data["status"] == "ready":
        return P.Timeline(project.plan, project.info.duration).to_source(float(t))
    return float(t)


RAW_BODY = {"upload", "overlay"}  # these read the request body themselves

ROUTES = [
    ("GET", r"/", "index"),
    ("GET", r"/static/([\w.-]+)", "static"),
    ("GET", r"/api/status", "status"),
    ("GET", r"/api/recent", "recent"),
    ("GET", r"/api/recent/thumb", "recent_thumb"),
    ("GET", r"/api/projects", "projects"),
    ("GET", r"/api/projects/([\w-]+)", "project"),
    ("GET", r"/api/projects/([\w-]+)/media/(source|preview|preview_poster|thumbs|poster)", "media"),
    ("GET", r"/api/sounds/([\w-]+)", "sound"),
    ("GET", r"/api/exports/([\w .-]+\.mp4)", "export_file"),
    ("POST", r"/api/settings", "settings"),
    ("POST", r"/api/models/pull", "pull"),
    ("POST", r"/api/lobby/chat", "lobby_chat"),
    ("POST", r"/api/projects/import", "import_path"),
    ("POST", r"/api/projects/upload", "upload"),
    ("POST", r"/api/projects/([\w-]+)/chat", "chat"),
    ("POST", r"/api/projects/([\w-]+)/actions", "actions"),
    ("POST", r"/api/projects/([\w-]+)/(undo|redo)", "undo_redo"),
    ("POST", r"/api/projects/([\w-]+)/markers", "add_marker"),
    ("POST", r"/api/projects/([\w-]+)/markers/delete", "delete_marker"),
    ("POST", r"/api/projects/([\w-]+)/overlays/([0-9a-f]{16})", "overlay"),
    ("POST", r"/api/projects/([\w-]+)/render", "render"),
    ("POST", r"/api/projects/([\w-]+)/watch", "watch"),
    ("POST", r"/api/projects/([\w-]+)/cancel", "cancel"),
    ("POST", r"/api/projects/([\w-]+)/rename", "rename"),
    ("POST", r"/api/projects/([\w-]+)/delete", "delete"),
    ("POST", r"/api/open", "open_folder"),
]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "BeanieAI"
    app = None  # set by make_server

    def log_message(self, fmt, *args):
        pass

    # ------------------------------------------------------------------ plumbing
    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def _dispatch(self, method):
        # Every POST body must be read before the next request on this connection,
        # or its leftover bytes would be read as the start of the next request.
        self._body_read = method != "POST" or int(self.headers.get("Content-Length") or 0) == 0
        self.body = {}
        try:
            host = (self.headers.get("Host") or "").lower()
            if host not in self.app.allowed_hosts:
                return self._error(403, "This app only answers on 127.0.0.1.")
            if method == "POST" and self.headers.get("X-Beanie") != "1":
                return self._error(403, "Missing X-Beanie header.")
            url = urlparse(self.path)
            self.query = parse_qs(url.query)
            for m, pattern, name in ROUTES:
                if m != method:
                    continue
                match = re.fullmatch(pattern, url.path)
                if match:
                    if method == "POST" and name not in RAW_BODY:
                        try:
                            self.body = self._json_body()
                        except ValueError:
                            return self._error(400, "That request wasn't valid JSON.")
                    return getattr(self, "h_" + name)(*[unquote(g) for g in match.groups()])
            self._error(404, "Not found.")
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            self.close_connection = True
        except Exception as e:  # keep the server alive; show the problem
            traceback.print_exc()
            try:
                self._error(500, f"Something broke: {e}")
            except OSError:
                pass
        finally:
            if not self._body_read:
                self.close_connection = True

    def _json_body(self, limit=2_000_000):
        length = int(self.headers.get("Content-Length") or 0)
        if length > limit:
            raise ValueError("Too much data.")
        raw = self.rfile.read(length) if length else b"{}"
        self._body_read = True
        data = json.loads(raw or b"{}")
        return data if isinstance(data, dict) else {}

    def _raw_body(self, length):
        data = self.rfile.read(length)
        self._body_read = len(data) == length
        return data

    def _send(self, code, body, ctype, extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _json(self, data, code=200):
        self._send(code, json.dumps(data, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

    def _error(self, code, message):
        self._json({"error": message}, code)

    def _project(self, pid):
        p = self.app.store.get(pid)
        if p is None:
            self._error(404, "That clip isn't here any more.")
        return p

    def _stream(self):
        """Start a streamed answer. Returns (emit, gone)."""
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        state = {"gone": False}
        lock = threading.Lock()

        def emit(obj):
            if state["gone"]:
                return
            data = (json.dumps(obj, ensure_ascii=False) + "\n").encode("utf-8")
            try:
                with lock:
                    self.wfile.write(f"{len(data):X}\r\n".encode() + data + b"\r\n")
                    self.wfile.flush()
            except OSError:
                state["gone"] = True

        return emit, (lambda: state["gone"])

    def _end_stream(self):
        try:
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        except OSError:
            pass

    def _file(self, path, ctype, download=None):
        path = Path(path)
        if not path.is_file():
            return self._error(404, "File not found.")
        size = path.stat().st_size
        start, end, code = 0, size - 1, 200
        rng = self.headers.get("Range")
        if rng:
            m = re.fullmatch(r"bytes=(\d*)-(\d*)", rng.strip())
            if m and (m.group(1) or m.group(2)):
                if m.group(1):
                    start = int(m.group(1))
                    end = int(m.group(2)) if m.group(2) else size - 1
                else:
                    start = max(0, size - int(m.group(2)))
                if start >= size:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                end = min(end, size - 1)
                code = 206
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(end - start + 1))
        self.send_header("Cache-Control", "no-cache")
        if code == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        if download:
            self.send_header("Content-Disposition", f'attachment; filename="{download}"')
        self.end_headers()
        with open(path, "rb") as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = f.read(min(256 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    # ------------------------------------------------------------------ pages + status
    def h_index(self):
        self._file(STATIC / "index.html", STATIC_TYPES[".html"])

    def h_static(self, name):
        path = (STATIC / name).resolve()
        if STATIC.resolve() not in path.parents or not path.is_file():
            return self._error(404, "Not found.")
        self._file(path, STATIC_TYPES.get(path.suffix.lower(), "application/octet-stream"))

    def h_status(self):
        if self.query.get("fresh"):
            self.app.forget_status()
        self._json(self.app.status())

    def h_settings(self):
        body = self.body
        changes = {}
        if isinstance(body.get("model"), str) and re.fullmatch(r"[\w.:/-]{1,80}", body["model"].strip()):
            changes["model"] = body["model"].strip()
        if isinstance(body.get("ollama_url"), str) and re.fullmatch(r"https?://[\w.:\[\]-]+/?",
                                                                    body["ollama_url"].strip()):
            changes["ollama_url"] = body["ollama_url"].strip().rstrip("/")
        for key in ("instant_commands", "auto_preview"):
            if isinstance(body.get(key), bool):
                changes[key] = body[key]
        self.app.settings.update(changes)
        self.app.forget_status()
        self._json({"settings": self.app.settings.all(), "brain": self.app.brain_status(fresh=True)})

    def h_pull(self):
        body = self.body
        model = str(body.get("model") or self.app.settings.get("model")).strip()
        if not re.fullmatch(r"[\w.:/-]{1,80}", model):
            return self._error(400, "That model name doesn't look right.")
        emit, _ = self._stream()
        try:
            for step in self.app.brain.client.pull(model):
                emit({"type": "progress", "status": step.get("status", ""), "completed": step.get("completed"),
                      "total": step.get("total")})
            self.app.settings.update({"model": model})
            self.app.forget_status()
            emit({"type": "done", "brain": self.app.brain_status(fresh=True)})
        except (B.BrainOffline, B.BrainError) as e:
            emit({"type": "error", "message": str(e)})
        self._end_stream()

    def h_open_folder(self):
        body = self.body
        ok = self.app.open_folder(str(body.get("what", "")), body.get("file"))
        self._json({"ok": ok})

    # ------------------------------------------------------------------ clips
    def h_recent(self):
        self._json({"clips": PR.recent_clips(), "folders": [str(f) for f in config.recording_folders()]})

    def h_recent_thumb(self):
        path = PR.allowed_import((self.query.get("path") or [""])[0])
        if not path:
            return self._error(404, "Not found.")
        key = (str(path), path.stat().st_mtime)
        data = self.app.thumb_cache.get(key)
        if data is None:
            try:
                info = ff.probe(path)
                data = ff.grab_frame(path, min(2.0, info.duration * 0.3), width=320, quality=6)
            except ff.FFmpegError:
                return self._error(404, "No picture.")
            if len(self.app.thumb_cache) > 200:
                self.app.thumb_cache.clear()
            self.app.thumb_cache[key] = data
        self._send(200, data, "image/jpeg")

    def h_projects(self):
        self._json({"projects": self.app.store.list()})

    def h_project(self, pid):
        p = self._project(pid)
        if p:
            self._json({"project": p.state(), "job": p.job_kind()})

    def h_import_path(self):
        body = self.body
        path = PR.allowed_import(str(body.get("path", "")))
        if not path:
            return self._error(400, "I can only open videos from your own folders.")
        try:
            p = self.app.store.create(src_path=path, filename=path.name)
        except ff.FFmpegError as e:
            return self._error(400, str(e))
        self._json({"project": p.state()})

    def h_upload(self):
        length = int(self.headers.get("Content-Length") or 0)
        name = unquote(self.headers.get("X-Filename") or "clip.mp4")
        if length <= 0:
            return self._error(400, "The video was empty.")
        if length > 8 * 1024 ** 3:
            return self._error(400, "That video is too big (8 GB max).")
        try:
            p = self.app.store.create(upload=(self.rfile, length), filename=name)
        except ff.FFmpegError as e:
            return self._error(400, str(e))  # the connection closes, so any unread bytes are dropped
        self._body_read = True
        self._json({"project": p.state()})

    def h_rename(self, pid):
        p = self._project(pid)
        if p:
            name = re.sub(r"\s+", " ", str(self.body.get("name", ""))).strip()[:40]
            if name:
                with p.lock:
                    p.data["name"] = name
                    p.save()
            self._json({"project": p.state()})

    def h_delete(self, pid):
        self.app.store.delete(pid)
        self._json({"ok": True})

    def h_media(self, pid, which):
        p = self._project(pid)
        if not p:
            return
        if which == "source":
            return self._file(p.proxy_path, "video/mp4")
        if which == "preview":
            prev = p.data.get("preview")
            return self._file(p.dir / prev["file"] if prev else p.dir / "none.mp4", "video/mp4")
        if which == "preview_poster":
            prev = p.data.get("preview") or {}
            return self._file(p.dir / (prev.get("poster") or "none.jpg"), "image/jpeg")
        self._file(p.analysis_dir / f"{which}.jpg", "image/jpeg")

    def h_sound(self, name):
        try:
            path = sfx.path_for(name)
        except KeyError:
            return self._error(404, "No such sound.")
        ctype = {".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".m4a": "audio/mp4"}
        self._file(path, ctype.get(Path(path).suffix.lower(), "application/octet-stream"))

    def h_export_file(self, name):
        path = config.exports_dir() / Path(name).name
        self._file(path, "video/mp4", download=path.name)

    # ------------------------------------------------------------------ editing
    def h_chat(self, pid):
        p = self._project(pid)
        if not p:
            return
        body = self.body
        emit, _ = self._stream()
        self.app.chat(p, body.get("message"), clip_time(p, body.get("now"), body.get("view")), emit)
        self._end_stream()

    def h_lobby_chat(self):
        body = self.body
        emit, _ = self._stream()
        self.app.chat(None, body.get("message"), None, emit)
        self._end_stream()

    def h_actions(self, pid):
        p = self._project(pid)
        if not p:
            return
        body = self.body
        actions = body.get("actions")
        if not isinstance(actions, list):
            return self._error(400, "No actions.")
        result = p.apply(actions, body.get("now"))
        if body.get("say") and result.done:
            p.add_chat("assistant", instant_reply(result), result.done, result.warnings)
        self._json({"done": result.done, "warnings": result.warnings, "project": p.state()})

    def h_undo_redo(self, pid, which):
        p = self._project(pid)
        if p:
            ok = p.undo() if which == "undo" else p.redo()
            self._json({"ok": ok, "project": p.state()})

    def h_add_marker(self, pid):
        p = self._project(pid)
        if p:
            body = self.body
            t = clip_time(p, body.get("t"), body.get("view"))
            if t is None:
                return self._error(400, "No time.")
            p.add_marker(t, body.get("label") or "steal")
            self._json({"project": p.state()})

    def h_delete_marker(self, pid):
        p = self._project(pid)
        if p:
            p.delete_marker(str(self.body.get("id", "")))
            self._json({"project": p.state()})

    def h_overlay(self, pid, key):
        p = self._project(pid)
        if not p:
            return
        length = int(self.headers.get("Content-Length") or 0)
        if not 0 < length <= 8_000_000:
            return self._error(400, "Bad picture.")
        data = self._raw_body(length)
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            return self._error(400, "Pictures must be PNG.")
        tmp = p.overlay_dir / f"{key}.tmp"
        tmp.write_bytes(data)
        os.replace(tmp, p.overlay_dir / f"{key}.png")
        self._json({"ok": True})

    def h_render(self, pid):
        p = self._project(pid)
        if not p:
            return
        quality = "export" if self.body.get("quality") == "export" else "preview"
        emit, gone = self._stream()
        self.app.render(p, quality, emit, gone)
        self._end_stream()

    def h_watch(self, pid):
        p = self._project(pid)
        if not p:
            return
        emit, _ = self._stream()
        self.app.watch(p, emit)
        self._end_stream()

    def h_cancel(self, pid):
        p = self._project(pid)
        if p:
            p.cancel_job()
            self._json({"ok": True})


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def handle_error(self, request, client_address):
        # Browsers drop connections all the time (seeking a video, closing a tab): not an error.
        if isinstance(sys.exc_info()[1], (ConnectionResetError, BrokenPipeError, ConnectionAbortedError,
                                          TimeoutError)):
            return
        super().handle_error(request, client_address)


def make_server(port=config.DEFAULT_PORT, tries=10):
    """Start listening on the first free port from `port`. Returns (server, app)."""
    last_error = None
    for p in range(port, port + tries):
        app = App(p)
        handler = type("BoundHandler", (Handler,), {"app": app})
        try:
            server = Server(("127.0.0.1", p), handler)
            return server, app
        except OSError as e:
            last_error = e
    raise OSError(f"No free port between {port} and {port + tries - 1}: {last_error}")
