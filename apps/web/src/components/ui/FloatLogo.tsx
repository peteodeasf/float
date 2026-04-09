interface FloatLogoProps {
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: { wave: 24, text: 'text-lg', gap: 'gap-1.5' },
  md: { wave: 32, text: 'text-2xl', gap: 'gap-2' },
  lg: { wave: 40, text: 'text-3xl', gap: 'gap-2.5' },
}

export default function FloatLogo({ size = 'md' }: FloatLogoProps) {
  const s = sizes[size]

  return (
    <div className={`flex items-center ${s.gap}`}>
      <svg
        width={s.wave}
        height={s.wave}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M4 22c3-4 6-7 10-7s6 6 10 6 6-6 10-6c2 0 3.5 1 5 2.5"
          stroke="var(--float-blue-600, #2563eb)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M4 30c3-4 6-7 10-7s6 6 10 6 6-6 10-6c2 0 3.5 1 5 2.5"
          stroke="var(--float-blue-600, #2563eb)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          opacity="0.4"
        />
      </svg>
      <span
        className={`${s.text} font-semibold tracking-tight`}
        style={{ color: 'var(--float-grey-800, #1e293b)' }}
      >
        Float
      </span>
    </div>
  )
}
