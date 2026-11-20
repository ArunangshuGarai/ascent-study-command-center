# ASCENT — Universal Study Command Center

A full-stack, account-backed study operating system. Run an exam, a course and a skill at the
same time; each target keeps its own curriculum, sessions and optional deadline while the daily
board stays shared. The built-in GATE CSE preset ships with the original 84-day plan, twelve
subjects, 74 topics and 209 study units.

Built from the 15-year GATE paper analysis for the preset: every subject is weighted, every topic
sized in 45-minute units, and the final 12 days are reserved for mocks, autopsies and repair.
Custom targets use the universal scheduler, which distributes their 45-minute units across the
free core slots of the same day templates.

## What is inside

- **Multiple concurrent targets** — every target has its own subjects, topics, colour, kind and
  optional date. Focus one target for the dashboard header, or let the planner balance all active
  targets on the same daily board. Archiving a target removes it from the plan without touching
  completed sessions, XP, notes or history.
- **Dated and rolling plans** — a target with a date gets an anchored plan ending on that date.
  A target without a date gets a rolling `horizonDays` window (30 days by default) that refreshes
  every day and never shows a countdown. Progress keeps accumulating until you archive it.
- **Adaptive day-by-day planner** — every day from today to the planning horizon, built from your
  weekday and weekend templates. Changing a target date, the rolling horizon, a template, a rest
  day or a confidence score re-flows all unresolved future work. Completed, past and manual blocks
  stay pinned.
- **Daily Flow (GATE preset)** - the fixed 7-hour rhythm (09:30 PYQ recon, 11:00 core deep dive,
  16:00 practice, 18:30 revision, 20:30 validation) mapped across the 84-day plan. Gym,
  meals, walks, buffer and nap are visual anchors and never become tasks.
- **Early completion + adaptive ripple** - tick a future block when you have already done
  the work. The topic leaves the queue, later topics are pulled forward, and spaced recall
  passes are scheduled from the real completion date.
- **Delayed-work recovery** - unfinished sessions roll into the next open core slot instead
  of piling onto today; missed recall stays due until it is cleared.
- **Bulk import** — timetable CSV, curriculum CSV and combined JSON, with a live preview,
  row-level validation, duplicate detection and append / replace-future / replace-all modes.
- **Horizontal scroll rails** - the Daily Flow, milestones, momentum map and sprint board
  all expose arrow controls for narrow screens and long horizons.
- **Jira-style sprint board** - six time-of-day columns, drag to another day or slot, and a
  date rail for browsing any day until the planning horizon. Cards from every target share the
  board and are tagged by target.
- **Natural-language command prompt** (`Ctrl/Cmd + J`) — add study or life blocks in plain
  English. It reads date, time, duration, subject, task type and recurrence:
  `45m DBMS normalization tomorrow at 9am`, `gym Sunday 8am for 1 hour`,
  `revise TOC every weekday at 8pm for 2 weeks`.
- **Accounts + database** — register/sign in with name, email and password. Passwords are
  scrypt-hashed; sessions are httpOnly cookies. Each account owns an isolated planner state
  and a durable stats ledger.
- **Gamified progress** — XP, ranks, streaks, quests, achievements, focus timer, mock scoring,
  ripples, confetti and a live dashboard.
- **Dynamic auth experience** — pointer spotlight and parallax, wheel-cycled signal cards,
  password strength, caps-lock detection, validation and a responsive layout.
- **Data tools** — JSON import/export, `.ics` calendar export, rest days, subject boosts,
  confidence scoring and full plan reset.

## Targets and the curriculum model

Each `StudyTarget` owns a slice of the curriculum. `Subject` and `Topic` records carry a
`targetId`; every `Task` also carries a `targetId`, so the scheduler can rebuild one target
without disturbing another.

| Field | Meaning |
| --- | --- |
| `title` | Display name, e.g. `GATE CSE 2027`, `AWS Solutions Architect`, `Spanish B1` |
| `kind` | `exam`, `course`, `skill`, `habit` or `custom` |
| `date` | Optional ISO deadline. Missing means a rolling plan. |
| `dailyMinutes` | Soft daily capacity for the universal scheduler (default 120) |
| `subjectOrder` | Preferred subject sequence. For the GATE preset it also defines which subjects are included. |
| `prepLevel` | `first-time`, `some-prep` or `exam-ready`; sets initial confidence and GATE plan intensity |
| `dayMinutes` | Seven available study minutes indexed by JS weekday (`0` = Sunday) |
| `preset` | `gate-cse` for the built-in GATE preset only |
| `archivedAt` | Set when archived; history remains readable |

- **Adding a target** never clears the board. The scheduler keeps every existing completion and
  manual block, then fills free core slots for the new target.
- **Focusing a target** changes the dashboard header, countdown and default target for new blocks;
  it does not hide or rewrite other targets' work.
- **GATE preset** is seeded with the full 12-subject, 209-unit map. It keeps its specialised
  Daily Flow generator. Imported curriculum for the GATE target is redirected to a new custom
  target so the preset is never corrupted.
- **Legacy accounts** are migrated on load: sessions, XP, streaks and completed history are
  preserved, the old plan becomes the GATE preset target, and missing target IDs are inferred
  from each task's subject or topic.

## Bulk upload

Open **Settings → Bulk upload**. Paste content or choose a `.csv` / `.json` file. The panel
parses as you type and shows the detected format, a preview table, duplicate flags, validation
errors and warnings before anything is applied.

### Timetable CSV

```csv
date,start,duration,title,kind,subject,topic,notes
2026-11-18,09:30,90,Linear Algebra — Matrices,study,Mathematics,Matrices,"Lecture + 20 solved sums"
2026-11-18,18:30,45,Flashcard recall,revision,Mathematics,,
2026-11-19,,60,Mock Test #1,mock,,,"Full syllabus, timed"
2026-11-20,07:30,30,Morning walk,personal,,,
```

- `date` and `title` are required. Dates must be ISO `YYYY-MM-DD`.
- `start` is optional 24-hour `HH:MM`. If omitted, the block finds the next free slot.
- `duration` is optional, in minutes (5–600, default 45).
- `kind` accepts the block types below; unknown values import as `study` with a warning.
- `subject` / `topic` are optional and matched case-insensitively inside the selected target.
- `notes` becomes the block description.
- Rows dated before today, after a dated target's deadline, or matching an existing block are
  skipped and reported.

Block types: `study`, `pyq`, `practice`, `revision`, `test`, `mock`, `analysis`, `personal`,
`rest`, `exam`. Common aliases such as `learn`, `deep work`, `revise`, `quiz`, `gym` and
`recovery` are recognised.

### Curriculum CSV

```csv
subject,topic,units,priority,key_points
Mathematics,Matrices,2,high,"determinants; rank; inverse"
Mathematics,Probability,3,normal,"Bayes; random variables; distributions"
Physics,Waves,2,normal,"standing waves; Doppler"
```

- `subject` and `topic` are required.
- `units` is the number of 45-minute sessions the scheduler may distribute (1–100, default 1).
- `priority` is `low`, `normal` or `high`. High-priority topics are marked high-yield.
- `key_points` is separated by `;` or `|` and shown on the task card. Existing topics merge
  new key points instead of losing old ones.
- Re-importing an existing topic updates its unit count and key points rather than creating a
  duplicate.

### Combined JSON

```json
{
  "target": {
    "title": "AWS Solutions Architect",
    "kind": "exam",
    "date": "2027-03-01"
  },
  "curriculum": [
    {
      "subject": "Cloud",
      "topic": "IAM",
      "units": 3,
      "priority": "high",
      "key_points": ["users", "roles", "policies"]
    }
  ],
  "schedule": [
    {
      "date": "2026-11-20",
      "start": "18:00",
      "duration": 60,
      "title": "Practice exam",
      "kind": "mock"
    }
  ]
}
```

`target`, `curriculum` and `schedule` are all optional, but at least one row must be present.
`timetable` and `blocks` are accepted as aliases for `schedule`; `topics` is accepted for
`curriculum`. If `target` is omitted, the selected target is used, or a new custom target is
created from the file.

### Apply modes

| Mode | What it removes | What it keeps |
| --- | --- | --- |
| **Append** | Nothing. Duplicates are skipped. | Every existing block and all history |
| **Replace future imports** | Future blocks created by an earlier import for this target | Completed, past, manual and generated blocks |
| **Replace all future** | Pending generated and imported blocks for this target from today | Completed, past and manual blocks |

Progress, XP, streaks and completed history always survive every import mode. Imported timetable
blocks become pinned manual anchors (`planSignature` starts with `import:`); generated curriculum
sessions re-flow around them.

## Daily Flow, universal scheduling and re-flow

The GATE preset's 84-day plan (`src/data/dailyFlow.ts`) owns its topic order, mock week, final
revision and rest day. The scheduler treats that plan as a queue rather than a frozen set of rows:

- **Normal day** - each study day pulls the next unresolved plan row. With no changes the
  sequence matches the supplied 84-day plan.
- **Completed early** - ticking a future core dive banks it immediately. The topic is removed
  from the queue (including any repeated sessions), the next row takes that day's core slot,
  and every later topic shifts forward. The cleared card stays in the record with an
  "early" marker, while a new deep dive is generated for the freed slot.
- **Spaced recall** - cleared topics are due for active recall after 1, 3, 7 and 14 days.
  The 18:30 revision block lists the due topics. A missed pass stays due until a revision
  block is completed; it never silently drops out.
- **Delayed or missed work** - on the next day, unfinished study rows are marked missed and
  re-enter the front of the queue. The oldest unresolved topic takes the next available core
  slot; later topics slide one step. Mocks, the final revision day and recovery days stay
  anchored.
- **Capacity pressure** - if the remaining calendar can no longer hold every unresolved row,
  the ripple report shows deferred topics and lower projected coverage. Use a subject boost,
  add a manual block, or remove a recovery day to buy capacity.

Custom targets use a simpler universal queue. Each topic contributes `units` sessions of 45
minutes. The scheduler walks the planning window day by day, gives every active target one block
where a free core slot exists, then fills remaining slots nearest-target-first under each
target's `dailyMinutes` cap. A dated target stops receiving new sessions after its date and gets
a final anchor task on the date; a rolling target is re-planned across the moving horizon.
Existing manual and imported blocks are treated as occupied time, so the scheduler routes around
them instead of double-booking the day.

A re-flow that starts in the future (for example after adding a block next week) keeps every
pending generated session before that date and lets those sessions keep their plan units. This
prevents the same topic from being scheduled twice.

If a whole day is lost, do not stack it on top of the next day. Let the queue roll it forward,
complete the oldest unresolved core first, and keep the 18:30 recall block for the topics
already cleared. The plan is designed to absorb a delayed day; it is not designed to absorb
two days of work in one day.

## Stack

| Layer | Tech |
| --- | --- |
| Client | React 19, TypeScript, Vite, vanilla CSS, lucide, dnd-kit |
| Server | Node 22, Express 5 |
| Database | SQLite via built-in `node:sqlite` (`DatabaseSync`), or Turso/libSQL when hosted |
| Auth | `crypto.scrypt`, hashed session tokens, httpOnly cookies |

No native database module is required. The app ships as one Node service that serves both
the API and the built static client. The database layer picks its driver at runtime:

- **Local / Docker / Render** — `node:sqlite` writing `DATA_DIR/ascent.db`.
- **Serverless (Vercel)** — `@libsql/client` against a Turso database, enabled by setting
  `TURSO_DATABASE_URL` (and `TURSO_AUTH_TOKEN`). The same SQL runs on both.

## Run locally

Requires **Node 22.9+** (for `node:sqlite` and `--env-file-if-exists`). The npm scripts pass
`--experimental-sqlite`, which Node versions before 22.13 need to expose `node:sqlite`; newer
versions accept it harmlessly.

```bash
npm install
npm run dev
```

That starts:

- API + database on `http://127.0.0.1:8787`
- Vite client on `http://127.0.0.1:5173` (proxies `/api` to the API)

Open the Vite URL. Create an account, then choose the **GATE CSE preset** or **Start blank**.
A blank target can be rolling or dated, and you can add more targets any time in Settings.

The GATE preset adds a plan-setup panel before the account is created:

- **Preparation level** — first time, some prep or exam ready. It sets initial topic confidence
  and the length of the mock phase (14, 18 or 21 days, with 5, 6 or 7 mocks).
- **Subject sequence** — reorder the twelve subjects with the arrows and uncheck any subject you
  are not taking. Only included subjects are seeded into the curriculum and the planner queue;
  their order decides which subject the scheduler serves first.
- **Available study hours** — one value per weekday. The Daily Flow trims its study blocks to fit
  that day's budget, keeping the highest-value blocks first; zero means a rest day.

These choices live on the GATE target (`subjectOrder`, `prepLevel`, `dayMinutes`) so they can be
inspected later, and the target card in Settings shows the prep level and average daily load.

### Production build

```bash
npm run build
npm start
```

`npm start` serves `dist/` and the API from the same origin on `PORT` (default `8787`).

## Configuration

Copy `.env.example` to `.env`:

```ini
PORT=8787
DATA_DIR=./data
SESSION_DAYS=30
COOKIE_SECURE=

# Optional: use Turso/libSQL instead of the local SQLite file
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
```

- `DATA_DIR` — where `ascent.db` lives. Back this directory up. Ignored when Turso is configured.
- `COOKIE_SECURE` — set to `1` behind HTTPS. Leave empty to auto-detect
  `x-forwarded-proto`; `0` is only for local HTTP testing. On Vercel it defaults to `1`.
- `SESSION_DAYS` — session lifetime in days (default 30).
- `TURSO_DATABASE_URL` — `libsql://…` URL of a Turso database. Setting it switches the
  server to the remote driver; `DATA_DIR` is then unused.
- `TURSO_AUTH_TOKEN` — Turso database token. Required for remote databases.

`LIBSQL_URL` / `LIBSQL_AUTH_TOKEN` are accepted as aliases. `GET /api/health` reports which
driver is active under `database: "sqlite" | "turso"`.

## Deploy

### Vercel + Turso

Vercel has no persistent filesystem, so the app uses a Turso database there instead of the
local SQLite file. `vercel.json` builds the Vite client into `dist/` and serves the API from
the catch-all function in `api/[...route].js`.

1. **Create the database.** Install the Turso CLI and sign in:

   ```bash
   turso auth signup
   turso db create ascent
   turso db show ascent --url           # copy as TURSO_DATABASE_URL
   turso db tokens create ascent        # copy as TURSO_AUTH_TOKEN
   ```

   (The Turso dashboard can do the same thing in the browser.)

2. **Import the repo.** In Vercel choose **Add New → Project**, pick
   `ascent-study-command-center`, and keep the detected Vite settings. The build command and
   output directory already come from `vercel.json`.

3. **Set environment variables** (Project → Settings → Environment Variables, all
   environments):

   | Key | Value |
   | --- | --- |
   | `TURSO_DATABASE_URL` | `libsql://ascent-<org>.turso.io` |
   | `TURSO_AUTH_TOKEN` | the token from step 1 |
   | `COOKIE_SECURE` | `1` |

   `SESSION_DAYS` is optional (default 30). Do not set `DATA_DIR` on Vercel.

4. **Deploy.** Tables are created on the first request. Check
   `https://<project>.vercel.app/api/health` — it should report `"database":"turso"`. Then
   register an account, reload, and confirm the session persists.

Every push to `main` redeploys automatically. Accounts, sessions and planner state live in
Turso, so they survive redeploys and cold starts.

> The free Vercel plan limits function duration to 10s and Turso free databases have row/storage
> caps; plenty for personal use. Planner saves are debounced to one request per edit burst.

### Docker

```bash
docker build -t ascent .
docker run -d --name ascent -p 8787:8787 -v ascent-data:/data -e COOKIE_SECURE=1 ascent
```

Open `http://localhost:8787`. SQLite data persists in the `ascent-data` volume.

### Render

`render.yaml` is included. It builds the Dockerfile, checks `/api/health`, mounts a 1 GB
persistent disk at `/data`, and sets `COOKIE_SECURE=1`. Connect the repo in Render and apply
the blueprint. Any Docker host with a persistent disk works the same way.

> SQLite requires a single instance with a persistent disk. Do not scale to multiple replicas
> against the same database file.

## Data model

- `users` — id, name, unique email, scrypt hash + salt
- `sessions` — hashed token id, user id, expiry, last seen
- `planner_states` — one JSON planner state per user, revision counter
- `user_stats` — XP, completions, study minutes, coverage, best streak, mocks

The server is the source of truth. The client saves with a 650 ms debounce and retries from
the topbar sync badge. A `pagehide` beacon catches the last edit when a tab closes.

### API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `POST` | `/api/auth/register` | Create account + session |
| `POST` | `/api/auth/login` | Sign in |
| `POST` | `/api/auth/logout` | Destroy session |
| `GET` | `/api/auth/me` | Current account + planner |
| `GET` | `/api/planner` | Planner snapshot + stats |
| `PUT` | `/api/planner` | Save planner state, recompute stats |
| `GET` | `/api/stats` | Durable stats ledger |
| `GET` | `/api/leaderboard` | Top accounts by XP |

## Project map

```
api/[...route].js       Vercel serverless entry (Express app)
vercel.json             Vite build + function config
server/                 Express app, database layer, auth/session helpers
server/app.js           API routes and static client serving
server/db.js            SQLite/Turso driver, planner + stats queries
src/App.tsx             Auth gate
src/components/         Workspace, AuthView, CommandConsole, board, dashboard…
src/components/TargetManager.tsx  Targets, target curriculum, archive/restore
src/components/ImportPanel.tsx    Bulk upload, preview, validation, apply modes
src/hooks/useAuth.ts    Session lifecycle
src/hooks/usePlanner.ts Planner mutations, target CRUD, import application, cascade,
                        debounced cloud save
src/lib/schedule.ts     GATE unit scheduler, flow queue, spaced recall and re-flow engine
src/lib/universalSchedule.ts      Multi-target generator and rolling horizons
src/lib/bulkImport.ts   CSV/JSON parsing, validation, duplicates and templates
src/lib/targets.ts      Target helpers, primary target, planning end and colours
src/lib/curriculumRegistry.ts     Dynamic curriculum lookups for generic components
src/lib/storage.ts      Legacy migration, server-state normalization and rollover
src/data/dailyFlow.ts   The 84-day GATE plan, five study windows and plan lookups
src/data/curriculum.ts  The GATE preset curriculum
src/components/DailyFlowRail.tsx  7-hour timeline and life anchors
src/lib/commandParser.ts Natural-language block parser
src/styles.css          Design system and workspace views
src/flow.css            Daily Flow rail, scroll rails and flow settings
src/auth-console.css    Auth, account and command-console surfaces
```

## Notes

- Planner changes are optimistic on the client and queued for save. When the server is
  unreachable the topbar shows **Retry sync**; the in-memory plan is not lost.
- Deleting a browser's local data does not delete an account. Sign in again to restore it.
- The planner's historical days keep completed, skipped and missed sessions as a record.
