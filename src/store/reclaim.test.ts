import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HOUR_MS, MINUTE_MS, RECLAIM_MS } from '../lib/time'
import { emptySlot } from './selectors'
import { migrateStore, seed, selectBoxes, useDockStore } from './useDockStore'
import type { ColdBox } from '../types'

/**
 * The eight-hour rule, tested through `tick` rather than through the pure
 * selector beside it.
 *
 * `reclaimable` and `releaseSlots` were already covered and were already
 * correct. Every defect in this feature lived in the code between them —
 * the order of two statements in `tick`, and a retry guard whose recovery
 * path could not execute — and the suite could not see any of it, because
 * nothing in it had ever called `tick`. Two auditors found what 116 green
 * tests did not.
 *
 * These run in the default no-config shape, where `sharedActive` is false, so
 * they exercise the local path end to end: slot, ledger row and audit row.
 */

const NOW = Date.parse('2026-09-06T10:00:00+05:30')

/**
 * A box with one crate of this age, plus one fresh crate beside it.
 *
 * Every case passes a DIFFERENT age, deliberately. The retry guard is scoped
 * to the module, not to the store, and it never forgets a crate it has
 * already taken — so two cases sharing a deposit time would have the second
 * one silently skipped, and the test would be asserting the guard rather than
 * the rule. Two of these were written that way first and passed for the wrong
 * reason until they were run in a different order.
 */
function boxWith(ageMs: number, alsoFresh = false): ColdBox {
  const slots = Array.from({ length: 10 }, (_, i) => emptySlot(i))
  slots[0] = {
    ...slots[0],
    status: 'occupied',
    boatId: '01',
    species: 'prawn',
    depositedAt: NOW - ageMs,
  }
  if (alsoFresh) {
    slots[1] = {
      ...slots[1],
      status: 'occupied',
      boatId: '01',
      species: 'prawn',
      depositedAt: NOW - HOUR_MS,
    }
  }
  return { id: 'box1', slots }
}

/** A hold that expires on this tick, in another box, to make `applyTick` move. */
function expiringHold(): ColdBox {
  const slots = Array.from({ length: 10 }, (_, i) => emptySlot(i))
  slots[0] = {
    ...slots[0],
    status: 'reserved',
    boatId: '02',
    reservedAt: NOW - 5 * HOUR_MS,
  }
  return { id: 'box2', slots }
}

function reclaimedRows() {
  return useDockStore
    .getState()
    .ledger.filter((e) => e.harbourId === 'nizampatnam' && e.reclaimed === true)
}

/** Ledger rows the SEED ships. Anything above this is what a tick wrote. */
let seededReclaims = 0

beforeEach(() => {
  const fresh = seed(NOW)
  useDockStore.setState({ ...fresh, harbourId: 'nizampatnam', myBoatId: null })
  seededReclaims = reclaimedRows().length
})

describe('the eight-hour rule, driven by the clock', () => {
  it('frees the crate and leaves it freed, on a tick that also expires a hold', async () => {
    // THE defect. `reclaimOverdue` ran before `set(patch)`, and `patch`
    // carried boxes computed from PRE-tick state — so the reclaim emptied the
    // slot and the same tick put the crate straight back. The ledger row was
    // not in `patch`, so it survived: the harbour published "not collected",
    // named the boat, billed the cycle, and the crate never moved.
    //
    // It only bit when `applyTick` had ALSO moved something, because
    // `patch.boxesByHarbour` is assigned only when something changed. That is
    // why a hold expires in this case, and why the browser check that
    // "verified" the feature passed: it landed on a quiet second.
    useDockStore.setState({
      boxesByHarbour: {
        ...useDockStore.getState().boxesByHarbour,
        nizampatnam: [boxWith(9 * HOUR_MS + 1 * MINUTE_MS), expiringHold()],
      },
    })

    useDockStore.getState().tick(NOW)
    await vi.waitFor(() => {
      expect(reclaimedRows()).toHaveLength(seededReclaims + 1)
    })

    const boxes = selectBoxes(useDockStore.getState())
    expect(boxes[0].slots[0].status).toBe('empty')
    expect(boxes[0].slots[0].boatId).toBeNull()
    // And it stays freed on the next tick, rather than being restored.
    useDockStore.getState().tick(NOW + 1000)
    expect(selectBoxes(useDockStore.getState())[0].slots[0].status).toBe('empty')
  })

  it('takes the eight-hour crate and leaves the fresh one in the same box', async () => {
    useDockStore.setState({
      boxesByHarbour: {
        ...useDockStore.getState().boxesByHarbour,
        nizampatnam: [boxWith(9 * HOUR_MS + 2 * MINUTE_MS, true)],
      },
    })

    useDockStore.getState().tick(NOW)
    await vi.waitFor(() => {
      expect(reclaimedRows()).toHaveLength(seededReclaims + 1)
    })

    const box = selectBoxes(useDockStore.getState())[0]
    expect(box.slots[0].status).toBe('empty')
    expect(box.slots[1].status).toBe('occupied')
    expect(box.slots[1].boatId).toBe('01')
  })

  it('writes nothing at all when every crate is inside eight hours', () => {
    // The cold-start case an auditor measured: a harbour seeded overnight
    // produced twenty "not collected" rows naming sixteen boats, over crates
    // still visibly in the boxes. Nothing may be written on a tick that has
    // nothing to reclaim.
    useDockStore.setState({
      boxesByHarbour: {
        ...useDockStore.getState().boxesByHarbour,
        nizampatnam: [boxWith(RECLAIM_MS - 1000), expiringHold()],
      },
    })

    useDockStore.getState().tick(NOW)
    expect(reclaimedRows()).toHaveLength(seededReclaims)
    expect(selectBoxes(useDockStore.getState())[0].slots[0].status).not.toBe('empty')
  })

  it('does not bill the same crate twice when the clock keeps ticking', async () => {
    useDockStore.setState({
      boxesByHarbour: {
        ...useDockStore.getState().boxesByHarbour,
        nizampatnam: [boxWith(9 * HOUR_MS + 3 * MINUTE_MS)],
      },
    })

    useDockStore.getState().tick(NOW)
    await vi.waitFor(() => {
      expect(reclaimedRows()).toHaveLength(seededReclaims + 1)
    })
    for (let i = 1; i <= 5; i += 1) useDockStore.getState().tick(NOW + i * 1000)

    expect(reclaimedRows()).toHaveLength(seededReclaims + 1)
  })

  it('reports whether it actually took the crate, which is what the retry reads', async () => {
    // The retry guard latches a crate out of the rule on `true` and lets it be
    // attempted again on `false`. It used to latch on a `.catch` instead —
    // and `reclaimCrates` has no throwing path: a dead link, a refusal, a
    // lost race and a deadline all RESOLVE, carrying their outcome in a
    // `RemoteResult`. So the first failure took that crate out of the
    // eight-hour rule for the rest of the session, and on a 2G tether, where
    // a deadline is the ordinary outcome, that is every crate exactly once.
    //
    // The remote failure modes cannot be constructed here — the suite's
    // default shape has no database — so what is pinned is the contract the
    // guard reads: nothing taken, `false`.
    useDockStore.setState({
      boxesByHarbour: {
        ...useDockStore.getState().boxesByHarbour,
        nizampatnam: [boxWith(9 * HOUR_MS + 5 * MINUTE_MS)],
      },
    })

    expect(await useDockStore.getState().reclaimCrates('99', 'box1', [0])).toBe(false)
    expect(await useDockStore.getState().reclaimCrates('01', 'box1', [1])).toBe(false)
    expect(await useDockStore.getState().reclaimCrates('01', 'box1', [0])).toBe(true)
  })

  it('records the reclaim in the log that is supposed to explain it', async () => {
    useDockStore.setState({
      boxesByHarbour: {
        ...useDockStore.getState().boxesByHarbour,
        nizampatnam: [boxWith(9 * HOUR_MS + 4 * MINUTE_MS)],
      },
    })

    useDockStore.getState().tick(NOW)
    await vi.waitFor(() => {
      expect(
        useDockStore.getState().audit.some((row) => row.action === 'slot.reclaim'),
      ).toBe(true)
    })
  })
})

describe('the persisted store when a boat still carries a status', () => {
  it('drops the field and lets the boat book, keeping the ledger and the log', () => {
    // The v4 → v5 migration. A reseed here would have been the one-line
    // version of this change and would have destroyed the local audit chain —
    // which is the artefact the README offers to settle a quay dispute with,
    // lives on this phone and nowhere else, and had exactly this hazard fixed
    // on the crash screen one round earlier.
    const legacy = {
      ...seed(NOW),
      audit: [{ id: 'a1', at: NOW, actor: 'x', action: 'y', target: 'z', detail: '', prevHash: '', hash: 'h' }],
      boats: [
        {
          id: '04',
          harbourId: 'nizampatnam' as const,
          nameEn: 'Ramu',
          nameTe: 'రాము',
          owner: 'Chinta Ramu',
          mobile: '9848012004',
          registeredAt: NOW,
          status: 'pending',
        },
      ],
    }

    const migrated = migrateStore(legacy, 4) as typeof legacy
    expect(Object.keys(migrated.boats[0])).not.toContain('status')
    expect(migrated.ledger).toBe(legacy.ledger)
    expect(migrated.audit).toBe(legacy.audit)
  })

  it('reseeds rather than half-migrates anything older, or anything malformed', () => {
    expect(migrateStore({ boats: [] }, 3)).toBeUndefined()
    expect(migrateStore({ boats: 'not an array' }, 4)).toBeUndefined()
    expect(migrateStore({}, 4)).toBeUndefined()
  })
})
