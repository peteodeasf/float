import React from 'react'

interface FloatLogoProps {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'white'
}

const SIZES = {
  sm: { cloud: 28, fontSize: 13, gap: 4 },
  md: { cloud: 42, fontSize: 18, gap: 6 },
  lg: { cloud: 60, fontSize: 26, gap: 8 },
}

export default function FloatLogo({ size = 'md', variant = 'default' }: FloatLogoProps) {
  const { cloud, fontSize, gap } = SIZES[size]
  const color = variant === 'white' ? '#ffffff' : '#2563eb'
  const w = cloud
  const h = cloud * 0.72

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap }}>
      <svg
        width={w}
        height={h}
        viewBox="0 0 100 72"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Cloud shape — three overlapping circles + flat bottom rect */}
        <defs>
          <clipPath id="cloud-clip">
            <rect x="0" y="0" width="100" height="72" />
          </clipPath>
        </defs>
        {/* Bottom fill rect to flatten the base */}
        <rect x="8" y="44" width="84" height="28" fill={color} />
        {/* Left bump */}
        <circle cx="30" cy="44" r="22" fill={color} />
        {/* Right bump */}
        <circle cx="68" cy="44" r="22" fill={color} />
        {/* Center top bump — taller */}
        <circle cx="50" cy="30" r="26" fill={color} />
      </svg>
      <span
        style={{
          fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif",
          fontSize,
          fontWeight: 600,
          letterSpacing: '0.04em',
          color,
          lineHeight: 1,
        }}
      >
        float
      </span>
    </div>
  )
}
