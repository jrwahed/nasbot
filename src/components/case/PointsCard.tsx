'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/CopyProvider'
import { useFlag } from '@/components/FlagsProvider'
import { getMyCasePoints, type CaseMyPoints } from '@/lib/cases'

/**
 * «أوسمتي» في صفحتي.
 *
 * ⚠ **أوسمة بس، مفيش فلوس** (قرار المالك ٢٠٢٦-١٠-٣١): النقط بتتجمع كرقم
 *   على الحساب، وما بتتحوّلش خصم. ولو اتقرر بعدين تتحوّل، البيانات
 *   موجودة — بس ده قرار منتج مش تحسين، فاسأل الأول.
 *
 * ⚠ **ومفيش لوحة ترتيب عامة** عن قصد: المنافسة العامة بتحوّل اللعبة من
 *   حاجة بينكم لحاجة ضد بعض. الكرت ده بيعرض بتاعي أنا وبس.
 */
export function PointsCard() {
  const t = useT()
  const flag = useFlag('cases')
  const [p, setP] = useState<CaseMyPoints | null>(null)

  useEffect(() => {
    if (!flag.on) return
    let alive = true
    getMyCasePoints().then((r) => alive && setP(r))
    return () => {
      alive = false
    }
  }, [flag.on])

  // مفيش نقط ومفيش أوسمة = الكرت بيختفي. لسه محدش لعب.
  if (!flag.on || !p || (p.points === 0 && !p.titles.length)) return null

  return (
    <section className="mt-[22px] rounded-20 p-5" style={{ background: '#EFE3CF', color: '#14161A' }}>
      <h2 className="text-[18px] font-bold">{t('case.points.title')}</h2>
      <p className="mt-1 text-[15px]">{t('case.points').replace('{{1}}', String(p.points))}</p>

      {p.titles.length ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {p.titles.map((ti) => (
            <li
              key={ti.key}
              className="rounded-full px-3 py-1 text-[14px]"
              style={{ background: '#14161A', color: '#FBF7EF' }}
            >
              {ti.name_ar}
              {ti.n > 1 ? ` ×${ti.n}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[14px] opacity-70">{t('case.points.none')}</p>
      )}
    </section>
  )
}
