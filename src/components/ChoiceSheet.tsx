import { useRef, useState } from 'react'
import { useModal } from '../lib/dialog'

export interface Choice<V> {
  value: V
  label: string
  hint?: string
}

/**
 * The only modal in the app: a full-width bottom sheet of large buttons.
 * Used for "how many crates" and "when will you collect", which are the
 * only two questions we ever ask. Native <dialog> gives us focus trapping,
 * Escape and the backdrop for free.
 */
export function ChoiceSheet<V extends string | number>({
  title,
  body,
  options,
  closeLabel,
  onPick,
  onClose,
}: Readonly<{
  title: string
  body?: string
  options: Array<Choice<V>>
  closeLabel: string
  onPick: (value: V) => void | Promise<void>
  onClose: () => void
}>) {
  const ref = useRef<HTMLDialogElement>(null)
  // Picking a collection time writes to the shared harbour, so the same
  // double-tap hazard applies here as on the booking sheet.
  const [busy, setBusy] = useState(false)

  useModal(ref, onClose)

  return (
    <dialog
      ref={ref}
      className="sheet sheet-in max-w-6xl text-ink backdrop:bg-[var(--c-scrim)] sm:mx-auto sm:mb-6"
      onClose={onClose}
      onCancel={onClose}
      // Named, like the other three sheets. This one announced as a bare
      // "dialog" — on the screen where a skipper promises the collection
      // hour the whole harbour plans around.
      aria-label={title}
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-2xl">{title}</h2>
        {body ? <p className="text-base font-bold text-ink-2">{body}</p> : null}
        {/*
          Wraps instead of insisting on three columns.
          At 320 px, three columns left each button about 40 px of content
          box, and the Telugu label "గంటల్లో" — three clusters including a
          below-base conjunct and the two-part ో matra — is an unbreakable
          ~45 px run. It painted over its own border and into its neighbour,
          on the one sheet where a skipper promises the collection hour the
          whole harbour plans around. `auto-fit` drops to two columns on a
          narrow phone and keeps three where they fit.
        */}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(7rem, 1fr))' }}
        >
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              className="btn btn-lg btn-primary min-w-0 flex-col gap-0.5 px-2"
              disabled={busy}
              onClick={async () => {
                if (busy) return
                setBusy(true)
                try {
                  await onPick(option.value)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {option.label}
              {option.hint ? (
                <span className="tabular text-xs font-bold opacity-90">{option.hint}</span>
              ) : null}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </dialog>
  )
}
