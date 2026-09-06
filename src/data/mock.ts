import { HARBOUR_IDS } from './harbours'
import { DAY_MS, HOLD_MS, HOUR_MS, MINUTE_MS, startOfLocalDay } from '../lib/time'
import { emptySlot, QUOTA } from '../store/selectors'
import { SPECIES } from '../types'
import type { BoxId, ColdBox, HarbourId, LedgerEntry, Slot, Species } from '../types'

export const CAPACITY = 10
export const BOX_IDS: BoxId[] = ['box1', 'box2', 'box3']

/** Deterministic PRNG so seeded data is identical on every reload. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SEEDS: Record<HarbourId, number> = {
  nizampatnam: 0x5eed,
  vizag: 0x1a2b,
  kakinada: 0x3c4d,
}

function stored(
  index: number,
  boatId: string,
  depositedAt: number,
  plannedHours: number,
  species: Species,
  late = false,
): Slot {
  return {
    index,
    status: late ? 'overstay' : 'occupied',
    boatId,
    reservedAt: null,
    depositedAt,
    plannedOutAt: depositedAt + plannedHours * HOUR_MS,
    species,
  }
}

function held(index: number, boatId: string, reservedAt: number): Slot {
  return {
    index,
    status: 'reserved',
    boatId,
    reservedAt,
    depositedAt: null,
    plannedOutAt: null,
    species: 'prawn',
  }
}

function fill(slots: Slot[]): Slot[] {
  const next = Array.from({ length: CAPACITY }, (_, i) => emptySlot(i))
  for (const s of slots) next[s.index] = s
  return next
}

/**
 * Nizampatnam is hand-tuned for the demo:
 *   Box 1  8/10 — one overstay (#11, in 7 h ago, promised 5 h)
 *   Box 2 10/10 — full, so picking it must be blocked, not hidden
 *   Box 3  3/10 — one live hold (#07, 3 h 20 m left)
 * Active boat: Ramu #04, idle and ready to book.
 */
function nizampatnamBoxes(now: number): ColdBox[] {
  const ago = (h: number, m = 0) => now - h * HOUR_MS - m * MINUTE_MS

  return [
    {
      id: 'box1',
      slots: fill([
        stored(0, '01', ago(2, 30), 5, 'prawn'),
        stored(1, '02', ago(1, 12), 4, 'sardine'),
        stored(2, '03', ago(4, 6), 5, 'mackerel'),
        stored(3, '05', ago(0, 48), 3, 'crab'),
        stored(4, '06', ago(3, 12), 5, 'pomfret'),
        stored(5, '11', ago(7, 0), 5, 'mixed', true),
        stored(6, '08', ago(5, 30), 5, 'prawn'),
        stored(7, '09', ago(1, 48), 4, 'sardine'),
      ]),
    },
    {
      id: 'box2',
      slots: fill([
        stored(0, '01', ago(2, 30), 5, 'mackerel'),
        stored(1, '02', ago(1, 12), 4, 'crab'),
        stored(2, '03', ago(4, 6), 5, 'pomfret'),
        stored(3, '05', ago(0, 48), 3, 'mixed'),
        stored(4, '06', ago(3, 12), 5, 'prawn'),
        stored(5, '08', ago(5, 30), 5, 'sardine'),
        stored(6, '10', ago(2, 0), 4, 'mackerel'),
        stored(7, '12', ago(3, 30), 5, 'crab'),
        stored(8, '13', ago(0, 30), 5, 'pomfret'),
        stored(9, '14', ago(4, 48), 5, 'mixed'),
      ]),
    },
    {
      id: 'box3',
      slots: fill([
        held(0, '07', now - (HOLD_MS - (3 * HOUR_MS + 20 * MINUTE_MS))),
        stored(1, '15', ago(1, 6), 4, 'prawn'),
        stored(2, '16', ago(2, 18), 5, 'sardine'),
      ]),
    },
  ]
}

/**
 * The other harbours get plausible, deterministic mid-tide occupancy.
 *
 * `held` is counted across all three boxes, not per box, because that is how
 * the real 2-crate cap works — seeded data that broke its own rule would
 * show a boat hoarding three crates in the harbour list.
 */
function seededBoxes(harbourId: HarbourId, now: number, fleet: number): ColdBox[] {
  const rand = mulberry32(SEEDS[harbourId])
  const held = new Map<string, number>()
  const roster = Array.from({ length: fleet }, (_, n) => String(n + 1).padStart(2, '0'))

  return BOX_IDS.map((id) => {
    const slots: Slot[] = []
    const used = 2 + Math.floor(rand() * 7)

    for (let i = 0; i < used; i += 1) {
      const eligible = roster.filter((boat) => (held.get(boat) ?? 0) < QUOTA)
      if (eligible.length === 0) break

      const boatId = eligible[Math.floor(rand() * eligible.length)]
      held.set(boatId, (held.get(boatId) ?? 0) + 1)

      const hoursAgo = rand() * 6.5
      const species = SPECIES[Math.floor(rand() * SPECIES.length)]
      slots.push(
        stored(i, boatId, Math.round(now - hoursAgo * HOUR_MS), 5, species, hoursAgo > 6),
      )
    }
    return { id, slots: fill(slots) }
  })
}

export function createMockBoxes(harbourId: HarbourId, now: number): ColdBox[] {
  if (harbourId === 'nizampatnam') return nizampatnamBoxes(now)
  return seededBoxes(harbourId, now, 12)
}

/**
 * 90 days of completed cycles per harbour. Without history the admin's
 * monthly view is a shell, and usage is the thing an admin actually opens.
 */
export function createMockLedger(harbourId: HarbourId, now: number): LedgerEntry[] {
  const rand = mulberry32(SEEDS[harbourId] ^ 0xbeef)
  const fleet = harbourId === 'nizampatnam' ? 20 : 12
  const out: LedgerEntry[] = []

  for (let day = 90; day >= 1; day -= 1) {
    // Anchored to local midnight, not to the current time of day, so the
    // landing window below is a real one and the busiest-hour chart means
    // something.
    const dayStart = startOfLocalDay(now - day * DAY_MS)
    // A 30-slot harbour turning over roughly 1.5 times a day.
    const trips = 24 + Math.floor(rand() * 18)
    for (let n = 0; n < trips; n += 1) {
      // Boats land from before dawn through mid-afternoon, peaking early.
      const depositedAt = Math.round(dayStart + (3.5 + rand() * rand() * 11) * HOUR_MS)
      const heldHours = 1.5 + rand() * 6
      const releasedAt = Math.round(depositedAt + heldHours * HOUR_MS)
      if (releasedAt > now) continue
      out.push({
        id: `${harbourId}-${day}-${n}`,
        harbourId,
        boatId: String(1 + Math.floor(rand() * fleet)).padStart(2, '0'),
        boxId: BOX_IDS[Math.floor(rand() * BOX_IDS.length)],
        crates: rand() < 0.42 ? 2 : 1,
        species: SPECIES[Math.floor(rand() * SPECIES.length)],
        depositedAt,
        releasedAt,
        overstay: heldHours > 6,
      })
    }
  }
  return out
}

export function seedAllBoxes(now: number): Record<HarbourId, ColdBox[]> {
  return Object.fromEntries(
    HARBOUR_IDS.map((id) => [id, createMockBoxes(id, now)]),
  ) as Record<HarbourId, ColdBox[]>
}

export function seedAllLedgers(now: number): LedgerEntry[] {
  return HARBOUR_IDS.flatMap((id) => createMockLedger(id, now))
}
