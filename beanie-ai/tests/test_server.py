import json
import shutil
import threading
import time
import unittest
import urllib.error
import urllib.request

import helpers
from fake_ollama import FakeOllama

OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))


class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.home = helpers.isolated_home()
        from beanie_ai import config, server
        cls.config = config
        cls.fake = FakeOllama().__enter__()
        cls.srv, cls.app = server.make_server(port=17419, tries=50)
        cls.app.settings.update({"ollama_url": "http://127.0.0.1:9", "model": "gemma3:4b"})
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.app.port}"
        cls.clip = helpers.make_test_clip()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        cls.fake.__exit__(None, None, None)

    # ------------------------------------------------------------------ helpers
    def request(self, path, body=None, method=None, headers=None, raw=None):
        h = {"X-Beanie": "1"}
        h.update(headers or {})
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        if data is not None and raw is None:
            h["Content-Type"] = "application/json"
        req = urllib.request.Request(self.base + path, data=data, headers=h,
                                     method=method or ("POST" if data is not None else "GET"))
        try:
            with OPENER.open(req, timeout=300) as r:
                return r.status, dict(r.headers), r.read()
        except urllib.error.HTTPError as e:
            return e.code, dict(e.headers), e.read()

    def get_json(self, path):
        code, _, body = self.request(path)
        self.assertEqual(code, 200, body)
        return json.loads(body)

    def post_json(self, path, body=None):
        code, _, raw = self.request(path, body if body is not None else {})
        self.assertEqual(code, 200, raw)
        return json.loads(raw)

    def stream(self, path, body=None):
        code, _, raw = self.request(path, body if body is not None else {})
        self.assertEqual(code, 200, raw)
        return [json.loads(line) for line in raw.decode().splitlines() if line.strip()]

    def new_project(self):
        code, _, raw = self.request("/api/projects/upload", raw=self.clip.read_bytes(),
                                    headers={"X-Filename": "Roblox%20test.mp4", "Content-Type": "video/mp4"})
        self.assertEqual(code, 200, raw)
        pid = json.loads(raw)["project"]["id"]
        for _ in range(300):
            state = self.get_json(f"/api/projects/{pid}")["project"]
            if state["status"] != "analyzing":
                break
            time.sleep(0.1)
        self.assertEqual(state["status"], "ready", state.get("error"))
        return pid, state

    def use_fake_brain(self, on=True):
        url = self.fake.url if on else "http://127.0.0.1:9"
        self.post_json("/api/settings", {"ollama_url": url})

    # ------------------------------------------------------------------ tests
    def test_safety_checks(self):
        code, _, _ = self.request("/api/settings", {"model": "x"}, headers={"X-Beanie": ""})
        self.assertEqual(code, 403)
        code, _, _ = self.request("/api/status", headers={"Host": "evil.example"})
        self.assertEqual(code, 403)
        code, _, _ = self.request("/static/..%2F..%2Fconfig.py")
        self.assertEqual(code, 404)
        code, _, raw = self.request("/api/projects/import", {"path": "/etc/passwd"})
        self.assertEqual(code, 400)

    def test_requests_share_one_connection(self):
        """A body the handler doesn't use must not leak into the next request (browsers reuse connections)."""
        import http.client
        pid, _ = self.new_project()
        conn = http.client.HTTPConnection("127.0.0.1", self.app.port, timeout=30)
        headers = {"X-Beanie": "1", "Content-Type": "application/json"}
        for path in (f"/api/projects/{pid}/undo", f"/api/projects/{pid}/redo", "/api/settings"):
            conn.request("POST", path, body=b'{"unused": true}', headers=headers)
            resp = conn.getresponse()
            self.assertEqual(resp.status, 200, resp.read())
            resp.read()
        conn.request("GET", "/api/status", headers={"X-Beanie": "1"})
        resp = conn.getresponse()
        self.assertEqual(resp.status, 200)
        resp.read()
        conn.close()

    def test_status_and_page(self):
        st = self.get_json("/api/status")
        self.assertEqual(st["app"], "Beanie AI")
        self.assertTrue(st["ffmpeg"]["ok"])
        self.assertIn("boom", st["sounds"])
        code, headers, page = self.request("/")
        self.assertEqual(code, 200)
        self.assertIn("text/html", headers["Content-Type"])

    def test_edit_flow_without_ai(self):
        self.use_fake_brain(False)
        pid, state = self.new_project()
        self.assertEqual(state["analysis"]["dead_start"], 1.5)
        events = self.stream(f"/api/projects/{pid}/chat", {"message": "cut out 0 to 1.5 and add a skull at the end"})
        done = events[-1]
        self.assertEqual(done["type"], "done")
        plan = done["project"]["plan"]
        self.assertEqual(plan["remove"][0]["start"], 0.0)
        self.assertEqual(plan["sticker"][0]["emoji"], "💀")
        # something the quick parser doesn't get: explain how to set up the AI
        events = self.stream(f"/api/projects/{pid}/chat", {"message": "make it look amazing"})
        self.assertIn("Set up AI", events[-1]["reply"])
        # undo by chat and by button
        events = self.stream(f"/api/projects/{pid}/chat", {"message": "undo"})
        self.assertEqual(events[-1]["project"]["plan"]["sticker"], [])
        out = self.post_json(f"/api/projects/{pid}/redo")
        self.assertEqual(len(out["project"]["plan"]["sticker"]), 1)

    def test_ai_chat_streams_and_edits(self):
        self.use_fake_brain(True)
        self.post_json("/api/settings", {"instant_commands": False})
        try:
            pid, _ = self.new_project()
            events = self.stream(f"/api/projects/{pid}/chat", {"message": "make it good"})
            texts = [e["text"] for e in events if e["type"] == "text"]
            done = events[-1]
            self.assertGreater(len(texts), 1)
            self.assertEqual("".join(texts), done["reply"])
            self.assertTrue(done["streamed"])
            self.assertTrue(any("W steal edit" in d for d in done["done"]), done["done"])
            self.assertTrue(done["project"]["plan"]["zoom"])
            sent = self.fake.chats()[-1]["messages"][-1]["content"]
            self.assertIn("[Clip notes]", sent)
            self.assertIn("Dark screen", sent)
        finally:
            self.post_json("/api/settings", {"instant_commands": True})
            self.use_fake_brain(False)

    def test_render_overlays_export(self):
        self.use_fake_brain(False)
        pid, _ = self.new_project()
        self.post_json(f"/api/projects/{pid}/actions",
                       {"actions": [{"do": "sticker", "emoji": "🔥", "at": 3}, {"do": "keep", "start": 2, "end": 7}]})
        events = self.stream(f"/api/projects/{pid}/render", {"quality": "preview"})
        self.assertEqual(events[-1]["type"], "need_overlays")
        png = self.home / "ov.png"
        from beanie_ai import ffmpeg_tools as ff
        ff.run(["-f", "lavfi", "-i", "color=c=orange:s=200x200:d=0.04,format=rgba", "-frames:v", "1", str(png)])
        for o in events[-1]["overlays"]:
            code, _, _ = self.request(f"/api/projects/{pid}/overlays/{o['key']}", raw=png.read_bytes(),
                                      headers={"Content-Type": "image/png"})
            self.assertEqual(code, 200)
        code, _, _ = self.request(f"/api/projects/{pid}/overlays/{'0' * 16}", raw=b"not a png")
        self.assertEqual(code, 400)
        events = self.stream(f"/api/projects/{pid}/render", {"quality": "preview"})
        self.assertEqual(events[-1]["type"], "done", events[-1])
        self.assertTrue(any(e["type"] == "progress" for e in events))
        self.assertFalse(events[-1]["project"]["preview_stale"])
        code, headers, body = self.request(f"/api/projects/{pid}/media/preview", headers={"Range": "bytes=0-99"})
        self.assertEqual((code, len(body)), (206, 100))
        self.assertTrue(headers["Content-Range"].startswith("bytes 0-99/"))
        events = self.stream(f"/api/projects/{pid}/render", {"quality": "export"})
        done = events[-1]
        self.assertEqual(done["type"], "done", done)
        self.assertRegex(done["file"], r"^Beanie_steal\d+_\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d\.mp4$")
        self.assertEqual((done["details"]["width"], done["details"]["height"]), (1080, 1920))
        code, headers, body = self.request(f"/api/exports/{done['file']}")
        self.assertEqual(code, 200)
        self.assertIn("attachment", headers["Content-Disposition"])
        self.assertTrue((self.config.exports_dir() / done["file"]).exists())

    def test_markers_and_watch(self):
        pid, _ = self.new_project()
        out = self.post_json(f"/api/projects/{pid}/markers", {"t": 6.02, "label": "steal"})
        self.assertEqual(out["project"]["markers"][0]["t"], 6.02)
        events = self.stream(f"/api/projects/{pid}/chat", {"message": "zoom on the steal"})
        self.assertEqual(events[-1]["project"]["plan"]["zoom"][0]["at"], 6.02)
        mid = out["project"]["markers"][0]["id"]
        out = self.post_json(f"/api/projects/{pid}/markers/delete", {"id": mid})
        self.assertEqual(out["project"]["markers"], [])
        self.use_fake_brain(True)
        try:
            events = self.stream(f"/api/projects/{pid}/watch")
            self.assertEqual(events[-1]["type"], "done", events[-1])
            self.assertEqual(events[-1]["project"]["markers"][0]["label"], "steal")
            self.assertTrue(events[-1]["project"]["vision"])
        finally:
            self.use_fake_brain(False)

    def test_lobby_chat_and_recent_clips(self):
        events = self.stream("/api/lobby/chat", {"message": "hi"})
        self.assertIn("Beanie", events[-1]["reply"])
        captures = self.config.videos_folder() / "Captures"
        captures.mkdir(parents=True, exist_ok=True)
        target = captures / "Roblox 2026-09-28 11-02-11.mp4"
        shutil.copy(self.clip, target)
        clips = self.get_json("/api/recent")["clips"]
        self.assertTrue(any(c["name"] == target.name for c in clips), clips)
        code, headers, body = self.request("/api/recent/thumb?path=" + urllib.request.quote(str(target)))
        self.assertEqual((code, headers["Content-Type"]), (200, "image/jpeg"))
        out = self.post_json("/api/projects/import", {"path": str(target)})
        self.assertEqual(out["project"]["name"], "Roblox 2026-09-28 11-02-11")


if __name__ == "__main__":
    unittest.main()
