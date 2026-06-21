import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type OpenF1Config } from '../api/openf1'
import type { ApiCarData, ApiDriver, ApiLocation, ApiSession, ChannelPoint, RaceSnapshot } from '../api/types'
import {
  buildLapMarkers,
  buildSnapshot,
  filterRawByTime,
  rawTimeBounds,
  type RawData,
} from '../utils/derive'
import { RaceSim } from '../data/sim'
import { simChannels } from '../data/circuit'

export type DataMode = 'sim' | 'live'
export type Connection = 'idle' | 'connecting' | 'live' | 'sim' | 'replay' | 'error'
export type ActiveView =
  | 'timing'
  | 'map'
  | 'speedmap'
  | 'gap'
  | 'telemetry'
  | 'strategy'
  | 'control'
  | 'weather'

export interface DataOptions {
  mode: DataMode
  config: OpenF1Config
  sessionKey: number | 'latest'
  lapWindow: number
  activeView: ActiveView
  reloadNonce: number
}

export interface LapMarker {
  lap: number
  t: number
}

export interface ReplayControls {
  tMin: number
  tMax: number
  tNow: number
  playing: boolean
  speed: number
  lapMarkers: LapMarker[]
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
  // Ordered points tracing the circuit, derived from the location feed. null in
  // sim mode (the synthetic circuit outline is drawn from local geometry).
  trackOutline: { x: number; y: number }[] | null
  // Circuit outline enriched with speed / gear / DRS, for painting the track.
  trackChannels: ChannelPoint[] | null
}

/** Merge a reference car's location + car_data into a speed/gear/DRS path. */
function buildChannels(locs: ApiLocation[], cars: ApiCarData[]): ChannelPoint[] {
  const L = locs.filter((l) => !(l.x === 0 && l.y === 0)).sort((a, b) => (a.date < b.date ? -1 : 1))
  const C = [...cars].sort((a, b) => (a.date < b.date ? -1 : 1))
  if (L.length < 2 || C.length < 2) return []
  const ct = C.map((c) => Date.parse(c.date))
  let ci = 0
  const raw: ChannelPoint[] = []
  let last: ChannelPoint | null = null
  for (const l of L) {
    const lt = Date.parse(l.date)
    while (ci < C.length - 1 && ct[ci + 1] <= lt) ci++
    const car = C[ci]
    if (last && Math.hypot(l.x - last.x, l.y - last.y) < 1) continue
    const p = { x: l.x, y: l.y, speed: car.speed, gear: car.n_gear, drs: car.drs >= 10 }
    raw.push(p)
    last = p
  }
  const MAX = 300
  if (raw.length <= MAX) return raw
  const step = raw.length / MAX
  const out: ChannelPoint[] = []
  for (let i = 0; i < MAX; i++) out.push(raw[Math.floor(i * step)])
  return out
}

/**
 * Trace a circuit outline from raw location samples. Points are ordered by time
 * (so a single car's lap draws a clean loop), de-duplicated, and down-sampled to
 * keep the SVG path light.
 */
function buildOutline(locs: { x: number; y: number; date: string }[]): { x: number; y: number }[] {
  const sorted = [...locs].sort((a, b) => (a.date < b.date ? -1 : 1))
  const pts: { x: number; y: number }[] = []
  let last: { x: number; y: number } | null = null
  for (const l of sorted) {
    if (l.x === 0 && l.y === 0) continue
    if (last && Math.hypot(l.x - last.x, l.y - last.y) < 1) continue
    pts.push({ x: l.x, y: l.y })
    last = { x: l.x, y: l.y }
  }
  const MAX = 260
  if (pts.length <= MAX) return pts
  const step = pts.length / MAX
  const out: { x: number; y: number }[] = []
  for (let i = 0; i < MAX; i++) out.push(pts[Math.floor(i * step)])
  return out
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
  const { mode, config, sessionKey, lapWindow, activeView, reloadNonce } = opts

  const [snapshot, setSnapshot] = useState<RaceSnapshot | null>(null)
  const [connection, setConnection] = useState<Connection>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [replayState, setReplayState] = useState<Omit<ReplayControls, 'toggle' | 'setSpeed' | 'seek'> | null>(null)
  const [trackOutline, setTrackOutline] = useState<{ x: number; y: number }[] | null>(null)
  const [trackChannels, setTrackChannels] = useState<ChannelPoint[] | null>(null)

  const rawRef = useRef<RawData>(emptyRaw())
  const lapWindowRef = useRef(lapWindow)
  lapWindowRef.current = lapWindow
  const viewRef = useRef(activeView)
  viewRef.current = activeView

  // Replay clock + bookkeeping shared with the playback loop.
  const clock = useRef({ tNow: 0, tMin: 0, tMax: 1, raceEnd: 1, playing: true, speed: 6 })
  const dirty = useRef(false) // force a rebuild on the next tick (after a seek)
  const markersRef = useRef<LapMarker[]>([])

  useEffect(() => {
    if (rawRef.current.drivers.length && mode !== 'live') {
      setSnapshot(buildSnapshot(rawRef.current, lapWindow))
    }
  }, [lapWindow, mode])

  // ---- Replay controls (stable) ----
  const syncClock = useCallback(() => {
    const c = clock.current
    setReplayState({
      tMin: c.tMin,
      tMax: c.tMax,
      tNow: c.tNow,
      playing: c.playing,
      speed: c.speed,
      lapMarkers: markersRef.current,
    })
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
    setTrackOutline(null)
    setTrackChannels(simChannels())
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
    setTrackOutline(null)
    setTrackChannels(null)

    // Trace the circuit progressively from a single reference car's positions.
    let outlineRef: number | null = null
    const outlinePts: { x: number; y: number; date: string }[] = []

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
        if (location.length) {
          if (outlineRef == null) outlineRef = location[0].driver_number
          for (const l of location) {
            if (l.driver_number === outlineRef) outlinePts.push({ x: l.x, y: l.y, date: l.date })
          }
          if (outlinePts.length > 40) setTrackOutline(buildOutline(outlinePts))
        }
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
  }, [mode, config, sessionKey, reloadNonce])

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
    setTrackOutline(null)
    setTrackChannels(null)

    // Telemetry window cache.
    let winFrom = Infinity
    let winTo = -Infinity
    let fetchingTele = false
    let lastBuilt = -1
    let lastBuildWall = 0

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
      lastBuildWall = Date.now()
    }

    let clockId: ReturnType<typeof setInterval>

    const bootstrap = async () => {
      try {
        const sessions = await api.sessions(config, { session_key: sessionKey }, signal)
        const session: ApiSession | null = sessions.at(-1) ?? null
        if (!session) throw new Error('Session not found.')
        rawRef.current.session = session

        // Resilient: a single failing feed shouldn't blank the whole replay.
        const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[])
        const [drivers, meetings, intervals, positions, laps, stints, pits, rc, weather, radio, overtakes, grid, results] =
          await Promise.all([
            api.drivers(config, sessionKey, signal),
            safe(api.meetings(config, { meeting_key: session.meeting_key }, signal)),
            safe(api.intervals(config, sessionKey, signal)),
            safe(api.position(config, sessionKey, signal)),
            safe(api.laps(config, sessionKey, signal)),
            safe(api.stints(config, sessionKey, signal)),
            safe(api.pit(config, sessionKey, signal)),
            safe(api.raceControl(config, sessionKey, signal)),
            safe(api.weather(config, sessionKey, signal)),
            safe(api.teamRadio(config, sessionKey, signal)),
            safe(api.overtakes(config, sessionKey, signal)),
            safe(api.startingGrid(config, sessionKey, signal)),
            safe(api.sessionResult(config, sessionKey, signal)),
          ])
        if (cancelled) return
        const r = rawRef.current
        r.drivers = drivers as ApiDriver[]
        r.meeting = meetings.at(-1) ?? null
        r.intervals = intervals; r.positions = positions; r.laps = laps; r.stints = stints
        r.pits = pits; r.raceControl = rc; r.weather = weather; r.teamRadio = radio
        r.overtakes = overtakes; r.startingGrid = grid; r.results = results

        if (!r.drivers.length) throw new Error('No data returned for this session.')

        const bounds = rawTimeBounds(r)
        const endIso = Date.parse(session.date_end)
        // Guard against a degenerate timeline (no dated records): show the full
        // session statically rather than a frozen empty screen.
        const hasTimeline = bounds.max > bounds.min + 1000
        const raceEnd = Number.isFinite(endIso) ? Math.min(endIso, bounds.max) : bounds.max
        markersRef.current = buildLapMarkers(r)
        clock.current = {
          tMin: bounds.min,
          tMax: bounds.max,
          raceEnd,
          tNow: hasTimeline ? bounds.min : bounds.max,
          playing: hasTimeline,
          speed: 6,
        }
        syncClock()
        setConnection('replay')
        build()
        ensureTelemetry(sessionKey)

        // One-shot circuit outline: trace ~2.5 min of the winner's location
        // (a car guaranteed to have run a full lap) right after the start.
        const refDriver =
          results.find((x) => x.position === 1)?.driver_number ?? r.drivers[0]?.driver_number
        // Anchor the window to an early-but-green-flag lap of the reference car.
        // Anchoring to bounds.min lands in the pre-race/grid period where the
        // location feed reports (0,0) for every car.
        const refLaps = r.laps
          .filter((l) => l.driver_number === refDriver && l.date_start)
          .sort((a, b) => a.lap_number - b.lap_number)
        const anchorLap = refLaps.find((l) => l.lap_number >= 5) ?? refLaps[0]
        const anchor = anchorLap ? Date.parse(anchorLap.date_start!) : bounds.min
        if (refDriver != null && Number.isFinite(anchor)) {
          const oFrom = new Date(anchor).toISOString()
          const oTo = new Date(Math.min(bounds.max, anchor + 160000)).toISOString()
          Promise.all([
            api.location(config, sessionKey, oFrom, oTo, signal),
            api.carData(config, sessionKey, oFrom, oTo, signal).catch(() => [] as ApiCarData[]),
          ])
            .then(([locs, cars]) => {
              if (cancelled || signal.aborted) return
              const refLocs = locs.filter((l) => l.driver_number === refDriver)
              const pts = buildOutline(refLocs.length > 30 ? refLocs : locs)
              if (pts.length > 20) setTrackOutline(pts)
              const refCars = cars.filter((c) => c.driver_number === refDriver)
              if (refLocs.length > 30 && refCars.length > 30) {
                const ch = buildChannels(refLocs, refCars)
                if (ch.length > 20) setTrackChannels(ch)
              }
            })
            .catch(() => {})
        }

        clockId = setInterval(() => {
          const c = clock.current
          if (c.playing) {
            c.tNow = Math.min(c.tMax, c.tNow + CLOCK_INTERVAL * c.speed)
            if (c.tNow >= c.tMax) c.playing = false
            syncClock()
          }
          ensureTelemetry(sessionKey)
          // Rebuild immediately after a seek; otherwise throttle the heavy
          // filter+rebuild to ~3/s so playback stays smooth on tablets.
          if (dirty.current) {
            dirty.current = false
            build()
          } else if (c.playing && c.tNow !== lastBuilt && Date.now() - lastBuildWall >= 320) {
            build()
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
  }, [mode, config, sessionKey, syncClock, reloadNonce])

  const replay: ReplayControls | null = replayState
    ? { ...replayState, toggle, setSpeed, seek }
    : null

  return { snapshot, connection, error, lastUpdated, replay, trackOutline, trackChannels }
}

export { SPEEDS }
