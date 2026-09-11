# Math Rush — Математический рывок

Fast, arcade-style mental-math trainer that runs as a static site. Pick a mode, solve against the clock, earn XP, and climb a knowledge map from addition to derivatives.

Live stack: single-file SPA (`outputs/math-rush.html`) + standalone pages + `progress.js` XP engine + Cloudflare Worker for clean routes. No backend, no build step. Progress lives in `localStorage`.

> UI is Russian-first, with full EN / FR / ES / DE translations.

## Features

- **40+ quiz modes**: addition / subtraction / multiplication / division, column arithmetic, parentheses & order of operations, fractions, percents, equations (1-step → 2-step → linear), new algebra block (powers, roots, polynomials, quadratics, systems, sequences), geometry (shapes → perimeter → area → angles → triangles → coordinates), olympiad logic.
- **Knowledge map board**: chalkboard-style board with three branches (Arithmetic / Algebra / Geometry), prerequisite threads, hover-to-highlight dependency network, mastery % per node, click-to-practice navigation.
- **Progression**: XP, levels, streaks, per-skill mastery (recency-weighted last 20 attempts), readiness %, locked → available → learning → mastered states.
- **Round rules**: practice / score / strict-input modes, per-card timer / bonus / streak-goal / task-limit / difficulty / answer-mode overrides, global settings sync.
- **Answer inputs**: keyboard, embedded touch keypad (readonly input to suppress OS keyboard), multiple-choice, comparison (`< > =`), parity (`even/odd`), column layout, handwriting placeholder (`HANDWRITING_ENABLED = false` until a recognition backend is wired).
- **Derivatives whiteboard**: separate `derivatives.html` + `derivatives.js` polynomial-derivative engine with canvas board (undo/redo, pointer events).
- **PWA-ish**: responsive, mobile-first, profile persists via `localStorage` + cookie fallback.

## Project structure

```
index.html                -> redirect to outputs/math-rush.html
outputs/
  math-rush.html          # main SPA: tasks + mapView + profileView + game
  math-map.html           # standalone knowledge-map page (same progress.js)
  profile.html / settings.html / derivatives.html
  progress.js             # skills graph, XP, mastery, readiness, storage
  derivatives.js          # polynomial derivative engine
  app-shell.css           # shared shell for standalone pages
tests/
  site-smoke.cjs          # HTML wiring + map + i18n assertions
  quiz-settings.cjs       # timers + 2000+ generated-problem checks
  progress.cjs            # XP / mastery state machine
  derivatives.cjs         # derivative engine + whiteboard checks
worker/
  src/index.js + wrangler.toml  # Cloudflare Worker: clean routes + /api/* stub
```

## Run locally

No dependencies. Any static server works:

```bash
# from repo root
npx serve .                 # then open /outputs/math-rush.html
# or
python3 -m http.server 8000 # then open /outputs/math-rush.html
```

Direct file open also works, except `fetch`/worker routes.

## Tests

Node only, no deps:

```bash
node tests/site-smoke.cjs
node tests/quiz-settings.cjs
node tests/progress.cjs
node tests/derivatives.cjs
```

## Deploy (Cloudflare)

```bash
cd worker
wrangler login
wrangler deploy
```

Routes: `/` `/quizzes` → `math-rush.html`, `/map` → `math-map.html`, `/profile`, `/settings`, `/derivatives`. `/api/check-handwriting` intentionally returns `503 RECOGNITION_NOT_CONFIGURED` until a provider + secret is configured — never put keys in `outputs/`.

## Knowledge map & skills

Defined in `outputs/progress.js` (`skills[]` + `modeToSkill`). Each skill: `id, title, category, prerequisites[], mode|href`.

- Arithmetic (12): addition → subtraction → multiplication → division → step-by-step chains → column +/− → column × → order of operations (×/÷ first) → parentheses → fractions → percentages
- Algebra (16): basics up top next to counting — expressions, powers, x+a=b, ax=b, x/a=b, roots, ax+b=c (same level as order of operations). Advanced only after order + parentheses: linear → sequences / systems / inequalities / functions → polynomials + linear-functions → quadratics → derivatives (whiteboard)
- Geometry (6): shapes → perimeter / angles → area / triangles / coordinates

Cross-branch deps are dashed purple in the UI (e.g. geometry `area` needs arithmetic `multiplication`; algebra `expressions` needs arithmetic `addition/subtraction`). Hovering a node dims the board and highlights its full upstream + downstream network.

To add a topic: add `skills[]` + `modeToSkill` in `progress.js`, a `mode-card[data-mode]` + `buildRawProblem` branch + `modeConfigs` + `languageData` (ru/en/fr/es/de) in `math-rush.html`, and a menu plan entry in `organizeMenu()`.

## i18n

`languageData` (modes, settings, feedback) + `interfaceText` (nav, map, profile) + `mapSkillText` (skill names) cover `ru en fr es de`. Map node subtitle = `modes[skill.mode][1] || mapSkillDescriptions[skill.id] || status`.

## Roadmap

- [ ] Handwriting recognition backend (`/api/check-handwriting`)
- [ ] More algebra: factoring, logarithms, trigonometry entry
- [ ] Geometry: Pythagorean theorem, volume
- [ ] Seed-shared daily challenge + shareable result cards
- [ ] Real PWA manifest / service worker

## License

MIT — fork it, break it, learn fast.
