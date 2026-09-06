import { describe, expect, it } from 'vitest'
import { boxesFromWire, expireHolds, pruneWire, slotPaths } from './harbourSync'
import { HOLD_MS } from './time'
import type { ColdBox } from '../types'

/**
 * The wire edge, where a shared harbour is either preserved or quietly lost.
 *
 * Every case here is a defect that shipped: each one type-checked, linted and
 * passed the whole suite, because nothing tested this boundary at all.
 */

function box(id: 'box1' | 'box2' | 'box3', occupied: number[] = []): ColdBox {
  return {
    id,
    slots: Array.from({ length: 10 }, (_, index) => ({
      index,
      status: occupied.includes(index) ? ('occupied' as const) : ('empty' as const),
      boatId: occupied.includes(index) ? '04' : null,
      species: occupied.includes(index) ? ('prawn' as const) : null,
      reservedAt: null,
      depositedAt: occupied.includes(index) ? 1_000 : null,
      plannedOutAt: occupied.includes(index) ? 2_000 : null,
    })),
  }
}

describe('pruneWire', () => {
  it('drops keys whose value is undefined', () => {
    // The defect: object spread keeps `reservedAt: undefined` as a real own
    // key, and the Firebase SDK rejects undefined rather than dropping it. It
    // threw inside runTransaction, a bare catch swallowed it, and deposit
    // reported success while writing nothing — leaving a crate of fish in a
    // slot that expired four hours later and was given to another boat.
    const clean = pruneWire({
      status: 'occupied',
      boatId: '04',
      species: undefined,
      reservedAt: undefined,
      depositedAt: 1_700,
      plannedOutAt: undefined,
    })

    expect(Object.keys(clean).sort()).toEqual(['boatId', 'depositedAt', 'status'])
    for (const value of Object.values(clean)) expect(value).not.toBeUndefined()
  })

  it('keeps a zero, which is a real timestamp and not an absence', () => {
    expect(pruneWire({ status: 'reserved', reservedAt: 0 }).reservedAt).toBe(0)
  })
})

/**
 * The wire shape as the app actually writes it.
 *
 * Through `slotPaths`, which is what `seedHarbour` and `resetRemoteBoxes`
 * send, rather than through a to-wire helper that existed only for this
 * test. The round trip is only worth asserting between the real writer and
 * the real reader.
 */
function wireOf(boxes: ReturnType<typeof box>[]): Record<string, Record<string, unknown>> {
  const wire: Record<string, Record<string, unknown>> = {}
  for (const [path, slot] of Object.entries(slotPaths(boxes))) {
    const [boxId, index] = path.split('/')
    wire[boxId] ??= {}
    wire[boxId][index] = slot
  }
  return wire
}

describe('boxes wire round trip', () => {
  it('survives a full round trip unchanged', () => {
    const before = [box('box1', [0, 3]), box('box2'), box('box3', [9])]
    expect(boxesFromWire(wireOf(before) as never)).toEqual(before)
  })

  it('reads back the arrays Firebase turns numeric keys into', () => {
    // Firebase stores {0: …, 1: …} as an array. Anything indexing the wire
    // shape has to cope, or a whole box silently reads back empty.
    const wire = wireOf([box('box1', [2]), box('box2'), box('box3')])
    const asArrays = Object.fromEntries(
      Object.entries(wire).map(([id, slots]) => [id, Object.values(slots)]),
    )

    const boxes = boxesFromWire(asArrays as never)
    expect(boxes[0].slots[2].status).toBe('occupied')
    expect(boxes[0].slots[2].boatId).toBe('04')
  })

  it('backfills a box the database has never heard of', () => {
    const boxes = boxesFromWire({})
    expect(boxes).toHaveLength(3)
    expect(boxes.every((b) => b.slots.length === 10)).toBe(true)
    expect(boxes.every((b) => b.slots.every((s) => s.status === 'empty'))).toBe(true)
  })
})

describe('expireHolds', () => {
  const at = (reservedAt: number) => ({
    box1: { 0: { status: 'reserved' as const, boatId: '04', reservedAt } },
  })

  it('frees a hold once four hours have passed', () => {
    const wire = at(0)
    expireHolds(wire, HOLD_MS)
    expect(wire.box1[0]).toEqual({ status: 'empty' })
  })

  it('leaves a hold alone one millisecond early', () => {
    const wire = at(0)
    expireHolds(wire, HOLD_MS - 1)
    expect(wire.box1[0].status).toBe('reserved')
  })

  it('judges by the clock it is given, not the device clock', () => {
    // The whole point of passing a clock in: this runs against the harbour's
    // time, so one phone with a six-hour-fast clock cannot empty every
    // reserved slot in the harbour the moment its owner books anything.
    const wire = at(Date.now())
    expireHolds(wire, Date.now() - 6 * 60 * 60 * 1000)
    expect(wire.box1[0].status).toBe('reserved')
  })
})
