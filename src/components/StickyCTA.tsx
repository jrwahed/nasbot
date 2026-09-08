import type { ReactNode } from 'react'

/**
 * الشريط اللاصق تحت — من الملف: حد علوي 2px بلون الوضع،
 * حشو 12px 20px 16px، ومساحة أمان للموبايل.
 * على الكمبيوتر (lg) بيرجع عنصر عادي في مجرى الصفحة مش لاصق.
 */
export function StickyCTA({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`nb-safe-bottom sticky bottom-0 z-30 -mx-5 px-5 pt-3 lg:static lg:mx-0 lg:px-0 lg:pb-0 ${className}`}
      style={{
        background: 'var(--bg)',
        borderTop: '2px solid var(--line)',
      }}
    >
      {children}
    </div>
  )
}
