import type {
  ApiCarData,
  ApiDriver,
  ApiInterval,
  ApiLap,
  ApiLocation,
  ApiMeeting,
  ApiOvertake,
  ApiPit,
  ApiPosition,
  ApiRaceControl,
  ApiSession,
  ApiSessionResult,
  ApiStartingGrid,
  ApiStint,
  ApiTeamRadio,
  ApiWeather,
  DriverState,
  DrsState,
  GridRow,
  OvertakeEvent,
  PitEvent,
  QualifyingClassification,
  RaceControlEntry,
  RaceSnapshot,
  RaceState,
  RadioClip,
  ResultRow,
  SectorPerf,
  SectorState,
  StintRow,
  TelemetryTrace,
  TrackMapCar,
  TrackStatus,
  WeatherPoint,
} from '../api/types'
import { teamColourFor } from '../data/teamColors'

export interface RawData {
  session: ApiSession | null
  meeting: ApiMeeting | null
  drivers: ApiDriver[]
  intervals: ApiInterval[]
  positions: ApiPosition[]
  laps: ApiLap[]
  stints: ApiStint[]
  pits: ApiPit[]
  raceControl: ApiRaceControl[]
  weather: ApiWeather[]
  carData: ApiCarData[]
  location: ApiLocation[]
  teamRadio: ApiTeamRadio[]
  overtakes: ApiOvertake[]
  startingGrid: ApiStartingGrid[]
  results: ApiSessionResult[]
  // Official qualifying classification, revealed only once the replay clock has
  // reached the end of the session (so the grid plays out provisionally before
  // snapping to the final order). Derived in filterRawByTime; empty otherwise.
  qualifyingResults: ApiSessionResult[]
}

export const TELEMETRY_TRACE_LEN = 70

const t = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN)

// Cached epoch on each record so the replay hot-path avoids re-parsing dates.
type Timed = { __t?: number }
const recT = (r: { date: string } & Timed) => (r.__t ??= Date.parse(r.date))
const lapT = (l: { date_start: string | null } & Timed) =>
  (l.__t ??= l.date_start ? Date.parse(l.date_start) : NaN)

/** Parse and cache timestamps once after a bulk load (and after telemetry refetches). */
export function indexRawTimes(raw: RawData): void {
  const idx = (arr: ({ date: string } & Timed)[]) => {
    for (const r of arr) r.__t = Date.parse(r.date)
  }
  idx(raw.intervals); idx(raw.positions); idx(raw.pits); idx(raw.raceControl)
  idx(raw.weather); idx(raw.carData); idx(raw.location); idx(raw.teamRadio); idx(raw.overtakes)
  for (const l of raw.laps as ({ date_start: string | null } & Timed)[]) {
    l.__t = l.date_start ? Date.parse(l.date_start) : NaN
  }
}

// A qualifying knockout segment (Q1/Q2/Q3) as a running time window. The gaps
// *between* windows are the inter-segment breaks the scrubber shades.
export interface QualiSegment {
  seg: 1 | 2 | 3
  start: number
  end: number
}

/**
 * Locate the Q1/Q2/Q3 windows for a qualifying session (OpenF1 carries no
 * segment field). Pure lap-gap detection is fooled by red flags and mid-segment
 * pit cycles, so instead we anchor on the official result: each driver's
 * session_result duration is their [Q1, Q2, Q3] best-lap times. We match each
 * back to the lap that set it — in time order per driver, since a car's segments
 * happen Q1→Q2→Q3, which stops a coincidentally equal lap time elsewhere from
 * stealing the match — then take each segment's window as the span of those
 * classified laps. Returns null until the result is known or if the windows
 * don't come out cleanly ordered (degenerate data).
 */
export function buildQualifyingSegments(raw: RawData): QualiSegment[] | null {
  if (!raw.results.length || raw.laps.length < 12) return null

  // Each driver's timed laps, ascending by start, with the lap time to match on.
  const byDriver = new Map<number, { start: number; dur: number }[]>()
  for (const l of raw.laps) {
    const start = lapT(l)
    if (!Number.isFinite(start) || l.lap_duration == null || l.lap_duration <= 0) continue
    const arr = byDriver.get(l.driver_number) ?? []
    arr.push({ start, dur: l.lap_duration })
    byDriver.set(l.driver_number, arr)
  }
  for (const arr of byDriver.values()) arr.sort((a, b) => a.start - b.start)

  const segStarts: [number[], number[], number[]] = [[], [], []]
  for (const r of raw.results) {
    const dur = Array.isArray(r.duration) ? r.duration : []
    const laps = byDriver.get(r.driver_number) ?? []
    let after = -Infinity
    for (let si = 0; si < 3; si++) {
      const t = dur[si]
      if (t == null) continue
      const m = laps.find((l) => l.start > after && Math.abs(l.dur - t) < 0.01)
      if (m) {
        segStarts[si].push(m.start)
        after = m.start
      }
    }
  }
  if (segStarts.some((s) => s.length === 0)) return null

  const win = (i: 0 | 1 | 2) => ({ start: Math.min(...segStarts[i]), end: Math.max(...segStarts[i]) })
  const q1 = win(0)
  const q2 = win(1)
  const q3 = win(2)
  if (!(q1.end <= q2.start && q2.end <= q3.start)) return null

  return [
    { seg: 1, start: q1.start, end: q1.end },
    { seg: 2, start: q2.start, end: q2.end },
    { seg: 3, start: q3.start, end: q3.end },
  ]
}

// Density of lap activity across the timeline, as `bins` values in 0..1 (peak =
// 1). Drives the scrubber's "clustermap" — for practice it shows the run pattern,
// for qualifying the three knockout clusters fall out for free — without ever
// surfacing a lap number. Only laps up to `tCut` are counted so a simulated-live
// replay can't reveal activity past the watchable edge.
export function buildLapActivity(raw: RawData, tMin: number, tMax: number, tCut: number, bins = 120): number[] {
  const span = tMax - tMin
  if (!(span > 0)) return []
  const counts = new Array<number>(bins).fill(0)
  for (const l of raw.laps) {
    const s = lapT(l)
    if (!Number.isFinite(s) || s > tCut) continue
    const idx = Math.min(bins - 1, Math.max(0, Math.floor(((s - tMin) / span) * bins)))
    counts[idx]++
  }
  const max = Math.max(1, ...counts)
  return counts.map((c) => c / max)
}

/** Lap-start times (leader's crossing) for the replay scrubber markers. */
export function buildLapMarkers(raw: RawData): { lap: number; t: number }[] {
  const m = new Map<number, number>()
  for (const l of raw.laps) {
    const v = lapT(l)
    if (Number.isFinite(v)) {
      const cur = m.get(l.lap_number)
      if (cur == null || v < cur) m.set(l.lap_number, v)
    }
  }
  return [...m.entries()].map(([lap, ts]) => ({ lap, t: ts })).sort((a, b) => a.lap - b.lap)
}

/**
 * Replay window. Anchored to the *racing* feeds (laps, intervals, positions),
 * NOT weather/race-control — those start well before lights-out and would
 * otherwise put the clock in a long pre-race dead zone with an empty tower.
 */
export function rawTimeBounds(raw: RawData): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  const consider = (v: number) => {
    if (Number.isFinite(v)) {
      if (v < min) min = v
      if (v > max) max = v
    }
  }
  for (const r of raw.intervals) consider(recT(r))
  for (const r of raw.positions) consider(recT(r))
  for (const l of raw.laps) consider(lapT(l))

  if (!Number.isFinite(min)) {
    for (const r of raw.raceControl) consider(recT(r))
    for (const r of raw.weather) consider(recT(r))
  }
  if (!Number.isFinite(min)) {
    const s = t(raw.session?.date_start)
    const e = t(raw.session?.date_end)
    return { min: Number.isFinite(s) ? s : 0, max: Number.isFinite(e) ? e : 1 }
  }
  return { min, max }
}

/**
 * Return a copy of the raw data as it would have appeared at `cutoffMs` — the
 * core of replay. Date-bearing records are kept up to the cutoff; tyre stints
 * are limited to those already started; final results only appear once the
 * race has actually ended.
 */
export function filterRawByTime(raw: RawData, cutoffMs: number, raceEndMs: number): RawData {
  const dateLte = <T extends { date: string } & Timed>(arr: T[]) =>
    arr.filter((r) => recT(r) <= cutoffMs)

  // Reveal a lap's record as soon as it starts (so the current-lap counter is
  // right), but only expose each sector / lap time once the clock has actually
  // passed that crossing. Otherwise a completed lap's times — and the
  // fastest-sector / fastest-lap alerts they trigger — would appear the instant
  // the lap began (i.e. spoilers at the start of every lap).
  const laps = raw.laps
    .filter((l) => {
      const v = lapT(l)
      return Number.isFinite(v) && v <= cutoffMs
    })
    .map((l) => {
      const start = lapT(l)
      const s1 = l.duration_sector_1
      const s2 = l.duration_sector_2
      const dur = l.lap_duration
      const cross1 = s1 != null ? start + s1 * 1000 : null
      const cross2 = s1 != null && s2 != null ? start + (s1 + s2) * 1000 : null
      const crossEnd = dur != null && dur > 0 ? start + dur * 1000 : null
      const show1 = cross1 == null || cross1 <= cutoffMs
      const show2 = cross2 == null || cross2 <= cutoffMs
      const showEnd = crossEnd == null || crossEnd <= cutoffMs
      if (show1 && show2 && showEnd) return l // fully run; nothing to hide
      return {
        ...l,
        duration_sector_1: show1 ? l.duration_sector_1 : null,
        duration_sector_2: show2 ? l.duration_sector_2 : null,
        duration_sector_3: showEnd ? l.duration_sector_3 : null,
        lap_duration: showEnd ? l.lap_duration : null,
      }
    })
  let currentLap = 1
  for (const l of laps) if (l.lap_number > currentLap) currentLap = l.lap_number

  const stints = raw.stints.filter((s) => s.lap_start <= currentLap)
  const finished = cutoffMs >= raceEndMs - 500

  // The qualifying classification only appears once the replay clock reaches the
  // end of the session — until then the grid builds up provisionally, lap by
  // lap, the same way it did live. (It rides its own field rather than `results`
  // because it carries the Q1/Q2/Q3 segment times, and so it can't flip the
  // session to "finished" early via `race.finished`.)
  const isQualifying = (raw.session?.session_type ?? '').toLowerCase().includes('qual')

  return {
    session: raw.session,
    meeting: raw.meeting,
    drivers: raw.drivers,
    startingGrid: raw.startingGrid,
    intervals: dateLte(raw.intervals),
    positions: dateLte(raw.positions),
    laps,
    stints,
    pits: dateLte(raw.pits),
    raceControl: dateLte(raw.raceControl),
    weather: dateLte(raw.weather),
    carData: dateLte(raw.carData),
    location: dateLte(raw.location),
    teamRadio: dateLte(raw.teamRadio),
    overtakes: dateLte(raw.overtakes),
    results: finished ? raw.results : [],
    qualifyingResults: isQualifying && finished ? raw.results : [],
  }
}

const EPS = 0.0005

function byDriver<T extends { driver_number: number }>(records: T[]): Map<number, T[]> {
  const m = new Map<number, T[]>()
  for (const r of records) {
    const arr = m.get(r.driver_number)
    if (arr) arr.push(r)
    else m.set(r.driver_number, [r])
  }
  return m
}

function latestByDate<T extends { date: string }>(records: T[]): T | null {
  let best: T | null = null
  for (const r of records) if (!best || r.date > best.date) best = r
  return best
}

function numericGap(v: number | string | null): number | null {
  return typeof v === 'number' ? v : null
}

export function decodeDrs(code: number | null | undefined): DrsState {
  if (code == null) return 'off'
  if (code >= 10) return 'on'
  if (code === 8) return 'eligible'
  return 'off'
}

function deriveStatus(rc: ApiRaceControl[]): {
  status: TrackStatus
  lastMessage: string | null
  finished: boolean
} {
  const sorted = [...rc].sort((a, b) => (a.date < b.date ? -1 : 1))
  let lastMessage: string | null = null
  let finished = false

  // Reconstruct the track state by folding the (clock-filtered) log into a small
  // state machine, then collapse to one status by severity at the end. The old
  // flat fold only looked at Track-scoped flags, so per-sector yellows — which is
  // how nearly all yellow/double-yellow flags actually arrive — never showed.
  let sc: 'none' | 'VSC' | 'SC' = 'none'
  let red = false
  let chequered = false
  let trackYellow: 'none' | 'YELLOW' | 'DOUBLE_YELLOW' = 'none'
  const sectorFlags = new Map<number, 'YELLOW' | 'DOUBLE_YELLOW'>()
  let seen = false // any recognised status event — else we stay UNKNOWN

  for (const m of sorted) {
    lastMessage = m.message ?? lastMessage
    const msg = (m.message ?? '').toUpperCase()
    const flag = (m.flag ?? '').toUpperCase()

    if (m.category === 'SafetyCar') {
      if (msg.includes('VIRTUAL')) {
        sc = msg.includes('ENDING') ? 'none' : 'VSC'
        seen = true
      } else if (msg.includes('SAFETY CAR')) {
        // "DEPLOYED" raises it; "IN THIS LAP" / "ENDING" stands it down.
        sc = msg.includes('IN THIS LAP') || msg.includes('ENDING') ? 'none' : 'SC'
        seen = true
      }
      continue
    }
    if (m.category !== 'Flag') continue

    const sector = m.sector
    switch (flag) {
      case 'YELLOW':
      case 'DOUBLE YELLOW': {
        const level = flag === 'DOUBLE YELLOW' ? 'DOUBLE_YELLOW' : 'YELLOW'
        if (m.scope === 'Sector' && sector != null) sectorFlags.set(sector, level)
        else trackYellow = level
        seen = true
        break
      }
      case 'GREEN':
      case 'CLEAR':
        if (m.scope === 'Sector' && sector != null) {
          sectorFlags.delete(sector)
        } else {
          // Track-wide green: racing resumes — everything clears.
          sectorFlags.clear()
          trackYellow = 'none'
          red = false
        }
        seen = true
        break
      case 'RED':
        red = true
        seen = true
        break
      case 'CHEQUERED':
        chequered = true
        finished = true
        seen = true
        break
    }
  }

  const anyDoubleYellow = trackYellow === 'DOUBLE_YELLOW' || [...sectorFlags.values()].includes('DOUBLE_YELLOW')
  const anyYellow = trackYellow !== 'none' || sectorFlags.size > 0

  // Most severe wins. Chequered only shows once the track is otherwise clear.
  let status: TrackStatus
  if (!seen) status = 'UNKNOWN'
  else if (red) status = 'RED'
  else if (sc === 'SC') status = 'SC'
  else if (sc === 'VSC') status = 'VSC'
  else if (anyDoubleYellow) status = 'DOUBLE_YELLOW'
  else if (anyYellow) status = 'YELLOW'
  else if (chequered) status = 'CHEQUERED'
  else status = 'GREEN'

  return { status, lastMessage, finished }
}

function classifySector(
  time: number | null,
  driverBest: number | null,
  overallBest: number | null,
): SectorPerf {
  if (time == null) return null
  if (overallBest != null && time <= overallBest + EPS) return 'fastest'
  if (driverBest != null && time <= driverBest + EPS) return 'personal'
  return 'normal'
}

export function buildSnapshot(raw: RawData, lapWindow: number): RaceSnapshot {
  const lapsByDriver = byDriver(raw.laps)
  const intervalsByDriver = byDriver(raw.intervals)
  const positionsByDriver = byDriver(raw.positions)
  const stintsByDriver = byDriver(raw.stints)
  const pitsByDriver = byDriver(raw.pits)
  const carByDriver = byDriver(raw.carData)
  const locByDriver = byDriver(raw.location)

  const gridByDriver = new Map<number, ApiStartingGrid>()
  for (const g of raw.startingGrid) gridByDriver.set(g.driver_number, g)
  const resultByDriver = new Map<number, ApiSessionResult>()
  for (const r of raw.results) resultByDriver.set(r.driver_number, r)

  // Overall fastest per sector + fastest lap.
  const overallSector: [number | null, number | null, number | null] = [null, null, null]
  let fastestLap: RaceSnapshot['fastestLap'] = null
  for (const lap of raw.laps) {
    ;[lap.duration_sector_1, lap.duration_sector_2, lap.duration_sector_3].forEach((s, i) => {
      if (s != null && (overallSector[i] == null || s < overallSector[i]!)) overallSector[i] = s
    })
    if (lap.lap_duration != null && (!fastestLap || lap.lap_duration < fastestLap.time))
      fastestLap = { driverNumber: lap.driver_number, acronym: '', time: lap.lap_duration }
  }

  let currentLap: number | null = null
  for (const lap of raw.laps) if (lap.lap_number != null) currentLap = Math.max(currentLap ?? 0, lap.lap_number)
  for (const m of raw.raceControl)
    if (m.lap_number != null) currentLap = Math.max(currentLap ?? 0, m.lap_number)

  const drivers: DriverState[] = raw.drivers.map((d) => {
    const dn = d.driver_number
    const allLaps = lapsByDriver.get(dn) ?? []
    const laps = allLaps
      .filter((l) => l.lap_duration != null && l.lap_duration! > 0 && !l.is_pit_out_lap)
      .sort((a, b) => a.lap_number - b.lap_number)

    const driverBest: [number | null, number | null, number | null] = [null, null, null]
    let bestLap: number | null = null
    for (const l of allLaps) {
      ;[l.duration_sector_1, l.duration_sector_2, l.duration_sector_3].forEach((s, i) => {
        if (s != null && (driverBest[i] == null || s < driverBest[i]!)) driverBest[i] = s
      })
      if (l.lap_duration != null && l.lap_duration > 0 && (bestLap == null || l.lap_duration < bestLap))
        bestLap = l.lap_duration
    }

    const latestLapRecord = allLaps.slice().sort((a, b) => a.lap_number - b.lap_number).at(-1)
    const lastLap = laps.at(-1)?.lap_duration ?? null

    const sectors = [0, 1, 2].map((i) => {
      const t =
        i === 0
          ? (latestLapRecord?.duration_sector_1 ?? null)
          : i === 1
            ? (latestLapRecord?.duration_sector_2 ?? null)
            : (latestLapRecord?.duration_sector_3 ?? null)
      return { time: t, perf: classifySector(t, driverBest[i], overallSector[i]) }
    }) as [SectorState, SectorState, SectorState]

    const lapTimes = laps.slice(-lapWindow).map((l) => ({ lap: l.lap_number, time: l.lap_duration! }))
    const lapHistory = allLaps
      .slice()
      .sort((a, b) => a.lap_number - b.lap_number)
      .map((l) => {
        const d = lapT(l)
        return {
          lap: l.lap_number,
          time: l.lap_duration,
          s1: l.duration_sector_1,
          s2: l.duration_sector_2,
          s3: l.duration_sector_3,
          pitOut: l.is_pit_out_lap,
          date: Number.isFinite(d) ? d : null,
        }
      })
    const avgLapTime = lapTimes.length
      ? lapTimes.reduce((acc, p) => acc + p.time, 0) / lapTimes.length
      : null

    const stints = (stintsByDriver.get(dn) ?? []).sort((a, b) => a.stint_number - b.stint_number)
    const stint = stints.at(-1) ?? null
    let tyreAge: number | null = null
    let stintLaps: number | null = null
    if (stint && currentLap != null) {
      const lapsInStint = Math.max(0, currentLap - stint.lap_start + 1)
      stintLaps = lapsInStint
      tyreAge = (stint.tyre_age_at_start ?? 0) + Math.max(0, lapsInStint - 1)
    } else if (stint) {
      stintLaps = Math.max(0, (stint.lap_end ?? stint.lap_start) - stint.lap_start + 1)
      tyreAge = (stint.tyre_age_at_start ?? 0) + Math.max(0, stintLaps - 1)
    }

    const interval = latestByDate(intervalsByDriver.get(dn) ?? [])
    const position = latestByDate(positionsByDriver.get(dn) ?? [])?.position ?? null

    const pits = (pitsByDriver.get(dn) ?? []).slice().sort((a, b) => (a.date < b.date ? -1 : 1))
    const lastPit = pits.at(-1) ?? null
    const inPit =
      !!lastPit && !!latestLapRecord?.date_start && lastPit.date > latestLapRecord.date_start

    const car = latestByDate(carByDriver.get(dn) ?? [])
    const loc = latestByDate(locByDriver.get(dn) ?? [])
    const grid = gridByDriver.get(dn)
    const result = resultByDriver.get(dn)

    return {
      driverNumber: dn,
      acronym: d.name_acronym,
      fullName: d.full_name,
      teamName: d.team_name,
      teamColour: teamColourFor(d.team_name, d.team_colour),
      position,
      isLeader: false, // assigned post-sort so exactly one car ever leads
      gapToLeader: interval?.gap_to_leader ?? null,
      interval: interval?.interval ?? null,
      lastLap,
      bestLap,
      sectors,
      compound: stint?.compound ?? null,
      tyreAge,
      stintLaps,
      inPit,
      lapTimes,
      lapHistory,
      avgLapTime,
      speedTrap: latestLapRecord?.st_speed ?? null,
      drs: decodeDrs(car?.drs),
      gridPosition: grid?.position ?? null,
      positionsGained: grid && position != null ? grid.position - position : null,
      pitStops: pits.length,
      lastPitDuration: lastPit?.pit_duration ?? null,
      car: car
        ? {
            speed: car.speed,
            rpm: car.rpm,
            gear: car.n_gear,
            throttle: car.throttle,
            brake: car.brake,
            drs: decodeDrs(car.drs),
          }
        : null,
      location: loc ? { x: loc.x, y: loc.y } : null,
      retired: !!result?.dnf || !!result?.dns || !!result?.dsq,
    } satisfies DriverState
  })

  if (fastestLap) {
    const owner = drivers.find((d) => d.driverNumber === fastestLap!.driverNumber)
    if (owner) fastestLap.acronym = owner.acronym
  }

  drivers.sort((a, b) => {
    const pa = a.position ?? Number.POSITIVE_INFINITY
    const pb = b.position ?? Number.POSITIVE_INFINITY
    if (pa !== pb) return pa - pb
    return (numericGap(a.gapToLeader) ?? 0) - (numericGap(b.gapToLeader) ?? 0)
  })

  // Exactly one leader: the car sorted to the front that actually holds a
  // position. Deriving it here (rather than position===1 per driver) prevents a
  // stale or duplicate LEADER tag when the position feed briefly lags behind a
  // pit stop or an overtake.
  drivers.forEach((d, i) => {
    d.isLeader = i === 0 && d.position != null
  })

  const acrOf = new Map<number, string>()
  const colOf = new Map<number, string>()
  for (const d of drivers) {
    acrOf.set(d.driverNumber, d.acronym)
    colOf.set(d.driverNumber, d.teamColour)
  }

  // ---- Telemetry traces (oldest -> newest) ----
  const telemetry: TelemetryTrace[] = drivers
    .map((d) => {
      const samples = (carByDriver.get(d.driverNumber) ?? [])
        .slice()
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(-TELEMETRY_TRACE_LEN)
      if (!samples.length) return null
      return {
        driverNumber: d.driverNumber,
        acronym: d.acronym,
        colour: d.teamColour,
        speed: samples.map((s) => s.speed),
        throttle: samples.map((s) => s.throttle),
        brake: samples.map((s) => s.brake),
        gear: samples.map((s) => s.n_gear),
        rpm: samples.map((s) => s.rpm),
      } satisfies TelemetryTrace
    })
    .filter((t): t is TelemetryTrace => t !== null)

  // ---- Track map ----
  const trackMap: TrackMapCar[] = drivers
    .filter((d) => d.location)
    .map((d) => ({
      driverNumber: d.driverNumber,
      acronym: d.acronym,
      colour: d.teamColour,
      position: d.position,
      x: d.location!.x,
      y: d.location!.y,
      drs: d.drs,
      inPit: d.inPit,
    }))

  // ---- Stint timeline ----
  const stintsRows: StintRow[] = drivers.map((d) => {
    const segs = (stintsByDriver.get(d.driverNumber) ?? [])
      .slice()
      .sort((a, b) => a.stint_number - b.stint_number)
      .map((s) => {
        const end = Math.max(s.lap_start, Math.min(s.lap_end || s.lap_start, currentLap ?? s.lap_end))
        return {
          compound: s.compound,
          lapStart: s.lap_start,
          lapEnd: end,
          laps: Math.max(1, end - s.lap_start + 1),
          ageAtStart: s.tyre_age_at_start ?? 0,
        }
      })
    return {
      driverNumber: d.driverNumber,
      acronym: d.acronym,
      colour: d.teamColour,
      position: d.position,
      segments: segs,
    }
  })

  // ---- Pit log ----
  const pitLog: PitEvent[] = raw.pits
    .map((p) => ({
      driverNumber: p.driver_number,
      acronym: acrOf.get(p.driver_number) ?? String(p.driver_number),
      colour: colOf.get(p.driver_number) ?? '',
      lap: p.lap_number,
      duration: p.pit_duration ?? null,
      date: p.date,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  // ---- Overtakes ----
  const overtakes: OvertakeEvent[] = raw.overtakes
    .map((o) => ({
      date: o.date,
      lap: null,
      byNumber: o.overtaking_driver_number,
      byAcronym: acrOf.get(o.overtaking_driver_number) ?? String(o.overtaking_driver_number),
      byColour: colOf.get(o.overtaking_driver_number) ?? '',
      onNumber: o.overtaken_driver_number,
      onAcronym: acrOf.get(o.overtaken_driver_number) ?? String(o.overtaken_driver_number),
      position: o.position,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  // ---- Team radio ----
  const radios: RadioClip[] = raw.teamRadio
    .map((r) => ({
      date: r.date,
      driverNumber: r.driver_number,
      acronym: acrOf.get(r.driver_number) ?? String(r.driver_number),
      colour: colOf.get(r.driver_number) ?? '',
      url: r.recording_url,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  // ---- Race-control log ----
  const raceControlLog: RaceControlEntry[] = raw.raceControl
    .map((m) => ({
      date: m.date,
      lap: m.lap_number,
      category: m.category,
      flag: m.flag,
      message: m.message,
      driverNumber: m.driver_number,
      acronym: m.driver_number != null ? (acrOf.get(m.driver_number) ?? null) : null,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1))

  // ---- Grid vs current ----
  const grid: GridRow[] = raw.startingGrid
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((g) => {
      const cur = drivers.find((d) => d.driverNumber === g.driver_number)?.position ?? null
      return {
        driverNumber: g.driver_number,
        acronym: acrOf.get(g.driver_number) ?? String(g.driver_number),
        colour: colOf.get(g.driver_number) ?? '',
        gridPosition: g.position,
        currentPosition: cur,
        delta: cur != null ? g.position - cur : null,
        qualifyingTime: g.lap_duration ?? null,
      }
    })

  // ---- Results ----
  const results: ResultRow[] = raw.results
    .slice()
    .sort((a, b) => (a.position ?? 99) - (b.position ?? 99))
    .map((r) => ({
      position: r.position,
      driverNumber: r.driver_number,
      acronym: acrOf.get(r.driver_number) ?? String(r.driver_number),
      colour: colOf.get(r.driver_number) ?? '',
      laps: r.number_of_laps,
      gapToLeader: r.gap_to_leader ?? null,
      status: r.dsq ? 'DSQ' : r.dns ? 'DNS' : r.dnf ? 'DNF' : 'FIN',
    }))

  // ---- Qualifying classification (official, ungated) ----
  // session_result.duration is the [Q1, Q2, Q3] best-lap array for a qualifying
  // session. Carry it verbatim so the view can show the real grid; a single
  // number (non-qualifying) collapses to a Q1-only entry and simply goes unused.
  const qualifyingResult: QualifyingClassification[] | null = raw.qualifyingResults.length
    ? raw.qualifyingResults.map((r) => {
        const dur = Array.isArray(r.duration) ? r.duration : r.duration != null ? [r.duration] : []
        return {
          driverNumber: r.driver_number,
          position: r.position,
          segments: [dur[0] ?? null, dur[1] ?? null, dur[2] ?? null],
        } satisfies QualifyingClassification
      })
    : null

  // ---- Weather history ----
  const weatherHistory: WeatherPoint[] = raw.weather
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((w) => ({
      date: w.date,
      airTemp: w.air_temperature,
      trackTemp: w.track_temperature,
      humidity: w.humidity,
      pressure: null,
      windSpeed: w.wind_speed,
      windDirection: null,
      rainfall: w.rainfall,
    }))

  const { status, lastMessage, finished } = deriveStatus(raw.raceControl)
  const weather = latestByDate(raw.weather)

  const race: RaceState = {
    sessionName: raw.session?.session_name ?? '—',
    sessionType: raw.session?.session_type ?? '',
    circuit: raw.session?.circuit_short_name ?? raw.session?.location ?? '—',
    countryName: raw.session?.country_name ?? '',
    meetingName: raw.meeting?.meeting_name ?? raw.session?.location ?? '',
    year: raw.session?.year ?? null,
    sessionStart: Number.isFinite(t(raw.session?.date_start)) ? t(raw.session?.date_start) : null,
    sessionEnd: Number.isFinite(t(raw.session?.date_end)) ? t(raw.session?.date_end) : null,
    status,
    currentLap,
    lastMessage,
    weather,
    finished: finished || results.length > 0,
  }

  return {
    race,
    drivers,
    fastestLap,
    telemetry,
    trackMap,
    stints: stintsRows,
    pitLog,
    overtakes,
    radios,
    raceControlLog,
    grid,
    results,
    qualifyingResult,
    weatherHistory,
  }
}
