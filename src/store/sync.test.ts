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

/** Slot paths the "rules" refuse, so a half-committed write can be forced. */
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
    const current = readPath(r.path)
    const next = fn(current)
    if (next === undefined || refuse.has(r.path)) {
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

/** A published harbour with the roster in place, ready to book against. */
async function publishedHarbour() {
  for (const key of Object.keys(db)) delete db[key]
  refuse.clear()
  rejectUid = false
  writes.length = 0
  useDockStore.setState({ syncLive: true, toast: null })
  useDockStore.getState().setLang('en')
  await useDockStore.getState().publishHarbour()
}

beforeAll(async () => {
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key')
  vi.stubEnv('VITE_FIREBASE_DATABASE_URL', 'https://example.firebaseio.test')
  vi.resetModules()
  useDockStore = (await import('./useDockStore')).useDockStore
  sync = await import('../lib/harbourSync')
})

beforeEach(() => {
  useDockStore.setState({ toast: null })
})

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
    useDockStore.setState({ syncLive: false })
    expect(await useDockStore.getState().deposit(4)).toBe(false)
  })

  it('refuses a release without saying the hold expired', async () => {
    // The shared copy having nothing to change is not the same as a hold
    // running out — this exact mapping told skippers whose release had just
    // succeeded that their 4-hour hold had ended.
    await publishedHarbour()
    await useDockStore.getState().signInAs('04', '2004')
    useDockStore.setState({ toast: null })

    await useDockStore.getState().release()

    const text = useDockStore.getState().toast?.text ?? ''
    expect(text).not.toMatch(/hold ended/i)
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

    expect(await sync.reserveRemote('nizampatnam', 'box3', '04', 1, 'prawn')).toEqual({ ok: true })
    expect(await sync.depositRemote('nizampatnam', '04', Date.now() + 3600_000)).toEqual({
      ok: true,
    })
    await sync.releaseRemote('nizampatnam', '04', [
      { boatId: '04', boxId: 'box3', crates: 1, species: 'prawn', depositedAt: 1, releasedAt: 2, overstay: false },
    ])

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
    expect(await sync.reserveRemote('nizampatnam', 'box3', '04', 2, 'prawn')).toEqual({ ok: true })

    const held = Object.keys(db).filter(
      (path) =>
        path.startsWith('harbours/nizampatnam/boxes/box3/') &&
        (db[path] as { boatId?: string })?.boatId === '04',
    )
    expect(held.length).toBe(2)
    refuse.add(held[1])

    expect(await sync.depositRemote('nizampatnam', '04', Date.now() + 3600_000)).toEqual({
      ok: false,
      error: 'partial',
    })
  })

  it('writes one ledger row per crate actually freed, never per crate attempted', async () => {
    // The ledger is what the society bills off and no rule can ever delete a
    // row, so an over-reported release charges a fisherman for a crate still
    // sitting in the box.
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
    writes.length = 0

    const row = {
      boatId: '04',
      boxId: 'box3' as const,
      crates: 1,
      species: 'prawn' as const,
      depositedAt: 1,
      releasedAt: 2,
      overstay: false,
    }
    expect(await sync.releaseRemote('nizampatnam', '04', [row, row])).toEqual({
      ok: false,
      error: 'partial',
    })

    expect(writes.filter((w) => w.includes('/ledger/')).length).toBe(1)
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
