# F1 Buddy 🏎️

A futuristic, data-dense **race-companion dashboard built for iPad in landscape**.
Run it on a second screen while you watch a Formula 1 race and get a live timing
feed similar to the F1 broadcast — gaps, tyres, stints, sectors and lap-time
analysis — rendered in a clean, dark, animated UI.

![F1 Buddy dashboard](docs/preview.png)

## Features

- **Race state** — track status banner (green / yellow / SC / VSC / red /
  chequered), current lap, circuit, session and live race-control messages,
  derived from the OpenF1 `race_control` feed.
- **Tyres per driver** — current compound (colour-coded) with tyre age in laps.
- **Stint length** — laps completed on the current set, per driver.
- **Last lap** — each driver's most recent lap time, highlighted green for a
  personal best and purple for the session's fastest lap.
- **Gaps** — interval to the car ahead **and** gap to the leader, with lapped
  cars handled.
- **Sector performance** — S1/S2/S3 coloured as overall fastest (purple),
  personal best (green) or slower (yellow). These are **computed from sector
  durations** because OpenF1's mini-sector colours are unavailable during races.
- **Lap-time series** — a per-row trend sparkline, plus a dedicated
  **Lap-Time Analysis** panel where you pick any drivers to compare, choose the
  window (last 5 / 6 / 7 / 10 laps) and read each driver's rolling average.

## Data source

Powered by the free, open [OpenF1 API](https://openf1.org/) (`api.openf1.org/v1`):
`sessions`, `drivers`, `intervals`, `position`, `laps`, `stints`, `pit`,
`race_control` and `weather`.

- **Historical data (2023+) is free** and needs no key.
- **True real-time timing requires a paid OpenF1 subscription.** Add your key in
  **Settings → API Key** and it is sent as a `Bearer` token. You can also point
  the base URL at your own authenticated proxy.

### Modes

- **Demo** *(default)* — a fully offline race simulator that produces
  OpenF1-shaped data and runs through the exact same rendering pipeline as live
  data. Great for trying the UI when no race is on (≈4 real seconds per lap).
- **Live** — polls a real session. Set the session to `latest` for whatever is
  currently running, or paste a specific OpenF1 `session_key` to replay a past
  race. Order/gaps refresh every ~4.5 s; laps/stints/flags every ~12 s.

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
  api/          OpenF1 client + raw/derived types
  data/sim.ts   offline race simulator (Demo mode)
  store/        polling + state orchestration (useRaceData)
  utils/        formatting + the derivation pipeline (raw -> view model)
  components/    Header, TimingTower, LapAnalysis, LapChart, Ticker, Settings…
```

The key idea: **all data — live or simulated — is normalised by
`utils/derive.ts` into a single `RaceSnapshot`** that the components render.
