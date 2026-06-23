import { useCallback, useEffect, useRef, useState } from 'react'
import type { RaceSnapshot } from '../api/types'
import { teamHex } from '../utils/format'

// Transient, auto-dismissing alerts surfaced as a stacked popover — the same
// idea as a race-control message flashing up and then clearing. The full record
// of everything always lives in the Race Control tab; these are just the
// "look now" moments: fastest laps/sectors, race-control bulletins and radios.

export type Notice =
  | { id: string; kind: 'control'; flag: string | null; message: string; acronym: string | null; colour: string | null }
  | { id: string; kind: 'fastlap'; acronym: string; colour: string; time: number }
  | { id: string; kind: 'fastsector'; sector: 1 | 2 | 3; acronym: string; colour: string; time: number }
  | { id: string; kind: 'radio'; acronym: string; colour: string; url: string }

const EPS = 0.0005
const MAX_VISIBLE = 4

interface Baselines {
  primed: boolean
  radioDate: string
  controlDate: string
  bestLap: number | null
  bestSector: [number | null, number | null, number | null]
}

const freshBaselines = (): Baselines => ({
  primed: false,
  radioDate: '',
  controlDate: '',
  bestLap: null,
  bestSector: [null, null, null],
})

/** Overall fastest time + owner for each sector, scanned from lap history. */
function overallSectors(drivers: RaceSnapshot['drivers']) {
  const best: [number | null, number | null, number | null] = [null, null, null]
  const owner: [string | null, string | null, string | null] = [null, null, null]
  const colour: [string | null, string | null, string | null] = [null, null, null]
  for (const d of drivers) {
    for (const l of d.lapHistory) {
      ;[l.s1, l.s2, l.s3].forEach((s, i) => {
        if (s != null && s > 0 && (best[i] == null || s < best[i]!)) {
          best[i] = s
          owner[i] = d.acronym
          colour[i] = d.teamColour
        }
      })
    }
  }
  return { best, owner, colour }
}

/**
 * Derive the live notice stack from each snapshot. `resetKey` (mode + session)
 * clears baselines so a new race doesn't replay stale alerts. The first snapshot
 * of a session only primes the baselines — it never fires a flood of notices.
 */
export function useRaceNotices(
  snapshot: RaceSnapshot | null,
  resetKey: string,
  // Drivers the user has opted into for race-control + radio popups. Empty ⇒ no
  // RC/radio notifications at all (they stay only in the Race Control tab).
  // Fastest-lap / fastest-sector alerts are unaffected.
  notifyDrivers: Set<number>,
) {
  const [notices, setNotices] = useState<Notice[]>([])
  const base = useRef<Baselines>(freshBaselines())
  const seq = useRef(0)
  const nextId = () => `n${seq.current++}`

  // Read the live subscription inside the snapshot-keyed effect without making
  // it a dependency (which would otherwise re-scan and could replay alerts).
  const notifyRef = useRef(notifyDrivers)
  notifyRef.current = notifyDrivers

  // New session: forget everything.
  useEffect(() => {
    base.current = freshBaselines()
    setNotices([])
  }, [resetKey])

  useEffect(() => {
    if (!snapshot) return
    const b = base.current
    const drivers = snapshot.drivers
    const sec = overallSectors(drivers)

    // Prime baselines silently on the first snapshot of a session.
    if (!b.primed) {
      b.primed = true
      b.radioDate = snapshot.radios[0]?.date ?? ''
      b.controlDate = snapshot.raceControlLog[0]?.date ?? ''
      b.bestLap = snapshot.fastestLap?.time ?? null
      b.bestSector = [...sec.best]
      return
    }

    const fresh: Notice[] = []

    // Race control — chronological, only entries newer than the last seen.
    const newControl = snapshot.raceControlLog
      .filter((e) => e.date > b.controlDate)
      .sort((a, x) => (a.date < x.date ? -1 : 1))
    for (const e of newControl) {
      // Only surface race-control bulletins tied to a driver the user follows.
      if (e.driverNumber == null || !notifyRef.current.has(e.driverNumber)) continue
      fresh.push({
        id: nextId(),
        kind: 'control',
        flag: e.flag,
        message: e.message,
        acronym: e.acronym,
        colour: null,
      })
    }
    if (snapshot.raceControlLog[0]) b.controlDate = snapshot.raceControlLog[0].date

    // Fastest lap overall.
    const fl = snapshot.fastestLap
    if (fl && (b.bestLap == null || fl.time < b.bestLap - EPS)) {
      b.bestLap = fl.time
      fresh.push({ id: nextId(), kind: 'fastlap', acronym: fl.acronym, colour: ownerColour(drivers, fl.driverNumber), time: fl.time })
    }

    // Fastest sector overall (per sector).
    ;([0, 1, 2] as const).forEach((i) => {
      const t = sec.best[i]
      if (t != null && (b.bestSector[i] == null || t < b.bestSector[i]! - EPS)) {
        b.bestSector[i] = t
        if (sec.owner[i]) {
          fresh.push({
            id: nextId(),
            kind: 'fastsector',
            sector: (i + 1) as 1 | 2 | 3,
            acronym: sec.owner[i]!,
            colour: teamHex(sec.colour[i] ?? ''),
            time: t,
          })
        }
      }
    })

    // Team radios — chronological, newest last so they read in order.
    const newRadios = snapshot.radios
      .filter((r) => r.date > b.radioDate)
      .sort((a, x) => (a.date < x.date ? -1 : 1))
    for (const r of newRadios) {
      // Only surface radios from a driver the user follows.
      if (!notifyRef.current.has(r.driverNumber)) continue
      fresh.push({ id: nextId(), kind: 'radio', acronym: r.acronym, colour: teamHex(r.colour), url: r.url })
    }
    if (snapshot.radios[0]) b.radioDate = snapshot.radios[0].date

    if (fresh.length) {
      setNotices((prev) => [...prev, ...fresh].slice(-MAX_VISIBLE))
    }
    // Detection is keyed off snapshot identity; baselines live in the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot])

  const dismiss = useCallback((id: string) => {
    setNotices((prev) => prev.filter((n) => n.id !== id))
  }, [])

  return { notices, dismiss }
}

function ownerColour(drivers: RaceSnapshot['drivers'], num: number): string {
  const d = drivers.find((x) => x.driverNumber === num)
  return teamHex(d?.teamColour ?? '')
}
