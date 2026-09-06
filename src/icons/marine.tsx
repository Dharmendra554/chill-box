import type { SVGProps } from 'react'

/**
 * Hand-drawn marine glyph set.
 *
 * Emoji were dropped on purpose: they render differently on every Android
 * build in the harbour, carry a colour we cannot control, and disappear
 * against a sun-washed screen. These are stroked paths on `currentColor`
 * at a 1.8px weight, which stays legible from 20px to 96px.
 */

type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string
  title?: string
}

function Icon({ size = 24, title, children, ...rest }: IconProps) {
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
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

/** Two fish nose-to-tail — the community / shoal mark. */
export function ShoalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M8.4 7.6c1.2-3 4.7-4.1 8.6-.6a1 1 0 0 1 0 1.5c-3.9 3.5-7.4 2.4-8.6-.9Z" />
      <path d="M8.4 7.6 5.3 4.9l1.2 2.7-1.2 2.7Z" />
      <path d="M15.6 16.4c-1.2-3-4.7-4.1-8.6-.6a1 1 0 0 0 0 1.5c3.9 3.5 7.4 2.4 8.6-.9Z" />
      <path d="m15.6 16.4 3.1-2.7-1.2 2.7 1.2 2.7Z" />
      <path d="M15.1 7.1h.01M8.9 15.9h.01" strokeWidth={2.4} />
    </Icon>
  )
}

/** Slatted crate with a fish tail over the rim — one storage unit. */
export function CrateIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M3.8 9.5h16.4l-1.5 10.2a1 1 0 0 1-1 .8H6.3a1 1 0 0 1-1-.8Z" />
      <path d="M8.1 9.5 7.4 20.5M15.9 9.5l.7 11" />
      <path d="M4.5 14.6h15" />
      <path d="M9.4 9.5c.6-3.4 4-5.5 7.4-2.4" />
      <path d="M16.8 7.1 20 4.6l-1 2.6 1 2.5Z" />
    </Icon>
  )
}

/** Ice crystal — the "cold" mark on box headers. */
export function IceIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2.6v18.8" />
      <path d="m4 7.3 16 9.4M20 7.3 4 16.7" />
      <path d="m9.4 4.6 2.6 2 2.6-2M9.4 19.4l2.6-2 2.6 2" />
      <path d="m4.6 11.4-.6-3 2.9-.8M19.4 12.6l.6 3-2.9.8" />
      <path d="m6.9 16.4-2.9-.8.6-3M17.1 7.6l2.9.8-.6 3" />
    </Icon>
  )
}

/** Fishing boat, hull and mast — used for boat identity everywhere. */
export function BoatIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.6 15.6h18.8l-2.6 4.3a1 1 0 0 1-.9.5H6.1a1 1 0 0 1-.9-.5Z" />
      <path d="M5.4 15.6V9.2h13.2l-3.2 6.4" />
      <path d="M12 9.2V4.1" />
      <path d="M12 4.1h4.6l-1.7 2.2 1.7 2.2H12" />
      <path d="M8.3 9.2v6.4" />
    </Icon>
  )
}

/** Anchor — harbour / dock. */
export function AnchorIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="4.6" r="2.1" />
      <path d="M12 6.7v14.1" />
      <path d="M8 10h8" />
      <path d="M4.2 13.4c0 4.1 3.5 7.4 7.8 7.4s7.8-3.3 7.8-7.4" />
      <path d="M4.2 13.4H6.9M19.8 13.4h-2.7" />
    </Icon>
  )
}

/** Compass rose with a needle — navigation. */
export function CompassIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="m15.6 8.4-1.9 5.3-5.3 1.9 1.9-5.3Z" />
      <path d="M12 2.8v1.9M12 19.3v1.9M2.8 12h1.9M19.3 12h1.9" />
    </Icon>
  )
}

/** Swell lines — sea state. */
export function WaveIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.4 8.2c1.9-2.4 3.3-2.4 4.8 0s2.9 2.4 4.8 0 3.3-2.4 4.8 0 2.9 2.4 4.8 0" />
      <path d="M2.4 13.4c1.9-2.4 3.3-2.4 4.8 0s2.9 2.4 4.8 0 3.3-2.4 4.8 0 2.9 2.4 4.8 0" />
      <path d="M2.4 18.6c1.9-2.4 3.3-2.4 4.8 0s2.9 2.4 4.8 0 3.3-2.4 4.8 0 2.9 2.4 4.8 0" />
    </Icon>
  )
}

/** Chart plotter: a pin on a folded sea chart. */
export function ChartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M2.8 6.4 9 4.1v13.5l-6.2 2.3Z" />
      <path d="M9 4.1l6 2.2v3.1M9 17.6l6 2.2v-4.3" />
      <path d="m15 6.3 6.2-2.2v5.1" />
      <path d="M17.4 20.4c1.9-2.5 3.1-4.2 3.1-5.7a3.1 3.1 0 0 0-6.2 0c0 1.5 1.2 3.2 3.1 5.7Z" />
      <path d="M17.4 14.5h.01" strokeWidth={2.4} />
    </Icon>
  )
}

/** Life ring — the admin / harbour-master mark. */
export function HelmIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9.2" />
      <circle cx="12" cy="12" r="3.4" />
      <path d="M12 2.8v5.8M12 15.4v5.8M2.8 12h5.8M15.4 12h5.8" />
    </Icon>
  )
}

/** Hourglass-free clock with a sweep — planned collection time. */
export function TideClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M12 6.8V12l3.4 2.1" />
      <path d="M6.6 17.4c1.1-1.4 1.9-1.4 2.8 0s1.7 1.4 2.8 0 1.9-1.4 2.8 0" />
    </Icon>
  )
}

/** Speaker with sound waves — the spoken capacity readout. */
export function SpeakerIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.2 9.2h3.4L12.4 5v14L7.6 14.8H4.2a1 1 0 0 1-1-1V10.2a1 1 0 0 1 1-1Z" />
      <path d="M15.6 9.4c1.3 1.5 1.3 3.7 0 5.2" />
      <path d="M18.2 6.8c2.7 2.9 2.7 7.5 0 10.4" />
    </Icon>
  )
}

/** Speaker with the waves struck through — playback in progress, tap to stop. */
export function SpeakerStopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4.2 9.2h3.4L12.4 5v14L7.6 14.8H4.2a1 1 0 0 1-1-1V10.2a1 1 0 0 1 1-1Z" />
      <path d="M16.2 9.8 21 14.6M21 9.8l-4.8 4.8" />
    </Icon>
  )
}

/** Sun — switch to the daylight theme. */
export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4.4" />
      <path d="M12 2.4v2.6M12 19v2.6M4.6 4.6l1.9 1.9M17.5 17.5l1.9 1.9M2.4 12H5M19 12h2.6M4.6 19.4l1.9-1.9M17.5 6.5l1.9-1.9" />
    </Icon>
  )
}

/** Crescent moon — switch to the night theme for pre-dawn landings. */
export function MoonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20.4 14.6A8.6 8.6 0 0 1 9.4 3.6a8.8 8.8 0 1 0 11 11Z" />
    </Icon>
  )
}
