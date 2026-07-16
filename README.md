# Pokus

A single-page Pomodoro timer built with React 19, Vite, and Tailwind CSS.

## Features

- Adjustable Pomodoro duration with a circular control
- Quick presets for 15, 25, 45, and 60 minutes
- Separate Tasks and Timer pages with lightweight hash navigation
- Group tasks under optional projects and move tasks between projects
- Derive each project's focused time from its child tasks
- Create projects and tasks through dedicated modal forms
- Persistent task creation, selection, completion, and reopening
- Set up a Pomodoro from a task and choose its duration before starting
- Run a Pomodoro without attaching a task
- Track successful Pomodoro time per task in hours and minutes
- Save or discard elapsed task time when stopping a session early
- Start, pause, resume, and stop controls
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

To import them from the PocketBase Dashboard:

1. Open **Settings → Import collections**.
2. Paste the contents of `pb_schema.json`.
3. Leave **Delete missing collections** disabled so the existing `users`
   collection and Google OAuth settings remain unchanged.
4. Confirm the import.

Re-import the schema with **Delete missing collections** disabled after pulling
schema updates. PocketBase will update the existing collections without deleting
their records or changing the Google OAuth configuration.

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Project Structure

```text
src/
├── App.tsx
├── components/
│   ├── features/
│   │   ├── CircularDurationInput.tsx
│   │   ├── SessionTask.tsx
│   │   ├── TaskPanel.tsx
│   │   └── timer.tsx
│   └── ui/
│       └── ...
├── lib/
│   ├── pocketbase.ts
│   ├── pocketbase-records.ts
│   └── utils.ts
├── hooks/
│   ├── usePomodoroSession.ts
│   ├── useProjects.ts
│   └── useTasks.ts
├── types/
│   └── task.ts
├── main.tsx
└── styles/
    └── globals.css
```
