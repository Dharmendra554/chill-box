import { LEDGER_LIMIT, QUOTA } from '../store/selectors'
import { HOLD_MS } from './time'
import type { Boat, BoxId, ColdBox, HarbourId, LedgerEntry, Slot, Species } from '../types'

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

/**
 * Why a shared write did not happen, so the UI can say something true.
 *
 * `stale` and `unseeded` exist because "nothing to change" and "no harbour
 * yet" were both reported as `offline` — telling a skipper on full bars to
 * wait for a signal, which is the wrong-reason refusal AGENTS.md forbids.
 */
export type BookingError =
  | 'offline'
  | 'quota'
  | 'boxFull'
  | 'refused'
  | 'stale'
  | 'unseeded'

/**
 * What happened to a shared write. Every caller must be able to tell the
 * skipper the truth, so none of these return a bare boolean.
 */
export type RemoteResult = { ok: true } | { ok: false; error: BookingError }

/**
 * Tell a dead link apart from a database that said no. They need different
 * actions from the skipper: wait for signal, or find the harbour admin.
 */
function reasonFor(error: unknown): BookingError {
  const code = (error as { code?: string })?.code ?? (error as Error)?.message ?? ''
  return /permission|denied/i.test(String(code)) ? 'refused' : 'offline'
}

/**
 * Firebase is ~45 kB gzipped and nothing on the first screen needs it, so it
 * loads on demand instead of sitting in the entry chunk. On a 2G tether that
 * is the difference between the booking screen appearing now and appearing
 * once a database library has downloaded.
 */
type Api = Awaited<ReturnType<typeof loadApi>>

async function loadApi() {
  const [{ initializeApp }, database, auth] = await Promise.all([
    import('firebase/app'),
    import('firebase/database'),
    import('firebase/auth'),
  ])
  const app = initializeApp(config)
  const user = await signIn(auth, app)
  const db = database.getDatabase(app)

  // Firebase publishes the gap between this device's clock and its servers.
  // Every shared time is written and compared through it, so one phone with
  // a wrong clock cannot expire the whole harbour's holds — see serverNow.
  database.onValue(database.ref(db, '.info/serverTimeOffset'), (snap) => {
    serverOffset = typeof snap.val() === 'number' ? snap.val() : 0
  })

  return { db, uid: user?.uid ?? null, ...database }
}

let serverOffset = 0

/**
 * The harbour's clock, not this phone's.
 *
 * Cheap Androids lose their clock on a flat battery, and every deadline in
 * this app is one someone loses a catch over. A phone six hours fast used to
 * empty every reserved slot in the harbour the moment its owner booked
 * anything — twenty skippers losing their holds because one device was
 * wrong, each told the plausible-sounding "your 4-hour hold ended".
 *
 * Used for every timestamp that is written to or compared against the shared
 * copy, AND for the on-screen clock in `hooks/useClock.ts`, because a hold
 * the skipper watches expire must expire at the same moment the harbour
 * thinks it does.
 *
 * Falls back to the device clock before the offset arrives, which is the
 * best available answer and no worse than the old behaviour.
 */
export function serverNow(): number {
  return Date.now() + serverOffset
}

/**
 * A server-issued identity for this phone, before anything touches the data.
 *
 * Anonymous sign-in, so nothing changes for the skipper: no account, no
 * password, no extra tap — the decision in MEMORY.md §7 stands. What it buys
 * is that every write now carries a `uid` the client cannot forge, which is
 * the thing database rules can check. Without it the rules can only ask what
 * a request *looks* like, never who made it.
 *
 * Firebase keeps the anonymous user in local storage, so the same phone keeps
 * the same identity across reloads — which is what lets a boat be bound to a
 * device rather than to a number anyone can read.
 *
 * Sign-in failure is not fatal here, but it is not silent either: writes go
 * ahead and the rules refuse them, which surfaces as a refusal the skipper
 * can act on rather than a pretend success. If Anonymous sign-in is not
 * enabled on the Firebase project, EVERY write in the harbour fails that
 * way — see the README setup steps.
 */
async function signIn(
  auth: typeof import('firebase/auth'),
  app: import('firebase/app').FirebaseApp,
) {
  try {
    const instance = auth.getAuth(app)
    // Wait for a restored session before creating a second identity: calling
    // signInAnonymously while the SDK is still rehydrating mints a new uid
    // and silently orphans whatever the old one owned.
    const restored = await new Promise<import('firebase/auth').User | null>((resolve) => {
      const stop = auth.onAuthStateChanged(instance, (u) => {
        stop()
        resolve(u)
      })
    })
    return restored ?? (await auth.signInAnonymously(instance)).user
  } catch {
    return null
  }
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

/** Firebase keys cannot contain `. # $ [ ] /`, and a local id might. */
function ledgerKey(id: string): string {
  return id.replace(/[.#$[\]/]/g, '-')
}

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

export function boxesFromWire(wire: WireBoxes): ColdBox[] {
  return BOX_IDS.map((id) => ({
    id,
    slots: Array.from({ length: 10 }, (_, i) => fromWire(wire?.[id]?.[i], i)),
  }))
}

export function boxesToWire(boxes: ColdBox[]): WireBoxes {
  return Object.fromEntries(
    boxes.map((box) => [box.id, Object.fromEntries(box.slots.map((s) => [s.index, toWire(s)]))]),
  )
}

/**
 * Expire holds older than four hours, in place, inside whatever transaction
 * is running. Nothing writes to the shared copy on a timer, so the clock
 * advances at the moment it matters: when someone tries to book.
 */
export function expireHolds(wire: WireBoxes, now: number): void {
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
  /**
   * `null` means the snapshot arrived and the harbour is not seeded yet.
   *
   * That distinction is the difference between a working app and a dead one:
   * an unseeded harbour returns `null` for ever, and swallowing it here left
   * the caller with no evidence the link was alive — so it refused every
   * write, including the one that would have seeded the harbour, and told
   * the admin they had no signal.
   */
  onBoxes: (boxes: ColdBox[] | null) => void,
  onLost: (reason: string) => void,
): () => void {
  let off: (() => void) | null = null
  let cancelled = false

  void api().then((a) => {
    if (!a || cancelled) return
    off = a.onValue(
      a.ref(a.db, `harbours/${harbourId}/boxes`),
      (snap) => {
        const wire = snap.val() as WireBoxes | null
        if (!wire) {
          onBoxes(null)
          return
        }
        // Age the holds on the way in, with the harbour's clock. The shared
        // copy only expires them when someone next books, so without this a
        // dead hold renders as a live one counting 00:00:00 — and the phone
        // that expired it locally has it restored by the next update.
        expireHolds(wire, serverNow())
        onBoxes(boxesFromWire(wire))
      },
      // A cancelled listener is how revoked rules arrive. Silence here let
      // the app keep a "live" badge and go on accepting writes that all fail.
      (error) => onLost(error.message),
    )
  })

  return () => {
    cancelled = true
    off?.()
  }
}

/**
 * Watch the roster and the ledger for one harbour.
 *
 * Both were written and never read back, which quietly broke two whole
 * features: a boat registered on one phone never reached the admin's
 * approval queue, a block never reached the boat it blocked, and every crate
 * released after go-live was invisible to the monthly report and the CSV.
 *
 * The boats come back with the harbour stamped on them so the store can keep
 * its one flat roster across all three harbours.
 */
export function watchRoster(
  harbourId: HarbourId,
  onBoats: (boats: Boat[]) => void,
  onLedger: (entries: LedgerEntry[]) => void,
): () => void {
  let offBoats: (() => void) | null = null
  let offLedger: (() => void) | null = null
  let cancelled = false

  void api().then((a) => {
    if (!a || cancelled) return

    offBoats = a.onValue(a.ref(a.db, `harbours/${harbourId}/boats`), (snap) => {
      const wire = snap.val() as Record<string, WireBoat> | null
      if (!wire) return
      onBoats(
        Object.entries(wire)
          // Skip anything malformed rather than letting it into the roster.
          // A row written by an older build reached the store with no mobile
          // at all, and every later write of that boat threw on it.
          .filter(([, b]) => b && typeof b.name === 'string' && /^[0-9]{4}$/.test(b.mobileLast4))
          .map(([id, b]) => ({
          id,
          harbourId,
          nameEn: b.name,
          nameTe: b.nameTe ?? b.name,
          owner: b.owner,
          // A boat learned from the database carries only its last four
          // digits — all the claim check reads, and all we are willing to
          // publish. `signInAs` compares `slice(-4)`, so both shapes work.
          mobile: b.mobileLast4,
          status: b.status,
          registeredAt: b.registeredAt,
        })),
      )
    })

    // Newest rows only, ordered by WHEN THE CRATE WAS RELEASED.
    //
    // Ordering by key looks equivalent and is not: seeded history is written
    // under its own ids (`nizampatnam-90-0`), a real release under a Firebase
    // push key (`-Oab…`), and `-` sorts below `n`. With the window already
    // full of seed rows, every genuine release fell outside it and reached no
    // phone at all — the admin console and the billing CSV froze on invented
    // data while the app showed no sign of failure. `releasedAt` is the field
    // the report is built on, so ordering by it is also what we mean.
    //
    // `.indexOn: releasedAt` in the rules keeps the sort on the server.
    const recent = a.query(
      a.ref(a.db, `harbours/${harbourId}/ledger`),
      a.orderByChild('releasedAt'),
      a.limitToLast(LEDGER_LIMIT),
    )

    offLedger = a.onValue(recent, (snap) => {
      const wire = snap.val() as Record<string, Omit<LedgerEntry, 'id' | 'harbourId'>> | null
      if (!wire) return
      onLedger(Object.entries(wire).map(([id, row]) => ({ ...row, id, harbourId })))
    })
  })

  return () => {
    cancelled = true
    offBoats?.()
    offLedger?.()
  }
}

/**
 * Whether this phone has a live link to the shared harbour right now.
 *
 * `.info/connected` is Firebase's own socket state and is not governed by
 * the security rules. It is worth watching because the swell API can be
 * reachable while the database is not — a revoked key, a deleted project, a
 * dock wifi that allows one host and not the other. Without this signal the
 * boxes would go on showing a confident "2 free" that stopped updating an
 * hour ago, which is the exact failure this app exists to prevent.
 */
export function watchConnection(onChange: (live: boolean) => void): () => void {
  let off: (() => void) | null = null
  let cancelled = false

  void api().then((a) => {
    if (!a || cancelled) return
    off = a.onValue(a.ref(a.db, '.info/connected'), (snap) => onChange(snap.val() === true))
  })

  return () => {
    cancelled = true
    off?.()
  }
}

/**
 * Publish one boat, so the database can vouch for it.
 *
 * The rules refuse a slot whose `boatId` names no boat at that harbour. That
 * check is only worth having if every boat that books is really there, so
 * registration and approval both write through here.
 */
export async function putBoat(harbourId: HarbourId, boat: Boat): Promise<RemoteResult> {
  const a = await api()
  if (!a) return { ok: false, error: 'offline' }
  try {
    await a.set(a.ref(a.db, `harbours/${harbourId}/boats/${boat.id}`), toWireBoat(boat))
    return { ok: true }
  } catch (error) {
    // Approving or blocking a boat that never reaches the database leaves
    // this phone believing something the harbour does not. Reported, not
    // dropped as an unhandled rejection.
    return { ok: false, error: reasonFor(error) }
  }
}

/**
 * Register a boat under an id no other phone already holds.
 *
 * Hull numbers are picked from the *local* roster, so two skippers
 * registering at the same moment on different phones both mint the same one.
 * The second write was refused by the immutable-mobile rule and dropped
 * silently — leaving that skipper's crates showing under the other person's
 * name, and the admin approving the wrong human.
 *
 * Each candidate is claimed with a transaction that aborts if the id already
 * exists, so exactly one phone can win it. Returns the id actually claimed,
 * or null if the database could not be reached — the caller must not pretend
 * the registration landed.
 */
export async function claimBoat(harbourId: HarbourId, boat: Boat): Promise<string | null> {
  const a = await api()
  if (!a) return null

  let n = Number(boat.id)
  if (!Number.isFinite(n)) return null

  for (let tries = 0; tries < 50; tries += 1, n += 1) {
    const id = String(n).padStart(2, '0')
    try {
      const result = await a.runTransaction(
        a.ref(a.db, `harbours/${harbourId}/boats/${id}`),
        (current: WireBoat | null) => (current ? undefined : toWireBoat({ ...boat, id })),
      )
      if (result.committed) return id
    } catch {
      return null
    }
  }
  return null
}

/**
 * What a boat looks like in the shared copy.
 *
 * Only the last four digits of the mobile number, never the whole one. The
 * boats node is world-readable — it has to be, so any phone can name the boat
 * holding a crate — and publishing twenty fishermen's phone numbers on the
 * open internet is a privacy breach the app has no need to commit. Four
 * digits is exactly what the ownership check compares and nothing more.
 *
 * The full number stays on the phone that registered it and in that device's
 * admin console, which is what the README has always claimed.
 */
interface WireBoat {
  name: string
  nameTe?: string
  owner: string
  mobileLast4: string
  status: Boat['status']
  registeredAt: number
}

function toWireBoat(boat: Boat): WireBoat {
  return {
    name: boat.nameEn,
    nameTe: boat.nameTe,
    owner: boat.owner,
    // Tolerant of a boat that arrived without one. It used to read
    // `boat.mobile.slice(-4)` and threw on the first such record, which took
    // the entire Publish harbour down — twenty good boats lost to one bad row.
    mobileLast4: String(boat.mobile ?? '').slice(-4),
    status: boat.status,
    registeredAt: boat.registeredAt,
  }
}

/**
 * Is this boat complete enough for the database to accept it?
 *
 * Checked before writing rather than discovered as a rejection, so a single
 * unusable record is skipped and counted instead of failing the whole batch.
 */
function writableBoat(boat: Boat): boolean {
  const wire = toWireBoat(boat)
  return (
    /^[0-9]{4}$/.test(wire.mobileLast4) &&
    wire.name.length >= 2 &&
    wire.name.length <= 40 &&
    wire.owner.length >= 2 &&
    wire.owner.length <= 60 &&
    Number.isFinite(wire.registeredAt)
  )
}

/**
 * Seed an empty database once: the boxes, and the roster they refer to.
 *
 * Every write yields to whatever is already there — boats included. Seeding
 * the roster with a plain `set` meant a phone that had been offline all day
 * could press this and revert every approval and every block to its own
 * stale copy, while the button's own help text promised it could not
 * overwrite anything.
 *
 * Returns how many boats it could not write, so the caller can say something
 * true instead of reporting a partial success as total failure.
 */
export async function seedHarbour(
  harbourId: HarbourId,
  boxes: ColdBox[],
  boats: Boat[],
  ledger: LedgerEntry[],
): Promise<{ failed: number; boxesOk: boolean }> {
  const a = await api()
  if (!a) return { failed: boats.length, boxesOk: false }

  // Roster first, always. The rules refuse a slot naming a boat the database
  // has never heard of, and the seeded boxes arrive with crates already in
  // them — so writing boxes first was refused outright on an empty database,
  // which is every first-run.
  const usable = boats.filter(writableBoat)
  const results = await Promise.allSettled(
    usable.map((boat) =>
      a.runTransaction(
        a.ref(a.db, `harbours/${harbourId}/boats/${boat.id}`),
        (current: WireBoat | null) => current ?? toWireBoat(boat),
      ),
    ),
  )
  const skipped = boats.length - usable.length

  try {
    await a.runTransaction(
      a.ref(a.db, `harbours/${harbourId}/boxes`),
      (current: WireBoxes | null) => current ?? boxesToWire(boxes),
    )
  } catch {
    // The roster is in; the boxes are not. Counting the boats as refused was
    // exactly the total failure the line above promised not to report — the
    // admin was told "21 boats were refused" when all 21 had landed. Pressing
    // Publish again is all that is needed, so say which half failed.
    return { failed: skipped, boxesOk: false }
  }

  // The harbour's history. Without it the shared copy becomes the whole
  // truth and the months of reporting the admin console is built on vanish
  // the moment sync comes on.
  //
  // Each row keeps its own id as the key rather than taking a fresh `push`
  // one. That makes publishing idempotent for free: a row that is already
  // there is refused by the append-only rule instead of being written a
  // second time. Checking "is the ledger empty?" first could not do that —
  // two admins pressing Publish at the same moment both saw empty and both
  // wrote the lot, and no rule can ever delete the duplicates.
  await Promise.allSettled(
    ledger.map(({ id, harbourId: _h, ...row }) =>
      a.set(a.ref(a.db, `harbours/${harbourId}/ledger/${ledgerKey(id)}`), row),
    ),
  )

  return { failed: skipped + results.filter((r) => r.status === 'rejected').length, boxesOk: true }
}

/**
 * Overwrite a harbour's shared boxes with a fresh demo state.
 *
 * The only call here that deliberately discards what the database holds, and
 * it exists because Reset demo has to actually reset. With sync on, a reset
 * that only touched this phone would be overwritten by the watcher a second
 * later and the button would look broken. Reset demo is fenced and labelled
 * as a demonstration control; nothing else may call this.
 */
export async function resetRemoteBoxes(
  harbourId: HarbourId,
  boxes: ColdBox[],
): Promise<RemoteResult> {
  const a = await api()
  if (!a) return { ok: false, error: 'offline' }
  try {
    await a.set(a.ref(a.db, `harbours/${harbourId}/boxes`), boxesToWire(boxes))
    return { ok: true }
  } catch (error) {
    // Refused when the roster has not been published yet — the seeded crates
    // name boats the database does not have. Reported, never left to surface
    // as an unhandled rejection.
    return { ok: false, error: reasonFor(error) }
  }
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
        // `undefined` aborts a Firebase transaction; returning `null` asks it
        // to DELETE the node. Nothing is seeded yet, so there is nothing to
        // book against — abort, and never risk proposing a wipe.
        if (!current) {
          refusal = 'unseeded'
          return undefined
        }
        refusal = null
        const now = serverNow()
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
  } catch (error) {
    return { ok: false, error: reasonFor(error) }
  }
}

/**
 * Drop keys whose value is `undefined`.
 *
 * Object spread keeps `{ reservedAt: undefined }` as a real own property, and
 * the Firebase SDK *rejects* undefined rather than dropping it — it threw
 * synchronously inside `runTransaction`, the bare catch below swallowed it,
 * and deposit reported success while writing nothing. The crate stayed a
 * four-hour hold with a catch inside it and was handed to the next boat.
 *
 * It lives here, in the one place every mutation passes through, so no future
 * mutator can reintroduce it.
 */
export function pruneWire(slot: WireSlot): WireSlot {
  const clean: WireSlot = { status: slot.status }
  if (slot.boatId !== undefined) clean.boatId = slot.boatId
  if (slot.species !== undefined) clean.species = slot.species
  if (slot.reservedAt !== undefined) clean.reservedAt = slot.reservedAt
  if (slot.depositedAt !== undefined) clean.depositedAt = slot.depositedAt
  if (slot.plannedOutAt !== undefined) clean.plannedOutAt = slot.plannedOutAt
  return clean
}

/**
 * Mark this boat's held slots in one box as deposited.
 *
 * Scoped to the box, because the 2-crate cap is counted across boxes: a boat
 * may legitimately hold one crate at the Ice Plant and one at Auction Hall.
 * Depositing at one used to mark both occupied, so a physically empty crate
 * showed as full to the whole harbour and blocked a real booking for hours.
 */
export function depositRemote(
  harbourId: HarbourId,
  boatId: string,
  plannedOutAt: number,
  onlyBoxId?: BoxId,
): Promise<RemoteResult> {
  return mutateOwnSlots(
    harbourId,
    boatId,
    ['reserved'],
    (slot) => ({
      status: 'occupied',
      boatId: slot.boatId,
      species: slot.species,
      depositedAt: serverNow(),
      plannedOutAt,
    }),
    onlyBoxId,
  )
}

/** Give back a hold that was never filled, in one box for the same reason. */
export function cancelRemote(
  harbourId: HarbourId,
  boatId: string,
  onlyBoxId?: BoxId,
): Promise<RemoteResult> {
  return mutateOwnSlots(harbourId, boatId, ['reserved'], () => ({ status: 'empty' }), onlyBoxId)
}

/** Free stored crates and append the ledger rows they earned. */
export async function releaseRemote(
  harbourId: HarbourId,
  boatId: string,
  entries: Omit<LedgerEntry, 'id' | 'harbourId'>[],
  onlyBoxId?: BoxId,
): Promise<RemoteResult> {
  const freed = await mutateOwnSlots(
    harbourId,
    boatId,
    ['occupied', 'overstay'],
    () => ({ status: 'empty' }),
    onlyBoxId,
  )
  if (!freed.ok) return freed

  const a = await api()
  if (!a) return { ok: true } // slots are free; the row is the lesser loss

  try {
    // Ledger rows are append-only by rule, so each gets its own key.
    await Promise.all(
      entries.map((entry) => a.set(a.push(a.ref(a.db, `harbours/${harbourId}/ledger`)), entry)),
    )
  } catch {
    // Same judgement as above: the crate is already free, which is what the
    // harbour needs. Swallowing it here rather than leaving an unhandled
    // rejection at the call site — but it must not be reported as failure,
    // because the release itself did happen.
  }
  return { ok: true }
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
): Promise<RemoteResult> {
  const a = await api()
  if (!a) return { ok: false, error: 'offline' }

  try {
    const result = await a.runTransaction(
      a.ref(a.db, `harbours/${harbourId}/boxes`),
      (current: WireBoxes | null) => {
        // `undefined` aborts; `null` would ask Firebase to delete the node.
        if (!current) return undefined
        let touched = false
        for (const boxId of BOX_IDS) {
          if (onlyBoxId && boxId !== onlyBoxId) continue
          for (const [index, slot] of Object.entries(current[boxId] ?? {})) {
            if (slot.boatId !== boatId || !statuses.includes(slot.status)) continue
            current[boxId][index] = pruneWire(change(slot))
            touched = true
          }
        }
        return touched ? current : undefined
      },
    )
    // An abort here means the shared copy held nothing to change — the hold
    // expired, or another phone already did it. That is not a dead link, and
    // saying "no signal" to someone on full bars is a lie.
    return result.committed ? { ok: true } : { ok: false, error: 'stale' }
  } catch (error) {
    return { ok: false, error: reasonFor(error) }
  }
}
