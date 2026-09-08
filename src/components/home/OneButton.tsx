'use client'

import { useRouter } from 'next/navigation'
import { useT } from '@/components/CopyProvider'

/**
 * زر «نديها واحدة؟» — من design/نسبوط.dc.html:
 * عرض كامل، برتقالي، زوايا 18، حشو 20px 16px،
 * Rubik 900 32 بسطر 1.1، وتحته سطر 400 14.
 */
export function OneButton() {
  const t = useT()
  const router = useRouter()
  return (
    <button
      type="button"
      onClick={() => router.push('/one')}
      className="flex w-full cursor-pointer flex-col items-center gap-[6px] rounded-18 border-0 px-4 py-5 font-display font-black"
      style={{ background: '#F4632A', color: '#14161A' }}
    >
      <span className="text-32 leading-[1.1]">{t('home.text.5')}</span>
      <span className="font-body text-14 font-normal">{t('home.text.4')}</span>
    </button>
  )
}
