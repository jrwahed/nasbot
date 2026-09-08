'use client'

import { useTheme } from '@/lib/use-theme'
import { useT } from '@/components/CopyProvider'

/** زر صغير في الرأس يبدّل الوضع ويحفظ الاختيار */
export function ThemeToggle() {
  const t = useT()
  const [theme, setTheme] = useTheme()
  const next = theme === 'day' ? 'night' : 'day'

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={next === 'day' ? t('shared.themeDayAria') : t('shared.label.40')}
      title={next === 'day' ? t('shared.themeDay') : t('shared.label.39')}
      className="grid h-[44px] w-[44px] shrink-0 cursor-pointer place-items-center rounded-pill border-0 bg-transparent"
      style={{ color: 'var(--fg)' }}
    >
      {theme === 'day' ? (
        // القمر — بيوديك لليلي
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
        </svg>
      ) : (
        // الشمس — بتوديك للنهاري
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
        </svg>
      )}
    </button>
  )
}
