import type {
  ApiDriver,
  ApiInterval,
  ApiLap,
  ApiPosition,
  ApiRaceControl,
  ApiSession,
  ApiStint,
  ApiWeather,
} from '../api/types'
import type { RawData } from '../utils/derive'

// A self-contained race simulator. It produces OpenF1-shaped records so the
// exact same derivation pipeline used for live data renders the demo. Useful
// for offline development and for trying the UI when no session is live.

interface SimDriver {
  num: number
  acr: string
  name: string
  team: string
  colour: string
  pace: number // base lap time in seconds
  pitLap: number
  startCompound: string
  endCompound: string
  startAge: number
}

const FIELD: SimDriver[] = [
  { num: 1, acr: 'VER', name: 'Max Verstappen', team: 'Red Bull Racing', colour: '3671C6', pace: 91.6, pitLap: 18, startCompound: 'MEDIUM', endCompound: 'HARD', startAge: 0 },
  { num: 4, acr: 'NOR', name: 'Lando Norris', team: 'McLaren', colour: 'FF8000', pace: 91.7, pitLap: 20, startCompound: 'MEDIUM', endCompound: 'HARD', startAge: 0 },
  { num: 16, acr: 'LEC', name: 'Charles Leclerc', team: 'Ferrari', colour: 'E80020', pace: 91.85, pitLap: 17, startCompound: 'SOFT', endCompound: 'MEDIUM', startAge: 0 },
  { num: 81, acr: 'PIA', name: 'Oscar Piastri', team: 'McLaren', colour: 'FF8000', pace: 91.9, pitLap: 22, startCompound: 'MEDIUM', endCompound: 'HARD', startAge: 0 },
  { num: 63, acr: 'RUS', name: 'George Russell', team: 'Mercedes', colour: '27F4D2', pace: 92.0, pitLap: 19, startCompound: 'MEDIUM', endCompound: 'HARD', startAge: 0 },
  { num: 44, acr: 'HAM', name: 'Lewis Hamilton', team: 'Ferrari', colour: 'E80020', pace: 92.05, pitLap: 21, startCompound: 'SOFT', endCompound: 'HARD', startAge: 0 },
  { num: 55, acr: 'SAI', name: 'Carlos Sainz', team: 'Williams', colour: '64C4FF', pace: 92.2, pitLap: 16, startCompound: 'SOFT', endCompound: 'MEDIUM', startAge: 0 },
  { num: 12, acr: 'ANT', name: 'Andrea Kimi Antonelli', team: 'Mercedes', colour: '27F4D2', pace: 92.25, pitLap: 23, startCompound: 'MEDIUM', endCompound: 'HARD', startAge: 0 },
  { num: 14, acr: 'ALO', name: 'Fernando Alonso', team: 'Aston Martin', colour: '229971', pace: 92.4, pitLap: 18, startCompound: 'MEDIUM', endCompound: 'HARD', startAge: 0 },
  { num: 10, acr: 'GAS', name: 'Pierre Gasly', team: 'Alpine', colour: '0093CC', pace: 92.5, pitLap: 20, startCompound: 'SOFT', endCompound: 'MEDIUM', startAge: 0 },
]

const MAX_LAPS = 44
const SESSION_KEY = 9999
const MEETING_KEY = 9999

// Deterministic [0,1) hash so repeated renders of the same lap are stable.
function rand(seed: number): number {
  let t = (seed * 2654435761) % 4294967296
  t = (t ^ (t >>> 15)) >>> 0
  t = (t * 2246822519) % 4294967296
  return ((t ^ (t >>> 13)) >>> 0) / 4294967296
}

const T0 = Date.UTC(2026, 5, 7, 13, 0, 0) // arbitrary stable race start

function iso(lapStartOffsetSec: number): string {
  return new Date(T0 + lapStartOffsetSec * 1000).toISOString()
}

function compoundFor(d: SimDriver, lap: number): { compound: string; stintNumber: number; lapStart: number; startAge: number } {
  if (lap <= d.pitLap) return { compound: d.startCompound, stintNumber: 1, lapStart: 1, startAge: d.startAge }
  return { compound: d.endCompound, stintNumber: 2, lapStart: d.pitLap + 1, startAge: 1 }
}

function lapTime(d: SimDriver, lap: number): number {
  // Tyre degradation grows through a stint then resets after the stop.
  const stintLap = lap <= d.pitLap ? lap : lap - d.pitLap
  const deg = stintLap * 0.05
  const fuelEffect = -(lap * 0.03) // car gets lighter -> faster
  const noise = (rand(d.num * 1000 + lap) - 0.5) * 0.6
  const pitLoss = lap === d.pitLap ? 21.5 : 0
  const pitOut = lap === d.pitLap + 1 ? 1.2 : 0
  return d.pace + deg + fuelEffect + noise + pitLoss + pitOut
}

export class RaceSim {
  private startMs = Date.now()
  // Real seconds per simulated lap. ~4s keeps the demo lively.
  readonly secondsPerLap = 4

  reset() {
    this.startMs = Date.now()
  }

  /** Simulated lap currently in progress (1..MAX_LAPS), capped at the finish. */
  currentLap(): number {
    const elapsed = (Date.now() - this.startMs) / 1000
    return Math.min(MAX_LAPS, Math.floor(elapsed / this.secondsPerLap) + 1)
  }

  snapshot(): RawData {
    const nowLap = this.currentLap()
    const finished = nowLap >= MAX_LAPS

    const session: ApiSession = {
      session_key: SESSION_KEY,
      session_name: 'Race',
      session_type: 'Race',
      meeting_key: MEETING_KEY,
      location: 'Spielberg',
      country_name: 'Austria',
      circuit_short_name: 'Red Bull Ring',
      date_start: iso(0),
      date_end: iso(MAX_LAPS * 92),
      year: 2026,
    }

    const drivers: ApiDriver[] = FIELD.map((d) => ({
      driver_number: d.num,
      broadcast_name: d.name,
      full_name: d.name,
      name_acronym: d.acr,
      team_name: d.team,
      team_colour: d.colour,
      headshot_url: null,
      session_key: SESSION_KEY,
      meeting_key: MEETING_KEY,
    }))

    const laps: ApiLap[] = []
    const stints: ApiStint[] = []
    const cumulative = new Map<number, number>()

    // Per-driver running clock so we can compute gaps. Apply a small per-driver
    // offset at the start to spread the grid.
    for (const d of FIELD) {
      cumulative.set(d.num, d.pace * 0.001 * (FIELD.indexOf(d) + 1))
    }

    const completedLaps = finished ? MAX_LAPS : nowLap - 1

    for (let lap = 1; lap <= completedLaps; lap++) {
      for (const d of FIELD) {
        const t = lapTime(d, lap)
        const prev = cumulative.get(d.num) ?? 0
        const startOffset = prev
        cumulative.set(d.num, prev + t)

        const s1 = t * 0.32 + (rand(d.num + lap * 7) - 0.5) * 0.1
        const s2 = t * 0.41 + (rand(d.num + lap * 13) - 0.5) * 0.12
        const s3 = t - s1 - s2
        laps.push({
          driver_number: d.num,
          lap_number: lap,
          date_start: iso(startOffset),
          lap_duration: Number(t.toFixed(3)),
          duration_sector_1: Number(s1.toFixed(3)),
          duration_sector_2: Number(s2.toFixed(3)),
          duration_sector_3: Number(s3.toFixed(3)),
          segments_sector_1: null,
          segments_sector_2: null,
          segments_sector_3: null,
          is_pit_out_lap: lap === d.pitLap + 1,
          st_speed: 310 + Math.round(rand(d.num + lap) * 18),
          session_key: SESSION_KEY,
          meeting_key: MEETING_KEY,
        })
      }
    }

    // Stints reflect the plan up to the current lap.
    for (const d of FIELD) {
      const reachedPit = completedLaps >= d.pitLap
      stints.push({
        driver_number: d.num,
        stint_number: 1,
        lap_start: 1,
        lap_end: reachedPit ? d.pitLap : Math.max(1, completedLaps),
        compound: d.startCompound,
        tyre_age_at_start: d.startAge,
        session_key: SESSION_KEY,
        meeting_key: MEETING_KEY,
      })
      if (reachedPit) {
        stints.push({
          driver_number: d.num,
          stint_number: 2,
          lap_start: d.pitLap + 1,
          lap_end: Math.max(d.pitLap + 1, completedLaps),
          compound: d.endCompound,
          tyre_age_at_start: 1,
          session_key: SESSION_KEY,
          meeting_key: MEETING_KEY,
        })
      }
      void compoundFor // keep helper referenced for clarity
    }

    // Build standings from cumulative times.
    const order = [...FIELD].sort((a, b) => (cumulative.get(a.num) ?? 0) - (cumulative.get(b.num) ?? 0))
    const leaderTime = cumulative.get(order[0].num) ?? 0
    const lastDate = iso((completedLaps + 1) * 92)

    const positions: ApiPosition[] = order.map((d, i) => ({
      date: lastDate,
      driver_number: d.num,
      position: i + 1,
      session_key: SESSION_KEY,
      meeting_key: MEETING_KEY,
    }))

    const intervals: ApiInterval[] = order.map((d, i) => {
      const gapLeader = (cumulative.get(d.num) ?? 0) - leaderTime
      const ahead = i === 0 ? 0 : (cumulative.get(d.num) ?? 0) - (cumulative.get(order[i - 1].num) ?? 0)
      return {
        date: lastDate,
        driver_number: d.num,
        gap_to_leader: i === 0 ? 0 : Number(gapLeader.toFixed(3)),
        interval: i === 0 ? 0 : Number(ahead.toFixed(3)),
        session_key: SESSION_KEY,
        meeting_key: MEETING_KEY,
      }
    })

    const raceControl: ApiRaceControl[] = [
      {
        date: iso(0),
        category: 'Flag',
        flag: 'GREEN',
        scope: 'Track',
        sector: null,
        message: 'GREEN LIGHT - PIT EXIT OPEN',
        lap_number: 1,
        driver_number: null,
        session_key: SESSION_KEY,
        meeting_key: MEETING_KEY,
      },
    ]
    // A brief Virtual Safety Car window mid-race for visual interest.
    if (completedLaps >= 12) {
      raceControl.push({
        date: iso(12 * 92),
        category: 'SafetyCar',
        flag: null,
        scope: 'Track',
        sector: null,
        message: 'VIRTUAL SAFETY CAR DEPLOYED',
        lap_number: 12,
        driver_number: null,
        session_key: SESSION_KEY,
        meeting_key: MEETING_KEY,
      })
    }
    if (completedLaps >= 14) {
      raceControl.push({
        date: iso(14 * 92),
        category: 'SafetyCar',
        flag: null,
        scope: 'Track',
        sector: null,
        message: 'VIRTUAL SAFETY CAR ENDING',
        lap_number: 14,
        driver_number: null,
        session_key: SESSION_KEY,
        meeting_key: MEETING_KEY,
      })
    }
    if (finished) {
      raceControl.push({
        date: iso(MAX_LAPS * 92),
        category: 'Flag',
        flag: 'CHEQUERED',
        scope: 'Track',
        sector: null,
        message: 'CHEQUERED FLAG',
        lap_number: MAX_LAPS,
        driver_number: null,
        session_key: SESSION_KEY,
        meeting_key: MEETING_KEY,
      })
    }

    const weather: ApiWeather[] = [
      {
        date: lastDate,
        air_temperature: 24.5,
        track_temperature: 41.2,
        humidity: 38,
        rainfall: 0,
        wind_speed: 2.4,
        session_key: SESSION_KEY,
        meeting_key: MEETING_KEY,
      },
    ]

    return { session, drivers, intervals, positions, laps, stints, pits: [], raceControl, weather }
  }
}
