'use client'

import { useEffect, useRef, useState } from 'react'
import { useTheme } from '@/lib/use-theme'
import { subscribeQ, getQState, type QState } from '@/lib/liveq'
import { useT } from '@/components/CopyProvider'

/**
 * علامة الاستفهام الحية — عنصر ثابت في الركن السفلي الأيسر، 44 بكسل.
 *
 * الشكل الأساسي من design/نسبوط.dc.html: مربع برتقالي بزوايا 11
 * فيه «؟» بخط Rubik 900 بحجم 28، مايل skewX(-6deg) rotate(-8deg).
 * العينين والنضارة SVG مرسوم فوقه — مش صورة.
 *
 * الحالات:
 *  idle      — بتميل شوية كل 6 ثواني
 *  looking   — بتدور ناحية الماوس لو المستخدم واقف 3 ثواني
 *  jump      — بتنط عند الحجز
 *  sleep     — بتقفل عينها لما شات يتقفل
 *  + نضارة في الوضع النهاري
 */
export function LiveQ({ hidden = false }: { hidden?: boolean }) {
  const t = useT()
  const [theme] = useTheme()
  const [state, setState] = useState<QState>('idle')
  const [pupil, setPupil] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // متابعة الحالة العالمية
  useEffect(() => {
    setState(getQState())
    return subscribeQ(setState)
  }, [])

  // «بتدور ناحية الماوس لو المستخدم واقف 3 ثواني»
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let last = { x: 0, y: 0 }

    const startLooking = () => {
      if (getQState() === 'idle') setState('looking')
    }

    const onMove = (e: MouseEvent) => {
      last = { x: e.clientX, y: e.clientY }
      if (state === 'looking') setState('idle')
      if (idleTimer.current) clearTimeout(idleTimer.current)
      idleTimer.current = setTimeout(startLooking, 3000)

      // البؤبؤ بيتحرك ناحية الماوس دايمًا
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const dx = last.x - (r.left + r.width / 2)
      const dy = last.y - (r.top + r.height / 2)
      const d = Math.hypot(dx, dy) || 1
      const max = 1.6
      setPupil({ x: (dx / d) * max, y: (dy / d) * max })
    }

    window.addEventListener('mousemove', onMove)
    idleTimer.current = setTimeout(startLooking, 3000)
    return () => {
      window.removeEventListener('mousemove', onMove)
      if (idleTimer.current) clearTimeout(idleTimer.current)
    }
  }, [state])

  if (hidden) return null

  const asleep = state === 'sleep'
  const sunglasses = theme === 'day' && !asleep
  const anim =
    state === 'jump'
      ? 'nb-q-jump .6s ease-out'
      : state === 'idle'
        ? 'nb-q-idle 6s ease-in-out infinite'
        : undefined

  return (
    <div
      ref={ref}
      aria-hidden="true"
      // الملف بيحطها left:16px bottom:16px — الركن السفلي الأيسر الفيزيائي
      className="pointer-events-none fixed z-40 grid h-[44px] w-[44px] place-items-center"
      style={{
        left: 16,
        bottom: 16,
        borderRadius: 11,
        background: '#F4632A',
        color: '#14161A',
        transform:
          state === 'looking'
            ? `skewX(-6deg) rotate(${-8 + pupil.x * 2}deg)`
            : 'skewX(-6deg) rotate(-8deg)',
        animation: anim,
        transition: 'transform .35s ease-out',
      }}
    >
      <span className="font-display text-[28px] font-black leading-none">{t('shared.text.19')}</span>

      {/* العينين والنضارة — SVG فوق العلامة */}
      <svg
        viewBox="0 0 44 44"
        className="absolute inset-0 h-full w-full"
        fill="none"
        aria-hidden="true"
      >
        {/* العينين في الركن العلوي الشمال علشان ما تتزنقش مع «؟» في النص */}
        {asleep ? (
          <>
            <path d="M6 10.5c1.2 1.2 3 1.2 4.2 0" stroke="#14161A" strokeWidth="1.6" strokeLinecap="round" />
            <path d="M13.5 10.5c1.2 1.2 3 1.2 4.2 0" stroke="#14161A" strokeWidth="1.6" strokeLinecap="round" />
          </>
        ) : sunglasses ? (
          <>
            <rect x="5" y="7.5" width="6.6" height="5" rx="2" fill="#14161A" />
            <rect x="13" y="7.5" width="6.6" height="5" rx="2" fill="#14161A" />
            <path d="M11.6 9.6h1.4" stroke="#14161A" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <circle cx="8.3" cy="10" r="3.2" fill="#FBF7EF" />
            <circle cx="16.3" cy="10" r="3.2" fill="#FBF7EF" />
            <circle
              cx={8.3 + pupil.x}
              cy={10 + pupil.y}
              r="1.5"
              fill="#14161A"
              style={{ transition: 'all .18s ease-out' }}
            />
            <circle
              cx={16.3 + pupil.x}
              cy={10 + pupil.y}
              r="1.5"
              fill="#14161A"
              style={{ transition: 'all .18s ease-out' }}
            />
          </>
        )}
      </svg>
    </div>
  )
}
