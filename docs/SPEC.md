# F1 Buddy — Specification

A race-companion dashboard for Formula 1, built on the [OpenF1](https://openf1.org)
API. Designed for iPad landscape, responsive down to phones.

## 1. Data

- **Source:** OpenF1 REST. Historical data (2023+) is free; live data (the window
  from 30 min before a session to 30 min after it ends) needs a paid key.
- **Caching proxy:** holds the API key server-side, caches responses (~2 s TTL)
  and coalesces identical/concurrent requests, so one key serves many viewers (a
  single browser otherwise exceeds the 60 req/min paid cap). Two forms, same
  logic: `server/proxy.mjs` (standalone Node, via `VITE_OPENF1_BASE_URL`) and
  `api/[...path].mjs` (Vercel serverless). On Vercel the app calls `/api/v1/...`
  same-origin; set `OPENF1_API_KEY` in the project env and live data works with
  no client config or key in the browser.
- **Derivation:** all raw feeds are normalised by `utils/derive.ts` into one
  `RaceSnapshot` that every view renders. `buildLapMarkers` / `rawTimeBounds`
  define the timeline; `filterRawByTime` reveals the snapshot at a playback time.

## 2. Playback engine (`store/useRaceData.ts`)

There is a single engine for both live and historical sessions.

- **Load:** resolve a session (`latest` or a numeric `session_key`), fetch the
  full bundle of feeds for the session so far.
- **Clock:** playback runs on a virtual clock; the snapshot only ever reveals
  data up to `tNow`, so you are never shown anything ahead of where you're
  watching.
- **Reveal-by-time (spoiler safety):** a lap *record* appears at its start (so
  the current-lap counter is correct), but each **sector time** is revealed only
  after the car crosses that sector and the **lap time** only at the finish line.
  Fastest-sector alerts therefore fire at the crossing, fastest-lap at the line —
  never at lap start.
- **Live extension:** an in-progress session keeps re-fetching (~12 s) to push the
  timeline end forward. Telemetry (`car_data` / `location`) is fetched in a
  window around the clock to stay light.

## 3. Entry — home screen (`components/Home.tsx`)

The first page is a landing screen driven by the season calendar
(`hooks/useCalendar.ts`, from OpenF1 `sessions`/`meetings`, re-evaluated each
second):

- **A session is live now** → a **● LIVE** card with an *Enter live session*
  button (every on-track session counts: practice, qualifying, sprint, race).
- **Nothing live** → a live **countdown** to the next session, a **Replay the
  last race** shortcut, and a **Load a past session** button opening a
  full-screen picker (`components/SessionPicker.tsx`: year → Grand Prix →
  session).

Routing: a **live** pick loads real-time live mode; a **historical** pick loads
as **live-sim** (replayed as if live from lights-out). The ⌂ button on the nav
returns to the home screen.

## 3a. Watching modes

- **Start from the beginning (default for live):** joining an in-progress race
  begins at lights-out, spoiler-free. A one-time prompt offers **Watch from the
  start** vs **Jump to live**; the two are deliberately separated and styled
  differently so a mis-tap can't reveal the running order.
- **● LIVE catch-up:** a broadcast-style button jumps to and follows the live
  edge. Playback speed is locked to 1× while at the edge (you can't outrun real
  time); speeds >1× are available only when behind, to catch up.
- **Load a race:** Settings → Load a race (year → Grand Prix → session).
- **`?simlive=<session_key>`:** dev mode that replays a finished race as if it
  were live, for rehearsing the live flow without a live session. See
  `docs/proposals/simlive.md`.

## 4. Scrubber (`components/ReplayBar.tsx`)

- Play/pause, 1–12× speed, lap-step ‹ ›, and a scrubber with **per-lap tick
  markers** you can tap to jump.
- **Pre-race** (standing/grid) is shaded as a hatched band; the **formation lap
  (“lap 0”)** is a distinct amber band, with a lights-out boundary line at lap 1.
- Lap markers reflect only data revealed so far; future laps are hidden.

## 5. Alerts (`hooks/useRaceNotices.ts`, `components/NoticeStack.tsx`)

Auto-dismissing popovers, stacked newest-at-bottom so a burst reads in order:

- **Fastest lap** and **fastest sector (overall)** — fire at the real crossing.
- **Race control** bulletins — message normalised from ALL CAPS to sentence
  case, preserving acronyms (DRS/VSC), driver codes `(VER)` and positions `P4`.
- **Team radio** — playable clips.

The full history always remains in the Race Control tab.

## 6. Chrome

- **Nav row** (`components/ViewTabs.tsx`): a left-aligned **⌂ home** button, the
  view tabs, plus a right-aligned **track-status light** (glowing dot: clear /
  yellow / SC·VSC / red / chequered, with a label for the states that matter;
  falls back to connection state before a session is live) and the **settings**
  gear.
- **No persistent header**: the lap is shown in the scrubber; flag status is the
  nav dot. A weather strip is the only footer.

## 7. Views

`Timing` (tower + lap-time analysis), `Track Map`, `Speed Map`, `Gap to Leader`,
`Telemetry`, `Strategy`, `Pit Simulator` (what-if pit-stop order vs. live),
`Race Control`, `Weather`.

- **Track Map:** draws the real circuit outline from a generated library
  (`data/circuits.ts`, from the MIT f1-circuits dataset), **registered onto the
  live coordinate frame** (`utils/trackAlign.ts`) so the car dots sit on it;
  falls back to the location-feed trace if no circuit matches or the fit is poor.

## 8. Responsive

- iPad-landscape first. At **≤640px** the shell reflows to a single touch-friendly
  column: header collapses, tabs scroll horizontally, the scrubber gets its own
  row, multi-column views stack, and driver focus becomes a full-screen overlay.

## 9. Stack

React + TypeScript + Vite, Framer Motion, hand-built SVG charts, a single
design-token CSS layer (`styles/global.css`).
