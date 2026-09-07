export const HOLD_MS = 4 * 60 * 60 * 1000
export const OVERSTAY_MS = 6 * 60 * 60 * 1000

/**
 * When the harbour takes the space back by itself.
 *
 * Two hours after the overstay flag goes amber, and the second half of a
 * deliberate escalation: at six hours the whole harbour can see the crate is
 * blocking a box, and at eight the box stops waiting. Nobody presses
 * anything. There used to be a Force release button on a PIN-gated console,
 * which meant a rotting crate blocked a box until whoever held the PIN
 * happened to open it — and gave that person a power the brief's own premise
 * says nobody at this harbour has.
 *
 * The gap is two hours because the flag has to be worth something first: a
 * skipper whose crate goes amber at six has a real chance to come for it
 * before the space is reassigned, and everyone else can see the clock
 * running. Reclaiming at six would make the warning and the consequence the
 * same event.
 */
export const RECLAIM_MS = 8 * 60 * 60 * 1000
export const HOUR_MS = 60 * 60 * 1000
export const MINUTE_MS = 60 * 1000
export const DAY_MS = 24 * HOUR_MS

const TZ = 'Asia/Kolkata'

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export function formatCountdown(ms: number): string {
  const clamped = Math.max(0, ms)
  const h = Math.floor(clamped / HOUR_MS)
  const m = Math.floor((clamped % HOUR_MS) / MINUTE_MS)
  const s = Math.floor((clamped % MINUTE_MS) / 1000)
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`
}

export function formatElapsed(ms: number, lang: 'te' | 'en'): string {
  const clamped = Math.max(0, ms)
  const h = Math.floor(clamped / HOUR_MS)
  const m = Math.floor((clamped % HOUR_MS) / MINUTE_MS)
  if (lang === 'te') return `${h}గం ${m}ని`
  return `${h}h ${m}m`
}

/** Signed gap: "in 2h 10m" / "2h 10m late". */
export function formatGap(ms: number, lang: 'te' | 'en'): string {
  const late = ms < 0
  const body = formatElapsed(Math.abs(ms), lang)
  if (lang === 'te') return late ? `${body} ఆలస్యం` : `${body}లో`
  return late ? `${body} late` : `in ${body}`
}

/**
 * Every formatter in this file, built once.
 *
 * `Intl.DateTimeFormat` is expensive to construct and free to reuse, and
 * these are called inside 1 Hz renders — once per crate cell, once per audit
 * row. Measured on a desktop: 0.105 ms per construction, and an admin
 * console with a season of audit rows was building **206 of them a second**
 * before anyone touched it, on top of 17 a second on the skipper's own dock
 * screen. On the target phone that is several times worse.
 *
 * Round 13 hoisted the one used by `monthKey` and treated the class as
 * closed; five more call sites were still constructing per call. They are
 * all here now, so there is one place to look.
 */
const CLOCK = new Intl.DateTimeFormat('en-IN', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

const DAY_CLOCK = {
  te: new Intl.DateTimeFormat('te-IN', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }),
  en: new Intl.DateTimeFormat('en-IN', {
    timeZone: TZ,
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }),
} as const

const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const MONTH_NAME = {
  te: new Intl.DateTimeFormat('te-IN', { timeZone: TZ, month: 'long', year: 'numeric' }),
  en: new Intl.DateTimeFormat('en-IN', { timeZone: TZ, month: 'long', year: 'numeric' }),
} as const

/** 12-hour wall clock. A dock reads "10:30 pm", never "22:30". */
export function formatClock(ts: number): string {
  return CLOCK.format(new Date(ts))
}

/**
 * Compact 12-hour time for the crate grid, e.g. `10:11p`.
 *
 * A slot cell is about 55 px wide on a small phone and "10:11 pm" clips in
 * it. A single-letter suffix keeps the am/pm distinction — 4 am and 4 pm are
 * very different tides — while fitting the cell.
 */
export function formatClockShort(ts: number): string {
  // `\s?`, not `\s*`. Intl emits exactly one separator — a narrow no-break
  // space on newer ICU, which `\s` covers — and an unbounded quantifier in
  // front of a literal backtracks over every whitespace run on a failed
  // match for nothing.
  return formatClock(ts).replace(/\s?([ap])m$/i, '$1')
}

export function formatDayClock(ts: number, lang: 'te' | 'en'): string {
  return DAY_CLOCK[lang].format(new Date(ts))
}

/** Midnight IST on the day containing `ts`. */
export function startOfLocalDay(ts: number): number {
  const day = DAY_KEY.format(new Date(ts))
  // IST is a fixed +05:30 offset with no daylight saving, so this is exact.
  return Date.parse(`${day}T00:00:00+05:30`)
}

/** Runs once per ledger row — 1 500 of them on the admin console. */
const MONTH_KEY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
})

/** `2026-09` in harbour local time — the bucket key for monthly reports. */
export function monthKey(ts: number): string {
  const parts = MONTH_KEY_FORMAT.formatToParts(new Date(ts))
  const y = parts.find((p) => p.type === 'year')?.value ?? '0000'
  const m = parts.find((p) => p.type === 'month')?.value ?? '00'
  return `${y}-${m}`
}

export function monthLabel(key: string, lang: 'te' | 'en'): string {
  const [y, m] = key.split('-').map(Number)
  if (!y || !m) return key
  return MONTH_NAME[lang].format(new Date(Date.UTC(y, m - 1, 15)))
}
