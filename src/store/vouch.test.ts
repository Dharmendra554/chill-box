import { beforeEach, describe, expect, it } from 'vitest'
import { DAY_MS } from '../lib/time'
import { allowanceFor, QUOTA, remainingQuota, vouchesNeeded } from './selectors'
import { seed, selectBoxes, useDockStore } from './useDockStore'

/**
 * The harbour's backing, and the one thing it must never be able to do.
 *
 * The rule is deliberately one-way: a vouch RAISES a newcomer's allowance
 * from one crate to two, and nothing anywhere lowers it or refuses a booking.
 * The first design had the harbour vote a boat IN, and these tests exist as
 * much to stop that coming back as to check the arithmetic — a majority that
 * can keep a skipper out at 4 a.m. is the harbour master the brief says does
 * not exist, wearing eleven hats.
 */

const NOW = Date.parse('2026-09-06T10:00:00+05:30')
const OLD = NOW - 400 * DAY_MS
const NEW = NOW - 2 * DAY_MS

beforeEach(() => {
  useDockStore.setState({ ...seed(NOW), harbourId: 'nizampatnam', myBoatId: null })
})

describe('how many boats must back a newcomer', () => {
  it('is more than half, not half', () => {
    expect(vouchesNeeded(20)).toBe(11)
    expect(vouchesNeeded(12)).toBe(7)
    // An odd harbour, where "half" is ambiguous and a tie must not pass.
    expect(vouchesNeeded(11)).toBe(6)
    expect(vouchesNeeded(1)).toBe(1)
  })
})

describe('a newcomer can always book, and backing only raises the amount', () => {
  it('gives an unbacked newcomer one crate, never zero', () => {
    expect(allowanceFor(NEW, 0, 20, NOW)).toBe(1)
    expect(allowanceFor(NEW, 10, 20, NOW)).toBe(1)
  })

  it('gives the full cap once a majority has backed it', () => {
    expect(allowanceFor(NEW, 11, 20, NOW)).toBe(QUOTA)
    expect(allowanceFor(NEW, 20, 20, NOW)).toBe(QUOTA)
  })

  it('gives an established boat the full cap with no vouches at all', () => {
    // Nobody has to be voted for to keep what they already had.
    expect(allowanceFor(OLD, 0, 20, NOW)).toBe(QUOTA)
  })

  it('never returns zero, whatever the numbers say', () => {
    for (const active of [0, 1, 5, 20, 100]) {
      for (const backers of [0, 1, 3]) {
        expect(allowanceFor(NEW, backers, active, NOW)).toBeGreaterThan(0)
      }
    }
  })
})

describe('the harbour backing a boat, end to end', () => {
  it('takes a newcomer from one crate to two on the vouch that crosses the line', async () => {
    // Deepika #21 ships one short of the eleven Nizampatnam needs, so this is
    // the tap a judge makes.
    const backersOf = (id: string) =>
      Object.keys(useDockStore.getState().vouches.nizampatnam[id] ?? {}).length
    expect(backersOf('21')).toBe(10)

    const boat = useDockStore.getState().boats.find((b) => b.id === '21')!
    expect(allowanceFor(boat.registeredAt, backersOf('21'), 20, NOW)).toBe(1)

    // A settled boat backs it — the eleventh.
    useDockStore.setState({ myBoatId: '11' })
    await useDockStore.getState().vouchForBoat('21')

    expect(backersOf('21')).toBe(11)
    expect(allowanceFor(boat.registeredAt, backersOf('21'), 20, NOW)).toBe(QUOTA)
  })

  it('counts one boat once, however many times it taps', async () => {
    useDockStore.setState({ myBoatId: '11' })
    await useDockStore.getState().vouchForBoat('21')
    await useDockStore.getState().vouchForBoat('21')
    await useDockStore.getState().vouchForBoat('21')
    expect(Object.keys(useDockStore.getState().vouches.nizampatnam['21'])).toHaveLength(11)
  })

  it('refuses to let a boat back itself', async () => {
    useDockStore.setState({ myBoatId: '21' })
    await useDockStore.getState().vouchForBoat('21')
    expect(Object.keys(useDockStore.getState().vouches.nizampatnam['21'])).toHaveLength(10)
  })

  it('does nothing when nobody has said which boat they are', async () => {
    useDockStore.setState({ myBoatId: null })
    await useDockStore.getState().vouchForBoat('21')
    expect(Object.keys(useDockStore.getState().vouches.nizampatnam['21'])).toHaveLength(10)
  })
})

describe('what an unbacked newcomer can actually do', () => {
  it('books its one crate, and is refused the second with its allowance spent', async () => {
    useDockStore.setState({ myBoatId: '21' })

    expect(await useDockStore.getState().reserve('box3', 1, 'prawn')).toBe(true)
    const boxes = selectBoxes(useDockStore.getState())
    expect(remainingQuota(boxes, '21', 1)).toBe(0)

    // And the second crate is refused by the allowance, NOT by identity —
    // the same refusal an established boat gets at its own cap.
    expect(await useDockStore.getState().reserve('box3', 1, 'prawn')).toBe(false)
  })
})
