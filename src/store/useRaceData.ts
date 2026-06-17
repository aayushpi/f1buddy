import { useEffect, useRef, useState } from 'react'
import { api, type OpenF1Config } from '../api/openf1'
import type {
  ApiDriver,
  ApiSession,
  RaceSnapshot,
} from '../api/types'
import { buildSnapshot, type RawData } from '../utils/derive'
import { RaceSim } from '../data/sim'

export type DataMode = 'sim' | 'live'
export type Connection = 'idle' | 'connecting' | 'live' | 'sim' | 'error'

export interface DataOptions {
  mode: DataMode
  config: OpenF1Config
  sessionKey: number | 'latest'
  lapWindow: number
}

export interface DataResult {
  snapshot: RaceSnapshot | null
  connection: Connection
  error: string | null
  lastUpdated: number | null
}

const FAST_INTERVAL = 4500 // intervals + positions (gaps, order)
const SLOW_INTERVAL = 12000 // laps, stints, race control, weather
const SIM_INTERVAL = 1000

const emptyRaw = (): RawData => ({
  session: null,
  drivers: [],
  intervals: [],
  positions: [],
  laps: [],
  stints: [],
  pits: [],
  raceControl: [],
  weather: [],
})

export function useRaceData(opts: DataOptions): DataResult {
  const { mode, config, sessionKey, lapWindow } = opts

  const [snapshot, setSnapshot] = useState<RaceSnapshot | null>(null)
  const [connection, setConnection] = useState<Connection>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)

  const rawRef = useRef<RawData>(emptyRaw())
  const lapWindowRef = useRef(lapWindow)
  lapWindowRef.current = lapWindow

  // Rebuild the snapshot immediately when the lap window changes.
  useEffect(() => {
    if (rawRef.current.drivers.length) {
      setSnapshot(buildSnapshot(rawRef.current, lapWindow))
    }
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

    // Resolve the concrete session + driver list once, then poll.
    const bootstrap = async () => {
      try {
        const sessions = await api.sessions(
          config,
          sessionKey === 'latest' ? { session_key: 'latest' } : { session_key: sessionKey },
          signal,
        )
        const session: ApiSession | null = sessions.at(-1) ?? null
        if (!session) throw new Error('No session found for the requested key.')
        const resolvedKey = session.session_key
        rawRef.current.session = session

        const drivers: ApiDriver[] = await api.drivers(config, resolvedKey, signal)
        rawRef.current.drivers = drivers
        rebuild()
        startPolling(resolvedKey)
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
        const [laps, stints, pits, raceControl, weather] = await Promise.all([
          api.laps(config, key, signal),
          api.stints(config, key, signal),
          api.pit(config, key, signal),
          api.raceControl(config, key, signal),
          api.weather(config, key, signal),
        ])
        rawRef.current.laps = laps
        rawRef.current.stints = stints
        rawRef.current.pits = pits
        rawRef.current.raceControl = raceControl
        rawRef.current.weather = weather
        rebuild()
      } catch (e) {
        fail(e)
      }
    }

    let fastId: ReturnType<typeof setInterval>
    let slowId: ReturnType<typeof setInterval>
    const startPolling = (key: number) => {
      pollFast(key)
      pollSlow(key)
      fastId = setInterval(() => pollFast(key), FAST_INTERVAL)
      slowId = setInterval(() => pollSlow(key), SLOW_INTERVAL)
    }

    bootstrap()

    return () => {
      cancelled = true
      controller.abort()
      clearInterval(fastId)
      clearInterval(slowId)
    }
  }, [mode, config, sessionKey])

  return { snapshot, connection, error, lastUpdated }
}
