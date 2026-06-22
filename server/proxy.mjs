// OpenF1 caching proxy.
//
// Why: the browser app polls OpenF1 directly, and a single live viewer already
// pushes past the paid tier's 60 req/min cap — every extra viewer multiplies
// that against the same key. This proxy sits in front of OpenF1 so that:
//   1. The API key stays server-side (never shipped to browsers).
//   2. Identical requests within a short TTL are served from cache, and
//      concurrent identical requests are coalesced into ONE upstream call.
// Net effect: OpenF1 sees a roughly constant request rate no matter how many
// people are watching, so one key can serve a whole audience.
//
// Run:  OPENF1_API_KEY=... node server/proxy.mjs
// Then point the app at it:  VITE_OPENF1_BASE_URL=http://localhost:8787/v1
//
// Zero dependencies — needs Node 18+ (global fetch).

import http from 'node:http'

const PORT = Number(process.env.PORT || 8787)
const UPSTREAM = (process.env.OPENF1_BASE || 'https://api.openf1.org/v1').replace(/\/$/, '')
const API_KEY = process.env.OPENF1_API_KEY || ''
const TTL = Number(process.env.CACHE_TTL_MS || 2000)
const MIN_UPSTREAM_GAP = Number(process.env.UPSTREAM_GAP_MS || 160) // ~6 req/s ceiling

/** @type {Map<string, {at:number, status:number, ct:string, body:string}>} */
const cache = new Map()
/** @type {Map<string, Promise<{at:number, status:number, ct:string, body:string}>>} */
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
  })()
    .finally(() => inflight.delete(url))

  inflight.set(url, p)
  return p
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }
  if (req.method !== 'GET') {
    res.writeHead(405)
    res.end('Method Not Allowed')
    return
  }

  // Strip a leading /v1 so the app's baseUrl (".../v1") maps cleanly onto the
  // upstream "/v1" base. Everything after (path + raw query) is forwarded as-is
  // so OpenF1's unencoded comparison operators (date>=…) survive.
  const rawUrl = req.url || '/'
  const qIndex = rawUrl.indexOf('?')
  let path = qIndex >= 0 ? rawUrl.slice(0, qIndex) : rawUrl
  const query = qIndex >= 0 ? rawUrl.slice(qIndex) : ''
  if (path.startsWith('/v1')) path = path.slice(3)

  try {
    const entry = await getUpstream(`${path}${query}`)
    res.writeHead(entry.status, {
      'Content-Type': entry.ct,
      'X-Proxy-Age-Ms': String(Date.now() - entry.at),
    })
    res.end(entry.body)
  } catch (e) {
    res.writeHead(502)
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
  }
})

server.listen(PORT, () => {
  console.log(
    `OpenF1 proxy → ${UPSTREAM}\n` +
      `  listening on http://localhost:${PORT}/v1\n` +
      `  api key: ${API_KEY ? 'set' : 'NONE (historical data only)'} · cache TTL ${TTL}ms`,
  )
})
