# 🎡 Fortune Wheel — The Grand Game Show

A complete, responsive **Wheel of Fortune–style word-puzzle game**, built with vanilla HTML, CSS, and JavaScript. No build step, framework, CDN, assets, API keys, or external dependencies are required.

## Play locally

1. Download or clone the repository.
2. Double-click `index.html` to launch the game in any modern browser. Alternatively run `python -m http.server 8000` in this folder and visit `http://localhost:8000`.
3. Select **1–4 players**, **Easy / Medium / Hard**, and either **All categories** or an individual category.
4. Click **Start the Show** and spin!

## Rules

- The wheel has **14 equally probable segments**: 100, 200, 300, 400, 500, 600, 700, 800, 1000, 1500, **BANKRUPT**, **LOSE A TURN**, **FREE SPIN**, and **MYSTERY PRIZE**.
- After a cash spin, choose a **consonant** and press **Guess Letter** (or press Enter). Each matching occurrence earns the wheel's point value.
- After a mystery spin, a correct consonant earns a random **flat mystery amount** (1,000–2,500 points).
- Guessing incorrectly ends the turn; **BANKRUPT** resets only the current player's unbanked round score. **LOSE A TURN** forfeits the turn.
- Landing on **FREE SPIN** gives a token and lets you spin again. A token is **automatically redeemed** to rescue your next missed guess or lost turn; BANKRUPT cannot be rescued.
- On your turn, buy a vowel for **250 unbanked points**. The cost is charged per guess, whether correct or incorrect.
- You can **solve the whole puzzle any time on your turn**, even before spinning. A correct solution banks your accumulated round score into your total. Other players' unbanked round scores disappear at the next round. An incorrect solution forfeits your turn (unless a Free Spin token rescues it).
- Each wheel letter guess has **15 seconds**. The game has **five regular rounds**, then a **bonus round** for the highest-scoring player. Ties for entry are broken by player order; the final game reports ties.
- In the bonus, **R, S, T, L, N, E** appear automatically. Choose **three different consonants and one vowel**. Then you have **30 seconds** to solve and win a random **5,000–50,000 point** bonus prize.
- A solved puzzle with every letter revealed automatically ends the round.

## Included features

- Procedurally drawn glossy wheel with natural deceleration, tick effects, and a top pointer; the result is read from the **actual final wheel angle**.
- **240 original puzzles** (20 in each of 12 categories), optional hints, and difficulty-based selection without repeats in a game.
- Local multiplayer for 1–4 people, saved game progress (`localStorage`), accessible buttons, mobile layouts, keyboard and touch support.
- Sound effects synthesized with the **Web Audio API**, so no copyrighted audio assets or downloads are needed; sound can be disabled.
- Colored player cards, reveal animations, round progress, bonus prize and confetti celebrations.

### Keyboard controls

- `A`–`Z`: select a letter when letter selection is active
- `Enter`: submit a selected letter or a typed full solution
- `Space`: spin when the wheel is ready and the cursor is not inside an input
- `Escape`: close the solve-puzzle input

## Code organization

```text
index.html   – semantic game structure and controls
styles.css   – styling, responsive layout, animations
puzzles.js   – 240 puzzle definitions + difficulty mapping
game.js      – complete game engine, wheel physics, audio, scoring and state
```

## Deploy with GitHub Pages

From **Settings → Pages**, set **Build and deployment** to **Deploy from a branch**, select the `main` branch and `/(root)` directory, then save. The site can be served directly as a static website.

## Browser support

Recent Chrome, Firefox, Safari, and Edge. Audio begins after an allowed user interaction. Local storage and sound are optional browser features and failure will not prevent play.

This project is an independently created game-show homage and is not affiliated with any television network or trademark owner.