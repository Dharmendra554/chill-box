import { describe, expect, it } from 'vitest'
import { appendAudit, lockoutMs, MAX_ATTEMPTS, verifyAudit, verifyPin } from './adminAuth'

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
