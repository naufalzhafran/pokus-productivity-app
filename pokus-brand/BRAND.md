# Pokus Brand Guide

> **For Claude Code / AI agents:** This file is the brand source of truth for Pokus (iOS app + web app).
> Machine-readable tokens live in `tokens/tokens.json`. Web uses `tokens/tokens.css` (+ optional
> `tokens/tailwind.preset.js`); iOS uses `ios/PokusTheme.swift` + `ios/PokusColors.xcassets`.
> **Never hard-code hex values in UI code — always reference a semantic token.** If a needed token is
> missing, add it to `tokens.json` first, then mirror it in the CSS/Swift files.

Suggested `CLAUDE.md` line for each repo:

```md
## Brand
Follow `brand/BRAND.md`. Use semantic tokens only (`var(--pk-*)` on web, `Color.pk.*` / `Font.pk.*` on iOS).
Logo files are in `brand/logo/svg/`. Don't redraw or recolor the logo.
```

---

## 1. Brand essence

**Pokus** is a productivity app that combines a pomodoro timer, a second brain (notes) and project
management in one place. Its basic unit is **a Pokus**: one focused pomodoro session.

- **Promise:** Turn intention into focused time, one Pokus at a time.
- **Personality:** Focused, energetic, clever, calm under pressure. Confident, not loud.
- **Feels like:** a precise instrument with a bit of attitude. Think stopwatch, not spreadsheet.

### Naming and terminology

| Term | Rule |
|---|---|
| Brand name in prose | **Pokus** (capital P). Never "POKUS" or "PoKus". |
| Wordmark | Always lowercase **pokus**, and only as the supplied artwork. |
| The unit | "a Pokus", "start a Pokus", "4 Pokus today". The plural stays **Pokus** (invariant). |
| Verbs | "Start", "Pause", "Finish", "Take a break". Avoid "work session" and "pomodoro" in UI copy; "pomodoro" is fine in marketing/SEO. |

---

## 2. Logo

The mark is a **lowercase "p" built from a stopwatch**. The crown sits on top, the bowl is the dial,
and an indigo/lime hand marks the running Pokus. It reads as a letter, a timer and a moment of focus.

### Files (`logo/`)

| File | Use |
|---|---|
| `svg/pokus-lockup-horizontal.svg` | **Primary logo**: web header, docs, marketing (light bg) |
| `svg/pokus-lockup-horizontal-on-dark.svg` | Primary logo on Night / dark backgrounds |
| `svg/pokus-lockup-stacked(-on-dark).svg` | Splash, square placements, social avatars with text |
| `svg/pokus-mark.svg` / `-on-dark.svg` | Mark alone ≥ 24px: tab bar, loading, in-app headers |
| `svg/pokus-mark-small(-on-dark).svg` | Mark ≤ 24px (no hand, bigger pin), for favicons and tiny UI |
| `svg/pokus-mark-mono-night.svg` / `-mono-white.svg` | One-color contexts: print, watermark, photos |
| `svg/pokus-wordmark(-white).svg` | Wordmark alone, only where the mark already appears nearby |
| `png/*` | Raster exports for slides, email, social |

All wordmarks are outlined paths, so no font is needed to render them.

### Colorways

| Background | Body (crown, ring, stem) | Hand + pin |
|---|---|---|
| Light (white, Paper, `#F7F7FB`) | Night `#14143C` | Indigo `#4B3BFF` |
| Dark (Night, `#0E0E22`) | Paper `#F1F0FF` | Lime `#D7FF3E` |
| Indigo (app icon, brand blocks) | White `#FFFFFF` | Lime `#D7FF3E` |
| Photo / busy / one-color | Mono white or mono Night | same as body |

### Clear space and minimum size

- **Clear space:** keep at least the **width of the stem** (≈ 12% of mark height) free on every side.
  With the wordmark, use ½ the height of the "o".
- **Minimum size:** mark 16px (use `-small` below 24px). Horizontal lockup 96px wide on screen, 25mm in print.

### Don'ts

- Don't recolor outside the colorways above, add gradients, shadows or outlines.
- Don't rotate the hand or animate it as a ticking clock, **except** in the loading/timer
  animation described in §7.
- Don't retype the wordmark in a live font or change its letter spacing.
- Don't place the dark-mode mark (lime hand) on light backgrounds; lime has too little contrast there.
- Don't stretch, skew, or crop the crown.
- Don't put the mark inside another shape, except the app icon.

---

## 3. App icon

| Platform | Files |
|---|---|
| iOS (Xcode 15+/iOS 18) | `icons/ios/AppIcon.appiconset/`: drop into `Assets.xcassets`. Single 1024 with **light**, **dark** and **tinted** variants. |
| Web / PWA | `icons/web/`: `favicon.ico` (16/32/48), `favicon.svg` (auto light/dark), `apple-touch-icon.png` (180), `icon-192/512.png`, `icon-maskable-512.png`, `site.webmanifest` |

Light icon: Indigo field, white stopwatch-p, lime hand. Dark icon: transparent field (iOS supplies a
dark background), Paper body, lime hand. Editable sources are in `icons/ios/source/`.

Web `<head>`:

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<meta name="theme-color" content="#4B3BFF">
```

---

## 4. Color

### Brand core

| Name | Hex | Role |
|---|---|---|
| **Night** | `#14143C` | Primary ink, logo body, dark-mode brand surfaces |
| **Indigo** | `#4B3BFF` | Primary action, focus state, brand field |
| **Lime** | `#D7FF3E` | Spark: highlights, "Pokus complete", streaks, dark-mode accents |
| **Paper** | `#F1F0FF` | Soft brand background, dark-mode text |

**Ratio guide:** about 70% neutrals, 20% Night/Indigo, 10% or less Lime. Lime is a spice, not a base.

### Semantic tokens (use these in code)

| Token | Light | Dark | Use |
|---|---|---|---|
| `background` | `#F7F7FB` | `#0E0E22` | App background |
| `surface` | `#FFFFFF` | `#191930` | Cards, rows, sheets |
| `surfaceRaised` | `#FFFFFF` | `#24243D` | Menus, popovers, modals |
| `surfaceSunken` | `#EEEEF5` | `#0A0A1A` | Inputs, wells, segmented tracks |
| `border` | `#DEDEEA` | `#383852` | Dividers, outlines |
| `textPrimary` | `#14143C` | `#F1F0FF` | Main text |
| `textSecondary` | `#50506B` | `#9A9AB3` | Secondary text (AA) |
| `primary` | `#4B3BFF` | `#8B7DFF` | Buttons, links, selection |
| `primaryPressed` | `#3A2AE6` | `#A69CFF` | Pressed/hover |
| `onPrimary` | `#FFFFFF` | `#0E0E22` | Content on primary |
| `accent` | `#D7FF3E` | `#D7FF3E` | Highlight **fill** only |
| `onAccent` | `#14143C` | `#14143C` | Content on accent |
| `focusRing` | `#4B3BFF` | `#D7FF3E` | Keyboard focus (2px, 2px offset) |
| `sessionFocus` | `#4B3BFF` | `#8B7DFF` | Running Pokus |
| `sessionBreak` | `#BDE620` | `#D7FF3E` | Break (Night text on top) |
| `sessionPaused` | `#9A9AB3` | `#6E6E8A` | Paused/idle |
| `success` / `warning` / `danger` | `#1A7F45` / `#A35F00` / `#D93036` | `#4ADE80` / `#FFB224` / `#FF6369` | Status |

CSS names are kebab-case with a `--pk-` prefix (`--pk-text-secondary`). Swift names are `Color.pk.textSecondary`.
Full Indigo, Lime and Neutral scales are in `tokens.json`.

### Accessibility rules

- Body text must meet WCAG AA (4.5:1). All text/surface pairs above pass.
- **Never use Lime as text or icon color on light backgrounds.** Use it as a fill with Night content.
- Indigo `#4B3BFF` on white works for text and buttons. In dark mode use `primary` (`#8B7DFF`).
- Never use color alone for state: pair session colors with a label or icon.

---

## 5. Typography

| Role | Web | iOS |
|---|---|---|
| **Display** | Plus Jakarta Sans (Google Fonts) | Plus Jakarta Sans, bundled from `fonts/PlusJakartaSans.ttf` |
| **Text / UI** | Manrope (Google Fonts) | SF Pro (system), for native feel and Dynamic Type |

Plus Jakarta Sans is a crisp geometric sans with friendly, open forms. Use it for **headlines, the timer
and big numbers only**, never for paragraphs or buttons. The wordmark is outlined artwork, so it doesn't
depend on this font.

| Style | Font | Size/Line (px=pt) | Weight | Tracking |
|---|---|---|---|---|
| `timer` | Display | 72/72 | 500 | -2% · tabular digits |
| `displayL` | Display | 40/44 | 700 | -2% |
| `displayM` | Display | 28/34 | 700 | -1% |
| `displayS` | Display | 22/28 | 600 | 0 |
| `title` | Text | 20/28 | 700 | -1% |
| `headline` | Text | 17/24 | 700 | 0 |
| `body` | Text | 16/24 | 500 | 0 |
| `bodySmall` | Text | 14/20 | 500 | 0 |
| `label` | Text | 13/18 | 700 | +1% |
| `caption` | Text | 12/16 | 600 | +2% |

Use sentence case everywhere, including buttons and titles. Avoid ALL CAPS except tiny `caption` tags.

---

## 6. Layout, shape, elevation

- **Grid:** 4pt base. Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80.
- **Radius:** xs 6 (chips, tags) · sm 10 (inputs, small buttons) · md 14 (buttons, list cells) ·
  lg 20 (cards, sheets) · xl 28 (hero cards, timer card) · full (pills, avatars, the timer ring).
  On iOS always use `.continuous` corners.
- **Touch targets:** at least 44×44.
- **Web layout:** content max 1200px. Sidebar 264px that collapses to a bottom tab bar under 768px.
  Gutters are 16px on mobile and 32px on desktop.
- **Elevation (light):** `shadow.sm` for cards, `md` for popovers, `lg` for modals. Shadows are tinted
  Night and never pure black. **In dark mode,** don't use shadows; separate layers with surface steps
  plus a 1px `border`.

---

## 7. Motion

- Durations: fast 150ms (press, toggle) · base 250ms (sheets, transitions) · slow 400ms (celebrations).
- Easing: `cubic-bezier(.2,.8,.2,1)` standard; iOS spring `response 0.35, damping 0.8`.
- **Signature moment:** when a Pokus completes, the timer ring fills, the hand sweeps once to 12 o'clock,
  and a Lime pulse expands from the pin (400ms). This is the only time the logo hand animates.
- Respect Reduce Motion: replace sweeps and pulses with a 150ms cross-fade.

---

## 8. Iconography and imagery

- **UI icons:** SF Symbols on iOS; Lucide (or Phosphor Regular) on web. Use a 1.75–2px stroke, rounded caps and joins,
  matching the logo's round terminals. Size 20 in UI, 24 in tab bars.
- Icons take `textPrimary` / `textSecondary`, or `primary` when active. Don't use multicolor icons in UI.
- **Illustration** (empty states, onboarding): flat geometric shapes built from the logo's primitives
  (circles, rounded bars, the crown block) in Indigo, Night and Lime. No gradients, no 3D, no stock-photo people.

---

## 9. Voice and copy

Talk like a sharp coach who respects your time: short, direct and encouraging, never preachy.

| Do | Don't |
|---|---|
| "Start a Pokus" | "Begin your productivity session now!" |
| "Nice. 3 Pokus done today." | "Amazing job!!! You're crushing it 🚀🔥" |
| "Break time. Back in 5." | "You have earned a well-deserved rest period." |
| "Couldn't sync. We'll retry." | "Error 503: Service unavailable." |

- Use second person ("you"), contractions and active voice.
- Avoid emoji in UI chrome. One emoji in a celebration toast is fine.
- Numbers: use digits ("4 Pokus", "25 min").

---

## 10. Component cheat sheet

| Component | Spec |
|---|---|
| Primary button | `primary` bg, `onPrimary` text, `headline`, height 50 (iOS) / 44 (web), radius md, horizontal padding 24 |
| Secondary button | `surface` bg, 1px `border`, `textPrimary` text |
| Destructive | `danger` text on `surface`; filled `danger` only in confirm dialogs |
| Card | `surface`, radius lg, padding 16–20, `shadow.sm` (light) or `border` (dark) |
| Timer | Ring 10pt stroke: track `surfaceSunken`, progress `session*` color, round caps. Digits use `timer` style, with the session label in `label` style above them |
| Pokus chip | Pill, `caption`, bg `session*` at 14% opacity, text `textPrimary`, 8pt dot in the session color |
| Input | `surfaceSunken` bg, radius sm, height 44, focus = 2px `focusRing` |
| Tab bar (iOS) / Sidebar (web) | Active item `primary`, inactive `textSecondary`. The logo mark sits at the top of the sidebar |

---

## 11. Repo layout of this kit

```
brand/
├─ BRAND.md                 ← you are here
├─ tokens/
│  ├─ tokens.json           ← source of truth
│  ├─ tokens.css            ← web CSS variables (+ type role classes)
│  └─ tailwind.preset.js    ← optional Tailwind preset
├─ ios/
│  ├─ PokusTheme.swift      ← Color.pk / Font.pk / PKSpace / PKRadius / button style
│  └─ PokusColors.xcassets  ← semantic colors with light + dark
├─ logo/svg, logo/png
├─ icons/ios/AppIcon.appiconset, icons/web
└─ fonts/                   ← PlusJakartaSans.ttf, Manrope.ttf (SIL Open Font License)
```
