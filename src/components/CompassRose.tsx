/**
 * North-up bearing dial to the booked box.
 *
 * Phone magnetometers on this fleet's low-cost Androids are unreliable and
 * often uncalibrated, so we show a true bearing against a fixed north
 * rather than pretending to rotate with the boat. It is pure maths on the
 * GPS fix, so it keeps working when the chart tiles cannot load.
 */
export function CompassRose({
  bearing,
  atTarget,
  label,
  bearingLabel,
}: Readonly<{
  bearing: number
  atTarget: boolean
  /** Spoken only once the boat has actually arrived. */
  label: string
  /** Spoken the rest of the time — the heading the dial is showing. */
  bearingLabel: string
}>) {
  return (
    <figure className="card flex items-center justify-center p-4">
      {/* `label` used to be the aria-label unconditionally, so a skipper
          using TalkBack eight kilometres offshore was told "You are at the
          box". The dial's visible text is already gated on atTarget; its
          spoken text was not. */}
      <svg
        viewBox="0 0 200 200"
        className="h-52 w-52"
        role="img"
        aria-label={atTarget ? label : bearingLabel}
      >
        <circle cx="100" cy="100" r="94" fill="none" stroke="currentColor" strokeWidth="3" />

        {Array.from({ length: 24 }, (_, i) => {
          const angle = (i * 15 * Math.PI) / 180
          const major = i % 6 === 0
          return (
            <line
              key={i}
              x1={100 + Math.sin(angle) * 88}
              y1={100 - Math.cos(angle) * 88}
              x2={100 + Math.sin(angle) * (major ? 68 : 80)}
              y2={100 - Math.cos(angle) * (major ? 68 : 80)}
              stroke="currentColor"
              strokeWidth={major ? 3 : 1.5}
            />
          )
        })}

        {['N', 'E', 'S', 'W'].map((mark, i) => {
          const angle = (i * 90 * Math.PI) / 180
          return (
            <text
              key={mark}
              x={100 + Math.sin(angle) * 78}
              y={100 - Math.cos(angle) * 78 + 7}
              textAnchor="middle"
              fontSize="20"
              fontWeight="800"
              fill="currentColor"
            >
              {mark}
            </text>
          )
        })}

        <g transform={`rotate(${bearing} 100 100)`}>
          <path
            d="M100 26 L118 118 L100 104 L82 118 Z"
            fill="var(--c-free)"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
          />
        </g>
        <circle cx="100" cy="100" r="7" fill="currentColor" />

        {atTarget ? (
          <text
            x="100"
            y="164"
            textAnchor="middle"
            fontSize="16"
            fontWeight="800"
            fill="currentColor"
          >
            {label}
          </text>
        ) : null}
      </svg>
    </figure>
  )
}
