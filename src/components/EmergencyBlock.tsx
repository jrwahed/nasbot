'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/CopyProvider'
import { getEmergencyPhone } from '@/lib/api'

/**
 * قسم الطوارئ في صفحة القواعد.
 *
 * اتفصل في مكوّن لوحده لما الصفحة بقت تتقرا من القاعدة على الخادم —
 * ده الجزء الوحيد اللي محتاج عميل، لأن الرقم بيتقرا من `settings` وقت
 * التشغيل.
 *
 * ⚠ null = مفيش رقم متظبط، فبنخفي الزرار بدل ما نعرض زرار اتصال برقم
 * وهمي (مراجعة A15).
 */
export function EmergencyBlock() {
  const t = useT()
  const [phone, setPhone] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getEmergencyPhone().then((p) => alive && setPhone(p))
    return () => {
      alive = false
    }
  }, [])

  return (
    <>
      <h2 className="mt-10 font-display text-26 font-black">{t('rules.text.4')}</h2>
      <div className="mt-1 font-body text-16" style={{ color: 'var(--muted)' }}>
        {t('rules.text.3')}
      </div>
      {phone && (
        <a
          href={`tel:${phone}`}
          className="mt-4 grid w-full place-items-center rounded-16 font-display text-20 font-black"
          style={{ background: '#8E2F1F', color: '#FBF7EF', minHeight: 58 }}
        >
          {t('rules.text.2')}
        </a>
      )}

      <div
        className="mt-8 rounded-16 p-4 text-center font-body text-15 font-semibold"
        style={{ background: 'var(--surface)' }}
      >
        {t('rules.text.1')}
      </div>
    </>
  )
}
