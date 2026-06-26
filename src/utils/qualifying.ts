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

import type { DriverState, StintRow } from '../api/types'
import { buildTimesheet, type SectorBests, type TimesheetRow } from './practice'

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
  theoreticalBest: number | null
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

export function buildQualifying(drivers: DriverState[], stints: StintRow[]): QualifyingReport {
  const sheet = buildTimesheet(drivers, stints)
  const teamByNumber = new Map(drivers.map((d) => [d.driverNumber, d.teamName]))

  const fieldSize = drivers.length
  const { q3Cut, q1Cut, eliminatedPerSegment } = deriveCuts(fieldSize)

  const timeAt = (pos: number): number | null =>
    sheet.rows.find((r) => r.position === pos)?.bestLap ?? null
  const cut10 = timeAt(q3Cut) // slowest lap still into the pole shootout
  const cut10Next = timeAt(q3Cut + 1) // fastest lap currently outside the top 10
  const cutQ1 = timeAt(q1Cut) // slowest lap still safe from the Q1 cut

  const bubble = new Set([q3Cut, q3Cut + 1, q1Cut, q1Cut + 1])

  // Fastest teammate lap per driver, for the head-to-head.
  const bestLapByDriver = new Map(sheet.rows.map((r) => [r.driverNumber, r.bestLap]))

  const rows: QualiRow[] = sheet.rows.map((r) => {
    const teamName = teamByNumber.get(r.driverNumber) ?? ''
    const zone: Zone = r.position <= q3Cut ? 'pole' : r.position <= q1Cut ? 'q2' : 'out'

    let toLine: number | null = null
    if (r.bestLap != null) {
      if (zone === 'out') {
        toLine = cutQ1 != null ? r.bestLap - cutQ1 : null // deficit to safety (positive)
      } else if (zone === 'q2') {
        toLine = cut10 != null ? r.bestLap - cut10 : null // deficit to the top 10 (positive)
      } else {
        // In the shootout: cushion to the first car out (negative ⇒ safe by |x|).
        toLine = cut10Next != null ? r.bestLap - cut10Next : null
      }
    }

    // Fastest teammate (a team can momentarily field >2 cars across a weekend).
    let teammateBest: number | null = null
    for (const [num, team] of teamByNumber) {
      if (num === r.driverNumber || team !== teamName) continue
      const bl = bestLapByDriver.get(num) ?? null
      if (bl != null && (teammateBest == null || bl < teammateBest)) teammateBest = bl
    }
    const teammateDelta = r.bestLap != null && teammateBest != null ? r.bestLap - teammateBest : null

    return {
      ...r,
      teamName,
      zone,
      toLine,
      onBubble: bubble.has(r.position) && r.bestLap != null,
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
    pole,
    fieldSize,
    q3Cut,
    q1Cut,
    eliminatedPerSegment,
  }
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
