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
- Start, pause, stop, and reset controls
- Local task, session, and countdown persistence across refreshes

## Tech Stack

- React 19
- TypeScript
- Vite
- Tailwind CSS
- Lucide React icons

## Getting Started

```bash
npm install
npm run dev
```

Open the local Vite URL printed in your terminal.

No environment variables are required.

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
│       ├── button.tsx
│       └── modal.tsx
├── lib/
│   ├── session-storage.ts
│   └── utils.ts
├── hooks/
│   ├── useProjects.ts
│   └── useTasks.ts
├── types/
│   └── task.ts
├── main.tsx
└── styles/
    └── globals.css
```
