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
  onConfirm,
  onClose,
}: {
  t: T
  boxLabel: string
  maxCrates: number
  onConfirm: (crates: 1 | 2, species: Species) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [species, setSpecies] = useState<Species>('mixed')

  useEffect(() => {
    const el = ref.current
    if (el && !el.open) el.showModal()
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

        <div className="grid grid-cols-2 gap-3">
          {([1, 2] as const).map((count) => (
            <button
              key={count}
              type="button"
              className="btn btn-lg btn-primary"
              disabled={count > maxCrates}
              onClick={() => onConfirm(count, species)}
            >
              {t(count === 1 ? 'crate1' : 'crate2')}
            </button>
          ))}
        </div>

        <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
          {t('cancel')}
        </button>
      </div>
    </dialog>
  )
}
