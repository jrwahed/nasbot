'use client'

import Link from 'next/link'
import { CountdownText } from '@/components/Countdown'
import { RevealLine } from '@/components/RevealLine'
import { useT } from '@/components/CopyProvider'
import type { Booking } from '@/types'

/**
 * حالة الحجز في `/my/[id]` — الصفحة كانت بتعرف **حالتين** بس:
 * «اتكشف» و«لسه». يعني:
 *
 *   · اللي بعت التحويل ولسه مستني اعتماد اللوحة،
 *   · واللي في قايمة الانتظار (السبوطة كملت)،
 *   · واللي حجزه **اتلغى** أو اترجّعت فلوسه،
 *
 * تلاتتهم كانوا بيشوفوا نفس الشاشة: «الكشف قبلها بيوم الساعة ٨» وعدّاد
 * تنازلي. يعني الموقع بيطمّن حد مكانه مش مضمون، وبيعد تنازلي لحجز مش
 * موجود أصلًا.
 *
 * ⚠ والحالة دي **بتتقرا من `booking.state`** اللي جاي من القاعدة —
 *   مش من حساب في الواجهة. و«اتكشف» نفسها لسه شرطها `paid && الوقت عدّى`
 *   (الدرس التناشر)، والقاعدة بتمنع الأسامي أصلًا (`0110`).
 */
export type Stage = 'cancelled' | 'waitlist' | 'pending' | 'waiting' | 'revealed'

export function stageOf(booking: Booking, revealed: boolean): Stage {
  if (booking.state === 'cancelled' || booking.state === 'refunded') return 'cancelled'
  if (booking.state === 'waitlist') return 'waitlist'
  if (!booking.paid) return 'pending'
  return revealed ? 'revealed' : 'waiting'
}

function Card({
  tone,
  title,
  note,
  children,
}: {
  tone: 'plain' | 'warn' | 'stop'
  title: string
  note?: string
  children?: React.ReactNode
}) {
  const bg = tone === 'stop' ? '#3A3D44' : tone === 'warn' ? '#EFE3CF' : 'var(--surface)'
  const fg = tone === 'warn' ? '#14161A' : tone === 'stop' ? '#FBF7EF' : 'var(--fg)'
  return (
    <div className="mt-[22px] rounded-20 p-[18px]" style={{ background: bg, color: fg }}>
      <div className="font-display text-20 font-black">{title}</div>
      {note && (
        <div className="mt-1 font-body text-15" style={{ opacity: 0.85 }}>
          {note}
        </div>
      )}
      {children}
    </div>
  )
}

/** الكرت اللي بيتعرض مكان قايمة المجموعة قبل الكشف */
export function BookingStageCard({ booking, stage }: { booking: Booking; stage: Stage }) {
  const t = useT()

  if (stage === 'cancelled') {
    return (
      <Card tone="stop" title={t('group.stage.cancelledTitle')} note={t('group.stage.cancelledNote')}>
        <Link
          href="/"
          className="mt-3 grid min-h-[48px] w-full place-items-center rounded-14 font-display text-16 font-black"
          style={{ background: '#F4632A', color: '#14161A' }}
        >
          {t('group.stage.browse')}
        </Link>
      </Card>
    )
  }

  if (stage === 'waitlist') {
    return <Card tone="warn" title={t('group.stage.waitlistTitle')} note={t('group.stage.waitlistNote')} />
  }

  if (stage === 'pending') {
    return (
      <Card tone="warn" title={t('group.stage.pendingTitle')} note={t('group.stage.pendingNote')}>
        <Link
          href={`/s/${booking.slug}/pay`}
          className="mt-3 grid min-h-[48px] w-full place-items-center rounded-14 font-display text-16 font-black"
          style={{ background: '#F4632A', color: '#14161A' }}
        >
          {t('group.stage.pendingCta')}
        </Link>
      </Card>
    )
  }

  // اتأكد ومستني الكشف
  return (
    <Card tone="plain" title={t('group.stage.confirmedTitle')}>
      <div className="mt-1 font-display text-18 font-black">
        <RevealLine short />
      </div>
      <div className="mt-1 font-body text-15" style={{ color: 'var(--muted)' }}>
        <CountdownText to={booking.revealAt} />
        {t('group.text.8')}
      </div>
    </Card>
  )
}
