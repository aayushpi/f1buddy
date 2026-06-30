import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { OpenF1Config } from '../api/openf1'
import { useCalendar } from '../hooks/useCalendar'
import { SessionPicker } from './SessionPicker'
import { Paywall } from './Paywall'
import { isUnlocked } from '../utils/access'
import { CardiogramMark, CG_HERO_PATH } from './Brand'
import { findCircuit, type CircuitPt } from '../data/circuits'

interface Props {
  config: OpenF1Config
  onEnterLive: (sessionKey: number) => void
  // simulate=true replays the session as if live; false loads the full race.
  onReplay: (sessionKey: number, simulate: boolean) => void
}

// "2d 04:11:09" / "04:11:09" / "11:09" — the largest non-zero unit leads.
function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00'
  const total = Math.floor(ms / 1000)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (d > 0) return `${d}d ${pad(h)}:${pad(m)}:${pad(s)}`
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

function whenLabel(start: number): string {
  return new Date(start).toLocaleString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type Mode = 'live' | 'next' | 'off' | 'loading' | 'error'

/** The hero ECG trace — colour + a travelling glow dot vary by state. */
function HeroTrace({ mode }: { mode: Mode }) {
  if (mode === 'error') {
    // A broken red trace — signal lost.
    return (
      <svg className="hero-trace" viewBox="0 0 800 200" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,120 H322" fill="none" stroke="var(--red)" strokeWidth={2.4} strokeLinecap="round" />
        <path d="M342,120 H458" fill="none" stroke="var(--red)" strokeWidth={2.4} strokeLinecap="round" strokeDasharray="3 9" opacity={0.6} />
        <path d="M478,120 H800" fill="none" stroke="var(--red)" strokeWidth={2.4} strokeLinecap="round" />
      </svg>
    )
  }
  if (mode === 'off') {
    // A near-flatline — no live pulse.
    return (
      <svg className="hero-trace" viewBox="0 0 800 200" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,120 H362 L380,113 L398,127 L414,120 H800" fill="none" stroke="var(--muted)" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.13} />
      </svg>
    )
  }
  const stroke = mode === 'live' ? 'var(--green)' : 'var(--accent)'
  const dot = mode === 'live' ? '#eafff3' : '#ffffff'
  return (
    <svg className="hero-trace" viewBox="0 0 800 200" preserveAspectRatio="none" aria-hidden="true">
      <path id="cg-hero-path" d={CG_HERO_PATH} fill="none" stroke={stroke} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" opacity={mode === 'live' ? 0.22 : 0.16} />
      <circle r={5} fill={dot} className="hero-dot">
        <animateMotion dur={mode === 'live' ? '2.8s' : '3.4s'} repeatCount="indefinite">
          <mpath href="#cg-hero-path" />
        </animateMotion>
      </circle>
    </svg>
  )
}

// Bounds + flipped viewBox for a circuit outline, mirroring the Track Map view
// so the shape reads upright.
function trackView(points: CircuitPt[]) {
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  let minX = Math.min(...xs)
  let maxX = Math.max(...xs)
  let minY = Math.min(...ys)
  let maxY = Math.max(...ys)
  const padX = (maxX - minX) * 0.12 + 70
  const padY = (maxY - minY) * 0.12 + 70
  minX -= padX
  maxX += padX
  minY -= padY
  maxY += padY
  return {
    viewBox: `${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`, // Y flipped via the group transform below
    scale: Math.max(maxX - minX, maxY - minY),
  }
}

// Closed Catmull-Rom → cubic-bézier spline through the points: turns the jagged
// polyline into smooth curves.
function smoothClosedPath(points: CircuitPt[]): string {
  const p = points.slice()
  if (p.length > 2 && Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]) < 1e-3) p.pop()
  const n = p.length
  if (n < 3) return p.map((q, i) => `${i ? 'L' : 'M'}${q[0]},${q[1]}`).join(' ')
  const at = (i: number) => p[((i % n) + n) % n]
  let d = `M${at(0)[0].toFixed(1)},${at(0)[1].toFixed(1)} `
  for (let i = 0; i < n; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6
    d += `C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)} `
  }
  return d + 'Z'
}

/**
 * The upcoming/live circuit outline with a glowing dot lapping it like a car —
 * quick down the straights, easing through the corners. The speed profile is
 * built from the path's curvature and fed to animateMotion as keyPoints/keyTimes.
 */
function TrackPulse({ points, mode }: { points: CircuitPt[]; mode: Mode }) {
  const { d, view } = useMemo(() => ({ d: smoothClosedPath(points), view: trackView(points) }), [points])
  const isLive = mode === 'live'
  const color = isLive ? 'var(--green)' : 'var(--accent)'
  const dotFill = isLive ? '#eafff3' : '#ffffff'
  const dur = isLive ? 7 : 10
  const pathRef = useRef<SVGPathElement | null>(null)
  const amRef = useRef<SVGElement | null>(null)

  // Derive a corner-aware speed profile: sample the curve, measure the turn
  // angle at each step (≈ curvature), and spend more time where it bends.
  useLayoutEffect(() => {
    const path = pathRef.current
    const am = amRef.current
    if (!path || !am) return
    let L = 0
    try {
      L = path.getTotalLength()
    } catch {
      return
    }
    if (!L) return
    const N = 200
    const ds = L / N
    const ang: number[] = []
    for (let j = 0; j < N; j++) {
      const s = j * ds
      const a = path.getPointAtLength((s - ds + L) % L)
      const b = path.getPointAtLength(s)
      const c = path.getPointAtLength((s + ds) % L)
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
      const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y)
      ang.push(Math.abs(Math.atan2(cross, dot)))
    }
    // Smooth the curvature so speed changes are gradual, not jerky.
    const win = 4
    const sm: number[] = []
    for (let j = 0; j < N; j++) {
      let acc = 0
      for (let k = -win; k <= win; k++) acc += ang[((j + k) % N + N) % N]
      sm.push(acc / (2 * win + 1))
    }
    const maxA = Math.max(...sm, 1e-4)
    const K = 3.2 / maxA // tightest corner ≈ 4× slower than a straight
    const times: number[] = [0]
    let T = 0
    for (let j = 0; j < N; j++) {
      T += 1 + K * sm[j]
      times.push(T)
    }
    const keyPoints: string[] = []
    const keyTimes: string[] = []
    for (let j = 0; j <= N; j++) {
      keyPoints.push((j / N).toFixed(4))
      keyTimes.push((times[j] / T).toFixed(4))
    }
    am.setAttribute('keyPoints', keyPoints.join(';'))
    am.setAttribute('keyTimes', keyTimes.join(';'))
    am.setAttribute('calcMode', 'linear')
    try {
      ;(am as unknown as SVGAnimationElement).beginElement()
    } catch {
      /* SMIL may not be ready; the animation still runs with these attrs */
    }
  }, [d, dur])

  return (
    <svg className="hero-track" viewBox={view.viewBox} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <g transform="scale(1,-1)" style={{ color }}>
        <path
          ref={pathRef}
          id="cg-track-path"
          className="hero-track-outline"
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth={view.scale * 0.006}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle r={view.scale * 0.022} fill={dotFill} className="hero-dot">
          <animateMotion ref={amRef} dur={`${dur}s`} repeatCount="indefinite" rotate="auto" calcMode="linear">
            <mpath href="#cg-track-path" />
          </animateMotion>
        </circle>
      </g>
    </svg>
  )
}


export function Home({ config, onEnterLive, onReplay }: Props) {
  const cal = useCalendar(config)
  const [pickerOpen, setPickerOpen] = useState(false)
  // A deferred "open this session" action, parked while the paywall is shown
  // because the chosen session is gated and there's no current unlock.
  const [pendingAccess, setPendingAccess] = useState<(() => void) | null>(null)
  // Tick once a second so the countdown updates smoothly between calendar polls.
  const [, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const live = cal.state === 'ready' ? cal.live : null
  const next = cal.state === 'ready' ? cal.next : null
  const mode: Mode = live
    ? 'live'
    : cal.state === 'error'
      ? 'error'
      : cal.state === 'loading'
        ? 'loading'
        : next
          ? 'next'
          : 'off'

  // The track outline to pulse: the live race's, else the next race's.
  const featured = live ?? next
  const trackPoints = useMemo(() => {
    if (!featured) return null
    const c = findCircuit(featured.circuitShortName, featured.location, featured.meetingName, featured.countryName)
    return c?.points ?? null
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [featured?.sessionKey])

  // Off-season promotes "Replay the last race" with an accent border.
  const replayPromoted = mode === 'off'

  // Gated sessions (live + the latest two race weekends) need a current unlock;
  // run the action straight away when free or already unlocked, else park it
  // behind the paywall and run it once a key is redeemed.
  const guard = (gated: boolean, action: () => void) => {
    if (!gated || isUnlocked()) action()
    else setPendingAccess(() => action)
  }

  // Conditional return must sit BELOW every hook above (React hooks must run in
  // the same order each render) — otherwise opening the picker crashes the app.
  if (pendingAccess) {
    return (
      <Paywall
        onUnlock={() => {
          const action = pendingAccess
          setPendingAccess(null)
          action()
        }}
        onCancel={() => setPendingAccess(null)}
      />
    )
  }

  if (pickerOpen) {
    return (
      <SessionPicker
        config={config}
        onClose={() => setPickerOpen(false)}
        onPick={(key, simulate, gated) => {
          setPickerOpen(false)
          guard(gated, () => onReplay(key, simulate))
        }}
      />
    )
  }

  return (
    <div className={`home home--${mode}`}>
      <div className="home-grid" />

      <header className="home-top">
        <div className="home-brand">
          <CardiogramMark size={32} className="home-mark" />
          <div className="home-brand-text">
            <span className="home-wordmark">Cardiogram</span>
            <span className="home-tagline">Real-time Formula One telemetry, visualization, and analysis</span>
          </div>
        </div>
      </header>

      <main className="home-main">
        <motion.div
          className="home-hero"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        >
          {(mode === 'live' || mode === 'next') && trackPoints ? (
            <TrackPulse points={trackPoints} mode={mode} />
          ) : mode === 'off' || mode === 'error' ? (
            <HeroTrace mode={mode} />
          ) : null /* loading / unresolved: no trace — the track fades in once ready */}

          {mode === 'live' && live && (
            <div className="hero-body">
              <div className="hero-kicker live">
                <span className="hero-pip" /> Live now
              </div>
              <div className="hero-title">{live.meetingName}</div>
              <div className="hero-sub">{live.sessionName} is running</div>
              <button className="hero-cta" onClick={() => guard(true, () => onEnterLive(live.sessionKey))}>
                Enter live session →
              </button>
            </div>
          )}

          {mode === 'next' && next && (
            <div className="hero-body">
              <div className="hero-kicker">
                <span className="static" /> Up Next
              </div>
              <div className="hero-title">{next.meetingName}</div>
              <div className="hero-countdown mono">{formatCountdown(next.start - Date.now())}</div>
              <div className="hero-sub">{next.sessionName} · {whenLabel(next.start)}</div>
            </div>
          )}

          {mode === 'off' && (
            <div className="hero-body">
              <div className="hero-kicker muted">Off season</div>
              <div className="hero-title">No upcoming sessions</div>
              <div className="hero-sub">The flag has dropped. Replay a past race below.</div>
            </div>
          )}

          {mode === 'loading' && (
            <div className="hero-body">
              <div className="hero-kicker">Connecting</div>
              <div className="hero-title">Checking the calendar…</div>
              <div className="home-spinner-pill">
                <span className="spinner" />
                <span className="mono">Checking the {new Date().getFullYear()} calendar…</span>
              </div>
            </div>
          )}

          {mode === 'error' && (
            <div className="hero-body">
              {cal.liveLocked ? (
                <>
                  <div className="hero-kicker err">Live session — locked</div>
                  <div className="hero-title">OpenF1 is authenticated-only right now</div>
                  <div className="hero-sub">
                    A session is live, so OpenF1 restricts all data — even past races — to
                    authenticated users until it ends. Route the app through the proxy with your
                    OpenF1 credentials, or check back after the session.
                  </div>
                </>
              ) : (
                <>
                  <div className="hero-kicker err">Signal lost</div>
                  <div className="hero-title">Couldn’t reach OpenF1</div>
                  <div className="hero-sub">Check your connection — you can still load a past session below.</div>
                </>
              )}
            </div>
          )}
        </motion.div>

        <div className="home-actions">
          {cal.lastRace && (
            <motion.button
              className={`home-action ${replayPromoted ? 'promoted' : ''}`}
              onClick={() => guard(true, () => onReplay(cal.lastRace!.sessionKey, false))}
              whileTap={{ scale: 0.98 }}
            >
              <span className="home-action-icon">↺</span>
              <span className="home-action-text">
                <span className="home-action-title">Replay the last race</span>
                <span className="home-action-sub">{cal.lastRace.meetingName}</span>
              </span>
            </motion.button>
          )}

          <motion.button className="home-action" onClick={() => setPickerOpen(true)} whileTap={{ scale: 0.98 }}>
            <span className="home-action-icon">▦</span>
            <span className="home-action-text">
              <span className="home-action-title">Load a past session</span>
              <span className="home-action-sub">Browse every Grand Prix, 2023–2026</span>
            </span>
          </motion.button>
        </div>
      </main>

      <footer className="home-foot">
        Made by{' '}
        <a className="home-credit" href="https://aayush.fyi" target="_blank" rel="noopener noreferrer">
          Aayush
        </a>
      </footer>
    </div>
  )
}
