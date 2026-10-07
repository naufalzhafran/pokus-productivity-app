# AGENTS.md (web)

Repository-wide rules, including production safety and schema changes, are in `../AGENTS.md`.

## Commands

Run these from `web/`:

- `npm run dev` — development server. The service worker is disabled here; use `npm run build && npm run preview` to test PWA or offline behavior.
- `npm run lint` — ESLint.
- `npm test` — Vitest unit tests.
- `npm run build` — type-check, build, then enforce bundle-size budgets (`scripts/check-bundle-budgets.mjs`). A budget failure is a real failure: shrink or lazy-load the code rather than raising the budget, unless asked.
- `npx playwright test e2e/<name>.spec.ts` — browser tests in Chromium and iPhone WebKit. Run the relevant spec when changing calendar, habits, or PWA flows.

No environment variables are required. `VITE_POCKETBASE_URL` overrides the backend and should only point at a local test server.

## Code Guidelines

- Use the `@/` alias for imports from `src`.
- Record reads and writes live in `src/lib` (wire records and PocketBase calls) and `src/hooks` (state). Components use the `pb` client only for auth (`pb.authStore`), not for collection queries.
- UI primitives are shadcn components on Base UI in `src/components/ui`. Reuse them before adding new ones; add new primitives with the shadcn CLI (`components.json`) rather than writing them by hand.
- Use the `cn` helper from `src/lib/utils.ts` and existing Tailwind tokens in `src/styles/globals.css` instead of one-off colors or arbitrary values.
- Put unit tests next to the code as `*.test.ts`. Add or update tests when changing logic in `src/lib` or `src/hooks`.
- Keep the app usable offline: cached reads and the pending-session queue in `offline-store.ts` and `session-sync.ts` must keep working when the network is unavailable.
- Preserve accessibility labels, keyboard access, and the `prefers-reduced-motion` styles.
- Remove unused code, exports, dependencies, and files.
- Update `README.md` when user-visible features or scripts change.
