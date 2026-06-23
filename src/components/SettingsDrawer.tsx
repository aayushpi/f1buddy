import { useState } from 'react'
import { motion } from 'framer-motion'

export interface AppSettings {
  baseUrl: string
  apiKey: string
  sessionKey: string // "latest" or a numeric session_key (set by the home screen)
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
          <label>API Base URL</label>
          <input value={draft.baseUrl} onChange={(e) => set({ baseUrl: e.target.value.trim() })} />
          <span className="hint">
            Default routes through the bundled proxy in production and OpenF1 directly in local dev.
          </span>
        </div>

        <div className="field">
          <label>API Key (optional)</label>
          <input
            value={draft.apiKey}
            placeholder="Bearer token for real-time access"
            onChange={(e) => set({ apiKey: e.target.value.trim() })}
          />
          <span className="hint">
            Live deployments keep the key server-side; this is only a local override, sent as a
            Bearer token.
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
