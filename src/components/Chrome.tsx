import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { HARBOURS } from '../data/harbours'
import type { T } from '../i18n/dictionary'
import type { WaveBand } from '../lib/marine'
import { formatClock } from '../lib/time'
import { cx } from '../lib/ui'
import type {
  Boat,
  HarbourId,
  Lang,
  MarineReading,
  Tab,
  Theme,
  ToastMessage,
} from '../types'
import {
  AnchorIcon,
  BoatIcon,
  ChartIcon,
  HelmIcon,
  MoonIcon,
  ShoalIcon,
  SpeakerIcon,
  SpeakerStopIcon,
  SunIcon,
  WaveIcon,
} from '../icons/marine'

/**
 * App chrome: top bar, sea-state strip, bottom tab bar and toast. Grouped
 * in one file because they share nothing with the screens and everything
 * with each other — this is the frame, not the content.
 */

export function TopBar({
  t,
  lang,
  theme,
  harbourId,
  boat,
  speaking,
  demo,
  banner,
  onLang,
  onTheme,
  onSpeak,
}: Readonly<{
  t: T
  lang: Lang
  theme: Theme
  harbourId: HarbourId
  boat: Boat | null
  speaking: boolean
  /** Whether this session is on a local demo copy. See lib/mode.ts. */
  demo: boolean
  /**
   * The one line about how current the box figures are — still arriving,
   * current, or behind. Rendered INSIDE this sticky header rather than beside
   * it. See the JSX below for why that matters more than the demo strip does.
   */
  banner: ReactNode
  onLang: (lang: Lang) => void
  onTheme: (theme: Theme) => void
  onSpeak: () => void
}>) {
  const h = HARBOURS[harbourId]
  /**
   * Publish the chrome's real height so a bottom sheet cannot grow under it.
   *
   * Measured, never assumed: this header is one line taller with the demo
   * strip, another with the swell strip, and taller again whenever a Telugu
   * string wraps — which at 320 px it does. A constant here would be wrong on
   * most phones, and the failure it caused was the catch picker clipping the
   * "not a real booking" caveat through the middle of its glyphs.
   *
   * `ResizeObserver` rather than a layout effect on render, because the
   * height changes without this component re-rendering: a font arriving, an
   * orientation change, the swell strip swapping a two-line hint for a
   * one-line one.
   */
  const node = useRef<HTMLElement>(null)
  const publish = () => {
    const el = node.current
    if (el) document.documentElement.style.setProperty('--chrome-h', `${el.offsetHeight}px`)
  }
  /*
   * After EVERY render, before the browser paints.
   *
   * The ResizeObserver below is not enough on its own, and the way it is not
   * enough is the dangerous direction: it delivers on the rendering
   * lifecycle, so a throttled or occluded document keeps whatever value was
   * published first — and measured, that was 133 px against a header that had
   * become 136. Three pixels of the sticky header back under a sheet, which
   * is the whole bug this variable exists to prevent.
   *
   * Every real cause of a height change here — the demo strip, the swell
   * strip swapping for the staleness banner, a boat name arriving, a language
   * toggle — is a re-render of this component, so a layout effect catches all
   * of them and does not depend on an observer being scheduled. The observer
   * stays for the ones that are not: a webfont landing, a rotation.
   */
  useLayoutEffect(publish)
  useEffect(() => {
    const el = node.current
    if (!el) return
    const observer = new ResizeObserver(publish)
    observer.observe(el)
    // And on the two events that change this element's height without
    // resizing it in a way an occluded or throttled observer will report: a
    // rotation, and the browser's own chrome sliding away on scroll. Belt and
    // braces, because the direction that matters is a value left too SMALL —
    // that is the sheet growing back under the header, which is the bug this
    // variable exists to stop.
    window.addEventListener('resize', publish)
    window.addEventListener('orientationchange', publish)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', publish)
      window.removeEventListener('orientationchange', publish)
    }
  }, [])
  const here = {
    name: (l: Lang) => (l === 'te' ? h.nameTe : h.nameEn),
    union: (l: Lang) => (l === 'te' ? h.unionTe : h.unionEn),
  }

  return (
    <header ref={node} className="sticky top-0 z-[200] border-b-3 border-rule bg-paper">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2">
        <AnchorIcon size={30} className="shrink-0" />
        {/* Once a boat is chosen it is the identity that matters, and Telugu
            harbour names are long enough to eat a 360 px header. So the boat
            leads and the harbour becomes the second line. */}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base">
            {boat ? `${lang === 'te' ? boat.nameTe : boat.nameEn} #${boat.id}` : here.name(lang)}
          </h1>
          <p className="flex items-center gap-1 truncate text-xs font-bold text-ink-2">
            {boat ? <BoatIcon size={12} /> : null}
            {boat ? here.name(lang) : here.union(lang)}
          </p>
        </div>

        {/* The spoken readout lives in the corner every screen shares, so
            it is reachable without scrolling to wherever the boxes are. */}
        <button
          type="button"
          className={cx('btn h-11 min-h-11 px-2.5', speaking && 'btn-armed')}
          aria-pressed={speaking}
          aria-label={t(speaking ? 'voiceStop' : 'voiceRead')}
          title={speaking ? t('voiceStop') : t('hintSpeak')}
          onClick={onSpeak}
        >
          {speaking ? <SpeakerStopIcon size={22} /> : <SpeakerIcon size={22} />}
        </button>
        {/* Icons, not words: three labelled buttons crowd the harbour name
            off a 360 px screen. The language toggle keeps its text because
            "EN" is the clearest possible label for what it does. */}
        <button
          type="button"
          className="btn h-11 min-h-11 px-2.5"
          aria-label={t(theme === 'day' ? 'night' : 'day')}
          title={t(theme === 'day' ? 'night' : 'day')}
          onClick={() => onTheme(theme === 'day' ? 'night' : 'day')}
        >
          {theme === 'day' ? <MoonIcon size={20} /> : <SunIcon size={20} />}
        </button>
        <button
          type="button"
          className="btn h-11 min-h-11 px-2.5 text-sm"
          title={t('hintLang')}
          onClick={() => onLang(lang === 'te' ? 'en' : 'te')}
        >
          {lang === 'te' ? 'EN' : 'తె'}
        </button>
      </div>

      {/* INSIDE the sticky header, so it is on screen at every scroll
          position rather than only the first 117 px. It was a sibling below
          it — `position: static` — which meant the one sentence saying none
          of this is real was visible for 2% of the Harbour page, and absent
          exactly where the booking and deposit controls are. */}
      {demo ? <DemoBanner t={t} /> : null}

      {/* And so is the freshness line, which round 17 left outside while
          pinning this one — the weaker case of the two.
          The demo caveat is a session constant: read once, true for the whole
          visit. Whether the box figures are current CHANGES, it changes while
          you are looking at the screen, and it is the difference between a
          number worth acting on and one that will send a boat to a full box.
          Pinning the constant and letting the variable scroll away was
          exactly backwards.
          The cost is chrome, and there is not much of it to spend: this is
          three stacked strips at 320 px in Telugu. Measured rather than
          assumed — see `--chrome-h` above, which the bottom sheets are capped
          against so they cannot cover any of it. */}
      {banner}
    </header>
  )
}

const WAVE_STYLE = {
  calm: 'bg-free text-free-ink',
  moderate: 'bg-late text-late-ink',
  rough: 'bg-full text-full-ink',
} as const

/**
 * The band's name and its landing advice, keyed by the band.
 *
 * Records rather than ternary chains, next to the style record they belong
 * with: three of these were spelled out as nested conditionals, and a band
 * added later would have had to be remembered in each one.
 */
const WAVE_LABEL = { calm: 'waveCalm', moderate: 'waveModerate', rough: 'waveRough' } as const
const WAVE_HINT = {
  calm: 'waveCalmHint',
  moderate: 'waveModerateHint',
  rough: 'waveRoughHint',
} as const

export function WaveStrip({
  t,
  reading,
  band,
  error,
}: Readonly<{
  t: T
  reading: MarineReading | null
  /**
   * The sea state the rest of the app is acting on, or null when it is not
   * current enough to act on. Computed once in `App` and passed down: this
   * strip used to derive its own from the same reading, so a stale figure
   * showed a confident green "calm" headline here while the safety card one
   * scroll below said there was no current reading. Two answers about the
   * sea, in one viewport, and the loud one was the wrong one.
   */
  band: WaveBand | null
  error: boolean
}>) {
  if (!reading) {
    return (
      <p className="border-b-3 border-rule bg-paper-2 px-3 py-1.5 text-sm font-bold">
        {t(error ? 'waveError' : 'waveLoading')}
      </p>
    )
  }

  if (band === null) {
    // Too old to stand behind: the height, its age, and no band, no colour
    // and no landing advice — because we have none to give.
    return (
      <p className="flex items-center gap-2 border-b-3 border-rule bg-paper-2 px-3 py-1.5 text-sm font-bold">
        <WaveIcon size={18} />
        <span className="tabular font-extrabold">{reading.waveHeight.toFixed(1)} m</span>
        <span className="truncate">{t('waveStale', formatClock(reading.fetchedAt))}</span>
      </p>
    )
  }

  return (
    <p
      className={cx(
        'flex items-center gap-2 border-b-3 border-rule px-3 py-1.5 text-sm font-extrabold',
        WAVE_STYLE[band],
      )}
    >
      <WaveIcon size={18} />
      {t(WAVE_LABEL[band])}
      <span className="tabular">{reading.waveHeight.toFixed(1)} m</span>
      {/* The age is ALWAYS shown, not only when the last fetch errored. A
          backgrounded tab stops polling without erroring, so a two-hour-old
          "calm" looked exactly like a live one. Every other figure in this
          app carries its age; the one a skipper comes in on now does too.
          The hint is dropped at narrow widths rather than the time, because
          in a rough sea the time is what decides whether to trust it. */}
      <span className="ml-auto flex min-w-0 items-baseline gap-2 font-bold">
        <span className="hidden truncate min-[380px]:inline">
          {t(WAVE_HINT[band])}
        </span>
        <span className="tabular shrink-0">{formatClock(reading.fetchedAt)}</span>
      </span>
    </p>
  )
}

/**
 * Offline notice. Nothing here needs the network, but the harbour figures
 * are only as fresh as the last time this phone was in touch — so we date
 * them rather than let a stale "2 free" send a boat to a full box. Honest
 * staleness beats confident wrongness.
 */
export function OfflineBanner({
  t,
  since,
  shared,
}: Readonly<{ t: T; since: number | null; shared: boolean }>) {
  return (
    <output className="flex flex-wrap items-baseline gap-x-2 border-b-3 border-rule bg-late px-3 py-1.5 text-sm font-extrabold text-late-ink">
      <span>{t('offlineTitle')}</span>
      <span className="font-bold">
        {/* Three cases, because two of them were being told the same thing.
            On a SHARED harbour with no snapshot yet this session — a cold
            start with no signal, the common 4 a.m. case — the figures are
            last night's shared copy, not "from this phone only", and saying
            so named the wrong source. `syncedAt` is deliberately not
            persisted, so `since` is null there too. */}
        {since !== null
          ? t('staleBody', formatClock(since))
          : t(shared ? 'staleUnsynced' : 'staleNever')}
      </span>
    </output>
  )
}

/**
 * The first few seconds, before the shared harbour has said anything.
 *
 * The figures on screen behind this are the last snapshot this phone kept,
 * or — on a fresh install — the seeded demo occupancy. Both render exactly
 * like live data. Until the first snapshot lands there is no honest way to
 * show them as current, so we say plainly that they are still coming. Same
 * slot and same weight as the offline banner, because it is the same
 * promise: never a confident number we cannot stand behind.
 */
export function LoadingBanner({ t }: Readonly<{ t: T }>) {
  return (
    <output className="flex flex-wrap items-baseline gap-x-2 border-b-3 border-rule bg-hold-wash px-3 py-1.5 text-sm font-extrabold">
      <span>{t('loadingTitle')}</span>
      <span className="font-bold">{t('loadingBody')}</span>
    </output>
  )
}

/**
 * That none of this is real, said where it cannot be missed.
 *
 * The mode is sticky across reloads for ever, and the only other statement
 * of it lived at the bottom of the Book screen inside a panel headed "Demo
 * tools · these do not appear in real use" — so the app's one true sentence
 * about which harbour you are in sat inside a box that disclaims itself.
 * Two days later, at 4 a.m., a skipper sees a normal harbour, a live Book
 * button, a receipt and a countdown, and no phone at the quay has heard of
 * any of it.
 *
 * So it takes a line in the chrome, on every screen and at every scroll
 * position, in the slot the app already uses to say "these figures are not
 * what you think". It is not dismissible: a demo you can hide is a demo you
 * can forget you are in.
 */
export function DemoBanner({ t }: Readonly<{ t: T }>) {
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 border-b-3 border-rule bg-sea px-3 py-1.5 text-sm font-extrabold text-sea-ink">
      <span>{t('demoBannerTitle')}</span>
      <span className="font-bold">{t('demoBannerBody')}</span>
    </p>
  )
}

/**
 * Three tabs, and the third one is the change.
 *
 * It used to say "two tabs only. Admin is deliberately absent: a
 * harbour-master console has no business being one thumb-reach from twenty
 * skippers' booking screen." That was true of a console holding Approve,
 * Reject, Block and Force release. It holds none of them. What is left is
 * how full the boxes run, how long a crate sits, how often the six-hour rule
 * is broken and every action anyone has taken — the harbour's own record of
 * itself, and there is no honest argument for keeping that from the harbour.
 *
 * At 320 px these are 106 px each and every label is Telugu, which cannot be
 * tracked tighter (AGENTS.md §4). If a word stops fitting, the word changes;
 * the tab does not get smaller.
 */
const TABS = [
  { id: 'dock', key: 'tabDock', Icon: ChartIcon },
  { id: 'harbour', key: 'tabHarbour', Icon: ShoalIcon },
  { id: 'record', key: 'tabRecord', Icon: HelmIcon },
] as const

export function TabBar({ t, tab, onTab }: Readonly<{ t: T; tab: Tab; onTab: (tab: Tab) => void }>) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[200] border-t-3 border-rule bg-paper pb-[env(safe-area-inset-bottom)]"
      aria-label={t('appName')}
    >
      <ul className="mx-auto grid max-w-6xl grid-cols-3">
        {TABS.map(({ id, key, Icon }) => {
          const active = tab === id
          return (
            <li key={id}>
              <button
                type="button"
                className={cx(
                  'flex h-[68px] w-full flex-col items-center justify-center gap-1 font-display text-xs font-extrabold',
                  active ? 'bg-free text-free-ink' : 'text-ink',
                )}
                aria-current={active ? 'page' : undefined}
                onClick={() => onTab(id)}
              >
                <Icon size={26} />
                {t(key)}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

const TOAST_STYLE = { error: 'toast-error', warn: 'toast-warn', ok: 'toast-ok' } as const

export function Toast({
  toast,
  onDismiss,
}: Readonly<{
  toast: ToastMessage | null
  onDismiss: () => void
}>) {
  // The live drag, tagged with the message it belongs to so a new toast
  // cannot inherit the last one's offset — derived here rather than reset in
  // an effect, which would cost a second render on every message.
  const [drag, setDrag] = useState<{ id: number; from: number; dx: number } | null>(null)
  const dx = drag && drag.id === toast?.id ? drag.dx : 0
  // Whether the finger moved. A ref, not the drag state: React flushes the
  // `pointerup` update before dispatching the `click`, so by the time the
  // click handler runs the offset has already been cleared and a guard that
  // read it saw zero every time — every nudge dismissed the message, which
  // for a refusal is often the only record that a booking did not happen.
  const swiped = useRef(false)

  if (!toast) return null

  const settle = () => {
    if (Math.abs(dx) > SWIPE_PX) onDismiss()
    setDrag(null)
  }

  return (
    // `role="alert"` sits on the wrapper, not on the button.
    //
    // A button carrying a non-interactive role IS that role to a screen
    // reader: the toast was announced as a line of text with no hint that it
    // could be activated, and dismissing it — the only way to clear a
    // refusal, which never fades on its own — was undiscoverable. The
    // wrapper is out of flow (`.toast` is `position: fixed`), so this is a
    // semantic change and not a layout one.
    <div role="alert">
      <button
        type="button"
        key={toast.id}
        className={cx('toast sheet-in text-left touch-pan-y', TOAST_STYLE[toast.tone])}
        // Swipe it away in either direction, or tap it. A refusal deliberately
        // does not fade on its own — it is often the only record that a
        // booking did NOT happen — so there has to be a way to move it that
        // does not mean aiming a wet thumb at a small target. A flick works
        // with gloves on, and it is the gesture a phone user already knows.
        style={{
          transform: dx ? `translateX(${dx}px)` : undefined,
          opacity: dx ? Math.max(0.25, 1 - Math.abs(dx) / 200) : undefined,
          transition: drag ? undefined : 'transform 150ms, opacity 150ms',
        }}
        onPointerDown={(e) => {
          swiped.current = false
          setDrag({ id: toast.id, from: e.clientX, dx: 0 })
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          setDrag((d) => {
            if (!d) return null
            if (Math.abs(e.clientX - d.from) > 4) swiped.current = true
            return { ...d, dx: e.clientX - d.from }
          })
        }}
        onPointerUp={settle}
        onPointerCancel={settle}
        onClick={() => {
          // A drag ends in a click too, so only a real tap dismisses. Reset
          // afterwards: leaving it set meant a nudge under the swipe
          // threshold latched the flag, and the toast could then never be
          // dismissed by keyboard or by a screen reader's activation, neither
          // of which produces a pointer sequence to clear it. A refusal does
          // not fade by itself, so that was a permanent band across the
          // bottom of the screen with no advertised way to remove it.
          const dragged = swiped.current
          swiped.current = false
          if (!dragged) onDismiss()
        }}
      >
        {toast.text}
      </button>
    </div>
  )
}

/** Thumb travel that counts as "get rid of this". See Toast. */
const SWIPE_PX = 60
