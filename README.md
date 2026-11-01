# Math Rush — Математический рывок

Maths practice, guided hints, and a human perspective. The platform connects student profiles, saved progress, tutor assignments, and written feedback with the existing arcade trainer and knowledge map.

The Cloudflare Worker provides the account API and D1 persistence. AI hints use an optional Workers AI binding; independently checked mathematical hints remain available when inference is unavailable. Guest practice works without registration. GitHub Pages serves a static mirror of the practice tools; account features require the Cloudflare origin.

## Tutoring platform

- Russian/English home page and student/tutor workspace.
- Username/passphrase accounts, one-time recovery codes, protected sessions, and account-scoped progress.
- Server-generated and checked fractions, equations, and percentage questions.
- Invitation-only tutor activation, classroom codes, assignments, and private written feedback.
- Opt-in public tutor cards, with no invented teachers or reviews.
- Explicit guest-progress import, offline account caches, and safe conflict recovery with device exports/backups.

See [platform operations](worker/PLATFORM.md) for database setup, tutor activation, API contracts, and current limitations. This is a practice and written-feedback platform; it does not provide video calls, payment processing, or a staffed tutoring service.

> UI is Russian-first, with full EN / FR / ES / DE translations.

## Features

- **40+ quiz modes**: addition / subtraction / multiplication / division, column arithmetic, parentheses & order of operations, fractions, percents, equations (1-step → 2-step → linear), new algebra block (powers, roots, polynomials, quadratics, systems, sequences), geometry (shapes → perimeter → area → angles → triangles → coordinates), olympiad logic.
- **Knowledge map board**: chalkboard-style board with three branches (Arithmetic / Algebra / Geometry), prerequisite threads, hover-to-highlight dependency network, mastery % per node, click-to-practice navigation.
- **Progression**: XP, levels, streaks, per-skill mastery (recency-weighted last 20 attempts), readiness %, locked → available → learning → mastered states.
- **Round rules**: practice / score / strict-input modes, per-card timer / bonus / streak-goal / task-limit / difficulty / answer-mode overrides, global settings sync.
- **Answer inputs**: keyboard, embedded touch keypad (readonly input to suppress OS keyboard), multiple-choice, comparison (`< > =`), parity (`even/odd`), column layout, handwriting placeholder (`HANDWRITING_ENABLED = false` until a recognition backend is wired).
- **Graded tests (no timers)**: 6 levels from Beginner to Pro with curated playlists across every topic. Each question ships with a scratch whiteboard (same zero-dependency canvas engine as the derivatives page: pen colors, eraser, undo/redo, clear). Best scores persist in `localStorage`, answers feed XP and the knowledge map.
- **Derivatives whiteboard**: separate `derivatives.html` + `derivatives.js` polynomial-derivative engine with canvas board (undo/redo, pointer events).
- **PWA-ish**: responsive, mobile-first, profile persists via `localStorage` + cookie fallback.

## Project structure

```
index.html                -> redirect to outputs/home.html
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

For the complete local platform (Node.js and the locked Wrangler dependency):

```bash
npm ci
npm run db:local
npm run dev
```

Open the printed local URL. Local configuration uses its own database; it does not contact the production database. To enable a local test tutor, set a test-only `TUTOR_INVITE_CODE` in the ignored `worker/.dev.vars` file.

The static practice archive can also run with any static server:

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
npm test
npm run check:worker
```

## Deploy (Cloudflare)

```bash
cd worker
wrangler login
wrangler deploy
```

Routes: `/` → `home.html`; `/workspace`, `/learn`, `/dashboard`, `/tutors` → `workspace.html`; `/quizzes` → `math-rush.html`; `/map` → `math-map.html`; plus `/profile`, `/settings`, `/derivatives`, and `/runner`. `/api/check-handwriting` returns `503 RECOGNITION_NOT_CONFIGURED` until a recognition provider is configured. Never put API keys in browser assets.

## Knowledge map & skills

Defined in `outputs/progress.js` (`skills[]` + `modeToSkill`). Each skill: `id, title, category, prerequisites[], mode|href`.

- Arithmetic (13): addition → subtraction → multiplication → division → step-by-step chains → column +/− → column × → order of operations (×/÷ first) → parentheses → fractions → percentages → negative numbers. Addition/subtraction practice never uses zero; addition-to-20 uses numbers 1–9 with sums of 10–18.
- Algebra (16): prep for equations sits at the very top (no prerequisites). Basics next to counting — x+a=b, powers, ax=b, x/a=b, roots. Order of operations links to everything from ax+b=c down: linear → sequences / systems / inequalities / functions → polynomials + linear-functions → quadratics → derivatives (whiteboard)
- Geometry (6): shapes → perimeter / angles → area / triangles / coordinates

Cross-branch deps are dashed purple in the UI (e.g. geometry `area` needs arithmetic `multiplication`; advanced algebra needs `order-of-operations` + `parentheses`). Hovering a node dims the board and highlights its full upstream + downstream network.

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
