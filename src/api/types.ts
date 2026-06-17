// Raw record shapes returned by the OpenF1 API (https://openf1.org/).
// Only the fields used by the app are typed; the API may return more.

export interface ApiSession {
  session_key: number
  session_name: string // "Race", "Qualifying", "Sprint", "Practice 1", ...
  session_type: string // "Race", "Qualifying", "Practice", ...
  meeting_key: number
  location: string
  country_name: string
  circuit_short_name: string
  date_start: string
  date_end: string
  year: number
}

export interface ApiDriver {
  driver_number: number
  broadcast_name: string
  full_name: string
  name_acronym: string // "VER", "HAM", ...
  team_name: string
  team_colour: string // hex without leading '#', e.g. "3671C6"
  headshot_url: string | null
  session_key: number
  meeting_key: number
}

export interface ApiInterval {
  date: string
  driver_number: number
  // Gap to the race leader, in seconds. Can be a string like "1 LAP" when lapped.
  gap_to_leader: number | string | null
  // Gap to the car directly ahead, in seconds. Can be a string when lapped.
  interval: number | string | null
  session_key: number
  meeting_key: number
}

export interface ApiPosition {
  date: string
  driver_number: number
  position: number
  session_key: number
  meeting_key: number
}

export interface ApiLap {
  driver_number: number
  lap_number: number
  date_start: string | null
  lap_duration: number | null
  duration_sector_1: number | null
  duration_sector_2: number | null
  duration_sector_3: number | null
  segments_sector_1: number[] | null
  segments_sector_2: number[] | null
  segments_sector_3: number[] | null
  is_pit_out_lap: boolean
  st_speed: number | null
  session_key: number
  meeting_key: number
}

export interface ApiStint {
  driver_number: number
  stint_number: number
  lap_start: number
  lap_end: number
  compound: string | null // "SOFT" | "MEDIUM" | "HARD" | "INTERMEDIATE" | "WET"
  tyre_age_at_start: number | null
  session_key: number
  meeting_key: number
}

export interface ApiPit {
  date: string
  driver_number: number
  lap_number: number
  pit_duration: number | null
  session_key: number
  meeting_key: number
}

export interface ApiRaceControl {
  date: string
  category: string // "Flag" | "SafetyCar" | "Drs" | "CarEvent" | ...
  flag: string | null // "GREEN" | "YELLOW" | "DOUBLE YELLOW" | "RED" | "CHEQUERED" | "CLEAR" | "BLUE"
  scope: string | null // "Track" | "Sector" | "Driver"
  sector: number | null
  message: string
  lap_number: number | null
  driver_number: number | null
  session_key: number
  meeting_key: number
}

export interface ApiWeather {
  date: string
  air_temperature: number | null
  track_temperature: number | null
  humidity: number | null
  rainfall: number | null
  wind_speed: number | null
  session_key: number
  meeting_key: number
}

// ---- Derived / view-model types used by the UI ----

export type SectorPerf = 'fastest' | 'personal' | 'normal' | null
export type TrackStatus =
  | 'GREEN'
  | 'YELLOW'
  | 'DOUBLE_YELLOW'
  | 'RED'
  | 'SC'
  | 'VSC'
  | 'CHEQUERED'
  | 'UNKNOWN'

export interface SectorState {
  time: number | null
  perf: SectorPerf
}

export interface LapPoint {
  lap: number
  time: number
}

export interface DriverState {
  driverNumber: number
  acronym: string
  fullName: string
  teamName: string
  teamColour: string // hex without '#'
  position: number | null
  isLeader: boolean
  gapToLeader: number | string | null
  interval: number | string | null
  lastLap: number | null
  bestLap: number | null
  sectors: [SectorState, SectorState, SectorState]
  compound: string | null
  tyreAge: number | null // total laps on the current set
  stintLaps: number | null // laps completed in the current stint
  inPit: boolean
  lapTimes: LapPoint[]
  avgLapTime: number | null
}

export interface RaceState {
  sessionName: string
  sessionType: string
  circuit: string
  countryName: string
  year: number | null
  status: TrackStatus
  currentLap: number | null
  lastMessage: string | null
  weather: ApiWeather | null
}

export interface RaceSnapshot {
  race: RaceState
  drivers: DriverState[]
  // Fastest lap of the whole session, for the header banner.
  fastestLap: { driverNumber: number; acronym: string; time: number } | null
}
