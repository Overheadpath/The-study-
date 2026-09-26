import random
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import blackjack_analyzer as bj  # noqa: E402

W, L = bj.WIN, bj.LOSS


class AnalyzeTests(unittest.TestCase):
    def test_empty_history(self):
        a = bj.analyze([])
        self.assertEqual(a.prediction, bj.NONE)
        self.assertEqual(a.confidence, "LOW")
        self.assertEqual(a.streak, "None yet.")

    def test_too_few_rounds_never_predicts(self):
        a = bj.analyze([W] * 19)
        self.assertEqual(a.prediction, bj.NONE)
        self.assertTrue(any("not enough" in r for r in a.reasoning))

    def test_recent_record_and_streak(self):
        results = [W, W, L, W, L, W, W, L, L, L, W, L, L, L]
        a = bj.analyze(results)
        self.assertEqual(a.recent_record, "3 wins and 7 losses over the last 10 rounds.")
        self.assertEqual(a.streak, "3 consecutive losses.")
        self.assertEqual(bj.analyze([W, L]).streak, "No streak - last round was a LOSS.")

    def test_windows(self):
        a = bj.analyze([W, L, W, W, L, L, W])
        self.assertIn("Last 5", a.windows[0])
        self.assertIn("3W", a.windows[0])
        self.assertIn("need 3 more", a.windows[1])
        self.assertIn("All 7", a.windows[-1])

    def test_one_sided_history_predicts_majority(self):
        a = bj.analyze([W] * 30)
        self.assertEqual(a.prediction, W)
        self.assertEqual(a.confidence, "MEDIUM")  # under 50 rounds can't be HIGH

    def test_alternating_pattern_is_found(self):
        results = [W, L] * 30  # ends on LOSS, and a LOSS is always followed by a WIN
        a = bj.analyze(results)
        self.assertEqual(a.prediction, W)
        self.assertEqual(a.confidence, "HIGH")
        a = bj.analyze(results + [W])
        self.assertEqual(a.prediction, L)

    def test_random_data_rarely_predicts(self):
        rng = random.Random(1234)
        false_alarms = 0
        trials = 300
        for _ in range(trials):
            results = [rng.choice((W, L)) for _ in range(100)]
            if bj.analyze(results).prediction != bj.NONE:
                false_alarms += 1
        self.assertLess(false_alarms / trials, 0.08)

    def test_small_edge_stays_low_confidence(self):
        rng = random.Random(7)
        results = [W if rng.random() < 0.56 else L for _ in range(3000)]
        a = bj.analyze(results)
        self.assertEqual(a.prediction, W)
        self.assertEqual(a.confidence, "LOW")

    def test_unusual_recent_run_is_flagged(self):
        results = [W, L] * 20 + [L] * 10
        a = bj.analyze(results)
        self.assertTrue(any("unusually lower" in r for r in a.reasoning))


class TrackerTests(unittest.TestCase):
    def test_stores_prediction_made_before_result(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "h.json"
            t = bj.Tracker(path)
            for r in [W, L] * 30:
                t.add(r)
            t.add(W)
            self.assertEqual(t.rounds[-1]["prediction"], W)
            self.assertIn("correct", t.scorecard())

            reloaded = bj.Tracker(path)
            self.assertEqual(reloaded.results, t.results)
            self.assertEqual(reloaded.undo()["result"], W)
            self.assertEqual(len(bj.Tracker(path).rounds), 60)


class ScreenshotTextTests(unittest.TestCase):
    def outcomes(self, text):
        return [o for o, _ in bj.parse_results(text)]

    def test_single_round_phrases(self):
        self.assertEqual(self.outcomes("YOU WIN! +250"), [W])
        self.assertEqual(self.outcomes("BUST"), [L])
        self.assertEqual(self.outcomes("You lose"), [L])
        self.assertEqual(self.outcomes("Dealer busts!"), [W])
        self.assertEqual(self.outcomes("Dealer wins"), [L])
        self.assertEqual(self.outcomes("Dealer has Blackjack"), [L])
        self.assertEqual(self.outcomes("BLACKJACK!"), [W])
        self.assertEqual(self.outcomes("PUSH"), [bj.PUSH])

    def test_explicit_phrase_beats_bare_word(self):
        self.assertEqual(self.outcomes("Dealer: 22 BUST!\nYou: 19\nYOU WIN! +100"), [W])

    def test_ignores_title_and_counters(self):
        self.assertEqual(self.outcomes("Blackjack Table  Wins: 12  Losses: 9"), [])

    def test_history_list_in_reading_order(self):
        self.assertEqual(self.outcomes("Round 1 WIN\nRound 2 LOSS\nRound 3 LOSS"), [W, L, L])


if __name__ == "__main__":
    unittest.main()
