import shutil
import tempfile
import unittest
from pathlib import Path

import helpers
from beanie_ai import config
from beanie_ai import ffmpeg_tools as ff
from beanie_ai import plan as P
from beanie_ai import render as R
from beanie_ai import sfx


def colored_png(path, color, size):
    ff.run(["-f", "lavfi", "-i", f"color=c={color}:s={size}:d=0.04,format=rgba", "-frames:v", "1", str(path)])


class RenderTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.home = helpers.isolated_home()
        cls.clip = helpers.make_test_clip()
        cls.info = ff.probe(cls.clip)
        cls.tmp = Path(tempfile.mkdtemp(prefix="beanie-render-"))

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def plan(self, actions, info=None):
        info = info or self.info
        c = {"duration": info.duration, "markers": [], "sounds": list(sfx.catalog()),
             "music": list(sfx.user_music())}
        plan, result = P.apply_actions(P.new_plan(), actions, c)
        self.assertEqual(result.warnings, [])
        return plan

    def render(self, plan, name, clip=None, info=None, quality="preview", overlay_dir=None):
        out = self.tmp / f"{name}.mp4"
        details = R.render(plan, info or self.info, clip or self.clip, out, quality=quality,
                           overlay_dir=overlay_dir or self.tmp)
        return out, details, ff.probe(out)

    def test_vertical_blur_is_default(self):
        out, d, got = self.render(P.new_plan(), "vertical")
        self.assertEqual((got.width, got.height), (540, 960))
        self.assertAlmostEqual(got.duration, 13.0, delta=0.1)
        self.assertTrue(got.has_audio)
        # the blurred copy fills the band above the gameplay (not black)
        self.assertGreater(sum(helpers.mean_color(out, 4.0, 0, 0, 540, 200)), 60)

    def test_bars_crop_square_original(self):
        plan = self.plan([{"do": "format", "format": "vertical", "fit": "bars"}])
        out, _, got = self.render(plan, "bars")
        self.assertEqual((got.width, got.height), (540, 960))
        self.assertLess(sum(helpers.mean_color(out, 4.0, 0, 0, 540, 200)), 10)
        plan = self.plan([{"do": "format", "format": "vertical", "fit": "crop", "x": 0.0}])
        out, _, got = self.render(plan, "crop")
        self.assertGreater(sum(helpers.mean_color(out, 4.0, 0, 0, 540, 200)), 60)
        plan = self.plan([{"do": "format", "format": "square"}])
        _, _, got = self.render(plan, "square")
        self.assertEqual((got.width, got.height), (540, 540))
        plan = self.plan([{"do": "format", "format": "original"}])
        _, _, got = self.render(plan, "original", quality="export")
        self.assertEqual((got.width, got.height), (640, 360))

    def test_timeline_edits_change_length(self):
        plan = self.plan([
            {"do": "keep", "start": 1.5, "end": 13}, {"do": "remove", "start": 8, "end": 10.5},
            {"do": "speed", "start": 5.5, "end": 6.5, "factor": 0.5},
            {"do": "freeze", "at": 6.0, "duration": 1.5, "bw": True},
        ])
        out, d, got = self.render(plan, "timeline")
        self.assertAlmostEqual(d["duration"], 11.5, places=2)
        self.assertAlmostEqual(got.duration, 11.5, delta=0.1)
        r, g, b = helpers.mean_color(out, 5.7, 0, 380, 540, 200)
        self.assertLess(max(r, g, b) - min(r, g, b), 12, "the freeze should be black and white")

    def test_extreme_speeds(self):
        plan = self.plan([{"do": "keep", "start": 2, "end": 4}, {"do": "speed", "start": 2, "end": 3, "factor": 0.25},
                          {"do": "speed", "start": 3, "end": 4, "factor": 4}])
        _, d, got = self.render(plan, "speeds")
        self.assertAlmostEqual(d["duration"], 4.25, places=2)
        self.assertAlmostEqual(got.duration, 4.25, delta=0.12)

    def test_overlays_and_sounds(self):
        ov = self.tmp / "ov"
        ov.mkdir(exist_ok=True)
        plan = self.plan([
            {"do": "text", "text": "EZ STEAL", "at": "start", "duration": 3, "position": "top"},
            {"do": "sticker", "emoji": "💀", "at": "end", "duration": 2, "position": "middle"},
            {"do": "sound", "name": "boom", "at": 6.0}, {"do": "sound", "name": "ding", "at": "end"},
        ])
        for item in P.overlays(plan):
            if item["spec"]["kind"] == "text":
                colored_png(ov / f"{item['key']}.png", "red", "600x100")
            else:
                colored_png(ov / f"{item['key']}.png", "0x00ff00", "300x300")
        out, d, _ = self.render(plan, "overlays", overlay_dir=ov)
        self.assertEqual(d["warnings"], [])
        r, g, b = helpers.mean_color(out, 1.0, 245, 150, 50, 20)
        self.assertTrue(r > 180 and g < 80, f"caption missing: {(r, g, b)}")
        r, g, b = helpers.mean_color(out, 12.5, 250, 460, 40, 40)
        self.assertTrue(g > 180 and r < 80, f"sticker missing: {(r, g, b)}")
        r, g, b = helpers.mean_color(out, 5.0, 250, 460, 40, 40)
        self.assertFalse(g > 180 and r < 80, "sticker showed too early")
        self.assertGreater(sfx.check_level(out), -8)

    def test_missing_overlay_is_skipped_with_warning(self):
        plan = self.plan([{"do": "sticker", "emoji": "🔥", "at": 2}])
        _, d, _ = self.render(plan, "missing", overlay_dir=self.tmp / "nothing-here")
        self.assertEqual(len(d["warnings"]), 1)

    def test_zoom_shake_flash_color(self):
        plan = self.plan([{"do": "zoom", "at": t, "amount": 1.3 + (t % 3) / 10} for t in range(1, 13)]
                         + [{"do": "shake", "at": 4}, {"do": "flash", "at": 5}, {"do": "color", "style": "retro"}])
        out, _, got = self.render(plan, "effects")
        self.assertAlmostEqual(got.duration, 13.0, delta=0.1)
        self.assertGreater(sum(helpers.mean_color(out, 5.03, 0, 380, 540, 200)), 600, "flash should be bright")

    def test_no_audio_clip(self):
        silent = helpers.make_test_clip(with_audio=False)
        info = ff.probe(silent)
        self.assertFalse(info.has_audio)
        plan = self.plan([{"do": "freeze", "at": 3, "duration": 1}, {"do": "sound", "name": "pop", "at": 3}], info)
        _, d, got = self.render(plan, "silent", clip=silent, info=info)
        self.assertTrue(got.has_audio)
        self.assertAlmostEqual(got.duration, 14.0, delta=0.1)

    def test_portrait_clip(self):
        tall = helpers.make_test_clip(width=360, height=640)
        info = ff.probe(tall)
        out, _, got = self.render(P.new_plan(), "portrait", clip=tall, info=info, quality="export")
        self.assertEqual((got.width, got.height), (1080, 1920))

    def test_user_sounds_and_music(self):
        sounds = config.my_sounds_dir()
        music = config.my_music_dir()
        ff.run(["-f", "lavfi", "-i", "sine=f=300:d=1", str(sounds / "Vine Boom.wav")])
        ff.run(["-f", "lavfi", "-i", "sine=f=500:d=3", str(music / "My Song.mp3")])
        self.assertIn("vine_boom", sfx.catalog())
        plan = self.plan([{"do": "sound", "name": "vine boom", "at": 2}, {"do": "music", "name": "my song"}])
        _, d, got = self.render(plan, "usersounds")
        self.assertEqual(d["warnings"], [])
        self.assertAlmostEqual(got.duration, 13.0, delta=0.1)

    def test_encoder_args_fall_back(self):
        saved = ff._encoders
        try:
            ff._encoders = {"h264_mf", "aac"}
            self.assertEqual(ff.h264_args("export")[:2], ["-c:v", "h264_mf"])
            ff._encoders = {"aac"}
            self.assertEqual(ff.h264_args("preview")[:2], ["-c:v", "mpeg4"])
        finally:
            ff._encoders = saved


if __name__ == "__main__":
    unittest.main()
