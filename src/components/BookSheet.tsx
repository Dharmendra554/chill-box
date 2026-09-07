import { useEffect, useRef, useState } from 'react'
import type { T } from '../i18n/dictionary'
import { cx } from '../lib/ui'
import { SPECIES, type Species } from '../types'
import { SPECIES_ICON } from '../icons/species'

/**
 * Booking in one sheet: tag the catch, then commit with the crate count.
 *
 * Catch tagging has to survive a wet deck at 4 a.m., so it is an icon grid
 * with no free text and a sensible default already selected — a skipper in
 * a hurry taps "1 crate" and is done in a single touch. Choosing a species
 * is an upgrade, never a toll gate.
 */
export function BookSheet({
  t,
  boxLabel,
  maxCrates,
  capReached,
  onConfirm,
  onClose,
}: Readonly<{
  t: T
  boxLabel: string
  maxCrates: number
  /** Whether it is the 2-crate cap, rather than the box, that limits this. */
  capReached: boolean
  onConfirm: (crates: 1 | 2, species: Species) => void | Promise<void>
  onClose: () => void
}>) {
  const ref = useRef<HTMLDialogElement>(null)
  const [species, setSpecies] = useState<Species>('mixed')
  /**
   * One tap, one crate. The claim now waits for the database, and on a 2G
   * tether that is over a second of a button that still looks pressable — so
   * a skipper with wet hands taps again and books two crates, uses up their
   * whole quota, and takes a crate another boat needed.
   */
  const [claiming, setClaiming] = useState(false)

  useEffect(() => {
    const el = ref.current
    // Feature-detected: an old Android WebView without showModal() should
    // still show the sheet rather than throw into the error boundary.
    if (el && !el.open) {
      if (typeof el.showModal === 'function') el.showModal()
      else el.setAttribute('open', '')
    }
  }, [])

  return (
    <dialog
      ref={ref}
      className="sheet-in m-0 mt-auto w-full max-w-6xl border-3 border-rule bg-card p-0 text-ink backdrop:bg-[var(--c-scrim)] sm:mx-auto sm:mb-6"
      onClose={onClose}
      onCancel={onClose}
      aria-label={boxLabel}
    >
      <div className="flex flex-col gap-3 p-4">
        <header>
          <h2 className="text-2xl">{t('catchTitle')}</h2>
          <p className="font-bold text-ink-2">{t('catchBody')}</p>
        </header>

        <ul className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('catchTitle')}>
          {SPECIES.map((option) => {
            const Icon = SPECIES_ICON[option]
            const picked = option === species
            return (
              <li key={option}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  className={cx(
                    'flex h-24 w-full flex-col items-center justify-center gap-1 border-3 border-rule font-display text-sm font-extrabold',
                    picked ? 'bg-free text-free-ink' : 'bg-paper-2 text-ink',
                  )}
                  onClick={() => setSpecies(option)}
                >
                  <Icon size={38} />
                  {t(option)}
                </button>
              </li>
            )
          })}
        </ul>

        <h3 className="text-xl">{t('cratesTitle')}</h3>
        <p className="text-sm font-bold text-ink-2">{t('bookIn', boxLabel)}</p>

        {/* The box can fill while this sheet is open — another boat books the
            last crate and the live update arrives. Greying both buttons out
            with no word for it is a dead end: say what happened. */}
        {maxCrates === 0 ? (
          <p
            className="border-3 border-rule bg-full px-3 py-2 font-extrabold text-full-ink"
            role="alert"
          >
            {t('raceLost')}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {([1, 2] as const).map((count) => (
              <button
                key={count}
                type="button"
                className="btn btn-lg btn-primary"
                disabled={claiming || count > maxCrates}
                onClick={async () => {
                  if (claiming) return
                  setClaiming(true)
                  try {
                    await onConfirm(count, species)
                  } finally {
                    setClaiming(false)
                  }
                }}
              >
                {t(claiming ? 'booking' : count === 1 ? 'crate1' : 'crate2')}
              </button>
            ))}
          </div>
        )}

        {/* One crate available is the COMMON case — a boat already holding
            one, or a box with a single slot left — and it rendered as a
            second button greyed to about 2:1 contrast with no word for it.
            A disabled control must say why. */}
        {maxCrates === 1 ? (
          <p className="text-sm font-bold text-ink-2">
            {t(capReached ? 'crate2Cap' : 'crate2Room')}
          </p>
        ) : null}

        <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
          {t('cancel')}
        </button>
      </div>
    </dialog>
  )
}
