import { useEffect, useMemo, useState } from 'react'
import './styles/global.css'
import { Header } from './components/Header'
import { TimingTower } from './components/TimingTower'
import { LapAnalysis } from './components/LapAnalysis'
import { Ticker } from './components/Ticker'
import { SettingsDrawer, type AppSettings } from './components/SettingsDrawer'
import { useRaceData, type DataMode } from './store/useRaceData'

const LS_KEY = 'f1buddy.state.v1'

interface Persisted {
  mode: DataMode
  settings: AppSettings
  lapWindow: number
  selected: number[]
}

const DEFAULTS: Persisted = {
  mode: 'sim',
  settings: { baseUrl: 'https://api.openf1.org/v1', apiKey: '', sessionKey: 'latest' },
  lapWindow: 6,
  selected: [],
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

  const { snapshot, connection, error } = useRaceData({ mode, config, sessionKey, lapWindow })

  // Default the comparison set to the current top 3 once data arrives.
  useEffect(() => {
    if (selected.size === 0 && snapshot && snapshot.drivers.length) {
      setSelected(new Set(snapshot.drivers.slice(0, 3).map((d) => d.driverNumber)))
    }
  }, [snapshot, selected.size])

  // Persist UI state.
  useEffect(() => {
    const data: Persisted = { mode, settings, lapWindow, selected: [...selected] }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(data))
    } catch {
      /* ignore */
    }
  }, [mode, settings, lapWindow, selected])

  const toggleDriver = (n: number) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })

  const hasData = !!snapshot && snapshot.drivers.length > 0

  return (
    <div className="app">
      <div className="fx-grid" />

      <Header
        snapshot={snapshot}
        mode={mode}
        onMode={setMode}
        connection={connection}
        onSettings={() => setSettingsOpen(true)}
      />

      <div className="body">
        {hasData ? (
          <>
            <div className="col">
              <TimingTower
                drivers={snapshot!.drivers}
                fastestDriver={snapshot!.fastestLap?.driverNumber ?? null}
              />
            </div>
            <div className="col">
              <LapAnalysis
                drivers={snapshot!.drivers}
                selected={selected}
                onToggle={toggleDriver}
                lapWindow={lapWindow}
                onWindow={setLapWindow}
              />
            </div>
          </>
        ) : (
          <div className="panel" style={{ gridColumn: '1 / -1', display: 'flex' }}>
            <div className="empty-state">
              {connection === 'error' ? (
                <>
                  <div className="big">Could not reach the timing feed</div>
                  <div style={{ maxWidth: 460, lineHeight: 1.5 }}>{error}</div>
                  <div>Switch to Demo mode, or check the data source in settings.</div>
                </>
              ) : connection === 'connecting' ? (
                <>
                  <div className="spinner" />
                  <div className="big">Connecting to the timing feed…</div>
                </>
              ) : (
                <>
                  <div className="spinner" />
                  <div className="big">Waiting for session data…</div>
                  <div>If no race is live, switch to Demo mode to explore the dashboard.</div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

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
