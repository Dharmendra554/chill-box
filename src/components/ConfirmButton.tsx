import { useEffect, useState } from 'react'
import { useT } from '../i18n/useT'
import { cx } from '../lib/ui'

/**
 * Two-tap button for anything that cannot be undone.
 *
 * Salt spray and wet fingers make phantom taps routine on this dock, and a
 * stray tap on "release" hands a skipper's space to the next boat. The
 * first tap only arms the button; it disarms itself after four seconds so
 * an armed control never lies in wait in a pocket. Cheaper and safer than
 * a modal, which a wet screen can dismiss by itself.
 */
export function ConfirmButton({
  label,
  className,
  hint,
  disabled = false,
  onConfirm,
}: Readonly<{
  label: string
  className: string
  /** One line saying what this does, on hover. Nothing on a touch screen. */
  hint?: string
  /** Held open by a sibling action on the same row. */
  disabled?: boolean
  onConfirm: () => void | Promise<void>
}>) {
  const t = useT()
  const [armed, setArmed] = useState(false)
  /**
   * These actions now wait for the shared harbour, which on a 2G tether is
   * over a second of a button that still looks pressable. A second confirm
   * in that window reached a database with nothing left to change and came
   * back as a refusal — telling a skipper whose release had just worked that
   * something had gone wrong.
   */
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!armed) return
    const id = window.setTimeout(() => setArmed(false), 4000)
    return () => window.clearTimeout(id)
  }, [armed])

  return (
    <button
      type="button"
      className={cx(className, armed && 'btn-armed')}
      aria-live="polite"
      title={hint}
      disabled={busy || disabled}
      onClick={async () => {
        if (busy) return
        if (!armed) {
          setArmed(true)
          return
        }
        setArmed(false)
        setBusy(true)
        try {
          await onConfirm()
        } finally {
          setBusy(false)
        }
      }}
    >
      {busy ? t('saving') : armed ? t('confirmQ') : label}
    </button>
  )
}
