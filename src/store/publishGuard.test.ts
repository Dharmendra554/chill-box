import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Which sessions are allowed to seed the shared database.
 *
 * Its own file because it mocks `harbourSync`, and a mocked module's
 * `syncEnabled` is frozen at the factory's first run — so it cannot live
 * beside `demoHarbour.test.ts`, where a test deliberately changes the env to
 * the no-database shape and needs the real value. Putting them together made
 * that test read a stale `true` and reseed a harbour it must never touch;
 * every build here is configured, so the frozen value is the right one.
 */

const MODE_KEY = 'ap-chill-box.mode'

/** Every publish the store attempted, so "none" can be asserted. */
const seedCalls: unknown[][] = []

vi.mock('../lib/harbourSync', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/harbourSync')>()
  return {
    ...actual,
    seedHarbour: (...args: unknown[]) => {
      seedCalls.push(args)
      return Promise.resolve({ failed: 0, boxesOk: true, historyLost: 0 })
    },
  }
})

function makeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  }
}

let storage: ReturnType<typeof makeStorage>

beforeEach(() => {
  seedCalls.length = 0
  storage = makeStorage()
  vi.stubGlobal('localStorage', storage)
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key')
  vi.stubEnv('VITE_FIREBASE_DATABASE_URL', 'https://example.firebaseio.test')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function loadStore(demo: boolean) {
  storage.setItem(MODE_KEY, demo ? '1' : '0')
  vi.resetModules()
  return await import('./useDockStore')
}

describe('publishing a harbour', () => {
  it('is refused from a demo session', async () => {
    // `requireLink()` guards the LINK, not the mode: with no shared harbour
    // it returns true. So the only thing between a demo session and a real
    // publish was a `{sharedActive ? …}` in AdminScreen's JSX — one refactor
    // away from seeding the society's live database with invented boats and
    // pretend crates, and no rule can delete a boat once it is written.
    const demo = await loadStore(true)
    await demo.useDockStore.getState().publishHarbour()

    expect(seedCalls).toHaveLength(0)
  })

  it('still works from a live session, so the guard is a mode check', async () => {
    const live = await loadStore(false)
    live.useDockStore.setState({ syncLive: true })
    await live.useDockStore.getState().publishHarbour()

    expect(seedCalls).toHaveLength(1)
  })
})
