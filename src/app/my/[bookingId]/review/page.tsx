'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { InnerHeader } from '@/components/Header'
import { RatingFaces } from '@/components/RatingFaces'
import { Checkbox } from '@/components/Field'
import { PrimaryButton } from '@/components/Buttons'
import { StickyCTA } from '@/components/StickyCTA'
import { Sticker } from '@/components/Sticker'
import { reviewQuestions } from '@/data/bookings'
import { people } from '@/data/people'
import { submitReview } from '@/lib/api'
import { getBookingCollab, pairWant, workWant, type Mate } from '@/lib/collab'
import { useT } from '@/components/CopyProvider'

/**
 * التقييم — «وصلت؟» + 5 أسئلة بوشوش مرسومة
 * + قسم برتقالي «عايز تشوف مين تاني؟» بالاختيار المتبادل،
 * + ولو السبوطة سبوطة شغل: قسم تاني «عايز تشتغل مع مين؟» بنفس المكوّن
 *   ونفس السرية بالظبط (WORK_PLAN §2). الاتنين بيظهروا مع بعض.
 *
 * الكتابة في الاتنين بتعدّي على دوال القاعدة (fn_pair_want · fn_work_want)
 * لأن الجدولين مقفولين على القراءة، فأي upsert مباشر بيضرب — التفاصيل في
 * src/lib/collab.ts وفي هجرة 0047.
 */

/** الاختيار السري — نفس المكوّن للقسمين، وده مقصود */
function PickPeople({
  title,
  note,
  people: list,
  picked,
  onToggle,
}: {
  title: string
  note: string
  people: Mate[]
  picked: string[]
  onToggle: (id: string) => void
}) {
  return (
    <section className="mt-8 rounded-20 p-5" style={{ background: '#F4632A', color: '#14161A' }}>
      <h2 className="m-0 font-display text-24 font-black">{title}</h2>
      <div className="mt-3 flex flex-col gap-2">
        {list.map((p) => {
          const on = picked.includes(p.id)
          return (
            <label key={p.id} className="flex min-h-[44px] cursor-pointer items-center gap-3">
              <input type="checkbox" checked={on} onChange={() => onToggle(p.id)} className="sr-only" />
              <span
                aria-hidden="true"
                className="grid h-[26px] w-[26px] shrink-0 place-items-center font-display text-16 font-black"
                style={{
                  border: '2px solid #14161A',
                  borderRadius: 8,
                  background: on ? '#14161A' : 'transparent',
                  color: '#FBF7EF',
                }}
              >
                {on ? '✓' : ''}
              </span>
              <span className="font-display text-17 font-black">{p.firstName}</span>
            </label>
          )
        })}
      </div>
      <div className="mt-4 font-body text-14 font-semibold">{note}</div>
    </section>
  )
}

export default function ReviewPage() {
  const t = useT()
  const params = useParams<{ bookingId: string }>()
  const [arrived, setArrived] = useState<boolean | null>(null)
  const [ratings, setRatings] = useState<Record<string, number>>({})
  const [seeAgain, setSeeAgain] = useState<string[]>([])
  const [workWith, setWorkWith] = useState<string[]>([])
  const [allowPhoto, setAllowPhoto] = useState(false)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  /** زمايل المجموعة من القاعدة — قبل الكشف بترجّع فاضية، وساعتها بنعرض الوهميين */
  const [mates, setMates] = useState<Mate[]>([])
  const [isWork, setIsWork] = useState(false)

  useEffect(() => {
    let alive = true
    getBookingCollab(params.bookingId).then((c) => {
      if (!alive) return
      setMates(c.mates)
      setIsWork(c.isWork)
    })
    return () => {
      alive = false
    }
  }, [params.bookingId])

  /** لو مفيش زمايل حقيقيين (مفيش قاعدة أو لسه ما اتكشفتش) بنعرض الأسامي الوهمية زي الأول */
  const hasIds = mates.length > 0
  const list: Mate[] = hasIds ? mates : people.map((p) => ({ id: p.name, firstName: p.name }))

  const toggle = (setter: typeof setSeeAgain) => (id: string) =>
    setter((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  const send = async () => {
    setBusy(true)
    const names = list.filter((p) => seeAgain.includes(p.id)).map((p) => p.firstName)

    await submitReview({
      bookingId: params.bookingId,
      ratings,
      seeAgain: names,
      seeAgainIds: hasIds ? seeAgain : undefined,
      allowPhoto,
    })

    // «عايز تشوف مين تاني» و«عايز تشتغل مع مين» — كل واحد بيسجّل جهته هو بس
    if (hasIds) {
      await Promise.all(seeAgain.map((id) => pairWant(id, params.bookingId)))
      await Promise.all(workWith.map((id) => workWant(id, params.bookingId)))
    }

    setBusy(false)
    setSent(true)
  }

  if (sent) {
    return (
      <main className="mx-auto flex w-full max-w-page flex-col px-5 pb-6">
        <InnerHeader back={t('review.label.3')} href={`/my/${params.bookingId}`} padded={false} />
        <div className="flex flex-col items-center gap-5 pt-16 text-center">
          <h1 className="m-0 font-display text-32 font-black">{t('review.text.9')}</h1>
          <Sticker color="orange" rotate={-3} fontSize={22} padding="8px 18px">{t('review.text.8')}</Sticker>
          <p className="m-0 font-body text-16" style={{ color: 'var(--muted)' }}>{t('review.text.7')}</p>
          <Link
            href="/me"
            className="mt-2 font-body text-16 font-semibold underline"
            style={{ color: 'var(--accent-text)' }}
          >{t('review.text.6')}</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-6">
      <InnerHeader back={t('review.label.3')} href={`/my/${params.bookingId}`} padded={false} />

      <h1 className="mb-0 mt-[10px] font-display text-32 font-black leading-[1.15]">{t('review.text.5')}</h1>
      <div className="mt-3 flex gap-2">
        {[
          { v: true, l: t('review.label.2') },
          { v: false, l: t('review.label.1') },
        ].map((o) => (
          <button
            key={o.l}
            type="button"
            onClick={() => setArrived(o.v)}
            aria-pressed={arrived === o.v}
            className="min-h-[48px] flex-1 cursor-pointer rounded-pill font-display text-16 font-black"
            style={{
              border: '2px solid var(--fg)',
              background: arrived === o.v ? 'var(--fg)' : 'transparent',
              color: arrived === o.v ? 'var(--bg)' : 'var(--fg)',
            }}
          >
            {o.l}
          </button>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {reviewQuestions.map((q) => (
          <RatingFaces
            key={q}
            question={q}
            value={ratings[q]}
            onChange={(v) => setRatings((s) => ({ ...s, [q]: v }))}
          />
        ))}
      </div>

      {/* ===== عايز تشوف مين تاني؟ ===== */}
      <PickPeople
        title={t('review.text.4')}
        note={t('review.text.3')}
        people={list}
        picked={seeAgain}
        onToggle={toggle(setSeeAgain)}
      />

      {/* ===== عايز تشتغل مع مين؟ — لسبوطات الشغل بس ===== */}
      {isWork && hasIds && (
        <PickPeople
          title={t('review.work.title')}
          note={t('review.work.note')}
          people={list}
          picked={workWith}
          onToggle={toggle(setWorkWith)}
        />
      )}

      <div className="mt-6">
        <Checkbox checked={allowPhoto} onChange={setAllowPhoto}>{t('review.text.2')}</Checkbox>
      </div>

      <div className="mt-6">
        <StickyCTA>
          <PrimaryButton size="lg" className="w-full" onClick={send} loading={busy}>{t('review.text.1')}</PrimaryButton>
        </StickyCTA>
      </div>
    </main>
  )
}
