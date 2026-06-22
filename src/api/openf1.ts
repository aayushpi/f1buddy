import type {
  ApiCarData,
  ApiDriver,
  ApiInterval,
  ApiLap,
  ApiLocation,
  ApiMeeting,
  ApiOvertake,
  ApiPit,
  ApiPosition,
  ApiRaceControl,
  ApiSession,
  ApiSessionResult,
  ApiStartingGrid,
  ApiStint,
  ApiTeamRadio,
  ApiWeather,
} from './types'

// Base URL for the OpenF1 REST API. Defaults to OpenF1 directly, but set
// VITE_OPENF1_BASE_URL (e.g. http://localhost:8787/v1) to route through the
// caching proxy in server/proxy.mjs — that keeps the API key server-side and
// lets one key serve many simultaneous viewers.
const ENV_BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_OPENF1_BASE_URL
const DEFAULT_BASE = ENV_BASE && ENV_BASE.trim() ? ENV_BASE.trim() : 'https://api.openf1.org/v1'

export interface OpenF1Config {
  baseUrl: string
  apiKey?: string // optional bearer token for real-time access
}

export const defaultConfig: OpenF1Config = {
  baseUrl: DEFAULT_BASE,
}

// OpenF1 uses comparison operators directly in the query string, e.g.
// `?session_key=123&date>=2024-05-25T13:00:00`. The operator must NOT be
// percent-encoded (URLSearchParams would turn `>` into `%3E`, which the API
// ignores), so we build the query manually and only encode the value.
function buildUrl(
  cfg: OpenF1Config,
  path: string,
  params: Record<string, string | number>,
  filters: string[] = [],
) {
  const base = `${cfg.baseUrl.replace(/\/$/, '')}/${path}`
  const parts = Object.entries(params).map(
    ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
  )
  parts.push(...filters)
  return parts.length ? `${base}?${parts.join('&')}` : base
}

/** Build a raw comparison filter like `date>=2024-…` with an encoded value. */
export function dateFilter(op: '>' | '>=' | '<' | '<=', iso: string): string {
  return `date${op}${encodeURIComponent(iso)}`
}

// ---- Request scheduler ---------------------------------------------------
// OpenF1's free tier rate-limits requests, and loading a session fires ~13 at
// once. We funnel every request through a small queue that caps concurrency
// and spaces requests out, then retry on 429 with backoff (honoring
// Retry-After). This turns a burst into a steady trickle the API accepts.
const MAX_CONCURRENT = 2
const MIN_GAP_MS = 180
const MAX_RETRIES = 5

let active = 0
let lastStart = 0
const waiters: Array<() => void> = []

function pump() {
  if (active >= MAX_CONCURRENT || waiters.length === 0) return
  const now = Date.now()
  const wait = Math.max(0, MIN_GAP_MS - (now - lastStart))
  active++
  lastStart = now + wait
  const run = waiters.shift()!
  setTimeout(run, wait)
}

function acquire(): Promise<void> {
  return new Promise((resolve) => {
    waiters.push(resolve)
    pump()
  })
}

function release() {
  active--
  pump()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function get<T>(
  cfg: OpenF1Config,
  path: string,
  params: Record<string, string | number>,
  signal?: AbortSignal,
  filters: string[] = [],
): Promise<T[]> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`
  const url = buildUrl(cfg, path, params, filters)

  await acquire()
  try {
    for (let attempt = 0; ; attempt++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const res = await fetch(url, { headers, signal })

      if (res.status === 429 && attempt < MAX_RETRIES) {
        const retryAfter = Number(res.headers.get('Retry-After'))
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : Math.min(8000, 700 * 2 ** attempt) + Math.random() * 250
        await sleep(backoff)
        continue
      }
      if (res.status === 429) {
        throw new Error(
          `OpenF1 rate limit (429): too many requests. Wait a few seconds and retry${
            cfg.apiKey ? '' : ', or add an API key in Settings'
          }.`,
        )
      }
      if (!res.ok) throw new Error(`OpenF1 ${path} failed: ${res.status} ${res.statusText}`)
      return (await res.json()) as T[]
    }
  } finally {
    release()
  }
}

export const api = {
  sessions: (cfg: OpenF1Config, params: Record<string, string | number>, signal?: AbortSignal) =>
    get<ApiSession>(cfg, 'sessions', params, signal),

  drivers: (cfg: OpenF1Config, sessionKey: number | 'latest', signal?: AbortSignal) =>
    get<ApiDriver>(cfg, 'drivers', { session_key: sessionKey }, signal),

  intervals: (cfg: OpenF1Config, sessionKey: number | 'latest', signal?: AbortSignal) =>
    get<ApiInterval>(cfg, 'intervals', { session_key: sessionKey }, signal),

  position: (cfg: OpenF1Config, sessionKey: number | 'latest', signal?: AbortSignal) =>
    get<ApiPosition>(cfg, 'position', { session_key: sessionKey }, signal),

  laps: (cfg: OpenF1Config, sessionKey: number | 'latest', signal?: AbortSignal) =>
    get<ApiLap>(cfg, 'laps', { session_key: sessionKey }, signal),

  stints: (cfg: OpenF1Config, sessionKey: number | 'latest', signal?: AbortSignal) =>
    get<ApiStint>(cfg, 'stints', { session_key: sessionKey }, signal),

  pit: (cfg: OpenF1Config, sessionKey: number | 'latest', signal?: AbortSignal) =>
    get<ApiPit>(cfg, 'pit', { session_key: sessionKey }, signal),

  raceControl: (cfg: OpenF1Config, sessionKey: number | 'latest', signal?: AbortSignal) =>
    get<ApiRaceControl>(cfg, 'race_control', { session_key: sessionKey }, signal),

  weather: (cfg: OpenF1Config, sessionKey: number | 'latest', signal?: AbortSignal) =>
    get<ApiWeather>(cfg, 'weather', { session_key: sessionKey }, signal),

  meetings: (cfg: OpenF1Config, params: Record<string, string | number>, signal?: AbortSignal) =>
    get<ApiMeeting>(cfg, 'meetings', params, signal),

  teamRadio: (cfg: OpenF1Config, sessionKey: number | 'latest', signal?: AbortSignal) =>
    get<ApiTeamRadio>(cfg, 'team_radio', { session_key: sessionKey }, signal),

  overtakes: (cfg: OpenF1Config, sessionKey: number | 'latest', signal?: AbortSignal) =>
    get<ApiOvertake>(cfg, 'overtakes', { session_key: sessionKey }, signal),

  startingGrid: (cfg: OpenF1Config, sessionKey: number | 'latest', signal?: AbortSignal) =>
    get<ApiStartingGrid>(cfg, 'starting_grid', { session_key: sessionKey }, signal),

  sessionResult: (cfg: OpenF1Config, sessionKey: number | 'latest', signal?: AbortSignal) =>
    get<ApiSessionResult>(cfg, 'session_result', { session_key: sessionKey }, signal),

  // High-frequency feeds. A [from, to] ISO window bounds the payload, which is
  // essential — telemetry/location for a whole session is hundreds of MB.
  carData: (
    cfg: OpenF1Config,
    sessionKey: number | 'latest',
    from?: string,
    to?: string,
    signal?: AbortSignal,
  ) => get<ApiCarData>(cfg, 'car_data', { session_key: sessionKey }, signal, windowFilters(from, to)),

  location: (
    cfg: OpenF1Config,
    sessionKey: number | 'latest',
    from?: string,
    to?: string,
    signal?: AbortSignal,
  ) => get<ApiLocation>(cfg, 'location', { session_key: sessionKey }, signal, windowFilters(from, to)),
}

function windowFilters(from?: string, to?: string): string[] {
  const f: string[] = []
  if (from) f.push(dateFilter('>=', from))
  if (to) f.push(dateFilter('<=', to))
  return f
}
