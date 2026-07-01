# Pokus

A single-page Pomodoro timer built with React 19, Vite, and Tailwind CSS.

## Features

- Adjustable Pomodoro duration with a circular control
- Quick presets for 15, 25, 45, and 60 minutes
- Start, pause, stop, and reset controls
- Local countdown persistence while a timer is running

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
│   │   └── timer.tsx
│   └── ui/
│       ├── button.tsx
│       └── modal.tsx
├── lib/
│   └── utils.ts
├── main.tsx
└── styles/
    └── globals.css
```
