import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import './styles/global.css'
import { ViewTabs } from './components/ViewTabs'
import { ReplayBar } from './components/ReplayBar'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TimingTower } from './components/TimingTower'
import { LapAnalysis } from './components/LapAnalysis'
import { Ticker } from './components/Ticker'
import { NoticeStack } from './components/NoticeStack'
import { LiveEntryChoice } from './components/LiveEntryChoice'
import { useRaceNotices } from './hooks/useRaceNotices'
import { DriverFocus } from './components/DriverFocus'
import { SettingsDrawer, type AppSettings } from './components/SettingsDrawer'
import { TrackMap } from './components/views/TrackMap'
import { SpeedMap } from './components/views/SpeedMap'
import { GapChart } from './components/views/GapChart'
import { Telemetry } from './components/views/Telemetry'
import { Strategy } from './components/views/Strategy'
import { RaceControlView } from './components/views/RaceControlView'
import { WeatherView } from './components/views/WeatherView'
import { useRaceData, type ActiveView, type SimLive } from './store/useRaceData'
import { defaultConfig } from './api/openf1'

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

interface Persisted {
  settings: AppSettings
  lapWindow: number
  selected: number[]
  activeView: ActiveView
}

const DEFAULTS: Persisted = {
  settings: { baseUrl: defaultConfig.baseUrl, apiKey: '', sessionKey: 'latest' },
  lapWindow: 6,
  selected: [],
  activeView: 'timing',
}

function loadState(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Persisted>) }
  } catch {
    /* ignore */
  }
  return DEFAULTS
}

export default function App() {
  const [initial] = useState(loadState)
  const [settings, setSettings] = useState<AppSettings>(initial.settings)
  const [lapWindow, setLapWindow] = useState(initial.lapWindow)
  const [selected, setSelected] = useState<Set<number>>(new Set(initial.selected))
  const [activeView, setActiveView] = useState<ActiveView>(initial.activeView)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [focusDriver, setFocusDriver] = useState<number | null>(null)
  // Spoiler-safe entry prompt for in-progress races (start-from-beginning vs live).
  const [liveChoiceOpen, setLiveChoiceOpen] = useState(false)
  const livePromptKey = useRef<string | null>(null)

  const config = useMemo(
    () => ({ baseUrl: settings.baseUrl, apiKey: settings.apiKey || undefined }),
    [settings.baseUrl, settings.apiKey],
  )
  const sessionKey = useMemo<number | 'latest'>(() => {
    if (settings.sessionKey === 'latest' || settings.sessionKey === '') return 'latest'
    const n = Number(settings.sessionKey)
    return Number.isFinite(n) ? n : 'latest'
  }, [settings.sessionKey])

  const simLive = useMemo(parseSimLive, [])

  const { snapshot, connection, error, replay, trackOutline, trackChannels } = useRaceData({
    mode: 'live',
    config,
    // simlive forces loading a specific session (overriding the configured one).
    sessionKey: simLive ? simLive.key : sessionKey,
    simLive,
    lapWindow,
    activeView,
    reloadNonce,
  })

  useEffect(() => {
    if (selected.size === 0 && snapshot && snapshot.drivers.length) {
      setSelected(new Set(snapshot.drivers.slice(0, 3).map((d) => d.driverNumber)))
    }
  }, [snapshot, selected.size])

  // Live alerts: fastest laps/sectors, race-control bulletins and team radios,
  // surfaced as a stacked, auto-dismissing popover. Reset per session.
  const { notices, dismiss } = useRaceNotices(snapshot, String(sessionKey))

  // When an in-progress race finishes loading, ask once how to start it. Default
  // is spoiler-free (the engine already begins at lights-out); jumping to live
  // is an explicit, separated choice. Keyed per load so it only asks once.
  const loadId = `${String(sessionKey)}:${reloadNonce}`
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
    const data: Persisted = { settings, lapWindow, selected: [...selected], activeView }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data))
    } catch {
      /* ignore */
    }
  }, [settings, lapWindow, selected, activeView])

  // Load a specific session picked from the browser: stash its key and the
  // store loads/replays it.
  const loadSession = (key: number) => {
    setSettings((s) => ({ ...s, sessionKey: String(key) }))
  }

  const toggleFocus = (n: number) => setFocusDriver((prev) => (prev === n ? null : n))

  const toggleDriver = (n: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })

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
                  {typeof sessionKey === 'number'
                    ? 'Loading session — fetching the full race…'
                    : connection === 'connecting'
                      ? 'Connecting to the timing feed…'
                      : 'Waiting for session data…'}
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
          <div className={`body ${focusDriver != null ? 'with-focus' : ''}`}>
            <div className="col">
              <TimingTower
                drivers={snapshot.drivers}
                fastestDriver={snapshot.fastestLap?.driverNumber ?? null}
                focused={focusDriver}
                onFocus={toggleFocus}
              />
            </div>
            <div className="col">
              <LapAnalysis
                drivers={snapshot.drivers}
                selected={selected}
                onToggle={toggleDriver}
                lapWindow={lapWindow}
                onWindow={setLapWindow}
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
            <TrackMap cars={snapshot.trackMap} outline={trackOutline} />
          </div>
        )
      case 'speedmap':
        return (
          <div className="viewbody">
            <SpeedMap channels={trackChannels} />
          </div>
        )
      case 'gap':
        return (
          <div className="viewbody">
            <GapChart
              drivers={snapshot.drivers}
              raceControl={snapshot.raceControlLog}
              meetingName={snapshot.race.meetingName}
              sessionName={snapshot.race.sessionName}
              year={snapshot.race.year}
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
            />
          </div>
        )
      case 'strategy':
        return (
          <div className="viewbody">
            <Strategy
              stints={snapshot.stints}
              pitLog={snapshot.pitLog}
              grid={snapshot.grid}
              results={snapshot.results}
              currentLap={snapshot.race.currentLap}
              finished={snapshot.race.finished}
            />
          </div>
        )
      case 'control':
        return (
          <div className="viewbody">
            <RaceControlView log={snapshot.raceControlLog} overtakes={snapshot.overtakes} radios={snapshot.radios} />
          </div>
        )
      case 'weather':
        return (
          <div className="viewbody">
            <WeatherView current={snapshot.race.weather} history={snapshot.weatherHistory} />
          </div>
        )
    }
  }

  return (
    <div className="app">
      <div className="fx-grid" />

      <ViewTabs
        active={activeView}
        onChange={setActiveView}
        connection={connection}
        status={snapshot?.race.status ?? 'UNKNOWN'}
        onSettings={() => setSettingsOpen(true)}
      />

      {replay && <ReplayBar replay={replay} currentLap={snapshot?.race.currentLap ?? null} />}

      <ErrorBoundary key={activeView} label="This view hit an error">
        {renderView()}
      </ErrorBoundary>

      <Ticker race={snapshot?.race} />

      <NoticeStack notices={notices} onDismiss={dismiss} />

      <SettingsDrawer
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onApply={setSettings}
        config={config}
        sessionKey={sessionKey}
        activeLabel={
          typeof sessionKey === 'number' && snapshot?.race
            ? `${snapshot.race.meetingName || snapshot.race.circuit} · ${snapshot.race.sessionName}`
            : null
        }
        onLoadSession={loadSession}
      />

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
    </div>
  )
}
