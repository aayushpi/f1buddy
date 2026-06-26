# Paywall — access keys (operating notes)

A light, honour-system gate on the **two most recent race weekends**. Everything
older (every Grand Prix back to 2023) is free. Two ways in, both ending in a
hand-issued key:

- **$3+/month** via **Ko-fi** (membership tier), or
- **$30 donation** to **Trans Lifeline** or **MECA**.

Either way the supporter emails `unnecessaryroughness@proton.me` (their Ko-fi name
or the receipt); I email back one phrase.

**Links wired into `Paywall.tsx`:**
- Trans Lifeline → https://translifeline.org/donate/
- MECA → https://secure.everyaction.com/X61pOYGcOUiGoTfHn7p1uQ2
- Ko-fi → `KOFI_URL` placeholder — **set this up**: create a Ko-fi page, add a
  $3/month membership tier, and replace `KOFI_URL` in `Paywall.tsx` with
  `https://ko-fi.com/<handle>`. Ko-fi is 0% on one-off donations / 5% on
  memberships (vs Buy Me a Coffee's 5% on everything), with one-tap
  card/Apple Pay/PayPal checkout.

## How it works

- The access keys are plain **F1-meme phrases** (`must be the water`,
  `bono my tyres are gone`, …). They're intentionally guessable — this is a
  friends-and-family project — so anyone you tell a phrase to can get in.
- `secrets/access-keys.txt` is the editable master list (one phrase per line,
  **gitignored**). `scripts/gen-access-keys.mjs` compiles it into
  `src/data/accessKeyHashes.ts` — SHA-256 hashes the app checks against (committed).
- `src/utils/access.ts` validates an entered phrase — normalise (upper-case,
  alphanumerics only, so case / spaces / punctuation don't matter) → SHA-256 →
  hash list — and then unlocks the browser **permanently** (`localStorage`).
- The gate triggers in `Home` (live + "replay last race") and `SessionPicker`
  (the latest two meetings of the current season, flagged 🔒). `Paywall.tsx` is
  the screen.

## Day-to-day

- **Issue a key:** tell a friend any phrase from `secrets/access-keys.txt`. It
  works on **all of their devices** (entered once per browser) and **never expires**.
- **Add phrases (append):** `node scripts/gen-access-keys.mjs "kimi leave me alone"`
  (or edit the txt file and re-run with no args). Existing phrases keep working.
  Then redeploy.
- **Reset to defaults:** `node scripts/gen-access-keys.mjs --reset`.
- **Revoke a phrase:** delete its line from `secrets/access-keys.txt`, re-run the
  script, and redeploy. Note: anyone already unlocked on a device stays unlocked
  (the unlock is a permanent local flag) — removal only blocks new redemptions.

## Limits (by design — "make it simpler")

- **Client-side only**, so it's bypassable by a technical user (the OpenF1 data
  isn't truly locked server-side). Fine for a friendly, hand-distributed audience.
- **Guessable by design** — the phrases are memes; hashing only keeps the literal
  answer list out of the shipped JS, it isn't real protection (and isn't meant to be).
- **Unlock is permanent + local** — there's no central record, so a device can't be
  remotely de-authorised once unlocked.
- The `?simlive=` dev URL bypasses the gate (dev only).
- Real enforcement = move the key check to the proxy (`api/proxy.js`) and gate the
  recent-session fetches there; the hashing + age-rule logic ports directly.
