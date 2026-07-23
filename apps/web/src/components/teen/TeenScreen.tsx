import type { ReactNode } from 'react'

type Variant = 'canvas' | 'alt' | 'card' | 'dark'

const VARIANT_CLASS: Record<Variant, string> = {
  canvas: '',
  alt: ' teen-screen--alt',
  card: ' teen-screen--card',
  dark: ' teen-screen--dark',
}

/**
 * The mobile viewport shell every teen screen renders into.
 *
 * `bubbles` draws the decorative mint motif that bleeds off the top-right
 * corner (plus the soft circle lower-left) — used on the calm screens (home,
 * moment) and omitted where a white sheet covers the canvas.
 */
export default function TeenScreen({
  variant = 'canvas',
  bubbles = false,
  children,
}: {
  variant?: Variant
  bubbles?: boolean
  children: ReactNode
}) {
  return (
    <div className={`teen-screen teen-fade-enter${VARIANT_CLASS[variant]}`}>
      {bubbles && (
        <>
          <div
            className="teen-bubble"
            style={{ top: -52, right: -34, width: 150, height: 150 }}
            aria-hidden="true"
          />
          <div
            className="teen-bubble teen-bubble--soft"
            style={{ bottom: 118, left: -26, width: 82, height: 82 }}
            aria-hidden="true"
          />
        </>
      )}
      {children}
    </div>
  )
}
