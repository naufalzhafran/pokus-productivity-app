# AGENTS.md

## Project

Pokus is a focus timer and personal workspace with two clients that share one PocketBase backend:

- `web/` — React 19, TypeScript, Vite, and Tailwind CSS PWA. See `web/AGENTS.md` and `web/README.md`.
- `ios/` — native SwiftUI iPhone app (Xcode project `ios/Daily.xcodeproj`, Swift packages in `ios/Sources`). See `ios/README.md`.
- `backend/` — PocketBase schema (`pb_schema.json`), server hooks (`pb_hooks/`), and backend-only tests. See `backend/README.md`.

Run web commands from `web/`, and iOS builds against `ios/Daily.xcodeproj`.

## PocketBase Schema

- Whenever the PocketBase schema changes—including collections, fields, relations, API rules, or indexes—update `backend/pb_schema.json` in the same change.
- This project manages PocketBase changes through `backend/pb_schema.json` only.
- Do not create or update `pb_migrations` files.
- When a schema change affects records both clients read or write, update both clients in the same change.

## Commits

- Commit directly on `main`; do not create feature branches.
- Do not commit generated files (`web/dist`, Xcode build output) or local environment files.

## Before Finishing

- When `web/` changes: run `npm run lint` and `npm run build` in `web/`.
- When `ios/` changes: run `xcodebuild -project ios/Daily.xcodeproj -scheme Daily -destination 'generic/platform=iOS Simulator' build`.
- When `backend/pb_hooks/ios_oauth.pb.js` changes: run `node backend/scripts/test-ios-oauth.mjs`.
