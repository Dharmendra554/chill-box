import { HARBOURS } from '../data/harbours'
import type { T } from '../i18n/dictionary'
import { waveBand } from '../lib/marine'
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
}: {
  t: T
  lang: Lang
  theme: Theme
  harbourId: HarbourId
  boat: Boat | null
  speaking: boolean
  onLang: (lang: Lang) => void
  onTheme: (theme: Theme) => void
  onSpeak: () => void
}) {
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
          title={t(speaking ? 'voiceStop' : 'voiceRead')}
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
  error,
}: {
  t: T
  reading: MarineReading | null
  error: boolean
}) {
  if (!reading) {
    return (
      <p className="border-b-3 border-rule bg-paper-2 px-3 py-1.5 text-sm font-bold">
        {t(error ? 'waveError' : 'waveLoading')}
      </p>
    )
  }

  const band = waveBand(reading.waveHeight)
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
      <span className="ml-auto truncate font-bold">
        {t(
          band === 'calm'
            ? 'waveCalmHint'
            : band === 'moderate'
              ? 'waveModerateHint'
              : 'waveRoughHint',
        )}
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
export function OfflineBanner({ t, since }: { t: T; since: number | null }) {
  return (
    <p
      className="flex flex-wrap items-baseline gap-x-2 border-b-3 border-rule bg-late px-3 py-1.5 text-sm font-extrabold text-late-ink"
      role="status"
    >
      <span>{t('offlineTitle')}</span>
      <span className="font-bold">
        {since === null ? t('staleNever') : t('staleBody', formatClock(since))}
      </span>
    </p>
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

export function TabBar({ t, tab, onTab }: { t: T; tab: Tab; onTab: (tab: Tab) => void }) {
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
}: {
  toast: ToastMessage | null
  onDismiss: () => void
}) {
  if (!toast) return null
  return (
    <button
      type="button"
      key={toast.id}
      className={cx('toast sheet-in text-left', TOAST_STYLE[toast.tone])}
      role="alert"
      onClick={onDismiss}
    >
      {toast.text}
    </button>
  )
}
