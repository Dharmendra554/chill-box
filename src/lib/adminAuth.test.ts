import { describe, expect, it } from 'vitest'
import {
  appendAudit,
  AUDIT_LIMIT,
  verifyAudit,
} from './adminAuth'
import type { AuditEntry } from '../types'

/**
 * What is left of the security tests, and why there is less of them.
 *
 * They used to assert a PIN checked against a PBKDF2 hash and a lockout with
 * exponential backoff. Both are deleted, with the thing they guarded: the
 * record has no password, because by the end there was nothing behind it that
 * a password was protecting anyone from.
 *
 * The log is not access control and never was. It is a receipt — editing or
 * deleting history is DETECTABLE, which is all an unkeyed chain in a public
 * bundle can honestly claim.
 */

describe('tamper-evident audit log', () => {
  it('verifies an untouched chain', async () => {
    let log = await appendAudit([], 'boat.register', '#21')
    log = await appendAudit(log, 'slot.reclaim', '#11', 'box1 · 1 crates')
    expect(log[0].prevHash).toBe('genesis')
    expect(log[1].prevHash).toBe(log[0].hash)
    await expect(verifyAudit(log)).resolves.toBe(-1)
  })

  it('reports the entry where the record was edited', async () => {
    let log = await appendAudit([], 'boat.approve', '#21')
    log = await appendAudit(log, 'boat.reject', '#22')
    log = await appendAudit(log, 'boat.block', '#07')

    const edited = [...log]
    edited[1] = { ...edited[1], target: '#01' }
    await expect(verifyAudit(edited)).resolves.toBe(1)
  })

  it('reports a deleted entry rather than losing it silently', async () => {
    let log = await appendAudit([], 'boat.approve', '#21')
    log = await appendAudit(log, 'boat.reject', '#22')
    log = await appendAudit(log, 'boat.block', '#07')

    await expect(verifyAudit([log[0], log[2]])).resolves.toBe(1)
  })
})

describe('an action log that has outgrown its cap', () => {
  it('still verifies over the rows it kept, and keeps numbering forward', async () => {
    // The log is capped now, and two things had to change with it. Anchoring
    // `verifyAudit` to `genesis` would report every trimmed log as broken at
    // row 0 — a false alarm on the panel whose whole job is to be believed —
    // and numbering ids from `log.length` restarted at A1 every time a row
    // was dropped, so two different actions could both be labelled A1.
    let log = await appendAudit([], 'boat.approve', '#01')
    for (let i = 0; i < 4; i += 1) log = await appendAudit(log, 'boat.block', `#0${i + 2}`)
    expect(log.map((row) => row.id)).toEqual(['A1', 'A2', 'A3', 'A4', 'A5'])

    // A SHORT log has not been trimmed, so its head must still be the
    // genesis row — and deleting the oldest row is the simplest tamper
    // there is. Anchoring to the surviving head unconditionally made this
    // undetectable on every console for its first month, which is most of
    // the consoles that will ever exist.
    expect(await verifyAudit(log.slice(1))).toBe(0)

    // Tampering inside the rows is caught either way.
    const altered = log.map((row, i) => (i === 2 ? { ...row, target: '#99' } : row))
    expect(await verifyAudit(altered)).toBe(2)

    // Numbering continues from the tip, so a trim cannot mint a second A1.
    const grown = await appendAudit(log, 'slot.forceRelease', '#07')
    expect(grown.at(-1)?.id).toBe('A6')
  })

  it('accepts a log the cap has actually trimmed', async () => {
    // At or past the limit the head legitimately points at a hash that is no
    // longer here, and demanding `genesis` there would paint every long-lived
    // console as tampered with — a false alarm on the one panel whose job is
    // to be believed.
    let log: AuditEntry[] = []
    for (let i = 0; i < AUDIT_LIMIT + 5; i += 1) {
      log = await appendAudit(log, 'boat.block', `#${i}`)
    }
    const trimmed = log.slice(-AUDIT_LIMIT)

    expect(trimmed).toHaveLength(AUDIT_LIMIT)
    expect(trimmed[0].prevHash).not.toBe('genesis')
    expect(await verifyAudit(trimmed)).toBe(-1)

    // And a row altered inside a trimmed log is still caught.
    const altered = trimmed.map((row, i) => (i === 4 ? { ...row, detail: 'x' } : row))
    expect(await verifyAudit(altered)).toBe(4)
  })
})
