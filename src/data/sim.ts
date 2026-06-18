import type {
  ApiCarData,
  ApiDriver,
  ApiInterval,
  ApiLap,
  ApiLocation,
  ApiMeeting,
  ApiOvertake,
  ApiPosition,
  ApiRaceControl,
  ApiSession,
  ApiSessionResult,
  ApiStartingGrid,
  ApiStint,
  ApiTeamRadio,
  ApiWeather,
} from '../api/types'
import type { RawData } from '../utils/derive'
import { TELEMETRY_TRACE_LEN } from '../utils/derive'
import { inDrsZone, positionAt, speedAt } from './circuit'

// A self-contained race simulator producing OpenF1-shaped records for every
// endpoint the app supports, so all features are demonstrable fully offline.

interface SimDriver {
  num: number
  acr: string
  name: string
  team: string
  colour: string
  pace: number
  pitLap: number
  startCompound: string
  endCompound: string
  startAge: number
  grid: number
}

const FIELD: SimDriver[] = [
  { num: 1, acr: 'VER', name: 'Max Verstappen', team: 'Red Bull Racing', colour: '3671C6', pace: 91.6, pitLap: 18, startCompound: 'MEDIUM', endCompound: 'HARD', startAge: 0, grid: 2 },
  { num: 4, acr: 'NOR', name: 'Lando Norris', team: 'McLaren', colour: 'FF8000', pace: 91.7, pitLap: 20, startCompound: 'MEDIUM', endCompound: 'HARD', startAge: 0, grid: 1 },
  { num: 16, acr: 'LEC', name: 'Charles Leclerc', team: 'Ferrari', colour: 'E80020', pace: 91.85, pitLap: 17, startCompound: 'SOFT', endCompound: 'MEDIUM', startAge: 0, grid: 4 },
  { num: 81, acr: 'PIA', name: 'Oscar Piastri', team: 'McLaren', colour: 'FF8000', pace: 91.9, pitLap: 22, startCompound: 'MEDIUM', endCompound: 'HARD', startAge: 0, grid: 3 },
  { num: 63, acr: 'RUS', name: 'George Russell', team: 'Mercedes', colour: '27F4D2', pace: 92.0, pitLap: 19, startCompound: 'MEDIUM', endCompound: 'HARD', startAge: 0, grid: 5 },
  { num: 44, acr: 'HAM', name: 'Lewis Hamilton', team: 'Ferrari', colour: 'E80020', pace: 92.05, pitLap: 21, startCompound: 'SOFT', endCompound: 'HARD', startAge: 0, grid: 7 },
  { num: 55, acr: 'SAI', name: 'Carlos Sainz', team: 'Williams', colour: '64C4FF', pace: 92.2, pitLap: 16, startCompound: 'SOFT', endCompound: 'MEDIUM', startAge: 0, grid: 6 },
  { num: 12, acr: 'ANT', name: 'Andrea Kimi Antonelli', team: 'Mercedes', colour: '27F4D2', pace: 92.25, pitLap: 23, startCompound: 'MEDIUM', endCompound: 'HARD', startAge: 0, grid: 8 },
  { num: 14, acr: 'ALO', name: 'Fernando Alonso', team: 'Aston Martin', colour: '229971', pace: 92.4, pitLap: 18, startCompound: 'MEDIUM', endCompound: 'HARD', startAge: 0, grid: 9 },
  { num: 10, acr: 'GAS', name: 'Pierre Gasly', team: 'Alpine', colour: '0093CC', pace: 92.5, pitLap: 20, startCompound: 'SOFT', endCompound: 'MEDIUM', startAge: 0, grid: 10 },
]

const MAX_LAPS = 44
const AVG_LAP = 92
const SESSION_KEY = 9999
const MEETING_KEY = 9999
const RETIRE_DRIVER = 10 // GAS retires when the race finishes (for results variety)

function rand(seed: number): number {
  let t = (seed * 2654435761) % 4294967296
  t = (t ^ (t >>> 15)) >>> 0
  t = (t * 2246822519) % 4294967296
  return ((t ^ (t >>> 13)) >>> 0) / 4294967296
}

const T0 = Date.UTC(2026, 5, 7, 13, 0, 0)
const iso = (sec: number) => new Date(T0 + sec * 1000).toISOString()

function lapTime(d: SimDriver, lap: number): number {
  const stintLap = lap <= d.pitLap ? lap : lap - d.pitLap
  const deg = stintLap * 0.05
  const fuelEffect = -(lap * 0.03)
  const noise = (rand(d.num * 1000 + lap) - 0.5) * 0.6
  const pitLoss = lap === d.pitLap ? 21.5 : 0
  const pitOut = lap === d.pitLap + 1 ? 1.2 : 0
  return d.pace + deg + fuelEffect + noise + pitLoss + pitOut
}

// A short generated tone, reused as the "team radio" recording so the player
// works even without network access.
let RADIO_URI: string | null = null
function radioClip(): string {
  if (RADIO_URI) return RADIO_URI
  try {
    const sr = 8000
    const dur = 0.4
    const n = Math.floor(sr * dur)
    const bytes = 44 + n * 2
    const buf = new Uint8Array(bytes)
    const dv = new DataView(buf.buffer)
    const wr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)) }
    wr(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); wr(8, 'WAVE'); wr(12, 'fmt ')
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true)
    dv.setUint16(34, 16, true); wr(36, 'data'); dv.setUint32(40, n * 2, true)
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / 400) * Math.min(1, (n - i) / 400)
      const v = Math.sin((2 * Math.PI * 520 * i) / sr) * 0.25 * env
      dv.setInt16(44 + i * 2, v * 32767, true)
    }
    let bin = ''
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i])
    RADIO_URI = 'data:audio/wav;base64,' + btoa(bin)
  } catch {
    RADIO_URI = ''
  }
  return RADIO_URI
}

export class RaceSim {
  private startMs = Date.now()
  readonly secondsPerLap = 4

  reset() {
    this.startMs = Date.now()
  }

  private leaderProgress(): number {
    const elapsed = (Date.now() - this.startMs) / 1000
    return Math.min(MAX_LAPS, elapsed / this.secondsPerLap)
  }

  currentLap(): number {
    return Math.min(MAX_LAPS, Math.floor(this.leaderProgress()) + 1)
  }

  snapshot(): RawData {
    const lead = this.leaderProgress()
    const nowLap = Math.min(MAX_LAPS, Math.floor(lead) + 1)
    const finished = lead >= MAX_LAPS
    const completedLaps = finished ? MAX_LAPS : nowLap - 1
    const nowMs = Date.now()

    const session: ApiSession = {
      session_key: SESSION_KEY,
      session_name: 'Race',
      session_type: 'Race',
      meeting_key: MEETING_KEY,
      location: 'Spielberg',
      country_name: 'Austria',
      circuit_short_name: 'Red Bull Ring',
      date_start: iso(0),
      date_end: iso(MAX_LAPS * AVG_LAP),
      year: 2026,
    }

    const meeting: ApiMeeting = {
      meeting_key: MEETING_KEY,
      meeting_name: 'Austrian Grand Prix',
      meeting_official_name: 'FORMULA 1 GROSSER PREIS VON ÖSTERREICH 2026',
      circuit_short_name: 'Red Bull Ring',
      country_name: 'Austria',
      location: 'Spielberg',
      year: 2026,
      date_start: iso(0),
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
    const cumulative = new Map<number, number>()
    for (const d of FIELD) cumulative.set(d.num, d.pace * 0.001 * (FIELD.indexOf(d) + 1))

    // Per-lap cumulative snapshots, used to derive standings order & overtakes.
    const orderByLap: number[][] = []

    for (let lap = 1; lap <= completedLaps; lap++) {
      for (const d of FIELD) {
        const t = lapTime(d, lap)
        const prev = cumulative.get(d.num) ?? 0
        cumulative.set(d.num, prev + t)
        const s1 = t * 0.32 + (rand(d.num + lap * 7) - 0.5) * 0.1
        const s2 = t * 0.41 + (rand(d.num + lap * 13) - 0.5) * 0.12
        const s3 = t - s1 - s2
        laps.push({
          driver_number: d.num,
          lap_number: lap,
          date_start: iso(prev),
          lap_duration: Number(t.toFixed(3)),
          duration_sector_1: Number(s1.toFixed(3)),
          duration_sector_2: Number(s2.toFixed(3)),
          duration_sector_3: Number(s3.toFixed(3)),
          segments_sector_1: null,
          segments_sector_2: null,
          segments_sector_3: null,
          is_pit_out_lap: lap === d.pitLap + 1,
          st_speed: 308 + Math.round(rand(d.num + lap) * 22),
          session_key: SESSION_KEY,
          meeting_key: MEETING_KEY,
        })
      }
      orderByLap[lap] = [...FIELD]
        .sort((a, b) => (cumulative.get(a.num) ?? 0) - (cumulative.get(b.num) ?? 0))
        .map((d) => d.num)
    }

    // Standings (current order from latest cumulative).
    const order = [...FIELD].sort((a, b) => (cumulative.get(a.num) ?? 0) - (cumulative.get(b.num) ?? 0))
    const leaderTime = cumulative.get(order[0].num) ?? 0
    const lastDate = iso((completedLaps + 1) * AVG_LAP)
    const posOf = new Map<number, number>()
    order.forEach((d, i) => posOf.set(d.num, i + 1))

    const positions: ApiPosition[] = order.map((d, i) => ({
      date: lastDate,
      driver_number: d.num,
      position: i + 1,
      session_key: SESSION_KEY,
      meeting_key: MEETING_KEY,
    }))

    const gapToLeader = new Map<number, number>()
    const intervals: ApiInterval[] = order.map((d, i) => {
      const gl = (cumulative.get(d.num) ?? 0) - leaderTime
      const ahead = i === 0 ? 0 : (cumulative.get(d.num) ?? 0) - (cumulative.get(order[i - 1].num) ?? 0)
      gapToLeader.set(d.num, i === 0 ? 0 : gl)
      return {
        date: lastDate,
        driver_number: d.num,
        gap_to_leader: i === 0 ? 0 : Number(gl.toFixed(3)),
        interval: i === 0 ? 0 : Number(ahead.toFixed(3)),
        session_key: SESSION_KEY,
        meeting_key: MEETING_KEY,
      }
    })

    // Stints up to the current lap.
    const stints: ApiStint[] = []
    for (const d of FIELD) {
      const reachedPit = completedLaps >= d.pitLap
      stints.push({
        driver_number: d.num, stint_number: 1, lap_start: 1,
        lap_end: reachedPit ? d.pitLap : Math.max(1, completedLaps),
        compound: d.startCompound, tyre_age_at_start: d.startAge,
        session_key: SESSION_KEY, meeting_key: MEETING_KEY,
      })
      if (reachedPit) {
        stints.push({
          driver_number: d.num, stint_number: 2, lap_start: d.pitLap + 1,
          lap_end: Math.max(d.pitLap + 1, completedLaps),
          compound: d.endCompound, tyre_age_at_start: 1,
          session_key: SESSION_KEY, meeting_key: MEETING_KEY,
        })
      }
    }

    // Pit stops.
    const pits = FIELD.filter((d) => completedLaps >= d.pitLap).map((d) => ({
      date: iso(d.pitLap * AVG_LAP),
      driver_number: d.num,
      lap_number: d.pitLap,
      pit_duration: Number((2.2 + rand(d.num) * 1.4).toFixed(1)),
      session_key: SESSION_KEY,
      meeting_key: MEETING_KEY,
    }))

    // Per-driver track progress -> car_data history + location.
    const carData: ApiCarData[] = []
    const location: ApiLocation[] = []
    const dStep = 0.008
    for (const d of FIELD) {
      const prog = lead - (gapToLeader.get(d.num) ?? 0) / AVG_LAP
      const pt = positionAt(prog)
      location.push({
        date: iso((nowMs - T0) / 1000),
        driver_number: d.num, x: pt.x, y: pt.y, z: 0,
        session_key: SESSION_KEY, meeting_key: MEETING_KEY,
      })
      for (let k = 0; k < TELEMETRY_TRACE_LEN; k++) {
        const p = prog - k * dStep
        const s = speedAt(p) + (rand(d.num + Math.floor(p * 1000)) - 0.5) * 8
        const sNewer = speedAt(p + dStep)
        const braking = sNewer < s - 3
        const speed = Math.max(60, Math.round(s))
        const throttle = braking ? 0 : Math.round(Math.min(100, 45 + ((speed - 90) / 240) * 55))
        const brake = braking ? 100 : 0
        const gear = Math.max(1, Math.min(8, Math.round(speed / 42) + 1))
        const rpm = Math.min(12000, 7000 + Math.round(((speed % 45) / 45) * 5200))
        const drs = inDrsZone(p) ? (speed > 250 ? 12 : 8) : 0
        carData.push({
          date: new Date(nowMs - k * 250).toISOString(),
          driver_number: d.num, speed, rpm, n_gear: gear, throttle, brake, drs,
          session_key: SESSION_KEY, meeting_key: MEETING_KEY,
        })
      }
    }

    // Overtakes from consecutive-lap order changes.
    const overtakes: ApiOvertake[] = []
    for (let lap = 2; lap <= completedLaps; lap++) {
      const prev = orderByLap[lap - 1]
      const cur = orderByLap[lap]
      if (!prev || !cur) continue
      const prevPos = new Map<number, number>()
      prev.forEach((n, i) => prevPos.set(n, i))
      cur.forEach((n, i) => {
        const was = prevPos.get(n) ?? i
        if (i < was) {
          const passed = cur[i + 1]
          if (passed != null && (prevPos.get(passed) ?? 0) < was) {
            overtakes.push({
              date: iso(lap * AVG_LAP),
              overtaking_driver_number: n,
              overtaken_driver_number: passed,
              position: i + 1,
              session_key: SESSION_KEY,
              meeting_key: MEETING_KEY,
            })
          }
        }
      })
    }

    // Team radio clips at intervals.
    const teamRadio: ApiTeamRadio[] = []
    for (let lap = 3; lap <= completedLaps; lap += 6) {
      const d = FIELD[Math.floor(rand(lap) * FIELD.length)]
      teamRadio.push({
        date: iso(lap * AVG_LAP),
        driver_number: d.num,
        recording_url: radioClip(),
        session_key: SESSION_KEY,
        meeting_key: MEETING_KEY,
      })
    }

    // Starting grid.
    const startingGrid: ApiStartingGrid[] = FIELD.map((d) => ({
      position: d.grid,
      driver_number: d.num,
      lap_duration: Number((d.pace - 28 + rand(d.num) * 0.5).toFixed(3)),
      session_key: SESSION_KEY,
      meeting_key: MEETING_KEY,
    }))

    // Race control.
    const raceControl: ApiRaceControl[] = [
      { date: iso(0), category: 'Flag', flag: 'GREEN', scope: 'Track', sector: null, message: 'GREEN LIGHT - PIT EXIT OPEN', lap_number: 1, driver_number: null, session_key: SESSION_KEY, meeting_key: MEETING_KEY },
    ]
    if (completedLaps >= 12) raceControl.push({ date: iso(12 * AVG_LAP), category: 'SafetyCar', flag: null, scope: 'Track', sector: null, message: 'VIRTUAL SAFETY CAR DEPLOYED', lap_number: 12, driver_number: null, session_key: SESSION_KEY, meeting_key: MEETING_KEY })
    if (completedLaps >= 14) raceControl.push({ date: iso(14 * AVG_LAP), category: 'SafetyCar', flag: null, scope: 'Track', sector: null, message: 'VIRTUAL SAFETY CAR ENDING', lap_number: 14, driver_number: null, session_key: SESSION_KEY, meeting_key: MEETING_KEY })
    for (const o of overtakes.slice(-6)) {
      raceControl.push({ date: o.date, category: 'CarEvent', flag: null, scope: 'Driver', sector: null, message: `CAR ${o.overtaking_driver_number} OVERTOOK CAR ${o.overtaken_driver_number} FOR P${o.position}`, lap_number: null, driver_number: o.overtaking_driver_number, session_key: SESSION_KEY, meeting_key: MEETING_KEY })
    }
    if (finished) raceControl.push({ date: iso(MAX_LAPS * AVG_LAP), category: 'Flag', flag: 'CHEQUERED', scope: 'Track', sector: null, message: 'CHEQUERED FLAG', lap_number: MAX_LAPS, driver_number: null, session_key: SESSION_KEY, meeting_key: MEETING_KEY })

    // Weather history.
    const weather: ApiWeather[] = []
    const wPoints = Math.max(1, Math.floor(completedLaps / 3) + 1)
    for (let i = 0; i < wPoints; i++) {
      const lap = i * 3
      weather.push({
        date: iso(lap * AVG_LAP),
        air_temperature: Number((24.5 + Math.sin(i / 2) * 0.8).toFixed(1)),
        track_temperature: Number((41.2 + Math.sin(i / 3) * 1.6 - i * 0.05).toFixed(1)),
        humidity: Number((38 + Math.cos(i / 2) * 4).toFixed(0)),
        rainfall: 0,
        wind_speed: Number((2.4 + rand(i) * 1.5).toFixed(1)),
        session_key: SESSION_KEY,
        meeting_key: MEETING_KEY,
      })
    }

    // Final classification once the chequered flag is out.
    const results: ApiSessionResult[] = finished
      ? order.map((d, i) => {
          const dnf = d.num === RETIRE_DRIVER
          return {
            position: dnf ? null : i + 1,
            driver_number: d.num,
            number_of_laps: dnf ? MAX_LAPS - 6 : MAX_LAPS,
            dnf,
            dns: false,
            dsq: false,
            duration: null,
            gap_to_leader: i === 0 ? 0 : dnf ? 'DNF' : Number((gapToLeader.get(d.num) ?? 0).toFixed(3)),
            session_key: SESSION_KEY,
            meeting_key: MEETING_KEY,
          }
        })
      : []

    return {
      session, meeting, drivers, intervals, positions, laps, stints, pits,
      raceControl, weather, carData, location, teamRadio, overtakes,
      startingGrid, results,
    }
  }
}
