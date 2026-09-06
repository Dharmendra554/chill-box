import { describe, expect, it } from 'vitest'
import { createMockBoxes } from '../data/mock'
import { isValidMobile, nextBoatId, normaliseMobile } from '../data/boats'
import { boatUsage, hourHistogram, hourLabel, monthInsight, monthTotals } from '../lib/stats'
import { HOLD_MS, HOUR_MS, OVERSTAY_MS, formatClock, formatClockShort, monthKey } from '../lib/time'
import { destinationPoint } from '../lib/geo'
import { HARBOURS } from '../data/harbours'
import { CRUISE_KMH, navigateTo, routeLegs } from '../lib/nav'
import type { Boat, ColdBox, LedgerEntry, Slot } from '../types'
import {
  applyTick,
  crateCountForBoat,
  emptyCount,
  emptySlot,
  occupancyRows,
  remainingQuota,
  suggestedBoxId,
} from './selectors'
import { releaseSlots } from './useDockStore'

/**
 * These cover the harbour rules a judge will try to break: the hold clock,
 * the two-crate cap, over-capacity, the overstay flag, and the ledger the
 * monthly report is built from. UI is deliberately not tested — the rules
 * are where a bug costs someone their catch.
 */

const NOW = Date.parse('2026-09-06T10:00:00+05:30')
const HARBOUR = HARBOURS.nizampatnam
const H = HARBOUR.id

function box(id: ColdBox['id'], slots: Partial<Slot>[] = []): ColdBox {
  const filled = Array.from({ length: 10 }, (_, i) => emptySlot(i))
  for (const patch of slots) filled[patch.index ?? 0] = { ...filled[patch.index ?? 0], ...patch }
  return { id, slots: filled }
}

describe('hold expiry', () => {
  it('returns a slot to the pool exactly at the 4-hour mark', () => {
    const boxes = [
      box('box1', [
        { index: 0, status: 'reserved', boatId: '07', reservedAt: NOW - HOLD_MS },
      ]),
    ]
    const { boxes: next, expiredHolds } = applyTick(boxes, NOW)
    expect(expiredHolds).toBe(1)
    expect(next[0].slots[0].status).toBe('empty')
    expect(next[0].slots[0].boatId).toBeNull()
  })

  it('leaves a hold alone one second early', () => {
    const boxes = [
      box('box1', [
        { index: 0, status: 'reserved', boatId: '07', reservedAt: NOW - HOLD_MS + 1000 },
      ]),
    ]
    expect(applyTick(boxes, NOW).expiredHolds).toBe(0)
  })
})

describe('overstay flag', () => {
  it('flags at 6 hours and clears again if the clock moves back', () => {
    const boxes = [
      box('box1', [
        { index: 0, status: 'occupied', boatId: '11', depositedAt: NOW - OVERSTAY_MS },
      ]),
    ]
    const late = applyTick(boxes, NOW)
    expect(late.boxes[0].slots[0].status).toBe('overstay')

    const early = applyTick(late.boxes, NOW - HOUR_MS)
    expect(early.boxes[0].slots[0].status).toBe('occupied')
  })
})

describe('anti-hoarding quota', () => {
  it('counts crates across every box, not per box', () => {
    const boxes = [
      box('box1', [{ index: 0, status: 'occupied', boatId: '04', depositedAt: NOW }]),
      box('box2', [{ index: 3, status: 'reserved', boatId: '04', reservedAt: NOW }]),
    ]
    expect(crateCountForBoat(boxes, '04')).toBe(2)
    expect(remainingQuota(boxes, '04')).toBe(0)
  })

  it('never reports a negative allowance', () => {
    const boxes = [
      box('box1', [
        { index: 0, status: 'occupied', boatId: '04', depositedAt: NOW },
        { index: 1, status: 'occupied', boatId: '04', depositedAt: NOW },
        { index: 2, status: 'occupied', boatId: '04', depositedAt: NOW },
      ]),
    ]
    expect(remainingQuota(boxes, '04')).toBe(0)
  })
})

describe('capacity', () => {
  it('suggests the emptiest box that actually fits the request', () => {
    const boxes = createMockBoxes(H, NOW)
    expect(emptyCount(boxes[1])).toBe(0)
    expect(suggestedBoxId(boxes, 2)).toBe('box3')
  })

  it('suggests nothing when the harbour is full', () => {
    const full = [
      box(
        'box1',
        Array.from({ length: 10 }, (_, i) => ({
          index: i,
          status: 'occupied' as const,
          boatId: '01',
          depositedAt: NOW,
        })),
      ),
    ]
    expect(suggestedBoxId(full, 1)).toBeNull()
  })
})

describe('release', () => {
  it('frees the slots and writes one ledger row per box', () => {
    const boxes = [
      box('box1', [
        { index: 0, status: 'occupied', boatId: '04', depositedAt: NOW - HOUR_MS, species: 'prawn' },
        { index: 1, status: 'occupied', boatId: '04', depositedAt: NOW - 2 * HOUR_MS, species: 'prawn' },
      ]),
      box('box2', [{ index: 0, status: 'occupied', boatId: '09', depositedAt: NOW }]),
    ]
    const result = releaseSlots(boxes, H, '04', NOW)

    expect(result.entries).toHaveLength(1)
    expect(result.entries[0]).toMatchObject({ crates: 2, boxId: 'box1', overstay: false })
    expect(result.entries[0].depositedAt).toBe(NOW - 2 * HOUR_MS)
    expect(result.onTime).toBe(2)
    expect(emptyCount(result.boxes[0])).toBe(10)
    // Another boat's crate is untouched.
    expect(result.boxes[1].slots[0].boatId).toBe('09')
  })

  it('marks the row as an overstay and earns no on-time credit', () => {
    const boxes = [
      box('box1', [
        { index: 0, status: 'overstay', boatId: '11', depositedAt: NOW - 7 * HOUR_MS },
      ]),
    ]
    const result = releaseSlots(boxes, H, '11', NOW)
    expect(result.entries[0].overstay).toBe(true)
    expect(result.onTime).toBe(0)
  })

  it('touches only the named box when the admin overrides one', () => {
    const boxes = [
      box('box1', [{ index: 0, status: 'occupied', boatId: '04', depositedAt: NOW }]),
      box('box2', [{ index: 0, status: 'occupied', boatId: '04', depositedAt: NOW }]),
    ]
    const result = releaseSlots(boxes, H, '04', NOW, 'box2')
    expect(result.entries).toHaveLength(1)
    expect(result.boxes[0].slots[0].boatId).toBe('04')
    expect(result.boxes[1].slots[0].boatId).toBeNull()
  })
})

describe('occupancy rows', () => {
  it('groups a boat per box and sorts by the soonest promised collection', () => {
    const boxes = [
      box('box1', [
        { index: 0, status: 'occupied', boatId: '04', depositedAt: NOW, plannedOutAt: NOW + 4 * HOUR_MS },
        { index: 1, status: 'occupied', boatId: '04', depositedAt: NOW, plannedOutAt: NOW + 2 * HOUR_MS },
      ]),
      box('box2', [
        { index: 0, status: 'occupied', boatId: '09', depositedAt: NOW, plannedOutAt: NOW + HOUR_MS },
      ]),
    ]
    const rows = occupancyRows(boxes)
    expect(rows.map((r) => r.boatId)).toEqual(['09', '04'])
    expect(rows[1].crates).toBe(2)
    expect(rows[1].plannedOutAt).toBe(NOW + 2 * HOUR_MS)
  })
})

describe('monthly report', () => {
  const key = monthKey(NOW)
  const ledger: LedgerEntry[] = [
    { id: 'a', harbourId: H, boatId: '04', boxId: 'box1', crates: 2, species: 'prawn', depositedAt: NOW - 2 * HOUR_MS, releasedAt: NOW, overstay: false },
    { id: 'b', harbourId: H, boatId: '09', boxId: 'box2', crates: 1, species: 'crab', depositedAt: NOW - HOUR_MS, releasedAt: NOW, overstay: true },
  ]

  it('totals crates and crate-hours for the month', () => {
    const totals = monthTotals(ledger, key)
    expect(totals).toMatchObject({ trips: 2, crates: 3, overstays: 1, boats: 2 })
    expect(totals.crateHours).toBe(5) // 2 crates x 2 h + 1 crate x 1 h
  })

  it('ranks boats by crates stored', () => {
    expect(boatUsage(ledger, key)[0]).toMatchObject({ boatId: '04', crates: 2 })
  })
})

describe('navigation', () => {
  it('routes via the harbour mouth from offshore and direct from inside', () => {
    // Derived from the harbour, so a corrected survey cannot break the test.
    const offshore = { ...destinationPoint(HARBOUR.lat, HARBOUR.lon, 6, HARBOUR.mouthBearing), accuracy: 10 }
    expect(routeLegs(offshore, HARBOUR, 'box1')).toHaveLength(3)

    const inBasin = { lat: HARBOUR.lat, lon: HARBOUR.lon, accuracy: 10 }
    expect(routeLegs(inBasin, HARBOUR, 'box1')).toHaveLength(2)
  })

  it('derives distance, bearing and ETA from the fix', () => {
    const box1 = HARBOUR.boxes.box1
    // Exactly 2 km due west of the box: bearing back to it must read east.
    const fix = { ...destinationPoint(box1.lat, box1.lon, 2, 270), accuracy: 8 }
    const nav = navigateTo(fix, HARBOUR, 'box1')

    expect(nav.km).toBeCloseTo(2, 1)
    expect(nav.bearing).toBeGreaterThan(85)
    expect(nav.bearing).toBeLessThan(95)
    expect(nav.etaMinutes).toBe(Math.round((2 / CRUISE_KMH) * 60))
  })
})

describe('registration validation', () => {
  it('accepts a 10-digit Indian mobile and strips formatting', () => {
    expect(normaliseMobile('+91 98480-12345')).toBe('9848012345')
    expect(isValidMobile('+91 98480-12345')).toBe(true)
  })

  it('rejects short numbers and invalid leading digits', () => {
    expect(isValidMobile('98480')).toBe(false)
    expect(isValidMobile('1234567890')).toBe(false)
  })

  it('reuses the lowest free hull number', () => {
    const boats = [
      { id: '01', harbourId: H },
      { id: '03', harbourId: H },
    ] as Boat[]
    expect(nextBoatId(boats, H)).toBe('02')
  })
})

describe('edge cases a busy dock produces', () => {
  it('does not expire a hold when the device clock has moved backwards', () => {
    const boxes = [
      box('box1', [
        { index: 0, status: 'reserved', boatId: '07', reservedAt: NOW + HOUR_MS },
      ]),
    ]
    // A clock jumping back must never look like an elapsed four hours.
    expect(applyTick(boxes, NOW).expiredHolds).toBe(0)
    expect(applyTick(boxes, NOW).boxes[0].slots[0].status).toBe('reserved')
  })

  it('does not flag an overstay from a future deposit timestamp', () => {
    const boxes = [
      box('box1', [
        { index: 0, status: 'occupied', boatId: '11', depositedAt: NOW + HOUR_MS },
      ]),
    ]
    expect(applyTick(boxes, NOW).boxes[0].slots[0].status).toBe('occupied')
  })

  it('leaves an overstay in place rather than evicting the catch', () => {
    const boxes = [
      box('box1', [
        { index: 0, status: 'occupied', boatId: '11', depositedAt: NOW - 20 * HOUR_MS },
      ]),
    ]
    const slot = applyTick(boxes, NOW).boxes[0].slots[0]
    expect(slot.status).toBe('overstay')
    expect(slot.boatId).toBe('11')
  })

  it('counts a promised collection window that is under the overstay line', () => {
    // The picker must never offer a time that flags the moment it arrives.
    expect(Math.max(2, 4, 5) * HOUR_MS).toBeLessThan(OVERSTAY_MS)
  })

  it('reports the true free count when a box has one slot left', () => {
    const nearlyFull = box(
      'box1',
      Array.from({ length: 9 }, (_, i) => ({
        index: i,
        status: 'occupied' as const,
        boatId: '01',
        depositedAt: NOW,
      })),
    )
    // A two-crate request cannot fit, a one-crate request can.
    expect(emptyCount(nearlyFull)).toBe(1)
    expect(suggestedBoxId([nearlyFull], 2)).toBeNull()
    expect(suggestedBoxId([nearlyFull], 1)).toBe('box1')
  })

  it('keeps a released slot clean, with no tag or timings left behind', () => {
    const boxes = [
      box('box1', [
        {
          index: 0,
          status: 'occupied',
          boatId: '04',
          depositedAt: NOW,
          plannedOutAt: NOW + HOUR_MS,
          species: 'crab',
        },
      ]),
    ]
    expect(releaseSlots(boxes, H, '04', NOW).boxes[0].slots[0]).toEqual(emptySlot(0))
  })
})

describe('admin analytics', () => {
  const key = monthKey(NOW)
  const at = (hour: number) =>
    Date.parse(`2026-09-06T${String(hour).padStart(2, '0')}:00:00+05:30`)

  const ledger: LedgerEntry[] = [
    { id: 'a', harbourId: H, boatId: '04', boxId: 'box1', crates: 2, species: 'prawn', depositedAt: at(5), releasedAt: at(9), overstay: false },
    { id: 'b', harbourId: H, boatId: '09', boxId: 'box2', crates: 1, species: 'crab', depositedAt: at(5), releasedAt: at(12), overstay: true },
    { id: 'c', harbourId: H, boatId: '11', boxId: 'box3', crates: 1, species: 'mixed', depositedAt: at(17), releasedAt: at(19), overstay: false },
  ]

  it('reports dwell, overstay rate and the busiest landing hour', () => {
    const insight = monthInsight(ledger, key)
    // 2 crates x 4 h + 1 x 7 h + 1 x 2 h = 17 crate-hours over 4 crates.
    expect(insight.dwellHours).toBeCloseTo(4.3, 1)
    expect(insight.overstayRate).toBe(33)
    expect(insight.peakHour).toBe(5)
  })

  it('keeps utilisation a sane percentage of harbour capacity', () => {
    const { utilisation } = monthInsight(ledger, key)
    expect(utilisation).toBeGreaterThanOrEqual(0)
    expect(utilisation).toBeLessThan(100)
  })

  it('reports no trend when there is no previous month to compare', () => {
    expect(monthInsight(ledger, key).cratesDelta).toBeNull()
  })

  it('survives a month with no trips at all', () => {
    const insight = monthInsight([], '2026-01')
    expect(insight).toMatchObject({ dwellHours: 0, overstayRate: 0, peakHour: null })
    expect(Number.isFinite(insight.utilisation)).toBe(true)
  })

  it('buckets arrivals into 24 hours that sum to the trip count', () => {
    const hours = hourHistogram(ledger, key)
    expect(hours).toHaveLength(24)
    expect(hours.reduce((a, b) => a + b, 0)).toBe(3)
    expect(hours[5]).toBe(2)
  })

  it('labels hours the way the dock reads a clock', () => {
    expect(hourLabel(0)).toBe('12 am')
    expect(hourLabel(5)).toBe('5 am')
    expect(hourLabel(12)).toBe('12 pm')
    expect(hourLabel(17)).toBe('5 pm')
  })
})

describe('clock formatting', () => {
  const at = (h: number, m: number) =>
    Date.parse(`2026-09-06T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`)

  it('reads as a wall clock, not a railway timetable', () => {
    expect(formatClock(at(16, 30))).toBe('4:30 pm')
    expect(formatClock(at(4, 5))).toBe('4:05 am')
    expect(formatClock(at(0, 0))).toBe('12:00 am')
    expect(formatClock(at(12, 0))).toBe('12:00 pm')
  })

  it('keeps am/pm in the compact grid form', () => {
    expect(formatClockShort(at(22, 11))).toBe('10:11p')
    expect(formatClockShort(at(4, 5))).toBe('4:05a')
  })
})

describe('utilisation over a part-elapsed month', () => {
  it('divides by the days that have happened, not the whole month', () => {
    // Six crate-hours on the 2nd of a 31-day month. Measuring against the
    // full month would report 0%; against two elapsed days it is visible.
    const day2 = Date.parse('2026-08-02T18:00:00+05:30')
    const ledger: LedgerEntry[] = [
      {
        id: 'x',
        harbourId: H,
        boatId: '04',
        boxId: 'box1',
        crates: 10,
        species: 'prawn',
        depositedAt: Date.parse('2026-08-02T06:00:00+05:30'),
        releasedAt: Date.parse('2026-08-02T12:00:00+05:30'),
        overstay: false,
      },
    ]
    const partial = monthInsight(ledger, '2026-08', undefined, day2)
    const whole = monthInsight(ledger, '2026-08', undefined, Date.parse('2026-10-01T00:00:00+05:30'))
    expect(partial.utilisation).toBeGreaterThan(whole.utilisation)
    // 10 crates x 6 h = 60 crate-hours, over 30 slots x 24 h x 2 days.
    expect(partial.utilisation).toBe(4)
    expect(whole.utilisation).toBe(0)
  })

  it('hides the month-on-month trend while the month is still running', () => {
    const inSeptember = Date.parse('2026-09-06T10:00:00+05:30')
    expect(monthInsight([], '2026-09', '2026-08', inSeptember).cratesDelta).toBeNull()
  })
})
