"""The whole app in a real browser: import a recording, chat, preview, export.

Needs Playwright (pip install playwright) and a Chromium. Skipped when they're missing.
Set BEANIE_SHOTS=folder to save screenshots.
"""

import os
import shutil
import threading
import unittest
from pathlib import Path

import helpers
from fake_ollama import FakeOllama

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright = None

CHROMIUM = os.environ.get("BEANIE_CHROMIUM") or next(
    (p for p in ("/opt/pw-browsers/chromium-1194/chrome-linux/chrome",) if Path(p).exists()), None)


@unittest.skipIf(sync_playwright is None, "Playwright isn't installed")
class UITest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.home = helpers.isolated_home()
        from beanie_ai import config, server
        cls.config = config
        captures = config.videos_folder() / "Captures"
        captures.mkdir(parents=True, exist_ok=True)
        shutil.copy(helpers.make_test_clip(width=1280, height=720), captures / "Roblox 2026-09-28 11-02-11.mp4")
        cls.fake = FakeOllama().__enter__()
        cls.srv, cls.app = server.make_server(port=18419, tries=50)
        cls.app.settings.update({"ollama_url": cls.fake.url, "model": "gemma3:4b"})
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.app.port}/"
        cls.shots = Path(os.environ["BEANIE_SHOTS"]) if os.environ.get("BEANIE_SHOTS") else None
        cls.pw = sync_playwright().start()
        kwargs = {"executable_path": CHROMIUM} if CHROMIUM else {}
        cls.browser = cls.pw.chromium.launch(**kwargs)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.srv.shutdown()
        cls.srv.server_close()
        cls.fake.__exit__(None, None, None)

    def shot(self, page, name):
        if self.shots:
            self.shots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(self.shots / f"{name}.png"))

    def test_full_flow(self):
        page = self.browser.new_page(viewport={"width": 1366, "height": 768})
        try:
            self.full_flow(page)
        except Exception:
            if not page.is_closed():
                self.shot(page, "failure")  # to see what went wrong
            raise

    def full_flow(self, page):
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and errors.append(m.text))
        page.goto(self.url)
        page.wait_for_selector(".clip-card")
        page.wait_for_selector("#brain-pill.ok")
        self.assertIn("gemma3:4b", page.inner_text("#brain-pill"))
        self.shot(page, "1-home")

        page.click(".clip-card")
        page.wait_for_selector("#stage", timeout=60000)
        # Chrome and Edge play MP4 (H.264); the open-source Chromium used for testing can't.
        can_play = page.evaluate("document.createElement('video').canPlayType('video/mp4; codecs=\"avc1.64001F\"') !== ''")
        if can_play:
            page.wait_for_function("document.querySelector('#vid-original').readyState >= 1")
        self.assertIn("Got your clip", page.inner_text("#chat-log"))
        self.shot(page, "2-clip-open")

        # mark the steal at 6 s in the original clip, then ask for a W edit
        if can_play:
            page.evaluate("document.querySelector('#vid-original').currentTime = 6.0")
            page.wait_for_function("Math.abs(document.querySelector('#vid-original').currentTime - 6) < 0.05")
            page.click("#btn-mark")
        else:
            page.evaluate("fetch(`/api/projects/${S.project.id}/markers`, {method: 'POST', headers: {'X-Beanie': '1', "
                          "'Content-Type': 'application/json'}, body: JSON.stringify({t: 6, label: 'steal'})})"
                          ".then(r => r.json()).then(d => applyState(d.project))")
        page.wait_for_selector(".tl-marker")
        page.fill("#input", "make it good")
        page.press("#input", "Enter")
        page.wait_for_function("document.querySelectorAll('#steps li').length > 5", timeout=30000)
        steps = page.inner_text("#steps")
        self.assertIn("Zoom", steps)
        self.assertIn("boom", steps)
        # the preview renders by itself; the stickers/captions are drawn by this browser
        page.wait_for_function("!document.querySelector('#vid-edited').hidden && "
                               "document.querySelector('#vid-edited').src.includes('preview')", timeout=90000)
        page.wait_for_function("document.querySelector('#stage-overlay').hidden", timeout=90000)
        if can_play:
            page.wait_for_function("document.querySelector('#vid-edited').readyState >= 2", timeout=30000)
            page.evaluate("document.querySelector('#vid-edited').pause()")
            page.evaluate("document.querySelector('#vid-edited').currentTime = 0.8")
        page.wait_for_timeout(700)
        self.shot(page, "3-w-edit")
        pid = page.evaluate("S.project.id")
        overlays = list((self.config.projects_dir() / pid / "overlays").glob("*.png"))
        self.assertGreaterEqual(len(overlays), 2)

        # instant command + undo button
        page.fill("#input", "add a skull at the end")
        page.press("#input", "Enter")
        page.wait_for_function("document.querySelector('#steps').innerText.includes('💀')")
        page.click("#btn-undo")
        page.wait_for_function("!document.querySelector('#steps').innerText.includes('💀')")

        # export
        page.click("#btn-export")
        page.wait_for_selector(".export-card", timeout=180000)
        name = page.inner_text(".export-card .name")
        self.assertRegex(name, r"^Beanie_steal\d+_")
        self.assertTrue((self.config.exports_dir() / name).exists())
        self.shot(page, "4-exported")

        # AI setup window
        page.click("#brain-pill")
        page.wait_for_selector(".model-row")
        self.assertIn("In use", page.inner_text("#modal"))
        self.shot(page, "5-setup")
        page.keyboard.press("Escape")
        page.click("#btn-sounds")
        page.wait_for_selector("[data-play='boom']")
        self.shot(page, "6-sounds")
        page.keyboard.press("Escape")
        self.assertEqual(errors, [])
        page.close()

    def test_other_controls(self):
        page = self.browser.new_page(viewport={"width": 1280, "height": 720})
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(self.url)
        page.wait_for_selector("#brain-pill.ok")
        page.evaluate("showHome()")
        # upload through the file picker
        page.set_input_files("#file", str(helpers.make_test_clip()))
        page.wait_for_selector("#stage", timeout=60000)
        pid = page.evaluate("S.project.id")
        # rename
        page.fill("#project-name", "My best steal")
        page.press("#project-name", "Enter")
        page.wait_for_function("S.project.name === 'My best steal'")
        # AI vision finds the steal and marks it; the marker can be removed by clicking it
        page.click("#btn-watch")
        page.wait_for_selector(".tl-marker", timeout=30000)
        self.assertIn("watched your clip", page.inner_text("#chat-log"))
        page.click(".tl-marker span")
        page.wait_for_function("document.querySelectorAll('.tl-marker').length === 0")
        # a step can be removed with its ✕
        page.fill("#input", "zoom at 5")
        page.press("#input", "Enter")
        page.wait_for_function("document.querySelector('#steps').innerText.includes('Zoom')")
        page.click("#steps li:has-text('Zoom') button")
        page.wait_for_function("!document.querySelector('#steps').innerText.includes('Zoom')")
        # clicking the timeline jumps the original clip there
        box = page.locator("#timeline").bounding_box()
        page.mouse.click(box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.8)
        self.assertEqual(page.evaluate("S.view"), "original")
        # the clips window lists this clip and can open another one
        page.click("#btn-clips")
        page.wait_for_selector(f".clip-row[data-id='{pid}']")
        self.assertIn("My best steal", page.inner_text("#modal"))
        page.click("#new-clip")
        page.wait_for_selector("#drop")
        # downloading a brain model from the setup window
        page.click("#brain-pill")
        page.wait_for_selector("[data-pull='llama3.2:3b']")
        page.click("[data-pull='llama3.2:3b']")
        page.wait_for_selector("text=llama3.2:3b is ready", timeout=30000)
        page.keyboard.press("Escape")
        self.assertEqual(self.app.settings.get("model"), "llama3.2:3b")
        self.app.settings.update({"model": "gemma3:4b"})
        self.assertEqual(errors, [])
        page.close()

    def test_basic_mode_without_ai(self):
        self.app.settings.update({"ollama_url": "http://127.0.0.1:9"})
        self.app.forget_status()
        try:
            page = self.browser.new_page(viewport={"width": 1280, "height": 720})
            page.goto(self.url)
            page.wait_for_selector("#brain-pill.warn")
            page.click("#btn-setup")
            page.wait_for_selector("text=Get Ollama")
            self.shot(page, "7-setup-offline")
            page.keyboard.press("Escape")
            page.fill("#input", "How do I record?")
            page.press("#input", "Enter")
            page.wait_for_function("document.querySelector('#chat-log').innerText.includes('Win + Alt + R')")
            page.close()
        finally:
            self.app.settings.update({"ollama_url": self.fake.url})
            self.app.forget_status()


if __name__ == "__main__":
    unittest.main()
