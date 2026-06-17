import type {
  ApiDriver,
  ApiInterval,
  ApiLap,
  ApiPit,
  ApiPosition,
  ApiRaceControl,
  ApiSession,
  ApiStint,
  ApiWeather,
  DriverState,
  RaceSnapshot,
  RaceState,
  SectorPerf,
  SectorState,
  TrackStatus,
} from '../api/types'

export interface RawData {
  session: ApiSession | null
  drivers: ApiDriver[]
  intervals: ApiInterval[]
  positions: ApiPosition[]
  laps: ApiLap[]
  stints: ApiStint[]
  pits: ApiPit[]
  raceControl: ApiRaceControl[]
  weather: ApiWeather[]
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

/** Latest record (by ISO date string) from a list. */
function latestByDate<T extends { date: string }>(records: T[]): T | null {
  let best: T | null = null
  for (const r of records) {
    if (!best || r.date > best.date) best = r
  }
  return best
}

function numericGap(v: number | string | null): number | null {
  if (typeof v === 'number') return v
  return null
}

/** Resolve the current track status from chronological race-control messages. */
function deriveStatus(rc: ApiRaceControl[]): { status: TrackStatus; lastMessage: string | null } {
  const sorted = [...rc].sort((a, b) => (a.date < b.date ? -1 : 1))
  let status: TrackStatus = 'UNKNOWN'
  let lastMessage: string | null = null

  for (const m of sorted) {
    lastMessage = m.message ?? lastMessage
    const msg = (m.message ?? '').toUpperCase()

    if (m.category === 'SafetyCar') {
      if (msg.includes('VIRTUAL')) {
        status = msg.includes('ENDING') ? 'GREEN' : 'VSC'
      } else if (msg.includes('SAFETY CAR')) {
        status = msg.includes('IN THIS LAP') || msg.includes('ENDING') ? 'GREEN' : 'SC'
      }
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
          break
      }
    }
  }
  return { status, lastMessage }
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

  // Overall session-fastest per sector and overall fastest lap.
  const overallSector: [number | null, number | null, number | null] = [null, null, null]
  let fastestLap: RaceSnapshot['fastestLap'] = null

  for (const lap of raw.laps) {
    const secs = [lap.duration_sector_1, lap.duration_sector_2, lap.duration_sector_3]
    secs.forEach((s, i) => {
      if (s != null && (overallSector[i] == null || s < overallSector[i]!)) overallSector[i] = s
    })
    if (lap.lap_duration != null && (!fastestLap || lap.lap_duration < fastestLap.time)) {
      fastestLap = { driverNumber: lap.driver_number, acronym: '', time: lap.lap_duration }
    }
  }

  // Current lap: maximum lap number seen anywhere.
  let currentLap: number | null = null
  for (const lap of raw.laps) {
    if (lap.lap_number != null) currentLap = Math.max(currentLap ?? 0, lap.lap_number)
  }
  for (const m of raw.raceControl) {
    if (m.lap_number != null) currentLap = Math.max(currentLap ?? 0, m.lap_number)
  }

  const drivers: DriverState[] = raw.drivers.map((d) => {
    const dn = d.driver_number
    const laps = (lapsByDriver.get(dn) ?? [])
      .filter((l) => l.lap_duration != null && l.lap_duration! > 0 && !l.is_pit_out_lap)
      .sort((a, b) => a.lap_number - b.lap_number)

    // Per-driver best per sector + best lap.
    const driverBest: [number | null, number | null, number | null] = [null, null, null]
    let bestLap: number | null = null
    for (const l of lapsByDriver.get(dn) ?? []) {
      ;[l.duration_sector_1, l.duration_sector_2, l.duration_sector_3].forEach((s, i) => {
        if (s != null && (driverBest[i] == null || s < driverBest[i]!)) driverBest[i] = s
      })
      if (l.lap_duration != null && l.lap_duration > 0 && (bestLap == null || l.lap_duration < bestLap))
        bestLap = l.lap_duration
    }

    const latestLapRecord = (lapsByDriver.get(dn) ?? [])
      .slice()
      .sort((a, b) => a.lap_number - b.lap_number)
      .at(-1)

    const lastLap = laps.at(-1)?.lap_duration ?? null

    const sectors: [SectorState, SectorState, SectorState] = [0, 1, 2].map((i) => {
      const t =
        i === 0
          ? latestLapRecord?.duration_sector_1 ?? null
          : i === 1
            ? latestLapRecord?.duration_sector_2 ?? null
            : latestLapRecord?.duration_sector_3 ?? null
      return { time: t, perf: classifySector(t, driverBest[i], overallSector[i]) }
    }) as [SectorState, SectorState, SectorState]

    // Lap time series (last N valid laps).
    const lapTimes = laps.slice(-lapWindow).map((l) => ({ lap: l.lap_number, time: l.lap_duration! }))
    const avgLapTime = lapTimes.length
      ? lapTimes.reduce((acc, p) => acc + p.time, 0) / lapTimes.length
      : null

    // Current stint / tyre.
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

    // Pit detection: most recent pit later than the latest lap start.
    const lastPit = latestByDate(pitsByDriver.get(dn) ?? [])
    const inPit =
      !!lastPit &&
      !!latestLapRecord?.date_start &&
      lastPit.date > latestLapRecord.date_start

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
      avgLapTime,
    } satisfies DriverState
  })

  // Resolve fastest-lap acronym now that drivers are known.
  if (fastestLap) {
    const owner = drivers.find((d) => d.driverNumber === fastestLap!.driverNumber)
    if (owner) fastestLap.acronym = owner.acronym
  }

  // Sort by track position; drivers without a position go to the back.
  drivers.sort((a, b) => {
    const pa = a.position ?? Number.POSITIVE_INFINITY
    const pb = b.position ?? Number.POSITIVE_INFINITY
    if (pa !== pb) return pa - pb
    return (numericGap(a.gapToLeader) ?? 0) - (numericGap(b.gapToLeader) ?? 0)
  })

  const { status, lastMessage } = deriveStatus(raw.raceControl)
  const weather = latestByDate(raw.weather)

  const race: RaceState = {
    sessionName: raw.session?.session_name ?? '—',
    sessionType: raw.session?.session_type ?? '',
    circuit: raw.session?.circuit_short_name ?? raw.session?.location ?? '—',
    countryName: raw.session?.country_name ?? '',
    year: raw.session?.year ?? null,
    status,
    currentLap,
    lastMessage,
    weather,
  }

  return { race, drivers, fastestLap }
}
