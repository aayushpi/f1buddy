# F1 Buddy 🏎️

A futuristic, data-dense **race-companion dashboard built for iPad in landscape**.
Run it on a second screen while you watch a Formula 1 race and get a live timing
feed similar to the F1 broadcast — gaps, tyres, stints, sectors and lap-time
analysis — rendered in a clean, dark, animated UI.

![F1 Buddy dashboard](docs/preview.png)

## Views

A landscape tab bar switches between six full-screen views, each surfacing a
different slice of the OpenF1 feed:

1. **Timing** — the live timing tower (status, tyres + age, stint length, last
   lap, interval & leader gaps, computed sector performance, per-row lap-time
   trend) alongside the configurable **Lap-Time Analysis** panel.
2. **Track Map** — every car's live position on the circuit (`location`), with
   DRS zones highlighted and a glow ring when a car has DRS open.
3. **Telemetry** — per-driver `car_data`: speed, RPM, gear, throttle, brake and
   DRS, with a live speed trace. Compare up to four drivers side by side.
4. **Strategy** — a tyre-stint Gantt timeline, the pit-stop log with stationary
   times, starting **grid → current position** deltas, and the final
   classification (`session_result`) once the flag drops.
5. **Race Control** — the full `race_control` message log with coloured flags,
   an `overtakes` feed, and `team_radio` clips with in-app playback.
6. **Weather** — current conditions plus trend charts for track/air temp,
   humidity and wind.

## Features

- **Race state** — status banner (green / yellow / SC / VSC / red / chequered),
  current lap, circuit, session and live race-control messages.
- **Tyres, stints & strategy** — compound + tyre age per driver, current stint
  length, and a full stint Gantt with pit-stop history.
- **Last lap & lap-time series** — highlighted PB (green) / session-fastest
  (purple), a per-row sparkline, and a multi-driver comparison chart with a
  configurable window (5 / 6 / 7 / 10 laps) and rolling averages.
- **Gaps** — interval to the car ahead **and** gap to the leader (lapped cars
  handled).
- **Sector performance** — S1/S2/S3 coloured as overall fastest / personal best
  / slower, **computed from sector durations** because OpenF1's mini-sector
  colours are unavailable during races.
- **Car telemetry** — speed, RPM, gear, throttle, brake, DRS and speed traces.
- **Track positions, overtakes, team radio, grid, results and weather** — every
  remaining OpenF1 data set, each with a dedicated visualisation.

## Data source

Powered by the free, open [OpenF1 API](https://openf1.org/) (`api.openf1.org/v1`).
**Every** OpenF1 endpoint is consumed: `meetings`, `sessions`, `drivers`,
`intervals`, `position`, `laps`, `stints`, `pit`, `race_control`, `weather`,
`car_data`, `location`, `team_radio`, `overtakes`, `starting_grid` and
`session_result`.

- **All historical data (2023+) is free and needs no key** — including
  `car_data` telemetry and `location` track positions. Replaying any past race
  costs nothing.
- **Only the live, real-time stream requires a paid OpenF1 subscription.** The
  recommended setup keeps the key **server-side**: deploy to Vercel and set
  `OPENF1_API_KEY` in the project env. The bundled serverless proxy
  (`api/proxy.js`) injects it as a `Bearer` token and the app calls it
  same-origin at `/api/v1`, so the key never reaches the browser and one key
  serves every viewer. (Settings → API Key still works as a local override.)

### How it plays

The app opens on a **home screen** built from the season calendar:

- **A session live right now** → an **● LIVE** card that takes you straight into
  real-time timing (every on-track session counts — practice, qualifying, sprint
  and race).
- **Nothing live** → a live **countdown** to the next session, a one-tap
  **Replay the last race** shortcut, and **Load a past session** — a full-screen
  picker (year → Grand Prix → session).

A **live** session plays in real time; a **historical** pick loads the **full
race** (the whole timeline available to scrub), with a **Simulate live** toggle
in the picker to instead replay it as if live for testing. Either way it runs
through one engine: a virtual clock with **play/pause, 1–12× speed, a scrubber
with per-lap markers you can tap to jump (pre-race / formation-lap segments
shaded), and ‹ › lap-step buttons**. Every view reflects the exact state at the
playback moment, and the clock only ever reveals data up to that point — so you
never get spoiled.

- **Start from the beginning, no spoilers.** Entering an in-progress (or
  live-sim) race begins at lights-out, not the live edge. A **● LIVE** button
  jumps to and follows the leading edge to catch up; speeds above 1× are disabled
  once you're at the edge. The timeline keeps extending as the race runs.
- **⌂ Home** on the nav returns to the landing page at any time.
- **`?simlive=<session_key>`** replays a finished race *as if it were live* for
  rehearsing the live flow midweek — see `docs/proposals/simlive.md`.

The clock is anchored to the racing feeds (not the pre-race weather/race-control
records), and `car_data`/`location` are streamed in a window around the clock so
the map and telemetry stay light.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
```

Open it on the iPad's browser in landscape and (optionally) **Add to Home
Screen** for a full-screen, chrome-free experience.

### Build

```bash
npm run build    # type-check + production bundle into dist/
npm run preview  # serve the production build
```

## Tech

- **React + TypeScript + Vite**
- **Framer Motion** for the animated, position-swapping timing tower and panels
- Hand-built **SVG** charts/sparklines for full control of the look
- A single design-token CSS layer (`src/styles/global.css`)

## Project layout

```
src/
  api/             OpenF1 client + raw/derived types
  data/circuits.ts real circuit outlines (from the MIT f1-circuits dataset)
  store/           polling + replay clock orchestration (useRaceData)
  utils/           formatting + the derivation pipeline (raw -> view model)
  components/      ViewTabs, TimingTower, LapAnalysis, ReplayBar, Settings…
server/proxy.mjs   caching proxy (keeps the API key server-side, fans out to viewers)
```

The key idea: **all data is normalised by `utils/derive.ts` into a single
`RaceSnapshot`** that the components render.
