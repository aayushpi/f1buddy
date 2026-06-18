import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type OpenF1Config } from '../api/openf1'
import type { ApiDriver, ApiSession, RaceSnapshot } from '../api/types'
import { buildSnapshot, filterRawByTime, rawTimeBounds, type RawData } from '../utils/derive'
import { RaceSim } from '../data/sim'

export type DataMode = 'sim' | 'live'
export type Connection = 'idle' | 'connecting' | 'live' | 'sim' | 'replay' | 'error'
export type ActiveView = 'timing' | 'map' | 'telemetry' | 'strategy' | 'control' | 'weather'

export interface DataOptions {
  mode: DataMode
  config: OpenF1Config
  sessionKey: number | 'latest'
  lapWindow: number
  activeView: ActiveView
}

export interface ReplayControls {
  tMin: number
  tMax: number
  tNow: number
  playing: boolean
  speed: number
  toggle: () => void
  setSpeed: (n: number) => void
  seek: (ms: number) => void
}

export interface DataResult {
  snapshot: RaceSnapshot | null
  connection: Connection
  error: string | null
  lastUpdated: number | null
  replay: ReplayControls | null
}

const FAST_INTERVAL = 4500
const SLOW_INTERVAL = 12000
const TELEMETRY_INTERVAL = 2000
const SIM_INTERVAL = 1000
const CLOCK_INTERVAL = 200 // replay tick
const TRACE_BACK_MS = 20000 // telemetry history fetched behind the clock
const SPEEDS = [1, 2, 4, 6, 12]

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
  const [replayState, setReplayState] = useState<Omit<ReplayControls, 'toggle' | 'setSpeed' | 'seek'> | null>(null)

  const rawRef = useRef<RawData>(emptyRaw())
  const lapWindowRef = useRef(lapWindow)
  lapWindowRef.current = lapWindow
  const viewRef = useRef(activeView)
  viewRef.current = activeView

  // Replay clock + bookkeeping shared with the playback loop.
  const clock = useRef({ tNow: 0, tMin: 0, tMax: 1, raceEnd: 1, playing: true, speed: 6 })
  const dirty = useRef(false) // force a rebuild on the next tick (after a seek)

  useEffect(() => {
    if (rawRef.current.drivers.length && mode !== 'live') {
      setSnapshot(buildSnapshot(rawRef.current, lapWindow))
    }
  }, [lapWindow, mode])

  // ---- Replay controls (stable) ----
  const syncClock = useCallback(() => {
    const c = clock.current
    setReplayState({ tMin: c.tMin, tMax: c.tMax, tNow: c.tNow, playing: c.playing, speed: c.speed })
  }, [])

  const toggle = useCallback(() => {
    const c = clock.current
    // Restart from the beginning if we hit the end.
    if (!c.playing && c.tNow >= c.tMax - 250) c.tNow = c.tMin
    c.playing = !c.playing
    dirty.current = true
    syncClock()
  }, [syncClock])

  const setSpeed = useCallback(
    (n: number) => {
      clock.current.speed = n
      syncClock()
    },
    [syncClock],
  )

  const seek = useCallback(
    (ms: number) => {
      const c = clock.current
      c.tNow = Math.max(c.tMin, Math.min(c.tMax, ms))
      dirty.current = true
      syncClock()
    },
    [syncClock],
  )

  // ---- Simulation mode ----
  useEffect(() => {
    if (mode !== 'sim') return
    setReplayState(null)
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

  // ---- Live (latest) mode: poll a session in progress ----
  useEffect(() => {
    if (mode !== 'live' || sessionKey !== 'latest') return
    setReplayState(null)

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
        const sessions = await api.sessions(config, { session_key: 'latest' }, signal)
        const session: ApiSession | null = sessions.at(-1) ?? null
        if (!session) throw new Error('No live session found.')
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
        r.laps = laps; r.stints = stints; r.pits = pits; r.raceControl = raceControl
        r.weather = weather; r.teamRadio = teamRadio; r.overtakes = overtakes
        r.startingGrid = grid; r.results = results
        rebuild()
      } catch (e) {
        fail(e)
      }
    }
    const pollTelemetry = async (key: number) => {
      if (!TELEMETRY_VIEWS.includes(viewRef.current)) return
      try {
        const from = new Date(Date.now() - 8000).toISOString()
        const [carData, location] = await Promise.all([
          api.carData(config, key, from, undefined, signal).catch(() => []),
          api.location(config, key, from, undefined, signal).catch(() => []),
        ])
        if (carData.length) rawRef.current.carData = carData
        if (location.length) rawRef.current.location = location
        rebuild()
      } catch {
        /* best effort */
      }
    }

    let fastId: ReturnType<typeof setInterval>
    let slowId: ReturnType<typeof setInterval>
    let teleId: ReturnType<typeof setInterval>
    const startPolling = (key: number) => {
      pollFast(key); pollSlow(key); pollTelemetry(key)
      fastId = setInterval(() => pollFast(key), FAST_INTERVAL)
      slowId = setInterval(() => pollSlow(key), SLOW_INTERVAL)
      teleId = setInterval(() => pollTelemetry(key), TELEMETRY_INTERVAL)
    }

    bootstrap()
    return () => {
      cancelled = true
      controller.abort()
      clearInterval(fastId); clearInterval(slowId); clearInterval(teleId)
    }
  }, [mode, config, sessionKey])

  // ---- Replay mode: load a historical session and play it through time ----
  useEffect(() => {
    if (mode !== 'live' || typeof sessionKey !== 'number') return

    let cancelled = false
    const controller = new AbortController()
    const { signal } = controller
    rawRef.current = emptyRaw()
    setSnapshot(null)
    setConnection('connecting')
    setError(null)
    setReplayState(null)

    // Telemetry window cache.
    let winFrom = Infinity
    let winTo = -Infinity
    let fetchingTele = false
    let lastBuilt = -1

    const ensureTelemetry = (key: number) => {
      if (!TELEMETRY_VIEWS.includes(viewRef.current) || fetchingTele) return
      const c = clock.current
      if (c.tNow >= winFrom && c.tNow <= winTo - 3000) return // covered
      fetchingTele = true
      const span = Math.max(15000, c.speed * 4000)
      const from = new Date(c.tNow - TRACE_BACK_MS).toISOString()
      const to = new Date(c.tNow + span).toISOString()
      Promise.all([
        api.carData(config, key, from, to, signal).catch(() => []),
        api.location(config, key, from, to, signal).catch(() => []),
      ])
        .then(([cd, loc]) => {
          rawRef.current.carData = cd
          rawRef.current.location = loc
          winFrom = c.tNow - TRACE_BACK_MS
          winTo = c.tNow + span
          dirty.current = true
        })
        .finally(() => {
          fetchingTele = false
        })
    }

    const build = () => {
      const c = clock.current
      const filtered = filterRawByTime(rawRef.current, c.tNow, c.raceEnd)
      setSnapshot(buildSnapshot(filtered, lapWindowRef.current))
      setLastUpdated(Date.now())
      lastBuilt = c.tNow
    }

    let clockId: ReturnType<typeof setInterval>

    const bootstrap = async () => {
      try {
        const sessions = await api.sessions(config, { session_key: sessionKey }, signal)
        const session: ApiSession | null = sessions.at(-1) ?? null
        if (!session) throw new Error('Session not found.')
        rawRef.current.session = session

        const [drivers, meetings, intervals, positions, laps, stints, pits, rc, weather, radio, overtakes, grid, results] =
          await Promise.all([
            api.drivers(config, sessionKey, signal),
            api.meetings(config, { meeting_key: session.meeting_key }, signal).catch(() => []),
            api.intervals(config, sessionKey, signal),
            api.position(config, sessionKey, signal),
            api.laps(config, sessionKey, signal),
            api.stints(config, sessionKey, signal),
            api.pit(config, sessionKey, signal).catch(() => []),
            api.raceControl(config, sessionKey, signal).catch(() => []),
            api.weather(config, sessionKey, signal).catch(() => []),
            api.teamRadio(config, sessionKey, signal).catch(() => []),
            api.overtakes(config, sessionKey, signal).catch(() => []),
            api.startingGrid(config, sessionKey, signal).catch(() => []),
            api.sessionResult(config, sessionKey, signal).catch(() => []),
          ])
        if (cancelled) return
        const r = rawRef.current
        r.drivers = drivers as ApiDriver[]
        r.meeting = meetings.at(-1) ?? null
        r.intervals = intervals; r.positions = positions; r.laps = laps; r.stints = stints
        r.pits = pits; r.raceControl = rc; r.weather = weather; r.teamRadio = radio
        r.overtakes = overtakes; r.startingGrid = grid; r.results = results

        if (!r.drivers.length) throw new Error('No data for this session.')

        const bounds = rawTimeBounds(r)
        const endIso = Date.parse(session.date_end)
        clock.current = {
          tMin: bounds.min,
          tMax: bounds.max,
          raceEnd: Number.isFinite(endIso) ? Math.min(endIso, bounds.max) : bounds.max,
          tNow: bounds.min,
          playing: true,
          speed: 6,
        }
        syncClock()
        setConnection('replay')
        build()
        ensureTelemetry(sessionKey)

        clockId = setInterval(() => {
          const c = clock.current
          if (c.playing) {
            c.tNow = Math.min(c.tMax, c.tNow + CLOCK_INTERVAL * c.speed)
            if (c.tNow >= c.tMax) {
              c.playing = false
            }
            syncClock()
          }
          ensureTelemetry(sessionKey)
          if (c.playing || dirty.current) {
            dirty.current = false
            if (c.tNow !== lastBuilt) build()
          }
        }, CLOCK_INTERVAL)
      } catch (e) {
        if (!cancelled && !signal.aborted) {
          setError(e instanceof Error ? e.message : String(e))
          setConnection('error')
        }
      }
    }

    bootstrap()
    return () => {
      cancelled = true
      controller.abort()
      clearInterval(clockId)
    }
  }, [mode, config, sessionKey, syncClock])

  const replay: ReplayControls | null = replayState
    ? { ...replayState, toggle, setSpeed, seek }
    : null

  return { snapshot, connection, error, lastUpdated, replay }
}

export { SPEEDS }
