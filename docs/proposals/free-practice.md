# Free Practice page — design handoff

Status: **Implemented (first pass)** · branch `feature/free-practice-page`
Related: `src/components/views/PracticeView.tsx`, `src/utils/practice.ts`,
`src/components/ViewTabs.tsx`, `src/App.tsx`, gating on `RaceState.sessionType`.

This doc is the brief for a design pass (e.g. the `prototype` / Claude-design
skill) in case the first-shot UX needs reworking. The **data layer and the
analysis maths are settled** — a redesign should reuse `src/utils/practice.ts`
unchanged and only re-skin / re-lay-out the presentation in `PracticeView.tsx`
and the `Free Practice view` block in `src/styles/global.css`.

## Why this page exists

A practice session is read completely differently from a race. There is no
"result" — instead engineers extract two things:

1. **Qualifying simulation** — the single peak lap (low fuel, fresh softs, full
   engine mode). You want the timesheet, the gap to P1, the **sector splits**,
   the **ideal lap** (sum of a driver's best sectors), the tyre used, and top
   speed.
2. **Long run / race sim** — sustained multi-lap stints on race fuel. You want
   **clean average pace** and **tyre degradation**, with out-laps, in-laps and
   traffic-spoiled laps removed — otherwise the averages lie.

Sources that informed the model:
[Podium Prophets — long-run pace explained](https://podiumprophets.com/blog/f1-long-run-pace-explained),
[GPKingdom race-pace analysis](https://gpkingdom.it/en/39899/race-pace-analysis-fp1-qatar-very-few-reliable-references-among-the-teams/),
[F1 — beginner's guide to the weekend](https://www.formula1.com/en/latest/article/the-beginners-guide-to-the-formula-1-weekend.5RFZzGXNhEi9AEuMXwo987).

## Where it appears

- The **Free Practice** tab leads the tab bar, **only** when
  `sessionType` contains "practice" (P1/P2/P3). Hidden for Race / Qualifying /
  Sprint. All the normal tabs stay (per product decision).
- Entering a practice session **auto-opens** this page once (seeded per session,
  same pattern as the Gap-to-Leader seeding). A leftover `practice` view is
  reset to Timing when a non-practice session loads.
- It is replay-/live-/simlive-safe automatically: it reads `lapHistory` and
  `stints` straight off the snapshot, which is already cut to the replay clock.

## Data contract (do not break)

Everything derives client-side from the existing snapshot — **no new API calls,
no new types.**

- `DriverState.lapHistory: LapDetail[]` — `{ lap, time, s1, s2, s3, pitOut }`,
  oldest→newest.
- `DriverState.bestLap`, `.speedTrap`, `.compound`, `.acronym`, `.teamColour`.
- `RaceSnapshot.stints: StintRow[]` — segments `{ compound, lapStart, lapEnd }`,
  used to label each lap's compound and split runs at tyre changes.

`src/utils/practice.ts` turns that into two view models:

- `buildTimesheet(drivers, stints) → Timesheet` — sorted rows with best lap,
  gap, interval, per-driver best sectors, ideal lap, compound, trap, lap count;
  plus session-best sectors + theoretical best.
- `buildLongRuns(drivers, stints) → LongRunReport` — `Run[]` (one per stint),
  each with `avg`, `median`, `best`, `degPerLap` (least-squares slope),
  `consistency` (std dev), and per-lap `counted` flags.

### Run detection & the adaptive threshold

- A **run** is a maximal block of consecutive timed laps within one stint. It
  breaks at a tyre change, a pit-out lap, or a gap in lap numbers.
- The **out-lap** (first lap / pit-out) and **in-lap** (last lap of the stint)
  are flagged `counted: false`; then laps slower than `median × 1.06` are
  dropped as traffic/outliers. Excluded laps stay visible but greyed.
- A run is a **"long run"** if its counted length ≥ an **adaptive threshold**.
  The threshold scales off this session's own longest run
  (`round(maxLen × 0.45)`, clamped 3–5; lower for very short sessions) so a
  rain- or red-flag-shortened session still surfaces its best efforts instead of
  showing nothing. The threshold + longest-run length are shown in the UI header
  so the cut-off is transparent. Tune the constants in `adaptiveThreshold()` /
  `OUTLIER_PCT`.

## Current layout (the thing to critique)

```
[ Quali Sims | Long Runs ]                          <session name>

QUALI SIMS
  ┌ banner: Fastest lap · Theoretical best · Ideal sectors ┐
  └ table: # | Driver | Tyre | Best Lap | Gap | Int | S1 S2 S3 | Ideal | Trap | Laps
            (session-best sectors highlighted purple)

LONG RUNS
  ┌ Race-pace ranking ──────────── long run ≥ N laps · longest M ┐
  │  swatch ACR ◯tyre [════ pace bar ════]  Ø1:21.4  +0.18/L  9L  │  ← click to select
  └──────────────────────────────────────────────────────────────┘
  ┌ Selected run detail ─────────────────────────────────────────┐
  │  ACR ◯  Avg · Best · Deg · Consistency · Counted             │
  │  per-lap bar chart (counted = compound colour, excluded grey, │
  │  dashed average line)                                         │
  └──────────────────────────────────────────────────────────────┘
```

## Known first-pass limitations (fair game for a redesign)

- **Speed trap** is the latest lap's reading from `DriverState.speedTrap`, not a
  session max (lapHistory carries no per-lap trap). Label it as "Trap", don't
  over-claim "top speed".
- No **fuel correction** — long-run averages are raw. A deg slope partly mixes
  fuel burn (faster) with tyre wear (slower). Documented, not corrected.
- The long-runs sub-tab shows **one** selected run at a time. A cross-driver
  multi-run overlay (e.g. lap-time lines per driver on a shared axis) would be a
  natural richer view if a redesign wants it — the `Run` model already supports
  it.
- Compound on the best quali lap is matched by exact lap-time equality against
  `bestLap`; fine in practice but a tolerance-based match if it ever drifts.
- Mobile/iPad-portrait: the timesheet scrolls horizontally and the long-runs
  columns wrap (`.lr` is `flex-wrap`). Worth a dedicated narrow layout.

## Redesign checklist

- [ ] Keep `practice.ts` as the single source of truth; only restyle.
- [ ] Preserve the Practice-only tab gating and the auto-open-once behaviour.
- [ ] Keep excluded laps visible (greyed) — hiding them hides *why* an average is
      what it is.
- [ ] Keep the adaptive-threshold label visible.
- [ ] Verify against a real session via simlive (see `simlive.md`) — pick a
      Practice `session_key`.
