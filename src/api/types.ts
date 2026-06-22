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

export interface ApiMeeting {
  meeting_key: number
  meeting_name: string
  meeting_official_name: string
  circuit_short_name: string
  country_name: string
  location: string
  year: number
  date_start: string
}

export interface ApiCarData {
  date: string
  driver_number: number
  speed: number // km/h
  rpm: number
  n_gear: number
  throttle: number // 0-100
  brake: number // 0 or 100
  drs: number // coded: 0/1 off, 8 eligible, 10/12/14 on
  session_key: number
  meeting_key: number
}

export interface ApiLocation {
  date: string
  driver_number: number
  x: number
  y: number
  z: number
  session_key: number
  meeting_key: number
}

export interface ApiTeamRadio {
  date: string
  driver_number: number
  recording_url: string
  session_key: number
  meeting_key: number
}

export interface ApiOvertake {
  date: string
  overtaking_driver_number: number
  overtaken_driver_number: number
  position: number // position taken
  session_key: number
  meeting_key: number
}

export interface ApiStartingGrid {
  position: number
  driver_number: number
  lap_duration: number | null // qualifying time
  session_key: number
  meeting_key: number
}

export interface ApiSessionResult {
  position: number | null
  driver_number: number
  number_of_laps: number | null
  dnf: boolean
  dns: boolean
  dsq: boolean
  duration: number | number[] | null
  gap_to_leader: number | string | null
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

export interface LapDetail {
  lap: number
  time: number | null
  s1: number | null
  s2: number | null
  s3: number | null
  pitOut: boolean
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
  // Full per-lap breakdown (lap time + sectors), oldest -> newest, for analysis.
  lapHistory: LapDetail[]
  avgLapTime: number | null
  // Extended live data.
  speedTrap: number | null // km/h at the speed-trap on the latest lap
  drs: DrsState
  gridPosition: number | null
  positionsGained: number | null // grid - current (positive = gained)
  pitStops: number // completed pit stops
  lastPitDuration: number | null // seconds (stationary time)
  car: CarTelemetry | null // latest car_data sample
  location: { x: number; y: number } | null
  retired: boolean
}

export type DrsState = 'on' | 'eligible' | 'off'

export interface CarTelemetry {
  speed: number
  rpm: number
  gear: number
  throttle: number
  brake: number
  drs: DrsState
}

export interface TelemetryTrace {
  driverNumber: number
  acronym: string
  colour: string
  speed: number[]
  throttle: number[]
  brake: number[]
  gear: number[]
  rpm: number[]
}

export interface TrackMapCar {
  driverNumber: number
  acronym: string
  colour: string
  position: number | null
  x: number
  y: number
  drs: DrsState
  inPit: boolean
}

// A point along the circuit enriched with telemetry channels, for painting the
// track by speed / gear / DRS.
export interface ChannelPoint {
  x: number
  y: number
  speed: number // km/h
  gear: number
  drs: boolean
}

export interface StintSegment {
  compound: string | null
  lapStart: number
  lapEnd: number
  laps: number
  ageAtStart: number
}

export interface StintRow {
  driverNumber: number
  acronym: string
  colour: string
  position: number | null
  segments: StintSegment[]
}

export interface PitEvent {
  driverNumber: number
  acronym: string
  colour: string
  lap: number
  duration: number | null
  date: string
}

export interface OvertakeEvent {
  date: string
  lap: number | null
  byNumber: number
  byAcronym: string
  byColour: string
  onNumber: number
  onAcronym: string
  position: number
}

export interface RadioClip {
  date: string
  driverNumber: number
  acronym: string
  colour: string
  url: string
}

export interface RaceControlEntry {
  date: string
  lap: number | null
  category: string
  flag: string | null
  message: string
  driverNumber: number | null
  acronym: string | null
}

export interface GridRow {
  driverNumber: number
  acronym: string
  colour: string
  gridPosition: number
  currentPosition: number | null
  delta: number | null // positive = gained places
  qualifyingTime: number | null
}

export interface ResultRow {
  position: number | null
  driverNumber: number
  acronym: string
  colour: string
  laps: number | null
  gapToLeader: number | string | null
  status: 'FIN' | 'DNF' | 'DNS' | 'DSQ'
}

export interface WeatherPoint {
  date: string
  airTemp: number | null
  trackTemp: number | null
  humidity: number | null
  pressure: number | null
  windSpeed: number | null
  windDirection: number | null
  rainfall: number | null
}

export interface RaceState {
  sessionName: string
  sessionType: string
  circuit: string
  countryName: string
  meetingName: string
  year: number | null
  status: TrackStatus
  currentLap: number | null
  lastMessage: string | null
  weather: ApiWeather | null
  finished: boolean
}

export interface RaceSnapshot {
  race: RaceState
  drivers: DriverState[]
  // Fastest lap of the whole session, for the header banner.
  fastestLap: { driverNumber: number; acronym: string; time: number } | null
  // Extended feature data sets.
  telemetry: TelemetryTrace[]
  trackMap: TrackMapCar[]
  stints: StintRow[]
  pitLog: PitEvent[]
  overtakes: OvertakeEvent[]
  radios: RadioClip[]
  raceControlLog: RaceControlEntry[]
  grid: GridRow[]
  results: ResultRow[]
  weatherHistory: WeatherPoint[]
}
