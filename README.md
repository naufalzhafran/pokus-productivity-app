# Pokus

A single-page Pomodoro timer built with React 19, Vite, and Tailwind CSS.

## Features

- Adjustable Pomodoro duration with a circular control
- Quick presets for 15, 25, 45, and 60 minutes
- Tasks-first workspace with Tasks, Timer, and Profile hash routes
- Responsive sticky desktop navigation and safe-area-aware mobile navigation
- Search, status filters, four sort modes, and compact or comfortable density
- All tasks grouped by collapsible projects with 25-row progressive loading
- Searchable project navigation with Inbox, active projects, and Archived
- Archive, restore, rename, and delete projects without changing child statuses
- Group tasks under optional projects and move tasks between projects
- Select tasks for bounded-concurrency bulk move, complete, or reopen actions
- Multiline task text up to 2,000 characters with full-text task details
- Derive each project's focused time from its child tasks
- Create and edit tasks through responsive side sheets and mobile drawers
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
`projects`, `tasks`, and `pomodoro_sessions` collections. Their fields,
relations, indexes, and owner-only API rules are available in `pb_schema.json`.

Task titles have a 2,000-character maximum; project titles remain limited to
120 characters. Project archiving uses the existing `projects.isDone` field.
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
instance and run the server so it applies migrations. Deploy the task-title
limit migration before deploying the matching frontend; otherwise PocketBase
will reject task text longer than 120 characters during the rollout window.

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
