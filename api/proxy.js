// OpenF1 caching proxy (Vercel serverless function).
//
// Reached via the rewrite in vercel.json:
//   /api/v1/<endpoint>?<query>  →  /api/proxy?__p=<endpoint>&<query>
// We rebuild the upstream URL as <UPSTREAM>/<endpoint>?<query>, inject the
// OPENF1_API_KEY server-side, and cache/coalesce so one key serves many
// viewers. Using a plain (non-dynamic) function + explicit rewrite avoids
// relying on Vercel's catch-all route detection.
//
// The query is forwarded verbatim (string-sliced, not re-encoded) so OpenF1's
// unencoded comparison operators (date>=…) survive.

const UPSTREAM = (process.env.OPENF1_BASE || 'https://api.openf1.org/v1').replace(/\/$/, '')
const API_KEY = process.env.OPENF1_API_KEY || ''
const TTL = Number(process.env.CACHE_TTL_MS || 2000)
const MIN_UPSTREAM_GAP = Number(process.env.UPSTREAM_GAP_MS || 160)

const cache = new Map()
const inflight = new Map()
let lastUpstream = 0
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getUpstream(url) {
  const now = Date.now()
  const cached = cache.get(url)
  if (cached && now - cached.at < TTL) return cached
  const pending = inflight.get(url)
  if (pending) return pending

  const p = (async () => {
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

  // Pull the endpoint (__p) out of the raw query without re-encoding the rest,
  // so date>=… style operators reach OpenF1 intact.
  const raw = req.url || ''
  const qi = raw.indexOf('?')
  const query = qi >= 0 ? raw.slice(qi + 1) : ''
  let endpoint = ''
  const rest = []
  for (const kv of query.split('&')) {
    if (!kv) continue
    if (kv.startsWith('__p=')) endpoint = decodeURIComponent(kv.slice(4))
    else rest.push(kv)
  }
  const qs = rest.join('&')
  const url = `${UPSTREAM}/${endpoint}${qs ? `?${qs}` : ''}`

  try {
    const entry = await getUpstream(url)
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
