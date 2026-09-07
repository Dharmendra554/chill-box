import { useRef } from 'react'
import { useModal } from '../lib/dialog'
import { boatsAt } from '../data/boats'
import { useNow } from '../hooks/useClock'
import { useT } from '../i18n/useT'
import { emptyCount, NOT_COLLECTED_MS, occupancyRows } from '../store/selectors'
import { selectBoxes, useDockStore } from '../store/useDockStore'
import type { ColdBox } from '../types'
import { CrateRow } from './CrateRow'

/**
 * Who is in this box, since when, and when it frees up.
 *
 * This exists for the tap that used to do nothing. A full box was the one
 * card a skipper could not open, which is exactly backwards: the box with no
 * room is the box you most need to understand. "Full" on its own starts an
 * argument at the quay; "#11 since 4:10 am, out at 7 am" ends one.
 */
export function BoxDetails({ box, onClose }: Readonly<{ box: ColdBox; onClose: () => void }>) {
  const t = useT()
  const lang = useDockStore((s) => s.lang)
  const harbourId = useDockStore((s) => s.harbourId)
  const allBoats = useDockStore((s) => s.boats)
  const boxes = useDockStore(selectBoxes)
  const ledger = useDockStore((s) => s.ledger)
  const now = useNow()
  const ref = useRef<HTMLDialogElement>(null)

  // Read the box back out of the store rather than trusting the one we were
  // opened with: another phone may free a crate while this sheet is open.
  const live = boxes.find((b) => b.id === box.id) ?? box
  const rows = occupancyRows([live])
  const byId = new Map(boatsAt(allBoats, harbourId).map((b) => [b.id, b]))
  const free = emptyCount(live)

  /**
   * Spaces this box got back at the eight-hour line, still within the day.
   *
   * On the Harbour tab this is a section of its own. It has to be HERE too,
   * because this is the screen a skipper opens to decide whether to bring a
   * crate to this box — and after a reclaim the slot reads free, the gauge
   * counts it free, and the fish may still physically be in it. The brief
   * asks for a flag on uncollected crates blocking others; removing the flag
   * at the moment the space is reassigned is the one point where the app
   * knows something the skipper walking over does not.
   */
  const reclaimed = ledger.filter(
    (e) =>
      e.harbourId === harbourId &&
      e.boxId === box.id &&
      e.reclaimed === true &&
      now - e.releasedAt < NOT_COLLECTED_MS,
  )

  useModal(ref, onClose)

  return (
    <dialog
      ref={ref}
      className="sheet sheet-in max-w-6xl text-ink backdrop:bg-[var(--c-scrim)] sm:mx-auto"
      onClose={onClose}
      onCancel={onClose}
      aria-label={t(box.id)}
    >
      {/* `max-h-full`, not `80vh`. A viewport unit knows nothing about the
          chrome, so at 640 px tall it asked for 512 px inside a sheet capped
          at 489 — and the Close button, a 72 px target, ended 9 px below the
          fold. One line more chrome (an offline banner instead of the calm
          strip) took 49 px of it. `min-h-0` because a flex child will not
          shrink below its content without it. */}
      <div className="flex max-h-full min-h-0 flex-col gap-3 overflow-y-auto p-4">
        <header>
          <h2 className="text-2xl">{t(box.id)}</h2>
          <p className="font-bold text-ink-2">
            {free === 0 ? t('full') : t('freeCrates', free)}
          </p>
        </header>

        {rows.length === 0 ? (
          <p className="card p-4 font-bold">{t('nothingStored')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <CrateRow
                key={`${row.boatId}-${row.boxId}`}
                t={t}
                lang={lang}
                row={row}
                boat={byId.get(row.boatId)}
                now={now}
                hideBox
              />
            ))}
          </ul>
        )}

        {reclaimed.length > 0 ? (
          <p className="border-3 border-late bg-late-wash px-3 py-2 text-sm font-bold">
            {t('reclaimedHere', reclaimed.map((e) => `#${e.boatId}`).join(', '))}
          </p>
        ) : null}

        <button type="button" className="btn btn-lg btn-block" onClick={onClose}>
          {t('close')}
        </button>
      </div>
    </dialog>
  )
}
