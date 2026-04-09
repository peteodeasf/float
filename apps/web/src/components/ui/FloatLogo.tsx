interface FloatLogoProps {
  size?: 'sm' | 'md' | 'lg'
}

const SIZES = {
  sm: { waveW: 20, waveH: 12, fontSize: 0, gap: 0 },
  md: { waveW: 32, waveH: 18, fontSize: 17, gap: 8 },
  lg: { waveW: 48, waveH: 28, fontSize: 24, gap: 10 },
}

function WaveSvg({ width, height }: { width: number; height: number }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 48 14"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M2 10 C10 2, 14 2, 24 7 C34 12, 38 12, 46 4"
        stroke="var(--float-primary, #0d9488)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

export default function FloatLogo({ size = 'md' }: FloatLogoProps) {
  const s = SIZES[size]

  // sm: icon only
  if (size === 'sm') {
    return <WaveSvg width={s.waveW} height={s.waveH} />
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: `${s.gap}px` }}>
      <WaveSvg width={s.waveW} height={s.waveH} />
      <span
        style={{
          fontSize: `${s.fontSize}px`,
          fontWeight: 500,
          letterSpacing: '0.03em',
          color: 'var(--float-primary, #0d9488)',
          lineHeight: 1,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        float
      </span>
    </div>
  )
}
