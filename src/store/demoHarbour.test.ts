import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ColdBox, HarbourId } from '../types'

/**
 * The demo sandbox, in the build shape that actually has one.
 *
 * These need a CONFIGURED build with the demo flag set — `demoMode` is
 * `syncEnabled && readFlag()`, so in the suite's default no-config
 * environment it is false and every one of these paths is unreachable. That
 * is not an accident of the test setup, it is the fix from this round: a
 * build with no database is somebody's LOCAL DEPLOYMENT, not a sandbox, and
 * the reseed below must never touch it.
 *
 * So the environment is stubbed and the modules are re-imported, exactly as
 * `lib/mode.test.ts` does.
 */

const MODE_KEY = 'ap-chill-box.mode'

function makeStorage() {
  const map = new Map<string, string>()
  return {
    map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  }
}

let storage: ReturnType<typeof makeStorage>

/** Load the store in a demo session. */
async function loadDemo() {
  vi.resetModules()
  return await import('./useDockStore')
}

beforeEach(() => {
  storage = makeStorage()
  storage.setItem(MODE_KEY, '1')
  vi.stubGlobal('localStorage', storage)
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key')
  vi.stubEnv('VITE_FIREBASE_DATABASE_URL', 'https://example.firebaseio.test')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const held = (boxes: ColdBox[]) =>
  boxes.flatMap((b) => b.slots).filter((s) => s.status !== 'empty')

describe('waking a demo harbour that slept through its own overstay window', () => {
  it('reseeds the harbour it checked, and touches no other', async () => {
    // The guard read the ACTIVE harbour and the write replaced all three, so
    // looking around a second harbour destroyed the crates a skipper had
    // deposited an hour ago in the first.
    const store = await loadDemo()
    const { createMockBoxes } = await import('../data/mock')
    const H: HarbourId = 'nizampatnam'
    const twelveHoursAgo = Date.now() - 12 * 60 * 60 * 1000
    const { applyTick } = await import('./selectors')

    const mine = createMockBoxes('kakinada', Date.now())
    store.useDockStore.setState({
      harbourId: H,
      boxesByHarbour: {
        ...store.useDockStore.getState().boxesByHarbour,
        [H]: applyTick(createMockBoxes(H, twelveHoursAgo), Date.now()).boxes,
        kakinada: mine,
      },
    })

    store.freshenDemoHarbour()

    const after = store.useDockStore.getState().boxesByHarbour
    const { isOverdue } = await import('./selectors')
    expect(held(after[H]).every((s) => isOverdue(s, Date.now()))).toBe(false)
    // By identity, not by resemblance.
    expect(after.kakinada).toBe(mine)
  })

  it('leaves a harbour alone while anything in it is still live', async () => {
    const store = await loadDemo()
    const { createMockBoxes } = await import('../data/mock')
    const H: HarbourId = 'nizampatnam'

    const busy = createMockBoxes(H, Date.now())
    store.useDockStore.setState({
      harbourId: H,
      boxesByHarbour: { ...store.useDockStore.getState().boxesByHarbour, [H]: busy },
    })

    store.freshenDemoHarbour()

    expect(store.useDockStore.getState().boxesByHarbour[H]).toBe(busy)
  })

  it('never touches a build that has no database — that is a harbour, not a demo', async () => {
    // The defect this distinction exists for. A no-config build is a real
    // single-device deployment; its crates belong to a real harbour master.
    // Two skippers deposit at 22:00, nobody opens the app until 05:00, and
    // every crate is past the 6 h line — the exact guard condition. It used
    // to delete them and invent replacements: no ledger row to bill from, no
    // audit row to explain it, and a box the app called free that the quay
    // called full.
    vi.unstubAllEnvs()
    vi.stubEnv('VITE_FIREBASE_API_KEY', '')
    vi.stubEnv('VITE_FIREBASE_DATABASE_URL', '')

    const store = await loadDemo()
    const { createMockBoxes } = await import('../data/mock')
    const { applyTick } = await import('./selectors')
    const H: HarbourId = 'nizampatnam'

    const overnight = applyTick(
      createMockBoxes(H, Date.now() - 12 * 60 * 60 * 1000),
      Date.now(),
    ).boxes
    store.useDockStore.setState({
      harbourId: H,
      boxesByHarbour: { ...store.useDockStore.getState().boxesByHarbour, [H]: overnight },
    })

    store.freshenDemoHarbour()

    expect(store.useDockStore.getState().boxesByHarbour[H]).toBe(overnight)
  })
})

describe('the two modes keep separate books', () => {
  it('gives the demo its own store key, so nothing invented here reaches the roster', async () => {
    // `watchRoster` deliberately keeps a local boat the shared copy has not
    // heard of — that is how a fresh registration survives until it is
    // published. So a shared key put a boat invented while playing into the
    // LIVE approvals queue, and one tap on Approve wrote it into the real
    // society's roster, permanently, because no rule can delete a boat.
    const demo = await loadDemo()
    expect(demo.STORAGE_KEY).toBe('ap-chill-box.store.demo')

    storage.setItem(MODE_KEY, '0')
    vi.resetModules()
    const live = await import('./useDockStore')
    expect(live.STORAGE_KEY).toBe('ap-chill-box')
  })

  it('keeps the mode, and the other mode’s books, across the crash screen', async () => {
    // "Reset this phone" used to be `localStorage.clear()`, which took the
    // mode flag (returning a demo user to the real harbour) and the OTHER
    // mode's store with it — including the live harbour's audit chain, which
    // is local-only and is the artefact the README offers to settle a quay
    // dispute with.
    const demo = await loadDemo()
    storage.setItem('ap-chill-box', '{"state":{"live":true},"version":4}')
    storage.setItem('firebase:authUser:test:[DEFAULT]', '{"uid":"abc"}')

    demo.resetStorage()

    expect(storage.getItem(MODE_KEY)).toBe('1')
    expect(storage.getItem('ap-chill-box')).toBe('{"state":{"live":true},"version":4}')
    // And the anonymous identity, which is what binds a boat to this phone.
    // A new uid can never be reassigned to that boat: the skipper would be
    // locked out of his own crates for good, with no admin remedy.
    expect(storage.getItem('firebase:authUser:test:[DEFAULT]')).toBe('{"uid":"abc"}')
    expect(storage.getItem('ap-chill-box.store.demo')).toBeNull()
  })
})
