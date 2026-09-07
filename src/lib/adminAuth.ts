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

/**
 * Newest audit rows kept.
 *
 * The ledger has had a cap since AGENTS.md §6 was written; the action log
 * was left out of it and grew forever. It shares the ~5 MB localStorage
 * quota with everything else, and it is hashed row by row on every verify.
 * At roughly fifty admin actions a day it reaches the quota inside a year,
 * and when it does `commitWrite` starts failing and NOTHING persists any
 * more — boxes, roster and ledger included — behind one "storage full"
 * toast. Two thousand rows is over a month of heavy use and a few hundred kB.
 *
 * It lives here, beside the chain it bounds, because `verifyAudit` needs it
 * too: below this many rows the log cannot have been trimmed, so its head
 * must still be the genesis row.
 */
export const AUDIT_LIMIT = 2_000

/*
 * THE PIN IS GONE, AND SO IS EVERYTHING THAT CHECKED IT.
 *
 * A PBKDF2-SHA-256 hash, a lockout with exponential backoff, an idle timer
 * and a timing-safe comparison used to live here, and they were good copies
 * of what a government portal does. What they guarded shrank round by round
 * — approve, reject, block and force release were deleted, then the shared
 * reset — until the last thing behind the lock was Publish harbour, which
 * fills an empty database and cannot alter a live one.
 *
 * At that point the lock was not protecting the harbour from anybody. It was
 * making the record LOOK like a console with something hidden in it, in an
 * app whose whole claim is that nothing is. The owner could not tell what the
 * password was for, which is the answer: it was not for anything.
 *
 * What remains in this file is the part that was never access control — the
 * hash-chained action log, which is a receipt, not a gate.
 */

function subtle(): SubtleCrypto | null {
  return typeof crypto !== 'undefined' && crypto.subtle ? crypto.subtle : null
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function sha256(text: string): Promise<string | null> {
  const api = subtle()
  // Null, never a placeholder: a chain of identical empty hashes would
  // verify as intact and fail open on the one control meant to detect
  // tampering.
  if (!api) return null
  return toHex(await api.digest('SHA-256', new TextEncoder().encode(text)))
}

/** The exact bytes that get hashed. Field order is part of the contract. */
function canonical(entry: Omit<AuditEntry, "hash">): string {
  return [entry.at, entry.actor, entry.action, entry.target, entry.detail, entry.prevHash].join("|")
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
 * The anchor depends on whether the cap can have bitten yet, and that is the
 * whole subtlety. Below `AUDIT_LIMIT` rows the log has never been trimmed,
 * so its head MUST still be the genesis row and anything else is tampering —
 * including the simplest tamper there is, deleting the oldest row. At or
 * above the limit the head legitimately points at a hash that is no longer
 * here, and demanding `genesis` would report every capped log as broken at
 * row 0: a false alarm on the one panel whose job is to be believed.
 *
 * A first attempt anchored to the first row's own `prevHash` unconditionally
 * and claimed in a comment that, after trimming, "nothing could" detect a
 * dropped head. True after trimming; false before it, which is where every
 * console spends its first month — and the check had been given up for
 * nothing. Deleting row one of a three-row log went undetected.
 *
 * What is genuinely surrendered, once the cap has bitten: the chain proves
 * the rows STILL HERE are unaltered and unreordered, but not that none was
 * dropped from the front. The panel says "over the rows kept" for that
 * reason.
 */
export async function verifyAudit(log: AuditEntry[]): Promise<number> {
  const trimmed = log.length >= AUDIT_LIMIT
  let prevHash = trimmed ? (log[0]?.prevHash ?? 'genesis') : 'genesis'
  for (let i = 0; i < log.length; i += 1) {
    const entry = log[i]
    if (entry.prevHash !== prevHash) return i
    const expected = await sha256(canonical({ ...entry, prevHash }))
    if (expected === null || entry.hash !== expected) return i
    prevHash = entry.hash
  }
  return -1
}
