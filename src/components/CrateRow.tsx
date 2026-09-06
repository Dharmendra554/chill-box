import { boatName } from '../data/boats'
import { formatClock, formatGap } from '../lib/time'
import { cx, STATUS_LABEL, STATUS_STYLE } from '../lib/ui'
import type { Occupancy } from '../store/selectors'
import type { T } from '../i18n/dictionary'
import type { Boat, Lang, Species } from '../types'
import { SPECIES_ICON } from '../icons/species'
import { TideClockIcon } from '../icons/marine'

/**
 * One boat's hold on one box: who, what, and when it frees.
 *
 * Shared by the harbour list and the box detail sheet so the two can never
 * disagree about how a crate is described — the same row, whichever way a
 * skipper arrived at it.
 *
 * Two rows, not three columns. Telugu box names are long and the catch tag
 * is a fixed-width chip, so squeezing name, box, tag and time onto one line
 * made them overlap on a narrow phone. The identity line sits above its
 * details.
 */
export function CrateRow({
  t,
  lang,
  row,
  boat,
  now,
  hideBox = false,
}: {
  t: T
  lang: Lang
  row: Occupancy
  boat: Boat | undefined
  now: number
  hideBox?: boolean
}) {
  return (
    <li className="card flex flex-col gap-2 p-3">
      <div className="flex items-start gap-3">
        {/* The same mark the crate grid carries, for the same reason: this
            chip said everything with fill colour alone, and `pulse-late` —
            its one non-colour cue — is switched off under
            prefers-reduced-motion, which cheap Androids often have on. An
            overdue crate and a stored one then differed by hue only, in
            direct sun, on the whole Harbour tab and in every full box's
            detail sheet. */}
        {/* `role="img"` because a bare <span> is role `generic`, where an
            author-supplied accessible name is PROHIBITED and conforming
            screen readers drop it — so the first version of this label
            reached nobody at all. */}
        <span
          className={cx(
            'grid h-11 w-11 shrink-0 place-items-center gap-0 border-3 border-rule font-display text-sm font-extrabold leading-none',
            STATUS_STYLE[row.status],
          )}
          role="img"
          aria-label={`#${row.boatId} · ${t(STATUS_LABEL[row.status])}`}
        >
          <span aria-hidden className="flex items-center gap-0.5">
            {/* The same marks the crate grid uses, for all three statuses a
                row can hold — not just the overdue one. A hold and a stored
                crate differed by hue alone, and that is the distinction that
                matters most here: a hold is an EMPTY crate someone has
                claimed; occupied has fish in it. Reversing those at 4 a.m.
                is a dispute at the quay. */}
            {row.status === 'overstay' ? (
              '!'
            ) : row.status === 'reserved' ? (
              <TideClockIcon size={12} />
            ) : row.species ? (
              <SpeciesMark species={row.species} />
            ) : null}
            #{row.boatId}
          </span>
        </span>

        <p className="min-w-0 flex-1 truncate font-display text-lg font-extrabold">
          {boat ? boatName(boat, lang) : `#${row.boatId}`}
        </p>

        <div className="shrink-0 text-right">
          <p className="text-[0.65rem] font-extrabold uppercase leading-tight text-ink-2">
            {t('outIn')}
          </p>
          {row.plannedOutAt === null ? (
            <p className="text-sm font-bold">{t('noPlan')}</p>
          ) : (
            <>
              <p className="tabular text-lg font-extrabold leading-tight">
                {formatClock(row.plannedOutAt)}
              </p>
              <p
                className={cx(
                  'tabular text-xs font-extrabold leading-tight',
                  row.plannedOutAt < now && 'text-full',
                )}
              >
                {formatGap(row.plannedOutAt - now, lang)}
              </p>
            </>
          )}
        </div>
      </div>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-bold text-ink-2">
        <span>
          {/* Inside a box's own sheet the box name is the heading already,
              so repeating it on every row is noise. */}
          {hideBox ? null : `${t(row.boxId)} · `}
          {row.crates} {t(row.crates === 1 ? 'crateOne' : 'crates')}
        </span>
        {/* How long it has been in there. A crate that went in at 4 a.m. and
            one that went in ten minutes ago look identical without this, and
            the first is the one about to become a dispute. */}
        {row.since > 0 ? (
          <span className="tabular">
            {t('storedSince')} {formatClock(row.since)}
          </span>
        ) : null}
        {row.species ? <CatchTag t={t} species={row.species} /> : null}
      </p>
    </li>
  )
}

/** Catch tag as icon + name, so the list reads without colour alone. */
export function CatchTag({ t, species }: { t: T; species: Species }) {
  const Icon = SPECIES_ICON[species]
  return (
    <span className="inline-flex items-center gap-1 border-3 border-rule px-1 py-0.5 text-xs font-extrabold">
      <Icon size={13} />
      {t(species)}
    </span>
  )
}

/** The catch's own icon, which is what a stored crate shows in the grid. */
function SpeciesMark({ species }: { species: Species }) {
  const Icon = SPECIES_ICON[species]
  return <Icon size={12} />
}
