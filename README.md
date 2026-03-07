# Pokus

A distraction-free deep work environment built with React 19, Vite, and Supabase.

## Features

- **Focus Timer**: Distraction-free timer for deep work sessions with customizable duration
- **Project Management**: Organize your work into projects with tasks
- **Session History**: Track your focus sessions with weekly dashboard
- **Offline Support**: Works offline with automatic sync when back online
- **PWA Ready**: Install as a native app with service worker support

## Tech Stack

- **Frontend**: React 19, React Router 7, TypeScript
- **Styling**: Tailwind CSS, Radix UI
- **Backend**: Supabase (Auth, Database)
- **Local Storage**: IndexedDB (via idb) for offline-first data
- **Build Tool**: Vite
- **PWA**: vite-plugin-pwa

## Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) with your browser.

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint

## Project Structure

```
src/
├── api/           # API clients (auth, focus, projects)
├── components/    # React components
│   ├── features/  # Feature-specific components
│   └── ui/        # UI primitives
├── contexts/      # React contexts
├── hooks/         # Custom hooks
├── lib/           # Utilities and sync logic
├── pages/         # Page components
├── styles/        # Global styles
├── main.tsx       # Entry point
└── router.tsx     # Route definitions
```

## Deployment

### Vercel (Recommended)

```bash
npm i -g vercel
vercel
```

Or connect your GitHub repository to Vercel for automatic deployments.

### VPS/Nginx

See [DEPLOY.md](./DEPLOY.md) for detailed VPS deployment instructions.

## License

MIT
