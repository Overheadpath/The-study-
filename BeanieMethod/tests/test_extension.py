"""Beanie Pro in a real browser: the popup's AI Editor button, then the editor end to end.

Needs Playwright (pip install playwright) and ffmpeg (or pip install imageio-ffmpeg).
BEANIE_CHROMIUM picks the browser; BEANIE_SHOTS=folder saves screenshots.
"""

import os
import shutil
import tempfile
import time
import unittest
from pathlib import Path

import helpers
from fake_ollama import FakeOllama

try:
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright = None

EXT = str(helpers.EXTENSION)
CANVAS_SUM = """() => {
  const c = document.querySelector('#edited-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4 * 97) s += d[i] + d[i + 1] + d[i + 2];
  return s / (d.length / (4 * 97));
}"""
# The newest download (Playwright saves downloads under its own names, so the name can't be searched).
DOWNLOADS = "() => new Promise((r) => chrome.downloads.search({orderBy: ['-startTime'], limit: 5}, r))"


@unittest.skipIf(sync_playwright is None, "Playwright isn't installed")
class ExtensionTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.clip = helpers.make_test_clip("vp9")
        cls.fake = FakeOllama().__enter__()
        cls.pw = sync_playwright().start()
        cls.downloads = Path(tempfile.mkdtemp(prefix="beanie-downloads-"))
        exe = helpers.chromium_path()
        # the full Chromium (the small headless-only build can't run extensions)
        kwargs = {"executable_path": exe} if exe else {"channel": "chromium"}
        cls.ctx = cls.pw.chromium.launch_persistent_context(
            tempfile.mkdtemp(prefix="beanie-profile-"), headless=True, accept_downloads=True,
            downloads_path=str(cls.downloads), viewport={"width": 1366, "height": 820},
            args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}", "--autoplay-policy=no-user-gesture-required"],
            **kwargs)
        sw = cls.ctx.service_workers[0] if cls.ctx.service_workers else cls.ctx.wait_for_event("serviceworker")
        cls.ext_id = sw.url.split("/")[2]
        cls.base = f"chrome-extension://{cls.ext_id}"
        cls.shots = Path(os.environ["BEANIE_SHOTS"]) if os.environ.get("BEANIE_SHOTS") else None

    @classmethod
    def tearDownClass(cls):
        cls.ctx.close()
        cls.pw.stop()
        cls.fake.__exit__(None, None, None)

    # ------------------------------------------------------------------ helpers
    def shot(self, page, name):
        if self.shots:
            self.shots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(self.shots / f"{name}.png"))

    def open_editor(self):
        page = self.ctx.new_page()
        self.addCleanup(lambda: page.is_closed() or page.close())
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(m.text))
        page.goto(f"{self.base}/ai/editor.html")
        page.wait_for_selector("body[data-ready='1']", timeout=30000)
        return page, errors

    def import_clip(self, page):
        if not page.query_selector("#file"):
            page.click("#btn-clips")
            page.click("#new-clip")
        page.set_input_files("#file", str(self.clip))
        page.wait_for_selector("#steps li", timeout=120000)

    def say(self, page, text):
        bubbles = page.locator(".msg.bot").count()
        page.fill("#input", text)
        page.press("#input", "Enter")
        page.wait_for_function(f"() => document.querySelectorAll('.msg.bot, .msg.system').length > {bubbles} "
                               "&& !document.querySelector('#send').disabled", timeout=60000)
        return page.locator(".msg.bot .bubble, .msg.system .bubble").last.inner_text()

    def steps(self, page):
        return page.locator("#steps li .txt").all_inner_texts()

    def wait_canvas(self, page, brighter_than=20.0, timeout=20):
        end = time.time() + timeout
        value = 0
        while time.time() < end:
            value = page.evaluate(CANVAS_SUM)
            if value > brighter_than:
                return value
            time.sleep(0.2)
        self.fail(f"the preview stayed dark ({value:.1f})")

    # ------------------------------------------------------------------ tests
    def test_popup_opens_the_editor(self):
        for p in self.ctx.pages:  # the button brings an open editor forward instead of opening another
            if "/ai/editor.html" in p.url:
                p.close()
        popup = self.ctx.new_page()
        popup.goto(f"{self.base}/popup.html")
        button = popup.locator("[data-testid=open-ai-editor]")
        self.assertIn("AI Editor", button.inner_text())
        with self.ctx.expect_page() as info:
            button.click()
        editor = info.value
        editor.wait_for_selector("body[data-ready='1']", timeout=30000)
        self.assertTrue(editor.url.endswith("/ai/editor.html"))
        self.assertGreater(editor.locator(".msg.bot").count(), 0, "Beanie says hi (or reopens the last clip)")
        editor.close()

    def test_editor_end_to_end(self):
        page, errors = self.open_editor()
        self.shot(page, "1-home")
        self.import_clip(page)
        self.shot(page, "2-clip")
        greeting = page.locator(".msg.bot .bubble").first.inner_text()
        self.assertIn("The first 1.5s look like loading", greeting)
        self.assertEqual(page.locator(".tl-dead").count() >= 2, True, "loading screen and menu are marked")

        # an instant command, no AI needed
        reply = self.say(page, "cut out 0 to 1.5 and add a skull at the end")
        self.assertIn("Cut out 0.0s to 1.5s", reply)
        steps = self.steps(page)
        self.assertIn("Cut out 0.0s – 1.5s", steps)
        self.assertTrue(any("Sticker at the end" in s for s in steps), steps)
        self.assertIn("11.5s video", page.inner_text("#out-length"))
        self.wait_canvas(page)
        self.shot(page, "3-edited")

        # after an edit the preview plays by itself; the button pauses and plays it
        state = lambda: page.get_attribute("#btn-play", "data-state")  # noqa: E731
        page.wait_for_function("() => parseFloat(document.querySelector('#edited-time').textContent) > 0.8", timeout=15000)
        if state() == "playing":
            page.click("#btn-play")
        self.assertEqual(state(), "paused")
        paused_at = page.inner_text("#edited-time")
        page.wait_for_timeout(400)
        self.assertEqual(page.inner_text("#edited-time"), paused_at)
        page.click("#btn-play")
        page.wait_for_function(f"() => document.querySelector('#edited-time').textContent !== {paused_at!r}", timeout=10000)
        page.click("#btn-play")
        self.assertEqual(state(), "paused")

        # a full edit from a quick button: the W edit
        page.locator(".chip", has_text="W edit").click()
        page.wait_for_function("() => !document.querySelector('#send').disabled")
        steps = self.steps(page)
        self.assertTrue(any(s.startswith("Slow-mo 0.5x") for s in steps), steps)
        self.assertTrue(any(s.startswith("boom at") for s in steps), steps)
        page.click("#btn-undo")
        self.assertIn("Cut out 0.0s – 1.5s", self.steps(page))

        # marking the steal, then using it
        page.click("[data-view=original]")
        page.evaluate("() => { document.querySelector('#vid-original').currentTime = 6.2; }")
        page.wait_for_function("() => Math.abs(document.querySelector('#vid-original').currentTime - 6.2) < 0.05")
        page.click("#btn-mark")
        page.wait_for_selector(".tl-marker")
        self.say(page, "zoom on the steal")
        self.assertIn("Zoom 1.4x at 6.2s", self.steps(page))

        # export
        page.click("#btn-export")
        page.wait_for_selector("#export-progress:not([hidden])")
        page.wait_for_selector("#export-progress", state="hidden", timeout=300000)
        self.shot(page, "4-exported")
        toast = page.inner_text("#toast")
        self.assertIn("Saved", toast, toast)
        self.assertRegex(page.inner_text(".export-card .name"), r"^Beanie_steal\d+_\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d\.mp4$")
        item = None
        for _ in range(50):
            items = page.evaluate(DOWNLOADS)
            if items and items[0]["state"] == "complete":
                item = items[0]
                break
            time.sleep(0.2)
        self.assertIsNotNone(item, f"the video was downloaded: {page.evaluate(DOWNLOADS)} {list(self.downloads.iterdir())}")
        self.assertGreater(item["fileSize"], 50000)
        path = Path(item["filename"])
        if not path.exists():  # Playwright keeps downloads under its own names
            path = max(self.downloads.iterdir(), key=lambda p: p.stat().st_mtime)
        if self.shots:
            shutil.copy(path, self.shots / "export.mp4")
        info = helpers.probe(path)
        self.assertEqual((info["width"], info["height"]), (1080, 1920), info)
        self.assertAlmostEqual(info["duration"], 11.5, delta=0.15)
        self.assertIsNotNone(info["audio"], info)
        r, g, b = helpers.mean_color(path, 0.5)
        self.assertGreater(r + g + b, 60, "the first frame is the clip after the loading screen")

        # everything is still there after a reload
        page.reload()
        page.wait_for_selector("#steps li", timeout=30000)
        self.assertIn("Zoom 1.4x at 6.2s", self.steps(page))
        self.assertEqual(page.locator(".export-card").count(), 1)
        self.assertEqual(errors, [])
        page.close()

    def test_ai_chat_through_ollama(self):
        page, errors = self.open_editor()
        if not page.query_selector("#steps li"):
            self.import_clip(page)
        page.click("#btn-setup")
        page.wait_for_selector("#set-url", state="attached")
        page.click("details summary:has-text('Advanced')")
        page.fill("#set-url", self.fake.url)
        page.click("#set-url-save")
        page.locator(".choice label", has_text="Ollama").click()
        page.wait_for_selector("#brain-pill.ok", timeout=15000)
        self.assertIn("gemma3:4b", page.inner_text("#brain-pill"))
        self.shot(page, "5-setup")
        page.click("#modal .close")
        page.fill("#input", "make it good")
        page.press("#input", "Enter")
        page.wait_for_function("() => !document.querySelector('#send').disabled", timeout=60000)
        reply = page.locator(".msg.bot .bubble").last.inner_text()
        self.assertIn("On it!", reply)
        self.assertIn("W steal edit", reply)
        self.assertTrue(any(s.startswith("Slow-mo") for s in self.steps(page)))
        self.assertTrue(self.fake.chats(), "the chat went to Ollama")
        self.assertEqual(self.fake.refused, 0, "Ollama never saw the extension's Origin header")
        sent = self.fake.chats()[-1]["messages"][-1]["content"]
        self.assertIn("[Clip notes]", sent)
        self.assertIn("Dark screen", sent)
        # back to basic mode for the other tests
        page.click("#btn-setup")
        page.locator(".choice label", has_text="Basic").click()
        page.wait_for_selector("#brain-pill.warn")
        self.assertEqual(errors, [])
        page.close()

    def test_sounds_window(self):
        page, errors = self.open_editor()
        page.click("#btn-sounds")
        page.wait_for_selector("[data-play=boom]")
        page.click("[data-play=boom]")
        page.click("[data-play=fail_horn]")
        page.wait_for_timeout(300)
        page.click("#modal .close")
        self.assertEqual(errors, [])
        page.close()


if __name__ == "__main__":
    unittest.main()
