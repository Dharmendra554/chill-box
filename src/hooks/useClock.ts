import { useSyncExternalStore } from 'react'
import { useDockStore } from '../store/useDockStore'

/**
 * The wall clock, kept deliberately OUTSIDE the persisted store.
 *
 * Countdowns need a value that changes every second. Keeping it in the
 * zustand store meant every tick was a `set()`, and zustand's persist
 * middleware serialises the whole store on every `set` — roughly 11 ms of
 * `JSON.stringify` per second on the real payload, which is 60–150 ms of
 * blocked main thread per second on a low-end Android. Throttling the disk
 * write did not help, because the expensive half runs before it.
 *
 * So the clock is its own tiny external store: components subscribe to it
 * directly, nothing is persisted, and the harbour store is only written when
 * a slot genuinely changes.
 */
let now = Date.now()
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Started once from `main.tsx`; there is only ever one interval. */
export function startClock(): () => void {
  const id = setInterval(() => {
    now = Date.now()
    // Age holds and overstays. The store only writes when something moved.
    useDockStore.getState().tick(now)
    for (const listener of listeners) listener()
  }, 1000)

  useDockStore.getState().tick(now)
  return () => clearInterval(id)
}

/** Current time, re-rendering the caller once a second. */
export function useNow(): number {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => now,
  )
}
