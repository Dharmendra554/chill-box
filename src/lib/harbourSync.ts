import { isOverdue, LEDGER_LIMIT, QUOTA } from '../store/selectors'
import { HOLD_MS } from './time'
import type { Boat, BoxId, ColdBox, HarbourId, LedgerEntry, Slot, Species } from '../types'

/**
 * Shared harbour state, so two phones see one truth.
 *
 * WHY A TRANSACTION, NOT A WRITE
 * ------------------------------
 * The product's whole job is coordinating a scarce shared resource, and a
 * plain write cannot do that: two boats read "one crate free", both write,
 * both believe they hold it, and one arrives to a full box. Every crate is
 * therefore claimed with `runTransaction` — Firebase re-runs the body
 * against fresh data until it commits, so the capacity check is evaluated
 * against what the server actually holds at commit time.
 *
 * ONE SLOT PER WRITE
 * ------------------
 * Each transaction names a single slot (`boxes/$box/$slot`), never the node
 * above it. That is what lets the database rules ask whose crate it is — a
 * rule that can write the `boxes` node can write every slot in it and cannot
 * tell one boat's crate from another's. See `claimSlot` and
 * `firebase/database.rules.json`.
 *
 * The cost is that two crates are two writes, so a booking, a deposit or a
 * release can half-succeed. `reserveRemote` gives back what it won rather
 * than leaving a skipper holding one crate believing they hold two, and
 * `settle` refuses to call a partly-applied change a success.
 *
 * WHAT THIS DOES NOT DO
 * ---------------------
 * The 2-crate cap is still counted here, on the client, because no database
 * rule can count a boat's crates across three boxes. Nor is there an admin
 * identity to check against. The rules enforce shape, identity and crate
 * ownership; they are not harbour policy. The rules file lists exactly what
 * a signed-in client can still do, and the README repeats it.
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
  | 'partial'

/**
 * What happened to a shared write. Every caller must be able to tell the
 * skipper the truth, so none of these return a bare boolean.
 */
export type RemoteResult =
  | { ok: true; freed?: number }
  /** `freed` is how many crates DID move, even when the whole did not. */
  | { ok: false; error: BookingError; freed?: number }

/**
 * Tell a dead link apart from a database that said no. They need different
 * actions from the skipper: wait for signal, or find the harbour admin.
 */
function reasonFor(error: unknown): BookingError {
  const code = (error as { code?: string })?.code ?? (error as Error)?.message ?? ''
  return /permission|denied/i.test(String(code)) ? 'refused' : 'offline'
}

/**
 * Firebase is **88.5 kB gzipped** across four chunks, and it is fetched at
 * start-up, not on demand: `main.tsx` calls `startHarbourSync()` before
 * React mounts. Splitting it out still keeps it out of the entry bundle and
 * off the parse path of a local-only build — but on a shared harbour it is
 * on the critical path, because the loading banner cannot clear until the
 * first snapshot arrives through it.
 *
 * This comment said "~45 kB … loads on demand". Both halves were wrong, and
 * the number was the one quoted onward into the README.
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
    // `update`, not `set`: the boat also carries the `uid` of the device that
    // claimed it, this phone does not know it, and replacing the object would
    // drop it — unclaiming the boat and handing its crates to anyone.
    await a.update(a.ref(a.db, `harbours/${harbourId}/boats/${boat.id}`), toWireBoat(boat))
    return { ok: true }
  } catch (error) {
    // Approving or blocking a boat that never reaches the database leaves
    // this phone believing something the harbour does not. Reported, not
    // dropped as an unhandled rejection.
    return { ok: false, error: reasonFor(error) }
  }
}

/**
 * Bind a boat to this device, first claim wins.
 *
 * This is what makes the slot rules mean anything: until a boat carries a
 * `uid`, the database will let anyone move its crates, because it cannot tell
 * who should. Once it is bound, only this phone can — and the binding can
 * never be reassigned, by rule.
 *
 * Returns false when another device already holds the boat. The last four
 * digits are readable by anyone, so they identify a boat rather than
 * authenticate one; this is the check that actually bites.
 */
export async function claimForThisDevice(
  harbourId: HarbourId,
  boatId: string,
): Promise<'mine' | 'taken' | 'unbound'> {
  const a = await api()
  if (!a?.uid) return 'unbound'

  const ref = a.ref(a.db, `harbours/${harbourId}/boats/${boatId}/uid`)
  try {
    const held = await a.get(ref)
    if (held.exists()) return held.val() === a.uid ? 'mine' : 'taken'

    const result = await a.runTransaction(ref, (current: string | null) => current ?? a.uid)
    return result.snapshot.val() === a.uid ? 'mine' : 'taken'
  } catch {
    // The write was refused — most likely rules that predate this field. The
    // boat stays unbound, which is exactly how the harbour behaved before
    // device binding existed: no worse, and never a locked-out skipper
    // because a rules paste has not happened yet.
    return 'unbound'
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

    // Bind the boat to this device as it is created: whoever registers a boat
    // owns it, with no separate claiming step to lose. Only a genuine rules
    // refusal — an older published rules file that does not know the `uid`
    // field — falls back to registering unbound. A dead link fails the
    // registration instead, so the skipper retries with their binding intact
    // rather than silently owning a boat anyone can move crates for.
    let outcome = await writeNewBoat(a, harbourId, id, boat, a.uid)
    if (outcome === 'refused' && a.uid) {
      outcome = await writeNewBoat(a, harbourId, id, boat, null)
    }

    if (outcome === 'won') return id
    if (outcome !== 'taken') return null
  }
  return null
}

/**
 * Write one candidate hull number, aborting if the id already exists.
 *
 * `bind` is this device's uid, or null to register the boat unbound.
 *
 * Both cases earned their place. Passing `uid: undefined` when there is no
 * signed-in identity constructs a real own property that the Firebase SDK
 * *rejects* — the pruneWire defect, in a second wire shape — and a rules file
 * that predates the `uid` field refuses the child outright. Either way the
 * throw was caught, registration failed on full bars, and the skipper was
 * told "No signal. Nothing was saved". Registering unbound is exactly how the
 * harbour behaved before device binding existed: no worse, and never a
 * skipper who cannot join because a rules paste has not happened yet.
 * `claimForThisDevice` already degraded this way; this call site did not.
 */
async function writeNewBoat(
  a: Api,
  harbourId: HarbourId,
  id: string,
  boat: Boat,
  bind: string | null,
): Promise<'won' | 'taken' | 'refused' | 'offline'> {
  const wire = toWireBoat({ ...boat, id })
  try {
    const result = await a.runTransaction(
      a.ref(a.db, `harbours/${harbourId}/boats/${id}`),
      (current: WireBoat | null) => (current ? undefined : bind ? { ...wire, uid: bind } : wire),
    )
    return result.committed ? 'won' : 'taken'
  } catch (error) {
    // A timeout is not a refusal. Treating every throw as "the rules said
    // no" made a dropped socket fall through to the unbound retry, which
    // then landed on the reconnect — registering a boat that ANY phone in
    // the harbour can move crates for, permanently and silently, because a
    // `uid` can only be written while it is absent and nothing ever tries
    // again. Only a genuine permission denial may cost a skipper their
    // binding.
    return reasonFor(error) === 'refused' ? 'refused' : 'offline'
  }
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
  /** The device that holds this boat. Absent means nobody has claimed it. */
  uid?: string
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
    // Only if the harbour has never been published. Permission is per slot
    // now, so this is a multi-path update rather than a write of the node —
    // and it must still yield to a live harbour rather than flatten it.
    if (!(await readBoxes(a, harbourId))) {
      await a.update(a.ref(a.db, `harbours/${harbourId}/boxes`), slotPaths(boxes))
    }
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
    // A multi-path update, not a write of the whole node: permission is
    // granted per slot now, so each path is checked on its own. Firebase
    // applies them together, so the harbour never renders half-reset.
    await a.update(a.ref(a.db, `harbours/${harbourId}/boxes`), slotPaths(boxes))
    return { ok: true }
  } catch (error) {
    // Refused when the roster has not been published yet — the seeded crates
    // name boats the database does not have. Reported, never left to surface
    // as an unhandled rejection.
    return { ok: false, error: reasonFor(error) }
  }
}

/** `{ 'box1/0': slot, 'box1/1': slot, … }` — one entry per slot. */
export function slotPaths(boxes: ColdBox[]): Record<string, WireSlot> {
  const paths: Record<string, WireSlot> = {}
  for (const box of boxes) {
    for (const slot of box.slots) paths[`${box.id}/${slot.index}`] = toWire(slot)
  }
  return paths
}

/* -- Writes: one slot at a time ---------------------------------------- */

/**
 * WHY EVERY WRITE BELOW TOUCHES A SINGLE SLOT
 * -------------------------------------------
 * Booking used to run one transaction over the harbour's whole `boxes` node.
 * That was atomic and correct against honest racers, but it forced the
 * database rules to grant write permission at the node — and a rule that can
 * write the node can write *every* slot in it. A signed-in client could
 * overwrite another boat's crate, or empty the harbour in one valid request,
 * and no rule could tell the difference.
 *
 * Each crate is now claimed with a transaction on its own slot. That moves the
 * race from the client into the server: two phones aiming at the same slot,
 * the second one's transaction re-runs against the committed first and aborts.
 * And because the write names one slot, the rules can finally ask the only
 * question that matters — *is this your boat?*
 *
 * WHAT IT COSTS
 * -------------
 * Two crates are two writes, so a booking can half-succeed. `reserveRemote`
 * hands back what it won if it cannot win them all. The 2-crate cap is still
 * counted on the client, because no rule can count across three boxes — that
 * was true of the old design too, and the README says so.
 */

/** Read the harbour's boxes once, to choose which slots to aim at. */
async function readBoxes(a: Api, harbourId: HarbourId): Promise<WireBoxes | null> {
  const snap = await a.get(a.ref(a.db, `harbours/${harbourId}/boxes`))
  return snap.exists() ? (snap.val() as WireBoxes) : null
}

/** Is this slot free right now — empty, or a hold that has run out? */
function claimable(slot: WireSlot | undefined, now: number): boolean {
  if (!slot || slot.status === 'empty') return true
  return slot.status === 'reserved' && (slot.reservedAt ?? now) + HOLD_MS <= now
}

/**
 * Claim one slot, or lose it to whoever got there first.
 *
 * The transaction is the whole race: Firebase re-runs this body against fresh
 * data until it commits, so `claimable` is evaluated against what the server
 * actually holds at commit time, not what this phone last saw.
 */
async function claimSlot(
  a: Api,
  harbourId: HarbourId,
  boxId: BoxId,
  index: number,
  boatId: string,
  species: Species,
): Promise<boolean> {
  const result = await a.runTransaction(
    a.ref(a.db, `harbours/${harbourId}/boxes/${boxId}/${index}`),
    (current: WireSlot | null) => {
      const now = serverNow()
      if (!claimable(current ?? undefined, now)) return undefined // lost it
      return { status: 'reserved' as const, boatId, species, reservedAt: now }
    },
  )
  return result.committed
}

/**
 * Change one slot this boat already holds.
 *
 * Guarded inside the transaction as well as outside it: another phone may
 * have released or force-released the crate since we read it.
 */
async function changeOwnSlot(
  a: Api,
  harbourId: HarbourId,
  boxId: BoxId,
  index: number,
  boatId: string,
  statuses: Slot['status'][],
  change: (slot: WireSlot) => WireSlot,
): Promise<boolean> {
  const result = await a.runTransaction(
    a.ref(a.db, `harbours/${harbourId}/boxes/${boxId}/${index}`),
    (current: WireSlot | null) => {
      if (!current || current.boatId !== boatId) return undefined
      if (!statuses.includes(current.status)) return undefined
      return pruneWire(change(current))
    },
  )
  return result.committed
}

/** Every slot in the harbour this boat holds in one of these statuses. */
function ownSlots(
  wire: WireBoxes,
  boatId: string,
  statuses: Slot['status'][],
  onlyBoxId?: BoxId,
  onlyIndexes?: number[],
): Freed[] {
  const found: Freed[] = []
  for (const boxId of BOX_IDS) {
    if (onlyBoxId && boxId !== onlyBoxId) continue
    for (const [index, slot] of Object.entries(wire[boxId] ?? {})) {
      if (onlyIndexes && !onlyIndexes.includes(Number(index))) continue
      if (slot && slot.boatId === boatId && statuses.includes(slot.status)) {
        found.push({ boxId, index: Number(index), slot })
      }
    }
  }
  return found
}

/**
 * The ledger rows a release earned — one per box, from the crates that
 * actually came out of it.
 *
 * `overstay` is derived from the timestamp rather than read from the wire,
 * because the wire never carries the `overstay` status: it is raised on each
 * phone's own copy by `applyTick`. The rules use the same timestamp and the
 * same constant, so the row, the screen and the database agree.
 */
function rowsFor(freed: Freed[], now: number): Omit<LedgerEntry, 'id' | 'harbourId'>[] {
  const rows = new Map<BoxId, Omit<LedgerEntry, 'id' | 'harbourId'>>()
  for (const { boxId, slot } of freed) {
    const depositedAt = slot.depositedAt ?? now
    const late = isOverdue({ status: slot.status, depositedAt }, now)
    const row = rows.get(boxId)
    if (!row) {
      rows.set(boxId, {
        boatId: slot.boatId ?? '',
        boxId,
        crates: 1,
        species: slot.species ?? null,
        depositedAt,
        releasedAt: now,
        overstay: late,
      })
      continue
    }
    row.crates += 1
    row.species ??= slot.species ?? null
    if (depositedAt < row.depositedAt) row.depositedAt = depositedAt
    if (late) row.overstay = true
  }
  return [...rows.values()]
}

/**
 * Take `crates` slots in one box, or fail with a reason.
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

  try {
    const wire = await readBoxes(a, harbourId)
    // Nothing published yet: there is no harbour to book against, and saying
    // "no signal" to someone on full bars would be the wrong reason.
    if (!wire) return { ok: false, error: 'unseeded' }

    const now = serverNow()

    // The cap, counted across all three boxes. Still a client-side rule: no
    // database rule can count a boat's crates in boxes it is not writing to.
    const held = BOX_IDS.reduce(
      (n, id) =>
        n +
        Object.values(wire[id] ?? {}).filter(
          (s) => s && s.boatId === boatId && s.status !== 'empty' && !claimable(s, now),
        ).length,
      0,
    )
    if (held + crates > QUOTA) return { ok: false, error: 'quota' }

    const candidates = Object.entries(wire[boxId] ?? {})
      .filter(([, slot]) => claimable(slot, now))
      .map(([index]) => Number(index))
      .sort((x, y) => x - y)
    if (candidates.length < crates) return { ok: false, error: 'boxFull' }

    // One slot at a time, taking the next candidate whenever we lose a race.
    //
    // Half a booking is worse than none: the skipper would hold one crate
    // while believing they had two. The giveback is in a `finally` because a
    // rules refusal REJECTS `claimSlot` — so a throw on the second crate used
    // to unwind straight past the giveback, leaving the first crate reserved
    // on the server while the skipper was told the write had been refused and
    // that he held nothing. That crate then blocked the box for four hours.
    const won: number[] = []
    try {
      for (const index of candidates) {
        if (won.length === crates) break
        if (await claimSlot(a, harbourId, boxId, index, boatId, species)) won.push(index)
      }
    } finally {
      if (won.length !== crates) {
        for (const index of won) {
          // Best effort: if this throws too, the outer catch reports the
          // original failure, which is the one the skipper needs.
          await changeOwnSlot(a, harbourId, boxId, index, boatId, ['reserved'], () => ({
            status: 'empty',
          }))
        }
      }
    }

    // The box filled up, which is exactly what happened.
    return won.length === crates ? { ok: true } : { ok: false, error: 'boxFull' }
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
export async function depositRemote(
  harbourId: HarbourId,
  boatId: string,
  plannedOutAt: number,
  onlyBoxId?: BoxId,
): Promise<RemoteResult> {
  return settle(
    await mutateOwnSlots(
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
    ),
  )
}

/** Give back a hold that was never filled, in one box for the same reason. */
export async function cancelRemote(
  harbourId: HarbourId,
  boatId: string,
  onlyBoxId?: BoxId,
): Promise<RemoteResult> {
  return settle(
    await mutateOwnSlots(harbourId, boatId, ['reserved'], () => ({ status: 'empty' }), onlyBoxId),
  )
}

/** Free stored crates and append the ledger rows they earned. */
export async function releaseRemote(
  harbourId: HarbourId,
  boatId: string,
  onlyBoxId?: BoxId,
  onlyIndexes?: number[],
): Promise<RemoteResult> {
  const freed = await mutateOwnSlots(
    harbourId,
    boatId,
    ['occupied', 'overstay'],
    () => ({ status: 'empty' }),
    onlyBoxId,
    onlyIndexes,
  )
  if (!freed.ok) return freed
  if (freed.freed.length === 0) return { ok: false, error: 'stale' }

  const a = await api()
  // Slots are free; the row is the lesser loss.
  if (!a) return { ok: true, freed: freed.freed.length }

  try {
    // The rows are built HERE, from the slots that actually came out, rather
    // than handed in from what the caller hoped would happen. They used to
    // arrive precomputed and be trimmed with `slice(0, changed)` — but those
    // entries are one row PER BOX carrying an aggregated crate count, while
    // `changed` counts SLOTS. Two units, one array: releasing two crates and
    // winning one wrote a single row saying `crates: 2`. The ledger is what
    // the society bills off and no rule can ever delete a row, so that
    // charged a fisherman for a crate still sitting in the box.
    await Promise.all(
      rowsFor(freed.freed, serverNow()).map((row) =>
        a.set(a.push(a.ref(a.db, `harbours/${harbourId}/ledger`)), row),
      ),
    )
  } catch {
    // Same judgement as above: the crate is already free, which is what the
    // harbour needs. Swallowing it here rather than leaving an unhandled
    // rejection at the call site — but it must not be reported as failure,
    // because the release itself did happen.
  }
  // Freed some but not all: the skipper has crates still in the box and must
  // be told so, even though the rows for what did come out are written.
  return settle(freed)
}

/**
 * Which of this boat's slots moved, out of how many were aimed at.
 *
 * The slots themselves, not a count: a release has to write one ledger row
 * per crate that ACTUALLY came out, and a count cannot say which box those
 * crates were in. Counting instead of correlating billed a fisherman for two
 * crates when one was still in the box.
 */
type Freed = { boxId: BoxId; index: number; slot: WireSlot }
type SlotChange = { ok: true; freed: Freed[]; total: number } | { ok: false; error: BookingError }

/**
 * Rewrite every slot this boat owns in the given statuses.
 *
 * Slot by slot, in parallel, because permission is granted per slot and the
 * rules check each write against that slot's owner. It is NOT one
 * transaction and cannot be: two crates are two writes, and either can lose.
 * The comment here used to claim otherwise, which is how `settle` came to be
 * needed.
 */
async function mutateOwnSlots(
  harbourId: HarbourId,
  boatId: string,
  statuses: Slot['status'][],
  change: (slot: WireSlot) => WireSlot,
  onlyBoxId?: BoxId,
  onlyIndexes?: number[],
): Promise<SlotChange> {
  const a = await api()
  if (!a) return { ok: false, error: 'offline' }

  try {
    const wire = await readBoxes(a, harbourId)
    if (!wire) return { ok: false, error: 'stale' }

    const mine = ownSlots(wire, boatId, statuses, onlyBoxId, onlyIndexes)
    // Nothing to change is not a dead link. The hold ran out, or another
    // phone got there first — saying "no signal" on full bars is a lie.
    if (mine.length === 0) return { ok: false, error: 'stale' }

    // allSettled, NOT all. A security-rule refusal REJECTS the transaction
    // promise, and `Promise.all` would throw away the siblings that had
    // already committed on the server — so a crate came out of the box, no
    // ledger row was written for it, no audit row either, and the harbour
    // master was told the record had refused the whole thing. Every write
    // that lands has to be accounted for, whatever its neighbours did.
    //
    // Each re-checks ownership inside its own transaction, so a crate
    // released from another phone while this ran is skipped rather than
    // resurrected.
    const done = await Promise.allSettled(
      mine.map(({ boxId, index }) =>
        changeOwnSlot(a, harbourId, boxId, index, boatId, statuses, change),
      ),
    )
    const freed = mine.filter((_, i) => done[i].status === 'fulfilled' && done[i].value)

    // Nothing moved AND the database said no. Filtering rejections out made a
    // refusal indistinguishable from a lost race, so a skipper whose write
    // was denied — anonymous sign-in off, rules a commit behind, or a phone
    // that lost its identity — was told "That is already done" and walked
    // away from a crate still holding his catch. A refusal must always read
    // as a refusal; that is what sends him to find the harbour master.
    // ANY rejection, not only a permission denial. `runTransaction` also
    // rejects with a bare `Error('maxretry')` after 25 re-runs, and with
    // `Error('set')` when a plain write lands on the same path — which is
    // what an admin pressing Reset demo does to a skipper mid-deposit.
    // Neither carries a code, so `reasonFor` calls them `offline`, and
    // checking only for `refused` let them fall through to `stale`: "That is
    // already done." Nothing was written, the crate is still a four-hour
    // hold with the catch inside it, and the skipper walks away.
    const failed = done.find((r) => r.status === 'rejected')
    if (freed.length === 0 && failed) {
      return { ok: false, error: reasonFor(failed.reason) }
    }
    return { ok: true, freed, total: mine.length }
  } catch (error) {
    return { ok: false, error: reasonFor(error) }
  }
}

/**
 * Turn a slot-by-slot outcome into something the skipper can act on.
 *
 * Reporting "at least one slot committed" as success is how a boat holding
 * two crates could tap **Fish deposited**, see it confirmed, and walk away
 * with the second crate still on a four-hour hold *with the catch inside it*.
 * Four hours later that hold expired and the crate was handed to the next
 * boat, who found it full. That is the round-3 defect, reintroduced by the
 * per-slot rewrite through a different door, and this function is the one
 * place it can come back.
 *
 * Nothing moved at all is `stale` — an expired hold, or another phone that
 * got there first. Some but not all is its own reason, because the skipper
 * has to go and look at the box.
 */
function settle(result: SlotChange): RemoteResult {
  if (!result.ok) return result
  const freed = result.freed.length
  if (freed === 0) return { ok: false, error: 'stale', freed }
  return freed === result.total ? { ok: true, freed } : { ok: false, error: 'partial', freed }
}
