'use client'

import { forwardRef } from 'react'
import type { Persona } from '@/types'
import { Logo } from '@/components/Logo'
import { Sticker } from '@/components/Sticker'
import { useT } from '@/components/CopyProvider'

/**
 * بطاقة النتيجة 9:16 — قابلة للتصدير كصورة.
 * خلفية أسود، ستيكر برتقالي كبير باسم النوع، جملة النوع،
 * سطر السبوطة الجاية، والشعار صغير تحت.
 */
export const TypeCard = forwardRef<
  HTMLDivElement,
  { persona: Persona; nextLine: string; name?: string }
>(function TypeCard({ persona, nextLine, name }, ref) {
  const t = useT()
  return (
    <div
      ref={ref}
      dir="rtl"
      className="mx-auto flex w-full max-w-[360px] flex-col justify-between p-7"
      style={{
        aspectRatio: '9 / 16',
        background: '#14161A',
        color: '#FBF7EF',
        borderRadius: 20,
      }}
    >
      <div className="flex flex-col items-start gap-5">
        <span className="font-body text-15 font-semibold" style={{ color: '#C9C4B8' }}>{t('shared.text.31')}</span>
        <Sticker
          color="orange"
          rotate={-4}
          fontSize={30}
          padding="10px 20px"
          className="max-w-full whitespace-normal"
        >
          {name ?? persona.name}
        </Sticker>
        <p className="m-0 font-body text-17" style={{ lineHeight: 1.7 }}>
          {persona.line}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <div
          className="rounded-16 p-4"
          style={{ background: '#1E2128', color: '#FBF7EF' }}
        >
          <div className="font-body text-13" style={{ color: '#C9C4B8' }}>{t('shared.text.30')}</div>
          <div className="mt-1 font-display text-20 font-black">{nextLine}</div>
        </div>
        <Logo size={26} variant="onDark" />
      </div>
    </div>
  )
})
