# `simlive` — rehearse live mode against a past race

Status: **Implemented**
Related: live engine in `src/store/useRaceData.ts`, entry choice in `src/components/LiveEntryChoice.tsx`, proxy in `server/proxy.mjs`

## Usage

```
/?simlive=<session_key>          # e.g. 9558 (2024 British GP) or 11307 (2026 Barcelona GP)
&simspeed=<n>                    # virtual-edge speed multiplier (default 1)
&simstart=<seconds-from-start>   # how far in the virtual "now" begins (default 1500 = 25 min)
```

Example: `/?simlive=9558&simspeed=60&simstart=300` joins ~5 min into the 2024
British GP with the live edge racing ahead at 60×, so you can watch from the
start, fall behind, and hit **● LIVE** to catch up. Point the app's data source
at the proxy first so you don't hit the free-tier rate limit. simlive overrides
the configured session while the param is present.

## Problem

Live mode (start-from-beginning by default, the spoiler-safe entry choice, the
extending timeline, and the "● LIVE" catch-up) can only be exercised end-to-end
when an OpenF1 session is actually in progress — i.e. during a race weekend, and
with a paid key for live data. That makes it impossible to validate the live
experience midweek, before the race.

The only behaviour that genuinely distinguishes live from replay is that **the
timeline grows over time and stays ahead of you**. Forcing a finished session to
report `isLive = true` (the temporary hack used during development) surfaces the
modal and the LIVE button, but the data is already complete, so the race never
"runs ahead" — the most important behaviour is untested.

## Goal

A dev-only mode that replays a **historical** race as if it were happening now,
so the full live flow can be rehearsed on demand, with free data and no key:

- starts at lights-out, spoiler-free;
- shows the live entry choice (Watch from start / Jump to live);
- has a timeline that **extends in real time** as a virtual clock advances;
- lets you fall behind and then catch up with the ● LIVE button.

## Non-goals

- Not shipped to end users; gated behind a query param / dev flag.
- Not a replacement for the Friday-practice dress rehearsal (which also tests the
  paid-key auth path and `session_key=latest` resolution).
- No new data sources — it reuses a normal historical session.

## Design

Activated by a URL query param so it needs no UI:

```
/?simlive=<session_key>          # e.g. a recent race
&simspeed=<n>                    # optional wall-clock multiplier (default 1)
&simstart=<seconds-from-start>   # optional head start into the session (default 0)
```

Two changes inside the live effect of `useRaceData`:

1. **Force live.** When `simlive` is set, treat the loaded session as live
   (`isLiveRef.current = true`) regardless of its real `date_end`. This drives
   the existing entry-choice modal, the LIVE button, and the 1× default.

2. **A virtual "now" cursor.** Compute a moving ceiling that maps wall-clock time
   onto session time:

   ```
   virtualNow = sessionStart + simstart*1000 + (Date.now() - mountedAt) * simspeed
   ```

   Clamp every build and every timeline-extension to `virtualNow`:
   - `tMax = min(realDataMax, virtualNow)` instead of the full data max;
   - the `extendTimeline()` step advances `tMax` toward `virtualNow` on each tick
     rather than re-fetching (all data is already loaded for a past session, so
     no extra requests — `liveRefetch` becomes a no-op clamp).

   The result: at mount the visible race is only ~`simstart` seconds in; it grows
   second-by-second; playback from the start gradually falls behind the virtual
   edge; ● LIVE snaps you to it.

Everything downstream (`filterRawByTime`, the clock loop, follow/catch-up, the
notice stack, the proxy) is unchanged — `simlive` only changes how `isLive` and
`tMax` are derived.

### Sketch

```ts
// in the live effect, after resolving the session
const sim = readSimLiveParams() // { sessionKey, speed, startSec } | null
const isLive = sim ? true : (Number.isFinite(endMs) ? Date.now() < endMs + LIVE_WINDOW_MS : true)

const virtualNow = () =>
  sim ? bounds.min + sim.startSec * 1000 + (Date.now() - mountedAt) * sim.speed : Infinity

// clamp wherever tMax is set:
c.tMax = Math.min(rawTimeBounds(rawRef.current).max, virtualNow())
```

## What it does / doesn't cover

| Behaviour | simlive | Friday practice |
| --- | --- | --- |
| Start-from-beginning + entry modal | ✅ | ✅ |
| Timeline extends, race runs ahead | ✅ | ✅ |
| ● LIVE catch-up & follow | ✅ | ✅ |
| Proxy fan-out / caching | ✅ | ✅ |
| Paid-key auth path | ❌ (free data) | ✅ |
| `session_key=latest` resolution | ❌ (explicit key) | ✅ |

## Effort & risk

- ~30–45 min: read params, force `isLive`, clamp `tMax` to `virtualNow`, make
  `liveRefetch` a clamp when in sim. No new components.
- Low risk: dev-only, gated on a query param; no effect on normal live/replay.
- Pick a recent multi-stop race as the default rehearsal session so pit stops,
  SC/VSC, fastest laps and radios all appear.

## Open questions

- Surface it in the UI (a tiny "rehearse live" entry in Settings) or keep it
  URL-only? URL-only is simplest and keeps it out of the product surface.
- Should `simspeed` default higher (e.g. 30×) so a full race rehearses in a few
  minutes, with the LIVE button still demonstrating catch-up?
