'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/CopyProvider'
import { getArrival, type Arrival } from '@/lib/api'

/**
 * «أول ربع ساعة» — الكرت اللي بيفتح مع كشف المجموعة.
 *
 * الوجع اللي بيرد عليه: «هدفع وأروح ألاقي نفسي قاعد ساكت». مش الفلوس ولا
 * المكان — أول ربع ساعة. ودي اللحظة اللي بتفرق بين «جربت مرة» و«بقيت أخرج».
 *
 * تلات حاجات وبس:
 *   · العلامة اللي تعرفهم بيها (صاحب الخروجة بيكتبها)
 *   · اسم واحد بالظبط تسأل عليه — أقدم حجز في مجموعتك، محسوب في القاعدة
 *   · تلات أسئلة لو الكلام وقف (من `copy_strings`، المالك بيغيّرها)
 *
 * ⚠ الكرت بيختفي خالص لو القاعدة رجّعت ولا صف (قبل الكشف · مش حاجز · مش
 *   دافع). مفيش «حالة فاضية» بتتعرض — الحارس في القاعدة والصفحة بتحترمه.
 */
export function ArrivalCard({ bookingId }: { bookingId: string }) {
  const t = useT()
  const [a, setA] = useState<Arrival | null>(null)

  useEffect(() => {
    let alive = true
    getArrival(bookingId).then((r) => alive && setA(r))
    return () => {
      alive = false
    }
  }, [bookingId])

  // مفيش علامة ومفيش اسم = مفيش حاجة تتقال. الأسئلة لوحدها مش كرت.
  if (!a || (!a.sign && !a.greeterName)) return null

  return (
    <section
      className="mt-[22px] rounded-20 p-5"
      style={{ background: '#EFE3CF', color: '#14161A' }}
    >
      <h2 className="m-0 font-display text-20 font-black">{t('arrive.title')}</h2>

      {a.sign && (
        <>
          <div className="mt-3 font-display text-15 font-black">{t('arrive.signLabel')}</div>
          <div className="mt-1 font-body text-16">{a.sign}</div>
        </>
      )}

      {a.greeterName && (
        <div className="mt-3 font-body text-16 font-semibold">
          {a.greeterIsMe ? t('arrive.greeterMe') : t('arrive.greeter', { name: a.greeterName })}
        </div>
      )}

      <div className="mt-4 font-display text-15 font-black">{t('arrive.qTitle')}</div>
      <ul className="mb-0 mt-1 flex list-none flex-col gap-[6px] p-0">
        {['arrive.q.1', 'arrive.q.2', 'arrive.q.3'].map((k) => (
          <li key={k} className="font-body text-15">
            — {t(k)}
          </li>
        ))}
      </ul>
    </section>
  )
}
