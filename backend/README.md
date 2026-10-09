# Pokus backend

The PocketBase schema and hooks shared by the web app (`../web`) and the iPhone
app (`../ios`).

- `pb_schema.json` — every collection, field, relation, API rule, and index.
  It is the only place schema changes are recorded; there are no migration files.
- `pb_hooks/` — server hooks to copy into PocketBase's `pb_hooks` directory:
  `link_preview.pb.js` (capture link previews) and `ios_oauth.pb.js` (native
  OAuth callback).
- `scripts/test-ios-oauth.mjs` — checks the iOS OAuth hook. Run
  `node backend/scripts/test-ios-oauth.mjs` from the repository root.
- `scripts/test-link-preview.mjs` — checks which links the preview hook refuses.
  Run `node backend/scripts/test-link-preview.mjs` from the repository root.

The web client's PocketBase integration tests live in `../web/scripts` because
they exercise web source code.

## Setup

The web app connects to `https://pb1.madebynz.xyz`. The backend provides the
`projects`, `tasks`, `categories`, `captures`, `knowledge`, `habits`,
`habit_entries`, `habit_targets`, `pomodoro_sessions`, and
`pomodoro_completion_receipts` collections. Their fields,
relations, indexes, and owner-only API rules are available in `pb_schema.json`.

Copy `pb_hooks/link_preview.pb.js` into your PocketBase `pb_hooks` directory to
enable capture link previews. It adds an authenticated
`GET /api/pokus/link-preview?url=` route that reads public page metadata
server-side. Without it, captures still work and fall back to built-in YouTube
thumbnails and type-specific cards. The hook only fetches public hostnames on ports
80 and 443; it refuses IP addresses, names that embed one (such as `nip.io`
hosts), private suffixes and trailing dots. PocketBase's HTTP client resolves DNS
and follows redirects itself, so a public name that points at a private address
can only be blocked at the network level (for example, a firewall rule denying the
PocketBase container access to private ranges and `169.254.169.254`).

New and renamed task titles have a 160-character maximum; project titles remain
limited to 120 characters. Existing legacy task titles are preserved when only
metadata changes. Project lifecycle status is independent of archiving, which
continues to use the existing `projects.isDone` field.
Archived projects retain their child tasks and statuses.

To import them from the PocketBase Dashboard:

1. Open **Settings → Import collections**.
2. Paste the contents of `pb_schema.json`.
3. Leave **Delete missing collections** disabled so the existing `users`
   collection and Google OAuth settings remain unchanged.
4. Confirm the import.

Re-import the schema with **Delete missing collections** disabled after pulling
schema updates. PocketBase will update the existing collections without deleting
their records or changing the Google OAuth configuration.

Import the updated `pb_schema.json` before deploying the matching frontend.
Project and task due dates are stored as `YYYY-MM-DD` text so calendar days do not
drift across time zones. Tasks use their own date or inherit their project's
deadline. Clearing an override restores inheritance; moving or deleting a project
recomputes the task's effective date. Archived projects and their tasks are hidden
from Calendar. Calendar opens at `#calendar`; a date and optional capture can be
linked as `#calendar/YYYY-MM-DD/<capture-id>`. Existing `#habits` links still work.

Captures use `reminderAt` (integer epoch milliseconds, zero when absent) and
`reminderDone` (independent of `isProcessed`). Scheduling requires a future time;
completion retains the dated entry, and rescheduling reopens it. Reminders display
in the current device timezone. Web alerts appear only while the app is visible,
with browser-wide, account-scoped deduplication and a catch-up notice on return.
Native alerts are scheduled after the iPhone app syncs; changes made on the web,
including cancellation, reach the phone after its next sync. Existing daily habit
reminders remain independent.

Import the updated schema before releasing either client. This change adds fields
and indexes only; existing records decode safely without a backfill. Calendar
does not add a collection, a push service, or external calendar synchronization.

Habits require the three habit collections in this schema and PocketBase batch
requests enabled (Settings → Application, at least three requests per batch).
Numeric habit creation saves the habit and its initial target in one transaction.
Daily entries and target revisions have unique habit/day indexes; numeric quick
increments use atomic field increments. Dates are Gregorian `YYYY-MM-DD` local
calendar days, independent of focus sessions. The habit type and unit are fixed
after creation, and target edits take effect today without rewriting earlier days.
Deleting a habit cascades to its entries and targets.

Web habits do not import or sync Centaur's existing local native habit database.
Reminder preferences stay on each browser. Web reminders show inside the app while
it is open; background/Lock Screen reminder scheduling remains a native feature.
No live server schema is changed by this repository edit: import the schema before
deploying the frontend.

