# Math Rush platform operations

The Cloudflare Worker adds real accounts, server-checked practice, classrooms,
assignments, written tutor feedback, and account-scoped progress synchronization.
The original quizzes, map, derivatives board, runner, and local guest practice
remain available. GitHub Pages can serve those static files; the account API
requires the Worker and a D1 database on the same origin.

## Runtime and bindings

Use the repository-installed Wrangler version (`npm ci` after cloning). The
implementation uses Web Crypto, prepared D1 statements, and standard Workers
Request/Response APIs. It does not need `nodejs_compat` in production.

`worker/wrangler.toml` must retain the intended Worker name and account. Its
assets binding must be `ASSETS`, with directory `../outputs`. Set
`run_worker_first = true` so `/` and the clean application routes reach the
Worker before the old static index redirect. Set `html_handling = "none"` when
the Worker itself supplies the HTML route rewrites; this avoids asset redirects
changing the location during an internal fetch.

Required D1 configuration:

```toml
[[d1_databases]]
binding = "DB"
database_name = "math-rush-platform"
database_id = "<the actual ID returned by Cloudflare>"
migrations_dir = "migrations"
```

The database name above is an example. Reuse the configured database ID when one
already exists. Do not point tests at the production database.

Enable Worker logs and traces in the deployment configuration. Request errors
log only an event, request ID, and URL path; passphrases, questions, recovery
codes, invite codes, and database error text are not logged by this application.

## Local development

From the repository root, the separate local configuration supplies a local-only D1 binding:

```sh
npm run db:local
npm run dev
```

Both scripts use `worker/wrangler.local.toml` and the same `.wrangler/state` persistence path. This local configuration has no AI binding and does not address a remote database.
The initial migration is `worker/migrations/0001_platform.sql`. It creates users,
sessions, progress, classrooms, memberships, assignments, reviews, practice
problems/results, and persistent rate-limit records.

For local tutor activation, put a long test-only `TUTOR_INVITE_CODE` in the
ignored `worker/.dev.vars` file, next to the Wrangler configuration. Do not use
or copy the production invitation. No AI binding is required to run locally;
checked mathematical hints remain available without inference.

Local HTTP works on `localhost`, `127.0.0.1`, or `[::1]`. Public API requests
require HTTPS. Browser forms must use the same origin as the API. The Worker
requires an exact matching `Origin` header on POST, PUT, PATCH, and DELETE; it
does not expose a cross-origin account API for the GitHub Pages mirror.

## Production setup

1. Verify the selected Cloudflare account and the existing `math-rush-link`
   Worker before changing resources.
2. Create one D1 database if none is bound, then record its real ID in the
   configuration. Preserve an existing binding and its data.
3. Apply the migration to the intended remote database:

   ```sh
   npx wrangler d1 migrations apply DB --config worker/wrangler.toml --remote
   ```

4. Configure the tutor invitation through protected input:

   ```sh
   npx wrangler secret put TUTOR_INVITE_CODE --config worker/wrangler.toml
   ```

   The command reads the value interactively; never put a secret in a command
   argument, committed file, browser asset, or application log. `secret put`
   deploys a new Worker version immediately. Use Wrangler's versioned-secret
   workflow instead when preparing a release that must remain staged.

5. Optionally configure Workers AI, as described below.
6. Check the bundle, then deploy through the repository's release process:

   ```sh
   npx wrangler deploy --config worker/wrangler.toml --dry-run
   npx wrangler deploy --config worker/wrangler.toml
   ```

Migrations and Worker deployment are separate operations. A successful static
deployment does not mean the D1 schema has been installed.

## Accounts and recovery

- Sign-up accepts a username, display-name alias, and a 12–128 character
  passphrase. It does not collect email, date of birth, or a child's real name.
- Every account starts as a student. Supplying `role` or `publicProfile` during
  sign-up cannot create a tutor.
- Passphrases use a random per-account salt and PBKDF2-HMAC-SHA256 with 100,000
  iterations. This stays within the Workers runtime's PBKDF2 iteration ceiling;
  increasing the constant without checking runtime support can break sign-in.
  Use long unique passphrases. This is an initial account system, not a claim
  that a comprehensive identity/security audit has been completed.
- Sessions are random 256-bit tokens; only their hashes are stored. The cookie
  is HttpOnly, SameSite=Strict, Secure on HTTPS, and expires after seven days.
- Sign-up returns a recovery code exactly once. The UI must ask the account
  owner to save it. Store neither the code nor the passphrase in localStorage.
- Recovery requires username, recovery code, and a new passphrase. It rotates
  the recovery code and invalidates old sessions atomically. In-flight logins
  with a pre-recovery password cannot mint a new session afterward.
- There is no email reset or administrator password-reset screen. Without the
  passphrase and recovery code, self-service recovery is unavailable.

Relevant endpoints:

| Endpoint | Method | Input / result |
| --- | --- | --- |
| `/api/auth/register` | POST | `{username, displayName, password}` → `{user, recoveryCode}` |
| `/api/auth/login` | POST | `{username, password}` → `{user}` |
| `/api/auth/recover` | POST | `{username, recoveryCode, password}` → `{user, recoveryCode}` |
| `/api/auth/logout` | POST | Clears the current session |
| `/api/me` | GET | `{user}` or `{user:null}` |
| `/api/profile` | PATCH | `{displayName?, goal?, bio?, languages?, publicProfile?}` → `{user}` |

All successful responses also contain `ok:true`. Errors use
`{ok:false, code, message}` and an appropriate HTTP status. No authentication
hashes or recovery/invitation secrets appear in user or public-tutor responses.

## Tutor activation and privacy

An account becomes a tutor only through `POST /api/tutor/activate` with
`{inviteCode}` matching the server-side `TUTOR_INVITE_CODE`. Treat this invitation
as an administrator-controlled credential and rotate it if it is disclosed.

Activation creates one classroom with a random invitation code. Share the
classroom code only with the intended students. A student joins using
`POST /api/classroom/join` with `{code}`. One student account belongs to one
classroom in this version; moving/leaving classrooms is not yet implemented.

Tutors see only their classroom members, assignments, server-checked practice
summaries, and feedback requests. Students see only their own work and their
linked tutor. Joining does not disclose saved guest-browser history; guest
progress is imported only through the explicit account import flow.

Tutor profiles remain private until the tutor explicitly enables
`publicProfile` in `/api/profile`. `/api/tutors` returns only opted-in tutors'
display names, bios, languages, and subjects. It does not return usernames,
classroom codes, learner records, or availability claims. An empty directory is
a real empty state; no teacher roster or testimonials are seeded.

`POST /api/assignments` is tutor-only and requires a current member's
`studentId`, a title, a supported topic, a target of 1–100 questions, and an
optional `YYYY-MM-DD` due date. Only the assignment's student can record its
practice progress. A question counts once, even under simultaneous duplicate
submissions, and only when its topic matches the assignment.

Students request written feedback with `POST /api/reviews` using
`{topic, question, work}`. The linked tutor replies with
`PATCH /api/reviews/:id` using `{feedback}`. No email, video session, or external
message is sent by these endpoints. Lists are scoped to the signed-in account
and capped at 200 entries per response.

## Practice and AI

The new checked-practice flow covers same-denominator fraction addition,
two-step linear equations, and percentages. It complements the wider legacy
quiz library; it does not claim full curriculum coverage.

`GET /api/practice/problem?topic=fractions&language=ru` generates a task and
stores its verified answer server-side. Languages are `ru` and `en` (default).
`POST /api/practice/answer` accepts `{problemId, answer, assignmentId?}`. Answers
are parsed as numbers or fractions, without `eval`; decimal points and decimal
commas are accepted. The server grades its stored task, returns a worked
explanation, and records the first submission idempotently. Editing the client
cannot change the expected answer or another student's records.

`POST /api/practice/hint` with `{problemId}` always has a deterministic checked
hint available. To add AI rephrasing, configure both:

```toml
[ai]
binding = "AI"

[vars]
AI_MODEL = "@cf/meta/llama-3.2-3b-instruct"
```

Preserve any other existing variables. The configured model was checked against
Cloudflare's [model reference](https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/)
on 1 November 2026. Its non-streaming Workers binding accepts `messages` and
`max_tokens` and returns generated text in `response`, matching `practice.js`
without an API adapter. The application limits generation to 192 output tokens.
Cloudflare's [pricing page](https://developers.cloudflare.com/workers-ai/platform/pricing/)
currently lists approximately $0.051 per million input tokens and $0.335 per
million output tokens, with an account-wide daily free allocation. Recheck
availability, account access, and pricing before deployment; neither a model
name nor the application quota guarantees free usage. No external AI API key
is put in the frontend.

The model receives only the generated maths question and a verified hint,
never usernames, profile details, student questions, or private working. It is
asked to provide one brief hint in the task's language. Responses expose
`source:"ai"` only when inference actually succeeds; otherwise `source:"checked"`.
The independent `checkedHint` remains included alongside generated wording.
AI wording is not independently guaranteed correct and is not used to grade
answers.

Inference is capped at ten requests per account per UTC day. After that, the
endpoint returns a checked hint with `quotaReached:true`. Provider failures
also fall back to checked hints. Other persistent limits include 120 new
questions and 30 hint requests per account per hour, 180 authenticated API
requests per minute, and tighter authentication/invitation limits. Rate-limit
responses use HTTP 429 and `Retry-After`.

## Progress synchronization

`GET /api/progress` returns `{progress:null, revision:0}` for an empty account.
`PUT /api/progress` accepts `{progress, revision}` using the current integer
revision. A successful write increments it. A stale write returns HTTP 409,
`code:"PROGRESS_CONFLICT"`, and the current account-scoped `progress` and
`revision`; the client must not overwrite a concurrent device silently.

The V2 snapshot preserves bounded recent history, lifetime skill totals, and
per-skill `recentAttempts`. Imported legacy progress is client-reported study
history. It is separate from the new server-checked practice results and is
not a credential, exam certification, or leaderboard assertion.

## Verification and remaining scope

Run the backend tests with Node 24:

```sh
node --test tests/platform-api.test.mjs
```

The test adapter uses SQLite and executes the actual Worker handlers. It checks
authentication, origin checks, secret exposure, role boundaries, account-scoped
records, recovery races, optimistic-sync conflicts, concurrent answer
idempotence, checked/AI hint labeling, quotas, and body limits. Also run the
repository's existing quiz/progress checks. Node tests are not a substitute for
checking the bundle and affected routes in the Cloudflare runtime.

This release does not implement payments, video lessons, live scheduling,
email delivery, parent subaccounts, uploads/handwriting recognition, classroom
transfers, or account deletion/export controls. It has not undergone an
independent moderation or security review for use as a public children's
service. These are remaining parts of the platform, rather than available
features.

## References checked

- [D1 prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)
- [D1 batch transaction behavior](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)
- [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Workers Web Crypto and timing-safe comparison](https://developers.cloudflare.com/workers/runtime-apis/web-crypto/)
- [Workers runtime PBKDF2 cap discussion](https://github.com/cloudflare/workerd/issues/1346)
- [Wrangler asset and binding configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Workers AI bindings](https://developers.cloudflare.com/workers-ai/configuration/bindings/)
- [Configured text model and input/output schema](https://developers.cloudflare.com/workers-ai/models/llama-3.2-3b-instruct/)
- [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
