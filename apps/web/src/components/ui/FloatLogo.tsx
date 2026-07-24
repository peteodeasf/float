interface FloatLogoProps {
  /** sm = mark only; md/lg = full lockup */
  size?: 'sm' | 'md' | 'lg'
  /** Use the reverse (mint/white) treatment on dark surfaces. */
  reverse?: boolean
}

// Lockup viewBox is 360×120; the mark alone is 120×120.
const SIZES = {
  sm: { height: 20 },
  md: { height: 26 },
  lg: { height: 38 },
}

// The wordmark is outlined to paths — no webfont dependency, so it renders
// identically in every browser, email client and PDF. Generated from Plus
// Jakarta Sans ExtraBold with ligatures disabled, which is how a browser
// renders the source lockup (letter-spacing suppresses the "fl" ligature).
const WORDMARK_PATH =
  'M136.406 86.0V50.224H128.494V39.044H136.406V38.356Q136.406 32.766 138.599 28.896Q140.792 25.026 144.92 22.962Q149.048 20.898 154.896 20.898Q156.014 20.898 157.304 21.027Q158.594 21.156 159.454 21.328V32.336Q158.594 32.164 157.949 32.121Q157.304 32.078 156.616 32.078Q153.004 32.078 151.155 33.669Q149.306 35.26 149.306 38.356V39.044H159.368V50.224H149.306V86.0Z M162.99 86.0V20.898H175.89V86.0Z M205.656 87.032Q198.69 87.032 192.971 83.85Q187.252 80.668 183.855 75.121Q180.458 69.574 180.458 62.522Q180.458 55.384 183.855 49.88Q187.252 44.376 192.971 41.194Q198.69 38.012 205.656 38.012Q212.622 38.012 218.298 41.194Q223.974 44.376 227.371 49.88Q230.768 55.384 230.768 62.522Q230.768 69.574 227.371 75.121Q223.974 80.668 218.298 83.85Q212.622 87.032 205.656 87.032ZM205.656 75.422Q209.182 75.422 211.805 73.788Q214.428 72.154 215.933 69.23Q217.438 66.306 217.438 62.522Q217.438 58.738 215.933 55.857Q214.428 52.976 211.805 51.299Q209.182 49.622 205.656 49.622Q202.13 49.622 199.464 51.299Q196.798 52.976 195.293 55.857Q193.788 58.738 193.788 62.522Q193.788 66.306 195.293 69.23Q196.798 72.154 199.464 73.788Q202.13 75.422 205.656 75.422Z M249.87 87.032Q244.796 87.032 241.098 85.398Q237.4 83.764 235.422 80.711Q233.444 77.658 233.444 73.444Q233.444 69.488 235.25 66.435Q237.056 63.382 240.797 61.318Q244.538 59.254 250.128 58.394L264.49 56.072V65.532L252.45 67.682Q249.698 68.198 248.236 69.445Q246.774 70.692 246.774 73.014Q246.774 75.164 248.408 76.368Q250.042 77.572 252.45 77.572Q255.632 77.572 258.04 76.196Q260.448 74.82 261.781 72.455Q263.114 70.09 263.114 67.252V55.04Q263.114 52.374 261.007 50.568Q258.9 48.762 255.288 48.762Q251.848 48.762 249.225 50.654Q246.602 52.546 245.398 55.642L235.078 50.74Q236.454 46.784 239.464 43.946Q242.474 41.108 246.688 39.56Q250.902 38.012 255.89 38.012Q261.824 38.012 266.382 40.162Q270.94 42.312 273.477 46.139Q276.014 49.966 276.014 55.04V86.0H263.974V78.432L266.898 77.916Q264.834 81.012 262.34 83.033Q259.846 85.054 256.75 86.043Q253.654 87.032 249.87 87.032Z M304.232 86.516Q295.718 86.516 291.031 81.915Q286.344 77.314 286.344 69.058V50.224H278.432V39.044H278.862Q282.474 39.044 284.409 37.238Q286.344 35.432 286.344 31.82V28.38H299.244V39.044H310.252V50.224H299.244V68.198Q299.244 70.606 300.104 72.197Q300.964 73.788 302.77 74.562Q304.576 75.336 307.242 75.336Q307.844 75.336 308.618 75.25Q309.392 75.164 310.252 75.078V86.0Q308.962 86.172 307.328 86.344Q305.694 86.516 304.232 86.516Z'

function Mark({ arc, dot }: { arc: string; dot: string }) {
  return (
    <>
      <g transform="rotate(-50 60 60)">
        <path
          d="M51 99 A40 40 0 1 1 69 99"
          stroke={arc}
          strokeWidth="13"
          strokeLinecap="round"
        />
      </g>
      <circle cx="60" cy="60" r="17" fill={dot} />
    </>
  )
}

export default function FloatLogo({ size = 'md', reverse = false }: FloatLogoProps) {
  const height = SIZES[size].height
  const arc = reverse ? '#9af6e4' : 'var(--float-primary)'
  const dot = reverse ? '#ffffff' : '#9af6e4'
  const word = reverse ? '#ffffff' : 'var(--float-primary)'

  // sm: mark only
  if (size === 'sm') {
    return (
      <svg
        viewBox="0 0 120 120"
        style={{ height, width: height, display: 'block' }}
        fill="none"
        role="img"
        aria-label="Float"
      >
        <Mark arc={arc} dot={dot} />
      </svg>
    )
  }

  return (
    <svg
      viewBox="0 0 360 120"
      style={{ height, width: height * 3, display: 'block' }}
      fill="none"
      role="img"
      aria-label="Float"
    >
      <Mark arc={arc} dot={dot} />
      <path d={WORDMARK_PATH} fill={word} />
    </svg>
  )
}
