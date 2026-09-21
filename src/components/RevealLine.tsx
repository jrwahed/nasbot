'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/CopyProvider'
import { getRevealHour } from '@/lib/api'

/**
 * سطر «امتى هتعرف مجموعتك» — **رقمه من `settings` ونصه من `copy_strings`**.
 *
 * ⚠ كان مكتوب في الكود بالحرف في `src/lib/map-db.ts`:
 *   «هتعرف مجموعتك قبلها بيوم الساعة 8 بالليل.»
 *   والمالك عنده خانة «ساعة كشف المجموعة» في `/admin/settings` بيغيّرها
 *   وبيشوف «اتحفظ ✓» — والجملة تفضل بتقول 8 على طول، ولا الجدولة نفسها
 *   كانت بتسمعه (اتصلّحت في `0109`).
 *
 *   وأسوأ حتة: صفحة `/my/[id]` كانت بتعمل
 *   `revealLine.replace(t('group.label.2'), '')` — يعني بتقص كلمة «بالليل.»
 *   من آخر الجملة علشان تعمل منها عنوان. أول ما الساعة تبقى الصبح، القص
 *   بيطلّع كلام ناقص والجملة تكدب.
 *
 *   دلوقتي فيه مصدر واحد: مفتاحين نص (`group.reveal.line` للجملة الكاملة
 *   و`group.reveal.short` للعنوان) ورقم واحد من القاعدة.
 */

/** ساعة الكشف من `settings` — 20 لحد ما القراية ترجع (نفس الافتراضي في القاعدة). */
export function useRevealHour(): number {
  const [hour, setHour] = useState(20)
  useEffect(() => {
    let alive = true
    getRevealHour().then((h) => alive && setHour(h))
    return () => {
      alive = false
    }
  }, [])
  return hour
}

/**
 * 20 → «8 بالليل» · 9 → «9 الصبح» · 13 → «1 الضهر» · 17 → «5 العصر».
 *
 * الكلمات نفسها في `copy_strings` (`shared.hour.*`) — مش مكتوبة هنا، علشان
 * المالك يقدر يغيّر «بالليل» من اللوحة زي أي نص تاني.
 */
export function hourLabel(hour: number, t: (k: string) => string): string {
  const h = ((Math.round(hour) % 24) + 24) % 24
  const twelve = h % 12 === 0 ? 12 : h % 12
  const part =
    h < 12 ? 'shared.hour.morning'
    : h < 16 ? 'shared.hour.noon'
    : h < 18 ? 'shared.hour.afternoon'
    : 'shared.hour.night'
  return `${twelve} ${t(part)}`
}

/** الجملة الكاملة: «هتعرف مجموعتك قبلها بيوم الساعة 8 بالليل.» */
export function RevealLine({ short = false }: { short?: boolean }) {
  const t = useT()
  const hour = useRevealHour()
  return <>{t(short ? 'group.reveal.short' : 'group.reveal.line', { hour: hourLabel(hour, t) })}</>
}
