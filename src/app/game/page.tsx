'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { TextArea } from '@/components/Field'
import { PrimaryButton } from '@/components/Buttons'
import { StickyCTA } from '@/components/StickyCTA'
import { iconFor } from '@/components/game-icons'
import { getGameConfig } from '@/lib/api'
import { gameFallback } from '@/data/game'
import type { GameConfig } from '@/lib/game-config'
import { saveAnswers, loadAnswers } from '@/lib/type'
import { track } from '@/lib/track'
import type { GameAnswers } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * لعبة «مين جاي؟» — سؤال واحد في كل شاشة، وشريط تقدم مكتوب بالكلام مش بالأرقام.
 * الأسئلة والاختيارات كلها من القاعدة وبتتعدّل من /admin/game.
 */
export default function GamePage() {
  const t = useT()
  const router = useRouter()
  const [cfg, setCfg] = useState<GameConfig>(gameFallback)
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<GameAnswers>({})

  useEffect(() => {
    setAnswers(loadAnswers())
    track('start_game', {})
    getGameConfig().then((c) => {
      if (c.questions.length) setCfg(c)
    })
  }, [])

  const questions = cfg.questions
  const q = questions[Math.min(i, questions.length - 1)]
  const isLast = i >= questions.length - 1

  const answerFor = (slot: string) => (answers as Record<string, unknown>)[slot]

  const pickSingle = (value: string) => {
    const next = { ...answers, [q.slot]: value }
    setAnswers(next)
    saveAnswers(next)
    // تقدّم لوحده بعد لمسة صغيرة
    setTimeout(() => go(next), 180)
  }

  const toggleMulti = (value: string) => {
    const cur = (answerFor(q.slot) as string[] | undefined) ?? []
    const list = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value]
    const next = { ...answers, [q.slot]: list }
    setAnswers(next)
    saveAnswers(next)
  }

  const go = (a: GameAnswers = answers) => {
    if (isLast) {
      saveAnswers(a)
      track('finish_game', {})
      router.push('/game/result')
      return
    }
    setI((n) => Math.min(n + 1, questions.length - 1))
  }

  const answered =
    q.kind === 'single'
      ? Boolean(answerFor(q.slot))
      : q.kind === 'multi'
        ? (((answerFor(q.slot) as string[] | undefined) ?? []).length > 0)
        : true

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-page flex-col px-5 pb-6">
      <InnerHeader
        back={i === 0 ? t('game.backFirst') : t('game.label.4')}
        href="/"
        padded={false}
        onBack={i === 0 ? undefined : () => setI((n) => n - 1)}
      />

      {/* شريط التقدم */}
      <div className="pt-2">
        <div
          className="h-[10px] w-full overflow-hidden rounded-pill"
          style={{ background: 'var(--surface)' }}
        >
          <div
            className="h-full rounded-pill transition-[width] duration-300"
            style={{
              width: `${((i + 1) / questions.length) * 100}%`,
              background: '#F4632A',
            }}
          />
        </div>
        <div className="mt-2 font-body text-14" style={{ color: 'var(--muted)' }}>
          {q.progressLabel}
        </div>
      </div>

      <h1 className="mb-0 mt-8 font-display text-30 font-black leading-[1.15]">
        {q.text}
      </h1>

      {/* الاختيارات كبطاقات مربعة */}
      {q.kind !== 'text' && (
        <div className="mt-6 grid grid-cols-2 gap-3">
          {q.options.map((c) => {
            const on =
              q.kind === 'multi'
                ? (((answerFor(q.slot) as string[] | undefined) ?? []).includes(c.value))
                : answerFor(q.slot) === c.value
            const Icon = iconFor(c.iconKey)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() =>
                  q.kind === 'multi' ? toggleMulti(c.value) : pickSingle(c.value)
                }
                aria-pressed={on}
                className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-20 p-4 text-center"
                style={{
                  aspectRatio: '1',
                  background: on ? '#F4632A' : 'var(--surface)',
                  color: on ? '#14161A' : 'var(--fg)',
                  border: `2px solid ${on ? '#F4632A' : 'var(--line)'}`,
                }}
              >
                <Icon size={40} stroke={on ? '#14161A' : 'currentColor'} />
                <span className="font-display text-16 font-black leading-tight">
                  {c.label}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {q.kind === 'text' && (
        <div className="mt-6">
          <TextArea
            value={(answerFor(q.slot) as string | undefined) ?? ''}
            onChange={(e) => {
              const next = { ...answers, [q.slot]: e.target.value }
              setAnswers(next)
              saveAnswers(next)
            }}
            placeholder={q.placeholder || t('game.label.3')}
            aria-label={t('game.label.2')}
          />
        </div>
      )}

      <div className="mt-auto pt-8">
        <StickyCTA>
          <PrimaryButton
            size="lg"
            className="w-full"
            onClick={() => go()}
            disabled={!answered && q.kind === 'multi'}
          >
            {isLast ? t('game.showResult') : t('game.label.1')}
          </PrimaryButton>
        </StickyCTA>
      </div>
    </main>
  )
}
