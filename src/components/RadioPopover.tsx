import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { RadioClip } from '../api/types'
import { teamHex } from '../utils/format'

interface Props {
  radio: RadioClip
  // Auto-dismiss countdown length, in ms.
  duration?: number
  onClose: () => void
}

/**
 * Toast-style team-radio alert. It auto-dismisses while a countdown bar drains.
 * Tapping the body cancels the countdown and plays the clip; from then on the
 * user closes it with the ✕.
 */
export function RadioPopover({ radio, duration = 9000, onClose }: Props) {
  const [engaged, setEngaged] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const team = teamHex(radio.colour)

  // Auto-dismiss timer (cancelled once the user engages).
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      if (!engaged) onClose()
    }, duration)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // Re-arm only matters before engagement; deps intentionally minimal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Tear down audio on unmount.
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      audioRef.current = null
    }
  }, [])

  const play = () => {
    if (!audioRef.current) {
      const a = new Audio(radio.url)
      a.onended = () => setPlaying(false)
      a.onpause = () => setPlaying(false)
      a.onplay = () => setPlaying(true)
      audioRef.current = a
    }
    audioRef.current.currentTime = 0
    audioRef.current.play().catch(() => setPlaying(false))
  }

  const engage = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setEngaged(true)
    play()
  }

  return (
    <motion.div
      className="radio-pop"
      style={{ ['--team' as string]: team }}
      initial={{ x: 80, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 80, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 460, damping: 36 }}
      onClick={engage}
      role="button"
    >
      <button
        className="radio-close"
        aria-label="Close"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
      >
        ✕
      </button>

      <div className="radio-head">
        <span className="radio-kicker">Team Radio</span>
        <span className="radio-acr" style={{ color: team }}>
          {radio.acronym}
        </span>
      </div>

      <div className="radio-body">
        <button
          className={`radio-play ${playing ? 'on' : ''}`}
          aria-label="Play team radio"
          onClick={(e) => {
            e.stopPropagation()
            engage()
          }}
        >
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="radio-msg">
          {engaged ? 'Playing radio…' : 'Tap to play'}
        </span>
      </div>

      {!engaged && (
        <div className="radio-countdown">
          <span
            className="radio-countdown-bar"
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>
      )}
    </motion.div>
  )
}
