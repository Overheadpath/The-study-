# Blackjack Result Analyzer (Python)

A simple terminal app that keeps a running WIN/LOSS history of your blackjack
rounds and, after every result, analyses the sequence and makes a next-round
guess. It can also read screenshots.

> This is a **statistical experiment, not a forecast**. Blackjack rounds are
> close to independent, so most of the time the honest answer is
> `NO CLEAR PREDICTION`. It never tells you whether or how much to bet.

## Run

```bash
python blackjack_analyzer.py
```

Needs Python 3.9+ and nothing else. Type after each round:

| Type | Does |
|------|------|
| `WIN` or `W` | record a win and show the new analysis |
| `LOSS` or `L` | record a loss and show the new analysis |
| `SHOT` | pick a screenshot to read (or paste / drag the image file into the window) |
| `UNDO` | remove the last round |
| `HISTORY` | every round: what was predicted vs what happened |
| `RESET` | clear everything |
| `QUIT` | exit (history is saved to `blackjack_history.json`) |

## What each analysis shows

```
NEXT-ROUND PREDICTION:   WIN / LOSS / NO CLEAR PREDICTION
CONFIDENCE:              LOW / MEDIUM / HIGH
RECENT RECORD:           e.g. 6 wins and 4 losses over the last 10 rounds.
STREAK:                  e.g. 3 consecutive losses.
REASONING:               short explanation of what your data shows
BY SAMPLE SIZE:          last 5 / 10 / 20 / 50 / all rounds
HISTORY:                 prediction vs actual + a hit-rate scorecard
```

## How the guess is made

- Nothing is tested until there are **20 rounds**; the app says when there is
  not enough data.
- Three patterns are checked: the overall win rate vs 50/50, what happens after
  your last result, and what happens after your last two results.
- A WIN/LOSS guess appears **only** if one of them passes a significance test
  (p < 0.05, split across the three tests so random data rarely triggers it).
- **Confidence** needs both strong evidence and a real edge: MEDIUM needs a
  ~60%+ rate, HIGH needs a ~70%+ rate over at least 50 rounds.
- It also flags when your recent results are unusually different from your
  longer-term results, and reminds you that streaks don't make a change "due".

## Screenshots (optional)

```bash
pip install pillow pytesseract
```

plus the free **Tesseract OCR** program
(Windows installer: https://github.com/UB-Mannheim/tesseract/wiki,
Mac: `brew install tesseract`, Linux: `apt install tesseract-ocr`).

It looks for words like *WIN, YOU WIN, BLACKJACK!, DEALER BUSTS* (win) and
*LOSS, LOSE, BUST, DEALER WINS* (loss); *PUSH/TIE* is ignored. It always shows
what it found and asks before adding. A screenshot of a results list can be
added all at once (in either order).

## Tests

```bash
python -m unittest discover -s tests
```
