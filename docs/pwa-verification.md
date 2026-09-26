# PWA verification

The redesign uses warm stone surfaces, charcoal text, muted teal, Inter, and the
existing circular timer. The Timer has one primary action; tasks retain desktop
controls while phone filters/editors use sheets. Motion is limited to short
interface transitions and respects reduced motion. Safe-area padding covers all
four edges; sheets track the visual viewport for keyboard resizing.

## Automated coverage

Implementation verification: ESLint and production build passed; 51 Vitest tests
and all 8 production browser tests passed. The isolated PocketBase integration
suite passed. Screenshots were visually checked for the phone timer in both
themes and the task sheet. Gzip sizes are 88.2 KiB signed-out startup, 146.1 KiB
Timer loading graph, 192.1 KiB Tasks loading graph, 121.8 KiB editor, and 16.1 KiB
CSS, all within the existing budgets.

- Vitest: timer arithmetic and suspended expiry, expired/cached authentication,
  task fetch failures, durable transitions/restart recovery, owner isolation,
  terminal sessions, retry acknowledgements, and update guards.
- Production Playwright, Chromium and WebKit: 402 × 874 timer controls, task
  creation/link editing, themes, no horizontal overflow at 320/375/402/430px,
  874 × 402 landscape and 1280px desktop, offline relaunch, paused restoration,
  previously unopened Profile route offline, offline completion/reconnect credit,
  update activation deferred by paused timers and open editors, and axe checks.
- Isolated PocketBase 0.40.4: duplicate completion, concurrent requests, lost
  response after commit, task deletion, transaction rollback, and immutable
  terminal sessions/receipts. Historical task totals remain intact.
- Production build enforces gzip budgets for signed-out startup, Timer and Tasks
  loading graphs, editor chunk, and CSS.

WebKit's Playwright offline switch has an upstream issue rejecting service-worker
cache responses ([issue 42775](https://github.com/microsoft/playwright/issues/42775)).
Its test instead shuts down origin responses, blocks API access, and simulates the
connectivity event. Chromium uses the browser's offline mode. Neither substitutes
for physical-device testing.

## Reproduce integration and browser checks

Download a compatible official PocketBase binary into a temporary directory.
Use a **fresh isolated data directory**, then run:

```sh
./pocketbase superuser upsert pokus-test@example.com 'Pokus-local-test-2026!' --dir=./test-data
./pocketbase serve --http=127.0.0.1:8099 --dir=./test-data
```

In this repository, with that server running:

```sh
npm run test:pocketbase
npx playwright install chromium webkit
VITE_POCKETBASE_URL=http://127.0.0.1:8099 npm run build
npm run test:browser
npm run build
```

The integration script imports the schema, enables batches and creates test data.
It refuses remote servers. The browser suite uses isolated test accounts, blocks
the default live backend, and starts its own preview server on port 4173. The last
build restores the default production endpoint. Test credentials are for this
throwaway local server only. Remove its data directory after testing.

## Physical iPhone release checklist — not yet verified

Use the deployed HTTPS site on an iPhone 17 Pro:

- Sign in through Google OAuth in Safari and from the installed app.
- Add to Home Screen with Open as Web App enabled; confirm the icon, standalone
  launch, Timer start page, and hidden installation prompts.
- Check Dynamic Island/home-indicator padding, landscape, increased text size,
  pinch zoom, VoiceOver, and keyboard-open task/project/link editors.
- Start a timer, lock the phone past its deadline, unlock, and confirm the actual
  deadline and exactly one focus credit after reconnecting.
- Pause, close/relaunch offline, reconnect, and verify pending work clears.
- Confirm foreground sound after a gesture and wake lock on/off behavior.
- Open a new version during a running/paused timer and unsaved editor, then apply
  the update after finishing; verify inputs and pending sessions survive.

Google OAuth, Home Screen installation, real keyboard/safe areas, physical sound,
and lock/unlock behavior require this device pass before claiming iPhone release
verification. No hosting deployment or live PocketBase change was made here.
