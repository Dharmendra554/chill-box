import type { T } from '../i18n/dictionary'
import { BOX_PLACE } from '../i18n/dictionary'
import { formatClockShort } from '../lib/time'
import { cx, STATUS_LABEL, STATUS_STYLE } from '../lib/ui'
import { emptyCount, isFull, usedCount } from '../store/selectors'
import type { ColdBox, Slot } from '../types'
import { IceIcon, TideClockIcon } from '../icons/marine'
import { SPECIES_ICON } from '../icons/species'

/**
 * One chill-box: capacity headline, fill bar, and a 10-cell grid where
 * every cell names the boat holding it and the hour it frees up. The grid
 * is the whole point — a skipper reads "who and when" without tapping.
 */
export function BoxCard({
  t,
  box,
  now,
  suggested,
  selected,
  distanceLabel,
  onPick,
  onDetails,
}: {
  t: T
  box: ColdBox
  now: number
  suggested: boolean
  selected: boolean
  /** Pre-formatted distance from the current fix, or null without GPS. */
  distanceLabel: string | null
  onPick?: (box: ColdBox) => void
  /** Opens the "who is in here and until when" sheet. */
  onDetails?: (box: ColdBox) => void
}) {
  const used = usedCount(box)
  const free = emptyCount(box)
  const full = isFull(box)
  const late = box.slots.some((s) => s.status === 'overstay')
  const pickable = Boolean(onPick) && !full

  const body = (
    <>
      <header className="flex flex-col gap-2">
        {/* The name is the loudest thing on the card: a skipper picks a box
            by its landmark, so that word has to win over every number. */}
        <h2 className="flex items-center gap-2 border-3 border-rule bg-sea px-2 py-1.5 text-xl text-sea-ink">
          <IceIcon size={22} className="shrink-0" />
          <span className="min-w-0 flex-1">{t(box.id)}</span>
        </h2>

        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 text-sm font-bold text-ink-2">
            {t(BOX_PLACE[box.id])}
            {distanceLabel ? <span className="tabular"> · {t('boxAway', distanceLabel)}</span> : null}
          </p>
          <p
            className={cx(
              'shrink-0 border-3 border-rule px-2 py-1 font-display text-base font-extrabold',
              full ? 'bg-full text-full-ink' : 'bg-free text-free-ink',
            )}
          >
            {full ? t('full') : t('freeCrates', free)}
          </p>
        </div>
      </header>

      {suggested && !full ? (
        <p className="w-fit bg-free-wash px-2 py-0.5 text-xs font-extrabold uppercase text-ink">
          {t('suggested')}
        </p>
      ) : null}

      <div className="h-3 w-full border-3 border-rule bg-card" aria-hidden>
        <div
          className={cx('h-full', full ? 'bg-full' : late ? 'bg-late' : 'bg-free')}
          style={{ width: `${(used / box.slots.length) * 100}%` }}
        />
      </div>

      <ol className="grid grid-cols-5 gap-1.5" aria-label={t(box.id)}>
        {box.slots.map((slot) => (
          <SlotCell key={slot.index} t={t} slot={slot} now={now} />
        ))}
      </ol>
    </>
  )

  const shell = cx(
    'card flex flex-col gap-3 p-3 text-left',
    selected && 'outline-4 outline-offset-2 outline-free',
  )

  // A full box is the one a skipper most wants to understand, so it opens
  // its occupancy instead of refusing the tap. Never a dead card.
  if (!pickable) {
    if (!onDetails) {
      return <article className={cx(shell, full && 'opacity-70')}>{body}</article>
    }
    return (
      <button
        type="button"
        className={cx(shell, full && 'opacity-70', 'cursor-pointer active:translate-y-0.5')}
        onClick={() => onDetails(box)}
      >
        {body}
        <span className="w-fit border-3 border-rule px-2 py-0.5 text-xs font-extrabold uppercase">
          {t('whoIsInside')}
        </span>
      </button>
    )
  }

  return (
    <button
      type="button"
      className={cx(shell, 'cursor-pointer active:translate-y-0.5')}
      aria-pressed={selected}
      onClick={() => onPick?.(box)}
    >
      {body}
    </button>
  )
}

/**
 * A single crate slot. Occupied cells carry the boat number on top and the
 * promised collection hour underneath, which is what turns the grid from
 * a status light into something a skipper can plan against.
 */
function SlotCell({ t, slot, now }: { t: T; slot: Slot; now: number }) {
  const Tag = slot.species ? SPECIES_ICON[slot.species] : null
  const out = slot.plannedOutAt
  const overdue = out !== null && out < now

  return (
    <li
      className={cx(
        'flex aspect-square flex-col items-center justify-center gap-0.5 border-3 border-rule',
        STATUS_STYLE[slot.status],
      )}
      // `title` renders on hover, and there is no hover on a dock phone — so
      // the grid's only status text was invisible to every user it has, and
      // the status came down to fill colour alone. That contradicts the one
      // design rule this app repeats everywhere: colour AND shape AND text.
      // aria-label is the half a screen reader can reach; the visible half
      // is the boat number, the collection hour and the dashed border.
      aria-label={
        slot.boatId
          ? `#${slot.boatId} · ${t(STATUS_LABEL[slot.status])}`
          : t(STATUS_LABEL.empty)
      }
      title={
        slot.boatId ? `#${slot.boatId} · ${t(STATUS_LABEL[slot.status])}` : t(STATUS_LABEL.empty)
      }
    >
      {/*
        A mark that is not a colour. The four statuses were separated by fill
        alone for a sighted skipper — the status word lives in `aria-label`
        and `title`, and neither renders on a dock phone in sunlight. A hold
        now carries a clock, an overdue crate carries `!`, a stored crate
        carries its species, and an empty cell is a dot in a dashed border.
        Four shapes, readable with the colour taken away.
      */}
      <span className="flex items-center gap-0.5 font-display text-sm leading-none font-extrabold">
        {slot.status === 'overstay' ? (
          <span aria-hidden>!</span>
        ) : slot.status === 'reserved' ? (
          <TideClockIcon size={13} />
        ) : Tag ? (
          <Tag size={13} />
        ) : null}
        {slot.boatId ? `#${slot.boatId}` : '·'}
      </span>
      {out !== null ? (
        <span
          className={cx('tabular text-[0.6rem] leading-none font-bold', overdue && 'underline')}
        >
          {formatClockShort(out)}
        </span>
      ) : null}
    </li>
  )
}
