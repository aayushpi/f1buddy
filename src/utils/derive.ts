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

  const laps = raw.laps.filter((l) => {
    const v = lapT(l)
    return Number.isFinite(v) && v <= cutoffMs
  })
  let currentLap = 1
  for (const l of laps) if (l.lap_number > currentLap) currentLap = l.lap_number

  const stints = raw.stints.filter((s) => s.lap_start <= currentLap)
  const finished = cutoffMs >= raceEndMs - 500

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
  let status: TrackStatus = 'UNKNOWN'
  let lastMessage: string | null = null
  let finished = false

  for (const m of sorted) {
    lastMessage = m.message ?? lastMessage
    const msg = (m.message ?? '').toUpperCase()

    if (m.category === 'SafetyCar') {
      if (msg.includes('VIRTUAL')) status = msg.includes('ENDING') ? 'GREEN' : 'VSC'
      else if (msg.includes('SAFETY CAR'))
        status = msg.includes('IN THIS LAP') || msg.includes('ENDING') ? 'GREEN' : 'SC'
      continue
    }
    if (m.category === 'Flag' && (m.scope === 'Track' || !m.scope)) {
      switch ((m.flag ?? '').toUpperCase()) {
        case 'GREEN':
        case 'CLEAR':
          status = 'GREEN'
          break
        case 'YELLOW':
          if (status === 'GREEN' || status === 'UNKNOWN') status = 'YELLOW'
          break
        case 'DOUBLE YELLOW':
          status = 'DOUBLE_YELLOW'
          break
        case 'RED':
          status = 'RED'
          break
        case 'CHEQUERED':
          status = 'CHEQUERED'
          finished = true
          break
      }
    }
  }
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
      .map((l) => ({
        lap: l.lap_number,
        time: l.lap_duration,
        s1: l.duration_sector_1,
        s2: l.duration_sector_2,
        s3: l.duration_sector_3,
        pitOut: l.is_pit_out_lap,
      }))
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
      teamColour: d.team_colour,
      position,
      isLeader: position === 1,
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
    weatherHistory,
  }
}
