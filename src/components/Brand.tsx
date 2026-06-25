// Cardiogram brand mark — an ECG / heartbeat trace that doubles as a telemetry
// line: "the pulse of the race". Stroke uses currentColor, so colour + glow are
// controlled by the parent. viewBox is 64×64.

export const CG_MARK_PATH =
  'M3,36 H17 L21,36 L25,29 L29,36 L34,36 L39,47 L44,13 L49,49 L53,36 L57,36 H61'

// The wider hero trace (viewBox 0 0 800 200): a flat line with small blips that
// builds to the QRS spike as it crosses the start/finish line.
export const CG_HERO_PATH =
  'M0,120 H160 L185,120 L200,112 L212,124 L224,116 L236,120 L300,120 L318,140 L332,26 L346,184 L360,110 L372,120 L430,120 L452,88 L474,120 L560,120 L590,116 L640,122 L800,120'

export function CardiogramMark({
  size = 32,
  className,
  title = 'Cardiogram',
}: {
  size?: number
  className?: string
  title?: string
}) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={title}
    >
      <path
        d={CG_MARK_PATH}
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
