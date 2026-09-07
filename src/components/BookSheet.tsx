import { useRef, useState } from 'react'
import type { T } from '../i18n/dictionary'
import { cx } from '../lib/ui'
import { useModal } from '../lib/dialog'
import { SPECIES, type Species } from '../types'
import { SPECIES_ICON } from '../icons/species'

/** Which way an arrow key moves the choice in the catch picker. */
const ARROW_STEP: Record<string, number | undefined> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
}

/** The button's face: what it is about to do, or that it is doing it. */
function crateLabel(claiming: boolean, count: 1 | 2) {
  if (claiming) return 'booking'
  return count === 1 ? 'crate1' : 'crate2'
}

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

  useModal(ref, onClose)

  return (
    <dialog
      ref={ref}
      className="sheet sheet-in max-w-6xl text-ink backdrop:bg-[var(--c-scrim)] sm:mx-auto sm:mb-6"
      onClose={onClose}
      onCancel={onClose}
      aria-label={boxLabel}
    >
      <div className="flex flex-col gap-3 p-4">
        <header>
          <h2 className="text-2xl">{t('catchTitle')}</h2>
          <p className="font-bold text-ink-2">{t('catchBody')}</p>
        </header>

        {/*
          A radiogroup owns radios directly. The buttons used to sit inside
          `<li>`s, which breaks the owned-element relationship a conforming
          screen reader needs — the group announced no members — and every
          one of the six was a tab stop with arrow keys doing nothing, which
          is the opposite of how a radio group behaves everywhere else.
          Roving tabindex: the checked option is the single tab stop, and the
          arrows move the choice, as the pattern requires.
        */}
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('catchTitle')}>
          {SPECIES.map((option, index) => {
            const Icon = SPECIES_ICON[option]
            const picked = option === species
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={picked}
                tabIndex={picked ? 0 : -1}
                className={cx(
                  'flex h-24 w-full flex-col items-center justify-center gap-1 border-3 border-rule font-display text-sm font-extrabold',
                  picked ? 'bg-free text-free-ink' : 'bg-paper-2 text-ink',
                )}
                onClick={() => setSpecies(option)}
                onKeyDown={(event) => {
                  const step = ARROW_STEP[event.key]
                  if (!step) return
                  event.preventDefault()
                  // Wraps, because a grid of six with no wrap strands the
                  // thumb at either end with no feedback.
                  const next = SPECIES[(index + step + SPECIES.length) % SPECIES.length]
                  setSpecies(next)
                  // Focus follows the choice: that is what makes the next
                  // arrow press continue from where the user is looking.
                  event.currentTarget.parentElement
                    ?.querySelectorAll('button')
                    [SPECIES.indexOf(next)]?.focus()
                }}
              >
                <Icon size={38} />
                {t(option)}
              </button>
            )
          })}
        </div>

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
                {t(crateLabel(claiming, count))}
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
