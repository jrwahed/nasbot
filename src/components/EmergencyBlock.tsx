'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useT } from '@/components/CopyProvider'
import { getEmergencyPhone } from '@/lib/api'

/**
 * رقم الطوارئ من `settings` — `null` يعني مفيش رقم متظبط.
 *
 * ⚠ اتعمل هوك علشان **تلات صفحات** كانت بتعرض زرار اتصال: `/rules` كانت
 *   بتقرا من القاعدة صح، و`/my/[bookingId]` كان الرقم الوهمي **مكتوب في
 *   الكود**، و`/captain/[sbotaId]` كان بياخده من `src/data/lists.ts` —
 *   نفس الرقم الوهمي بالظبط. يعني عضو في مشكلة كان هيرن على رقم مش بتاعنا.
 *
 *   ده الدرس التلتاشر بالحرف: التصليح اتعمل في صفحة واحدة، والمصدر القديم
 *   فضل مقروء في صفحتين تانيين ومفيش حاجة بتفشل.
 */
export function useEmergencyPhone(): string | null {
  const [phone, setPhone] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    getEmergencyPhone().then((p) => alive && setPhone(p))
    return () => {
      alive = false
    }
  }, [])
  return phone
}

/**
 * زرار «كلمنا دلوقتي» — بيخفي نفسه خالص لو مفيش رقم.
 *
 * إخفاء الزرار أنضف من زرار بيرن على رقم غلط: العضو اللي في مشكلة
 * بيستنى رد من حد مش موجود.
 */
export function EmergencyCall({
  label,
  style,
  className = '',
}: {
  label: string
  style?: CSSProperties
  className?: string
}) {
  const phone = useEmergencyPhone()
  if (!phone) return null
  return (
    <a
      href={`tel:${phone}`}
      className={`grid w-full place-items-center rounded-16 font-display font-black ${className}`}
      style={{ background: '#8E2F1F', color: '#FBF7EF', minHeight: 58, ...style }}
    >
      {label}
    </a>
  )
}

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

  return (
    <>
      <h2 className="mt-10 font-display text-26 font-black">{t('rules.text.4')}</h2>
      <div className="mt-1 font-body text-16" style={{ color: 'var(--muted)' }}>
        {t('rules.text.3')}
      </div>
      <EmergencyCall label={t('rules.text.2')} className="mt-4 text-20" />

      <div
        className="mt-8 rounded-16 p-4 text-center font-body text-15 font-semibold"
        style={{ background: 'var(--surface)' }}
      >
        {t('rules.text.1')}
      </div>
    </>
  )
}
