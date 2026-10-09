# Pokus

The Pokus web app: a single-page Pomodoro timer built with React 19, Vite, and
Tailwind CSS. Run every command below from this `web/` directory.

## Features

- Adjustable Pomodoro duration with a circular control
- Quick presets for 15, 25, 45, and 60 minutes
- Installable Timer-first PWA (it still opens on the Timer). Desktop navigation lists Timer, Today, Projects, Calendar, Habits, Capture, Knowledge, and Profile; phones show Timer, Today, Projects, Capture, and More (Calendar, Habits, Knowledge, Profile). Old hash links keep working
- Today page: today's focus total with Start focus, Overdue, tasks and project deadlines due today, today's habits, capture reminders, a collapsed Completed list, and New task (due today)
- Install shortcuts for New capture, Start focus, and Today, and a share target (Android and desktop Chrome) that opens Quick capture prefilled with the shared title, text, and link
- A short, dismissible welcome on the Timer for new accounts: pick a length, add a first task, or just start
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
- Run a Pomodoro without attaching a task, and link a task to it while it runs (switching tasks stays blocked)
- The chosen task stays selected while you move around the app until a session starts, you clear it, or it's done or deleted
- When a session ends you stay where you are; the "Pomodoro complete" toast has View to open the timer
- Completion screen: Focus again first, Mark task done (stays on the timer), and View tasks
- Track successful Pomodoro time per task in hours and minutes
- Save or discard elapsed time when stopping a session early, with or without a task; saved time counts toward history and totals
- Start, pause, resume, and stop controls backed by an app-level wall clock
- Accurate timer completion after navigation, tab backgrounding, or visibility changes
- Google OAuth authentication through PocketBase
- User-scoped PocketBase persistence for projects, tasks, focused time, and the active Pomodoro session
- Profile page with account details, focus stats (today, this week, daily streak, total, and a 7-day chart), Pomodoro history, and **Export my data** (one JSON file with projects, tasks, categories, captures, knowledge, habits with entries and targets, and focus history)
- Today's focus total on the idle Timer
- Capture inbox for links and thoughts with rich previews for YouTube videos, social posts, articles, and Google Drive files
- Quick capture works offline or with an expired sign-in: captures are queued in IndexedDB, shown as "Waiting to sync", and sync automatically (link previews are fetched afterward)
- Projects contain captures: add inbox captures to one or more projects, capture straight into a project, and browse them on its Captures tab
- Centaur-style daily habits: check-ins, numeric totals, daily targets, quick increments, editable past entries, activity grids, and streaks
- Account-owned habits synced across browsers, with cached offline browsing. Check-ins and totals made offline are saved on this device and sync later; adding 1 and editing habits need a connection
- Dated numeric targets preserve historical progress when targets change
- Optional per-browser in-app daily reminders while Pokus is open, skipped on days when every habit is already done
- Month calendar and daily agenda for project deadlines, tasks, habits, and capture reminders
- Task due dates override project deadlines; undated work appears in Calendar’s Unscheduled list
- Calendar and Today rows have Focus for open tasks, and the selected day has New task on that date
- New task from the Projects header (project optional) and from the Timer's task picker
- Opening a different project resets its status, priority, and category filters (the sort is kept)
- Deletes and other irreversible actions confirm in the app's dialog
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

The frontend connects to `https://pb1.madebynz.xyz`. The schema, hooks, and
import steps shared with the iPhone app are in [`../backend`](../backend/README.md).

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
loaded tasks work offline. Task and project editing requires a connection; new captures
and habit check-ins/totals queue on the device and sync when the account reconnects. Session
transitions are saved in user-scoped IndexedDB before the controls confirm them;
completed focus sessions queue for automatic sync. Profile shows pending work and
Retry. An expired login allows local use but requires signing in again to sync.
Signing out asks for confirmation, removes the account's cached workspace from the
browser, and leaves pending sessions attached to their account until it signs in again. Browser storage can be cleared by the user or operating system; do not
clear site data while sessions are pending.

Sound works while the app is open and audio has been unlocked by Start, Resume,
or Test sound. The timer keeps ticking in background tabs, and when a session ends
while the tab is hidden, a system notification appears if notifications were allowed
(Pokus asks once, when a timer starts). iOS may suspend background web apps: there
is no push service or locked-screen alarm. Timer deadlines reconcile on return, including lock/unlock.
Wake lock is optional and best effort; it releases when paused or hidden.

## PWA rollout and hosting

Before releasing this frontend:

1. Back up PocketBase, then import `../backend/pb_schema.json` with **Delete missing
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
without receiving credit. Schema changes belong only in `../backend/pb_schema.json`.

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
