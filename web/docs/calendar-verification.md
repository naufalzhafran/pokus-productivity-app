# Calendar implementation verification

Verified October 6, 2026. This change spans Pokus web and the native Centaur
workspace at `../project-centaurwarrunner`. Production schema import and release
have not been performed.

## Automated checks

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm test` | 36 files, 127 tests passed |
| `npm run test:calendar:pocketbase` | Passed against isolated PocketBase 0.40.4 |
| `npx playwright test e2e/calendar.spec.ts e2e/habits.spec.ts` | 4 passed across Chromium and WebKit |
| `npm run build` | Passed, including all existing bundle budgets |
| Native package, model, build, and device checks | See the Calendar section of `../project-centaurwarrunner/Docs/PokusNative.md` |

Calendar tests cover date inheritance and overrides, project date changes,
reassignment/archive/deletion, timezone and DST behavior, historical habit
targets, future completion restrictions, legacy decoding, reminder round trips,
queued capture updates, completion/rescheduling/cancellation, owner separation,
and durable notification deduplication. Native tests additionally exercise
paging beyond 25 records, scheduler permission/error/account races, and explicit
notification destinations.

Final native model checks include preserving scheduled alerts during offline
credential loading, cancelling an affected alert after confirmed completion,
removal, deletion, or rescheduling even when the next read fails, and rejecting
late notification additions after cancellation. All 56 model tests passed.

The physical iPhone Calendar flow passes month navigation, future habit
restrictions, Unscheduled project date assignment, inherited task display,
checkbox completion, numeric increment, and Library/Habits navigation. This
test found an iOS list scroll-anchoring issue with a nested lazy month grid;
fixed week rows preserve the layout and allow agenda controls to scroll into
view. The capture add/complete/reopen/remove flow also passes on-device.

The existing general `test:pocketbase` script has an unrelated failure in its
concurrent capture relation scenario. It was not changed. The new Calendar
integration script and Calendar/Habits browser fixtures pass against the updated
schema.

## Recorded web interaction checks

- Refresh loads dated, inherited, overdue, and unscheduled fixture records.
- Complete task updates the PocketBase task; Completed starts collapsed.
- Complete habit updates the existing Habits screen through the shared store.
- Habits and Calendar navigation opens the corresponding screens.
- Unscheduled > Set date > Save updates the task and removes it from Unscheduled.
- Processed capture > Add reminder opens the editor and saves a future instant.
- Calendar capture opens the source preview and reminder editor.
- Complete reminder, Reopen, and Remove update the reminder independently of
  capture processing.
- A past date/time fails validation before a reminder write.
- Arrow keys change the selected date and retain keyboard focus.
- Previous month, Next month, and Today update the grid and selected agenda.
- Future habit completion is disabled.
- Offline reload shows cached agenda records and disables writes.
- At widths 320, 402, and 1280, the document does not overflow horizontally.
- Light desktop and dark mobile screenshots were inspected. Axe reported no
  WCAG A/AA violations in the tested states, and no page errors were recorded.
- WebKit dark-mode switching with reduced motion is covered. Setting the global
  reduced-motion transition duration to zero fixes stale inherited text colors.

## Design delivery gate

The design follows the existing Pokus interface: Inter text, the established
neutral palette and green accent, existing buttons/overlays, and native SwiftUI
controls. ENERGY 1 / RHYTHM 2 / MOTION 1. The month grid establishes orientation;
the agenda provides the work controls; whitespace separates navigation and work.
The new Calendar navigation follows the explicitly approved plan.

### Hard gate

- R-02 PASS: new Calendar/reminder copy contains no em dashes.
- R-03 PASS: browser checks at 320/402/1280 pixels found no horizontal overflow.
- R-17 PASS: no statistics or numerical marketing claims were added.
- R-18 PASS: no testimonials were added.
- R-23 PASS: the approved Calendar/Habits navigation was implemented; existing visual assets were reused.
- R-24 PASS: Calendar, Habits, capture, and project links use existing or tested routes.
- R-25 PASS: axe light/dark contrast checks pass in Chromium and WebKit.
- R-26 PASS: new controls connect to navigation, date selection, source editors, refresh, or persisted actions listed above.
- R-27 PASS: Calendar includes loading skeletons, empty agendas, unavailable capture, refresh error, and offline states.
- R-28 PASS: no FAQ was added.
- R-32 PASS: the month grid has a roving tab stop and arrow-key navigation; existing accessible buttons and overlays are reused.
- R-33 PASS: features are implemented in repository source components, models, hooks, and schema.
- R-34 PASS: existing theme tokens are retained; light/dark browser checks and screenshots pass.
- R-35 PASS: production build and the recorded browser interactions pass; native evidence is recorded separately.
- R-36 PASS: no security, compliance, customer, or performance claims were added.
- R-37 PASS: the approved plan and existing app styling provide the design direction.
- R-38 PASS: no fabricated product content was added; fixture content is confined to tests.

### Purpose gate

- R-01 PASS: no gradients or glows were introduced.
- R-04 PASS: existing calendar/check/refresh/chevron icons identify scheduling, completion, refreshing, and month movement.
- R-06 PASS: the existing Inter typeface and native system type remain unchanged.
- R-07 PASS: the grid represents calendar days, and small markers indicate source presence.
- R-08 PASS: arrows are limited to directional month controls.
- R-09 PASS: no promotional badges were added.
- R-10 PASS: no glass effects were added.
- R-12 PASS: no blanket elevation or large shadows were added.
- R-13 PASS: no glow effects were added.
- R-14 PASS: the month grid, agenda, and Unscheduled list have distinct structures suited to their content.
- R-19 PASS: existing control motion is retained; reduced motion removes transitions.
- R-22 PASS: no generic illustrations were added.

### Liveliness

- Dials PASS: ENERGY 1 / RHYTHM 2 / MOTION 1 preserves the established calm workspace.
- Consistency PASS: the structured month grid contrasts with variable-length agenda lists without decorative animation.
- Focal point PASS: the selected date uses the existing green accent.
- Whitespace PASS: gaps separate the grid, agenda, overdue work, and completed work.
- Accent PASS: the established primary color identifies selected dates and active navigation.
- Motif PASS: existing rounded controls and date/completion indicators repeat across source screens and Calendar.
- Design read PASS: the existing app style and approved layout directed implementation.

### Craftsmanship and consistency

- C-1 PASS: layout choices support month browsing and selected-day actions.
- C-2 PASS: tested controls have real actions and pending/disabled states.
- C-3 PASS: each section represents scheduled, overdue, completed, or unscheduled source records.
- C-4 PASS: responsive, offline, theme, reduced-motion, and keyboard states have automated coverage; manual assistive-technology limitations are stated below.
- C-5 PASS: no fabricated testimonials, statistics, or claims were added.
- R-05 PASS: the layout follows the approved calendar workflow rather than a marketing template.
- R-11 PASS: existing control radii and larger list/overlay boundaries are retained.
- R-15 PASS: action labels name the operation: Set date, Complete, Reopen, Remove, and Refresh.
- R-16 PASS: copy describes app behavior without marketing buzzwords.
- R-20 PASS: the Calendar uses Pokus source records, shared editors, and existing visual conventions.
- R-21 PASS: both existing themes remain available.
- R-29 PASS: the established neutral palette and primary accent are reused.
- R-30 PASS: no other product's layout or branding was introduced.
- R-31 PASS: the grid orients by date, the agenda exposes actions, and existing typography/palette preserve consistency.

## Release and manual checks

Import `backend/pb_schema.json` before releasing either client. No migration files are
used. Existing records default safely when the new fields are missing.

Native local notifications were delivered into Notification Center on a physical
iPhone using an isolated test notification. This does not establish a complete
locked-phone or terminated-app tap-through. A manual VoiceOver walkthrough and
that notification lifecycle check remain release checks; automated accessibility
and routing tests do not substitute for them.

Web reminder changes, including cancellation, reach scheduled native alerts when
the native app next synchronizes. Native alerts use the earliest 60 future
reminders; later ones wait for a subsequent refresh. Web reminders are in-app
notices while the page is visible, not background push notifications.
