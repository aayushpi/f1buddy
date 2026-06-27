import { useState } from 'react'
import { redeem } from '../utils/access'

interface Props {
  // Called once a valid key is redeemed.
  onUnlock: () => void
  // Called to back out without unlocking.
  onCancel: () => void
}

// Where donors / subscribers send proof and receive a key back.
const CONTACT = 'xoxo@aayush.fyi'
const KOFI_URL = 'https://ko-fi.com/aayushpi'
const TRANS_LIFELINE_URL = 'https://translifeline.org/donate/'
const MECA_URL = 'https://secure.everyaction.com/X61pOYGcOUiGoTfHn7p1uQ2'

/**
 * The access gate shown when someone opens a recent session (the latest two race
 * weekends) without a current unlock. Two ways in: donate $30 to Trans Lifeline
 * or the Middle East Children's Alliance, or chip in on Ko-fi — email proof
 * either way and a one-off access key comes back, entered here.
 */
export function Paywall({ onUnlock, onCancel }: Props) {
  const [key, setKey] = useState('')
  const [status, setStatus] = useState<'idle' | 'checking' | 'bad'>('idle')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!key.trim()) return
    setStatus('checking')
    if (await redeem(key)) onUnlock()
    else setStatus('bad')
  }

  return (
    <div className="paywall">
      <div className="home-grid" />
      <div className="paywall-card">
        <h1 className="paywall-title">Two ways in</h1>
        <p className="paywall-lede">
          Live timing for the latest two race weekends is for supporters. Historical sessions are
          still free.
        </p>

        <div className="paywall-options">
          <div className="paywall-opt">
            <span className="paywall-opt-amt">$30 donation</span>
            <span className="paywall-opt-desc">Donate to either, then send me the receipt:</span>
            <div className="paywall-logos">
              <div className="paywall-donor">
                <a
                  className="paywall-logo"
                  href={TRANS_LIFELINE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Donate to Trans Lifeline"
                >
                  <img src="/logos/trans-lifeline.png" alt="Trans Lifeline" />
                </a>
                <a className="paywall-donor-link" href={TRANS_LIFELINE_URL} target="_blank" rel="noopener noreferrer">
                  Trans Lifeline →
                </a>
              </div>
              <div className="paywall-donor">
                <a
                  className="paywall-logo light"
                  href={MECA_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Donate to the Middle East Children's Alliance"
                >
                  <img src="/logos/meca.jpg" alt="Middle East Children's Alliance" />
                </a>
                <a className="paywall-donor-link" href={MECA_URL} target="_blank" rel="noopener noreferrer">
                  Middle East Children’s Alliance →
                </a>
              </div>
            </div>
          </div>

          <div className="paywall-or">or</div>

          <div className="paywall-opt">
            <span className="paywall-opt-amt">Throw me a few bucks</span>
            <a className="paywall-cta" href={KOFI_URL} target="_blank" rel="noopener noreferrer">
              Support →
            </a>
          </div>
        </div>

        <p className="paywall-contact">
          Then email <a href={`mailto:${CONTACT}`}>{CONTACT}</a> (your Ko-fi name or the receipt) and
          I’ll reply with a key.
        </p>

        <form className="paywall-form" onSubmit={submit}>
          <input
            className="paywall-input"
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              if (status === 'bad') setStatus('idle')
            }}
            placeholder="Enter your access key here"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            aria-label="Access key"
          />
          <button className="paywall-go" type="submit" disabled={status === 'checking' || !key.trim()}>
            {status === 'checking' ? 'Checking…' : 'Unlock'}
          </button>
        </form>
        {status === 'bad' && <div className="paywall-err">That key wasn’t recognised — check for typos.</div>}

        <button className="paywall-back" onClick={onCancel}>
          ‹ Back — browse free sessions
        </button>
      </div>
    </div>
  )
}
