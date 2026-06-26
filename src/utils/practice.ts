// Free-practice analysis helpers.
//
// Everything here is a pure function of the already-built snapshot
// (DriverState.lapHistory + StintRow segments). No new API calls — so the
// Practice view works live, in replay and in simlive automatically, and the
// numbers always respect the replay clock (lapHistory is cut to it upstream).
//
// Two stories analysts read out of a practice session:
//   1. Qualifying sim  — the one peak lap (low fuel, fresh softs): a timesheet
//      with sector splits and each driver's ideal (best-sector) lap.
//   2. Long run        — sustained stints on race fuel: clean average pace and
//      tyre degradation, with out-/in-laps and traffic outliers removed.

import type { DriverState, LapDetail, StintRow } from '../api/types'
import { teamHex } from './format'

// ---- Quali-sim timesheet ----

export interface SectorBests {
  s1: number | null
  s2: number | null
  s3: number | null
}

export interface TimesheetRow {
  driverNumber: number
  acronym: string
  colour: string
  position: number // timesheet position (1 = fastest lap of the session)
  bestLap: number | null
  gapToBest: number | null // vs the session's fastest lap
  intervalAhead: number | null // vs the car one place ahead on the sheet
  bestSectors: SectorBests // each driver's own best S1/S2/S3 (may be from diff laps)
  idealLap: number | null // sum of bestSectors when all three are present
  compound: string | null // tyre on the best lap
  speedTrap: number | null // top speed-trap reading available
  laps: number // number of timed laps completed
}

export interface Timesheet {
  rows: TimesheetRow[]
  // Session-wide fastest sector times, for purple highlighting.
  sessionBest: SectorBests
  // Theoretical best lap of the session = sum of the fastest sector anywhere.
  theoreticalBest: number | null
}

// ---- Long runs ----

export interface RunLap {
  lap: number
  time: number
  // false ⇒ shown but excluded from the average (out-/in-lap, traffic outlier, or
  // a manual exclude). 'manual' also covers a lap the analyst forced back in.
  counted: boolean
  reason: 'out' | 'in' | 'outlier' | 'manual' | null
}

export interface Run {
  driverNumber: number
  acronym: string
  colour: string
  compound: string | null
  laps: RunLap[]
  countedLaps: number
  avg: number | null // mean of counted laps
  median: number | null
  best: number | null
  // Per-lap degradation (s/lap), least-squares slope over counted laps.
  degPerLap: number | null
  // Spread of counted laps (std dev), a consistency read.
  consistency: number | null
  isLongRun: boolean
}

export interface LongRunReport {
  runs: Run[]
  // Adaptive cut-off: the minimum counted-lap length to call a run a "long run".
  // Derived from this session's own longest run so red-flag / rain-shortened
  // sessions still surface their best efforts instead of showing nothing.
  threshold: number
  // The longest counted run anywhere in the session (what the threshold scales off).
  sessionMaxLen: number
}

// Laps slower than median * (1 + this) are treated as traffic/in-lap and dropped
// from the average (kept visible in the lap list, greyed).
const OUTLIER_PCT = 0.06

/** Compound covering a given lap number for a driver, via the stint segments. */
function compoundAt(segments: StintRow['segments'], lap: number): string | null {
  for (const s of segments) {
    if (lap >= s.lapStart && lap <= s.lapEnd) return s.compound
  }
  return null
}

/** Timed, non-pit-out laps for a driver, sorted ascending. */
function timedLaps(history: LapDetail[]): LapDetail[] {
  return history
    .filter((l) => l.time != null && Number.isFinite(l.time))
    .slice()
    .sort((a, b) => a.lap - b.lap)
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0
  const m = mean(xs)
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)))
}

/** Least-squares slope of y over x (seconds per lap). */
function slope(points: { x: number; y: number }[]): number | null {
  const n = points.length
  if (n < 2) return null
  const mx = mean(points.map((p) => p.x))
  const my = mean(points.map((p) => p.y))
  let num = 0
  let den = 0
  for (const p of points) {
    num += (p.x - mx) * (p.y - my)
    den += (p.x - mx) ** 2
  }
  return den === 0 ? null : num / den
}

// ---- Quali sim ----

export function buildTimesheet(drivers: DriverState[], stints: StintRow[]): Timesheet {
  const segsByDriver = new Map(stints.map((s) => [s.driverNumber, s.segments]))
  const rows: Omit<TimesheetRow, 'position' | 'gapToBest' | 'intervalAhead'>[] = drivers.map((d) => {
    const laps = timedLaps(d.lapHistory)
    const bestLap = d.bestLap ?? (laps.length ? Math.min(...laps.map((l) => l.time!)) : null)

    const bestOf = (pick: (l: LapDetail) => number | null): number | null => {
      const vals = laps.map(pick).filter((v): v is number => v != null && Number.isFinite(v))
      return vals.length ? Math.min(...vals) : null
    }
    const bestSectors: SectorBests = {
      s1: bestOf((l) => l.s1),
      s2: bestOf((l) => l.s2),
      s3: bestOf((l) => l.s3),
    }
    const idealLap =
      bestSectors.s1 != null && bestSectors.s2 != null && bestSectors.s3 != null
        ? bestSectors.s1 + bestSectors.s2 + bestSectors.s3
        : null

    // Compound the fastest lap was set on.
    const bestLapRecord = bestLap != null ? laps.find((l) => Math.abs(l.time! - bestLap) < 1e-6) : undefined
    const compound = bestLapRecord ? compoundAt(segsByDriver.get(d.driverNumber) ?? [], bestLapRecord.lap) : null

    return {
      driverNumber: d.driverNumber,
      acronym: d.acronym,
      colour: teamHex(d.teamColour),
      bestLap,
      bestSectors,
      idealLap,
      compound: compound ?? d.compound,
      speedTrap: d.speedTrap,
      laps: laps.length,
    }
  })

  // Sort: drivers with a lap first (fastest → slowest), then those with none.
  rows.sort((a, b) => {
    if (a.bestLap == null) return b.bestLap == null ? 0 : 1
    if (b.bestLap == null) return -1
    return a.bestLap - b.bestLap
  })

  const fastest = rows.find((r) => r.bestLap != null)?.bestLap ?? null

  const sessionBest: SectorBests = {
    s1: minOf(rows.map((r) => r.bestSectors.s1)),
    s2: minOf(rows.map((r) => r.bestSectors.s2)),
    s3: minOf(rows.map((r) => r.bestSectors.s3)),
  }
  const theoreticalBest =
    sessionBest.s1 != null && sessionBest.s2 != null && sessionBest.s3 != null
      ? sessionBest.s1 + sessionBest.s2 + sessionBest.s3
      : null

  let prevBest: number | null = null
  const out: TimesheetRow[] = rows.map((r, i) => {
    const gapToBest = r.bestLap != null && fastest != null ? r.bestLap - fastest : null
    const intervalAhead = r.bestLap != null && prevBest != null ? r.bestLap - prevBest : null
    if (r.bestLap != null) prevBest = r.bestLap
    return { ...r, position: i + 1, gapToBest, intervalAhead }
  })

  return { rows: out, sessionBest, theoreticalBest }
}

function minOf(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x))
  return v.length ? Math.min(...v) : null
}

// ---- Long runs ----

/**
 * Split a driver's laps into runs (one per stint compound) and score each.
 * A run breaks at: a tyre change, a pit-out lap, or a gap in lap numbers.
 */
function driverRuns(d: DriverState, stintRow: StintRow | undefined): Run[] {
  const segments = stintRow?.segments ?? []
  const laps = timedLaps(d.lapHistory)
  if (!laps.length) return []

  const groups: LapDetail[][] = []
  let cur: LapDetail[] = []
  let curCompound: string | null = null

  const flush = () => {
    if (cur.length) groups.push(cur)
    cur = []
  }

  for (const l of laps) {
    const comp = compoundAt(segments, l.lap)
    const prev = cur[cur.length - 1]
    const broken =
      prev != null && (l.lap !== prev.lap + 1 || comp !== curCompound || l.pitOut)
    if (broken) flush()
    if (cur.length === 0) curCompound = comp
    cur.push(l)
  }
  flush()

  const colour = teamHex(d.teamColour)
  return groups
    .map((g) => scoreRun(d, colour, compoundAt(segments, g[0].lap), g))
    .filter((r): r is Run => r != null)
}

function scoreRun(d: DriverState, colour: string, compound: string | null, group: LapDetail[]): Run | null {
  if (group.length < 2) return null

  // First flag out-/in-laps structurally, then drop traffic outliers off the
  // median of what remains.
  const lastIdx = group.length - 1
  const flagged: RunLap[] = group.map((l, i) => {
    let reason: RunLap['reason'] = null
    if (l.pitOut || i === 0) reason = 'out'
    else if (i === lastIdx) reason = 'in'
    return { lap: l.lap, time: l.time!, counted: reason == null, reason }
  })

  const bodyTimes = flagged.filter((x) => x.counted).map((x) => x.time)
  if (bodyTimes.length) {
    const med = median(bodyTimes)
    for (const x of flagged) {
      if (x.counted && x.time > med * (1 + OUTLIER_PCT)) {
        x.counted = false
        x.reason = 'outlier'
      }
    }
  }

  const counted = flagged.filter((x) => x.counted)
  const times = counted.map((x) => x.time)
  return {
    driverNumber: d.driverNumber,
    acronym: d.acronym,
    colour,
    compound,
    laps: flagged,
    countedLaps: counted.length,
    avg: times.length ? mean(times) : null,
    median: times.length ? median(times) : null,
    best: times.length ? Math.min(...times) : null,
    degPerLap: slope(counted.map((x, i) => ({ x: i, y: x.time }))),
    consistency: times.length >= 2 ? stdev(times) : null,
    isLongRun: false, // set after the adaptive threshold is known
  }
}

/**
 * Recompute a run's stats after the analyst manually flips some laps in or out.
 * `override` maps a lap number to its forced counted state; laps not in the map
 * keep their automatic classification. Pure — returns a fresh Run, so the live
 * report is never mutated.
 */
export function recountRun(run: Run, override: Map<number, boolean>): Run {
  const laps: RunLap[] = run.laps.map((l) => {
    const forced = override.get(l.lap)
    if (forced == null || forced === l.counted) return l
    return { ...l, counted: forced, reason: forced ? null : 'manual' }
  })
  const counted = laps.filter((l) => l.counted)
  const times = counted.map((l) => l.time)
  return {
    ...run,
    laps,
    countedLaps: counted.length,
    avg: times.length ? mean(times) : null,
    median: times.length ? median(times) : null,
    best: times.length ? Math.min(...times) : null,
    degPerLap: slope(counted.map((x, i) => ({ x: i, y: x.time }))),
    consistency: times.length >= 2 ? stdev(times) : null,
  }
}

/**
 * Adaptive long-run cut-off. Scales off this session's own longest clean run so
 * a rain- or red-flag-shortened session still flags its best efforts:
 *   normal FP2 (max ~14 laps) → 5     short / disrupted (max 5) → 3
 */
function adaptiveThreshold(maxLen: number): number {
  if (maxLen <= 3) return Math.max(2, maxLen)
  return Math.min(5, Math.max(3, Math.round(maxLen * 0.45)))
}

export function buildLongRuns(drivers: DriverState[], stints: StintRow[]): LongRunReport {
  const byDriver = new Map(stints.map((s) => [s.driverNumber, s]))
  const runs = drivers.flatMap((d) => driverRuns(d, byDriver.get(d.driverNumber)))

  const sessionMaxLen = runs.reduce((m, r) => Math.max(m, r.countedLaps), 0)
  const threshold = adaptiveThreshold(sessionMaxLen)
  for (const r of runs) r.isLongRun = r.countedLaps >= threshold

  // Long runs first, then by fastest average pace.
  runs.sort((a, b) => {
    if (a.isLongRun !== b.isLongRun) return a.isLongRun ? -1 : 1
    if (a.avg == null) return b.avg == null ? 0 : 1
    if (b.avg == null) return -1
    return a.avg - b.avg
  })

  return { runs, threshold, sessionMaxLen }
}
