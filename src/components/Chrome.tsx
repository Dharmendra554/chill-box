import { useRef, useState } from 'react'
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
  onLang: (lang: Lang) => void
  onTheme: (theme: Theme) => void
  onSpeak: () => void
}>) {
  const h = HARBOURS[harbourId]
  const here = {
    name: (l: Lang) => (l === 'te' ? h.nameTe : h.nameEn),
    union: (l: Lang) => (l === 'te' ? h.unionTe : h.unionEn),
  }

  return (
    <header className="sticky top-0 z-[200] border-b-3 border-rule bg-paper">
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

    </header>
  )
}

const WAVE_STYLE = {
  calm: 'bg-free text-free-ink',
  moderate: 'bg-late text-late-ink',
  rough: 'bg-full text-full-ink',
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
      {t(band === 'calm' ? 'waveCalm' : band === 'moderate' ? 'waveModerate' : 'waveRough')}
      <span className="tabular">{reading.waveHeight.toFixed(1)} m</span>
      {/* The age is ALWAYS shown, not only when the last fetch errored. A
          backgrounded tab stops polling without erroring, so a two-hour-old
          "calm" looked exactly like a live one. Every other figure in this
          app carries its age; the one a skipper comes in on now does too.
          The hint is dropped at narrow widths rather than the time, because
          in a rough sea the time is what decides whether to trust it. */}
      <span className="ml-auto flex min-w-0 items-baseline gap-2 font-bold">
        <span className="hidden truncate min-[380px]:inline">
          {t(
            band === 'calm'
              ? 'waveCalmHint'
              : band === 'moderate'
                ? 'waveModerateHint'
                : 'waveRoughHint',
          )}
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
export function OfflineBanner({ t, since }: Readonly<{ t: T; since: number | null }>) {
  return (
    <output className="flex flex-wrap items-baseline gap-x-2 border-b-3 border-rule bg-late px-3 py-1.5 text-sm font-extrabold text-late-ink">
      <span>{t('offlineTitle')}</span>
      <span className="font-bold">
        {since === null ? t('staleNever') : t('staleBody', formatClock(since))}
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
 * Two tabs only. Admin is deliberately absent: a harbour-master console has
 * no business being one thumb-reach from twenty skippers' booking screen.
 * It lives at the #admin URL and behind a PIN.
 */
const TABS = [
  { id: 'dock', key: 'tabDock', Icon: ChartIcon },
  { id: 'harbour', key: 'tabHarbour', Icon: ShoalIcon },
] as const

export function TabBar({ t, tab, onTab }: Readonly<{ t: T; tab: Tab; onTab: (tab: Tab) => void }>) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[200] border-t-3 border-rule bg-paper pb-[env(safe-area-inset-bottom)]"
      aria-label={t('appName')}
    >
      <ul className="mx-auto grid max-w-6xl grid-cols-2">
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
