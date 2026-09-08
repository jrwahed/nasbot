'use client'

import { useEffect, useState } from 'react'
import { Sticker } from '@/components/Sticker'
import { useT } from '@/components/CopyProvider'

/**
 * العد التنازلي الحي.
 * الصيغة من الملف: «فاضل 22 ساعة» — ستيكر برتقالي Rubik 900 22 مايل -3.
 */
type T = (k: string, v?: Record<string, string | number>) => string

function label(msLeft: number, t: T) {
  if (msLeft <= 0) return t('shared.countdown.started')
  const mins = Math.floor(msLeft / 60_000)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)
  if (days >= 1)
    return t(days === 1 ? 'shared.countdown.day' : days === 2 ? 'shared.countdown.day2' : 'shared.countdown.days', { n: days })
  if (hours >= 1)
    return t(hours === 1 ? 'shared.countdown.hour' : hours === 2 ? 'shared.countdown.hour2' : 'shared.countdown.hours', { n: hours })
  return t(mins === 1 ? 'shared.countdown.min' : mins === 2 ? 'shared.countdown.min2' : 'shared.countdown.mins', { n: mins })
}

export function Countdown({
  to,
  className = '',
}: {
  /** ISO string */
  to: string
  className?: string
}) {
  const t = useT()
  const [left, setLeft] = useState<number | null>(null)

  useEffect(() => {
    const tick = () => setLeft(new Date(to).getTime() - Date.now())
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [to])

  // قبل أول قياس على المتصفح بنعرض مسافة فاضية بنفس الارتفاع
  // علشان ما يحصلش عدم تطابق مع الخادم
  return (
    <span className={className}>
      <Sticker color="orange" rotate={-3} fontSize={22} padding="6px 16px">
        {left === null ? '…' : label(left, t)}
      </Sticker>
    </span>
  )
}

/** نسخة نصية بسيطة — للاستخدام قبل الكشف */
export function CountdownText({ to }: { to: string }) {
  const t = useT()
  const [left, setLeft] = useState<number | null>(null)
  useEffect(() => {
    const tick = () => setLeft(new Date(to).getTime() - Date.now())
    tick()
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [to])
  return <span>{left === null ? '…' : label(left, t)}</span>
}
