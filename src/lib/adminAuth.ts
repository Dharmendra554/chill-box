import { serverNow } from './harbourSync'
import type { AuditEntry } from '../types'

/**
 * Admin access control and the action log.
 *
 * WHAT A GOVERNMENT PORTAL ACTUALLY DOES, AND WHAT WE CAN HONESTLY COPY
 * --------------------------------------------------------------------
 * A real e-governance console enforces everything on the SERVER: password
 * hashes in a database the client never sees, OTP/MFA, signed short-lived
 * session tokens, role-based authorisation checked on every request, rate
 * limiting and IP allow-lists at the edge, TLS, and an append-only audit
 * store on separate infrastructure.
 *
 * This prototype has no server — the brief rules out paid auth and paid
 * databases — so it can copy the CONTROLS but not the ENFORCEMENT:
 *
 *   copied  · no secret in the bundle: only a PBKDF2-SHA-256 hash ships,
 *             so reading the source does not reveal the passcode
 *   copied  · slow KDF (150 000 iterations) so guessing offline is costly
 *   copied  · lockout with exponential backoff after failed attempts
 *   copied  · idle session expiry, re-authentication required after it
 *   copied  · explicit confirmation on destructive actions
 *   partly  · hash-chained action log: every admin action records who, what,
 *             when, and a SHA-256 over the previous entry
 *   NOT copied · server-side authorisation. Anyone who can open developer
 *             tools can edit this device's own local state.
 *
 * BE PRECISE ABOUT THE LOG. The chain catches accidental corruption, a
 * truncated write, and a casual edit of one row. It does NOT stop a
 * deliberate tamperer: the hash function is public and unkeyed, so anyone
 * who can edit local storage can delete a row and recompute every hash
 * after it, and `verifyAudit` would report the result as intact. An HMAC
 * would not help either, because the key would ship in the same bundle.
 * Only a log the client cannot write — one held by a server — is actually
 * tamper-proof.
 *
 * So: this is a lock on a shared phone and a receipt for honest mistakes,
 * not a defence against a motivated attacker. Moving `verifyPin` and
 * `appendAudit` behind an API route is the single change that turns it into
 * real enforcement; nothing else in the app has to move.
 */

/** PBKDF2 parameters. Salt and hash are public by design — the PIN is not. */
const SALT_HEX = 'edf17a8afcddcd4e9e6b3580e06bc723'
const PIN_HASH_HEX = '710b40cba57bdafffaf89f39db20f66e7f22319b62e102c6b8f8f794ba1631e8'
const ITERATIONS = 150_000

/** Auto-lock after this much inactivity, matching typical portal policy. */
export const ADMIN_IDLE_MS = 5 * 60 * 1000

/** Attempts allowed before backoff starts, then 30 s × 2^(n-3), capped. */
export const MAX_ATTEMPTS = 3
const MAX_LOCKOUT_MS = 15 * 60 * 1000

export function lockoutMs(failures: number): number {
  if (failures < MAX_ATTEMPTS) return 0
  return Math.min(MAX_LOCKOUT_MS, 30_000 * 2 ** (failures - MAX_ATTEMPTS))
}

function subtle(): SubtleCrypto | null {
  return typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): ArrayBuffer {
  return Uint8Array.from(hex.match(/../g)?.map((byte) => Number.parseInt(byte, 16)) ?? []).buffer
}

/**
 * Compares every character regardless of where the first difference is, so
 * the loop's duration does not reveal how much of the guess was right.
 *
 * Not constant-time in the cryptographic sense — a JS engine gives no such
 * guarantee — but the value being compared is a PBKDF2 digest, not the PIN,
 * so there is no prefix worth learning. The lockout is the real defence.
 */
function timingSafeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    diff |= (a.codePointAt(i) ?? 0) ^ (b.codePointAt(i) ?? 0)
  }
  return diff === 0
}

export type PinResult = 'ok' | 'wrong' | 'unavailable'

export async function verifyPin(pin: string): Promise<PinResult> {
  const api = subtle()
  // Web Crypto needs a secure context. Failing closed is the only safe
  // answer: an insecure page must not be able to open the console.
  if (!api) return 'unavailable'

  const key = await api.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await api.deriveBits(
    { name: 'PBKDF2', salt: fromHex(SALT_HEX), iterations: ITERATIONS, hash: 'SHA-256' },
    key,
    256,
  )
  return timingSafeEqual(toHex(bits), PIN_HASH_HEX) ? 'ok' : 'wrong'
}

/* -- Audit trail ------------------------------------------------------- */

async function sha256(text: string): Promise<string | null> {
  const api = subtle()
  // Null, never a placeholder: a chain of identical empty hashes would
  // verify as intact and fail open on the one control meant to detect
  // tampering.
  if (!api) return null
  return toHex(await api.digest('SHA-256', new TextEncoder().encode(text)))
}

/** The exact bytes that get hashed. Field order is part of the contract. */
function canonical(entry: Omit<AuditEntry, 'hash'>): string {
  return [entry.at, entry.actor, entry.action, entry.target, entry.detail, entry.prevHash].join('|')
}

/**
 * Append one action, chaining it to the tip of the log. Editing or removing
 * an earlier entry breaks every hash after it — unless the editor also
 * re-chains, which nothing here can prevent. See the file header.
 */
export async function appendAudit(
  log: AuditEntry[],
  action: string,
  target: string,
  detail = '',
  actor = 'admin',
): Promise<AuditEntry[]> {
  const prevHash = log.at(-1)?.hash ?? 'genesis'
  // The harbour's clock, like every other timestamp in the app. This is the
  // record of who did what and when, rendered beside a console running on
  // harbour time — stamping it from a phone with a wrong clock made the one
  // artefact that exists to be trusted disagree with everything around it.
  // Numbered from the tip, not from the length. The log is capped now, and
  // `log.length + 1` restarted the numbering every time the oldest row was
  // dropped — so a console with a season of history would have shown two
  // different actions both labelled A1, in the one artefact that exists to
  // be trusted.
  const base = { id: nextAuditId(log), at: serverNow(), actor, action, target, detail, prevHash }
  const hash = await sha256(canonical(base))
  // Without Web Crypto there is no chain to extend, so the action is
  // recorded unhashed and marked as such rather than faked.
  return [...log, { ...base, hash: hash ?? 'unhashed' }]
}

/** The next id, continuing from the tip rather than from the row count. */
function nextAuditId(log: AuditEntry[]): string {
  const last = Number.parseInt(log.at(-1)?.id?.slice(1) ?? '', 10)
  return `A${Number.isFinite(last) ? last + 1 : log.length + 1}`
}

/**
 * Index of the first broken link, or -1 when the chain is intact.
 *
 * Starts from the first row's OWN `prevHash`, not from `genesis`, because
 * the log is capped: once the oldest rows have been dropped the surviving
 * head legitimately points at a hash that is no longer here. Anchoring to
 * `genesis` would have reported every capped log as broken at row 0 — a
 * false alarm on the one panel whose whole job is to be believed.
 *
 * What this costs is stated rather than hidden: the chain proves that the
 * rows STILL HERE have not been altered or reordered. It cannot prove that
 * nothing was dropped from the front, and after the cap has bitten, nothing
 * could. The panel says "over the rows kept" for that reason.
 */
export async function verifyAudit(log: AuditEntry[]): Promise<number> {
  let prevHash = log[0]?.prevHash ?? 'genesis'
  for (let i = 0; i < log.length; i += 1) {
    const entry = log[i]
    if (entry.prevHash !== prevHash) return i
    const expected = await sha256(canonical({ ...entry, prevHash }))
    if (expected === null || entry.hash !== expected) return i
    prevHash = entry.hash
  }
  return -1
}
