# AGENTS.md

## Project

Pokus is a single-page Pomodoro timer built with React 19, TypeScript, Vite, and Tailwind CSS.

The repository holds two clients that share one PocketBase backend:

- Web app: the repository root (`src/`, `e2e/`, `scripts/`).
- iOS app: `ios/` (SwiftUI, Xcode project `ios/Daily.xcodeproj`, Swift packages in `ios/Sources`). See `ios/README.md`.
- Shared backend: `pb_schema.json` and `pb_hooks/` at the root.

When a schema change affects records both clients read or write, update both clients in the same change.

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
- This project manages PocketBase changes through `pb_schema.json` only.
- Do not create or update `pb_migrations` files.

## Before Finishing

Run `npm run lint` and `npm run build`. When `ios/` changes, also build the iOS app (`xcodebuild -project ios/Daily.xcodeproj -scheme Daily -destination 'generic/platform=iOS Simulator' build`). Do not commit generated files from `dist` or local environment files.
