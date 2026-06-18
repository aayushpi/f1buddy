import { useEffect, useMemo, useState } from 'react'
import './styles/global.css'
import { Header } from './components/Header'
import { ViewTabs } from './components/ViewTabs'
import { ReplayBar } from './components/ReplayBar'
import { TimingTower } from './components/TimingTower'
import { LapAnalysis } from './components/LapAnalysis'
import { Ticker } from './components/Ticker'
import { SettingsDrawer, type AppSettings } from './components/SettingsDrawer'
import { TrackMap } from './components/views/TrackMap'
import { Telemetry } from './components/views/Telemetry'
import { Strategy } from './components/views/Strategy'
import { RaceControlView } from './components/views/RaceControlView'
import { WeatherView } from './components/views/WeatherView'
import { useRaceData, type ActiveView, type DataMode } from './store/useRaceData'

const LS_KEY = 'f1buddy.state.v2'

interface Persisted {
  mode: DataMode
  settings: AppSettings
  lapWindow: number
  selected: number[]
  activeView: ActiveView
}

const DEFAULTS: Persisted = {
  mode: 'sim',
  settings: { baseUrl: 'https://api.openf1.org/v1', apiKey: '', sessionKey: 'latest' },
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
  const [mode, setMode] = useState<DataMode>(initial.mode)
  const [settings, setSettings] = useState<AppSettings>(initial.settings)
  const [lapWindow, setLapWindow] = useState(initial.lapWindow)
  const [selected, setSelected] = useState<Set<number>>(new Set(initial.selected))
  const [activeView, setActiveView] = useState<ActiveView>(initial.activeView)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const config = useMemo(
    () => ({ baseUrl: settings.baseUrl, apiKey: settings.apiKey || undefined }),
    [settings.baseUrl, settings.apiKey],
  )
  const sessionKey = useMemo<number | 'latest'>(() => {
    if (settings.sessionKey === 'latest' || settings.sessionKey === '') return 'latest'
    const n = Number(settings.sessionKey)
    return Number.isFinite(n) ? n : 'latest'
  }, [settings.sessionKey])

  const { snapshot, connection, error, replay } = useRaceData({
    mode,
    config,
    sessionKey,
    lapWindow,
    activeView,
  })

  useEffect(() => {
    if (selected.size === 0 && snapshot && snapshot.drivers.length) {
      setSelected(new Set(snapshot.drivers.slice(0, 3).map((d) => d.driverNumber)))
    }
  }, [snapshot, selected.size])

  useEffect(() => {
    const data: Persisted = { mode, settings, lapWindow, selected: [...selected], activeView }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data))
    } catch {
      /* ignore */
    }
  }, [mode, settings, lapWindow, selected, activeView])

  // Load a specific historical session picked from the browser: stash its key
  // and switch to Live so the polling store replays it.
  const loadSession = (key: number) => {
    setSettings((s) => ({ ...s, sessionKey: String(key) }))
    setMode('live')
  }

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
                <div className="big">Could not reach the timing feed</div>
                <div style={{ maxWidth: 460, lineHeight: 1.5 }}>{error}</div>
                <div>Switch to Demo mode, or check the data source in settings.</div>
              </>
            ) : (
              <>
                <div className="spinner" />
                <div className="big">
                  {connection === 'connecting' ? 'Connecting to the timing feed…' : 'Waiting for session data…'}
                </div>
                <div>If no race is live, switch to Demo mode to explore every feature.</div>
              </>
            )}
          </div>
        </div>
      )
    }

    switch (activeView) {
      case 'timing':
        return (
          <div className="body">
            <div className="col">
              <TimingTower drivers={snapshot.drivers} fastestDriver={snapshot.fastestLap?.driverNumber ?? null} />
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
          </div>
        )
      case 'map':
        return (
          <div className="viewbody">
            <TrackMap cars={snapshot.trackMap} showOutline={mode === 'sim'} />
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

      <Header
        snapshot={snapshot}
        mode={mode}
        onMode={setMode}
        connection={connection}
        onSettings={() => setSettingsOpen(true)}
        config={config}
        sessionKey={sessionKey}
        onLoadSession={loadSession}
      />

      <ViewTabs active={activeView} onChange={setActiveView} />

      {replay && <ReplayBar replay={replay} currentLap={snapshot?.race.currentLap ?? null} />}

      {renderView()}

      <Ticker race={snapshot?.race} />

      <SettingsDrawer
        open={settingsOpen}
        settings={settings}
        onClose={() => setSettingsOpen(false)}
        onApply={setSettings}
      />
    </div>
  )
}
