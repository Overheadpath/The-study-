# Blackjack Strategy Lab

An educational blackjack trainer for learning **basic strategy** and the probability behind it. It runs entirely in the browser, uses **virtual practice chips only**, and has no real-money features.

> Basic strategy lowers the house edge over many hands. It cannot predict the next hand, and nothing in this app claims to. Every simulated round is dealt from a freshly shuffled shoe, just as RNG games are designed, so earlier results carry no information about the next round.

## What it does

| Area | What you get |
| --- | --- |
| **Practice** | Deal hands and play them with hit, stand, double, split, surrender and insurance decisions, using a fixed stake of 10 virtual chips. Each round shows (1) your cards, (2) the dealer up card, (3) the hand total, (4) the available actions, with the reason any action is unavailable, (5) the basic-strategy play, (6) the mathematical explanation, (7) the result after the dealer plays, and (8) your updated accuracy. Advice appears after you decide, or before in study mode, which is not scored. Deal modes: random, hard totals, soft totals, pairs, or **my mistakes** (drills the spots you get wrong most). |
| **Analyze a hand** | Tap or type a hand (for example `A 7 vs 9`), or upload, paste or drop a **screenshot** and confirm the detected cards. The result is split into four separate panels: **player hand analysis**, **dealer up-card analysis**, **basic-strategy play**, and **probabilities and expected value**. |
| **Strategy chart** | The full hard, soft and pairs chart for the selected rules. Select any cell to see why it says what it says. You can overlay your own mistakes and compare against another rule set (changed cells are highlighted). |
| **My stats** | Decision accuracy over time, by hand type and by correct play, the hands you most often get wrong, and the average cost of your mistakes. **Hand results** (luck) are kept separate from **decision accuracy** (skill). A "does the last result predict the next?" panel compares your win rate after wins and after losses. You can back up or restore your history. |
| **Learn** | What basic strategy is and is not, why past hands cannot predict the next one, a simulation of thousands of rounds (win rate after a win, after a loss and after a losing streak), dealer outcome tables by up card, how to read expected value, the principles behind the chart, and how each rule changes the house edge. |
| **Rules** | Decks (1, 2, 4, 6, 8), dealer hits or stands on soft 17, blackjack payout (3:2, 6:5, 1:1), double after split, late surrender, doubling restrictions, split limit, re-splitting aces, and insurance prompts. Each rule shows how many chart cells it changes and how it moves the house edge. Presets are included. |

### What it deliberately does not do

- No real money, deposits, purchases or cash-out. Practice chips are a scoreboard that refills automatically.
- No betting advice: there are no bet-sizing features, no wager recommendations and no instructions for placing bets. The stake is fixed.
- No prediction. There are no "hot/cold" indicators, streak-based hints or claims about the next hand. The app explains why RNG games make past outcomes useless for prediction, and it demonstrates this with the learner's own history and with simulation.
- No card counting. Each round uses a new shuffle.

## Running it

No build step and no runtime dependencies. Serve the folder over HTTP, because ES modules do not load from `file://`:

```bash
cd blackjack-trainer
npm start            # zero-dependency static server on http://localhost:8080
# or: npx serve .    # any static server works
```

The app stores settings and history in `localStorage` in your browser only.

## Tests

```bash
npm test             # 79 unit tests (node:test): engine, charts, rounds, stats, explanations
npm install          # once, for Playwright and esbuild
npm run test:browser # 17 end-to-end UI and screenshot-reader tests in headless Chromium
npm run build        # dist/blackjack-strategy-lab.html: the whole app in one file that opens without a server
```

## How the math works

All strategy and probability figures come from `src/engine/ev.js`, a **composition-dependent** probability engine:

- **Dealer outcomes** are computed exactly from the remaining shoe (visible cards removed) by recursing over every dealer drawing sequence, under S17 or H17. The engine reproduces the standard infinite-deck dealer table (for example, bust with a 6 up is 42.32% and with a 10 up is 21.21%) to four or more decimals.
- **Dealer blackjack check.** When the dealer shows an ace or a 10 and has checked for blackjack, decisions are conditioned on the hole card not completing blackjack. Because the player never sees the hole card, the engine treats it as drawn after the player's cards and weights outcomes by the "no blackjack" event. This is exact, not an approximation.
- **Expected values** of stand, hit (with optimal play afterwards), double, surrender and split are computed for the exact cards. Splits use the standard analyser approximation: each split hand is valued with both pair cards removed, and re-splits are counted through the expected number of hands.
- **Basic-strategy charts** (`scripts/build-charts.mjs` → `src/engine/charts-data.js`) use the standard total-dependent method. For every up card and every two-card hand, the engine computes each action's value. Values are averaged per chart cell, weighted by how often each two-card hand is dealt when the dealer does not have blackjack, and each cell stores the actions ranked from best to worst. The recommendation is the best action that the rules and the hand currently allow, which produces the usual "double, otherwise hit" style fallbacks.
- **Validation.** The unit tests check that the derived charts match the published 4-, 6- and 8-deck charts **cell for cell** for all 24 combinations of S17/H17, DAS/no-DAS and surrender/no-surrender, plus well-known single- and double-deck plays. The house-edge table matches published figures, for example 0.40% for 6 decks, S17, DAS, no surrender, and +0.20% for H17 and +1.36% for 6:5 blackjack.
- **Explanations** (`src/engine/explain.js`) turn those numbers into plain language: the principle behind the play, expected value per unit staked for each option, bust chances, the dealer's final-total distribution, and notes for fallbacks, close calls and composition effects (when the exact cards slightly favour a different play than the total-based chart). Every explanation carries the reminder that expected value is a long-run average and says nothing about how a single hand will turn out.

Regenerate the charts after changing the engine:

```bash
npm run build:charts   # about 40 seconds
npm test
```

## Screenshot reading

`src/vision/` reads cards from a screenshot on-device, and the image is never uploaded. The pipeline:

1. Finds the white card faces.
2. Extracts the ink printed on them.
3. Classifies rank and suit glyphs against templates rendered at run time in many font styles.
4. Accepts a rank as a card index when the matching suit symbol sits below it (or beside it on decks that print it that way). The upside-down corner indices and the centre pips are therefore not counted.
5. Groups the cards into hands: the dealer's at the top, yours below (split hands side by side). Stray cards, such as a hand-history strip, are left out.

The app draws each detection over the image and lets you change any rank or role before analyzing. Cards read with low confidence are flagged and come with the reader's next-best guesses. "Try a sample screenshot" renders a synthetic table to demonstrate the feature.

Measured by `tests/browser/vision.test.js` on synthetic tables in 8 visual styles (rank and hand assignment both correct):

| Condition | Cards | Read correctly | False detections |
| --- | --- | --- | --- |
| Clean screenshots | 474 | 100% | 0 |
| JPEG-compressed and rescaled 0.6x–1.5x | 455 | 100% | 0 |
| Suit printed beside the rank | 147 | 100% | 0 |
| No suit in the card corner | 148 | 99.3% | 0 |
| Table dimmed behind a pop-up dialog | 151 | 100% | 0 |

Rules text, strategy charts and on-screen buttons are not read as cards. A 1920x1080 screenshot takes well under a second in Chromium.

Limitations: screenshots of digital card faces only. Photos or live-dealer video of physical cards, dark card faces, strongly rotated cards and corners hidden under chips or pop-ups are not supported. Real screenshots vary more than synthetic ones, which is why every reading is shown for confirmation.

## Project structure

```
blackjack-trainer/
├── index.html              app entry point
├── server.mjs              zero-dependency static server (npm start)
├── scripts/build-charts.mjs  derives charts + house-edge table from the engine
├── src/engine/             pure, DOM-free logic (runs in Node and the browser)
│   ├── cards.js hand.js rules.js shoe.js
│   ├── ev.js               probability engine
│   ├── chart-builder.js    total-dependent chart derivation
│   ├── charts-data.js      generated charts + expected returns
│   ├── strategy.js         chart lookup, recommendations, rule effects
│   ├── explain.js          explanations of each decision
│   ├── round.js            practice round state machine
│   ├── stats.js storage.js drill.js simulate.js
├── src/vision/             screenshot card reader + sample table renderer
├── src/ui/                 views (practice, analyze, chart, stats, learn, rules) and styles
└── tests/                  unit tests (node:test) and browser tests (Playwright)
```
