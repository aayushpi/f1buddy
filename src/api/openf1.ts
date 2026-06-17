import type {
  ApiDriver,
  ApiInterval,
  ApiLap,
  ApiPit,
  ApiPosition,
  ApiRaceControl,
  ApiSession,
  ApiStint,
  ApiWeather,
} from './types'

// Base URL for the OpenF1 REST API. Configurable so a user with a real-time
// subscription can point at an authenticated proxy if they have one.
const DEFAULT_BASE = 'https://api.openf1.org/v1'

export interface OpenF1Config {
  baseUrl: string
  apiKey?: string // optional bearer token for real-time access
}

export const defaultConfig: OpenF1Config = {
  baseUrl: DEFAULT_BASE,
}

function buildUrl(cfg: OpenF1Config, path: string, params: Record<string, string | number>) {
  const url = new URL(`${cfg.baseUrl.replace(/\/$/, '')}/${path}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v))
  }
  return url.toString()
}

async function get<T>(
  cfg: OpenF1Config,
  path: string,
  params: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<T[]> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`

  const res = await fetch(buildUrl(cfg, path, params), { headers, signal })
  if (!res.ok) {
    throw new Error(`OpenF1 ${path} failed: ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T[]
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
}
