import { useEffect, useRef, useState } from 'react'
import { api, type OpenF1Config } from '../api/openf1'
import type { ApiDriver, ApiSession, RaceSnapshot } from '../api/types'
import { buildSnapshot, type RawData } from '../utils/derive'
import { RaceSim } from '../data/sim'

export type DataMode = 'sim' | 'live'
export type Connection = 'idle' | 'connecting' | 'live' | 'sim' | 'error'
export type ActiveView = 'timing' | 'map' | 'telemetry' | 'strategy' | 'control' | 'weather'

export interface DataOptions {
  mode: DataMode
  config: OpenF1Config
  sessionKey: number | 'latest'
  lapWindow: number
  activeView: ActiveView
}

export interface DataResult {
  snapshot: RaceSnapshot | null
  connection: Connection
  error: string | null
  lastUpdated: number | null
}

const FAST_INTERVAL = 4500
const SLOW_INTERVAL = 12000
const TELEMETRY_INTERVAL = 2000
const SIM_INTERVAL = 1000

const emptyRaw = (): RawData => ({
  session: null,
  meeting: null,
  drivers: [],
  intervals: [],
  positions: [],
  laps: [],
  stints: [],
  pits: [],
  raceControl: [],
  weather: [],
  carData: [],
  location: [],
  teamRadio: [],
  overtakes: [],
  startingGrid: [],
  results: [],
})

const TELEMETRY_VIEWS: ActiveView[] = ['map', 'telemetry']

export function useRaceData(opts: DataOptions): DataResult {
  const { mode, config, sessionKey, lapWindow, activeView } = opts

  const [snapshot, setSnapshot] = useState<RaceSnapshot | null>(null)
  const [connection, setConnection] = useState<Connection>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const rawRef = useRef<RawData>(emptyRaw())
  const lapWindowRef = useRef(lapWindow)
  lapWindowRef.current = lapWindow
  const viewRef = useRef(activeView)
  viewRef.current = activeView

  useEffect(() => {
    if (rawRef.current.drivers.length) setSnapshot(buildSnapshot(rawRef.current, lapWindow))
  }, [lapWindow])

  // ---- Simulation mode ----
  useEffect(() => {
    if (mode !== 'sim') return
    const sim = new RaceSim()
    sim.reset()
    setConnection('sim')
    setError(null)

    const tick = () => {
      rawRef.current = sim.snapshot()
      setSnapshot(buildSnapshot(rawRef.current, lapWindowRef.current))
      setLastUpdated(Date.now())
    }
    tick()
    const id = setInterval(tick, SIM_INTERVAL)
    return () => clearInterval(id)
  }, [mode])

  // ---- Live mode ----
  useEffect(() => {
    if (mode !== 'live') return

    let cancelled = false
    const controller = new AbortController()
    const { signal } = controller
    rawRef.current = emptyRaw()
    setSnapshot(null)
    setConnection('connecting')
    setError(null)

    const fail = (e: unknown) => {
      if (cancelled || signal.aborted) return
      setError(e instanceof Error ? e.message : String(e))
      setConnection('error')
    }

    const rebuild = () => {
      if (cancelled) return
      if (rawRef.current.drivers.length) {
        setSnapshot(buildSnapshot(rawRef.current, lapWindowRef.current))
        setLastUpdated(Date.now())
        setConnection('live')
      }
    }

    const bootstrap = async () => {
      try {
        const sessions = await api.sessions(
          config,
          sessionKey === 'latest' ? { session_key: 'latest' } : { session_key: sessionKey },
          signal,
        )
        const session: ApiSession | null = sessions.at(-1) ?? null
        if (!session) throw new Error('No session found for the requested key.')
        const key = session.session_key
        rawRef.current.session = session

        const [drivers, meetings] = await Promise.all([
          api.drivers(config, key, signal),
          api.meetings(config, { meeting_key: session.meeting_key }, signal).catch(() => []),
        ])
        rawRef.current.drivers = drivers as ApiDriver[]
        rawRef.current.meeting = meetings.at(-1) ?? null
        rebuild()
        startPolling(key)
      } catch (e) {
        fail(e)
      }
    }

    const pollFast = async (key: number) => {
      try {
        const [intervals, positions] = await Promise.all([
          api.intervals(config, key, signal),
          api.position(config, key, signal),
        ])
        rawRef.current.intervals = intervals
        rawRef.current.positions = positions
        rebuild()
      } catch (e) {
        fail(e)
      }
    }

    const pollSlow = async (key: number) => {
      try {
        const [laps, stints, pits, raceControl, weather, teamRadio, overtakes, grid, results] =
          await Promise.all([
            api.laps(config, key, signal),
            api.stints(config, key, signal),
            api.pit(config, key, signal),
            api.raceControl(config, key, signal),
            api.weather(config, key, signal),
            api.teamRadio(config, key, signal).catch(() => []),
            api.overtakes(config, key, signal).catch(() => []),
            api.startingGrid(config, key, signal).catch(() => []),
            api.sessionResult(config, key, signal).catch(() => []),
          ])
        const r = rawRef.current
        r.laps = laps
        r.stints = stints
        r.pits = pits
        r.raceControl = raceControl
        r.weather = weather
        r.teamRadio = teamRadio
        r.overtakes = overtakes
        r.startingGrid = grid
        r.results = results
        rebuild()
      } catch (e) {
        fail(e)
      }
    }

    const pollTelemetry = async (key: number) => {
      if (!TELEMETRY_VIEWS.includes(viewRef.current)) return
      try {
        const since = new Date(Date.now() - 6000).toISOString()
        const [carData, location] = await Promise.all([
          api.carData(config, key, since, signal).catch(() => []),
          api.location(config, key, since, signal).catch(() => []),
        ])
        if (carData.length) rawRef.current.carData = carData
        if (location.length) rawRef.current.location = location
        rebuild()
      } catch {
        /* telemetry is best-effort; ignore */
      }
    }

    let fastId: ReturnType<typeof setInterval>
    let slowId: ReturnType<typeof setInterval>
    let teleId: ReturnType<typeof setInterval>
    const startPolling = (key: number) => {
      pollFast(key)
      pollSlow(key)
      pollTelemetry(key)
      fastId = setInterval(() => pollFast(key), FAST_INTERVAL)
      slowId = setInterval(() => pollSlow(key), SLOW_INTERVAL)
      teleId = setInterval(() => pollTelemetry(key), TELEMETRY_INTERVAL)
    }

    bootstrap()

    return () => {
      cancelled = true
      controller.abort()
      clearInterval(fastId)
      clearInterval(slowId)
      clearInterval(teleId)
    }
  }, [mode, config, sessionKey])

  return { snapshot, connection, error, lastUpdated }
}
