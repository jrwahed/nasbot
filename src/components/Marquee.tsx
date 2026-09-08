'use client'

import { useT } from '@/components/CopyProvider'

/**
 * الشريط المتحرك — 28 ثانية، المحتوى متكرر مرتين علشان ما يقطعش.
 * الحاوية dir="ltr" والنص جواها dir="rtl" — زي design/نسبوط.dc.html بالظبط،
 * علشان الحركة تمشي من اليمين للشمال والنص يفضل عربي سليم.
 */
export function Marquee({ text }: { text: string }) {
  const t = useT()
  // «فاضل 3» و«فاضل 5» بالبرتقالي وبخط عريض — زي الملف.
  // الكلمة نفسها من اللوحة علشان لو اتغيّرت في الشريط تفضل متلوّنة.
  const word = t('shared.marquee.highlight')
  const parts = text.split(new RegExp('(' + word + ' \\d+)', 'g'))
  const isHit = new RegExp('^' + word + ' \\d+$')
  const content = parts.map((p, i) =>
    isHit.test(p) ? (
      <b key={i} style={{ color: 'var(--accent-text)' }}>
        {p}
      </b>
    ) : (
      <span key={i}>{p}</span>
    )
  )

  return (
    <div
      dir="ltr"
      className="mt-[18px] overflow-hidden py-2"
      style={{ borderTop: '2px solid #EFE3CF', borderBottom: '2px solid #EFE3CF' }}
    >
      <div className="flex w-max animate-marquee">
        <span
          dir="rtl"
          className="whitespace-nowrap px-4 font-body text-15 font-semibold"
          style={{ color: 'var(--fg)' }}
        >
          {content}
        </span>
        <span
          dir="rtl"
          aria-hidden="true"
          className="whitespace-nowrap px-4 font-body text-15 font-semibold"
          style={{ color: 'var(--fg)' }}
        >
          {content}
        </span>
      </div>
    </div>
  )
}
