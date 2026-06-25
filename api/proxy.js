// OpenF1 caching proxy (Vercel serverless function).
//
// Reached via the rewrite in vercel.json:
//   /api/v1/<endpoint>?<query>  →  /api/proxy?__p=<endpoint>&<query>
// We rebuild the upstream URL as <UPSTREAM>/<endpoint>?<query>, attach a
// server-side OpenF1 access token, and cache/coalesce so one account serves
// many viewers. Using a plain (non-dynamic) function + explicit rewrite avoids
// relying on Vercel's catch-all route detection.
//
// The query is forwarded verbatim (string-sliced, not re-encoded) so OpenF1's
// unencoded comparison operators (date>=…) survive.
//
// AUTH: OpenF1 live data uses an OAuth2 password grant, not a static key. We
// POST username/password to /token, get a Bearer access_token that expires in
// ~3600s, cache it, and refresh before expiry (and on a 401). Credentials live
// only here (server-side env vars), never in the client. Historical data needs
// no token, so if credentials are absent or the token fetch fails we still
// proxy the request unauthenticated rather than breaking replay.

const UPSTREAM = (process.env.OPENF1_BASE || 'https://api.openf1.org/v1').replace(/\/$/, '')
const TOKEN_URL = process.env.OPENF1_TOKEN_URL || 'https://api.openf1.org/token'
const USERNAME = process.env.OPENF1_USERNAME || ''
const PASSWORD = process.env.OPENF1_PASSWORD || ''
// Legacy/static fallback: if a ready-made Bearer token is provided directly.
const STATIC_TOKEN = process.env.OPENF1_API_KEY || ''
const TTL = Number(process.env.CACHE_TTL_MS || 2000)
const MIN_UPSTREAM_GAP = Number(process.env.UPSTREAM_GAP_MS || 160)
const TOKEN_SKEW_MS = 60_000 // refresh this long before the token actually expires

const cache = new Map()
const inflight = new Map()
let lastUpstream = 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---- OpenF1 access-token management --------------------------------------
let token = STATIC_TOKEN || null
let tokenExp = STATIC_TOKEN ? Infinity : 0 // static token never auto-expires here
let tokenInflight = null

async function fetchToken() {
  const body = new URLSearchParams({ username: USERNAME, password: PASSWORD })
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`token ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const ttlSec = Number(json.expires_in || 3600)
  token = json.access_token
  tokenExp = Date.now() + ttlSec * 1000 - TOKEN_SKEW_MS
  return token
}

// Returns a valid token, or null if we have no credentials / fetch failed
// (callers then proxy unauthenticated — fine for free historical data).
async function getToken() {
  if (token && Date.now() < tokenExp) return token
  if (!USERNAME || !PASSWORD) return token // null unless a static token was set
  if (!tokenInflight) {
    tokenInflight = fetchToken().finally(() => {
      tokenInflight = null
    })
  }
  try {
    return await tokenInflight
  } catch {
    return null // surface the upstream 401 rather than 502-ing replay traffic
  }
}

function invalidateToken() {
  if (!STATIC_TOKEN) {
    token = null
    tokenExp = 0
  }
}

// ---- Upstream fetch with cache + coalescing ------------------------------
async function fetchUpstream(url, retryOn401 = true) {
  const gap = MIN_UPSTREAM_GAP - (Date.now() - lastUpstream)
  if (gap > 0) await sleep(gap)
  lastUpstream = Date.now()
  const bearer = await getToken()
  const headers = { Accept: 'application/json' }
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  const res = await fetch(url, { headers })
  if (res.status === 401 && retryOn401 && (USERNAME && PASSWORD)) {
    // Token likely expired mid-flight — drop it and try once more.
    invalidateToken()
    return fetchUpstream(url, false)
  }
  const body = await res.text()
  return {
    at: Date.now(),
    status: res.status,
    ct: res.headers.get('content-type') || 'application/json',
    body,
  }
}

async function getUpstream(url) {
  const now = Date.now()
  const cached = cache.get(url)
  if (cached && now - cached.at < TTL) return cached
  const pending = inflight.get(url)
  if (pending) return pending

  const p = fetchUpstream(url)
    .then((entry) => {
      if (entry.status >= 200 && entry.status < 300) cache.set(url, entry)
      return entry
    })
    .finally(() => inflight.delete(url))

  inflight.set(url, p)
  return p
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  // Pull the endpoint out of the raw query without re-encoding the rest, so
  // date>=… style operators reach OpenF1 intact. The endpoint arrives twice:
  // our explicit `__p` and Vercel's auto-injected named route param `path`
  // (from the `:path*` capture in vercel.json). Strip BOTH from the forwarded
  // query — leaving `path=…` makes OpenF1 treat it as a bogus filter and
  // return "No results found".
  const raw = req.url || ''
  const qi = raw.indexOf('?')
  const query = qi >= 0 ? raw.slice(qi + 1) : ''
  let endpoint = ''
  const rest = []
  for (const kv of query.split('&')) {
    if (!kv) continue
    if (kv.startsWith('__p=')) endpoint = decodeURIComponent(kv.slice(4))
    else if (kv.startsWith('path=')) {
      if (!endpoint) endpoint = decodeURIComponent(kv.slice(5))
    } else rest.push(kv)
  }
  const qs = rest.join('&')
  const url = `${UPSTREAM}/${endpoint}${qs ? `?${qs}` : ''}`

  try {
    const entry = await getUpstream(url)
    res.statusCode = entry.status
    res.setHeader('Content-Type', entry.ct)
    res.setHeader('X-Proxy-Age-Ms', String(Date.now() - entry.at))
    res.setHeader('X-Upstream-Url', url) // ops aid for live-day debugging (no token, public URL)
    res.end(entry.body)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
  }
}
