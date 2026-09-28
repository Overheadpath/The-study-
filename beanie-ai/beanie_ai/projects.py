"""Projects: one clip with its analysis, markers, chat, edit plan (with undo) and videos."""

import json
import os
import re
import secrets
import shutil
import threading
import time
from datetime import datetime
from pathlib import Path

from . import analyze, config
from . import ffmpeg_tools as ff
from . import plan as P
from . import sfx, skills

HISTORY_LIMIT = 60
CHAT_LIMIT = 200


def _now():
    return time.time()


class Project:
    def __init__(self, folder, data):
        self.dir = Path(folder)
        self.data = data
        self.lock = threading.RLock()
        self.chat_lock = threading.Lock()
        self.job = None           # the render/watch running now: {"kind", "cancel"}
        self.job_lock = threading.Lock()

    # ---------------------------------------------------------------- basics
    @property
    def id(self):
        return self.data["id"]

    @property
    def info(self):
        return ff.ClipInfo.from_dict(self.data["info"])

    @property
    def analysis(self):
        return self.data.get("analysis")

    @property
    def plan(self):
        return self.data["history"][self.data["history_index"]]

    @property
    def source_path(self):
        return self.dir / self.data["source_file"]

    @property
    def analysis_dir(self):
        return self.dir / "analysis"

    @property
    def overlay_dir(self):
        path = self.dir / "overlays"
        path.mkdir(exist_ok=True)
        return path

    @property
    def proxy_path(self):
        return self.analysis_dir / "proxy.mp4"

    @property
    def preview_path(self):
        return self.dir / "preview.mp4"

    def save(self):
        with self.lock:
            text = json.dumps(self.data, ensure_ascii=False, indent=1)
            tmp = self.dir / "project.tmp"
            tmp.write_text(text, encoding="utf-8")
            os.replace(tmp, self.dir / "project.json")

    # ---------------------------------------------------------------- plan + undo
    def change_plan(self, new_plan):
        with self.lock:
            hist = self.data["history"][: self.data["history_index"] + 1]
            hist.append(new_plan)
            if len(hist) > HISTORY_LIMIT:
                hist = hist[-HISTORY_LIMIT:]
            self.data["history"] = hist
            self.data["history_index"] = len(hist) - 1
            self.data["plan_version"] += 1
            self.save()

    def undo(self):
        with self.lock:
            if self.data["history_index"] == 0:
                return False
            self.data["history_index"] -= 1
            self.data["plan_version"] += 1
            self.save()
            return True

    def redo(self):
        with self.lock:
            if self.data["history_index"] >= len(self.data["history"]) - 1:
                return False
            self.data["history_index"] += 1
            self.data["plan_version"] += 1
            self.save()
            return True

    def action_ctx(self, now=None):
        """What plan.apply_actions needs to understand times, sounds and skills."""
        a = self.analysis or {}
        ctx = {
            "duration": self.info.duration,
            "markers": list(self.data["markers"]),
            "highlight": a.get("highlight"),
            "dead_start": a.get("dead_start", 0.0),
            "dead_end": a.get("dead_end"),
            "moments": a.get("moments", []),
            "sounds": list(sfx.catalog()),
            "music": list(sfx.user_music()),
            "expand_skill": skills.expand,
        }
        if isinstance(now, (int, float)) and not isinstance(now, bool):
            ctx["now"] = max(0.0, min(float(now), self.info.duration))
        return ctx

    def apply(self, actions, now=None):
        """Apply actions; saves a new plan version if anything changed. Returns the ActionResult."""
        with self.lock:
            new_plan, result = P.apply_actions(self.plan, actions, self.action_ctx(now))
            if new_plan != self.plan:
                self.change_plan(new_plan)
            return result

    # ---------------------------------------------------------------- chat + markers
    def add_chat(self, role, content, done=None, warnings=None):
        with self.lock:
            msg = {"role": role, "content": content, "time": _now()}
            if done:
                msg["done"] = done
            if warnings:
                msg["warnings"] = warnings
            self.data["chat"].append(msg)
            self.data["chat"] = self.data["chat"][-CHAT_LIMIT:]
            self.save()
            return msg

    def history_for_ai(self):
        """Earlier chat turns for the AI, with what each edit did."""
        out = []
        for m in self.data["chat"][-17:-1]:
            content = m["content"]
            if m["role"] == "assistant" and m.get("done"):
                content += "\n[Applied: " + "; ".join(m["done"]) + "]"
            out.append({"role": m["role"], "content": content})
        return out

    def add_marker(self, t, label):
        with self.lock:
            t = round(max(0.0, min(float(t), self.info.duration)), 2)
            label = re.sub(r"\s+", " ", str(label or "steal")).strip()[:30] or "steal"
            marker = {"id": secrets.token_hex(3), "t": t, "label": label}
            # Marking the steal again moves the mark (one "steal", one "fail"...).
            others = [m for m in self.data["markers"] if m["label"].lower() != label.lower()]
            self.data["markers"] = sorted(others + [marker], key=lambda m: m["t"])[-20:]
            self.save()
            return marker

    def delete_marker(self, marker_id):
        with self.lock:
            self.data["markers"] = [m for m in self.data["markers"] if m["id"] != marker_id]
            self.save()

    def clip_notes(self):
        return analyze.describe(self.info, self.analysis, self.data["markers"], self.data.get("vision"))

    # ---------------------------------------------------------------- what the screen needs
    def state(self):
        with self.lock:
            d = self.data
            a = d.get("analysis") or {}
            plan = self.plan
            tl = P.Timeline(plan, self.info.duration) if d["status"] == "ready" else None
            preview = d.get("preview")
            return {
                "id": d["id"], "name": d["name"], "created": d["created"], "status": d["status"],
                "progress": d.get("progress", 0), "error": d.get("error"), "info": d["info"],
                "analysis": {k: a.get(k) for k in ("moments", "highlight", "dead_start", "dead_end", "thumbs", "proxy")},
                "markers": d["markers"], "chat": d["chat"][-80:], "vision": d.get("vision") or [],
                "plan": plan, "steps": P.steps(plan), "plan_version": d["plan_version"],
                "output_duration": round(tl.duration, 2) if tl else None,
                "segments": [{k: (round(v, 3) if isinstance(v, float) else v) for k, v in seg.items()}
                             for seg in tl.segments] if tl else [],
                "can_undo": d["history_index"] > 0,
                "can_redo": d["history_index"] < len(d["history"]) - 1,
                "overlays": [dict(o, ready=(self.overlay_dir / f"{o['key']}.png").exists())
                             for o in P.overlays(plan)],
                "preview": preview,
                "preview_stale": not preview or preview.get("plan_version") != d["plan_version"],
                "exports": d.get("exports", [])[-10:],
            }

    def summary(self):
        d = self.data
        return {"id": d["id"], "name": d["name"], "created": d["created"], "status": d["status"],
                "duration": d["info"].get("duration"), "exports": len(d.get("exports", []))}

    # ---------------------------------------------------------------- jobs (render / watch)
    JOB_PRIORITY = {"preview": 1, "watch": 2, "export": 3}

    def start_job(self, kind, timeout=None):
        """Take this project's job slot. A job stops a running job of the same or lower priority
        (export > watch > preview) and waits for a higher one. Returns a cancel Event, or None
        if the slot stayed busy (see job_kind())."""
        cancel = threading.Event()
        if timeout is None:
            timeout = 2 if kind == "preview" else 20
        deadline = time.time() + timeout
        while True:
            with self.job_lock:
                current = self.job
                if current is None:
                    self.job = {"kind": kind, "cancel": cancel}
                    return cancel
                if self.JOB_PRIORITY[current["kind"]] <= self.JOB_PRIORITY[kind] and current["kind"] != "export":
                    current["cancel"].set()
            if time.time() > deadline:
                return None
            time.sleep(0.05)

    def end_job(self, cancel):
        with self.job_lock:
            if self.job and self.job["cancel"] is cancel:
                self.job = None

    def job_kind(self):
        with self.job_lock:
            return self.job["kind"] if self.job else None

    def cancel_job(self):
        with self.job_lock:
            if self.job:
                self.job["cancel"].set()


class ProjectStore:
    def __init__(self):
        self.root = config.projects_dir()
        self.projects = {}
        self.lock = threading.Lock()
        for folder in sorted(self.root.iterdir()):
            f = folder / "project.json"
            if f.exists():
                try:
                    data = json.loads(f.read_text(encoding="utf-8"))
                    if data.get("status") == "analyzing":
                        data["status"] = "error"
                        data["error"] = "The app closed while this clip was being looked at. Add it again."
                    self.projects[data["id"]] = Project(folder, data)
                except (OSError, ValueError, KeyError):
                    continue

    def get(self, project_id):
        return self.projects.get(project_id)

    def list(self):
        items = [p.summary() for p in self.projects.values()]
        return sorted(items, key=lambda s: -s["created"])

    def delete(self, project_id):
        with self.lock:
            p = self.projects.pop(project_id, None)
        if p:
            p.cancel_job()
            shutil.rmtree(p.dir, ignore_errors=True)

    def _new_folder(self):
        pid = datetime.now().strftime("%Y%m%d-%H%M%S-") + secrets.token_hex(2)
        folder = self.root / pid
        folder.mkdir(parents=True)
        return pid, folder

    def create(self, src_path=None, upload=None, filename="clip.mp4", on_ready=None):
        """New project from a file on disk or an uploaded stream: (reader, length)."""
        pid, folder = self._new_folder()
        ext = Path(filename).suffix.lower()
        if ext not in config.VIDEO_EXTENSIONS:
            ext = ".mp4"
        dest = folder / f"source{ext}"
        try:
            if src_path:
                shutil.copy2(src_path, dest)
            else:
                reader, length = upload
                remaining = length
                with open(dest, "wb") as out:
                    while remaining > 0:
                        chunk = reader.read(min(1 << 20, remaining))
                        if not chunk:
                            break
                        out.write(chunk)
                        remaining -= len(chunk)
                if remaining > 0:
                    raise ff.FFmpegError("The upload stopped before the whole video arrived.")
            info = ff.probe(dest)
            if info.duration < 0.5:
                raise ff.FFmpegError("That video is too short.")
        except Exception:
            shutil.rmtree(folder, ignore_errors=True)
            raise
        name = re.sub(r"[^\w\- ]+", "", Path(filename).stem).strip()[:40] or "clip"
        data = {
            "id": pid, "name": name, "created": _now(), "source_file": dest.name, "info": info.to_dict(),
            "status": "analyzing", "progress": 0.0, "error": None, "analysis": None,
            "markers": [], "chat": [], "vision": [],
            "history": [P.new_plan()], "history_index": 0, "plan_version": 1,
            "preview": None, "exports": [],
        }
        project = Project(folder, data)
        project.save()
        with self.lock:
            self.projects[pid] = project
        threading.Thread(target=self._analyze, args=(project, on_ready), daemon=True).start()
        return project

    def _analyze(self, project, on_ready):
        last = [0.0]

        def progress(f):
            if f - last[0] >= 0.02 or f >= 1:
                last[0] = f
                with project.lock:
                    project.data["progress"] = round(f, 3)

        try:
            result = analyze.analyze_clip(project.source_path, project.info, project.analysis_dir,
                                          on_progress=progress)
            with project.lock:
                project.data["analysis"] = result
                project.data["status"] = "ready"
                project.data["progress"] = 1.0
                project.save()
        except Exception as e:  # shown to the user in the app
            with project.lock:
                project.data["status"] = "error"
                project.data["error"] = f"I couldn't read that video. {str(e).splitlines()[0]}"
                project.save()
        if on_ready:
            on_ready(project)


def export_name(project):
    """Beanie_steal<n>_<date>.mp4, numbered after what's already in Exports."""
    folder = config.exports_dir()
    highest = 0
    for f in folder.glob("Beanie_steal*_*.mp4"):
        m = re.match(r"Beanie_steal(\d+)_", f.name)
        if m:
            highest = max(highest, int(m.group(1)))
    return folder / f"Beanie_steal{highest + 1}_{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.mp4"


def recent_clips(limit=12):
    """Newest videos in the folders screen recorders use."""
    found = {}
    cutoff = _now() - 60 * 24 * 3600
    for folder in config.recording_folders():
        try:
            entries = list(os.scandir(folder))
        except OSError:
            continue
        for e in entries:
            try:
                if not e.is_file() or Path(e.name).suffix.lower() not in config.VIDEO_EXTENSIONS:
                    continue
                st = e.stat()
            except OSError:
                continue
            if st.st_size < 100_000 or st.st_mtime < cutoff:
                continue
            found[e.path] = {"path": e.path, "name": e.name, "size": st.st_size, "mtime": st.st_mtime,
                             "folder": Path(folder).name}
    return sorted(found.values(), key=lambda c: -c["mtime"])[:limit]


def allowed_import(path):
    """Only videos inside the user's folders can be imported by path."""
    try:
        p = Path(path).resolve(strict=True)
    except (OSError, RuntimeError):
        return None
    if not p.is_file() or p.suffix.lower() not in config.VIDEO_EXTENSIONS:
        return None
    roots = [Path.home().resolve()] + [Path(f).resolve() for f in config.recording_folders() if Path(f).exists()]
    if any(p == r or r in p.parents for r in roots):
        return p
    return None
