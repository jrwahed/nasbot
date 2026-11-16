'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/components/CopyProvider'
import { isLoggedIn } from '@/lib/session'
import { getYallaPoll, voteYalla, type YallaOption, type YallaPost as Post } from '@/lib/api'
import { arDigits, yallaWhen } from '@/lib/map-db'
import { track } from '@/lib/track'

/**
 * «نصوّت؟» — الاختيارات اللي المالك طلّعها من النقاش، والناس تصوّت.
 *
 * طلب المالك (٢٠٢٦-١١-١٦): «نعمل ڤوت واللي الناس تختاره يقفل عليه».
 *
 * ⚠ **الاختيار ميعاد ومنطقة، مش نص حر** — والسبب في القاعدة مش هنا: القفل
 *   (`fn_yalla_lock_post`) محتاج ميعاد ومنطقة حقيقيين علشان يعمل سبوطة. لو
 *   كان نص حر، «اللي الناس تختاره يقفل عليه» مستحيل — حد هيقرا ويترجم
 *   بإيده، وساعتها ده استطلاع مش تصويت.
 *
 * 🔑 **والصوت معناه «أنا جاي»** — القاعدة بتدخّل المصوّت المجموعة لوحدها
 *   (`0151`). من غير كده القفل بيقول «قليلين» والتصويت يبقى ديكور. والسطر
 *   تحت العنوان بيقول ده صريح — مش مفاجأة.
 *
 * ⚠ **أعداد بس، مفيش أسامي** — `fn_yalla_poll` نفسها مش بترجّعهم. مين صوّت
 *   لإيه سر، زي «الاختيار سري» بالظبط، وإلا الناس بتصوّت على مزاج بعض.
 *
 * ⚠ القسم **بيخفي نفسه** لو مفيش اختيارات ولا العضو مسجّل — مش عنوان فوق
 *   فراغ (نفس قرار «قريب» في الرئيسية).
 */
export function YallaPoll({ post }: { post: Post }) {
  const t = useT()
  const [list, setList] = useState<YallaOption[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState(false)

  const me = isLoggedIn()

  useEffect(() => {
    if (!me) {
      setList([])
      return
    }
    let alive = true
    getYallaPoll(post.callId).then((rows) => {
      if (alive) setList(rows)
    })
    return () => {
      alive = false
    }
  }, [me, post.callId])

  const rows = list ?? []

  // ⚠ الزائر والحالة الفاضية: القسم كله بيختفي. العضو المسجّل اللي النداء
  //   بتاعه لسه مفيهوش اختيارات بيشوف سطر بيقوله يكتب في الكلام.
  if (!me) return null
  if (rows.length === 0) {
    if (post.status !== 'open') return null
    return null
  }

  const onVote = async (o: YallaOption) => {
    setBusy(o.optionId)
    setErr(false)
    const ok = await voteYalla(o.optionId)
    setBusy(null)
    if (!ok) {
      setErr(true)
      return
    }
    track('yalla_choose', { slug: post.slug })
    setList(await getYallaPoll(post.callId))
  }

  const total = rows.reduce((s, o) => s + o.votes, 0)

  return (
    <div className="mt-1 border-t pt-4" style={{ borderColor: 'var(--line)' }}>
      <div className="font-display text-16 font-black leading-none">
        {t('yalla.poll.title')}
      </div>
      <div className="mt-1 font-body text-13" style={{ color: 'var(--muted)' }}>
        {t('yalla.poll.hint')}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {rows.map((o) => {
          // شريط نسبة بسيط — بيخلّي الفرق بين الاختيارات يتشاف من بعيد.
          const pct = total > 0 ? Math.round((o.votes / total) * 100) : 0
          return (
            <button
              key={o.optionId}
              type="button"
              onClick={() => onVote(o)}
              disabled={busy !== null || post.status !== 'open'}
              className="relative w-full cursor-pointer overflow-hidden rounded-14 p-3 text-start"
              style={{
                background: 'var(--bg)',
                color: 'var(--fg)',
                border: o.mine ? '2px solid #F4632A' : '1px solid var(--line)',
              }}
            >
              {/* ⚠ الشريط **كوبالت شفاف** مش `--surface`: الكارت نفسه
                  `--surface`، فالشريط كان بيبقى بنفس لونه والجزء **الفاضي**
                  هو اللي بيبان كأنه المليان — بالظبط بالعكس. اتشاف في
                  اللقطة (الدرس الخمستاشر).
                  ⚠ وكوبالت مش برتقالي: البرتقالي للحجز بس (§٣.٧). */}
              <span
                aria-hidden="true"
                className="absolute inset-y-0 start-0"
                style={{ width: `${pct}%`, background: 'rgba(43, 76, 255, 0.18)' }}
              />
              <span className="relative flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-body text-15">
                  {yallaWhen(o.at)} · {o.areaLabel}
                  {o.note && (
                    <span style={{ color: 'var(--muted)' }}> · {o.note}</span>
                  )}
                </span>
                <span className="flex items-baseline gap-2">
                  {o.mine && (
                    <span
                      className="font-body text-12"
                      style={{ color: 'var(--accent-text)' }}
                    >
                      {t('yalla.poll.mine')}
                    </span>
                  )}
                  <span className="font-display text-16 font-black">
                    {t('yalla.poll.votes', { n: arDigits(o.votes) })}
                  </span>
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {post.status === 'open' && (
        <div className="mt-2 font-body text-12" style={{ color: 'var(--muted)' }}>
          {t('yalla.poll.change')}
        </div>
      )}

      {err && (
        <div className="mt-2 font-body text-14" style={{ color: 'var(--err-text)' }}>
          {t('yalla.poll.err')}
        </div>
      )}
    </div>
  )
}
