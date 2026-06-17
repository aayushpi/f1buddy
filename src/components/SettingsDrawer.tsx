import { useState } from 'react'
import { motion } from 'framer-motion'

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
}

export function SettingsDrawer({ open, settings, onClose, onApply }: Props) {
  const [draft, setDraft] = useState<AppSettings>(settings)
  if (!open) return null

  const set = (patch: Partial<AppSettings>) => setDraft((d) => ({ ...d, ...patch }))

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <motion.div
        className="drawer"
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 420, damping: 38 }}
      >
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
            add it here and it is sent as a Bearer token. Demo mode needs no connection.
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
