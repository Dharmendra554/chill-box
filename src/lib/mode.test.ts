import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The mode, on a CONFIGURED build — the shape the rest of the suite cannot
 * construct.
 *
 * `vite.config.ts` pins the Firebase env to empty for tests, which is right
 * for every other file and structurally blind for this one: with no database
 * `demoMode` is the unconditional `true` branch and `readFlag` never runs at
 * all. So the one build where the flag decides anything was the one nothing
 * could see — and a defect that made demo mode last exactly ONE interaction,
 * then fail back to the live harbour, shipped with four green gates.
 *
 * Every test here re-imports the module to simulate a page load, because
 * that is precisely what the design leans on: the mode is read once, at
 * import, and switching reloads.
 */

/** A localStorage that behaves, and can be made to misbehave. */
function makeStorage() {
  const map = new Map<string, string>()
  return {
    store: map,
    /** Set by a test to make writes throw, as a locked-down browser does. */
    refuse: false,
    /** Set by a test to accept writes and keep nothing, as some do. */
    forget: false,
    getItem(key: string) {
      return map.get(key) ?? null
    },
    setItem(this: { refuse: boolean; forget: boolean }, key: string, value: string) {
      if (this.refuse) throw new DOMException('denied', 'SecurityError')
      if (!this.forget) map.set(key, value)
    },
    removeItem(key: string) {
      map.delete(key)
    },
    clear() {
      map.clear()
    },
    key: () => null,
    length: 0,
  }
}

let storage: ReturnType<typeof makeStorage>

/** A page load: fresh module registry, same storage. */
async function load() {
  vi.resetModules()
  return await import('./mode')
}

beforeEach(() => {
  storage = makeStorage()
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('location', { reload: vi.fn() })
  // A configured build. Without this `syncEnabled` is false and `readFlag`
  // is never consulted — which is exactly how the collision below hid.
  vi.stubEnv('VITE_FIREBASE_API_KEY', 'test-key')
  vi.stubEnv('VITE_FIREBASE_DATABASE_URL', 'https://example.firebaseio.test')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('which harbour this session is on', () => {
  it('starts on the real one, because demo is opted into and never given', async () => {
    const mode = await load()
    expect(mode.demoMode).toBe(false)
    expect(mode.sharedActive).toBe(true)
  })

  it('remembers a switch across a page load', async () => {
    const first = await load()
    expect(first.setDemoMode(true)).toBe(true)

    const second = await load()
    expect(second.demoMode).toBe(true)
    expect(second.sharedActive).toBe(false)
  })

  it('survives the store writing itself to disk — the keys must not collide', async () => {
    // THE REGRESSION. The flag and the demo store were given the same key,
    // so the first `set` of a demo session — a tab tap, a language toggle, a
    // hold expiring — serialised the whole store over the flag. The next
    // cold start compared that JSON to '1', got false, and booted LIVE: the
    // next crate the skipper tapped was a real one in the shared database.
    const first = await load()
    first.setDemoMode(true)

    // A fresh registry, so the STORE resolves the mode as demo — its key is
    // computed at import from `demoMode`, and reading it from the previous
    // registry would report the LIVE key and prove nothing.
    const demoSession = await load()
    expect(demoSession.demoMode).toBe(true)
    const { STORAGE_KEY } = await import('../store/useDockStore')
    expect(STORAGE_KEY).not.toBe(demoSession.MODE_KEY)

    // Write what the store writes, where the store writes it.
    storage.setItem(STORAGE_KEY, JSON.stringify({ state: { lang: 'te' }, version: 4 }))

    expect((await load()).demoMode).toBe(true)
  })

  it('reports a refusal instead of reloading into the mode you left', async () => {
    const mode = await load()
    storage.refuse = true

    expect(mode.setDemoMode(true)).toBe(false)
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('catches a browser that accepts the write and keeps nothing', async () => {
    // Private mode on some browsers. `setItem` succeeds, the value is gone.
    const mode = await load()
    storage.forget = true

    expect(mode.setDemoMode(true)).toBe(false)
    expect(location.reload).not.toHaveBeenCalled()
  })

  it('keeps the mode across the crash screen wiping everything', async () => {
    const before = await load()
    before.setDemoMode(true)
    // The session the app is actually running in after the switch. `keepMode`
    // re-asserts THAT session's mode, so it has to be called on it.
    const demoSession = await load()
    expect(demoSession.demoMode).toBe(true)

    // A bare clear, which is what "Reset this phone" used to do: the flag
    // goes with everything else and the phone comes back on the real
    // harbour, where the next thing it touches is somebody else's crate.
    storage.clear()
    expect((await load()).demoMode).toBe(false)

    // And with the re-assertion `resetStorage` now performs.
    demoSession.setDemoMode(true)
    storage.clear()
    demoSession.keepMode()
    expect((await load()).demoMode).toBe(true)
  })

  it('falls back to the real harbour when storage cannot be read at all', async () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new DOMException('denied', 'SecurityError')
      },
    })
    const mode = await load()
    expect(mode.demoMode).toBe(false)
  })
})
