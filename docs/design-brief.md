# Cardiogram — Design Brief (Logo + Home Page)

A handoff for designing **(1) a logo/brand mark** and **(2) the home/landing page**.
Everything needed to design something that drops into the existing app is here.

---

## 1. What Cardiogram is

A **live Formula 1 race-companion dashboard**, built **for iPad in landscape** (also
works on phones). You run it on a second screen during a race and get a
broadcast-style live timing feed — positions, gaps, tyres, stints, sector times,
lap-time analysis, track map, telemetry, pit strategy, race control — in a dark,
animated, data-dense UI. Data comes from the OpenF1 API.

**Audience:** F1 fans who want broadcast-grade live data on a tablet beside the TV.
**Feel today:** futuristic, technical, dark, glowing — "engineering pit-wall screen."

## 2. The name (please lean into it)

**Cardiogram = "Car-Diogram."** A pun on **cardiogram / ECG** (the heartbeat trace).
This is the creative hook: **the app already renders live telemetry as glowing line
traces** (speed graphs, gap-to-leader lines, lap sparklines). An **ECG / heartbeat
waveform that doubles as a telemetry trace or a racing line** is the natural brand
idea — the "pulse of the race." Racing cues welcome (checkered, sector ticks,
speed) but the heartbeat-line should lead. Avoid leaning on official F1 trademarks,
team logos, or the F1 logo itself.

**Tone:** confident, precise, a little futuristic. Not cartoonish, not corporate.

## 3. Existing visual system (match this)

Dark UI with cyan/purple neon accents and subtle glow. Single CSS file of design
tokens — **use these exact values** so the logo and page feel native:

**Surfaces (backgrounds, darkest → lighter)**
- `--bg-0 #05070d` (page background; also the PWA `theme-color`)
- `--bg-1 #0a0e17`, `--bg-2 #0e1422`
- Panels: translucent blue-white — `rgba(140,170,255,0.03–0.06)`
- Borders: `rgba(120,160,255,0.1–0.22)`

**Text**
- `--text #e9eef7` · `--text-dim #aab3c5` · `--muted #6f7a90`

**Accents**
- `--accent #19e3ff` (cyan — the primary brand accent + glow)
- `--accent-2 #7a6bff` (indigo/violet)
- Glow: `rgba(25,227,255,0.55)`

**Semantic (used in timing; available to the brand if useful)**
- purple `#c04bff` · green `#22e07a` · yellow `#f6d33f` · red `#ff3b46` · amber `#ff9d2f`

**Type**
- Sans: **Inter** (400–800) — UI + wordmark
- Mono: **JetBrains Mono** — all numbers/timers (a strong brand cue; clocks &
  countdowns are monospaced)
- Radii: `14px` (cards), `9px` (small)
- Motion: Framer Motion springs; subtle, quick, physical. Tasteful neon glow, no skeuomorphism.

## 4. Deliverable A — Logo / brand mark

**Concept direction:** an **ECG/heartbeat line** as the core mark — ideally one that
reads simultaneously as a **telemetry/speed trace or a racing line** (e.g. a pulse
that crosses a start/finish or sector tick). Cyan `#19e3ff` on the near-black
`#05070d`, with optional violet `#7a6bff` as a secondary.

**Variants needed**
- Horizontal **wordmark** ("Cardiogram", Inter-based or custom) + integrated mark — used on the home header.
- **Standalone mark** (square-safe) for the app icon / favicon.
- Light-on-dark is primary; also supply a mono/1-color version that survives on light.

**Where it appears / sizes**
- Home header wordmark (currently the text "Cardiogram" next to a 🏎️ emoji — replace both).
- **Favicon** (SVG + 32/16 px fallback).
- **iOS home-screen icon** (`apple-touch-icon`, 180×180) — the app is installed as a
  PWA in iPad landscape; icon sits on a home screen.
- **PWA icons** 192×192 and 512×512, plus **maskable** safe-area versions.
- Must read at **small sizes** (16px favicon) and as a **bold app icon**.

**Deliver as:** SVG (wordmark + mark) + exported PNGs at the sizes above. Background
`#05070d`; provide transparent versions too.

## 5. Deliverable B — Home / landing page

This is the **first screen** before a session is picked. It must do real work, so
the redesign should keep these elements (restyle freely; don't remove function):

**Current anatomy** (`src/components/Home.tsx`)
1. **Header:** brand lockup (logo + "Cardiogram"). _(No settings gear — removed.)_
2. **Hero card** — shows one of four states depending on the F1 calendar:
   - **Live now:** pulsing "● Live now" + Grand Prix name + "[session] is running" + primary CTA **"Enter live session →"**.
   - **Next session:** "Next session" + GP · session name + a **live countdown** (big, monospaced `mm:ss` / `h:mm:ss` / `d hh:mm:ss`) + date/time.
   - **Off season:** "No upcoming sessions" + "Replay a past race below."
   - **Loading / offline:** spinner / "Couldn't reach OpenF1."
3. **Two action buttons:**
   - **"Replay the last race"** (+ last GP name)
   - **"Load a past session"** (+ "Revisit past F1 sessions")
4. **Footer:** "Powered by the OpenF1 API · made by Aayush" (links to aayush.fyi).

**Goals for the redesign**
- A striking, on-brand landing that sells the "pulse of the race" idea (hero moment
  for the live countdown / live state).
- **iPad landscape is the primary canvas** (≈1194×834). Must also reflow to portrait
  tablet and phone (single column ≤640px).
- Keep it fast and legible at a glance from across a room; dark, glowing, minimal chrome.
- The **countdown and live state are the emotional centerpiece** — design them as such.

**Deliver as:** annotated mockups for **iPad-landscape + phone**, covering all four
hero states (live / next / off-season / loading-error). Figma or layered files
preferred; if possible, specs that map to the tokens above (so it's directly buildable).

## 6. Technical constraints (so designs are buildable)

- **Stack:** React 18 + Vite SPA, **no router** (home is conditional render),
  Framer Motion for animation, **hand-built SVG** charts, a single CSS token file
  (`src/styles/global.css`). **No Tailwind.**
- **Fonts already loaded:** Inter + JetBrains Mono (Google Fonts). Prefer these; if a
  display face is proposed for the wordmark, deliver it as an SVG/outlined asset.
- **SVG-first** for logo and any hero motif — it animates well and stays crisp; the
  app's whole aesthetic is vector line-work, so an animated SVG heartbeat/telemetry
  hero would fit beautifully.
- **PWA:** `theme-color` is `#05070d`; viewport is zoom-locked, `viewport-fit=cover`,
  installed full-screen. There is **no web manifest yet** — if you want the maskable
  icons + name/theme used on Android too, note that a `manifest.webmanifest` should be
  added (icons 192/512, name "Cardiogram", background/theme `#05070d`).
- Keep contrast high on `#05070d`; respect the existing accent (`#19e3ff`) so the
  brand and the in-app data viz feel like one system.

## 7. Asset checklist

- [ ] Logo: horizontal wordmark (SVG) + standalone mark (SVG), light-on-dark + mono.
- [ ] favicon.svg (+ 16/32 png), apple-touch-icon 180, PWA 192/512 + maskable.
- [ ] Home page mockups: iPad-landscape + phone, all 4 hero states, annotated.
- [ ] (Optional) an animated SVG hero concept (heartbeat/telemetry pulse).
- [ ] Color/spacing specs referencing the tokens in §3.

**Repo reference:** `docs/SPEC.md` (full product spec), `src/components/Home.tsx`
(current home), `src/styles/global.css` (`:root` tokens).
