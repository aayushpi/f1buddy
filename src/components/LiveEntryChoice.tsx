interface Props {
  // The Grand Prix label, if known (e.g. "Austrian Grand Prix · Race").
  label: string | null
  onWatchFromStart: () => void
  onJumpToLive: () => void
}

/**
 * Shown once when you load an in-progress race. The two outcomes are very
 * different — one is spoiler-free, the other reveals the current order — so they
 * are deliberately separated and styled differently. A mis-tap shouldn't ruin
 * the race, so the safe choice is the big primary action and also the default
 * for dismissing (scrim / Esc), while "Jump to live" sits apart below a divider
 * with a clear spoiler warning.
 */
export function LiveEntryChoice({ label, onWatchFromStart, onJumpToLive }: Props) {
  return (
    <>
      {/* Clicking away = the safe choice. */}
      <div className="scrim" onClick={onWatchFromStart} />
      <div className="live-choice" role="dialog" aria-modal="true" aria-label="Start live race">
        <div className="lc-kicker">● Race in progress</div>
        <h2 className="lc-title">{label ?? 'This session is live'}</h2>
        <p className="lc-sub">Where would you like to start?</p>

        <button className="lc-btn safe" onClick={onWatchFromStart} autoFocus>
          <span className="lc-btn-title">Watch from the start</span>
          <span className="lc-btn-sub">Begin at lights-out — no spoilers.</span>
        </button>

        <div className="lc-divider"><span>or</span></div>

        <button className="lc-btn danger" onClick={onJumpToLive}>
          <span className="lc-btn-title">Jump to live</span>
          <span className="lc-btn-sub">⚠ Spoilers — reveals the current running order.</span>
        </button>
      </div>
    </>
  )
}
