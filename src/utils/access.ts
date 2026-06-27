// Client-side access gate for the paywall.
//
// We bake only the SHA-256 *hashes* of valid keys into the bundle (see
// src/data/accessKeyHashes.ts), so the keys themselves can't be read out of the
// shipped JS. A correct key unlocks the recent-sessions gate for one period,
// stored in localStorage. This is an honour-system gate (a determined user can
// bypass a client-only check); real enforcement would move this to the proxy.

import { ACCESS_KEY_HASHES } from '../data/accessKeyHashes'

const LS_KEY = 'f1buddy.access.v1'
const UNLOCKED = 'unlocked'

/** Normalise to the hashed form: upper-case, alphanumerics only (drop spaces/punctuation). */
function normalize(key: string): string {
  return key.toUpperCase().replace(/[^0-9A-Z]/g, '')
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** True if the key matches one of the baked-in hashes. */
export async function verifyKey(raw: string): Promise<boolean> {
  const norm = normalize(raw)
  if (norm.length < 6) return false
  const hash = await sha256Hex(norm)
  return ACCESS_KEY_HASHES.includes(hash)
}

/** Has a valid key ever been redeemed on this device? Unlocks are permanent. */
export function isUnlocked(): boolean {
  try {
    return localStorage.getItem(LS_KEY) === UNLOCKED
  } catch {
    return false
  }
}

/** Validate a key and, if good, unlock this device permanently. */
export async function redeem(raw: string): Promise<boolean> {
  if (!(await verifyKey(raw))) return false
  try {
    localStorage.setItem(LS_KEY, UNLOCKED)
  } catch {
    /* storage blocked — the session still opens this load */
  }
  return true
}

export function clearUnlock(): void {
  try {
    localStorage.removeItem(LS_KEY)
  } catch {
    /* ignore */
  }
}
