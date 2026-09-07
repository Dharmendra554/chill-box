import { DAY_MS, HOLD_MS, OVERSTAY_MS, RECLAIM_MS } from '../lib/time'
import type { BoatState, BoxId, ColdBox, Slot, Species } from '../types'

export const QUOTA = 2

/** How long a boat is shown as newly arrived. */
const NEW_BOAT_MS = 7 * DAY_MS

/**
 * How long a reclaimed crate stays named on the harbour board.
 *
 * Here, not in `HarbourScreen`, because how long the harbour holds somebody
 * to account is a harbour rule and AGENTS §2 puts those in the store. A
 * policy constant in a component is one a component can quietly change.
 */
export const NOT_COLLECTED_MS = DAY_MS

/**
 * Has this boat only just started using the boxes?
 *
 * The whole of what replaced admin approval. Nobody vets a new boat and
 * nobody can stop it booking — but the harbour can see it turned up, which
 * is what the twenty would see on the quay anyway and is the only honest
 * form of oversight an app with no server-side authority can offer.
 *
 * Derived from `registeredAt`, never stored. A stored flag would need
 * something to clear it, and that something would be another power.
 */
export function joinedRecently(registeredAt: number, now: number): boolean {
  return now - registeredAt < NEW_BOAT_MS
}

/**
 * How many boats must vouch for a newcomer: more than half the harbour.
 *
 * A majority, because the thing it unlocks is a share of a scarce resource
 * that belongs to all of them. Twenty boats need eleven.
 */
export function vouchesNeeded(activeBoats: number): number {
  return Math.floor(activeBoats / 2) + 1
}

/**
 * A new boat's allowance, and the whole of what the harbour votes on.
 *
 * **A vouch can only ever RAISE it.** There is no "no", no way to remove a
 * boat, and no way to reduce anybody. That is deliberate and it is the second
 * design: the first one had the harbour VOTE A BOAT IN, and it was wrong for
 * a reason worth writing down — it put eleven neighbours between a skipper at
 * 4 a.m. and a crate for his catch, which is the same harbour master the
 * brief says does not exist, just with more hands on it.
 *
 * So a boat that registered ten seconds ago can book immediately. It simply
 * starts with ONE crate instead of two, and the harbour can hand it the
 * second one. Nobody waits for permission to use the boxes; the vote decides
 * only how much of the shared space a stranger may take before the people who
 * share it have said they know him.
 *
 * The tally is public, on the Harbour tab, with every voucher named. That is
 * the point as much as the arithmetic: twenty people who can see who vouched
 * for whom need no authority above them.
 */
export function allowanceFor(
  registeredAt: number,
  vouchCount: number,
  activeBoats: number,
  now: number,
): number {
  if (!joinedRecently(registeredAt, now)) return QUOTA
  return vouchCount >= vouchesNeeded(activeBoats) ? QUOTA : 1
}

/**
 * Collection windows a skipper can promise, in hours. All are strictly under
 * the 6 h overstay line — offering "6 h" would let the app suggest a time
 * that flags the moment it arrives, and a flagged crate is one any phone in
 * the harbour may clear over its owner's head.
 *
 * Here rather than in `DockScreen`, because it is a harbour rule and rules
 * live in the store. While it was a private const in the component the test
 * that guards it could not read it: `rules.test.ts` asserted `5 h < 6 h`
 * against hand-copied literals, so changing the picker to offer 8 h left the
 * test green.
 */
export const PLAN_HOURS = [2, 4, 5]

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

/**
 * How many more crates this boat may take.
 *
 * `allowance` defaults to the full cap, so every existing caller and every
 * test that does not care about newcomers reads exactly as it did. Only the
 * screens that know a boat's age and its vouches pass the third argument.
 */
export function remainingQuota(
  boxes: ColdBox[],
  boatId: string,
  allowance: number = QUOTA,
): number {
  return Math.max(0, allowance - crateCountForBoat(boxes, boatId))
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
  /** The crates in this row past their overstay hour — see `reclaimable`. */
  overdueIndexes: number[]
}

/**
 * One boat's overdue crates in one box.
 *
 * `since` is the oldest deposit among them, and it is not decoration: it is
 * what identifies THE CRATE rather than the slot it is sitting in. The
 * caller remembers what it has already submitted, and a key of harbour, box,
 * boat and slot index would have latched shut on the slot — so the next
 * crate that same boat put in that same slot could never be reclaimed for
 * the rest of the session.
 */
export interface Reclaim {
  boatId: string
  boxId: BoxId
  indexes: number[]
  since: number
}

/**
 * The crates the harbour is taking back right now, one entry per box.
 *
 * PER SLOT, never per row. A row aggregates every crate a boat holds in one
 * box, so asking whether the ROW is overdue was true when any one of them
 * was — a boat with a crate from 04:00 and another from 09:00 offered a
 * release at 10:00, the database rightly refused the younger crate, and the
 * whole write failed. This answers the question the rules will actually be
 * asked: which slot indexes, exactly.
 *
 * Derived from `depositedAt`, never from the stored `overstay` flag. That
 * flag is raised by `applyTick` on each phone's own copy and is never written
 * to the shared one, so anything waiting for it would never fire — the bug
 * that once made a rotting crate unclearable by the entire harbour, harbour
 * master included. One rule, one source of truth: the timestamp. The
 * database rule derives its own permission the same way, from the same
 * field, so what this returns is exactly what the write will be allowed to
 * do.
 *
 * This replaced `forceReleasable`, which existed to decide whether to show a
 * PIN-holder a Force release button. There is no button and no PIN-holder.
 */
export function reclaimable(
  boxes: ColdBox[],
  now: number,
): Reclaim[] {
  const out: Reclaim[] = []
  for (const box of boxes) {
    const byBoat = new Map<string, { indexes: number[]; since: number }>()
    for (const slot of box.slots) {
      if (slot.status !== 'occupied' && slot.status !== 'overstay') continue
      if (!slot.boatId || slot.depositedAt === null) continue
      if (now - slot.depositedAt < RECLAIM_MS) continue
      const found = byBoat.get(slot.boatId)
      if (found) {
        found.indexes.push(slot.index)
        found.since = Math.min(found.since, slot.depositedAt)
      } else {
        byBoat.set(slot.boatId, { indexes: [slot.index], since: slot.depositedAt })
      }
    }
    for (const [boatId, { indexes, since }] of byBoat) {
      out.push({ boatId, boxId: box.id, indexes, since })
    }
  }
  // Stable across phones: two devices reaching the eight-hour line in the
  // same second must attempt the same crates in the same order, or their
  // partial writes interleave into a state neither of them predicted.
  return out.sort((a, b) => a.boxId.localeCompare(b.boxId) || a.boatId.localeCompare(b.boatId))
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
