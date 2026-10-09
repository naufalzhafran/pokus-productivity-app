# Pokus

Today shows today's agenda: overdue items, project deadlines, dated tasks, daily
habits, and capture reminders. Its focus card's **Start** begins a session at the default
length, and **+ → New task** creates a task due today. A new, empty account sees a short
welcome on Today (session length, "What are you working on?", or just start). Library >
Calendar has the Monday-first month view and selected-day agenda with **New task on <day>**.
Library lists up to five recent active projects at the top. Habits now lives in Library.
Tasks can have their own date or inherit the project's deadline; Unscheduled lists
projects and tasks without a date. Capture reminders have an independent completion
state and can be added, edited, removed, completed, and reopened from capture details.

Import the updated shared `../backend/pb_schema.json`
before releasing this client against a backend. Calendar requires task `dueDate` and
capture `reminderAt`/`reminderDone` fields. No separate calendar collection is used.

iPhone alerts are local notifications. The app refreshes them on foreground,
reconnection, and reminder changes, scheduling the earliest 60 future reminders
while reserving room for timer and habit alerts. Web edits reach this iPhone after
the next successful sync. Notification permission is requested only from an
explicit reminder action; denied permission and scheduling failures leave saved
reminders intact. Calendar, Today, and Library read the account's records saved on this iPhone, and
edits made offline sync when connected.

A native iPhone focus timer and workspace built on Daily. Timer, Today, Capture,
Library (Habits, Calendar, Projects, Capture inbox, Knowledge, and Review), and Profile share a
SwiftUI app with standard iOS colors. The app is offline first: after the first sign-in
download, the account's projects, tasks, categories, captures, notes, and habits live on
this iPhone, every screen reads them locally, and edits apply at once and sync in order
when connected (pull to refresh sends them immediately). To stay small, focus sessions
older than 90 days, habit entries before last year, and the full text of older finished
items are fetched when needed online; lifetime totals and streaks are kept as running
summaries. Signing out removes the account's downloaded copies; timer recovery and
changes that haven't synced remain on device.
The existing Daily bundle identifier and habit store are preserved for upgrades.

See [native setup and release checks](Docs/PokusNative.md) for Google OAuth deployment,
architecture, tests, and the pending physical-device verification checklist.

## Run

### In the simulator

1. Open `Daily.xcodeproj` in Xcode 16 or later.
2. Select the **Daily** scheme and an iPhone simulator with iOS 17 or later.
3. Press **⌘R**. Habits, Timer, and workspace first use require
   Google sign-in against the existing Pokus PocketBase backend; deploy the native
   callback hook and register its Google redirect URI as documented above.

If Xcode asks for first-launch setup or a license agreement, complete those steps in Xcode. Simulator runtimes can be installed in **Xcode → Settings → Components**.

### Preview with sample history

Add `-preview-data` to **Product → Scheme → Edit Scheme → Run → Arguments Passed On Launch**. This opens an in-memory store with 100 days of example history. Remove the argument to return to normal, persistent storage. Sample data never replaces your real habits.

## Run on your own iPhone

You need your Mac, an iPhone running **iOS 17 or later**, a USB data cable, and an Apple Account. Use Xcode 16 or later **with support for the iOS version installed on your phone**; a newer iOS release may require a newer Xcode. Keep the Mac and phone online during initial setup and signing. Daily itself works offline.

A free Apple Account's **Personal Team** supports personal testing through Xcode.
Select the same team for Daily and its PokusActivity extension. Free provisioning
expires after **7 days**, so expect to rebuild periodically. See
[Apple's personal-team requirements and limits](https://developer.apple.com/help/account/basics/about-your-developer-account).

### 1. Add your Apple Account to Xcode

Open **Xcode → Settings → Apple Accounts** (**Accounts** in older versions), add your account, and complete sign-in. Your name should appear as a Personal Team if you do not have a paid membership. This account signs the installation; Pokus's separate Google sign-in accesses your workspace. See [Apple's signing setup](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices).

### 2. Connect and prepare the phone

1. Connect the iPhone to your Mac using the cable and unlock it. Accept the connection prompt on the Mac if shown, and tap **Trust** on the phone when asked to trust this computer.
2. In Xcode 27, open **Xcode → Open Developer Tool → Device Hub**. In earlier Xcode versions, use **Window → Devices and Simulators**. Select your phone and complete any pairing prompts. See [Apple's device-pairing guide](https://developer.apple.com/documentation/xcode/managing-your-simulated-and-physical-devices-in-device-hub).
3. On the iPhone, open **Settings → Privacy & Security → Developer Mode**, enable it, and restart when prompted. After restart, unlock the phone and confirm enabling Developer Mode. If the setting is missing, begin pairing in Xcode first. See [Apple's Developer Mode instructions](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device).
4. Leave the phone connected and unlocked while Xcode finishes preparing it.

### 3. Set up signing for Daily

1. Open `Daily.xcodeproj`, then select the blue **Daily** project at the top of the left navigator (**⌘1**).
2. Under **TARGETS**, select **Daily**, then **Signing & Capabilities**.
3. Enable **Automatically manage signing** and choose your **Personal Team** from **Team**. If Xcode shows **Set Up Signing**, use that dialog to select your team and bundle identifier instead.
4. Use a unique **Bundle Identifier**, for example `com.yourname.daily`. The project starts with `com.centaurwarrunner.Daily`; replace it if unavailable to your team. Keep your chosen identifier stable after you start recording habits.

Keep the existing team when upgrading this installation. Xcode manages the signing
certificate and development profile for your selected team. See [Apple's automatic-signing guide](https://developer.apple.com/documentation/xcode/running-your-app-on-simulated-or-physical-devices).

### 4. Install and launch

1. In Xcode's toolbar, choose the **Daily** scheme and **your iPhone by name** as the destination, not a simulator or a generic “Any iOS Device” destination.
2. Under **Product → Scheme → Edit Scheme → Run → Arguments**, disable `-preview-data`, `-ui-testing`, and `-ui-testing-history` if present. Normal launches save habits on disk; preview and UI-test modes are temporary.
3. Press **⌘R** and wait for Daily to open on your iPhone. The first build and installation can take a few minutes.
4. When finished debugging, press Stop in Xcode, disconnect the cable, and open **Pokus** from the phone's Home Screen.

### 5. Test the real-device experience

- Create a checkbox habit and a numeric habit, such as “Drink water” with a target of 8 glasses. Check one off and enter a numeric total below, then at, its target.
- Open **Progress** and the individual habit's history. Once a habit has existed for several days, edit a past day on or after its creation date and check the grid and streak update. Use `-preview-data` separately to try this immediately with sample history.
- Enable airplane mode, force-quit Daily from the app switcher, and reopen it from the Home Screen. Your real habits and entries should remain available without internet access.
- In **Profile → Habit reminders**, enable reminders, allow notifications, and choose a time a few minutes ahead. Put the app in the background or lock the phone. Confirm the reminder arrives and tapping it opens **Library → Habits → Today**. Restore your preferred reminder time afterward.
- Try dark mode, larger text, and VoiceOver on your phone.

For automated tests on the phone, also configure the same team and automatic signing for the **DailyTests** and **DailyUITests** targets, using distinct bundle identifiers if needed, then press **⌘U** with your phone selected. UI tests use a separate in-memory store; they do not exercise persistence of your real habit history.

### Renewing a free installation and keeping your history

After the Personal Team profile expires, reconnect the phone and press **⌘R** to rebuild and install an updated copy with fresh signing. Keep the **same bundle identifier and team**. Do not delete the app first: deleting it removes local caches and legacy Daily data. Account habits live in PocketBase; legacy local habits remain preserved separately and are not automatically uploaded.

### Troubleshooting

| Problem | What to check |
| --- | --- |
| “Signing requires a development team” | Select the **Daily app target**, choose your team, and enable automatic signing. For **⌘U**, configure both test targets too. |
| Bundle identifier is unavailable | Choose your own unique identifier in Signing & Capabilities. |
| Phone is missing or unavailable | Unlock it, check the data cable and Trust prompt, then inspect its pairing/preparation status in Device Hub or Devices and Simulators. |
| Developer Mode is missing or disabled | Initiate pairing first, then enable the setting and complete both the restart and confirmation. |
| Xcode says the phone's iOS is unsupported | Update to a compatible Xcode and install any requested iOS support in Xcode's Components settings. |
| App stops opening after about a week | Renew the free installation using **⌘R** with the same identifier and team; do not uninstall it first. |
| Habits disappear after relaunch | Make sure the preview and UI-testing launch arguments are disabled for ordinary runs. |
| No reminder arrives | Check notification permission for Daily in iPhone Settings, the reminder time, and whether Focus or notification-summary settings are delaying alerts. |

## What's included

- **Today:** daily summary, checkbox habits, numeric totals, quick `+1`, and habit creation.
- **Progress:** overall and individual year grids, current/best streaks, completion totals, and year navigation.
- **History:** tap an activity square or use **Choose a date to edit** to correct past entries.
- **Habits:** edit names and numeric targets, or permanently delete a habit and its entries after confirmation.
- **Reminders:** one optional notification at a chosen local time, defaulting to 8 PM when enabled, skipped on days whose habits are all complete.
- Native light/dark appearance, Dynamic Type layouts, VoiceOver descriptions, and a generated geometric app icon.

## Tracking rules

Every habit is daily, starting on its creation date. A checkbox completes the day when checked; a numeric habit completes when its total reaches or exceeds its target. Numeric values can contain decimals and must be finite and nonnegative; targets must be greater than zero. The number keyboard uses the device's decimal separator. Type and unit are fixed after creation.

Numeric targets are dated: changing a target applies from today onward. Earlier days keep their original target, including days filled in after the change. Repeated target changes on the same day update that day's revision.

Individual streaks count consecutive completed days. The overall streak counts days with at least one completed habit. An unfinished today preserves yesterday's streak until the day ends. Missing an earlier day breaks the current streak. Future days and dates before a habit existed cannot be edited.

The overall heatmap shows the fraction of eligible habits completed that day. New habits do not change the denominator on older dates. Individual numeric grids show partial progress; only reaching the target earns a completed day. The darkest shade always means completion.

Date identities use Gregorian `YYYY-MM-DD` values rather than UTC timestamps. Changing timezones changes what the app considers today, but never moves existing entries to another date. Calendar arithmetic handles midnight, leap years, and daylight-saving boundaries.

Notifications are disabled initially. Enabling habit reminders or starting a focus
timer can request permission. The habit reminder is scheduled as one request per day
for the next week at the phone's local time and rescheduled whenever the app opens, a
habit is checked in, or a background refresh runs. Once every habit is complete for
the day, that day's request is removed. Changing the time replaces the requests, and
disabling reminders cancels them.
Tapping it opens Library → Habits → Today; focus notifications open Timer.

## Project structure

| Location | Purpose |
| --- | --- |
| `Daily/` | SwiftUI app, screens, notification service, assets, privacy manifest |
| `Sources/DailyCore/` | Calendar dates, habit snapshots, number input, progress and streak calculations |
| `Sources/DailyPersistence/` | SwiftData models and transactional storage |
| `Tests/` | Core and persistence tests runnable on macOS without a simulator |
| `DailyTests/` | Reminder tests with an injected notification client |
| `DailyUITests/` | iPhone interaction tests |

The local `DailyKit` Swift package has no third-party dependencies. Views read observable snapshots from `HabitStore`. Writes validate input, construct a new snapshot, and save explicitly; failed saves roll back and expose a retry action. Startup storage failures show a recovery screen instead of replacing or resetting the store.

SwiftData stores `Habit`, `DailyEntry`, and `TargetRevision`. Entries and target revisions each have a unique habit/date key. Habit deletion explicitly removes associated records in the same transaction. Managed CloudKit sync is disabled. Pokus adds PocketBase networking for the workspace; no analytics or advertising integration is added.

Reminder preferences use the app's own `UserDefaults`; the privacy manifest declares that use under Apple's [required-reason API guidance](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype).

## Verification

Run the logic and storage tests:

```sh
swift test
```

Compile-check an iPhone build without a signing identity:

```sh
xcodebuild -project Daily.xcodeproj -scheme Daily \
  -destination 'generic/platform=iOS' \
  -derivedDataPath DerivedData CODE_SIGNING_ALLOWED=NO build
```

This unsigned build is **not installable on your iPhone**. Follow [Run on your own iPhone](#run-on-your-own-iphone) for a signed installation.

Run reminder and UI tests using **⌘U**, or substitute an installed simulator's ID below:

```sh
xcrun simctl list devices available
xcodebuild -project Daily.xcodeproj -scheme Daily \
  -destination 'platform=iOS Simulator,id=SIMULATOR_ID' \
  -derivedDataPath DerivedData -parallel-testing-enabled NO test
```

The tests cover thresholds, streak gaps and historical corrections, historical target revisions, timezone/date boundaries, duplicate prevention, disk reload, deletion, failed-save rollback/retry, reminder permissions and rescheduling, and the primary tracking flows. UI tests use an isolated in-memory store.

For manual acceptance, check small-screen and accessibility text layouts, VoiceOver, dark mode, airplane mode and relaunch persistence, notification delivery and tapping, and midnight/timezone transitions. Notification delivery should also be checked on a physical device.

### Historical Daily verification, before the Pokus port

The following results describe the previous habit-only app. They do not verify
the combined Pokus app. Current checks and pending device gates are tracked in
[Pokus native implementation](Docs/PokusNative.md).

- Xcode 27: unsigned iPhone build and simulator test builds succeed with an iOS 17 deployment target.
- `swift test`: all 18 core and persistence tests pass, including a real disk-store reopen.
- iPhone 16 / iOS 18.3.1: all 4 reminder tests and 5 UI tests pass.
- iPhone SE / iOS 18.3.1: tracking, history access, and Settings pass the layout smoke test in dark mode at the largest accessibility text size.

After the full test pass, final color and icon-sizing adjustments were rebuilt and visually reviewed through direct simulator launches. A repeat SE automation run stalled before test startup and was cancelled; the app itself launched successfully on both simulators.

Physical-device notification delivery, manual VoiceOver navigation, and execution on iOS 17 itself have not been verified here.

To regenerate the checked-in app icon from its native drawing source:

```sh
swift Scripts/GenerateAppIcon.swift
```

## Habit feature boundaries

iPhone only, English interface, every habit scheduled daily. No custom habit
schedules, offline habit editing, legacy habit import/export, or App Store submission
is included. Habits use your PocketBase account with paged rows, selected-day/year
reads, and separate lifetime summaries. Downloaded account records are not persisted.
Legacy Daily data stays in its original database. See the native port document for
the combined app's feature boundaries.
