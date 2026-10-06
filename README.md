# Pokus

A single-page Pomodoro timer built with React 19, Vite, and Tailwind CSS.

## Features

- Adjustable Pomodoro duration with a circular control
- Quick presets for 15, 25, 45, and 60 minutes
- Installable Timer-first PWA with Timer, Projects, Calendar, Capture, Knowledge, and Profile navigation; Habits is accessible from Calendar
- Responsive sticky desktop navigation and safe-area-aware mobile navigation
- Projects list with status, Due soon, and Archived filters, progress, and focused time per project
- Project detail pages with the project's tasks, filters, and actions, plus a No project page for loose tasks
- Responsive task rows with 25-row progressive loading and detail overlays
- Archive, restore, rename, and delete projects without changing child statuses
- Group tasks under optional projects and move tasks between projects
- Task priority, reusable single categories, rich descriptions, and project due dates
- Search plus completion, priority, and category filters with smart task ordering
- One-line task titles up to 160 characters; legacy long or multiline titles remain preserved until renamed
- Derive each project's focused time from its child tasks
- Create and edit tasks through accessible modals
- Persistent task creation, selection, completion, and reopening
- Set up a Pomodoro from a task, or pick one on the Timer, and choose its duration before starting
- Run a Pomodoro without attaching a task
- Track successful Pomodoro time per task in hours and minutes
- Save or discard elapsed task time when stopping a session early
- Start, pause, resume, and stop controls backed by an app-level wall clock
- Accurate timer completion after navigation, tab backgrounding, or visibility changes
- Google OAuth authentication through PocketBase
- User-scoped PocketBase persistence for projects, tasks, focused time, and the active Pomodoro session
- Profile page with account details, focus totals, and Pomodoro history
- Capture inbox for links and thoughts with rich previews for YouTube videos, social posts, articles, and Google Drive files
- Projects contain captures: add inbox captures to one or more projects, capture straight into a project, and browse them on its Captures tab
- Centaur-style daily habits: check-ins, numeric totals, daily targets, quick increments, editable past entries, activity grids, and streaks
- Account-owned habits synced across browsers, with cached offline browsing and online-only edits
- Dated numeric targets preserve historical progress when targets change
- Optional per-browser in-app daily reminders while Pokus is open
- Month calendar and daily agenda for project deadlines, tasks, habits, and capture reminders
- Task due dates override project deadlines; undated work appears in Calendar’s Unscheduled list
- One timed reminder per capture, with completion independent of capture processing

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Lucide React icons
- PocketBase JavaScript SDK

## Getting Started

```bash
npm install
npm run dev
```

Open the local Vite URL printed in your terminal.

No environment variables are required.

## PocketBase setup

The frontend connects to `https://pb1.madebynz.xyz` and expects the
`projects`, `tasks`, `categories`, `captures`, `knowledge`, `habits`,
`habit_entries`, `habit_targets`, `pomodoro_sessions`, and
`pomodoro_completion_receipts` collections. Their fields,
relations, indexes, and owner-only API rules are available in `pb_schema.json`.

Copy `pb_hooks/link_preview.pb.js` into your PocketBase `pb_hooks` directory to
enable capture link previews. It adds an authenticated
`GET /api/pokus/link-preview?url=` route that reads public page metadata
server-side. Without it, captures still work and fall back to built-in YouTube
thumbnails and type-specific cards.

New and renamed task titles have a 160-character maximum; project titles remain
limited to 120 characters. Existing legacy task titles are preserved when only
metadata changes. Project lifecycle status is independent of archiving, which
continues to use the existing `projects.isDone` field.
Archived projects retain their child tasks and statuses.

To import them from the PocketBase Dashboard:

1. Open **Settings → Import collections**.
2. Paste the contents of `pb_schema.json`.
3. Leave **Delete missing collections** disabled so the existing `users`
   collection and Google OAuth settings remain unchanged.
4. Confirm the import.

Re-import the schema with **Delete missing collections** disabled after pulling
schema updates. PocketBase will update the existing collections without deleting
their records or changing the Google OAuth configuration.

Import the updated `pb_schema.json` before deploying the matching frontend.
Project and task due dates are stored as `YYYY-MM-DD` text so calendar days do not
drift across time zones. Tasks use their own date or inherit their project's
deadline. Clearing an override restores inheritance; moving or deleting a project
recomputes the task's effective date. Archived projects and their tasks are hidden
from Calendar. Calendar opens at `#calendar`; a date and optional capture can be
linked as `#calendar/YYYY-MM-DD/<capture-id>`. Existing `#habits` links still work.

Captures use `reminderAt` (integer epoch milliseconds, zero when absent) and
`reminderDone` (independent of `isProcessed`). Scheduling requires a future time;
completion retains the dated entry, and rescheduling reopens it. Reminders display
in the current device timezone. Web alerts appear only while the app is visible,
with browser-wide, account-scoped deduplication and a catch-up notice on return.
Native alerts are scheduled after the iPhone app syncs; changes made on the web,
including cancellation, reach the phone after its next sync. Existing daily habit
reminders remain independent.

Import the updated schema before releasing either client. This change adds fields
and indexes only; existing records decode safely without a backfill. Calendar
does not add a collection, a push service, or external calendar synchronization.

Habits require the three habit collections in this schema and PocketBase batch
requests enabled (Settings → Application, at least three requests per batch).
Numeric habit creation saves the habit and its initial target in one transaction.
Daily entries and target revisions have unique habit/day indexes; numeric quick
increments use atomic field increments. Dates are Gregorian `YYYY-MM-DD` local
calendar days, independent of focus sessions. The habit type and unit are fixed
after creation, and target edits take effect today without rewriting earlier days.
Deleting a habit cascades to its entries and targets.

Web habits do not import or sync Centaur's existing local native habit database.
Reminder preferences stay on each browser. Web reminders show inside the app while
it is open; background/Lock Screen reminder scheduling remains a native feature.
No live server schema is changed by this repository edit: import the schema before
deploying the frontend.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run test` - Run the Vitest suite
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint
- `npm run test:habits:pocketbase` - Test habits against an isolated local PocketBase
- `npm run test:calendar:pocketbase` - Test calendar schema, inherited dates, reminders, and account access against an isolated local PocketBase
- `npx playwright test e2e/calendar.spec.ts` - Test calendar actions, responsive layouts, accessibility, and cached browsing in Chromium and iPhone WebKit
- `npx playwright test e2e/habits.spec.ts` - Test habit flows in Chromium and iPhone WebKit

See [Calendar verification](docs/calendar-verification.md) for test evidence and
remaining manual release checks.

## Project Structure

```text
src/
├── App.tsx
├── components/
│   ├── features/
│   │   ├── CircularDurationInput.tsx
│   │   ├── AppShell.tsx
│   │   ├── ProjectNavigation.tsx
│   │   ├── ResponsiveOverlay.tsx
│   │   ├── SessionTask.tsx
│   │   ├── TaskWorkspace.tsx
│   │   ├── TaskEditor.tsx
│   │   ├── TaskDetail.tsx
│   │   └── timer.tsx
│   └── ui/
│       └── ...
├── lib/
│   ├── pocketbase.ts
│   ├── pocketbase-records.ts
│   ├── workspace.ts
│   └── utils.ts
├── hooks/
│   ├── usePomodoroSession.ts
│   ├── useProjects.ts
│   ├── useTimerClock.ts
│   ├── useWorkspacePreferences.ts
│   └── useTasks.ts
├── types/
│   └── task.ts
├── main.tsx
└── styles/
    └── globals.css
```

## Install on iPhone

Open the HTTPS site in Safari, sign in, then choose **Share → Add to Home Screen**.
Keep **Open as Web App** enabled when Safari shows it. Launch Pokus from its icon;
it opens the Timer without browser navigation. Profile includes dismissible install
help, System/Light/Dark appearance, completion sound, and optional screen wake lock.

After the first online visit finishes downloading the app, timers and previously
loaded tasks work offline. Task and project editing requires a connection. Session
transitions are saved in user-scoped IndexedDB before the controls confirm them;
completed focus sessions queue for automatic sync. Profile shows pending work and
Retry. An expired login allows local use but requires signing in again to sync.
Signing out locks cached data and leaves pending work attached to its original
account. Browser storage can be cleared by the user or operating system; do not
clear site data while sessions are pending.

Sound works while the app is open and audio has been unlocked by Start, Resume,
or Test sound. iOS may suspend background web apps: there is no push service or
locked-screen alarm. Timer deadlines reconcile on return, including lock/unlock.
Wake lock is optional and best effort; it releases when paused or hidden.

## PWA rollout and hosting

Before releasing this frontend:

1. Back up PocketBase, then import `pb_schema.json` with **Delete missing
   collections disabled**. It adds `pomodoro_completion_receipts` and the
   `discarded` session status, and makes terminal sessions immutable to clients.
2. Enable the PocketBase batch API on a compatible server (batch support requires
   PocketBase 0.23 or newer). Allow at least **3 requests per batch**. Validation
   used PocketBase 0.40.4, a 3-second batch timeout, and 64 KiB maximum body size.
3. Refresh older clients during rollout. Completed sessions and historical task
   totals are preserved; old completions are never retrospectively credited.
4. Build and host `dist` at the origin root over HTTPS. No live deployment or
   production database import is performed by this repository's build.

Each new completion writes the session, a unique owner-scoped receipt, and the
atomic task increment in one batch. Duplicate retries and uncertain responses
reconcile with the terminal server record. Deleted tasks retain session history
without receiving credit. Schema changes belong only in `pb_schema.json`.

Use these response headers in the hosting configuration:

| Path | Cache-Control |
| --- | --- |
| `/`, `/index.html`, `/sw.js`, `/manifest.webmanifest` | `no-cache` |
| `/assets/*` (hashed filenames) | `public, max-age=31536000, immutable` |
| Unhashed icons and other static files | `no-cache` |

Serve JavaScript with the correct MIME type, serve the worker from `/sw.js`, and
return `index.html` for application navigation. Keep old hashed assets available
during rollout for existing tabs. Workbox precaches all route/editor chunks,
fonts and icons, but never caches PocketBase authentication or API responses.
Updates download in the background and require an explicit **Update app** action;
activation waits while a timer is running/paused, a transition is saving, or a
dialog is open. Production service-worker behavior is intentionally disabled in
`npm run dev`; use a production build and preview to test it.

The optional build variable `VITE_POCKETBASE_URL` overrides the default backend.
Use a separate local server for tests; never point integration tests at production.

## Verification

Run `npm run lint`, `npm test`, and `npm run build` for the standard checks.
`npm run icons` regenerates install icons from the existing concentric-circle mark.
See [PWA verification](docs/pwa-verification.md) for browser checks, isolated
PocketBase test setup, and the remaining physical iPhone checklist.
