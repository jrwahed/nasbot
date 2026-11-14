'use client'

import { useEffect, useState } from 'react'
import { BottomSheet } from '@/components/BottomSheet'
import { PrimaryButton, TextButton } from '@/components/Buttons'
import { useT } from '@/components/CopyProvider'
import { chooseYalla, unchooseYalla, type YallaPost as Post } from '@/lib/api'
import { arDigits, yallaWhen } from '@/lib/map-db'
import { track } from '@/lib/track'

/**
 * شاشة الاختيار — بتطلع من تحت الشاشة، **من غير ما تنقل لصفحة تانية**
 * (قرار المالك: «الدوسة على أنا جاي تفتح الاختيارات من تحت الشاشة»).
 *
 * الميعاد: أكتر من واحد. المنطقة: واحدة. واسم مكان اختياري.
 *
 * ⚠ **خانة اسم المكان للمالك بس.** مكتوب جوه الخانة إنها مش بتظهر لحد —
 *   والقاعدة بتحرسها فعلًا: `yalla_choices` مفيهاش ولا سياسة قراية، والفيد
 *   العام مش بيرجّع العمود ده خالص.
 */
export function YallaSheet({
  post,
  open,
  onClose,
  onChanged,
}: {
  post: Post
  open: boolean
  onClose: () => void
  onChanged: (next: Post) => void
}) {
  const t = useT()
  const [slots, setSlots] = useState<string[]>(post.mySlots)
  const [area, setArea] = useState<string | null>(post.myArea)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  // ⚠ لما البوست يتحدّث من بره (حد تاني اختار) الاختيار المتعلّم يفضل صح
  useEffect(() => {
    if (!open) return
    setSlots(post.mySlots)
    setArea(post.myArea)
    setErr(null)
  }, [open, post.mySlots, post.myArea])

  const toggleSlot = (id: string) =>
    setSlots((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const onSave = async () => {
    if (slots.length === 0) {
      setErr(t('yalla.sheet.errWhen'))
      return
    }
    if (!area) {
      setErr(t('yalla.sheet.errArea'))
      return
    }
    setBusy(true)
    setErr(null)
    const res = await chooseYalla(post.callId, slots, area, note)
    setBusy(false)
    if (!res) {
      setErr(t('yalla.sheet.err'))
      return
    }
    track('yalla_choose', { slug: post.slug, slots: slots.length })
    if (res.locked) track('yalla_locked', { slug: post.slug })
    onChanged({
      ...post,
      mySlots: slots,
      myArea: area,
      myN: res.n,
      myWhen: res.when,
      myAreaLabel: res.area,
      // القفل بيوصل من الفيد في أول تحديث — بس البوست يتحدّث على طول
      status: res.locked ? 'locked' : post.status,
      wonWhen: res.locked ? res.when : post.wonWhen,
      wonArea: res.locked ? res.area : post.wonArea,
    })
    onClose()
  }

  const onRemove = async () => {
    setBusy(true)
    const ok = await unchooseYalla(post.callId)
    setBusy(false)
    if (!ok) {
      setErr(t('yalla.sheet.err'))
      return
    }
    onChanged({ ...post, mySlots: [], myArea: null, myN: null, myWhen: null, myAreaLabel: null })
    onClose()
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={t('yalla.sheet.title')}>
      <div className="flex flex-col gap-5">
        {/* ===== الميعاد — أكتر من واحد ===== */}
        <div>
          <div className="font-display text-20 font-black">{t('yalla.sheet.when')}</div>
          <div className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
            {t('yalla.sheet.whenHint')}
          </div>
          <div className="mt-3 flex flex-wrap gap-[10px]">
            {post.slots.map((s) => {
              const on = slots.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSlot(s.id)}
                  className="min-h-[48px] cursor-pointer rounded-14 px-[16px] font-display text-16 font-black leading-none"
                  style={{
                    background: on ? 'var(--fg)' : 'transparent',
                    color: on ? 'var(--bg)' : 'var(--fg)',
                    border: `2px solid ${on ? 'var(--fg)' : 'var(--chip-idle-border)'}`,
                  }}
                >
                  {yallaWhen(s.at)}
                </button>
              )
            })}
          </div>
        </div>

        {/* ===== المنطقة — واحدة ===== */}
        <div>
          <div className="font-display text-20 font-black">{t('yalla.sheet.area')}</div>
          <div className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
            {t('yalla.sheet.areaHint')}
          </div>
          <div className="mt-3 flex flex-wrap gap-[10px]">
            {post.areas.map((a) => {
              const on = area === a.key
              return (
                <button
                  key={a.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setArea(a.key)}
                  className="min-h-[48px] cursor-pointer rounded-14 px-[16px] font-display text-16 font-black leading-none"
                  style={{
                    background: on ? 'var(--fg)' : 'transparent',
                    color: on ? 'var(--bg)' : 'var(--fg)',
                    border: `2px solid ${on ? 'var(--fg)' : 'var(--chip-idle-border)'}`,
                  }}
                >
                  {a.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* ===== اسم مكان — للمالك بس ===== */}
        <div>
          <label
            htmlFor={`yv-${post.callId}`}
            className="font-display text-20 font-black"
          >
            {t('yalla.sheet.venue')}
          </label>
          <input
            id={`yv-${post.callId}`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('yalla.sheet.venuePh')}
            className="mt-3 min-h-[52px] w-full rounded-14 px-4 font-body text-16"
            style={{
              background: 'var(--bg)',
              color: 'var(--fg)',
              border: '2px solid var(--line)',
            }}
          />
        </div>

        {err && (
          <div className="font-body text-15" style={{ color: 'var(--err-text)' }}>
            {err}
          </div>
        )}

        <div className="flex items-center justify-between gap-4">
          <PrimaryButton onClick={onSave} loading={busy} size="lg" className="flex-1">
            {t('yalla.sheet.save')}
          </PrimaryButton>
          {post.mySlots.length > 0 && (
            <TextButton onClick={onRemove} disabled={busy}>
              {t('yalla.sheet.remove')}
            </TextButton>
          )}
        </div>

        <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
          {t('yalla.sheet.note')}
        </div>

        {/* ⚠ العدد الحالي **مش** معروض هنا: الناس تختار اللي يناسبها مش اللي
            سابق. الاتجاه في البوست نفسه، وبعد الاختيار بيبان «إنت واحد من X». */}
        {post.totalN > 0 && (
          <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
            {t('yalla.trend', {
              when: yallaWhen(post.topWhen),
              area: post.topArea ?? '',
              n: arDigits(post.topN),
              of: arDigits(post.groupSize),
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
