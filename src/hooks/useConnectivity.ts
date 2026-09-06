import { useEffect, useState } from 'react'

/**
 * How stale a successful network round-trip may be before we stop calling
 * ourselves connected. The swell poll runs every 10 minutes, so 15 allows
 * exactly one missed cycle before we start warning.
 */
export const STALE_MS = 15 * 60 * 1000

/** Grace period on startup, while the first request is still in flight. */
const GRACE_MS = 20_000

export type Reach = 'checking' | 'connected' | 'stale'

/**
 * Connectivity, for honesty rather than for fetching.
 *
 * `navigator.onLine` only reports whether the device has *an* interface. On
 * this coast a phone sits on one bar of 2G, reports "online", and nothing
 * completes — so trusting it would show a confident, wrong "2 free" and
 * send a boat to a full box.
 *
 * So we judge by evidence instead:
 *
 *  - the `offline` event is an instant, reliable negative;
 *  - `reachedAt` is when a real request last succeeded. The app already
 *    polls the swell, so this proves reachability at no extra cost;
 *  - for the first few seconds there is no evidence either way, which is
 *    `checking` — warning then would cry wolf on every cold start.
 *
 * The skipper never has to know or check anything: the banner appears by
 * itself, and only once the figures have actually stopped being trustworthy.
 */
export function useConnectivity(reachedAt: number | null, now: number): Reach {
  const [hasInterface, setHasInterface] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  )
  // A render-time value, so it is state rather than a ref.
  const [startedAt] = useState(now)

  useEffect(() => {
    const up = () => setHasInterface(true)
    const down = () => setHasInterface(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => {
      window.removeEventListener('online', up)
      window.removeEventListener('offline', down)
    }
  }, [])

  if (!hasInterface) return 'stale'
  if (reachedAt !== null) return now - reachedAt < STALE_MS ? 'connected' : 'stale'
  return now - startedAt < GRACE_MS ? 'checking' : 'stale'
}
