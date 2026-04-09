interface FloatLogoProps {
  size?: 'sm' | 'md' | 'lg'
}

const BRAND_BLUE = '#00AEEF'

const sizes = {
  sm: { cloud: 32, fontSize: 16, gap: 6 },
  md: { cloud: 48, fontSize: 22, gap: 8 },
  lg: { cloud: 64, fontSize: 28, gap: 10 },
}

function CloudSvg({ width }: { width: number }) {
  return (
    <svg
      width={width}
      height={width * 0.7}
      viewBox="0 0 100 70"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M25 65 C10 65 0 55 0 43 C0 31 10 22 22 22 C22 9 33 0 48 0 C61 0 72 8 74 20 C76 19 79 18 82 18 C92 18 100 27 100 38 C100 49 92 57 82 57 L82 57 C82 62 78 65 73 65 Z"
        fill={BRAND_BLUE}
      />
    </svg>
  )
}

export default function FloatLogo({ size = 'md' }: FloatLogoProps) {
  const s = sizes[size]

  const textStyle = {
    color: BRAND_BLUE,
    fontSize: `${s.fontSize}px`,
    fontWeight: 600 as const,
    letterSpacing: '0.04em',
    lineHeight: 1,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  }

  // sm renders horizontally for nav bars; md/lg render stacked for login pages
  if (size === 'sm') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: `${s.gap}px` }}>
        <CloudSvg width={s.cloud} />
        <span style={textStyle}>float</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: `${s.gap}px` }}>
      <CloudSvg width={s.cloud} />
      <span style={textStyle}>float</span>
    </div>
  )
}
