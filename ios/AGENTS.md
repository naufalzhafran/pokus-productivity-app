# AGENTS.md (ios)

Repository-wide rules, including production safety and schema changes, are in `../AGENTS.md`. Architecture details are in `Docs/PokusNative.md`.

## Naming

The app shows as **Pokus** but is built from the original Daily project: `Daily.xcodeproj`, scheme `Daily`, and bundle identifier `com.centaurwarrunner.Daily`. Do not rename the project, targets, or bundle identifier, and do not change the legacy Daily habit store or its reminder preference keys; existing installs upgrade in place.

## Layout

- `Daily/` — SwiftUI app target (screens in `Daily/Pokus`, services, assets, privacy manifest).
- `PokusActivity/` — Live Activity widget extension.
- `Sources/` — the local `DailyKit` Swift package:
  - `DailyCore`, `DailyPersistence` — legacy habit models and SwiftData storage.
  - `PokusCore` — PocketBase wire records, workspace rules, and the timer session engine.
  - `PokusPersistence` — timer recovery and pending operations.
  - `PokusNetworking` — PocketBase client and the offline-first `RecordReplica`.
- `Tests/` — package tests that run on macOS with `swift test`.
- `DailyTests/`, `DailyUITests/` — simulator tests.

## Guidelines

- Put logic in the Swift package rather than the app target so it is covered by `swift test`, and add tests there for new logic.
- The app is offline first: screens read from `RecordReplica`, and writes apply locally then sync through its outbox. Route new reads and writes through it instead of calling PocketBase directly.
- Do not add third-party dependencies, analytics, or CloudKit sync.
- Use standard iOS colors and support Dynamic Type, dark mode, and VoiceOver.
- Do not change signing settings or the development team in the project file.

## Checks

- `swift test` in `ios/` for package changes.
- `xcodebuild -project ios/Daily.xcodeproj -scheme Daily -destination 'generic/platform=iOS Simulator' build` from the repository root for any iOS change.
- Simulator tests (`xcodebuild ... test` with a specific simulator) are slower; run them when changing app-target behavior. See `README.md` → Verification.
