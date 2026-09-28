"""The AI Editor in real Google Chrome with an H.264 + AAC recording (like Windows Game Bar makes).

Google Chrome no longer lets tests load extensions, so this serves the editor as a web page
(it works the same, minus the extension-only extras). The open-source Chromium used by
test_extension.py can't read H.264, so this is the test that proves the TikTok-ready path:
H.264 + AAC in, H.264 (+ AAC where Chrome can make it) out.

Skipped when Google Chrome isn't installed. BEANIE_CHROME_CHANNEL picks the channel (default "chrome").
"""

import functools
import os
import sys
import tempfile
import threading
import unittest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import helpers

try:
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import sync_playwright
except ImportError:  # pragma: no cover
    sync_playwright = None


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".mjs": "text/javascript",
                      ".css": "text/css", ".html": "text/html"}

    def log_message(self, *args):
        pass


@unittest.skipIf(sync_playwright is None, "Playwright isn't installed")
class RealChromeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pw = sync_playwright().start()
        try:
            cls.browser = cls.pw.chromium.launch(channel=os.environ.get("BEANIE_CHROME_CHANNEL", "chrome"))
        except PlaywrightError as e:
            cls.pw.stop()
            raise unittest.SkipTest(f"Google Chrome isn't installed ({str(e).splitlines()[0]})")
        cls.clip = helpers.make_test_clip("h264", width=1280, height=720)
        handler = functools.partial(Handler, directory=str(helpers.EXTENSION))
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f"http://127.0.0.1:{cls.server.server_address[1]}/ai/editor.html"
        cls.shots = Path(os.environ["BEANIE_SHOTS"]) if os.environ.get("BEANIE_SHOTS") else None

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()

    def test_h264_recording_to_tiktok_video(self):
        page = self.browser.new_page(viewport={"width": 1366, "height": 820}, accept_downloads=True)
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(self.url)
        page.wait_for_selector("body[data-ready='1']", timeout=30000)
        print("\nChrome", self.browser.version, "on", sys.platform, file=sys.stderr)
        codecs = page.evaluate("async () => (await import('./js/exporter.js')).pickCodecs(1080, 1920)")
        print("This Chrome makes:", codecs, file=sys.stderr)
        self.assertEqual(codecs["video"], "avc", "Chrome can make H.264 videos")
        if sys.platform in ("win32", "darwin"):
            self.assertEqual(codecs["audio"], "aac", "Chrome on Windows and Mac can make AAC sound")

        page.set_input_files("#file", str(self.clip))
        page.wait_for_selector("#steps li", timeout=120000)
        greeting = page.locator(".msg.bot .bubble").first.inner_text()
        self.assertIn("The first 1.5s look like loading", greeting)
        page.fill("#input", "make a W edit at 6")
        page.press("#input", "Enter")
        page.wait_for_function("() => !document.querySelector('#send').disabled", timeout=60000)
        steps = page.locator("#steps li .txt").all_inner_texts()
        self.assertTrue(any(s.startswith("Slow-mo 0.5x") for s in steps), steps)
        page.wait_for_timeout(1500)
        if self.shots:
            self.shots.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(self.shots / "real-chrome-edit.png"))

        with page.expect_download(timeout=600000) as info:
            page.click("#btn-export")
        out = Path(tempfile.mkdtemp()) / info.value.suggested_filename
        info.value.save_as(str(out))
        self.assertRegex(out.name, r"^Beanie_steal\d+_\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d\.mp4$")
        probe = helpers.probe(out)
        print("Exported:", probe, file=sys.stderr)
        self.assertEqual(probe["video"], "h264", probe)
        self.assertEqual((probe["width"], probe["height"]), (1080, 1920), probe)
        self.assertIn(probe["audio"], ("aac", "opus"), probe)
        # W edit at 6: keeps 2-9 s, 5.4-6.4 s in slow-mo (+1 s), so 8 s long
        self.assertAlmostEqual(probe["duration"], 8.0, delta=0.2)
        if self.shots:
            import shutil

            shutil.copy(out, self.shots / "real-chrome-export.mp4")
        page.wait_for_selector("#export-progress", state="hidden", timeout=30000)
        self.assertIn("Saved", page.inner_text("#toast"))
        self.assertEqual(errors, [])


if __name__ == "__main__":
    unittest.main()
