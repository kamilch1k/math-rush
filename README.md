# Math Rush — Математический рывок

An open-source maths-training application for learners, teachers, and anyone who wants to build better practice tools. All application source is available under the [MIT License](LICENSE): run it, study how it works, change it, and share your improvements.

[Source on GitHub](https://github.com/kamilch1k/math-rush) · [Report an issue or suggest a trainer](https://github.com/kamilch1k/math-rush/issues) · [Third-party notices](THIRD_PARTY_NOTICES.md)

Math Rush combines the existing arcade trainer and knowledge map with optional student profiles, saved progress, tutor assignments, guided hints, and written feedback. There is no account requirement for the static practice tools.

The existing practice screen remains the primary entry point. `home.html` is an optional overview of the tutoring platform.

You can self-host the static trainers on any static web host, including GitHub Pages. The included account backend targets Cloudflare Workers and D1; using a different backend requires an adapter. Cloudflare is an optional hosting choice for the project, and optional AI hints use a Workers AI binding. Independently checked mathematical hints remain available when inference is unavailable. Hosting providers and AI models retain their own terms; the MIT license covers the Math Rush application source. Existing legacy pages load Cloudflare Web Analytics, which self-hosters may remove; see [third-party notices](THIRD_PARTY_NOTICES.md) for external requests and asset provenance.

The deployment configuration selects `@cf/meta/llama-3.2-3b-instruct` for brief hint rephrasing. Cloudflare currently lists this model with the existing `messages`/`max_tokens` input and `response` output contract. See the [model reference](https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/) and [current usage pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/); availability and pricing should be checked again before deployment.

The optional Llama integration is **Built with Llama**. Model weights are not included; Meta's separate model license is linked in [third-party notices](THIRD_PARTY_NOTICES.md).

## Tutoring platform

- Russian/English home page and student/tutor workspace.
- Username/passphrase accounts, one-time recovery codes, protected sessions, and account-scoped progress.
- Server-generated and checked fractions, equations, and percentage questions.
- Invitation-only tutor activation, classroom codes, assignments, and private written feedback.
- Opt-in public tutor cards, with no invented teachers or reviews.
- Explicit guest-progress import, offline account caches, and safe conflict recovery with device exports/backups.

See [platform operations](worker/PLATFORM.md) for database setup, tutor activation, API contracts, and current limitations. This is a practice and written-feedback platform; it does not provide video calls, payment processing, or a staffed tutoring service.

After sign-in, the protected session cookie lasts seven days. Practice restores a valid session automatically, and the workspace's `#auth` link opens the signed-in workspace directly when the session is still valid.

The practice archive supports Russian, English, French, Spanish, and German. The account workspace, multiplication trainer, learning guide, and project overview support Russian and English.

## Features

- **40+ quiz modes**: addition / subtraction / multiplication / division, column arithmetic, parentheses & order of operations, fractions, percents, equations (1-step → 2-step → linear), new algebra block (powers, roots, polynomials, quadratics, systems, sequences), geometry (shapes → perimeter → area → angles → triangles → coordinates), olympiad logic.
- **Multiplication trainer**: explore equal groups and arrays, derive facts from familiar ones, then practise products, missing factors, and related division in short rounds without a timer. Review favours recent mistakes and hinted answers; a fact map shows the latest retained result. Guided answers earn no XP.
- **Learning materials**: an original RU/EN guide to multiplication, with worked examples, ×1/×2/×5/×10 anchors, doubling, splitting facts, and recall after a break. It links to teaching sources and directly to the trainer.
- **Knowledge map board**: chalkboard-style board with three branches (Arithmetic / Algebra / Geometry), prerequisite threads, hover-to-highlight dependency network, mastery % per node, click-to-practice navigation.
- **Progression**: XP, levels, streaks, per-skill mastery (recency-weighted last 20 attempts), readiness %, locked → available → learning → mastered states.
- **Round rules**: practice / score / strict-input modes, per-card timer / bonus / streak-goal / task-limit / difficulty / answer-mode overrides, global settings sync.
- **Answer inputs**: keyboard, embedded touch keypad (readonly input to suppress OS keyboard), multiple-choice, comparison (`< > =`), parity (`even/odd`), column layout, handwriting placeholder (`HANDWRITING_ENABLED = false` until a recognition backend is wired).
- **Graded tests (no timers)**: 6 levels from Beginner to Pro with curated playlists across every topic. Each question ships with a scratch whiteboard (same zero-dependency canvas engine as the derivatives page: pen colors, eraser, undo/redo, clear). Best scores persist in `localStorage`, answers feed XP and the knowledge map.
- **Derivatives whiteboard**: separate `derivatives.html` + `derivatives.js` polynomial-derivative engine with canvas board (undo/redo, pointer events).
- **PWA-ish**: responsive, mobile-first, profile persists via `localStorage` + cookie fallback.

## Project structure

```
index.html                -> redirect to outputs/math-rush.html
outputs/
  math-rush.html          # main SPA: tasks + mapView + profileView + game
  math-map.html           # standalone knowledge-map page (same progress.js)
  multiplication.html / multiplication.js / multiplication.css
  multiplication-core.js # fact families, checking, strategies, review scheduling
  learn.html / learn.js / learn.css # original RU/EN learning guide
  profile.html / settings.html / derivatives.html
  progress.js             # skills graph, XP, mastery, readiness, storage
  derivatives.js          # polynomial derivative engine
  app-shell.css           # shared shell for standalone pages
tests/
  site-smoke.cjs          # HTML wiring + map + i18n assertions
  quiz-settings.cjs       # timers + 2000+ generated-problem checks
  progress.cjs            # XP / mastery state machine
  derivatives.cjs         # derivative engine + whiteboard checks
  multiplication-learning.test.cjs # fact checking, review, guided XP, account isolation
worker/
  src/ + migrations/ + wrangler.toml # account API, checked practice, D1 schema
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

Node.js 22.13 or later for the built-in SQLite test adapter; install the locked development tools with `npm ci` before checking the Worker bundle:

```bash
npm test
npm run check:worker
```

The multiplication release passed the existing practice suites and all 31 Node test cases, covering account isolation, backend authorization, cloud sync, and the new fact-family/review behavior.

## Deploy (Cloudflare)

Follow [platform operations](worker/PLATFORM.md) to choose the account, create or bind the D1 database, apply migrations, and set a private tutor invitation secret before deploying. AI inference is optional. Use the actual database ID for your own deployment and keep private credentials outside the repository.

Routes: `/` and `/quizzes` → `math-rush.html`; `/learn` and `/materials` → `learn.html`; `/multiplication` → `multiplication.html`; `/workspace`, `/dashboard`, `/tutors` → `workspace.html`; `/map` → `math-map.html`; plus `/profile`, `/settings`, `/derivatives`, and `/runner`. `/home.html` remains available as an optional overview. `/api/check-handwriting` returns `503 RECOGNITION_NOT_CONFIGURED` until a recognition provider is configured. Never put API keys in browser assets.

## Multiplication practice and review

Open `/multiplication` for the trainer or `/learn` for the worked guide. `multiplication-core.js` keeps the fact families, answer checks, derived-fact strategies, and review selection separate from the interface. Products, missing factors, and exact related division share the same multiplication fact; swapping the factors also shares its review history.

Review is rebuilt from the latest 500 saved practice attempts, rather than a lifetime record of every fact. Recent mistakes and answers completed with a hint receive more practice. Independent correct recall schedules review after 1, 3, 7, and then 14 days; repeated successes on the same UTC day do not advance that interval. The picker avoids the two most recent facts where the available pool allows it and can include new or not-yet-due facts.

These intervals are application defaults, not a research-established optimal schedule or a guarantee of memorization. The guide cites broader teaching approaches; its examples were written for Math Rush. The fact map describes retained practice history, not a formal assessment of ability, and facts may leave that history as the 500-attempt window advances.

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

## Contribute

Ideas for clearer explanations, more accessible inputs, additional languages, and better trainers are welcome in [GitHub issues](https://github.com/kamilch1k/math-rush/issues). For a new trainer, include an example problem, the intended learning goal, how answers should be checked, and any source or license for adapted materials. Small changes to an existing trainer are useful too.

Keep explanations and generated answers mathematically checkable, preserve guest practice, and add focused checks for changed grading behavior. Do not add student data, secrets, or copied proprietary question banks to the repository.

## License

Application source and original project documentation: [MIT](LICENSE). Preserve the copyright and license notice when reusing them. Third-party libraries, external learning resources, hosted services, and AI models retain their own terms; see [third-party notices](THIRD_PARTY_NOTICES.md).
