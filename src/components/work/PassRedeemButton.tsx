'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SecondaryButton } from '@/components/Buttons'
import { bookWorkSbotaWithPass } from '@/lib/work'
import { track } from '@/lib/track'
import { qJump } from '@/lib/liveq'
import { useT } from '@/components/CopyProvider'

/**
 * «استخدم كارتي (فاضل N)» على صفحة سبوطة الشغل.
 *
 * الحجز والخصم في نداء واحد: بيعمل حجز بصفر جنيه وبعدين `fn_redeem_pass`
 * هو اللي بيخليه مدفوع. مفيش مسار دفع أصلًا — لو مفيش رصيد الدالة بترمي
 * والحجز المبدئي بينتهي لوحده بعد ربع ساعة.
 *
 * المكوّن ده هو كل اللي محتاجه `/shoghl/[slug]` — سطر واحد بدل الزر المعطّل.
 */
export function PassRedeemButton({
  slug,
  sessionsLeft,
  onDone,
}: {
  slug: string
  sessionsLeft: number
  onDone?: () => void
}) {
  const t = useT()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const go = async () => {
    setError('')
    setBusy(true)
    track('click_ana_gai', { slug, work: true, payWith: 'pass' })
    const res = await bookWorkSbotaWithPass(slug)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    onDone?.()
    qJump()
    router.push(`/s/${slug}/done`)
  }

  return (
    <>
      <SecondaryButton
        tone="cobalt"
        className="w-full"
        onClick={go}
        disabled={busy}
        aria-busy={busy || undefined}
      >
        {busy ? t('shared.wait') : t('shoghl.cta.pass', { n: sessionsLeft })}
      </SecondaryButton>
      {error && (
        <div
          role="alert"
          className="mt-1 text-center font-body text-13 font-semibold"
          style={{ color: 'var(--err-text)' }}
        >
          {error}
        </div>
      )}
    </>
  )
}
