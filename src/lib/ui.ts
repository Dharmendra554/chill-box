import type { SlotStatus } from '../types'

/**
 * The single colour contract for slot state, reused by the slot grid, the
 * legend, the harbour list and the admin table. Changing a status colour
 * is a one-line edit here, and nothing can drift.
 *
 * Every pair clears WCAG AA at body size in both themes; see tokens.css.
 */
export const STATUS_STYLE: Record<SlotStatus, string> = {
  empty: 'bg-free-wash text-ink border-dashed',
  reserved: 'bg-hold text-hold-ink',
  occupied: 'bg-full text-full-ink',
  overstay: 'bg-late text-late-ink pulse-late',
}

export const STATUS_LABEL = {
  empty: 'legendFree',
  reserved: 'legendHold',
  occupied: 'legendFull',
  overstay: 'legendLate',
} as const

/** Join class names, dropping falsy branches. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
