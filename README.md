# Pokus

A focus timer and personal workspace: timer, projects and tasks, calendar,
captures, knowledge, and habits, synced through PocketBase.

| Directory | Contents |
| --- | --- |
| [`web/`](web/README.md) | React + Vite PWA |
| [`ios/`](ios/README.md) | Native SwiftUI iPhone app |
| [`backend/`](backend/README.md) | PocketBase schema, hooks, and backend tests |

Both clients use the same PocketBase collections. Import `backend/pb_schema.json`
before releasing either client against a backend.

## Quick start

Web:

```bash
cd web && npm install && npm run dev
```

iOS: open `ios/Daily.xcodeproj` in Xcode and run the `Daily` scheme.
