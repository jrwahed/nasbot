'use client'

import { useEffect, type ReactNode } from 'react'
import { THEME_EVENT } from '@/lib/use-theme'

/**
 * غلاف مسار /shoghl/* — الوضع النهاري مقفول.
 *
 * بيحط data-theme="day" على <html> **من غير ما يحفظ** في localStorage،
 * فباقي الموقع بيرجع لوضعه القديم أول ما تخرج من الشغل.
 * السكريبت الصغير بيشتغل قبل الترطيب في التحميل المباشر علشان ما يحصلش وميض ليلي،
 * والـ effect بيغطي التنقل من جوه الموقع وبيرجّع القيمة القديمة عند الخروج.
 */

const PREV_ATTR = 'data-work-prev-theme'

const forceDayScript =
  `(function(){try{var e=document.documentElement;var p=e.getAttribute('data-theme');` +
  `if(p!=='day'){e.setAttribute('${PREV_ATTR}',p||'');e.setAttribute('data-theme','day');}}catch(_){}})();`

export function WorkShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const el = document.documentElement
    // لو السكريبت لحق يغيّر الوضع قبل الترطيب، القيمة القديمة متخزنة في السمة
    const stashed = el.getAttribute(PREV_ATTR)
    const prev = stashed ?? el.getAttribute('data-theme') ?? ''
    if (el.getAttribute('data-theme') !== 'day') {
      el.setAttribute('data-theme', 'day')
      window.dispatchEvent(new Event(THEME_EVENT))
    }
    return () => {
      el.removeAttribute(PREV_ATTR)
      if (prev === 'day') return
      if (prev) el.setAttribute('data-theme', prev)
      else el.removeAttribute('data-theme')
      window.dispatchEvent(new Event(THEME_EVENT))
    }
  }, [])

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: forceDayScript }} />
      {children}
    </>
  )
}
