import { describe, expect, it } from 'vitest'
import {
  appendAudit,
  AUDIT_LIMIT,
  lockoutMs,
  MAX_ATTEMPTS,
  verifyAudit,
  verifyPin,
} from './adminAuth'
import type { AuditEntry } from '../types'

/**
 * Security tests. They assert the controls we claim in the README: the PIN
 * is checked against a hash, guessing gets slower, and edited history is
 * detectable.
 */

describe('admin passcode', () => {
  it('accepts the correct PIN and rejects everything else', async () => {
    await expect(verifyPin('2468')).resolves.toBe('ok')
    await expect(verifyPin('2467')).resolves.toBe('wrong')
    await expect(verifyPin('')).resolves.toBe('wrong')
  })
})

describe('lockout policy', () => {
  it('stays open until the attempt limit, then backs off and caps', () => {
    expect(lockoutMs(MAX_ATTEMPTS - 1)).toBe(0)
    expect(lockoutMs(MAX_ATTEMPTS)).toBe(30_000)
    expect(lockoutMs(MAX_ATTEMPTS + 1)).toBe(60_000)
    expect(lockoutMs(99)).toBe(15 * 60 * 1000)
  })
})

describe('tamper-evident audit log', () => {
  it('verifies an untouched chain', async () => {
    let log = await appendAudit([], 'boat.approve', '#21')
    log = await appendAudit(log, 'slot.forceRelease', '#11', 'box1 · 1 crates')
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
