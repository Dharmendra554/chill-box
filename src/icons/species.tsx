import type { ReactElement, SVGProps } from 'react'
import type { Species } from '../types'

/**
 * Catch-tagging icons. Tagging has to happen on a wet deck in seconds, so
 * the species picker is icons only — no dropdown, no typing. Each glyph is
 * drawn from its distinctive silhouette (claw, whisker, body depth) rather
 * than a generic fish, because that is what a skipper recognises at a
 * glance without reading the label underneath.
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number | string }

function Glyph({ size = 24, children, ...rest }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  )
}

/** Prawn — curled body, long rostrum, feathered tail fan. */
export function PrawnIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M18.6 5.9c-6.4-.9-11.4 2.4-11.4 7.1 0 3.2 2.6 5.3 5.6 5.3 2.2 0 3.9-1.2 3.9-2.9" />
      <path d="M18.6 5.9c1.4 1.8 1.7 3.6 1.1 5.2" />
      <path d="M7.2 13c-1.5.4-2.8 1.5-3.5 3.1" />
      <path d="M8.4 9.6c-1.5-.4-3-.1-4.2.8M10.9 7.2c-1.1-1.1-2.5-1.6-4-1.5" />
      <path d="M16.7 15.4c1.4 1 2.5 1.4 3.9 1.3-.8 1.5-2 2.4-3.6 2.7" />
      <path d="M15.9 8.6h.01" strokeWidth={2.4} />
    </Glyph>
  )
}

/** Crab — carapace, two claws, walking legs. */
export function CrabIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6.4 13.6a5.6 4.2 0 0 1 11.2 0 5.6 4.2 0 0 1-11.2 0Z" />
      <path d="M9.4 10.2 8.1 7.6M14.6 10.2l1.3-2.6" />
      <path d="M6.5 12.1 3.6 10.4a2 2 0 0 1 2.4-3M17.5 12.1l2.9-1.7a2 2 0 0 0-2.4-3" />
      <path d="M7.1 16.2 4.6 18M9.6 17.6l-1 2.4M14.4 17.6l1 2.4M16.9 16.2l2.5 1.8" />
      <path d="M10.4 13.2h.01M13.6 13.2h.01" strokeWidth={2.4} />
    </Glyph>
  )
}

/** Sardine — small and slim, with the row of belly scutes it is known by. */
export function SardineIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M7.8 12c.9-2.3 5.4-3.7 11.2-.4a.7.7 0 0 1 0 .8C13.2 15.7 8.7 14.3 7.8 12Z" />
      <path d="M7.8 12 3.6 9.6 5.1 12l-1.5 2.4Z" />
      <path d="M11.6 13.9h.01M13.4 14.3h.01M15.2 14.3h.01" strokeWidth={1.8} />
      <path d="m12.4 10.1 1.2-1.9" />
      <path d="M17.2 11.4h.01" strokeWidth={2.2} />
    </Glyph>
  )
}

/** Mackerel — torpedo body under the bold dark bars across its back. */
export function MackerelIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M6.9 12c1.5-4.2 6.6-6 12.2-.7a1 1 0 0 1 0 1.4C13.5 18 8.4 16.2 6.9 12Z" />
      <path d="M6.9 12 2.8 8.6 4.5 12l-1.7 3.4Z" />
      <path d="M10.6 8.2v7.6M13.2 7.2v9.6M15.8 7.6v8.8" strokeWidth={2} />
      <path d="M18.2 11.2h.01" strokeWidth={2.4} />
    </Glyph>
  )
}

/** Pomfret — the deep silver disc, taller than it is long. */
export function PomfretIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M9.6 12c0-5 2.9-8.4 6-8.4s5.6 3.4 5.6 8.4-2.5 8.4-5.6 8.4S9.6 17 9.6 12Z" />
      <path d="M9.6 12 3 7.8 5.4 12 3 16.2Z" />
      <path d="M13.4 4.4 12.1 2M13.4 19.6 12.1 22" />
      <path d="M18.6 9.6h.01" strokeWidth={2.4} />
    </Glyph>
  )
}

/** Mixed catch — a small shoal, used as the zero-decision default. */
export function MixedCatchIcon(props: IconProps) {
  return (
    <Glyph {...props}>
      <path d="M9.4 7.4c1-2.4 4.2-3.4 7.8-.4a.8.8 0 0 1 0 1.2c-3.6 3-6.8 2-7.8-.8Z" />
      <path d="M9.4 7.4 6 5.2l1.3 2.2L6 9.6Z" />
      <path d="M9.4 16.6c1-2.4 4.2-3.4 7.8-.4a.8.8 0 0 1 0 1.2c-3.6 3-6.8 2-7.8-.8Z" />
      <path d="M9.4 16.6 6 14.4l1.3 2.2L6 18.8Z" />
      <path d="M14.4 6.8h.01M14.4 16h.01" strokeWidth={2.2} />
      <path d="M3.2 12h8" />
    </Glyph>
  )
}

/**
 * Icon per species — the only place the mapping lives.
 *
 * oxlint warns that a non-component export costs fast refresh in this file.
 * Splitting it out would mean a second module whose whole job is to re-export
 * these six components, so we take the development-only cost and keep the
 * glyphs and their mapping together.
 */
// oxlint-disable-next-line react/only-export-components
export const SPECIES_ICON: Record<Species, (props: IconProps) => ReactElement> = {
  prawn: PrawnIcon,
  crab: CrabIcon,
  sardine: SardineIcon,
  mackerel: MackerelIcon,
  pomfret: PomfretIcon,
  mixed: MixedCatchIcon,
}
