import { useRef } from 'react'
import { useModal } from '../lib/dialog'
import { boatsAt } from '../data/boats'
import { useNow } from '../hooks/useClock'
import { useT } from '../i18n/useT'
import { emptyCount, occupancyRows } from '../store/selectors'
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
  const now = useNow()
  const ref = useRef<HTMLDialogElement>(null)

  // Read the box back out of the store rather than trusting the one we were
  // opened with: another phone may free a crate while this sheet is open.
  const live = boxes.find((b) => b.id === box.id) ?? box
  const rows = occupancyRows([live])
  const byId = new Map(boatsAt(allBoats, harbourId).map((b) => [b.id, b]))
  const free = emptyCount(live)

  useModal(ref, onClose)

  return (
    <dialog
      ref={ref}
      className="sheet-in m-0 mt-auto w-full max-w-6xl border-3 border-rule bg-card p-0 text-ink backdrop:bg-[var(--c-scrim)] sm:mx-auto sm:mb-6"
      onClose={onClose}
      onCancel={onClose}
      aria-label={t(box.id)}
    >
      <div className="flex max-h-[80vh] flex-col gap-3 overflow-y-auto p-4">
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

        <button type="button" className="btn btn-lg btn-block" onClick={onClose}>
          {t('close')}
        </button>
      </div>
    </dialog>
  )
}
