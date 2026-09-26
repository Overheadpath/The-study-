#!/usr/bin/env python3
"""
Blackjack Result Analyzer
=========================

Keeps a running history of your blackjack rounds (WIN or LOSS), and after
every result studies the sequence and makes a next-round guess.

The guess is a statistical experiment, not a forecast. Blackjack rounds are
close to independent, so most of the time the honest answer is
"NO CLEAR PREDICTION". A WIN/LOSS guess only appears when a pattern in YOUR
data passes a significance test. This program never gives betting advice.

Run it:
    python blackjack_analyzer.py

Then type:
    WIN  (or W)      record a win
    LOSS (or L)      record a loss
    SHOT             pick a screenshot to read (or paste / drag an image path)
    UNDO             remove the last round
    HISTORY          show every round, prediction vs actual
    RESET            clear everything
    HELP             show the commands
    QUIT             exit (your history is saved automatically)

Screenshots are optional and need:
    pip install pillow pytesseract
plus the free Tesseract OCR program (https://github.com/tesseract-ocr/tesseract).
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
import textwrap
from dataclasses import dataclass, field
from pathlib import Path

WIN, LOSS, PUSH = "WIN", "LOSS", "PUSH"
NONE = "NO CLEAR PREDICTION"

WINDOWS = (5, 10, 20, 50)
MIN_ROUNDS = 20  # below this no pattern test is run at all
MIN_GROUP = 10   # each side of a comparison needs at least this many rounds

# Three patterns are tested each round, so the usual p-value cut-offs are
# split three ways (Bonferroni). These are the matching two-sided z-scores
# for p < 0.05, 0.01 and 0.001.
Z_SIGNIFICANT = 2.394
Z_MEDIUM = 2.935
Z_HIGH = 3.588

IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".tif", ".tiff"}
DEFAULT_HISTORY = Path(__file__).with_name("blackjack_history.json")


# --------------------------------------------------------------------------
# Statistics
# --------------------------------------------------------------------------

@dataclass
class Signal:
    name: str         # what was tested, e.g. "after a LOSS"
    z: float
    p: float
    prediction: str   # WIN, LOSS or NONE (no direction)
    rate: float       # estimated chance of `prediction` happening
    detail: str       # one sentence describing the evidence

    @property
    def significant(self) -> bool:
        return self.prediction != NONE and abs(self.z) >= Z_SIGNIFICANT


@dataclass
class Analysis:
    rounds: int
    prediction: str
    confidence: str
    recent_record: str
    streak: str
    reasoning: list[str]
    windows: list[str]
    signals: list[Signal] = field(default_factory=list)


def two_sided_p(z: float) -> float:
    return math.erfc(abs(z) / math.sqrt(2))


def fmt_p(p: float) -> str:
    return "p<0.001" if p < 0.001 else f"p={p:.3f}"


def plural(count: int, word: str) -> str:
    if count == 1:
        return f"1 {word}"
    return f"{count} {'losses' if word == 'loss' else word + 's'}"


def tally(results: list[str]) -> tuple[int, int]:
    wins = sum(1 for r in results if r == WIN)
    return wins, len(results) - wins


def current_streak(results: list[str]) -> tuple[str | None, int]:
    if not results:
        return None, 0
    last = results[-1]
    length = 0
    for r in reversed(results):
        if r != last:
            break
        length += 1
    return last, length


def two_proportion_z(k1: int, m1: int, k2: int, m2: int) -> float:
    pooled = (k1 + k2) / (m1 + m2)
    se = math.sqrt(pooled * (1 - pooled) * (1 / m1 + 1 / m2))
    return 0.0 if se == 0 else (k1 / m1 - k2 / m2) / se


def overall_signal(results: list[str]) -> Signal | None:
    """Is the win rate itself far from a 50/50 split?"""
    n = len(results)
    if n < MIN_ROUNDS:
        return None
    wins, losses = tally(results)
    z = (wins - n / 2) / math.sqrt(n / 4)
    if wins == losses:
        prediction, rate = NONE, 0.5
    else:
        prediction = WIN if wins > losses else LOSS
        rate = max(wins, losses) / n
    detail = (f"Overall you won {wins} of {n} rounds ({wins / n:.0%}), "
              f"compared with the 50% a coin-flip split would give.")
    return Signal("overall win rate", z, two_sided_p(z), prediction, rate, detail)


def pattern_signal(results: list[str], length: int) -> Signal | None:
    """Does what happened next differ after the same last `length` results?"""
    n = len(results)
    if n < MIN_ROUNDS or n <= length:
        return None
    pattern = tuple(results[-length:])
    k_same = m_same = k_other = m_other = 0
    for i in range(length, n):
        won = results[i] == WIN
        if tuple(results[i - length:i]) == pattern:
            m_same += 1
            k_same += won
        else:
            m_other += 1
            k_other += won
    if m_same < MIN_GROUP or m_other < MIN_GROUP:
        return None

    z = two_proportion_z(k_same, m_same, k_other, m_other)
    rate_same = k_same / m_same
    if rate_same > 0.5:
        prediction, rate = WIN, rate_same
    elif rate_same < 0.5:
        prediction, rate = LOSS, 1 - rate_same
    else:
        prediction, rate = NONE, 0.5

    label = "a " + pattern[0] if length == 1 else " -> ".join(pattern)
    other = "otherwise" if length == 1 else "after other sequences"
    detail = (f"After {label} you won {k_same} of {m_same} "
              f"({rate_same:.0%}), versus {k_other / m_other:.0%} {other}.")
    return Signal(f"after {label}", z, two_sided_p(z), prediction, rate, detail)


def confidence_for(signal: Signal, rounds: int) -> str:
    # Needs both strong evidence AND a big enough edge to be worth the name.
    z = abs(signal.z)
    if z >= Z_HIGH and rounds >= 50 and signal.rate >= 0.70:
        return "HIGH"
    if z >= Z_MEDIUM and signal.rate >= 0.60:
        return "MEDIUM"
    return "LOW"


def sample_note(n: int) -> str:
    if n == 0:
        return "No rounds recorded yet. Enter WIN or LOSS after each round."
    if n < MIN_ROUNDS:
        return (f"Only {plural(n, 'round')} recorded - not enough for a meaningful "
                f"analysis. Pattern tests start at {MIN_ROUNDS} rounds, and "
                f"even then only very strong patterns can show up.")
    if n < 100:
        return (f"{n} rounds is still a small sample; only strong patterns "
                f"can be told apart from luck.")
    return f"{n} rounds is a reasonable sample, but luck still causes swings."


def recent_vs_longterm(results: list[str]) -> str | None:
    n = len(results)
    if n < MIN_ROUNDS:
        return None
    recent = 20 if n >= 60 else 10
    k_recent, _ = tally(results[-recent:])
    k_before, _ = tally(results[:-recent])
    before = n - recent
    z = two_proportion_z(k_recent, recent, k_before, before)
    text = (f"Last {recent}: {k_recent / recent:.0%} wins, versus "
            f"{k_before / before:.0%} over the {before} rounds before")
    if abs(z) >= 1.96:
        direction = "higher" if z > 0 else "lower"
        return (f"{text} - unusually {direction} than your longer-term results "
                f"({fmt_p(two_sided_p(z))}), though swings like this do happen by chance.")
    return f"{text} - in line with your longer-term results."


def analyze(results: list[str]) -> Analysis:
    n = len(results)
    wins, losses = tally(results)

    last10 = results[-10:]
    w10, l10 = tally(last10)
    if n == 0:
        recent_record = "No rounds yet."
    elif n < 10:
        recent_record = (f"{plural(w10, 'win')} and {plural(l10, 'loss')} "
                         f"over all {plural(n, 'round')} so far.")
    else:
        recent_record = f"{plural(w10, 'win')} and {plural(l10, 'loss')} over the last 10 rounds."

    kind, length = current_streak(results)
    if kind is None:
        streak = "None yet."
    elif length == 1:
        streak = f"No streak - last round was a {kind}."
    else:
        streak = f"{length} consecutive {'wins' if kind == WIN else 'losses'}."

    windows = []
    for size in WINDOWS:
        if n >= size:
            w, l = tally(results[-size:])
            windows.append(f"Last {size:<4} {w:>3}W {l:>3}L   {w / size:>4.0%} wins")
        else:
            windows.append(f"Last {size:<4} need {size - n} more round(s)")
    if n:
        windows.append(f"All {n:<5} {wins:>3}W {losses:>3}L   {wins / n:>4.0%} wins")

    signals = [s for s in (overall_signal(results),
                           pattern_signal(results, 1),
                           pattern_signal(results, 2)) if s]
    usable = [s for s in signals if s.significant]
    best = max(usable, key=lambda s: abs(s.z)) if usable else None

    reasoning = []
    if n:
        reasoning.append(f"The last round was a {results[-1]}. "
                         f"Overall record: {wins}W-{losses}L ({wins / n:.0%} wins).")
    comparison = recent_vs_longterm(results)
    if comparison:
        reasoning.append(comparison)

    if best:
        prediction = best.prediction
        confidence = confidence_for(best, n)
        reasoning.append(f"{best.detail} This passed the significance test "
                         f"({fmt_p(best.p)}), so the guess follows it.")
        if confidence == "LOW":
            reasoning.append("The edge is small, so the guess is still close to a coin flip.")
    else:
        prediction, confidence = NONE, "LOW"
        if signals:
            strongest = max(signals, key=lambda s: abs(s.z))
            reasoning.append(f"No pattern passed the significance test. Strongest one checked: "
                             f"{strongest.detail} ({fmt_p(strongest.p)}, likely just luck).")

    reasoning.append(sample_note(n))
    reasoning.append("Each round is close to independent: a streak does not make the "
                     "next result any more likely to change (or to continue).")

    return Analysis(n, prediction, confidence, recent_record, streak,
                    reasoning, windows, signals)


# --------------------------------------------------------------------------
# Screenshots (optional OCR)
# --------------------------------------------------------------------------

class OcrUnavailable(Exception):
    pass


# Order matters: the dealer phrases must be tried before the plain words.
_RESULT_RE = re.compile(
    r"""
      (?P<dealer_bust>\bdealer\s*(?:bust|busts|busted)\b)
    | (?P<dealer_win>\bdealer\s*(?:wins?|won|has\s*blackjack|blackjack)\b)
    | (?P<counter>\b(?:wins|losses)\s*:?\s*\d)          # "Wins: 12" style counters
    | (?P<loss>\b(?:you\s*)?(?:bust|busts|busted|lose|loses|lost|loss|losses)\b)
    | (?P<push>\b(?:push|tie|draw)\b)
    | (?P<win>\b(?:you\s*)?(?:win|wins|won|winner)\b
              |\b(?:you\s*(?:got|have|hit)?|player)\s*blackjack\b
              |\bblackjack\s*!)
    """,
    re.IGNORECASE | re.VERBOSE,
)
_OUTCOME = {"dealer_bust": WIN, "dealer_win": LOSS, "loss": LOSS, "push": PUSH, "win": WIN}


def parse_results(text: str) -> list[tuple[str, str]]:
    """Find WIN/LOSS/PUSH words in OCR text, in reading order."""
    found = []
    for match in _RESULT_RE.finditer(text):
        outcome = _OUTCOME.get(match.lastgroup)
        if outcome:
            found.append((outcome, " ".join(match.group().split())))
    # On a single-round screen a phrase like "YOU WIN" is the real verdict; a
    # bare "BUST" next to it is usually describing the dealer's hand.
    explicit = [f for f in found if re.match(r"(you|dealer|player)\b|blackjack", f[1], re.I)]
    return explicit or found


def read_screenshot(path: Path) -> tuple[list[tuple[str, str]], str]:
    try:
        from PIL import Image, ImageOps
        import pytesseract
    except ImportError as exc:
        raise OcrUnavailable(
            "Screenshot reading needs:  pip install pillow pytesseract\n"
            "plus the Tesseract OCR program: https://github.com/tesseract-ocr/tesseract"
        ) from exc

    image = ImageOps.grayscale(Image.open(path))
    if image.width < 1200:  # small text reads much better upscaled
        scale = 1200 / image.width
        image = image.resize((1200, int(image.height * scale)))

    best_found, best_text = [], ""
    # Games often use light text on dark backgrounds, so also try inverted.
    for candidate in (image, ImageOps.invert(image)):
        try:
            text = pytesseract.image_to_string(candidate)
        except pytesseract.TesseractNotFoundError as exc:
            raise OcrUnavailable(
                "The Tesseract OCR program is not installed or not on PATH.\n"
                "Get it from https://github.com/tesseract-ocr/tesseract"
            ) from exc
        found = parse_results(text)
        if len(found) > len(best_found) or not best_text:
            best_found, best_text = found, text
    return best_found, best_text


def image_path_from(text: str) -> Path | None:
    """Accept a pasted or drag-and-dropped image path."""
    cleaned = text.strip().strip("'\"")
    for candidate in (cleaned, cleaned.replace("\\ ", " ")):
        path = Path(candidate).expanduser()
        if path.suffix.lower() in IMAGE_TYPES and path.is_file():
            return path
    return None


def pick_file() -> Path | None:
    try:
        import tkinter
        from tkinter import filedialog
        root = tkinter.Tk()
        root.withdraw()
        root.attributes("-topmost", True)
        chosen = filedialog.askopenfilename(
            title="Choose a blackjack screenshot",
            filetypes=[("Images", " ".join("*" + t for t in sorted(IMAGE_TYPES)))],
        )
        root.destroy()
        return Path(chosen) if chosen else None
    except Exception:
        return None


# --------------------------------------------------------------------------
# App
# --------------------------------------------------------------------------

class Color:
    enabled = sys.stdout.isatty() and os.environ.get("NO_COLOR") is None

    @classmethod
    def wrap(cls, text: str, code: str) -> str:
        return f"\033[{code}m{text}\033[0m" if cls.enabled else text

    @classmethod
    def outcome(cls, text: str) -> str:
        if text.startswith(WIN):
            return cls.wrap(text, "32;1")
        if text.startswith(LOSS):
            return cls.wrap(text, "31;1")
        return cls.wrap(text, "33")


class Tracker:
    def __init__(self, path: Path):
        self.path = path
        self.rounds: list[dict] = []
        self.load()

    @property
    def results(self) -> list[str]:
        return [r["result"] for r in self.rounds]

    def load(self) -> None:
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
            self.rounds = [r for r in data.get("rounds", []) if r.get("result") in (WIN, LOSS)]
        except FileNotFoundError:
            self.rounds = []
        except (OSError, ValueError) as exc:
            print(f"Could not read {self.path} ({exc}); starting with an empty history.")
            self.rounds = []

    def save(self) -> None:
        try:
            self.path.write_text(json.dumps({"rounds": self.rounds}, indent=1), encoding="utf-8")
        except OSError as exc:
            print(f"Warning: could not save history to {self.path}: {exc}")

    def add(self, result: str) -> None:
        # Store the guess that was on screen BEFORE this result was known.
        before = analyze(self.results)
        self.rounds.append({"result": result, "prediction": before.prediction,
                            "confidence": before.confidence})
        self.save()

    def undo(self) -> dict | None:
        if not self.rounds:
            return None
        removed = self.rounds.pop()
        self.save()
        return removed

    def reset(self) -> None:
        self.rounds = []
        self.save()

    def scorecard(self) -> str:
        made = [r for r in self.rounds if r["prediction"] in (WIN, LOSS)]
        if not made:
            return "Prediction scorecard: no WIN/LOSS guesses made yet."
        hits = sum(1 for r in made if r["prediction"] == r["result"])
        return (f"Prediction scorecard: {hits} of {len(made)} guesses correct "
                f"({hits / len(made):.0%}). A coin flip would average about 50%.")


def format_history(tracker: Tracker, limit: int | None = 15) -> str:
    rounds = tracker.rounds
    if not rounds:
        return "HISTORY: empty"
    start = 0 if limit is None else max(0, len(rounds) - limit)
    title = "all rounds" if start == 0 else f"last {len(rounds) - start} of {len(rounds)} rounds"
    lines = [f"HISTORY - prediction vs actual ({title})",
             f"  {'#':>4}  {'ACTUAL':<6}  {'PREDICTED':<24}  RESULT"]
    for i in range(start, len(rounds)):
        r = rounds[i]
        if r["prediction"] in (WIN, LOSS):
            guess = f"{r['prediction']} ({r['confidence']})"
            verdict = "HIT" if r["prediction"] == r["result"] else "MISS"
        else:
            guess, verdict = "no clear prediction", "-"
        actual = Color.outcome(r["result"].ljust(6))
        lines.append(f"  {i + 1:>4}  {actual}  {guess:<24}  {verdict}")
    lines.append("  Sequence (oldest -> newest): " +
                 " ".join("W" if r == WIN else "L" for r in tracker.results[start:]))
    lines.append("  " + tracker.scorecard())
    return "\n".join(lines)


def format_analysis(a: Analysis) -> str:
    bar = "=" * 60
    wrap = lambda s: textwrap.fill(s, 76, initial_indent="  - ", subsequent_indent="    ")
    lines = [
        bar,
        f" ANALYSIS AFTER {plural(a.rounds, 'ROUND').upper()}",
        bar,
        "NEXT-ROUND PREDICTION:",
        "  " + Color.outcome(a.prediction),
        "CONFIDENCE:",
        "  " + a.confidence,
        "RECENT RECORD:",
        "  " + a.recent_record,
        "STREAK:",
        "  " + a.streak,
        "REASONING:",
        *(wrap(line) for line in a.reasoning),
        "BY SAMPLE SIZE:",
        *("  " + w for w in a.windows),
    ]
    return "\n".join(lines)


HELP = """\
Type WIN (or W) or LOSS (or L) after each round.
Other commands:
  SHOT     read a screenshot (opens a file picker) - you can also just paste
           or drag an image file's path in here
  UNDO     remove the last round          HISTORY  show every round
  RESET    clear the whole history        HELP     show this
  QUIT     exit (history is saved automatically)
Reminder: this is a statistical experiment, not a forecast, and it gives no
advice about whether or how much to bet."""


def show(tracker: Tracker) -> None:
    print()
    print(format_analysis(analyze(tracker.results)))
    print("-" * 60)
    print(format_history(tracker))
    print()


def handle_screenshot(tracker: Tracker, path: Path) -> None:
    print(f"Reading {path.name} ...")
    try:
        found, text = read_screenshot(path)
    except OcrUnavailable as exc:
        print(exc)
        return
    except OSError as exc:
        print(f"Could not open that image: {exc}")
        return

    pushes = [f for f in found if f[0] == PUSH]
    found = [f for f in found if f[0] != PUSH]
    if pushes and not found:
        print("The screenshot looks like a PUSH (tie). Pushes are not counted - nothing added.")
        return
    if not found:
        snippet = " ".join(text.split())[:120]
        print("Could not find a WIN or LOSS in that screenshot.")
        if snippet:
            print(f"Text it read: {snippet!r}")
        print("Type WIN or LOSS to enter the result yourself.")
        return

    outcomes = [o for o, _ in found]
    words = ", ".join(f"{o} ('{w}')" for o, w in found)
    print(f"Found (top to bottom): {words}")

    if len(set(outcomes)) == 1:
        extra = f", [a] add all {len(found)} as separate rounds" if len(found) > 1 else ""
        answer = ask(f"Add one {outcomes[0]}? [Enter/y] yes{extra}, [n] no: ")
        if answer in ("", "y", "yes"):
            to_add = outcomes[:1]
        elif answer == "a" and len(found) > 1:
            to_add = outcomes
        else:
            print("Nothing added.")
            return
    else:
        answer = ask("[a] add all in this order, [r] add in reverse order (if the newest "
                     "is at the top),\nor type WIN / LOSS to add just one, [n] no: ")
        if answer == "a":
            to_add = outcomes
        elif answer == "r":
            to_add = outcomes[::-1]
        elif answer in ("w", "win"):
            to_add = [WIN]
        elif answer in ("l", "loss", "lose"):
            to_add = [LOSS]
        else:
            print("Nothing added.")
            return

    for outcome in to_add:
        tracker.add(outcome)
    print(f"Added: {' '.join(to_add)}")
    show(tracker)


def ask(prompt: str) -> str:
    try:
        return input(prompt).strip().lower()
    except EOFError:
        return "n"


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Blackjack result analyzer (WIN/LOSS history).")
    parser.add_argument("--file", type=Path, default=DEFAULT_HISTORY,
                        help=f"where to save the history (default: {DEFAULT_HISTORY.name} next to this script)")
    args = parser.parse_args(argv)

    if os.name == "nt":
        os.system("")  # turns on colour codes in the Windows console

    tracker = Tracker(args.file)
    print("BLACKJACK RESULT ANALYZER")
    print(HELP)
    if tracker.rounds:
        print(f"\nLoaded {plural(len(tracker.rounds), 'round')} from {tracker.path}.")
    show(tracker)

    while True:
        try:
            raw = input("Enter WIN or LOSS > ")
        except (EOFError, KeyboardInterrupt):
            print()
            break
        command = raw.strip().lower()
        if not command:
            continue

        if command in ("w", "win", "won"):
            tracker.add(WIN)
            show(tracker)
        elif command in ("l", "loss", "lose", "lost"):
            tracker.add(LOSS)
            show(tracker)
        elif command in ("q", "quit", "exit"):
            break
        elif command in ("u", "undo"):
            removed = tracker.undo()
            print("Nothing to undo." if removed is None else f"Removed the last round ({removed['result']}).")
            show(tracker)
        elif command in ("h", "history"):
            print(format_history(tracker, limit=None))
        elif command == "reset":
            if ask("Delete the whole history? Type YES to confirm: ") == "yes":
                tracker.reset()
                print("History cleared.")
                show(tracker)
            else:
                print("Kept your history.")
        elif command in ("help", "?"):
            print(HELP)
        elif command == "shot" or command.startswith("shot "):
            path = image_path_from(raw.strip()[4:]) if command != "shot" else pick_file()
            if path:
                handle_screenshot(tracker, path)
            else:
                print("No image chosen. You can also paste or drag the image file's path here.")
        elif (path := image_path_from(raw)) is not None:
            handle_screenshot(tracker, path)
        else:
            print("Please type WIN or LOSS (or HELP for other commands).")

    print(f"History saved to {tracker.path}. Bye!")


if __name__ == "__main__":
    main()
