import unittest

import helpers  # noqa: F401
from beanie_ai import commands as C
from beanie_ai import plan as P
from beanie_ai import sfx
from beanie_ai import skills

SOUNDS = list(sfx.BUILTIN) + ["vine_boom_2"]


def ctx(**extra):
    base = {"duration": 30.0, "markers": [], "sounds": SOUNDS, "highlight": None}
    base.update(extra)
    return base


def parse(text, **extra):
    return C.parse(text, ctx(**extra))


class CommandTest(unittest.TestCase):
    def check(self, text, expected, confident=True, **extra):
        got = parse(text, **extra)
        self.assertEqual(got.actions, expected, f"{text!r} -> {got}")
        self.assertEqual(got.confident, confident, f"{text!r} confidence")

    def test_format(self):
        self.check("make it vertical", [{"do": "format", "format": "vertical", "fit": "blur"}])
        self.check("tiktok size but crop it", [{"do": "format", "format": "vertical", "fit": "crop"}])
        self.check("square please", [{"do": "format", "format": "square"}])
        self.check("black bars", [{"do": "format", "fit": "bars"}])

    def test_ranges(self):
        self.check("trim from 3 to 12", [{"do": "keep", "start": 3.0, "end": 12.0}])
        self.check("keep 0:05-0:20", [{"do": "keep", "start": 5.0, "end": 20.0}])
        self.check("cut out 5 to 7", [{"do": "remove", "start": 5.0, "end": 7.0}])
        self.check("remove between 5 and 7 seconds", [{"do": "remove", "start": 5.0, "end": 7.0}])
        self.check("cut the first 3 seconds", [{"do": "keep", "start": 3.0, "end": "end"}])
        self.check("cut the last 2 seconds", [{"do": "keep", "start": "start", "end": 28.0}])
        self.check("start it at 4", [{"do": "keep", "start": 4.0, "end": "end"}])

    def test_effects(self):
        self.check("slow mo at 6", [{"do": "speed", "start": 5.4, "end": 6.6, "factor": 0.5}])
        self.check("slow motion from 5 to 7 at 0.25x", [{"do": "speed", "start": 5.0, "end": 7.0, "factor": 0.25}])
        self.check("speed up 1 to 4 3x", [{"do": "speed", "start": 1.0, "end": 4.0, "factor": 3.0}])
        self.check("freeze at 6 for 2 seconds black and white",
                   [{"do": "freeze", "at": 6.0, "duration": 2.0, "bw": True}])
        self.check("zoom in at 6", [{"do": "zoom", "at": 6.0, "duration": 1.2}])
        self.check("zoom 2x at 6 for 1.5s on the right",
                   [{"do": "zoom", "at": 6.0, "duration": 1.5, "amount": 2.0, "x": 0.8}])
        self.check("shake at 11.5", [{"do": "shake", "at": 11.5, "duration": 0.5}])
        self.check("flash at 6", [{"do": "flash", "at": 6.0}])
        self.check("make it black and white", [{"do": "color", "style": "bw"}])
        self.check("vibrant colors", [{"do": "color", "style": "vibrant"}])
        self.check("mute the game", [{"do": "volume", "value": 0}])

    def test_text_and_stickers(self):
        self.check('add text "EZ STEAL" at the top',
                   [{"do": "text", "text": "EZ STEAL", "at": "start", "position": "top"}])
        self.check('caption "wait, and then 💀" at 6 for 2s',
                   [{"do": "text", "text": "wait, and then 💀", "at": 6.0, "duration": 2.0}])
        self.check("add a skull at the end", [{"do": "sticker", "emoji": "💀", "at": "end"}])
        self.check("put 🔥 at 3 big", [{"do": "sticker", "emoji": "🔥", "at": 3.0, "size": "big"}])
        self.check("🗿🗿 at 4", [{"do": "sticker", "emoji": "🗿", "at": 4.0}, {"do": "sticker", "emoji": "🗿", "at": 4.0}])

    def test_sounds(self):
        self.check("boom at 6", [{"do": "sound", "name": "boom", "at": 6.0}])
        self.check("add a vine boom sound at 6", [{"do": "sound", "name": "boom", "at": 6.0}])
        self.check("sad trombone at the end", [{"do": "sound", "name": "fail_horn", "at": "end"}])
        self.check("play vine boom 2 at 3", [{"do": "sound", "name": "vine_boom_2", "at": 3.0}])

    def test_combined(self):
        got = parse("make it vertical, cut out 0 to 2 and add a skull at the end")
        self.assertEqual([a["do"] for a in got.actions], ["format", "remove", "sticker"])
        self.assertTrue(got.confident)

    def test_deleting(self):
        self.check("remove the zoom", [{"do": "delete", "what": "zoom"}])
        self.check("delete the zoom at 6", [{"do": "delete", "what": "zoom", "at": 6.0}])
        self.check("remove the skull", [{"do": "delete", "what": "sticker", "name": "💀"}])
        self.check("get rid of the boom", [{"do": "delete", "what": "sound", "name": "boom"}])
        self.check("no music", [{"do": "music", "name": "none"}])
        self.check("remove all effects", [{"do": "delete", "what": "effects"}])
        self.check("start over", [{"do": "clear"}])

    def test_skills(self):
        self.check("make a W edit at 6", [{"do": "apply_skill", "skill": "steal_w", "at": 6.0}])
        self.check("turn it into a fail edit", [{"do": "apply_skill", "skill": "fail_l"}])
        self.check("cut the boring loading part", [{"do": "apply_skill", "skill": "cut_boring"}])
        self.check("hype edit", [{"do": "apply_skill", "skill": "hype"}])

    def test_markers_and_here(self):
        marks = [{"t": 12.5, "label": "steal"}]
        self.check("zoom on the steal", [{"do": "zoom", "at": 12.5, "duration": 1.2}], markers=marks)
        self.check("skull here", [{"do": "sticker", "emoji": "💀", "at": 4.2}], now=4.2)
        # the moment isn't known yet: leave it to the AI instead of guessing
        self.check("zoom on the steal", [], confident=False)

    def test_undo_redo(self):
        got = parse("undo")
        self.assertEqual((got.special, got.confident), ("undo", True))
        self.assertEqual(parse("redo that").special, "redo")

    def test_left_for_the_ai(self):
        for text in ("what should I add?", "make it look cool", "make it funnier",
                     "can you add some effects", "the fire rate was bad lol", "zoom", "make it better and shorter"):
            got = parse(text)
            self.assertFalse(got.confident, f"{text!r} should go to the AI: {got}")
        self.assertEqual(parse("make it look cool").actions, [])
        self.assertEqual(parse("the fire rate was bad lol").actions, [])

    def test_every_parse_applies_cleanly(self):
        texts = ["make it vertical", "trim from 3 to 12", "cut out 5 to 7", "slow mo at 6", "freeze at 6 bw",
                 "zoom 2x at 6", 'add text "W" at the top', "add a skull at the end", "boom at 6",
                 "make a W edit at 6", "fail edit at 20", "suspense at 10", "hype edit", "cut the boring part",
                 "clean edit", "remove the zoom", "no music", "mute the game", "vibrant colors"]
        c = ctx(dead_start=1.0, dead_end=28.0, moments=[{"t": 12.0, "kind": "loud"}],
                expand_skill=lambda a, p, cc: skills.expand(a, p, cc), sounds=SOUNDS)
        plan = P.new_plan()
        for text in texts:
            got = C.parse(text, c)
            self.assertTrue(got.actions, text)
            plan, result = P.apply_actions(plan, got.actions, c)
            self.assertEqual([w for w in result.warnings if "no zoom" not in w and "There's no" not in w], [],
                             text)


class SkillTest(unittest.TestCase):
    def make(self, skill, at=None, **extra):
        c = ctx(dead_start=2.0, dead_end=27.0, sounds=list(sfx.BUILTIN),
                moments=[{"t": 8.0, "kind": "loud"}, {"t": 20.0, "kind": "still", "end": 23.0}], **extra)
        c["expand_skill"] = lambda a, p, cc: skills.expand(a, p, cc)
        act = {"do": "apply_skill", "skill": skill}
        if at is not None:
            act["at"] = at
        plan, result = P.apply_actions(P.new_plan(), [act], c)
        self.assertEqual(result.warnings, [])
        return plan, P.Timeline(plan, 30.0)

    def test_w_edit(self):
        plan, tl = self.make("steal_w", at=12)
        self.assertEqual(plan["keep"], {"start": 8.0, "end": 15.0})
        self.assertEqual(len(plan["speed"]), 1)
        self.assertEqual([s["name"] for s in plan["sound"]], ["whoosh", "boom", "victory"])
        self.assertGreater(tl.duration, 7.0)

    def test_fail_edit_ends_on_the_fail(self):
        plan, tl = self.make("fail_l", at=12)
        self.assertEqual(plan["keep"], {"start": 8.0, "end": 12.4})
        self.assertEqual(plan["sticker"][0]["emoji"], "💀")
        self.assertTrue(plan["freeze"][0]["bw"])
        self.assertAlmostEqual(tl.duration, 4.4 + 2.2, places=2)

    def test_skill_uses_marker_then_highlight(self):
        plan, _ = self.make("fail_l", markers=[{"t": 18.0, "label": "fail"}])
        self.assertEqual(plan["freeze"][0]["at"], 18.0)
        plan, _ = self.make("fail_l", highlight=9.0)
        self.assertEqual(plan["freeze"][0]["at"], 9.0)

    def test_switching_skills_replaces_effects(self):
        c = ctx(sounds=list(sfx.BUILTIN))
        c["expand_skill"] = lambda a, p, cc: skills.expand(a, p, cc)
        plan, _ = P.apply_actions(P.new_plan(), [{"do": "apply_skill", "skill": "steal_w", "at": 10}], c)
        plan, _ = P.apply_actions(plan, [{"do": "apply_skill", "skill": "fail_l", "at": 10}], c)
        self.assertEqual(len(plan["zoom"]), 1)
        self.assertEqual(plan["speed"], [])

    def test_cut_boring_and_clean(self):
        plan, _ = self.make("cut_boring")
        self.assertEqual(plan["keep"], {"start": 2.0, "end": 27.0})
        self.assertEqual(plan["remove"][0]["start"], 20.0)
        plan, _ = self.make("clean")
        self.assertEqual((plan["format"], plan["keep"]), ("vertical", {"start": 2.0, "end": 27.0}))

    def test_every_skill_renders_a_valid_timeline(self):
        for name in skills.SKILLS:
            plan, tl = self.make(name, at=10)
            self.assertGreater(tl.duration, 1.0, name)


if __name__ == "__main__":
    unittest.main()
