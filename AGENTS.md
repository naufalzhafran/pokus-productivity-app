# AGENTS.md

## Project

Pokus is a focus timer and personal workspace. Two clients share one PocketBase backend:

- `web/` — React 19, TypeScript, Vite, and Tailwind CSS PWA. See `web/AGENTS.md`.
- `ios/` — native SwiftUI iPhone app. It is still named **Daily** in Xcode (`ios/Daily.xcodeproj`, scheme `Daily`). See `ios/AGENTS.md`.
- `backend/` — PocketBase schema (`pb_schema.json`), server hooks (`pb_hooks/`), and hook tests (`scripts/`). See `backend/README.md`.

Run web commands from `web/`, Swift package commands from `ios/`, and everything else from the repository root.

## Production Safety

- The production backend is `https://pb1.madebynz.xyz`. Never write to it, import schema into it, or point tests or scripts at it.
- Deploying is manual and out of scope: schema imports, copying `pb_hooks/` to the server, and hosting `web/dist` are done by the owner.
- PocketBase integration tests (`web/scripts/test-*-pocketbase.mjs`, `ios/Scripts/PocketBaseIntegration`) require an isolated local PocketBase. Run them only when one is available; otherwise say they were skipped.

## PocketBase Schema

- `backend/pb_schema.json` is the only record of the schema. Any change to collections, fields, relations, API rules, or indexes updates it in the same change. Never create `pb_migrations` files.
- The schema is imported with **Delete missing collections** disabled, so keep the existing `users` collection and its auth settings untouched.
- Prefer additive changes (new optional fields, new indexes). Existing records and older clients must keep decoding; call out anything that needs a backfill or breaks older clients.
- When a change affects records both clients read or write, update both in the same change: web in `web/src/lib/pocketbase-records.ts` and `web/src/types/`, iOS in `ios/Sources/PokusCore/Models.swift` and `ios/Sources/PokusNetworking/RecordSchema.swift`.
- Update the collection list and notes in `backend/README.md` when a collection is added or its behavior changes.

## Commits

- Commit directly on `main`; do not create feature branches.
- Write short imperative subjects that describe the user-facing change (for example, "Add capture reminders").
- Do not commit generated files (`web/dist`, `web/test-results`, `DerivedData`, `.build`) or local environment files (`.env*`).

## Before Finishing

Run the checks for every area you changed, and report any failure with its output:

| Changed | Run |
| --- | --- |
| `web/` | `npm run lint`, `npm test`, and `npm run build` in `web/` |
| `ios/Sources/` or `ios/Tests/` | `swift test` in `ios/` |
| `ios/` (anything) | `xcodebuild -project ios/Daily.xcodeproj -scheme Daily -destination 'generic/platform=iOS Simulator' build` |
| `backend/pb_schema.json` | `node -e "JSON.parse(require('fs').readFileSync('backend/pb_schema.json','utf8'))"`, plus the web and iOS checks for the clients you updated |
| `backend/pb_hooks/ios_oauth.pb.js` | `node backend/scripts/test-ios-oauth.mjs` |
