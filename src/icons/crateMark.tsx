import type { Slot, Species } from '../types'
import { TideClockIcon } from './marine'
import { SPECIES_ICON } from './species'

/**
 * The non-colour mark for a crate, in one place.
 *
 * Status is colour AND shape AND text, never colour alone: `pulse-late` is
 * the only other non-colour cue and it is switched off under
 * prefers-reduced-motion, which cheap Androids often have on. Without a mark,
 * a hold and a stored crate differ by hue in direct sun — and that is the
 * distinction that matters most, because a hold is an EMPTY crate someone has
 * claimed while occupied has fish in it. Reversing those at 4 a.m. is a
 * dispute at the quay.
 *
 * One function because the crate grid, the harbour row and the legend must
 * agree. They have not before: a round shipped a legend that taught a stored
 * crate a generic crate glyph while the grid drew the catch's own species
 * icon, and a legend that teaches a mark the grid never uses is worse than no
 * legend — the skipper looks for something that is not there.
 */
export function crateMark(status: Slot['status'], species: Species | null, size: number) {
  if (status === 'overstay') return <span aria-hidden>!</span>
  if (status === 'reserved') return <TideClockIcon size={size} />
  if (!species) return null
  const Icon = SPECIES_ICON[species]
  return <Icon size={size} />
}
