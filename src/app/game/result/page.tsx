'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { TypeCard } from '@/components/TypeCard'
import { PrimaryButton, SecondaryButton } from '@/components/Buttons'
import { loadAnswers, personaName } from '@/lib/type'
import { finishGame } from '@/lib/api'
import { track } from '@/lib/track'
import { isLoggedIn, getSession } from '@/lib/session'
import type { Persona, Sbota } from '@/types'
import { useT } from '@/components/CopyProvider'
import { FeatureGate } from '@/components/FlagsProvider'

/**
 * نتيجة اللعبة — بطاقة 9:16 بتتحفظ صورة.
 * التصدير بـ html-to-image، والمشاركة عبر Web Share لو متاحة.
 */
function ResultPage() {
  const t = useT()
  const router = useRouter()
  const cardRef = useRef<HTMLDivElement>(null)
  const [persona, setPersona] = useState<Persona | null>(null)
  const [next, setNext] = useState<Sbota | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    finishGame(loadAnswers()).then((r) => {
      setPersona(r.persona)
      setNext(r.next)
    })
  }, [])

  const share = async () => {
    if (!cardRef.current || !persona) return
    setBusy(true)
    setMsg('')
    try {
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      })
      track('share_type_card', { persona: persona.id })

      // مشاركة حقيقية لو المتصفح بيدعمها
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], 'nasbot.png', { type: 'image/png' })
      const nav = navigator as Navigator & {
        canShare?: (d: { files: File[] }) => boolean
      }
      if (nav.canShare?.({ files: [file] }) && navigator.share) {
        await navigator.share({ files: [file], text: persona.line })
        setBusy(false)
        return
      }

      const a = document.createElement('a')
      a.href = dataUrl
      a.download = 'nasbot.png'
      a.click()
      setMsg(t('result.label.4'))
    } catch {
      setMsg(t('result.label.3'))
    }
    setBusy(false)
  }

  const book = () => {
    if (!next) return
    track('click_ana_gai', { slug: next.slug, from: 'game' })
    router.push(isLoggedIn() ? `/s/${next.slug}/pay` : `/login?next=/s/${next.slug}/pay`)
  }

  if (!persona || !next) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back={t('result.label.2')} href="/game" padded={false} />
        <div className="pt-8" style={{ color: 'var(--muted)' }}>{t('result.text.2')}</div>
      </main>
    )
  }

  const gender = getSession()?.gender
  const shown = personaName(persona, gender)
  const nextLine = `${next.name} — ${next.when}`

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-8">
      <InnerHeader back={t('result.label.2')} href="/game" padded={false} />

      <h1 className="mb-0 mt-[10px] font-display text-30 font-black leading-[1.15]">
        {t('result.youAre', { type: shown })}
      </h1>
      <p className="mb-0 mt-2 text-17">{persona.line}</p>

      {/* البطاقة اللي بتتصدّر */}
      <div className="mt-6">
        <TypeCard ref={cardRef} persona={persona} nextLine={nextLine} name={shown} />
      </div>

      {msg && (
        <div
          role="status"
          className="mt-4 rounded-14 p-3 text-center font-body text-14 font-semibold"
          style={{ background: 'var(--surface)' }}
        >
          {msg}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3">
        <PrimaryButton size="lg" className="w-full" onClick={book}>{t('result.text.1')}</PrimaryButton>
        <SecondaryButton onClick={share} className="w-full" disabled={busy}>
          {busy ? t('shared.wait') : t('result.label.1')}
        </SecondaryButton>
      </div>
    </main>
  )
}

/**
 * القفل من اللوحة: مفتاح «game» في /admin/settings ← مفاتيح المزايا.
 * مقفول = شاشة «مقفول» برسالة المالك بدل الصفحة (مراجعة A2).
 */
export default function ResultPageRoute() {
  return (
    <FeatureGate flag="game">
      <ResultPage />
    </FeatureGate>
  )
}
