import { useEffect, useRef } from 'react'

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
}: {
  title: string
  body?: string
  options: Array<Choice<V>>
  closeLabel: string
  onPick: (value: V) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)

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
    >
      <div className="flex flex-col gap-3 p-4">
        <h2 className="text-2xl">{title}</h2>
        {body ? <p className="text-base font-bold text-ink-2">{body}</p> : null}
        <div
          className="grid gap-3"
          style={{
            gridTemplateColumns: `repeat(${Math.min(options.length, 3)}, minmax(0, 1fr))`,
          }}
        >
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              className="btn btn-lg btn-primary flex-col gap-0.5"
              onClick={() => onPick(option.value)}
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
