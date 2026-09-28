import unittest

import helpers  # noqa: F401  (puts the app on sys.path)
from beanie_ai import plan as P

SOUNDS = ["boom", "whoosh", "vine_boom", "ding"]


def ctx(duration=13.0, **extra):
    base = {"duration": duration, "markers": [], "sounds": SOUNDS, "music": []}
    base.update(extra)
    return base


def apply(actions, plan=None, **extra):
    return P.apply_actions(plan or P.new_plan(), actions, ctx(**extra))


class ParseTimeTest(unittest.TestCase):
    def test_formats(self):
        c = ctx(duration=100, markers=[{"t": 42.0, "label": "steal"}], highlight=7.5)
        self.assertEqual(P.parse_time(12, c), 12.0)
        self.assertEqual(P.parse_time("12.5s", c), 12.5)
        self.assertEqual(P.parse_time("0:12", c), 12.0)
        self.assertEqual(P.parse_time("1:02.5", c), 62.5)
        self.assertEqual(P.parse_time("end", c), "end")
        self.assertEqual(P.parse_time("start", c), "start")
        self.assertEqual(P.parse_time("the steal", c), 42.0)
        self.assertEqual(P.parse_time(500, c), 100.0)
        self.assertIsNone(P.parse_time("banana", c))

    def test_highlight_used_when_no_markers(self):
        self.assertEqual(P.parse_time("best moment", ctx(highlight=6.0)), 6.0)

    def test_empty_marker_label_does_not_match_everything(self):
        c = ctx(markers=[{"t": 3.0, "label": ""}])
        self.assertIsNone(P.parse_time("banana", c))


class ActionsTest(unittest.TestCase):
    def test_keep_and_whole_clip(self):
        plan, r = apply([{"do": "keep", "start": 2, "end": 10}])
        self.assertEqual(plan["keep"], {"start": 2.0, "end": 10.0})
        plan, r = apply([{"do": "keep", "start": 0, "end": "end"}], plan)
        self.assertIsNone(plan["keep"])

    def test_remove_merges_overlaps(self):
        plan, _ = apply([{"do": "remove", "start": 3, "end": 5}, {"do": "remove", "start": 4, "end": 7}])
        self.assertEqual([(i["start"], i["end"]) for i in plan["remove"]], [(3.0, 7.0)])

    def test_speed_ranges_replace_overlaps(self):
        plan, _ = apply([{"do": "speed", "start": 5, "end": 7, "factor": 0.5},
                         {"do": "speed", "start": 6, "end": 8, "factor": 2}])
        got = [(i["start"], i["end"], i["factor"]) for i in plan["speed"]]
        self.assertEqual(got, [(5.0, 6.0, 0.5), (6.0, 8.0, 2.0)])

    def test_values_are_clamped(self):
        plan, _ = apply([{"do": "zoom", "at": 3, "amount": 50, "x": -2, "duration": 99}])
        z = plan["zoom"][0]
        self.assertEqual((z["amount"], z["x"], z["duration"]), (3.0, 0.0, 10.0))

    def test_bad_actions_warn_instead_of_crashing(self):
        plan, r = apply([{"do": "fly"}, {"do": "zoom", "at": "banana"}, "nonsense",
                         {"do": "text"}, {"do": "sound", "name": "airhorn", "at": 2}])
        self.assertEqual(plan["zoom"], [])
        self.assertTrue(len(r.warnings) >= 4, r.warnings)

    def test_start_and_end_times(self):
        plan, r = apply([{"do": "text", "text": "EZ", "at": "start"}, {"do": "sound", "name": "ding", "at": "end"},
                         {"do": "freeze", "at": "end"}, {"do": "sticker", "emoji": "💀"}])
        self.assertEqual(r.warnings, [])
        self.assertEqual((plan["text"][0]["at"], plan["sound"][0]["at"], plan["freeze"][0]["at"],
                          plan["sticker"][0]["at"]), ("start", "end", "end", "end"))
        self.assertTrue(all(isinstance(s["text"], str) for s in P.steps(plan)))

    def test_sound_names_match_loosely(self):
        plan, _ = apply([{"do": "sound", "name": "Vine Boom", "at": 2}])
        self.assertEqual(plan["sound"][0]["name"], "vine_boom")

    def test_limits(self):
        plan, r = apply([{"do": "zoom", "at": i} for i in range(13)])
        self.assertEqual(len(plan["zoom"]), 12)
        self.assertTrue(r.warnings)

    def test_format_aliases(self):
        plan, _ = apply([{"do": "format", "format": "tiktok", "fit": "zoom"}])
        self.assertEqual((plan["format"], plan["fit"]), ("vertical", "crop"))

    def test_delete(self):
        plan, _ = apply([{"do": "sticker", "emoji": "💀", "at": 2},
                         {"do": "sticker", "emoji": "🔥", "at": 9},
                         {"do": "zoom", "at": 4}])
        plan, _ = apply([{"do": "delete", "what": "emoji", "at": 8.5}], plan)
        self.assertEqual([s["emoji"] for s in plan["sticker"]], ["💀"])
        zoom_id = plan["zoom"][0]["id"]
        plan, _ = apply([{"do": "delete", "id": zoom_id}], plan)
        self.assertEqual(plan["zoom"], [])
        plan, _ = apply([{"do": "delete", "what": "stickers", "index": "last"}], plan)
        self.assertEqual(plan["sticker"], [])

    def test_clear_keeps_format(self):
        plan, _ = apply([{"do": "format", "format": "square"}, {"do": "zoom", "at": 1}, {"do": "clear"}])
        self.assertEqual(plan["format"], "square")
        self.assertEqual(plan["zoom"], [])

    def test_overlays_dedupe(self):
        plan, _ = apply([{"do": "sticker", "emoji": "💀", "at": 2}, {"do": "sticker", "emoji": "💀", "at": 5},
                         {"do": "text", "text": "EZ", "at": 1}])
        self.assertEqual(len(P.overlays(plan)), 2)


class TimelineTest(unittest.TestCase):
    def build(self):
        plan, r = apply([
            {"do": "keep", "start": 1.5, "end": 13},
            {"do": "remove", "start": 8, "end": 10.5},
            {"do": "speed", "start": 5.5, "end": 6.5, "factor": 0.5},
            {"do": "freeze", "at": 6.0, "duration": 1.5},
        ])
        self.assertEqual(r.warnings, [])
        return P.Timeline(plan, 13.0)

    def test_duration(self):
        self.assertAlmostEqual(self.build().duration, 11.5, places=3)

    def test_mapping(self):
        tl = self.build()
        self.assertAlmostEqual(tl.to_output(1.5), 0.0)
        self.assertAlmostEqual(tl.to_output(5.5), 4.0)
        self.assertAlmostEqual(tl.to_output(6.0), 5.0)   # the freeze starts here
        self.assertAlmostEqual(tl.to_output(6.5), 7.5)   # after 1.5 s freeze + 0.5 s slow-mo
        self.assertAlmostEqual(tl.to_output(9.0), 9.0)   # cut out: moves to 10.5
        self.assertTrue(tl.is_cut(9.0))
        self.assertAlmostEqual(tl.to_source(10.0), 11.5)
        self.assertAlmostEqual(tl.to_source(5.7), 6.0)   # inside the freeze

    def test_freeze_right_after_a_cut_starts_the_freeze(self):
        plan, _ = apply([{"do": "keep", "start": 3, "end": 13}, {"do": "freeze", "at": 3, "duration": 1}])
        tl = P.Timeline(plan, 13.0)
        self.assertEqual(tl.segments[0]["kind"], "freeze")
        self.assertAlmostEqual(tl.to_output(3.0), 0.0)
        self.assertAlmostEqual(tl.duration, 11.0)

    def test_freeze_at_end(self):
        plan, _ = apply([{"do": "freeze", "at": "end", "duration": 2}])
        tl = P.Timeline(plan, 13.0, fps=30)
        self.assertEqual(tl.segments[-1]["kind"], "freeze")
        self.assertAlmostEqual(tl.segments[-1]["src_at"], 13.0 - 1 / 30, places=4)
        self.assertAlmostEqual(tl.duration, 15.0)
        self.assertEqual(tl.place("end", 2), (13.0, 15.0))

    def test_freeze_inside_cut_moves(self):
        plan, _ = apply([{"do": "remove", "start": 4, "end": 6}, {"do": "freeze", "at": 5, "duration": 1}])
        tl = P.Timeline(plan, 13.0)
        self.assertEqual(tl.moved, [5.0])
        kinds = [s["kind"] for s in tl.segments]
        self.assertEqual(kinds, ["clip", "freeze", "clip"])
        self.assertAlmostEqual(tl.segments[1]["src_at"], 6.0)


if __name__ == "__main__":
    unittest.main()
