// OpenF1 caching proxy — Vercel serverless function.
//
// Same job as server/proxy.mjs, packaged for Vercel so the app can be deployed
// as a single project with the OpenF1 key kept SERVER-SIDE:
//   1. The key (OPENF1_API_KEY env var) is injected here and never shipped to
//      the browser.
//   2. Identical requests within a short TTL are served from an in-memory cache,
//      and concurrent identical requests are coalesced into ONE upstream call —
//      so one key can serve a whole audience without blowing OpenF1's rate cap.
//
// The app calls this same-origin at /api/v1/... (see src/api/openf1.ts), so no
// CORS dance is needed. Set OPENF1_API_KEY in the Vercel project env for live
// data; without it only free historical data is available.

const UPSTREAM = (process.env.OPENF1_BASE || 'https://api.openf1.org').replace(/\/$/, '')
const API_KEY = process.env.OPENF1_API_KEY || ''
const TTL = Number(process.env.CACHE_TTL_MS || 2000)
const MIN_UPSTREAM_GAP = Number(process.env.UPSTREAM_GAP_MS || 160) // ~6 req/s ceiling

// Module scope persists across invocations on a warm instance (best-effort).
const cache = new Map()
const inflight = new Map()
let lastUpstream = 0

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getUpstream(pathAndQuery) {
  const url = `${UPSTREAM}${pathAndQuery}`
  const now = Date.now()

  const cached = cache.get(url)
  if (cached && now - cached.at < TTL) return cached
  const pending = inflight.get(url)
  if (pending) return pending

  const p = (async () => {
    // Space upstream calls out so a burst never blows the per-second limit.
    const gap = MIN_UPSTREAM_GAP - (Date.now() - lastUpstream)
    if (gap > 0) await sleep(gap)
    lastUpstream = Date.now()

    const headers = { Accept: 'application/json' }
    if (API_KEY) headers.Authorization = `Bearer ${API_KEY}`
    const res = await fetch(url, { headers })
    const body = await res.text()
    const entry = {
      at: Date.now(),
      status: res.status,
      ct: res.headers.get('content-type') || 'application/json',
      body,
    }
    // Only cache successful payloads; let errors (e.g. 429) retry promptly.
    if (res.ok) cache.set(url, entry)
    return entry
  })().finally(() => inflight.delete(url))

  inflight.set(url, p)
  return p
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.end('Method Not Allowed')
    return
  }

  // Strip the leading "/api" mount so the remaining "/v1/..." (plus the raw
  // query) maps cleanly onto OpenF1. Forward the query verbatim so OpenF1's
  // unencoded comparison operators (date>=…) survive — do NOT re-encode.
  const rawUrl = req.url || '/'
  const pathAndQuery = rawUrl.startsWith('/api') ? rawUrl.slice(4) : rawUrl

  try {
    const entry = await getUpstream(pathAndQuery)
    res.statusCode = entry.status
    res.setHeader('Content-Type', entry.ct)
    res.setHeader('X-Proxy-Age-Ms', String(Date.now() - entry.at))
    res.end(entry.body)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
  }
}
