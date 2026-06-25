import { useEffect, useMemo, useState } from 'react'
import { api, type OpenF1Config } from '../api/openf1'
import type { ApiMeeting, ApiSession } from '../api/types'

// OpenF1 keeps serving a session as "live" until 30 min after its scheduled end
// (matches the window the data engine uses in useRaceData).
const LIVE_WINDOW_MS = 30 * 60 * 1000

export interface CalendarSession {
  sessionKey: number
  sessionName: string // "Race", "Qualifying", "Practice 1", ...
  sessionType: string
  meetingName: string // "Austrian Grand Prix" (falls back to circuit/country)
  countryName: string
  circuitShortName: string // OpenF1 circuit_short_name, e.g. "Interlagos"
  location: string // e.g. "São Paulo"
  start: number // ms epoch
  end: number // ms epoch
}

export interface Calendar {
  state: 'loading' | 'ready' | 'error'
  // A session running right now (start ≤ now ≤ end + 30min), if any.
  live: CalendarSession | null
  // The next session that hasn't started yet, if any.
  next: CalendarSession | null
  // The most recent finished Race-type session, for the "replay last race" card.
  lastRace: CalendarSession | null
  year: number
}

function isRace(s: { sessionType: string; sessionName: string }): boolean {
  const t = `${s.sessionType} ${s.sessionName}`.toLowerCase()
  return t.includes('race')
}

/**
 * Loads the season schedule from OpenF1 and derives what's live now, what's up
 * next and the last completed race. Re-evaluates every second so the countdown
 * ticks and the home screen flips to "live" the moment a session starts.
 */
export function useCalendar(config: OpenF1Config, reloadNonce = 0): Calendar {
  const thisYear = new Date().getFullYear()
  const [sessions, setSessions] = useState<CalendarSession[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [year, setYear] = useState(thisYear)
  // A 1s heartbeat so the live/next/countdown derivation stays current.
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 86400), 1000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    setState('loading')
    setSessions([])

    const load = async (yr: number): Promise<CalendarSession[]> => {
      const [ss, ms] = await Promise.all([
        api.sessions(config, { year: yr }, controller.signal),
        api.meetings(config, { year: yr }, controller.signal).catch(() => [] as ApiMeeting[]),
      ])
      const names = new Map<number, string>()
      for (const m of ms) names.set(m.meeting_key, m.meeting_name)
      return ss
        .map((s: ApiSession) => ({
          sessionKey: s.session_key,
          sessionName: s.session_name,
          sessionType: s.session_type,
          meetingName: names.get(s.meeting_key) || s.circuit_short_name || s.country_name,
          countryName: s.country_name,
          circuitShortName: s.circuit_short_name,
          location: s.location,
          start: Date.parse(s.date_start),
          end: Date.parse(s.date_end),
        }))
        .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end))
        .sort((a, b) => a.start - b.start)
    }

    ;(async () => {
      try {
        let yr = thisYear
        let list = await load(yr)
        // Early in the year (or off-season) the current season may be empty;
        // fall back to the previous year so the screen still has content.
        if (!list.length) {
          yr = thisYear - 1
          list = await load(yr)
        }
        if (cancelled) return
        setYear(yr)
        setSessions(list)
        setState('ready')
      } catch {
        if (!cancelled && !controller.signal.aborted) setState('error')
      }
    })()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [config, reloadNonce, thisYear])

  // Derived against "now"; recomputed each render (the 1s tick drives renders).
  return useMemo<Calendar>(() => {
    const now = Date.now()
    const live = sessions.find((s) => now >= s.start && now <= s.end + LIVE_WINDOW_MS) ?? null
    const next = sessions.find((s) => s.start > now) ?? null
    let lastRace: CalendarSession | null = null
    for (const s of sessions) {
      if (s.end < now && isRace(s)) lastRace = s // sessions are sorted ascending
    }
    return { state, live, next, lastRace, year }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, state, year, Math.floor(Date.now() / 1000)])
}
