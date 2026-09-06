import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { useDockStore as Store } from './useDockStore'
import type * as SyncModule from '../lib/harbourSync'

/**
 * The shared-harbour branch, which the rest of the suite cannot reach.
 *
 * `vite.config.ts` pins the Firebase env to empty for tests, so all the other
 * tests run the local path — the path that never executes in the deployed
 * configuration. That gap hid a defect that made the app impossible to set
 * up: nothing proved the link was alive on an empty database, so every write
 * was refused, including the one that would have seeded the harbour.
 *
 * Firebase is stubbed by a TINY IN-MEMORY DATABASE rather than by a stub
 * that refuses everything. The refusing stub was worse than no test: `get`
 * always reported an empty harbour, so `reserve`, `deposit` and `release`
 * all returned at their first guard and never reached the slot writes. The
 * test named "the security property the rules depend on" asserted over
 * writes that came entirely from `publishHarbour` — every slot function in
 * the file could have been deleted and it would still have passed.
 */

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }))
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  // Asynchronously, the way the real SDK does. Calling back synchronously
  // runs `signIn`'s handler before its own unsubscribe binding exists, which
  // throws into the catch and hands the app a null identity — so every test
  // in this file quietly ran with no uid, and nothing that depends on the
  // device binding was being exercised at all.
  onAuthStateChanged: (_a: unknown, cb: (u: null) => void) => {
    queueMicrotask(() => cb(null))
    return () => {}
  },
  signInAnonymously: async () => ({ user: { uid: 'test-uid' } }),
}))

/** Every path the store writes to, in order, so ordering can be asserted. */
const writes: string[] = []

/** Leaf values by full path — `harbours/nizampatnam/boxes/box1/0`. */
const db: Record<string, unknown> = {}

/**
 * Slot paths the "rules" refuse, so a half-committed write can be forced.
 *
 * A refusal REJECTS the transaction promise — it does not resolve with
 * `committed: false`, which is what a lost race looks like. Modelling a
 * refusal as a lost race meant the tests only ever exercised the branch
 * Firebase does not take, and the branch it does take threw away every
 * sibling write that had already committed.
 */
const refuse = new Set<string>()

/** Whether writing a boat that carries a `uid` throws, as old rules do. */
let rejectUid = false

/** Assemble a node from the leaves beneath it, the way a snapshot reads. */
function readPath(path: string): unknown {
  if (path in db) return db[path]
  const prefix = `${path}/`
  const children: Record<string, unknown> = {}
  for (const key of Object.keys(db)) {
    if (!key.startsWith(prefix)) continue
    const head = key.slice(prefix.length).split('/')[0]
    if (!(head in children)) children[head] = readPath(`${path}/${head}`)
  }
  return Object.keys(children).length > 0 ? children : null
}

vi.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db: unknown, path?: string) => ({ path: path ?? '' }),
  query: (r: { path: string }) => r,
  orderByChild: () => ({}),
  limitToLast: () => ({}),
  onValue: () => () => {},
  get: async (r: { path: string }) => {
    const value = readPath(r.path)
    return { exists: () => value !== null, val: () => value }
  },
  set: async (r: { path: string }, value: unknown) => {
    writes.push(`set ${r.path}`)
    db[r.path] = value
  },
  update: async (r: { path: string }, values: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(values)) {
      writes.push(`update ${r.path}/${key}`)
      db[`${r.path}/${key}`] = value
    }
  },
  push: (r: { path: string }) => ({ path: `${r.path}/gen${Object.keys(db).length}` }),
  runTransaction: async (r: { path: string }, fn: (current: unknown) => unknown) => {
    writes.push(`txn ${r.path}`)
    if (refuse.has(r.path)) {
      throw Object.assign(new Error('permission_denied'), { code: 'PERMISSION_DENIED' })
    }
    const current = readPath(r.path)
    const next = fn(current)
    if (next === undefined) {
      return { committed: false, snapshot: { val: () => current } }
    }
    if (rejectUid && (next as { uid?: string })?.uid !== undefined) {
      throw Object.assign(new Error('permission_denied'), { code: 'PERMISSION_DENIED' })
    }
    db[r.path] = next
    return { committed: true, snapshot: { val: () => next } }
  },
}))

let useDockStore: typeof Store
let sync: typeof SyncModule
let seed: (now: number) => object

/** A published harbour with the roster in place, ready to book against. */
async function publishedHarbour() {
  for (const key of Object.keys(db)) delete db[key]
  refuse.clear()
  rejectUid = false
  writes.length = 0
  // A clean local store too: `publishHarbour` publishes this phone's boxes,
  // so a crate left behind by an earlier test would be seeded into the
  // "fresh" harbour and count against the boat's cap.
  useDockStore.setState({ ...seed(Date.now()), syncLive: true, toast: null })
  useDockStore.getState().setLang('en')
  await useDockStore.getState().publishHarbour()
}

beforeAll(async () => {
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key')
  vi.stubEnv('VITE_FIREBASE_DATABASE_URL', 'https://example.firebaseio.test')
  vi.resetModules()
  const mod = await import('./useDockStore')
  useDockStore = mod.useDockStore
  seed = mod.seed
  sync = await import('../lib/harbourSync')
})

beforeEach(() => {
  useDockStore.setState({ toast: null })
})

/**
 * Put a crate for boat 04 into THIS phone's view, as the watcher would.
 *
 * Without it the store's own guards ("you are not holding anything") return
 * before the network is ever reached, so a test aimed at a sync refusal was
 * silently asserting on a local guard instead — two tests here passed no
 * matter what the code under them did.
 */
function holdLocally(status: 'reserved' | 'occupied') {
  const { boxesByHarbour, harbourId } = useDockStore.getState()
  const now = Date.now()
  const boxes = boxesByHarbour[harbourId].map((box) =>
    box.id !== 'box3'
      ? box
      : {
          ...box,
          slots: box.slots.map((slot) =>
            slot.index !== 0
              ? slot
              : {
                  ...slot,
                  status,
                  boatId: '04',
                  species: 'prawn' as const,
                  reservedAt: status === 'reserved' ? now : null,
                  depositedAt: status === 'occupied' ? now : null,
                  plannedOutAt: null,
                },
          ),
        },
  )
  useDockStore.setState({ boxesByHarbour: { ...boxesByHarbour, [harbourId]: boxes } })
}

describe('a shared harbour that has not proven itself live', () => {
  it('refuses to book, and says so without claiming the hold expired', async () => {
    await publishedHarbour()
    await useDockStore.getState().signInAs('04', '2004')
    useDockStore.setState({ syncLive: false, toast: null })

    expect(await useDockStore.getState().reserve('box3', 1, 'prawn')).toBe(false)
    // Not "your hold ended", and not a booking sentence on a non-booking
    // control: the refusal has to name the real cause.
    expect(useDockStore.getState().toast?.text).toMatch(/No signal/i)
  })

  it('refuses to deposit rather than reporting a success that never happened', async () => {
    await publishedHarbour()
    await useDockStore.getState().signInAs('04', '2004')
    holdLocally('reserved')
    useDockStore.setState({ syncLive: false, toast: null })

    expect(await useDockStore.getState().deposit(4)).toBe(false)
    // The link guard, not the "you hold nothing" guard: this test used to
    // pass because boat 04 holds nothing in the seeded harbour, so it never
    // reached the network check it is named for.
    expect(useDockStore.getState().toast?.text).toMatch(/No signal/i)
  })

  it('refuses a release without saying the hold expired', async () => {
    // The shared copy having nothing to change is not the same as a hold
    // running out — this exact mapping told skippers whose release had just
    // succeeded that their 4-hour hold had ended.
    await publishedHarbour()
    await useDockStore.getState().signInAs('04', '2004')
    holdLocally('occupied')
    useDockStore.setState({ toast: null })

    // This phone believes it holds a crate; the shared copy has nothing for
    // this boat, so the release finds nothing to change.
    await useDockStore.getState().release()

    const text = useDockStore.getState().toast?.text ?? ''
    expect(text).not.toMatch(/hold ended/i)
    expect(text).toMatch(/nothing left to change/i)
  })

  it('publishes the roster before the boxes that name it', async () => {
    // The rules refuse a slot naming a boat the database has never heard of,
    // and the seeded boxes arrive with crates already in them. Writing boxes
    // first meant Publish harbour could never succeed on a new database.
    await publishedHarbour()

    const firstBoat = writes.findIndex((w) => w.includes('/boats/'))
    const firstBoxes = writes.findIndex((w) => w.includes('/boxes/box'))
    expect(firstBoat).toBeGreaterThanOrEqual(0)
    expect(firstBoxes).toBeGreaterThanOrEqual(0)
    expect(firstBoat).toBeLessThan(firstBoxes)
  })

  it('writes each history row under its own id, so publishing twice cannot duplicate it', async () => {
    // Append-only rules then make a second publish a no-op. A push() key
    // would have written the whole history again, unremovably.
    await publishedHarbour()

    const ledgerWrites = writes.filter((w) => w.includes('/ledger/'))
    expect(ledgerWrites.length).toBeGreaterThan(0)
    expect(ledgerWrites.every((w) => !w.includes('gen'))).toBe(true)
    expect(new Set(ledgerWrites).size).toBe(ledgerWrites.length)
  })

  it('never writes the whole boxes node — permission is granted per slot', async () => {
    // The security property the rules depend on. A write addressed at the
    // boxes node cannot be checked against a slot's owner, which is how a
    // signed-in client could once overwrite another boat's crate or empty the
    // harbour outright. Every write must name one slot.
    // Straight at the sync layer: the store's own deposit and release are
    // gated on local state that only the watcher fills in, and the watcher
    // is not what is being tested here.
    await publishedHarbour()
    writes.length = 0

    expect(await sync.reserveRemote('nizampatnam', 'box3', '04', 1, 'prawn')).toMatchObject({ ok: true })
    expect(await sync.depositRemote('nizampatnam', '04', Date.now() + 3600_000)).toMatchObject({
      ok: true,
    })
    await sync.releaseRemote('nizampatnam', '04')

    const boxWrites = writes.filter((w) => w.includes('/boxes'))
    // Proof the booking path actually ran, not just the seed: without this
    // the assertion below passes over an empty list.
    expect(boxWrites.length).toBeGreaterThanOrEqual(3)
    for (const write of boxWrites) {
      // …/boxes/box1/7 — a box and a slot, never the bare node.
      expect(write).toMatch(/\/boxes\/box[1-3]\/\d+$/)
    }
  })

  it('never writes the boxes locally when the harbour is shared', async () => {
    await publishedHarbour()
    await useDockStore.getState().signInAs('04', '2004')
    refuse.add('harbours/nizampatnam/boxes/box3/0')

    const before = JSON.stringify(useDockStore.getState().boxesByHarbour)
    await useDockStore.getState().reserve('box3', 1, 'prawn')
    // A hold that is not in the shared copy is not a hold: the store must
    // not have optimistically changed the boxes on the way past.
    expect(JSON.stringify(useDockStore.getState().boxesByHarbour)).toBe(before)
  })
})

describe('a write that only half lands', () => {
  it('does not report a two-crate deposit as done when one crate stayed on hold', async () => {
    // Two crates are two writes and either can lose. Reporting "at least one
    // committed" as success sent a skipper away believing both crates were
    // stored, while the second sat on a four-hour hold WITH THE CATCH IN IT
    // and was handed to the next boat when it expired.
    await publishedHarbour()
    expect(await sync.reserveRemote('nizampatnam', 'box3', '04', 2, 'prawn')).toMatchObject({ ok: true })

    const held = Object.keys(db).filter(
      (path) =>
        path.startsWith('harbours/nizampatnam/boxes/box3/') &&
        (db[path] as { boatId?: string })?.boatId === '04',
    )
    expect(held.length).toBe(2)
    refuse.add(held[1])

    expect(await sync.depositRemote('nizampatnam', '04', Date.now() + 3600_000)).toMatchObject({
      ok: false,
      error: 'partial',
    })
  })

  it('bills the crates that actually came out, not the ones aimed at', async () => {
    // The row's `crates` count is the whole point: the ledger is what the
    // society bills off and no rule can ever delete a row. Releasing two and
    // winning one used to write ONE row saying `crates: 2`, because the
    // trimming counted slots while the rows counted boxes.
    await publishedHarbour()
    await sync.reserveRemote('nizampatnam', 'box3', '04', 2, 'prawn')
    await sync.depositRemote('nizampatnam', '04', Date.now() + 3600_000)

    const stored = Object.keys(db).filter(
      (path) =>
        path.startsWith('harbours/nizampatnam/boxes/box3/') &&
        (db[path] as { boatId?: string })?.boatId === '04',
    )
    expect(stored.length).toBe(2)
    refuse.add(stored[1])

    expect(await sync.releaseRemote('nizampatnam', '04')).toMatchObject({
      ok: false,
      error: 'partial',
    })

    const rows = Object.keys(db)
      .filter((path) => path.startsWith('harbours/nizampatnam/ledger/gen'))
      .map((path) => db[path] as { crates: number; boxId: string })
    expect(rows.map((r) => r.crates)).toEqual([1])
    expect(rows[0].boxId).toBe('box3')
  })

  it('still bills a crate whose sibling write was refused outright', async () => {
    // A rules refusal REJECTS. `Promise.all` discarded the sibling that had
    // already committed on the server, so a crate came out of the box with
    // no ledger row and no audit row, and the harbour master was told the
    // record had refused the whole thing.
    await publishedHarbour()
    await sync.reserveRemote('nizampatnam', 'box1', '04', 1, 'prawn')
    await sync.reserveRemote('nizampatnam', 'box3', '04', 1, 'crab')
    await sync.depositRemote('nizampatnam', '04', Date.now() + 3600_000)

    const stored = Object.keys(db).filter(
      (path) =>
        /harbours\/nizampatnam\/boxes\/box[13]\//.test(path) &&
        (db[path] as { boatId?: string })?.boatId === '04',
    )
    expect(stored.length).toBe(2)
    refuse.add(stored[1])

    const outcome = await sync.releaseRemote('nizampatnam', '04')
    expect(outcome).toMatchObject({ ok: false, error: 'partial' })

    // The crate that DID come out is billed, in its own box.
    const rows = Object.keys(db)
      .filter((path) => path.startsWith('harbours/nizampatnam/ledger/gen'))
      .map((path) => db[path] as { crates: number; boxId: string })
    expect(rows.length).toBe(1)
    expect(rows[0].crates).toBe(1)
  })
})

describe('a client running ahead of the published rules', () => {
  it('registers the boat unbound rather than failing and blaming the network', async () => {
    // Registration writes the boat with a `uid` to bind it to this phone. A
    // rules file that predates that field refuses the unknown child, the
    // throw was swallowed, and a skipper standing on full bars was told "No
    // signal. Nothing was saved". A rules deployment lagging a code
    // deployment must never stop someone joining the harbour.
    await publishedHarbour()
    rejectUid = true
    writes.length = 0

    const result = await useDockStore.getState().register({
      boatName: 'Kadal Rani',
      owner: 'Suri',
      mobile: '9848011111',
    })
    expect(result.ok).toBe(true)
    const id = result.ok ? result.id : null

    expect(id).not.toBeNull()
    const boat = db[`harbours/nizampatnam/boats/${id}`] as { uid?: string; owner?: string }
    expect(boat?.owner).toBe('Suri')
    expect(boat?.uid).toBeUndefined()
  })

  it('binds the boat to this phone when the rules allow it', async () => {
    await publishedHarbour()
    rejectUid = false

    const result = await useDockStore.getState().register({
      boatName: 'Samudra Devi',
      owner: 'Naidu',
      mobile: '9848012222',
    })
    expect(result.ok).toBe(true)
    const id = result.ok ? result.id : null

    const boat = db[`harbours/nizampatnam/boats/${id}`] as { uid?: string }
    expect(boat?.uid).toBe('test-uid')
  })
})

describe('a database that says no', () => {
  it('reports a refusal as a refusal, never as "already done"', async () => {
    // Filtering rejections out of allSettled made a total refusal look
    // identical to a lost race, so a skipper whose deposit was DENIED —
    // anonymous sign-in off, rules a commit behind, a phone that lost its
    // identity — was told the harbour record had nothing left to change,
    // and walked away from a crate still holding his catch.
    await publishedHarbour()
    await sync.reserveRemote('nizampatnam', 'box3', '04', 1, 'prawn')

    const held = Object.keys(db).filter(
      (path) =>
        path.startsWith('harbours/nizampatnam/boxes/box3/') &&
        (db[path] as { boatId?: string })?.boatId === '04',
    )
    expect(held.length).toBe(1)
    refuse.add(held[0])

    expect(await sync.depositRemote('nizampatnam', '04', Date.now() + 3600_000)).toMatchObject({
      ok: false,
      error: 'refused',
    })
  })
})
