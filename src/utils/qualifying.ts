// Qualifying analysis helpers.
//
// Like practice.ts, everything here is a pure function of the already-built
// snapshot (DriverState + StintRow), so the Qualifying view works live, in
// replay and in simlive automatically and always respects the replay clock.
//
// A qualifying session reads differently from a race or a practice. There is no
// race result and no long-run; there is a *grid being built by elimination*.
// The two stories an analyst (or a fan) reads out of qualifying are:
//   1. The knockout — the provisional order with the elimination lines drawn
//      through it: who is into the pole shootout, who is in the drop zone, and
//      above all who is sitting *on the bubble* (the gap to the cut line).
//   2. Sectors & teammates — where the lap time is being found (sector kings,
//      each car's ideal lap / time left on the table) and the sport's purest
//      yardstick: the intra-team qualifying delta.
//
// The one-lap timesheet maths (best lap, gap, per-driver best sectors, ideal
// lap, session-best sectors, theoretical best) is identical to a practice
// quali-sim, so we reuse buildTimesheet from practice.ts unchanged and layer the
// knockout + teammate reads on top.

import type { DriverState, LapDetail, QualifyingClassification, StintRow } from '../api/types'
import type { QualiSegment } from './derive'
import { teamHex } from './format'
import { buildTimesheet, type SectorBests, type TheoreticalBest, type TimesheetRow } from './practice'

// Which side of the elimination lines a car currently sits on.
//   'pole' — provisionally into the top-10 pole shootout (Q3).
//   'q2'   — safe from the Q1 cut but outside the top 10 (the Q2 zone).
//   'out'  — currently in the Q1 drop zone.
export type Zone = 'pole' | 'q2' | 'out'

export interface QualiRow extends TimesheetRow {
  teamName: string
  zone: Zone
  // Signed gap (s) to the elimination line that matters to this car, with a
  // consistent sign: negative ⇒ on the safe side with that much cushion;
  // positive ⇒ on the wrong side and must find that much. The reference line is
  // the top-10 cut for pole/Q2 cars and the Q1 cut for cars in the drop zone.
  toLine: number | null
  // Straddles one of the two cut lines (the last-safe or first-out car) — the
  // cars whose next lap decides an elimination.
  onBubble: boolean
  // This driver's best lap minus their fastest teammate's — the qualifying
  // head-to-head. Negative ⇒ ahead of the garage. null if either lap is missing.
  teammateDelta: number | null
  teammateAhead: boolean | null
}

export interface QualifyingReport {
  rows: QualiRow[]
  sessionBest: SectorBests
  theoreticalBest: TheoreticalBest | null
  // True when the order is the official FIA classification (Q1/Q2/Q3 times),
  // rather than a provisional best-lap timesheet that evolves with the clock.
  official: boolean
  // Whether each cut has actually been made yet (Q1/Q2 running has ended). The
  // view only strikes a tier's eliminated cars once its cut is settled, so the
  // drop zone isn't crossed out while those cars can still improve.
  q1Settled: boolean
  q2Settled: boolean
  pole: { acronym: string; colour: string; time: number } | null
  // The field, and the two elimination lines — all derived from the entry list
  // so a 20-car grid (5 out per cut) and a 22-car grid (6 out per cut) both fall
  // out correctly with no hardcoding. See deriveCuts().
  fieldSize: number
  q3Cut: number // last position into the pole shootout (≤ 10)
  q1Cut: number // last position safe from the Q1 cut (= fieldSize − eliminated)
  eliminatedPerSegment: number
}

/**
 * Elimination structure from the field size alone. Q3 always holds the top 10;
 * the remaining cars are split evenly between the Q1 and Q2 cuts. So 22 cars →
 * 6 out per cut (top 16, then top 10); 20 cars → 5 out per cut. Adapts to any
 * field (including a short test field) instead of baking in a season's number.
 */
function deriveCuts(fieldSize: number): { q3Cut: number; q1Cut: number; eliminatedPerSegment: number } {
  const q3Cut = Math.min(10, fieldSize)
  const eliminatedPerSegment = Math.max(0, Math.round((fieldSize - q3Cut) / 2))
  const q1Cut = fieldSize - eliminatedPerSegment
  return { q3Cut, q1Cut, eliminatedPerSegment }
}

/** Best (fastest non-null) of a driver's [Q1, Q2, Q3] segment times. */
function bestSegment(segments: (number | null)[]): number | null {
  const v = segments.filter((s): s is number => s != null && Number.isFinite(s))
  return v.length ? Math.min(...v) : null
}

type Seg3 = [number | null, number | null, number | null]

/**
 * A driver's best timed lap within Q1 / Q2 / Q3 from the laps revealed so far.
 * Each lap belongs to the latest segment whose start time it's past (s2/s3 are
 * the Q2/Q3 start times), so the split evolves with the replay clock.
 */
function bestPerSegment(d: DriverState, s2: number, s3: number): Seg3 {
  const best: Seg3 = [null, null, null]
  for (const l of d.lapHistory) {
    if (l.time == null || !Number.isFinite(l.time) || l.date == null) continue
    const i = l.date >= s3 ? 2 : l.date >= s2 ? 1 : 0
    if (best[i] == null || l.time < best[i]!) best[i] = l.time
  }
  return best
}

/**
 * Provisional knockout order from the laps revealed so far — how a live timing
 * screen restructures the grid. Once Q1 running ends, its slowest cars lock to
 * the bottom on their Q1 time and the survivors re-rank on Q2; likewise into Q3.
 * Critically a car that reaches a segment but sets no time there sinks to the
 * back of that segment's group instead of being promoted by a quicker
 * earlier-segment lap — so a driver into Q3 with no Q3 lap is classified last of
 * the top ten (P10), not bumped up by a faster Q2 time.
 */
function provisionalKnockout(
  drivers: DriverState[],
  segments: QualiSegment[],
  q1Advance: number,
  q3Group: number,
): { driverNumber: number; bestLap: number | null }[] {
  const s2 = segments[1].start
  const s3 = segments[2].start
  const seg = new Map(drivers.map((d) => [d.driverNumber, bestPerSegment(d, s2, s3)]))
  const overall = new Map(drivers.map((d) => [d.driverNumber, bestSegment(seg.get(d.driverNumber)!)]))

  // Which segments have begun in the revealed data (so the cuts only lock in
  // once their running has actually started under the replay clock).
  let maxDate = -Infinity
  for (const d of drivers) for (const l of d.lapHistory) if (l.date != null && l.date > maxDate) maxDate = l.date
  const q1Done = maxDate >= s2
  const q2Done = maxDate >= s3

  const bySeg = (nums: number[], i: 0 | 1 | 2) =>
    nums.slice().sort((a, b) => {
      const ta = seg.get(a)![i]
      const tb = seg.get(b)![i]
      if (ta == null) return tb == null ? 0 : 1
      if (tb == null) return -1
      return ta - tb
    })

  const all = drivers.map((d) => d.driverNumber)
  let ordered: number[]
  if (!q1Done) {
    ordered = bySeg(all, 0)
  } else {
    const byQ1 = bySeg(all, 0)
    const advancers = byQ1.slice(0, q1Advance)
    const q1Out = byQ1.slice(q1Advance)
    if (!q2Done) {
      ordered = [...bySeg(advancers, 1), ...q1Out]
    } else {
      const byQ2 = bySeg(advancers, 1)
      const q3 = byQ2.slice(0, q3Group)
      const q2Out = byQ2.slice(q3Group)
      ordered = [...bySeg(q3, 2), ...q2Out, ...q1Out]
    }
  }
  return ordered.map((dn) => ({ driverNumber: dn, bestLap: overall.get(dn) ?? null }))
}

// A driver's place in the running order, plus the lap that earns it. Built from
// the official classification, the provisional knockout, or a plain best-lap
// timesheet, then enriched with sectors/ideal/trap from the timesheet below.
interface OrderEntry {
  driverNumber: number
  position: number
  bestLap: number | null
}

export function buildQualifying(
  drivers: DriverState[],
  stints: StintRow[],
  official?: QualifyingClassification[] | null,
  segments?: QualiSegment[] | null,
): QualifyingReport {
  const sheet = buildTimesheet(drivers, stints)
  const teamByNumber = new Map(drivers.map((d) => [d.driverNumber, d.teamName]))
  const sheetByNumber = new Map(sheet.rows.map((r) => [r.driverNumber, r]))

  const useOfficial = !!official && official.length > 0
  const useKnockout = !useOfficial && !!segments && segments.length === 3
  // Both authoritative orders can place a car ahead of one with a slower shown
  // best lap (their quick lap came in a segment they didn't survive), so a
  // negative interval to the car ahead is meaningless and gets blanked below.
  const knockoutOrdered = useOfficial || useKnockout

  // The running order. Official mode is the final FIA classification; before the
  // session ends the provisional knockout mirrors it lap by lap; failing both
  // (no segment data) we fall back to a plain best-lap timesheet.
  let order: OrderEntry[]
  if (useOfficial) {
    order = official!
      .filter((c) => c.position != null)
      .map((c) => ({ driverNumber: c.driverNumber, position: c.position!, bestLap: bestSegment(c.segments) }))
      .sort((a, b) => a.position - b.position)
      // Renumber 1..n so the cut lines line up even if the feed has gaps.
      .map((e, i) => ({ ...e, position: i + 1 }))
  } else if (useKnockout) {
    const cuts = deriveCuts(drivers.length)
    order = provisionalKnockout(drivers, segments!, cuts.q1Cut, cuts.q3Cut).map((e, i) => ({
      driverNumber: e.driverNumber,
      position: i + 1,
      bestLap: e.bestLap,
    }))
  } else {
    order = sheet.rows.map((r) => ({ driverNumber: r.driverNumber, position: r.position, bestLap: r.bestLap }))
  }

  // Whether each cut has been made yet — true throughout the official result;
  // during the provisional knockout, derived from how far the revealed laps have
  // progressed past each segment's start.
  let q1Settled = useOfficial
  let q2Settled = useOfficial
  if (useKnockout) {
    let maxDate = -Infinity
    for (const d of drivers) for (const l of d.lapHistory) if (l.date != null && l.date > maxDate) maxDate = l.date
    q1Settled = maxDate >= segments![1].start
    q2Settled = maxDate >= segments![2].start
  }

  const fieldSize = order.length
  const { q3Cut, q1Cut, eliminatedPerSegment } = deriveCuts(fieldSize)

  const bestLapByNumber = new Map(order.map((e) => [e.driverNumber, e.bestLap]))
  const timeAt = (pos: number): number | null => order.find((e) => e.position === pos)?.bestLap ?? null
  const cut10 = timeAt(q3Cut) // slowest lap still into the pole shootout
  const cut10Next = timeAt(q3Cut + 1) // fastest lap currently outside the top 10
  const cutQ1 = timeAt(q1Cut) // slowest lap still safe from the Q1 cut

  const bubble = new Set([q3Cut, q3Cut + 1, q1Cut, q1Cut + 1])
  const fastest = order.find((e) => e.bestLap != null)?.bestLap ?? null

  let prevBest: number | null = null
  const rows: QualiRow[] = order.map((e) => {
    const base: TimesheetRow = sheetByNumber.get(e.driverNumber) ?? {
      driverNumber: e.driverNumber,
      acronym: drivers.find((d) => d.driverNumber === e.driverNumber)?.acronym ?? String(e.driverNumber),
      colour: '#8a93a6',
      position: e.position,
      bestLap: e.bestLap,
      gapToBest: null,
      intervalAhead: null,
      bestSectors: { s1: null, s2: null, s3: null },
      idealLap: null,
      compound: null,
      speedTrap: null,
      laps: 0,
    }

    const gapToBest = e.bestLap != null && fastest != null ? e.bestLap - fastest : null
    // Interval to the car ahead. In a knockout order a car can show a faster
    // best lap than the car ahead (its quick lap came in an earlier segment it
    // didn't survive); a negative interval there is misleading, so blank it.
    let intervalAhead = e.bestLap != null && prevBest != null ? e.bestLap - prevBest : null
    if (knockoutOrdered && intervalAhead != null && intervalAhead < 0) intervalAhead = null
    if (e.bestLap != null) prevBest = e.bestLap

    const teamName = teamByNumber.get(e.driverNumber) ?? ''
    const zone: Zone = e.position <= q3Cut ? 'pole' : e.position <= q1Cut ? 'q2' : 'out'

    let toLine: number | null = null
    if (e.bestLap != null) {
      if (zone === 'out') {
        toLine = cutQ1 != null ? e.bestLap - cutQ1 : null // deficit to safety (positive)
      } else if (zone === 'q2') {
        toLine = cut10 != null ? e.bestLap - cut10 : null // deficit to the top 10 (positive)
      } else {
        // In the shootout: cushion to the first car out (negative ⇒ safe by |x|).
        toLine = cut10Next != null ? e.bestLap - cut10Next : null
      }
    }

    // Fastest teammate (a team can momentarily field >2 cars across a weekend).
    let teammateBest: number | null = null
    for (const [num, team] of teamByNumber) {
      if (num === e.driverNumber || team !== teamName) continue
      const bl = bestLapByNumber.get(num) ?? null
      if (bl != null && (teammateBest == null || bl < teammateBest)) teammateBest = bl
    }
    const teammateDelta = e.bestLap != null && teammateBest != null ? e.bestLap - teammateBest : null

    return {
      ...base,
      position: e.position,
      bestLap: e.bestLap,
      gapToBest,
      intervalAhead,
      teamName,
      zone,
      toLine,
      onBubble: bubble.has(e.position) && e.bestLap != null,
      teammateDelta,
      teammateAhead: teammateDelta == null ? null : teammateDelta < 0,
    }
  })

  const top = rows.find((r) => r.bestLap != null)
  const pole = top ? { acronym: top.acronym, colour: top.colour, time: top.bestLap! } : null

  return {
    rows,
    sessionBest: sheet.sessionBest,
    theoreticalBest: sheet.theoreticalBest,
    official: useOfficial,
    q1Settled,
    q2Settled,
    pole,
    fieldSize,
    q3Cut,
    q1Cut,
    eliminatedPerSegment,
  }
}

// ---- Mini-sector strip ----

export interface MiniSectorRow {
  driverNumber: number
  acronym: string
  colour: string
  bestLap: number | null
  // Mini-sector status codes for the driver's best lap, one array per sector.
  s1: number[]
  s2: number[]
  s3: number[]
}

/**
 * Each driver rendered as its mini-sector status codes — the data behind the
 * mini-sector strip. OpenF1 gives the marshalling-segment colours
 * (purple/green/yellow/pit), not per-mini-sector times, so this is a
 * *where-on-track* read, not a numeric split. Rows come out fastest-lap first.
 *
 * `lap` chooses which lap the strip is drawn from:
 *   - 'best'    — the driver's fastest lap (where their benchmark was won/lost).
 *   - 'current' — the most recent lap carrying segment data (the lap on track
 *     right now under the replay clock), so the timing screen shows live
 *     mini-sectors as they light up. Falls back to the best lap if the latest
 *     laps have no segment data.
 */
export function buildMiniSectorRows(drivers: DriverState[], lap: 'best' | 'current' = 'best'): MiniSectorRow[] {
  const hasSeg = (l: LapDetail) => !!(l.seg1?.length || l.seg2?.length || l.seg3?.length)
  const rows: MiniSectorRow[] = drivers.map((d) => {
    let best: LapDetail | null = null
    let current: LapDetail | null = null
    for (const l of d.lapHistory) {
      if (l.time != null && Number.isFinite(l.time) && (best == null || l.time < best.time!)) best = l
      if (hasSeg(l) && (current == null || l.lap > current.lap)) current = l
    }
    const strip = lap === 'current' ? (current ?? best) : best
    return {
      driverNumber: d.driverNumber,
      acronym: d.acronym,
      colour: teamHex(d.teamColour),
      bestLap: best?.time ?? null,
      s1: strip?.seg1 ?? [],
      s2: strip?.seg2 ?? [],
      s3: strip?.seg3 ?? [],
    }
  })
  rows.sort((a, b) => {
    if (a.bestLap == null) return b.bestLap == null ? 0 : 1
    if (b.bestLap == null) return -1
    return a.bestLap - b.bestLap
  })
  return rows
}

// ---- Teammate head-to-head ----

export interface TeammatePair {
  teamName: string
  colour: string
  // Faster car first.
  faster: { acronym: string; bestLap: number | null }
  slower: { acronym: string; bestLap: number | null }
  delta: number | null // slower − faster (≥ 0), null if a lap is missing
}

/**
 * One row per team, faster car first, with the intra-team qualifying gap.
 * Derived from the same rows so it stays consistent with the knockout table.
 */
export function teammatePairs(report: QualifyingReport): TeammatePair[] {
  const byTeam = new Map<string, QualiRow[]>()
  for (const r of report.rows) {
    const arr = byTeam.get(r.teamName) ?? []
    arr.push(r)
    byTeam.set(r.teamName, arr)
  }

  const pairs: TeammatePair[] = []
  for (const [teamName, members] of byTeam) {
    if (members.length < 2) continue
    // Fastest two cars of the team (best lap first; lap-less cars sink).
    const sorted = members.slice().sort((a, b) => {
      if (a.bestLap == null) return b.bestLap == null ? 0 : 1
      if (b.bestLap == null) return -1
      return a.bestLap - b.bestLap
    })
    const [a, b] = sorted
    const delta = a.bestLap != null && b.bestLap != null ? b.bestLap - a.bestLap : null
    pairs.push({
      teamName,
      colour: a.colour,
      faster: { acronym: a.acronym, bestLap: a.bestLap },
      slower: { acronym: b.acronym, bestLap: b.bestLap },
      delta,
    })
  }

  // Closest battles first; teams with an incomplete pair sink to the bottom.
  pairs.sort((a, b) => {
    if (a.delta == null) return b.delta == null ? 0 : 1
    if (b.delta == null) return -1
    return a.delta - b.delta
  })
  return pairs
}
