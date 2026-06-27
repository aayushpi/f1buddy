import { useEffect } from 'react'
import NoSleep from 'nosleep.js'

/**
 * Keep the screen awake while `active` — used to hold the display on for a whole
 * session sitting on a desk/iPad.
 *
 * The raw Wake Lock API is unreliable on iOS Safari (absent before 16.4, and it
 * drops on tab-switch), so we use nosleep.js: it takes the Wake Lock where it
 * works and otherwise falls back to a looping muted inline video, which iOS
 * keeps the screen on for. iOS requires that video to be (re)started from a user
 * gesture, so we enable on the first interaction after a session loads and
 * re-arm whenever the tab returns to the foreground.
 */
export function useKeepAwake(active: boolean) {
  useEffect(() => {
    if (!active) return
    const noSleep = new NoSleep()
    let disposed = false

    const enable = () => {
      if (disposed || noSleep.isEnabled) return
      // Rejects if not in a user gesture yet — the listeners below will retry.
      noSleep.enable().catch(() => {})
    }

    // Best effort now (covers desktop/Android and a still-warm gesture); on iOS
    // the first tap/click handler below does the real enabling.
    enable()

    const onGesture = () => enable()
    const onVisible = () => {
      if (document.visibilityState === 'visible') enable()
    }
    window.addEventListener('touchend', onGesture, { passive: true })
    window.addEventListener('click', onGesture)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      disposed = true
      window.removeEventListener('touchend', onGesture)
      window.removeEventListener('click', onGesture)
      document.removeEventListener('visibilitychange', onVisible)
      try {
        noSleep.disable()
      } catch {
        /* ignore */
      }
    }
  }, [active])
}
