# AGENTS.md

## Project

Pokus is a single-page Pomodoro timer built with React 19, TypeScript, Vite, and Tailwind CSS.

## Development

- Install dependencies with `npm install`.
- Start the development server with `npm run dev`.
- Run ESLint with `npm run lint`.
- Create a production build with `npm run build`.

## Code Guidelines

- Keep components small, typed, and focused on one responsibility.
- Reuse existing UI components and utilities before adding new abstractions.
- Use the `@/` alias for imports from `src`.
- Follow the existing Tailwind and CSS conventions.
- Remove unused code, exports, dependencies, and files.
- Preserve accessibility labels and reduced-motion behavior.

## PocketBase Schema

- Whenever the PocketBase schema changes—including collections, fields, relations, API rules, or indexes—update `pb_schema.json` in the same change.
- Keep `pb_migrations` aligned with `pb_schema.json` when the schema change requires a deployable migration.

## Before Finishing

Run `npm run lint` and `npm run build`. Do not commit generated files from `dist` or local environment files.
