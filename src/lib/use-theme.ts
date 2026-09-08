'use client'

import { useEffect, useState } from 'react'
import type { Theme } from '@/types'
import { THEME_KEY, themeFromClock } from '@/lib/theme'

export const THEME_EVENT = 'nasbot:theme'

function read(): Theme {
  if (typeof document === 'undefined') return 'night'
  const t = document.documentElement.getAttribute('data-theme')
  return t === 'day' ? 'day' : 'night'
}

/** بيقرأ الوضع الحالي وبيتابع أي تغيير فيه */
export function useTheme(): [Theme, (t: Theme) => void] {
  // الافتراضي على الخادم ليلي، وبيتظبط فورًا بعد أول رسم من الـ attribute
  const [theme, set] = useState<Theme>('night')

  useEffect(() => {
    set(read())
    const onChange = () => set(read())
    window.addEventListener(THEME_EVENT, onChange)
    const mo = new MutationObserver(onChange)
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    })
    return () => {
      window.removeEventListener(THEME_EVENT, onChange)
      mo.disconnect()
    }
  }, [])

  const apply = (t: Theme) => {
    document.documentElement.setAttribute('data-theme', t)
    try {
      localStorage.setItem(THEME_KEY, t)
    } catch {
      /* التخزين مقفول — الوضع بيفضل للجلسة دي بس */
    }
    window.dispatchEvent(new Event(THEME_EVENT))
  }

  return [theme, apply]
}

/** الوضع المقترح من الساعة — للاستخدام في العرض الأولي */
export const clockTheme = themeFromClock
