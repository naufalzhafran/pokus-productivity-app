# Pokus native implementation

Pokus extends Daily in place. Open `Daily.xcodeproj`, choose the **Daily** scheme,
and run on an iPhone with iOS 17 or later. The visible name is Pokus. The bundle
identifier remains `com.centaurwarrunner.Daily`; do not change it, the signing team,
or uninstall Daily when testing an upgrade with existing habits.

## Architecture

- `DailyCore` and `DailyPersistence` retain the existing habit models, day keys,
  SwiftData container, and reminder preference keys.
- `PokusCore` defines PocketBase wire records, workspace rules, the wall clock
  session engine, pending operations, terminal guards, and Live Activity attributes.
- `PokusPersistence` stores only atomic timer recovery, pending operations, and
  terminal guards per account in Application Support/Pokus. Account records live in
  the separate replica below. Upgrade migration
  independently preserves each legacy account's timer before removing downloaded
  workspace, library, habit, and history caches, including recovery copies.
  Corrupt or unwritable timer copies are preserved for recovery.
- `RecordReplica` (in `PokusNetworking`) is the offline-first store, under
  Application Support/Pokus/Replica/<account>. `PocketBaseClient.routing(through:)`
  answers record reads and writes from it, interpreting the same filter, sort, paging,
  `fields`, `expand`, back-relation, and batch contracts as PocketBase (`RecordFilter`
  is shared with the UI-test backend). Writes apply locally at once and append to a
  durable outbox; `push` replays it in order (lost create responses reconcile by ID,
  rejected changes are set aside for retry or discard, a knowledge body also edited
  elsewhere is kept and this device's text saved as a draft copy). `pull` downloads
  rows with `updated` after a per-collection keyset cursor and reconciles deletions by
  ID every six hours or on pull to refresh. Retention keeps every row's metadata but
  trims the large text of finished and older items (detail screens refetch it online),
  keeps focus sessions for 90 days and habit entries from January 1 of last year, and
  folds older history into a focus total and per-habit streak baselines first. Queries
  the device can't answer completely (older history, searches over trimmed text) go
  online through the bounded display cache. Before the first full download finishes,
  the earlier cached-read path is used; afterwards those saved responses are cleared.
- `PokusNetworking` implements the PocketBase REST APIs using URLSession.
  Completion batches upsert the session, create its unique receipt, and increment
  task focus time atomically. Terminal remote records win on retries.
- `PokusModel` coordinates credentials, in-memory records, local transitions, foreground
  refresh, connectivity, and bounded sync retries. Tokens use a device-only Keychain
  item. Signing out locks account snapshots without erasing pending work.
- Timer, workspace, library, and habits have separate observable state. Lists use
  shared paging coordinators with 25-row batches, ID deduplication, cancellation,
  account/query generation guards, and separate initial/append error states.
  Typed editor commands own validation and wire encoding. Injected storage,
  credentials, transport, and timer surfaces support deterministic coordinator tests.
- Capture previews capture an account generation and are cancelled at account
  changes; late responses cannot write into a different account. Editors keep a
  stable creation ID across retries. Lost POST/batch responses reconcile that ID
  before reporting failure. Timer commits use an independent saving flag.
- Workspace edits apply returned records in memory and invalidate affected reads.
  Detail and editor screens fetch records by ID; selectors retain off-page IDs.
  Search waits 300 ms and scans projected fields for HTML and locale-aware matches.
  Project and Smart/Priority task ordering use stable query segments with ID ties.
  Collection counts, focus totals, and habit statistics are separate from loaded rows.
  Habit reads split into compact day indexes, visible rows, selected-year activity,
  and streaming lifetime streak accumulators. Display responses have a bounded
  disk cache; durable timer and outbox writes remain separate.
  Foreground maintenance wakes at deadlines, midnight, or pending sync retries.
- `PokusActivity` is the embedded WidgetKit extension for Live Activities. It uses
  supplied deadlines rather than background per-second execution. It requires no
  push registration or shared App Group storage.

Habits, Timer, and workspace first use require Google
sign-in. Once signed in and downloaded, expired authentication or no connection keeps
browsing and editing available; queued changes sync after reconnecting or reauthenticating.
A background app refresh task (`com.centaurwarrunner.Daily.refresh`) also sends and
downloads changes. Habits use the existing `habits`, `habit_entries`, and `habit_targets`
collections with their owner rules. Date-only history and dated targets use the
same SHA-256 daily record IDs and batch upserts as the web app. Signing out hides
account habits and cancels their reminder without clearing reminder preferences.
Recently opened lists and details are stored in an account-scoped display cache
under Library/Caches, separate from timer recovery and pending operations. Cached
responses render before background revalidation, including after relaunch and
offline. First-time reads and edits require connectivity. Explicit sign-out clears
the account's downloaded copies. PocketBase still uses an ephemeral URLSession;
only display reads opt into the app-managed cache, without saving bearer tokens.
The preserved legacy Daily SwiftData database is opened only for explicit local
preview/test mode; local habits are not attached or uploaded to an account.
Use only one client to control a running session. The app restores
the latest remote running session only if local state and pending operations are
empty. No server lock or coordinated device handoff is introduced.

Existing project/task descriptions are rendered as attributed text without a web
view, scripts, or remote resource loading. Existing HTML is omitted from metadata
PATCH requests, preserving it verbatim. New descriptions become escaped paragraph
HTML. Capture notes and Knowledge bodies are also preserved during metadata edits.
Their editors offer an explicit plain-text replacement, with a formatting warning.
Project metadata edits omit capture links; dedicated filing actions use relation
modifiers to preserve unrelated links.

The bottom bar contains Pocus, Today, Capture, Library, and Profile. Its center
Capture tab opens a single multiline input for a link or thought; saving returns
to the previous tab. There is no Cancel button in this tab, and switching tabs
preserves the draft. New captures detect link types automatically
and keep accompanying text as the note. Saved captures retain the detailed editor
for titles, types, links, authors, and notes. Projects are reached through Library.

Library contains projects, a capture inbox, project filing, link previews, Knowledge notes,
source links, and scheduled reviews. Quick capture accepts text or HTTP(S) links.
Review intervals match the web app: 1, 3, 7, 21, and 60 days at local midnight.
Library lists load independently as their screens appear. Pull-to-refresh replaces
the active query, and the accessible Load more/Retry footer handles continuation.

## Google sign-in deployment

1. Deploy `backend/pb_hooks/ios_oauth.pb.js` from this repository into the existing
   PocketBase server's hooks directory. Restart/reload hooks as appropriate for
   that server. This adds `GET /api/pokus/ios-oauth`; it makes no schema changes.
2. Add `https://pb1.madebynz.xyz/api/pokus/ios-oauth` as an authorized redirect URI
   on the existing Google web OAuth client configured in PocketBase. Keep the
   existing `/api/oauth2-redirect` redirect URI for the web app.
3. The relay forwards code/state or error to the fixed `pokus://oauth` scheme.
   The app validates state, then exchanges code/verifier with PocketBase. Client
   secrets remain on the server. Do not log OAuth query parameters at the proxy.
4. Validate successful sign-in, user cancellation, rejection, and reauthentication
   on the iPhone. Server deployment and Google console configuration are external
   setup steps, not performed by building the repositories.

## Design direction

Use Pokus's existing concentric-circle icon with standard iOS accent and semantic
background/text colors. Native lists
and sheets support familiar iPhone interaction; system typography supports Dynamic
Type. The countdown and blue circular ring are the focus screen's primary visual
element. The ring adjusts duration before starting and shows remaining progress
during a session. Existing habit
activity grids retain their meaning. Appearance follows System by default with
Light and Dark options. Energy 1, Rhythm 2, Motion 1: quiet focus, denser workspace,
and no decorative motion. SF Symbols identify actions and destinations. Existing
habit reduced-motion behavior remains; new screens add no decorative animations.

The shared Google sign-in button uses Google's official multicolor asset from
https://developers.google.com/static/identity/images/g-logo.png. It has light/dark
neutral surfaces, a visible outline, a 50-point minimum touch target, and a
connecting state. System typography scales with Dynamic Type; branding reference:
https://developers.google.com/identity/branding-guidelines.

## Automated verification

### Simplified Pocus setup, October 7, 2026

The idle timer shows the ring, centered countdown, and Start focus. Adjust duration,
Add a task, Focus, and the visible drag instruction are removed, along with the two
setup sheets. Ring dragging and VoiceOver duration adjustment remain available.
Tasks selected through Library still show their title with a clear action before
starting; the running and completed session actions retain their existing behavior.

Design read: a calm native focus timer, Energy 1 / Rhythm 1 / Motion 1. The existing
blue ring identifies duration and progress; system typography with fixed-width
digits keeps the countdown stable. Removing setup rows lets the ring center in
the available space above the bottom action. Semantic colors retain both appearances;
the conditional clear icon removes a task and has a 44-point target.

The generic iOS Simulator build and build-for-testing pass. A signed build and five
targeted UI tests also pass on the connected iPhone 17 Pro running iOS 27.0, with
zero failures or runtime warnings reported by XCTest. Live coverage includes ring
dragging to 30 minutes, Start, Pause/Resume across tabs, centered Stop confirmation,
Continue, Discard, portrait/landscape bounds without scrolling, both appearances,
and the largest Dynamic Type size. The tests use the isolated in-memory backend,
test account, and separate timer storage/preferences; production records are not used.
Device Hub inspection and the original screenshot attachments confirm the removed
labels are absent and the timer, actions, and tab bar fit without clipping. A fresh
on-device recheck of the largest-text landscape screen also renders fully.

The first device test build reported `Signing for "DailyUITests" requires a
development team` (also for `DailyTests`). Retrying with the app's existing team
as a command-line build setting succeeded; project signing settings were unchanged.
Test compilation retains existing actor-isolation warnings in
`PokusUITests.setUpWithError`. Manual VoiceOver and smaller-device checks remain
unverified; no simulator runtime is installed.

### Design and performance fixes, October 2, 2026

`swift test` passes 51 package tests (18 Daily and 33 Pokus). The production
coordinator also passes six tests through `sh Scripts/test-model.sh`: delayed
previews during account switching, independent timer/save behavior, duplicate
submissions, idle sync, stale refreshes, and rich-description/link preservation.
The harness substitutes only platform services and executes the actual model and
networking/storage code. Those same tests are included in the iOS unit-test target.
The iOS app, extension, and test targets build with complete strict concurrency
checking and no Swift compiler warnings. No device UI execution is claimed here.
The isolated PocketBase integration suite also passes, including lost create and
capture-batch responses, duplicate retries, and late offline history refresh.
Legacy blank project status/task priority fields now decode to their defaults.

Release-mode synthetic measurements on the development Mac, median of five runs:

| Workload | Before | After |
| --- | ---: | ---: |
| Convert 20 habits / 7,300 entries | 33.32 ms | 3.23 ms |
| Generate the yearly grid for one render | 105.25 ms | 1.93 ms |
| Format 365 accessibility date labels | 77.94 ms | 1.26 ms |
| Commit timer with a 4.8 MB account cache | 52.95 ms | 0.33 ms |

History conversion now occurs only on data changes; grid generation occurs once
per body evaluation. Date labels use Foundation's cached format styles. Timer
write size is independent of downloaded library/habit data. These measurements
are not iPhone frame-time or energy measurements.

### Pocus screen without scrolling, October 2, 2026

The Pocus page uses the available viewport directly, with no ScrollView. The ring
shrinks to the space left after notices and the duration/task controls; Start,
Pause/Resume, and Stop remain above the tab bar. Duration and task actions sit
together below the ring. Short landscape layouts put these secondary controls
beside the ring. Small rings omit secondary captions and reduce the clock size;
the full countdown and duration adjustment remain available to VoiceOver. Long
task titles truncate on the picker button and use two lines during a session.
The duration and task-selection sheets retain their scrolling content.

Design reasons: the available viewport determines ring size so no page scrolling
is needed; grouping preparation controls reduces the gaps in the supplied
screenshot; the blue dial remains the focal point and primary actions retain
their bottom safe area. Energy 1, Rhythm 1, Motion 1 remain unchanged.

A UI regression checks portrait and landscape control bounds and verifies an
outside-ring swipe leaves the dial in place. The updated TimerView and dial
compiled, and the UI-test target compiled using the saved Xcode compiler
invocation. The full build-for-testing was blocked by a concurrent RootView
change referencing HabitsView before that view existed. Device execution is
pending; no visual or click-through pass is claimed.

### Pocus circular control and centered confirmation, October 2, 2026

The focus screen and first tab are named Pocus. The stop confirmation uses a native
centered alert with Continue, Discard session, and Save elapsed time when a task is
attached. The blue circular ring surrounds the countdown in setup and running
states. Before starting, dragging around the ring sets 1–60 minutes; crossing
twelve o'clock clamps at the limits instead of jumping between them. VoiceOver
can increment/decrement the duration. During a session the ring only displays
remaining progress. Existing duration presets and the Stepper remain available
in Adjust duration.

Design reasons: blue restores the user's requested circular control; the ring
keeps duration and progress next to the countdown; native alerts center the stop
decision and provide system focus/dismissal behavior; system typography, semantic
surfaces, and existing spacing preserve Dynamic Type and both appearances.
Energy 1, Rhythm 1, Motion 1; no decorative animation was added.

Verification: the iPhone app build and build-for-testing passed; `swift test`
passed 18 Daily and 22 Pokus tests. UI regressions cover ring dragging, a read-only
running ring, the centered alert, Continue, and Discard. Physical-device
visual/interaction verification is pending; compiling these tests is not a
click-through pass. The web repository was restored with no remaining changes.

### Minimal Timer page, October 2, 2026

The user-supplied Timer screenshot showed a thick accent ring, repeated focus
labels, and a duration card competing with the countdown. The Timer now uses a
large, lightweight countdown, an inline navigation title, and structural whitespace.
The main action remains above the tab bar. Duration presets and the 1–60 minute
stepper move into an Adjust duration sheet; task selection becomes a quiet text
action. Running sessions show a thin neutral progress line, Pause/Resume, and a
plain Stop action with the existing save/discard confirmation. Completion uses
the concise Session complete heading.

Design reasons: system typography and fixed-width digits keep the changing time
readable and stable; system background/text colors adapt to appearance; the accent
prioritizes Start and Pause/Resume; removing the ring and preparation cards makes
time the focal point; the duration sheet keeps occasional settings available
without occupying the focus screen. Chevron, plus/list, and playback symbols
identify real actions. Timer dials: Energy 1, Rhythm 1, Motion 1. No decorative
animation was added. Accessibility text sizes retain scrolling, a two-column
preset grid, and vertically stacked session actions. Controls retain 44-point
minimum touch targets and the spoken countdown.

Verification: signed iPhone build passed; `swift test` passed 18 Daily and 22
Pokus tests. The companion web repository's required lint and production build
passed with no source changes. Application Support was backed up to
`/tmp/pokus-minimal-timer-backup` before installing the update over the existing
app. CoreDevice confirmed installation and launch on the connected iPhone 17 Pro.

Device Hub computer-use access returned `timeoutReached` by display name and
bundle identifier, including after resetting the session. No live screenshot,
console check, or click-through is claimed. Source review confirms: Adjust duration
opens the sheet; presets and Stepper write the existing duration preference;
Done closes the sheet; Add a task opens the existing task picker; Start,
Pause/Resume, Stop, and Focus again retain their existing model actions. Live
interaction, both appearances, and layout at small/landscape and accessibility
sizes remain pending visual acceptance.

### UI refinement, October 2, 2026

Assessment used the SwiftUI source and a user-supplied Device Hub screenshot of
Projects. Direct Device Hub access repeatedly returned `timeoutReached`, including
after resetting the computer-use session. No live before/after walkthrough is
claimed. At the user's request, a signed device build subsequently passed and
was installed over the existing app on the connected iPhone 17 Pro using the same
`com.centaurwarrunner.Daily` identifier. CoreDevice confirmed installation and
successful launch. Device Hub and Xcode computer-control connections still time
out, so visual acceptance and interaction checks remain pending.

- Timer actions now use a bottom safe-area inset so Start, Pause, Resume, Stop,
  and Focus again remain available without scrolling through the timer settings.
- The focus ring remains the main visual. Accessibility text sizes use a scalable
  countdown and linear progress instead, with vertically stacked session actions.
- Duration presets have a 44-point label/hit region and a visible selection border;
  selected state does not depend on color. The task picker adds selection checkmarks,
  selected accessibility traits, and empty/search-result explanations.
- Projects start with the project list. The toolbar menu contains the existing
  filters, unassigned tasks, and categories; its current filter appears as the list
  heading. Project metadata uses subheadline text and wraps vertically.
- Task filters collapse behind a summary of the current selection, with Reset
  filters available for nondefault settings. Project management uses a toolbar
  menu, retaining the existing delete confirmation.
- Library destinations combine their purpose and actual saved/due counts in one
  row, replacing the separate totals section.

Design reasons: semantic system surfaces preserve light/dark adaptation; system
typography supports Dynamic Type; the existing accent emphasizes focus progress
and primary actions; grouped settings separate preparation from the countdown;
SF Symbols identify actual actions and destinations. No decorative animation or
new branding assets were added. Energy 1, Rhythm 2, Motion 1 remain unchanged.

Verification: native build passed; 18 Daily and 22 Pokus package tests passed;
the native unit/UI test targets compile with `build-for-testing`. The companion
web repository's required lint and production build also passed without source
changes. Device verification is still pending: check every changed menu/action,
small-screen and landscape layouts, both appearances, VoiceOver, largest Dynamic
Type, and the bottom action area above the iOS tab bar. Compilation is not a
visual or interaction acceptance pass.

From Centaur:

```sh
sh Scripts/test-portable.sh
sh Scripts/test-model.sh
swift test
xcodebuild -project Daily.xcodeproj -scheme Daily -destination 'platform=iOS Simulator,name=YOUR_SIMULATOR' test
```

The portable script runs the Foundation-only Swift Testing suite separately, so
it can run without XCTest or SwiftData compiler plugins. Full package and iOS tests
require Xcode. Select a signing team for both Daily and PokusActivity in Xcode.
Never delete real app data to make a test pass.

The UI suite uses `-ui-testing` with independent in-memory habit data and a separate
PokusUITests directory and separate preferences. `-ui-testing-pokus` adds a fake
account and an in-memory PocketBase transport for editor and review interactions.
Sync and native notification/Live Activity effects are disabled in this mode;
it never touches production, normal preferences, or the normal Keychain item.

For isolated backend verification, follow the PocketBase setup in the web
repository's `docs/pwa-verification.md`, import its schema through
`npm run test:pocketbase`, then run:

```sh
swift run --build-system native PokusIntegration http://127.0.0.1:8099
```

The integration executable rejects remote hosts. It tests real native batch
credit, duplicate completion, uncertain response recovery, deleted tasks, terminal
immutability, workspace decoding, capture filing, HTML preservation, Knowledge
sources, review scheduling, relation cleanup, and the offline replica (queued creates,
delta pulls, deletion reconcile, habit upserts, streak parity, and note conflict copies). The web callback has a standalone test:
`node backend/scripts/test-ios-oauth.mjs` (from the repository root).

## Release gate

### UI and performance refinement (October 5, 2026)

Editors freeze their submitted values, show Saving…, and preserve drafts after
failure. Dirty drafts require Keep editing or Discard changes; swipe dismissal is
blocked while dirty or saving. Capture preview work can be cancelled before the
write begins. Optional previews have a two-second deadline and request timeout;
the capture still saves when metadata is unavailable. Stable creation IDs remain
unchanged across retries.

Habit writes apply confirmed batch records locally instead of downloading all
three collections again. Daily record lookup remains to preserve older IDs.
One validated snapshot supplies both histories and persistence. Refresh requests
coalesce per account; workspace, library, and habits load concurrently after
authentication. Account changes cancel obsolete reads and discard late results.

Loading, unavailable, already-loaded, and successfully empty library states are distinct.
Write errors stay in the initiating editor or sheet, and retry actions repeat the
failed write. Upgrade discards reconstructible caches only after preserving the
timer and outbox; unreadable durable timer data remains an explicit storage failure.

The timer remains scroll-free. Portrait retains the established ring hierarchy;
landscape places the ring beside controls. Accessibility layouts use existing
duration/task sheets through compact, labelled controls with 44-point targets.
Clock, task-list, and checkmark symbols describe those existing actions. Countdown
numerals have a 44-point minimum and capped scaling to fit compact space. Redundant
captions are omitted; task and pending-sync information remain available to
accessibility. Per-second rendering runs only while the active timer is visible
and foregrounded. Colours, branding, and normal portrait presentation are retained.

Regression checks pass: 56 package tests and 13 coordinator tests. The app, Live
Activity extension, unit tests, and UI tests compile for iOS with a deployment
target of iOS 17. Physical iPhone tests use the isolated fake-account mode described
above. All ten Pokus UI tests pass across the device runs, including delayed/failed
save and dirty-dismissal flows, captures and knowledge review, initial loading,
timer pause/resume, signed-out guards, and scroll-free portrait/landscape at the
normal and AX5 text sizes. AX5 screenshots were inspected in light and dark
appearances. Device screenshots are retained as XCTest attachments. These checks do not
replace an iOS 17 device run, VoiceOver and AX1–AX4 walkthroughs, long-title/error
layout checks, or Instruments launch/check-in/refresh/scrolling measurements.
No measured speed or energy improvement is claimed.

Xcode is installed. Full `swift test` passes: 18 habit core/persistence tests and
38 Pokus tests, plus 13 coordinator tests through `sh Scripts/test-model.sh`.
The iOS app, Live Activity extension, unit tests, and UI tests
compile successfully. The expanded native integration executable passes against
an isolated PocketBase 0.40.4 server. Google sign-in on the iPhone was confirmed by
the user after deploying the callback and registering its Google redirect URI.

Simulator testing is excluded at the user's request. Physical-device UI testing,
notification/Live Activity walkthroughs, and populated Daily upgrade verification
are tracked separately; compilation and backend checks do not satisfy those gates.

The signed build installs on the connected iPhone, and all five native reminder
unit tests pass there. XCTest device automation now works; Device Hub screen access
previously timed out. Application Support was backed up before
installation and compared afterward: habit-store table counts are unchanged.
This phone's habit store is empty, so this is not the populated Daily upgrade test.
Habit backend checks also pass for anonymous access, cross-account reads/writes,
daily upsert retries, historical targets, and cascading deletion. No PocketBase
schema changes or migrations were needed for authenticated native habits.

Implementation is not device-release verified until every item below passes:

- Install over an existing Daily installation with populated habits. Check entries,
  target revisions, habit history, and reminder preferences in the legacy database.
  Verify Habits requires sign-in, account switching hides the previous account,
  previously opened records remain available after an offline relaunch along with
  the timer. Uncached reads require connectivity. Legacy import is deferred.
- Exercise every tab, editor, filter, category action, project lifecycle operation,
  task completion/reopening, task move, early-stop choice, and Profile action.
- Check light/dark/System appearance, large Dynamic Type, VoiceOver, landscape,
  touch targets, safe areas, keyboard-open sheets, and reduced motion.
- Run/pause/resume across tabs, lock/unlock, force quit/relaunch, and clock changes.
  Complete offline, reconnect, and verify exactly one task credit and receipt.
- Sign out with pending operations, sign in as another user, and verify no data
  crossing. Return to the original account and recover pending sessions.
- Deny notifications and disable Live Activities; timer controls must still work.
  Verify foreground feedback, locked-screen notification delivery, cancellation
  on pause/stop, notification routing, Dynamic Island countdown, and stale activity
  cleanup after returning to the app. No background execution at expiry is assumed.
- Run full SwiftData/package tests, native UI tests, and an iOS build with Xcode.

No public App Store/TestFlight release, push service, home widget, legacy habit import,
rich-description editor, offline workspace edits, or coordinated device handoff
is included in this version. Capture and Knowledge support native plain-text
editing and viewing existing rich descriptions.

## Library organization (October 2026)

Library uses Review, Browse, and Organize sections, with one search across captures,
notes, projects, and tasks. Each result opens its full record. Creation uses native
sheets; a typed Library route keeps browsing within the existing five-tab shell.
Counts and review schedules are separate server reads, never totals inferred from
loaded list pages. Each search section exposes its own loading and retry state.

Capture creation shares one composer across Library, project resources, and the
center Capture tab. Optional details allow explicit type/title/link/book author
before saving. Notes lead with title/body and keep origin, linked projects, sources,
category, summary, and location under optional details. Selector changes remain in
the draft until Save. Metadata edits retain existing rich HTML; plain-text body
replacement requires the explicit editing action. Creating a note preserves its
source and does not mark the capture processed. Filing and processing remain
separate actions, with saved feedback and an accurate resulting stage.

Projects lead with tasks, separate completion from archive state, collapse long
descriptions, and link to counted Captures and Notes. Task titles open readable
details; completion is a separate labeled button, and Focus is reachable above the
safe area. Categories show their saved colors and explain deletion's effect on
associated records before deletion.

Review captures a fixed ID queue on entry, fetches one note at a time, and counts
only confirmed responses. Reveal precedes the response controls. Failed saves keep
the reveal and progress, and retry cannot count a response twice. Deleted/no-longer
scheduled records are skipped without becoming reviewed. Existing intervals and
local-midnight scheduling remain unchanged. Labels are Notes, Create note, and
Include in review; backend collection/enum values remain unchanged.

The pagination/storage change originally kept downloaded records only for the
session; the persistent display cache below supersedes that offline limitation.
Account changes reset navigation and drafts. Native system colors, Dynamic Type, SF Symbols, 44-point
controls, and restrained motion retain Energy 1, Rhythm 2, Motion 1.

## Infinite lists and timer-only storage, October 5, 2026

Projects, tasks, captures, notes, categories, focus history, related sections, and
record selectors use 25-row continuations with near-bottom loading and an explicit
accessible Load more/Retry footer. Initial and append failures have separate states;
an append failure retains existing rows and retries the same continuation. Search,
filter, and sort changes replace the query and reset scrolling. Appends retain
position. Query requests cancel when superseded and reject late account/generation
responses. Selector relationship IDs remain independent of loaded/search results.

Sparse rich-text/locale-aware search scans projected candidates until 25 matches
are available; rejected candidates are discarded. Alphabetical tasks keep only a
temporary title/ID index. Dated/undated projects and status/priority task segments
preserve existing ordering. Summaries never derive complete totals from partial
rows. Focus totals stream minimal session fields and reconcile pending IDs; habit
day eligibility/counts, visible rows, yearly activity, and lifetime streak scans
load separately. Numeric target reads have at most four concurrent requests.

Verification passes: 64 Swift package tests, 25 production coordinator/model tests
through `sh Scripts/test-model.sh`, and an unsigned iOS app/extension build.
New regression cases cover append failure/retry, delayed search/account reads, full off-page
details, deleted details, sparse HTML/Unicode search, segmented task/project order,
overdue dates, totals and habit counts beyond the first page, historical targets,
year boundaries, historical corrections, unfinished-today streaks, timer-only
offline relaunch, multi-account migration, corrupt copies, and failed atomic writes.
The isolated PocketBase 0.40.4 integration also passes 60-task page boundaries,
project-title expansion, capture back-relations, exact project counts, and split
habit day/year/lifetime reads. No production backend or schema is changed.

Coordinated physical-iPhone Library tests pass the 60-note off-page search and
detail/back flow, search preservation, task complete/reopen/focus, capture-to-note
source preservation, review retries, and editor flows. No simulator is installed
or used. Full pagination UI coverage for every record type, VoiceOver walkthroughs,
and a populated real-device cache upgrade remain manual release checks; the model
and storage regressions do not replace those checks.

## Library device validation, October 5, 2026

The redesign passes 64 package tests, 25 model/coordinator tests through
`sh Scripts/test-model.sh`, and the native unsigned iOS build. Signed builds and
21 selected Library UI cases ran on Naufal’s physical iPhone with isolated,
in-memory test records. No simulator was used. Application Support was backed up
before test installation; tests use separate account data and preferences.

Passing device cases cover unified search and return-query preservation; a note
beyond the initial page of a 60-note fixture; book creation before its first save;
capture editing; capture-to-note source preservation without processing; review
toggle edits preserving body/sources; confirmed review progress after failed-save
retry; project-scoped note origins; separate filing and processing stages; task
completion/filter/reopening/focus; filter reset; category deletion confirmation;
center Capture save/dirty-draft cancellation; long note editing with the keyboard
open; dirty project save failure/recovery; delayed review loading; and centered
cancel-safe deletion confirmations for tasks, projects, captures, and notes.

Library navigation passes with the largest accessibility text size in Light and
Dark, in portrait and landscape. Portrait review responses remain reachable,
at least 44 points high, within screen width, and above the tab bar. The native
accessibility audit passes meaningful element descriptions and traits. Screenshots
were inspected for the content-first details, editor, and large-text layouts.

These checks do not certify a manual VoiceOver reading-order walkthrough or an OS
Reduced Motion walkthrough. Those remain release checks, along with broader device
sizes and a populated real-account upgrade. System navigation and semantic colors
remain in use, and the redesign introduces no custom motion. Device test artifacts
are under `/tmp/centa-library-ui-*.xcresult`; the final layout and project deletion
rerun is `/tmp/centa-library-ui-layout.xcresult`.

## Opening screens and refreshing, October 5, 2026

The first loading improvement added a memory-only cache for 60 seconds, bounded to 128
responses and 8 MiB. Identical requests share one in-flight read, with independent
cancellation for each caller. Writes, timer synchronization, and write validation
still use uncached clients. A successful edit, explicit refresh, reconnection, or
account change invalidates display reads; late requests cannot repopulate the new
cache. Nothing is added to the on-device feature store.

Opening an ordinary list no longer waits for the search debounce. Searches retain
their 300 ms debounce. Refreshing the same list keeps its rows visible until the
new first page replaces them; filters and account changes clear the previous
results. A failed refresh leaves an explicit retry and does not retry on every row
appearance. Recently refreshed app foreground transitions avoid another reload,
and startup no longer discards the first visible reads after authentication.

Project task lists start reading alongside project details. Project-list counts
use two concurrent count requests instead of scanning every task for unused focus
totals. Segmented project/task browsing prefetches at most four first pages,
awaiting only the segment needed for the current 25-row batch. Slow later segments
do not block a full earlier batch; failures and cancellation preserve retry order.

Verification: 81 Swift package tests and 34 model/coordinator tests pass, including
cache bounds, expiry, account isolation, write/refresh invalidation, cancellation,
retained-row refreshes, and segmented pagination order. The native unsigned iOS
build and companion web lint/build pass. These checks establish request reuse and
loading behavior; they are not a production-network latency benchmark.

Four selected UI tests also pass on the connected physical iPhone: Library edits
and review, search/back navigation, task completion/focus, and reopening a capture.
The reopen regression imposes a ten-second read delay, then verifies its previously
loaded detail reappears within a two-second wait. Tests use isolated in-memory
records. Application Support was backed up before installation; the test result
bundle is `/tmp/centaur-loading-ui.xcresult`.
The four normal Application Support files were unchanged after the tests. The
final signed build passed, installed over the existing app, and launched normally
without test arguments.

## Persistent display cache, October 5, 2026

Display reads now restore saved responses from Library/Caches before making a
network request. Each account has separate atomic cache storage, capped at 128
responses and 8 MiB, with a 30-day retention limit. Cache keys use account identity
and backend URL rather than bearer tokens, so refreshing sign-in does not lose
cached pages. Cache files are excluded from backup; missing, corrupt, or unwritable
cache files fall back to the network without affecting durable timer data.

Responses older than 60 seconds remain visible while a shared background request
revalidates them. Changed responses publish a debounced UI revision without
clearing the cache. Pull-to-refresh and reconnection mark data stale; confirmed
writes evict only affected collections. Signing out deactivates readers and removes
that account's downloaded copies. Cached browsing also works with expired saved
authentication, while writes and uncached reads still require connectivity and a
valid account. Server-confirmed deleted details are evicted.

Review counts and due-note pages have stable cache identities independent of the
current timestamp; their network requests still use the current time. Habit rows
and activity grids keep their current content during revalidation and clear it
when the account, day, year, or filter changes. Fresh habit values and targets
trigger row replacement even if the visible IDs have not changed.

Verification: the package and 37 coordinator tests pass, including persistent
relaunch, token rotation, account isolation, sign-out cleanup, stale revalidation,
corrupt/unavailable disk handling, and preserving unrelated cached data after edits.
All 28 focused cache tests pass. The native build and companion web lint/build pass.
Four physical-iPhone UI tests pass: offline relaunch with cached captures/details,
habit edit failure/recovery, Library edits/review, and off-page note search/details.
The four normal Application Support files are byte-for-byte unchanged after these
isolated tests. Device results are at `/tmp/centaur-disk-ui.xcresult`.
The final signed build was installed over the existing app and launched without
test arguments on the connected iPhone.

## Calendar, October 6, 2026

Calendar replaces the Habits tab; Habits is available from Library and the Calendar
menu, including local preview mode. A Monday-first month grid shows source markers,
and a selected-day agenda presents project deadlines, tasks, daily habits, and timed
capture reminders. iPad widths place the grid beside the agenda. Completed items
start collapsed, Today includes unfinished overdue projects/tasks/reminders, and
Unscheduled pages projects and tasks independently. Task dates override project
deadlines; removing an override restores inheritance. Archived projects and their
tasks are excluded. Habit values and historical targets are read for the selected
day, and future habit edits remain disabled.

The shared schema adds optional `tasks.dueDate` (`YYYY-MM-DD`),
`captures.reminderAt` (integer epoch milliseconds, zero means none), and
`captures.reminderDone` (default false). Calendar is projected from source records;
there is no calendar collection. Complete account-scoped queries, relation-aware
task filters, and the existing disk display cache replace any reliance on the
25-record workspace arrays. Date-only values remain Gregorian dates across device
timezone changes; reminder instants are grouped in the current device timezone.

Capture detail supports adding, rescheduling, completing, reopening, and removing
reminders. Reminder completion is independent of capture processing. Content edits
and preview responses patch only their own fields, and capture writes are queued
per record. Scheduling rejects past, non-finite, or out-of-range instants and rounds
timestamps to the schema's integer milliseconds.

The local notification coordinator uses fresh, fully paged server reads after
foreground/reconnection and relevant writes. A failed read preserves existing
alerts. Confirmed completion, removal, deletion, and rescheduling cancel that
capture’s prior pending and delivered alert immediately, even if the next server
read fails. Startup waits for stored credentials before reconciling ownership, so
an offline cold launch preserves previously synced schedules. Owner-scoped identifiers and generation guards prevent late reads/adds from
restoring reminders after sign-out, completion, or account changes. The earliest
60 reminders receive alerts, with capacity reserved for timer/habit requests; later
reminders show a notice until another refresh. Permission requests follow an
explicit reminder action. Denial offers notification settings; scheduling failures
offer refresh and do not fail the saved reminder. Web edits reach native alerts
after the native app next syncs. Timer notifications open Timer, habit check-ins
open Library/Habits, and capture notifications open the Calendar date and capture;
pending routes survive authentication and reject mismatched owners.

The updated `backend/pb_schema.json` must be imported before normal backend
release. Production schema and data were not modified during this implementation.
Physical tests use in-memory UI fixtures and no-op notification clients, except
for a separate opt-in test that creates and cleans one uniquely named system
notification when permission has already been granted.

Calendar validation: all 83 portable package tests and 56 coordinator/model tests
pass. They cover legacy decoding, date inheritance and overrides, timezone/DST
bounds, complete paging, cached source/calendar consistency, per-capture write
ordering, permission denial, owner switching, pending notification routes, startup
alert preservation, and cancellation despite refresh failure or an in-flight add.
The final unsigned generic-iPhone build passes
(`/tmp/pokus-calendar-build-final.log`).

Physical iPhone 17 Pro verification uses an installed signed test build. Capture
reminder creation/completion/reopening/removal passes
(`/tmp/pokus-calendar-ui-retry.xcresult`), as does Library/Habits local-preview
navigation (`/tmp/pokus-calendar-ui-final.xcresult`). A separate authorized
notification test delivered its isolated one-time system notification in 2.082
seconds (`/tmp/pokus-calendar-notification.xcresult`), then removed its own request.
Locked-screen delivery, delivery while the app is terminated, notification taps
through cold authentication, manual VoiceOver, and iPad layout remain device QA
gates; the automated test does not claim those interactions.

The physical Calendar flow also passes
(`/tmp/pokus-calendar-agenda-rows.xcresult`, 36.962 seconds): month navigation,
future completion disabled, an Unscheduled project date saved through its editor,
task date inheritance, agenda scrolling, checkbox completion, a numeric value
update, the collapsed Completed group, and the Habits menu destination. An embedded
lazy month grid caused list rows to remain anchored during scrolling on iOS 27;
fixed week rows resolved it without changing the month layout.

The four original Application Support files match the pre-installation backup
byte-for-byte after all tests. No data restore was needed. The signed test build
remains installed and its app process is closed; the normal account flow was not
launched against the unchanged production schema. Backups are
`/tmp/pokus-calendar-backup-before` and `/tmp/pokus-calendar-backup-final`.

## Today tab, October 7, 2026

The Calendar tab is now Today: it shows only today's agenda (overdue items,
dated projects and tasks, habits, reminders, and completed items) without the
month grid. The full month Calendar, including Unscheduled, moved to
Library > Calendar. Capture reminder notifications open the capture from Today.
