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
// 'idle' loads nothing (used while the home screen is shown); 'live' loads and
// plays a session (a real live one, or a finished one via simLive).
export type DataMode = 'live' | 'idle'
export type Connection = 'idle' | 'connecting' | 'live' | 'replay' | 'error'
export type ActiveView =
  | 'timing'
  | 'map'
  | 'gap'
  | 'telemetry'
  | 'strategy'
  | 'pit'
  | 'control'
  | 'weather'

// Dev-only "simulated live": replay a finished session as if it were happening
// now. See docs/proposals/simlive.md. `startSec` is how far into the race the
// virtual clock begins; `speed` is how fast that virtual edge advances.
export interface SimLive {
  key: number
  speed: number
  startSec: number
}

export interface DataOptions {
  mode: DataMode
  config: OpenF1Config
  sessionKey: number | 'latest'
  lapWindow: number
  activeView: ActiveView
  reloadNonce: number
  simLive?: SimLive | null
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
  // Start of the formation/grid window (session start) when it sits before lap 1;
  // null if unknown. Everything tMin..formationStart is pre-race standing time,
  // formationStart..lap1 is the formation lap ("lap 0").
  formationStart: number | null
  // The session is still in progress, so the timeline keeps growing.
  live: boolean
  // Playback is pinned to the live edge (following new data as it arrives).
  atLive: boolean
  toggle: () => void
  setSpeed: (n: number) => void
  seek: (ms: number) => void
  // Jump to the live edge and follow it (the "● LIVE" button).
  goLive: () => void
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

const CLOCK_INTERVAL = 200 // replay tick
const TRACE_BACK_MS = 20000 // telemetry history fetched behind the clock
const LIVE_REFETCH_MS = 12000 // how often a live session pulls fresh data to extend the timeline
const LIVE_WINDOW_MS = 30 * 60 * 1000 // OpenF1 treats data as "live" until 30 min after a session ends
const AT_LIVE_MS = 5000 // within this of the edge counts as "at live"
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
  const { mode, config, sessionKey, lapWindow, activeView, reloadNonce, simLive } = opts

  const [snapshot, setSnapshot] = useState<RaceSnapshot | null>(null)
  const [connection, setConnection] = useState<Connection>('idle')
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [replayState, setReplayState] = useState<Omit<ReplayControls, 'toggle' | 'setSpeed' | 'seek' | 'goLive'> | null>(null)
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
  const formationStartRef = useRef<number | null>(null)
  const follow = useRef(false) // pinned to the live edge ("go live")
  const isLiveRef = useRef(false) // the loaded session is still in progress

  // A lap-window change should re-reveal the current moment immediately, even
  // when playback is paused; the clock loop rebuilds on the next tick.
  useEffect(() => {
    dirty.current = true
  }, [lapWindow])

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
      formationStart: formationStartRef.current,
      live: isLiveRef.current,
      atLive: follow.current || (isLiveRef.current && c.tNow >= c.tMax - AT_LIVE_MS),
    })
  }, [])

  const toggle = useCallback(() => {
    const c = clock.current
    // Restart from the beginning if we hit the end of a finished session.
    if (!c.playing && !isLiveRef.current && c.tNow >= c.tMax - 250) c.tNow = c.tMin
    c.playing = !c.playing
    // Pausing means you stop tracking the live edge.
    if (!c.playing) follow.current = false
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
      // Seeking drops you out of live-follow (you've gone back to catch up).
      follow.current = false
      c.tNow = Math.max(c.tMin, Math.min(c.tMax, ms))
      dirty.current = true
      syncClock()
    },
    [syncClock],
  )

  // Jump to the live edge and follow it as new data streams in.
  const goLive = useCallback(() => {
    const c = clock.current
    follow.current = true
    c.tNow = c.tMax
    c.playing = true
    c.speed = 1 // at the live edge you can only watch in real time
    dirty.current = true
    syncClock()
  }, [syncClock])

  // ---- Live / replay: load a session and play it through time ----
  // Whether you join an in-progress race or pick a past one, playback always
  // starts at the beginning and only ever reveals data up to the clock — so no
  // spoilers. A live session keeps re-fetching to extend the timeline, and the
  // "go live" control pins playback to the leading edge.
  useEffect(() => {
    if (mode !== 'live') return

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
    follow.current = false // default: watch from the beginning
    isLiveRef.current = false
    formationStartRef.current = null

    // Grid/formation starts at the session start, when it sits a sensible gap
    // before lap 1. (No "lap 0" exists in the feed, so we derive it.)
    const computeFormation = () => {
      const grid = Date.parse(rawRef.current.session?.date_start ?? '')
      const racing = markersRef.current[0]?.t
      formationStartRef.current =
        Number.isFinite(grid) && racing != null && grid > clock.current.tMin && grid < racing && racing - grid < 15 * 60 * 1000
          ? grid
          : null
    }

    let key = 0
    let gotOutline = false
    // Telemetry window cache.
    let winFrom = Infinity
    let winTo = -Infinity
    let fetchingTele = false
    let lastBuilt = -1
    let lastBuildWall = 0

    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[])

    const ensureTelemetry = (k: number) => {
      if (!TELEMETRY_VIEWS.includes(viewRef.current) || fetchingTele) return
      const c = clock.current
      if (c.tNow >= winFrom && c.tNow <= winTo - 3000) return // covered
      fetchingTele = true
      const span = Math.max(15000, c.speed * 4000)
      const from = new Date(c.tNow - TRACE_BACK_MS).toISOString()
      const to = new Date(c.tNow + span).toISOString()
      Promise.all([
        api.carData(config, k, from, to, signal).catch(() => []),
        api.location(config, k, from, to, signal).catch(() => []),
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

    // Pull every non-telemetry feed for the session into rawRef.
    const fetchBundle = async (k: number) => {
      const [intervals, positions, laps, stints, pits, rc, weather, radio, overtakes, grid, results] =
        await Promise.all([
          safe(api.intervals(config, k, signal)),
          safe(api.position(config, k, signal)),
          safe(api.laps(config, k, signal)),
          safe(api.stints(config, k, signal)),
          safe(api.pit(config, k, signal)),
          safe(api.raceControl(config, k, signal)),
          safe(api.weather(config, k, signal)),
          safe(api.teamRadio(config, k, signal)),
          safe(api.overtakes(config, k, signal)),
          safe(api.startingGrid(config, k, signal)),
          safe(api.sessionResult(config, k, signal)),
        ])
      if (cancelled) return
      const r = rawRef.current
      // A failed/transient feed comes back as [] (see `safe`). Don't let that
      // wipe good data on a live re-fetch — keep the previous values so the UI
      // doesn't blink empty and then refill. Race feeds only ever grow.
      const keep = <T,>(next: T[], prev: T[]) => (next.length ? next : prev)
      r.intervals = keep(intervals, r.intervals); r.positions = keep(positions, r.positions)
      r.laps = keep(laps, r.laps); r.stints = keep(stints, r.stints)
      r.pits = keep(pits, r.pits); r.raceControl = keep(rc, r.raceControl)
      r.weather = keep(weather, r.weather); r.teamRadio = keep(radio, r.teamRadio)
      r.overtakes = keep(overtakes, r.overtakes); r.startingGrid = keep(grid, r.startingGrid)
      r.results = keep(results, r.results)
    }

    // Best-effort one-shot circuit outline from an early green-flag lap. Retries
    // on the next live re-fetch if the early data wasn't usable yet.
    const maybeFetchOutline = (k: number) => {
      if (gotOutline) return
      const r = rawRef.current
      const refDriver =
        r.results.find((x) => x.position === 1)?.driver_number ?? r.drivers[0]?.driver_number
      const refLaps = r.laps
        .filter((l) => l.driver_number === refDriver && l.date_start)
        .sort((a, b) => a.lap_number - b.lap_number)
      const anchorLap = refLaps.find((l) => l.lap_number >= 5) ?? refLaps[0]
      if (refDriver == null || !anchorLap) return
      const anchor = Date.parse(anchorLap.date_start!)
      if (!Number.isFinite(anchor)) return
      gotOutline = true // claim it; release again on failure so a later pass retries
      const oFrom = new Date(anchor).toISOString()
      const oTo = new Date(anchor + 160000).toISOString()
      Promise.all([
        api.location(config, k, oFrom, oTo, signal),
        api.carData(config, k, oFrom, oTo, signal).catch(() => [] as ApiCarData[]),
      ])
        .then(([locs, cars]) => {
          if (cancelled || signal.aborted) return
          const refLocs = locs.filter((l) => l.driver_number === refDriver)
          const pts = buildOutline(refLocs.length > 30 ? refLocs : locs)
          if (pts.length > 20) setTrackOutline(pts)
          else gotOutline = false
          const refCars = cars.filter((c) => c.driver_number === refDriver)
          if (refLocs.length > 30 && refCars.length > 30) {
            const ch = buildChannels(refLocs, refCars)
            if (ch.length > 20) setTrackChannels(ch)
          }
        })
        .catch(() => {
          gotOutline = false
        })
    }

    // Extend the timeline end as new live data arrives (tMin / tNow untouched).
    const extendTimeline = () => {
      const r = rawRef.current
      const bounds = rawTimeBounds(r)
      const endIso = Date.parse(r.session?.date_end ?? '')
      const c = clock.current
      c.tMax = bounds.max
      c.raceEnd = Number.isFinite(endIso) ? Math.min(endIso, bounds.max) : bounds.max
      // Never replace existing lap markers with an empty set — a transient empty
      // feed would otherwise make the scrubber's lap ticks blink out and back.
      const m = buildLapMarkers(r)
      if (m.length || markersRef.current.length === 0) markersRef.current = m
      computeFormation()
    }

    let clockId: ReturnType<typeof setInterval>
    let liveId: ReturnType<typeof setInterval> | undefined

    const liveRefetch = async () => {
      if (cancelled) return
      try {
        await fetchBundle(key)
        if (cancelled) return
        extendTimeline()
        maybeFetchOutline(key)
        dirty.current = true
        syncClock()
      } catch {
        /* best effort */
      }
    }

    const bootstrap = async () => {
      try {
        const sessionParams: Record<string, string | number> =
          sessionKey === 'latest' ? { session_key: 'latest' } : { session_key: sessionKey }
        const sessions = await api.sessions(config, sessionParams, signal)
        const session: ApiSession | null = sessions.at(-1) ?? null
        if (!session) {
          throw new Error(sessionKey === 'latest' ? 'No live session found.' : 'Session not found.')
        }
        key = session.session_key
        rawRef.current.session = session

        const endMs = Date.parse(session.date_end)
        const isLive = simLive
          ? true
          : Number.isFinite(endMs) ? Date.now() < endMs + LIVE_WINDOW_MS : true
        isLiveRef.current = isLive

        const [drivers, meetings] = await Promise.all([
          api.drivers(config, key, signal),
          safe(api.meetings(config, { meeting_key: session.meeting_key }, signal)),
        ])
        if (cancelled) return
        rawRef.current.drivers = drivers as ApiDriver[]
        rawRef.current.meeting = meetings.at(-1) ?? null

        await fetchBundle(key)
        if (cancelled) return
        if (!rawRef.current.drivers.length) throw new Error('No data returned for this session.')

        const bounds = rawTimeBounds(rawRef.current)
        const endIso = Date.parse(session.date_end)
        // Guard against a degenerate timeline (no dated records): show the full
        // session statically rather than a frozen empty screen.
        const hasTimeline = bounds.max > bounds.min + 1000
        const raceEnd = Number.isFinite(endIso) ? Math.min(endIso, bounds.max) : bounds.max
        markersRef.current = buildLapMarkers(rawRef.current)

        // Simulated-live: a virtual "now" that advances in real time. tMax (the
        // watchable edge) tracks it; raceEnd stays the *real* finish so the final
        // classification can't leak when you reach the simulated edge.
        const realMax = bounds.max
        const mountedAt = Date.now()
        const vnow = () =>
          simLive ? bounds.min + simLive.startSec * 1000 + (Date.now() - mountedAt) * simLive.speed : realMax

        clock.current = {
          tMin: bounds.min,
          tMax: simLive ? Math.min(realMax, vnow()) : bounds.max,
          raceEnd,
          tNow: hasTimeline ? bounds.min : bounds.max, // start at the beginning
          playing: hasTimeline || isLive,
          speed: isLive ? 1 : 6, // live: watch in real time; past: fast replay
        }
        computeFormation()
        syncClock()
        setConnection(isLive ? 'live' : 'replay')
        build()
        ensureTelemetry(key)
        maybeFetchOutline(key)

        clockId = setInterval(() => {
          const c = clock.current
          // Simulated-live: advance the watchable edge with the virtual clock.
          if (simLive) {
            const edge = Math.min(realMax, vnow())
            if (edge !== c.tMax) {
              c.tMax = edge
              if (!c.playing && !follow.current) syncClock() // reflect a growing edge while paused/at start
            }
          }
          if (follow.current) {
            // Pinned to the live edge.
            if (c.tNow !== c.tMax) {
              c.tNow = c.tMax
              syncClock()
            }
          } else if (c.playing) {
            c.tNow = Math.min(c.tMax, c.tNow + CLOCK_INTERVAL * c.speed)
            if (c.tNow >= c.tMax) {
              if (isLiveRef.current) {
                follow.current = true // caught up → follow the live edge
                c.speed = 1 // and drop to real-time (can't outrun live)
              } else c.playing = false
            }
            syncClock()
          }
          ensureTelemetry(key)
          // Rebuild immediately after a seek; otherwise throttle the heavy
          // filter+rebuild to ~3/s so playback stays smooth on tablets.
          if (dirty.current) {
            dirty.current = false
            build()
          } else if ((c.playing || follow.current) && c.tNow !== lastBuilt && Date.now() - lastBuildWall >= 320) {
            build()
          }
        }, CLOCK_INTERVAL)

        // Keep a real in-progress session's timeline growing via re-fetch.
        // Simulated-live needs no network — all data is already loaded and the
        // tick advances the edge locally.
        if (isLive && !simLive) liveId = setInterval(liveRefetch, LIVE_REFETCH_MS)
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
      if (liveId) clearInterval(liveId)
    }
  }, [mode, config, sessionKey, syncClock, reloadNonce, simLive])

  const replay: ReplayControls | null = replayState
    ? { ...replayState, toggle, setSpeed, seek, goLive }
    : null

  return { snapshot, connection, error, lastUpdated, replay, trackOutline, trackChannels }
}

export { SPEEDS }
