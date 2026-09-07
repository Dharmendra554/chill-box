import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchWaveHeight, seaAdvice, waveBand } from './marine'

/**
 * The clock the sea state is dated by.
 *
 * This one line has now been wrong in three rounds running and in both
 * directions, so it gets a test that pins the direction. `fetchedAt` is
 * aged against `serverNow()` and a 25-minute gate decides whether the app
 * shows a sea state at all — so a stamp that drifts with the device clock
 * either paints a green "safe landing" over an hour-old figure, or refuses
 * to show any reading at all on a phone whose clock is fast.
 */

/** Forty minutes of device-clock error, the way a dead battery leaves it. */
const SKEW_MS = 40 * 60_000

vi.mock('./harbourSync', () => ({
  toHarbourTime: (deviceMs: number) => deviceMs + SKEW_MS,
}))

afterEach(() => {
  vi.unstubAllGlobals()
})

function respond(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => body })),
  )
}

describe('the swell reading carries the time the sea was measured', () => {
  it('passes Open-Meteo’s own instant through untouched by the device clock', async () => {
    // `current.time` is absolute — it owes nothing to this phone's clock —
    // so the device skew must not be added to it. Round 12 wrapped it in
    // `toHarbourTime` anyway, which re-injected exactly the error the round
    // before had removed: forty minutes slow and the staleness gate could
    // not fire until a reading was 65 minutes old, while the strip printed a
    // reading time forty minutes in the future.
    respond({ current: { wave_height: 1.4, time: '2026-09-07T04:00' } })

    const reading = await fetchWaveHeight(15.9, 80.6)

    expect(reading.waveHeight).toBe(1.4)
    expect(reading.fetchedAt).toBe(Date.parse('2026-09-07T04:00+05:30'))
    // Stated positively as well as by value: the skew is nowhere in it.
    expect(reading.fetchedAt).not.toBe(Date.parse('2026-09-07T04:00+05:30') + SKEW_MS)
  })

  it('falls back to the harbour clock, not the device clock, when the field is missing', async () => {
    // The fallback IS a device instant, so this is the one branch that must
    // be converted. Without it a mis-clocked phone dates the reading wrong
    // in the other direction.
    respond({ current: { wave_height: 0.6 } })
    const before = Date.now()

    const reading = await fetchWaveHeight(15.9, 80.6)

    expect(reading.fetchedAt).toBeGreaterThanOrEqual(before + SKEW_MS)
    expect(reading.fetchedAt).toBeLessThanOrEqual(Date.now() + SKEW_MS)
  })

  it('refuses a response with no wave height rather than inventing one', async () => {
    respond({ current: { time: '2026-09-07T04:00' } })
    await expect(fetchWaveHeight(15.9, 80.6)).rejects.toThrow(TypeError)
  })
})

describe('waveBand', () => {
  it('puts each height in the band the safety card acts on', () => {
    expect(waveBand(0.99)).toBe('calm')
    expect(waveBand(1)).toBe('moderate')
    expect(waveBand(2)).toBe('moderate')
    expect(waveBand(2.01)).toBe('rough')
  })
})

describe('what the safety card may say about the sea', () => {
  it('answers every reachable combination the way a boat in trouble needs', () => {
    // Six reachable states, pinned. This card has been wrong three times in
    // three directions, and each time the branch looked obviously right in
    // isolation — so the whole table lives here rather than in a reviewer's
    // head. `band === null` means "too old to act on", which is NOT the same
    // as "never had one": that distinction is the last two rows.
    expect(seaAdvice(true, 'rough', true, false)).toBe('safetyRough')
    // Rough deliberately outlives its own staleness gate — a warning that
    // may have passed is the safe direction — so it wins even with no band.
    expect(seaAdvice(true, null, true, false)).toBe('safetyRough')
    expect(seaAdvice(false, 'calm', true, false)).toBe('safetyCalm')
    expect(seaAdvice(false, 'moderate', true, false)).toBe('safetyCalm')
    // A reading landed and aged out: nothing current to stand behind.
    expect(seaAdvice(false, null, true, false)).toBe('safetyUnknown')
    // The fetch failed and none ever landed — still not "on its way".
    expect(seaAdvice(false, null, false, true)).toBe('safetyUnknown')
    // The only genuinely loading state: a first fetch still in flight.
    expect(seaAdvice(false, null, false, false)).toBe('safetyLoading')
  })
})
