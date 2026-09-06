import { QUOTA } from '../store/selectors'
import { HOLD_MS } from './time'
import type { BoxId, ColdBox, HarbourId, LedgerEntry, Slot, Species } from '../types'

/**
 * Shared harbour state, so two phones see one truth.
 *
 * WHY A TRANSACTION, NOT A WRITE
 * ------------------------------
 * The product's whole job is coordinating a scarce shared resource, and a
 * plain write cannot do that: two boats read "one crate free", both write,
 * both believe they hold it, and one arrives to a full box. So every booking
 * runs `runTransaction` over the harbour's entire `boxes` node — Firebase
 * re-runs the body against fresh data until it commits, which makes the
 * capacity check and the 2-crate cap atomic against a real race.
 *
 * It has to be the whole harbour, because the cap is counted across boxes.
 * That is three boxes of ten slots — a few kilobytes, small enough to
 * transact on with twenty boats.
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * The rules run here, on the client. That is correct against two honest
 * boats racing — the case that actually happens on a dock — but not against
 * someone editing their own requests. The database rules constrain the shape
 * of the data (firebase/database.rules.json), not harbour policy. Real
 * enforcement needs server-side code; the README says so plainly.
 *
 * WITHOUT CONFIG
 * --------------
 * With no environment variables the app runs exactly as it did before:
 * local to one device. That keeps an offline demo working with zero setup,
 * and means a Firebase outage degrades to the old behaviour, not a blank
 * screen.
 */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
}

export const syncEnabled = Boolean(config.apiKey && config.databaseURL)

/** Why a booking was refused, so the UI can say something true. */
export type BookingError = 'offline' | 'quota' | 'boxFull'

/**
 * Firebase is ~45 kB gzipped and nothing on the first screen needs it, so it
 * loads on demand instead of sitting in the entry chunk. On a 2G tether that
 * is the difference between the booking screen appearing now and appearing
 * once a database library has downloaded.
 */
type Api = Awaited<ReturnType<typeof loadApi>>

async function loadApi() {
  const [{ initializeApp }, database] = await Promise.all([
    import('firebase/app'),
    import('firebase/database'),
  ])
  return { db: database.getDatabase(initializeApp(config)), ...database }
}

let apiPromise: Promise<Api> | null = null

async function api(): Promise<Api | null> {
  if (!syncEnabled) return null
  try {
    apiPromise ??= loadApi()
    return await apiPromise
  } catch {
    // A failed chunk load must not break booking; the caller falls back.
    apiPromise = null
    return null
  }
}

/* -- Wire format ------------------------------------------------------- */

/**
 * Firebase drops keys whose value is `null`, so the wire shape uses absent
 * rather than null and converts at the edges. Doing it in one place keeps
 * every `Slot` in the app the shape it has always had.
 */
interface WireSlot {
  status: Slot['status']
  boatId?: string
  species?: Species
  reservedAt?: number
  depositedAt?: number
  plannedOutAt?: number
}

type WireBoxes = Record<string, Record<string, WireSlot>>

const BOX_IDS: BoxId[] = ['box1', 'box2', 'box3']

function toWire(slot: Slot): WireSlot {
  const wire: WireSlot = { status: slot.status }
  if (slot.boatId) wire.boatId = slot.boatId
  if (slot.species) wire.species = slot.species
  if (slot.reservedAt) wire.reservedAt = slot.reservedAt
  if (slot.depositedAt) wire.depositedAt = slot.depositedAt
  if (slot.plannedOutAt) wire.plannedOutAt = slot.plannedOutAt
  return wire
}

function fromWire(wire: WireSlot | undefined, index: number): Slot {
  return {
    index,
    status: wire?.status ?? 'empty',
    boatId: wire?.boatId ?? null,
    species: wire?.species ?? null,
    reservedAt: wire?.reservedAt ?? null,
    depositedAt: wire?.depositedAt ?? null,
    plannedOutAt: wire?.plannedOutAt ?? null,
  }
}

function boxesFromWire(wire: WireBoxes): ColdBox[] {
  return BOX_IDS.map((id) => ({
    id,
    slots: Array.from({ length: 10 }, (_, i) => fromWire(wire?.[id]?.[i], i)),
  }))
}

function boxesToWire(boxes: ColdBox[]): WireBoxes {
  return Object.fromEntries(
    boxes.map((box) => [box.id, Object.fromEntries(box.slots.map((s) => [s.index, toWire(s)]))]),
  )
}

/**
 * Expire holds older than four hours, in place, inside whatever transaction
 * is running. Nothing writes to the shared copy on a timer, so the clock
 * advances at the moment it matters: when someone tries to book.
 */
function expireHolds(wire: WireBoxes, now: number): void {
  for (const boxId of BOX_IDS) {
    for (const [index, slot] of Object.entries(wire[boxId] ?? {})) {
      if (slot.status === 'reserved' && (slot.reservedAt ?? now) + HOLD_MS <= now) {
        wire[boxId][index] = { status: 'empty' }
      }
    }
  }
}

/* -- Reads ------------------------------------------------------------- */

/**
 * Watch one harbour: fires with the current state, then on every change from
 * any phone. Returns an unsubscribe that is safe to call before the library
 * has finished loading.
 */
export function watchHarbour(
  harbourId: HarbourId,
  onBoxes: (boxes: ColdBox[]) => void,
): () => void {
  let off: (() => void) | null = null
  let cancelled = false

  void api().then((a) => {
    if (!a || cancelled) return
    off = a.onValue(a.ref(a.db, `harbours/${harbourId}/boxes`), (snap) => {
      const wire = snap.val() as WireBoxes | null
      if (wire) onBoxes(boxesFromWire(wire))
    })
  })

  return () => {
    cancelled = true
    off?.()
  }
}

/** Publish a harbour's boxes once, to seed an empty database. */
export async function seedHarbour(harbourId: HarbourId, boxes: ColdBox[]): Promise<void> {
  const a = await api()
  if (!a) return
  await a.runTransaction(
    a.ref(a.db, `harbours/${harbourId}/boxes`),
    (current: WireBoxes | null) => current ?? boxesToWire(boxes),
  )
}

/* -- Writes ------------------------------------------------------------ */

/**
 * Take `crates` slots in one box, or fail with a reason.
 *
 * Every rule the harbour cares about happens inside the transaction: stale
 * holds expire, the cap is counted across all three boxes, capacity is
 * re-checked against what the server currently holds, and the slots are
 * claimed in the same commit. A genuine race therefore ends with exactly
 * one winner.
 */
export async function reserveRemote(
  harbourId: HarbourId,
  boxId: BoxId,
  boatId: string,
  crates: number,
  species: Species,
): Promise<{ ok: true } | { ok: false; error: BookingError }> {
  const a = await api()
  if (!a) return { ok: false, error: 'offline' }

  let refusal: BookingError | null = null

  try {
    const result = await a.runTransaction(
      a.ref(a.db, `harbours/${harbourId}/boxes`),
      (current: WireBoxes | null) => {
        if (!current) return current // nothing seeded yet; abort rather than guess
        refusal = null
        const now = Date.now()
        expireHolds(current, now)

        const boxes = boxesFromWire(current)
        const held = boxes.reduce(
          (n, box) =>
            n + box.slots.filter((s) => s.boatId === boatId && s.status !== 'empty').length,
          0,
        )
        if (held + crates > QUOTA) {
          refusal = 'quota'
          return undefined // abort
        }

        const free = boxes.find((b) => b.id === boxId)?.slots.filter((s) => s.status === 'empty')
        if (!free || free.length < crates) {
          refusal = 'boxFull'
          return undefined // abort
        }

        for (const slot of free.slice(0, crates)) {
          current[boxId][slot.index] = { status: 'reserved', boatId, species, reservedAt: now }
        }
        return current
      },
    )
    return result.committed ? { ok: true } : { ok: false, error: refusal ?? 'offline' }
  } catch {
    return { ok: false, error: 'offline' }
  }
}

/** Mark this boat's held slots as deposited, with the promised collection. */
export function depositRemote(
  harbourId: HarbourId,
  boatId: string,
  plannedOutAt: number,
): Promise<boolean> {
  return mutateOwnSlots(harbourId, boatId, ['reserved'], (slot) => ({
    ...slot,
    status: 'occupied',
    depositedAt: Date.now(),
    reservedAt: undefined,
    plannedOutAt,
  }))
}

/** Give back a hold that was never filled. */
export function cancelRemote(harbourId: HarbourId, boatId: string): Promise<boolean> {
  return mutateOwnSlots(harbourId, boatId, ['reserved'], () => ({ status: 'empty' }))
}

/** Free stored crates and append the ledger rows they earned. */
export async function releaseRemote(
  harbourId: HarbourId,
  boatId: string,
  entries: Omit<LedgerEntry, 'id' | 'harbourId'>[],
  onlyBoxId?: BoxId,
): Promise<boolean> {
  const freed = await mutateOwnSlots(
    harbourId,
    boatId,
    ['occupied', 'overstay'],
    () => ({ status: 'empty' }),
    onlyBoxId,
  )
  if (!freed) return false

  const a = await api()
  if (!a) return true // slots are free; the row is the lesser loss

  // Ledger rows are append-only by rule, so each gets its own key.
  await Promise.all(
    entries.map((entry) => a.set(a.push(a.ref(a.db, `harbours/${harbourId}/ledger`)), entry)),
  )
  return true
}

/**
 * Rewrite every slot this boat owns in the given statuses, in one
 * transaction, so it cannot half-apply while another phone is writing.
 */
async function mutateOwnSlots(
  harbourId: HarbourId,
  boatId: string,
  statuses: Slot['status'][],
  change: (slot: WireSlot) => WireSlot,
  onlyBoxId?: BoxId,
): Promise<boolean> {
  const a = await api()
  if (!a) return false

  try {
    const result = await a.runTransaction(
      a.ref(a.db, `harbours/${harbourId}/boxes`),
      (current: WireBoxes | null) => {
        if (!current) return current
        let touched = false
        for (const boxId of BOX_IDS) {
          if (onlyBoxId && boxId !== onlyBoxId) continue
          for (const [index, slot] of Object.entries(current[boxId] ?? {})) {
            if (slot.boatId !== boatId || !statuses.includes(slot.status)) continue
            current[boxId][index] = change(slot)
            touched = true
          }
        }
        return touched ? current : undefined
      },
    )
    return result.committed
  } catch {
    return false
  }
}
