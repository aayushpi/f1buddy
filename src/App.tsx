import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { Analytics } from '@vercel/analytics/react'
import './styles/global.css'
import { ViewTabs } from './components/ViewTabs'
import { ReplayBar } from './components/ReplayBar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TimingTower } from './components/TimingTower'
import { Ticker } from './components/Ticker'
import { NoticeStack } from './components/NoticeStack'
import { LiveEntryChoice } from './components/LiveEntryChoice'
import { Home } from './components/Home'
import { useRaceNotices } from './hooks/useRaceNotices'
import { DriverFocus } from './components/DriverFocus'
import type { AppSettings } from './components/SettingsDrawer'
import { TrackMap } from './components/views/TrackMap'
import { GapChart } from './components/views/GapChart'
import { Telemetry } from './components/views/Telemetry'
import { StrategySection } from './components/views/StrategySection'
import { RaceControlView } from './components/views/RaceControlView'
import { TrackStatus } from './components/TrackStatus'
import { useRaceData, type ActiveView, type SimLive } from './store/useRaceData'
import { defaultConfig } from './api/openf1'
import { pitLossFor } from './data/pitTimes'

// Dev rehearsal: ?simlive=<session_key>[&simspeed=N][&simstart=seconds] replays a
// finished race as if it were live. See docs/proposals/simlive.md.
function parseSimLive(): SimLive | null {
  if (typeof window === 'undefined') return null
  const p = new URLSearchParams(window.location.search)
  const key = Number(p.get('simlive'))
  if (!Number.isFinite(key) || key <= 0) return null
  const speed = Math.max(1, Number(p.get('simspeed')) || 1)
  const startRaw = p.get('simstart')
  const startSec = startRaw != null ? Math.max(0, Number(startRaw) || 0) : 1500
  return { key, speed, startSec }
}

const LS_KEY = 'f1buddy.state.v2'

// The API base URL / key are NOT persisted: they come from the build/env
// default every load, so a value saved by an older build can't mask the current
// one (which previously made the app "work on one device, break on another").
interface Persisted {
  lapWindow: number
  selected: number[]
  activeView: ActiveView
  // Drivers opted into race-control + radio popups (a stable per-season pref).
  notify: number[]
  // Critical track-wide bulletins (flags / safety car) pop up. On by default.
  trackAlerts: boolean
}

const DEFAULTS: Persisted = {
  lapWindow: 6,
  selected: [],
  activeView: 'timing',
  notify: [],
  trackAlerts: true,
}

function loadState(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const merged = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>) }
      // Pit Simulator is now a sub-tab of Strategy — migrate any saved 'pit' view.
      if ((merged.activeView as string) === 'pit') merged.activeView = 'strategy'
      return merged
    }
  } catch {
    /* ignore */
  }
  return DEFAULTS
}

export default function App() {
  const [initial] = useState(loadState)
  // Data source is fixed to the build/env default (the same-origin proxy in
  // production). There's no in-app override now that the settings drawer is gone.
  const settings: AppSettings = { baseUrl: defaultConfig.baseUrl, apiKey: '', sessionKey: 'latest' }
  const [lapWindow, setLapWindow] = useState(initial.lapWindow)
  const [selected, setSelected] = useState<Set<number>>(new Set(initial.selected))
  // Gap-to-Leader visibility (its own set; defaults to the top 5 per session).
  const [gapSelected, setGapSelected] = useState<Set<number>>(new Set())
  // Drivers the user wants race-control + radio popups for.
  const [notify, setNotify] = useState<Set<number>>(new Set(initial.notify))
  // Critical track-wide bulletins (flags / safety car) popups, on by default.
  const [trackAlerts, setTrackAlerts] = useState(initial.trackAlerts)
  const [activeView, setActiveView] = useState<ActiveView>(initial.activeView)
  const gapSeeded = useRef<string | null>(null)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [focusDriver, setFocusDriver] = useState<number | null>(null)
  // Spoiler-safe entry prompt for in-progress races (start-from-beginning vs live).
  const [liveChoiceOpen, setLiveChoiceOpen] = useState(false)
  const livePromptKey = useRef<string | null>(null)

  // What the user picked on the home screen. null ⇒ show the landing page.
  //  - mode 'live': a session in progress → real-time, re-fetching live mode.
  //  - mode 'past': a finished session → a full replay (whole timeline available).
  //    `simulate` opts that past session into the as-if-live engine instead
  //    (a real-time growing edge), for testing the live flow.
  const simLiveUrl = useMemo(parseSimLive, [])
  const [selection, setSelection] = useState<
    { mode: 'live' | 'past'; sessionKey: number; simulate: boolean } | null
  >(() => (simLiveUrl ? { mode: 'past', sessionKey: simLiveUrl.key, simulate: true } : null))

  const config = useMemo(
    () => ({ baseUrl: settings.baseUrl, apiKey: settings.apiKey || undefined }),
    [settings.baseUrl, settings.apiKey],
  )

  // simLive is engaged only when a past session opts into "simulate live".
  // The ?simlive= URL keeps its own speed/start for mid-week rehearsal.
  const simLive = useMemo<SimLive | null>(() => {
    if (!selection || !selection.simulate) return null
    if (simLiveUrl && simLiveUrl.key === selection.sessionKey) return simLiveUrl
    return { key: selection.sessionKey, startSec: 0, speed: 1 }
  }, [selection, simLiveUrl])

  const { snapshot, connection, error, replay, trackOutline } = useRaceData({
    mode: selection ? 'live' : 'idle',
    config,
    sessionKey: selection ? selection.sessionKey : 'latest',
    simLive,
    lapWindow,
    activeView,
    reloadNonce,
  })

  const goHome = () => {
    setSelection(null)
    setLiveChoiceOpen(false)
    setFocusDriver(null)
  }

  useEffect(() => {
    if (selected.size === 0 && snapshot && snapshot.drivers.length) {
      setSelected(new Set(snapshot.drivers.slice(0, 3).map((d) => d.driverNumber)))
    }
  }, [snapshot, selected.size])

  const sessionId = selection
    ? `${selection.mode}:${selection.sessionKey}:${selection.simulate}`
    : 'home'

  // Seed the Gap-to-Leader view with the top 5 once per session, then leave it
  // entirely under user control (they can toggle any driver, including to none).
  useEffect(() => {
    if (snapshot && snapshot.drivers.length && gapSeeded.current !== sessionId) {
      gapSeeded.current = sessionId
      setGapSelected(new Set(snapshot.drivers.slice(0, 5).map((d) => d.driverNumber)))
    }
  }, [snapshot, sessionId])

  // Live alerts: fastest laps/sectors always; race-control + radio popups only
  // for drivers the user opted into. The full record stays in the Race Control
  // tab. Reset per session.
  const { notices, dismiss } = useRaceNotices(snapshot, sessionId, notify, trackAlerts)

  // When an in-progress race finishes loading, ask once how to start it. Default
  // is spoiler-free (the engine already begins at lights-out); jumping to live
  // is an explicit, separated choice. Keyed per load so it only asks once.
  const loadId = `${sessionId}:${reloadNonce}`
  const isLive = replay?.live ?? false
  const ready = !!snapshot && snapshot.drivers.length > 0
  useEffect(() => {
    if (isLive && ready && livePromptKey.current !== loadId) {
      livePromptKey.current = loadId
      setLiveChoiceOpen(true)
    }
  }, [isLive, ready, loadId])

  const watchFromStart = () => {
    replay?.seek(replay.tMin) // guarantee the very beginning, however long the prompt was up
    setLiveChoiceOpen(false)
  }
  const jumpToLive = () => {
    replay?.goLive()
    setLiveChoiceOpen(false)
  }

  useEffect(() => {
    const data: Persisted = { lapWindow, selected: [...selected], activeView, notify: [...notify], trackAlerts }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data))
    } catch {
      /* ignore */
    }
  }, [lapWindow, selected, activeView, notify, trackAlerts])

  // Keep the screen awake while the app is open — it's meant to sit on an iPad
  // through a whole session. The browser drops the lock on tab-switch / sleep,
  // so we re-acquire it whenever the tab returns to the foreground.
  useEffect(() => {
    interface WakeLockSentinelLike { release: () => Promise<void> }
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
    }
    if (!nav.wakeLock) return
    let lock: WakeLockSentinelLike | null = null
    let cancelled = false
    const acquire = async () => {
      try {
        lock = await nav.wakeLock!.request('screen')
      } catch {
        /* needs a user gesture or unsupported — ignore */
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) acquire()
    }
    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      lock?.release().catch(() => {})
    }
  }, [])

  const toggleFocus = (n: number) => setFocusDriver((prev) => (prev === n ? null : n))

  const toggleIn = (set: (fn: (prev: Set<number>) => Set<number>) => void) => (n: number) =>
    set((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })

  const toggleDriver = toggleIn(setSelected)
  const toggleGap = toggleIn(setGapSelected)
  const toggleNotify = toggleIn(setNotify)

  const hasData = !!snapshot && snapshot.drivers.length > 0

  const renderView = () => {
    if (!hasData || !snapshot) {
      return (
        <div className="panel" style={{ gridColumn: '1 / -1', display: 'flex', flex: 1 }}>
          <div className="empty-state">
            {connection === 'error' ? (
              <>
                <div className="big">Could not load this session</div>
                <div style={{ maxWidth: 480, lineHeight: 1.5 }}>{error}</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button className="es-btn primary" onClick={() => setReloadNonce((n) => n + 1)}>
                    Retry
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="spinner" />
                <div className="big">
                  {selection?.mode === 'live'
                    ? connection === 'connecting'
                      ? 'Connecting to the timing feed…'
                      : 'Waiting for session data…'
                    : 'Loading session — fetching the full race…'}
                </div>
              </>
            )}
          </div>
        </div>
      )
    }

    switch (activeView) {
      case 'timing':
        return (
          <div className={`body single ${focusDriver != null ? 'with-focus' : ''}`}>
            <div className="col">
              <TimingTower
                drivers={snapshot.drivers}
                fastestDriver={snapshot.fastestLap?.driverNumber ?? null}
                focused={focusDriver}
                onFocus={toggleFocus}
              />
            </div>
            <AnimatePresence>
              {focusDriver != null && (
                <DriverFocus
                  key={focusDriver}
                  drivers={snapshot.drivers}
                  focused={focusDriver}
                  onClose={() => setFocusDriver(null)}
                />
              )}
            </AnimatePresence>
          </div>
        )
      case 'map':
        return (
          <div className="viewbody">
            <TrackMap
              cars={snapshot.trackMap}
              outline={trackOutline}
              circuit={[snapshot.race.circuit, snapshot.race.countryName, snapshot.race.meetingName]}
            />
          </div>
        )
      case 'gap':
        return (
          <div className="viewbody">
            <GapChart
              drivers={snapshot.drivers}
              selected={gapSelected}
              onToggle={toggleGap}
              raceControl={snapshot.raceControlLog}
            />
          </div>
        )
      case 'telemetry':
        return (
          <div className="viewbody">
            <Telemetry
              drivers={snapshot.drivers}
              telemetry={snapshot.telemetry}
              selected={selected}
              onToggle={toggleDriver}
              lapWindow={lapWindow}
              onWindow={setLapWindow}
            />
          </div>
        )
      case 'strategy':
        return (
          <div className="viewbody">
            <StrategySection
              stints={snapshot.stints}
              pitLog={snapshot.pitLog}
              results={snapshot.results}
              currentLap={snapshot.race.currentLap}
              finished={snapshot.race.finished}
              drivers={snapshot.drivers}
              pitLoss={pitLossFor(snapshot.race.circuit, snapshot.race.countryName, snapshot.race.meetingName)}
              circuit={snapshot.race.meetingName || snapshot.race.circuit}
            />
          </div>
        )
      case 'control':
        return (
          <div className="viewbody">
            <RaceControlView
              log={snapshot.raceControlLog}
              radios={snapshot.radios}
              drivers={snapshot.drivers}
              notify={notify}
              onToggleNotify={toggleNotify}
              trackAlerts={trackAlerts}
              onToggleTrackAlerts={() => setTrackAlerts((v) => !v)}
              weather={snapshot.race.weather}
              weatherHistory={snapshot.weatherHistory}
            />
          </div>
        )
    }
  }

  // No session picked yet → the landing page (countdown / live / load past).
  if (!selection) {
    return (
      <>
        <Home
          config={config}
          onEnterLive={(key) => setSelection({ mode: 'live', sessionKey: key, simulate: false })}
          onReplay={(key, simulate) => setSelection({ mode: 'past', sessionKey: key, simulate })}
        />
        <Analytics />
      </>
    )
  }

  return (
    <div className="app">
      <div className="fx-grid" />

      <ViewTabs
        active={activeView}
        onChange={setActiveView}
        onHome={goHome}
      />

      {replay && <ReplayBar replay={replay} currentLap={snapshot?.race.currentLap ?? null} />}

      <ErrorBoundary key={activeView} label="This view hit an error">
        {renderView()}
      </ErrorBoundary>

      <Ticker race={snapshot?.race} />

      <TrackStatus status={snapshot?.race.status ?? 'UNKNOWN'} connection={connection} />

      <NoticeStack notices={notices} onDismiss={dismiss} />

      {liveChoiceOpen && replay?.live && (
        <LiveEntryChoice
          label={
            snapshot?.race
              ? `${snapshot.race.meetingName || snapshot.race.circuit} · ${snapshot.race.sessionName}`
              : null
          }
          onWatchFromStart={watchFromStart}
          onJumpToLive={jumpToLive}
        />
      )}

      <Analytics />
    </div>
  )
}
