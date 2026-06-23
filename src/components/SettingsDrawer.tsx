import { useState } from 'react'
import { motion } from 'framer-motion'
import type { OpenF1Config } from '../api/openf1'
import { SessionBrowser } from './SessionBrowser'

export interface AppSettings {
  baseUrl: string
  apiKey: string
  sessionKey: string // "latest" or a numeric session_key
}

interface Props {
  open: boolean
  settings: AppSettings
  onClose: () => void
  onApply: (s: AppSettings) => void
  config: OpenF1Config
  sessionKey: number | 'latest'
  activeLabel: string | null
  onLoadSession: (key: number) => void
}

export function SettingsDrawer({
  open,
  settings,
  onClose,
  onApply,
  config,
  sessionKey,
  activeLabel,
  onLoadSession,
}: Props) {
  const [draft, setDraft] = useState<AppSettings>(settings)
  if (!open) return null

  const set = (patch: Partial<AppSettings>) => setDraft((d) => ({ ...d, ...patch }))

  // Close the drawer once a race is picked so the replay is visible immediately.
  const loadSession = (key: number) => {
    onLoadSession(key)
    onClose()
  }

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <motion.div
        className="drawer"
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      >
        <h2>Load a race</h2>

        <div className="field">
          <label>Grand Prix</label>
          <SessionBrowser
            config={config}
            currentSessionKey={sessionKey}
            activeLabel={activeLabel}
            onLoad={loadSession}
          />
          <span className="hint">Browse and replay any past Grand Prix session.</span>
        </div>

        <h2>Data Source</h2>

        <div className="field">
          <label>Session</label>
          <input
            value={draft.sessionKey}
            placeholder="latest"
            onChange={(e) => set({ sessionKey: e.target.value.trim() })}
          />
          <span className="hint">
            Use <b>latest</b> for the session currently in progress, or paste a specific OpenF1{' '}
            <b>session_key</b> to replay a past race.
          </span>
        </div>

        <div className="field">
          <label>API Base URL</label>
          <input value={draft.baseUrl} onChange={(e) => set({ baseUrl: e.target.value.trim() })} />
          <span className="hint">Default: https://api.openf1.org/v1</span>
        </div>

        <div className="field">
          <label>API Key (optional)</label>
          <input
            value={draft.apiKey}
            placeholder="Bearer token for real-time access"
            onChange={(e) => set({ apiKey: e.target.value.trim() })}
          />
          <span className="hint">
            OpenF1 serves free historical data (2023+). True real-time timing requires a paid key —
            add it here and it is sent as a Bearer token.
          </span>
        </div>

        <button
          className="primary"
          onClick={() => {
            onApply(draft)
            onClose()
          }}
        >
          Apply
        </button>
      </motion.div>
    </>
  )
}
