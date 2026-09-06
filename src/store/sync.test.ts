import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { useDockStore as Store } from './useDockStore'

/**
 * The shared-harbour branch, which the rest of the suite cannot reach.
 *
 * `vite.config.ts` pins the Firebase env to empty for tests, so all the other
 * tests run the local path — the path that never executes in the deployed
 * configuration. That gap hid a defect that made the app impossible to set
 * up: nothing proved the link was alive on an empty database, so every write
 * was refused, including the one that would have seeded the harbour.
 *
 * Firebase itself is stubbed. These tests are about what the STORE does with
 * a shared harbour, not about the network.
 */

vi.mock('firebase/app', () => ({ initializeApp: () => ({}) }))
vi.mock('firebase/auth', () => ({
  getAuth: () => ({}),
  onAuthStateChanged: (_a: unknown, cb: (u: null) => void) => {
    cb(null)
    return () => {}
  },
  signInAnonymously: async () => ({ user: { uid: 'test-uid' } }),
}))
/** Every path the store writes to, in order, so ordering can be asserted. */
const writes: string[] = []

vi.mock('firebase/database', () => ({
  getDatabase: () => ({}),
  ref: (_db: unknown, path?: string) => ({ path: path ?? '' }),
  query: (r: { path: string }) => r,
  limitToLast: () => ({}),
  onValue: () => () => {},
  get: async () => ({ exists: () => false }),
  set: async (r: { path: string }) => {
    writes.push(`set ${r.path}`)
  },
  push: (r: { path: string }) => ({ path: `${r.path}/generated` }),
  runTransaction: async (r: { path: string }) => {
    writes.push(`txn ${r.path}`)
    return { committed: false }
  },
}))

let useDockStore: typeof Store

beforeAll(async () => {
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key')
  vi.stubEnv('VITE_FIREBASE_DATABASE_URL', 'https://example.firebaseio.test')
  vi.resetModules()
  useDockStore = (await import('./useDockStore')).useDockStore
})

describe('a shared harbour that has not proven itself live', () => {
  it('refuses to book, and says so without claiming the hold expired', async () => {
    useDockStore.getState().resetDemo()
    useDockStore.setState({ syncLive: false })
    useDockStore.getState().setLang('en')
    useDockStore.getState().signInAs('04', '2004')

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
    useDockStore.getState().resetDemo()
    useDockStore.setState({ syncLive: true, toast: null })
    useDockStore.getState().setLang('en')
    useDockStore.getState().signInAs('04', '2004')

    useDockStore.getState().release()
    await new Promise((r) => setTimeout(r, 20))

    const text = useDockStore.getState().toast?.text ?? ''
    expect(text).not.toMatch(/hold ended/i)
  })

  it('publishes the roster before the boxes that name it', async () => {
    // The rules refuse a slot naming a boat the database has never heard of,
    // and the seeded boxes arrive with crates already in them. Writing boxes
    // first meant Publish harbour could never succeed on a new database.
    writes.length = 0
    useDockStore.setState({ syncLive: true })
    await useDockStore.getState().publishHarbour()

    const firstBoat = writes.findIndex((w) => w.includes('/boats/'))
    const firstBoxes = writes.findIndex((w) => w.endsWith('/boxes'))
    expect(firstBoat).toBeGreaterThanOrEqual(0)
    expect(firstBoxes).toBeGreaterThanOrEqual(0)
    expect(firstBoat).toBeLessThan(firstBoxes)
  })

  it('writes each history row under its own id, so publishing twice cannot duplicate it', async () => {
    // Append-only rules then make a second publish a no-op. A push() key
    // would have written the whole history again, unremovably.
    writes.length = 0
    useDockStore.setState({ syncLive: true })
    await useDockStore.getState().publishHarbour()

    const ledgerWrites = writes.filter((w) => w.includes('/ledger/'))
    expect(ledgerWrites.length).toBeGreaterThan(0)
    expect(ledgerWrites.every((w) => !w.includes('generated'))).toBe(true)
    expect(new Set(ledgerWrites).size).toBe(ledgerWrites.length)
  })

  it('never writes the boxes locally when the harbour is shared', async () => {
    useDockStore.getState().resetDemo()
    useDockStore.setState({ syncLive: true })
    useDockStore.getState().signInAs('04', '2004')

    const before = JSON.stringify(useDockStore.getState().boxesByHarbour)
    // The stub commits nothing, so this fails — the point is that the store
    // must not have optimistically changed the boxes on the way past. A hold
    // that is not in the shared copy is not a hold.
    await useDockStore.getState().reserve('box3', 1, 'prawn')
    expect(JSON.stringify(useDockStore.getState().boxesByHarbour)).toBe(before)
  })
})
