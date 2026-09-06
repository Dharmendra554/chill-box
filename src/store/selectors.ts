import { HOLD_MS, OVERSTAY_MS } from '../lib/time'
import type { BoatState, BoxId, ColdBox, Slot, Species } from '../types'

export const QUOTA = 2

/**
 * Newest ledger rows any one harbour keeps — and follows.
 *
 * One number, in one place. It was declared twice, once for the store's cap
 * and once for the shared feed's window, and the two happening to be equal is
 * what made a defect total instead of partial: the window filled entirely
 * with seeded history and no real release could ever enter it.
 */
export const LEDGER_LIMIT = 1_500

/** The canonical cleared slot. Every reset path goes through this so a
 *  new `Slot` field can never be forgotten in one branch. */
export function emptySlot(index: number): Slot {
  return {
    index,
    status: 'empty',
    boatId: null,
    reservedAt: null,
    depositedAt: null,
    plannedOutAt: null,
    species: null,
  }
}

export function emptyCount(box: ColdBox): number {
  return box.slots.filter((s) => s.status === 'empty').length
}

export function usedCount(box: ColdBox): number {
  return box.slots.filter((s) => s.status !== 'empty').length
}

export function isFull(box: ColdBox): boolean {
  return emptyCount(box) === 0
}

export function crateCountForBoat(boxes: ColdBox[], boatId: string): number {
  let n = 0
  for (const box of boxes) {
    for (const slot of box.slots) {
      if (slot.boatId === boatId && slot.status !== 'empty') n += 1
    }
  }
  return n
}

export function remainingQuota(boxes: ColdBox[], boatId: string): number {
  return Math.max(0, QUOTA - crateCountForBoat(boxes, boatId))
}

export function slotsForBoat(boxes: ColdBox[], boatId: string): Slot[] {
  return boxes.flatMap((b) =>
    b.slots.filter((s) => s.boatId === boatId && s.status !== 'empty'),
  )
}

export function boatState(boxes: ColdBox[], boatId: string): BoatState {
  const slots = slotsForBoat(boxes, boatId)
  if (slots.some((s) => s.status === 'reserved')) return 'hold'
  if (slots.some((s) => s.status === 'overstay')) return 'overstay'
  if (slots.some((s) => s.status === 'occupied')) return 'stored'
  return 'idle'
}

export function activeBoxId(boxes: ColdBox[], boatId: string): BoxId | null {
  for (const box of boxes) {
    if (box.slots.some((s) => s.boatId === boatId && s.status !== 'empty')) {
      return box.id
    }
  }
  return null
}

export function holdRemainingMs(
  boxes: ColdBox[],
  boatId: string,
  now: number,
): number {
  const reserved = slotsForBoat(boxes, boatId).filter((s) => s.status === 'reserved')
  if (reserved.length === 0) return 0
  const start = Math.min(...reserved.map((s) => s.reservedAt ?? now))
  // Clamped at both ends: a device clock that jumps backwards would
  // otherwise show more time remaining than a hold can ever have.
  return Math.min(HOLD_MS, Math.max(0, HOLD_MS - (now - start)))
}

export function storageElapsedMs(
  boxes: ColdBox[],
  boatId: string,
  now: number,
): number {
  const stored = slotsForBoat(boxes, boatId).filter(
    (s) => s.status === 'occupied' || s.status === 'overstay',
  )
  if (stored.length === 0) return 0
  const start = Math.min(...stored.map((s) => s.depositedAt ?? now))
  return Math.max(0, now - start)
}

/** Earliest collection time the boat promised, or null if nothing stored. */
export function plannedOutAtForBoat(
  boxes: ColdBox[],
  boatId: string,
): number | null {
  const times = slotsForBoat(boxes, boatId)
    .map((s) => s.plannedOutAt)
    .filter((t): t is number => t !== null)
  return times.length ? Math.min(...times) : null
}

export interface Occupancy {
  boatId: string
  boxId: BoxId
  crates: number
  status: Exclude<Slot['status'], 'empty'>
  since: number
  plannedOutAt: number | null
  species: Species | null
  slotIndexes: number[]
  /** The crates in this row the harbour may take back — see forceReleasable. */
  overdueIndexes: number[]
}

/**
 * May the harbour take this crate back over its owner's head?
 *
 * Only the crates the harbour has given up on — those past their overstay
 * hour, which `applyTick` marks from `depositedAt`. That is exactly the
 * condition the database rule derives, from the same timestamp and the same
 * constant, so the button on screen and the write it performs agree.
 *
 * PER SLOT, never per row. A row aggregates every crate a boat holds in one
 * box, and asking `row.status === 'overstay'` was true when ANY of them was
 * overdue — so a boat with a crate from 04:00 and another from 09:00 offered
 * a live button at 10:00, the rules refused the younger crate, and the whole
 * force release failed. `overdueIndexes` is the answer to the question the
 * rules will actually be asked.
 *
 * They did not agree before. The admin console offered Force release on
 * every stored crate, and the rule refused it for any boat a skipper had
 * claimed — a dead button whose failure only ever appeared in production,
 * because every boat in the seeded demo roster is unbound. An admin has no
 * remedy for a crate the rules will not let them touch, so the honest thing
 * is not to offer the tap until the harbour is entitled to it.
 */
export function forceReleasable(row: Occupancy): boolean {
  return row.overdueIndexes.length > 0
}

/**
 * Has the harbour given up on this crate?
 *
 * One definition, shared by `releaseSlots` and by `rowsFor` in the sync
 * layer, and mirrored by the database rule that decides who may clear a
 * crate. Those two builders had drifted apart: one derived lateness from
 * `depositedAt`, the other read the local `overstay` flag alone — so a
 * release that landed before `applyTick` had raised the flag was billed as
 * an on-time one, silently, in the CSV the society bills from.
 *
 * `applyTick` keeps its own arithmetic because it must also CLEAR the flag
 * when a clock moves back, which this cannot express.
 */
export function isOverdue(
  slot: { status: Slot['status']; depositedAt?: number | null },
  now: number,
): boolean {
  if (slot.status === 'overstay') return true
  const at = slot.depositedAt
  return typeof at === 'number' && now - at >= OVERSTAY_MS
}

/**
 * One row per boat-in-a-box: what the harbour list and the admin table
 * both render. Sorted by the soonest promised collection so a skipper
 * scanning the list sees the next space to open up first.
 */
export function occupancyRows(boxes: ColdBox[]): Occupancy[] {
  const map = new Map<string, Occupancy>()
  for (const box of boxes) {
    for (const slot of box.slots) {
      if (slot.status === 'empty' || !slot.boatId) continue
      const key = `${slot.boatId}:${box.id}`
      const since = slot.depositedAt ?? slot.reservedAt ?? 0
      const row = map.get(key)
      if (row) {
        row.crates += 1
        row.slotIndexes.push(slot.index)
        if (since && since < row.since) row.since = since
        if (slot.status === 'overstay') {
          row.status = 'overstay'
          row.overdueIndexes.push(slot.index)
        }
        row.species ??= slot.species
        if (
          slot.plannedOutAt !== null &&
          (row.plannedOutAt === null || slot.plannedOutAt < row.plannedOutAt)
        ) {
          row.plannedOutAt = slot.plannedOutAt
        }
      } else {
        map.set(key, {
          boatId: slot.boatId,
          boxId: box.id,
          crates: 1,
          status: slot.status,
          since,
          plannedOutAt: slot.plannedOutAt,
          species: slot.species,
          slotIndexes: [slot.index],
          overdueIndexes: slot.status === 'overstay' ? [slot.index] : [],
        })
      }
    }
  }
  return [...map.values()].sort((a, b) => {
    const ax = a.plannedOutAt ?? Number.POSITIVE_INFINITY
    const bx = b.plannedOutAt ?? Number.POSITIVE_INFINITY
    if (ax !== bx) return ax - bx
    return a.boatId.localeCompare(b.boatId)
  })
}

/**
 * Age every slot: expire 4-hour holds, raise and clear the 6-hour overstay
 * flag.
 *
 * Returns the SAME array when nothing moved. This runs once a second, and
 * a fresh array every tick would invalidate every box-derived render and
 * force the persist layer to rewrite the whole store — on the low-end
 * phones this targets, that is the difference between smooth and janky.
 */
export function applyTick(
  boxes: ColdBox[],
  now: number,
): { boxes: ColdBox[]; expiredHolds: number } {
  let expiredHolds = 0
  let moved = false

  const next = boxes.map((box) => {
    let boxMoved = false
    const slots = box.slots.map((slot) => {
      if (slot.status === 'reserved' && slot.reservedAt !== null) {
        if (now - slot.reservedAt >= HOLD_MS) {
          expiredHolds += 1
          boxMoved = true
          return emptySlot(slot.index)
        }
      }
      if (
        (slot.status === 'occupied' || slot.status === 'overstay') &&
        slot.depositedAt !== null
      ) {
        const late = now - slot.depositedAt >= OVERSTAY_MS
        if (late && slot.status !== 'overstay') {
          boxMoved = true
          return { ...slot, status: 'overstay' as const }
        }
        if (!late && slot.status === 'overstay') {
          boxMoved = true
          return { ...slot, status: 'occupied' as const }
        }
      }
      return slot
    })

    if (!boxMoved) return box
    moved = true
    return { ...box, slots }
  })

  return { boxes: moved ? next : boxes, expiredHolds }
}

/** The box with the most room — a hint on the picker, never a decision. */
export function suggestedBoxId(boxes: ColdBox[], needed: number): BoxId | null {
  const fit = [...boxes]
    .filter((b) => emptyCount(b) >= needed)
    .sort((a, b) => emptyCount(b) - emptyCount(a))[0]
  return fit?.id ?? null
}

/**
 * A short booking reference the skipper reads out at the box, such as
 * `N3-04-217`: harbour initial, box number, hull number, and the minute of
 * the reservation. Derived rather than stored, so there is nothing to keep
 * in sync. It is a reference to read out, not an identifier: the same boat
 * and box repeat a code roughly every 17 hours, which is far longer than a
 * 4-hour hold can live.
 */
export function bookingCode(
  harbourId: string,
  boxId: BoxId,
  boatId: string,
  reservedAt: number,
): string {
  const minute = String(Math.floor(reservedAt / 60000) % 1000).padStart(3, '0')
  return `${harbourId[0].toUpperCase()}${boxId.slice(-1)}-${boatId}-${minute}`
}
