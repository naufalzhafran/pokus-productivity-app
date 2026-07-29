# Pokus

A single-page Pomodoro timer built with React 19, Vite, and Tailwind CSS.

## Features

- Adjustable Pomodoro duration with a circular control
- Quick presets for 15, 25, 45, and 60 minutes
- Tasks-first workspace with Tasks, Timer, and Profile hash routes
- Responsive sticky desktop navigation and safe-area-aware mobile navigation
- Smart Today, Upcoming 7 days, and Overdue views with live counts
- Flat responsive task rows with 25-row progressive loading and detail overlays
- Searchable project navigation grouped by Planned, Active, On hold, Completed, and Archived
- Archive, restore, rename, and delete projects without changing child statuses
- Group tasks under optional projects and move tasks between projects
- Task priority, reusable single categories, rich descriptions, and project due dates
- Search plus completion, priority, and category filters with smart task ordering
- One-line task titles up to 160 characters; legacy long or multiline titles remain preserved until renamed
- Derive each project's focused time from its child tasks
- Create and edit tasks through accessible modals
- Persistent task creation, selection, completion, and reopening
- Set up a Pomodoro from a task and choose its duration before starting
- Run a Pomodoro without attaching a task
- Track successful Pomodoro time per task in hours and minutes
- Save or discard elapsed task time when stopping a session early
- Start, pause, resume, and stop controls backed by an app-level wall clock
- Accurate timer completion after navigation, tab backgrounding, or visibility changes
- Google OAuth authentication through PocketBase
- User-scoped PocketBase persistence for projects, tasks, focused time, and the active Pomodoro session
- Profile page with account details, focus totals, and Pomodoro history

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
`projects`, `tasks`, `categories`, and `pomodoro_sessions` collections. Their fields,
relations, indexes, and owner-only API rules are available in `pb_schema.json`.

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

For an existing PocketBase deployment, copy `pb_migrations` into the PocketBase
instance and run the server so it applies migrations. Deploy the backend migration
before the matching frontend. Project due dates are stored as `YYYY-MM-DD` text so
calendar days do not drift across time zones. Tasks inherit their project's date in
Today, Upcoming, Overdue, and due-date sorting; unassigned tasks remain undated.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run test` - Run the Vitest suite
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

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
