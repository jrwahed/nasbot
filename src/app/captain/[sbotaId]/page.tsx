'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { InnerHeader } from '@/components/Header'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { TextArea } from '@/components/Field'
import { PrimaryButton } from '@/components/Buttons'
import { Sticker } from '@/components/Sticker'
import {
  getCaptainBoard,
  markArrived,
  uploadGroupPhotos,
  saveCaptainReport,
  type CaptainBoard,
} from '@/lib/api'
import { emergencyPhone } from '@/data/lists'
import { captainReportFields } from '@/data/bookings'
import { isLoggedIn } from '@/lib/session'
import { useT } from '@/components/CopyProvider'

/**
 * لوحة اللي ماسك المجموعة — صاحب الخروجة (عضو فتحها) أو كابتن نسبوط.
 * هنا الصور الشخصية بتظهر، لأنه محتاج يعرف الناس عند البوابة.
 *
 * ⚠ الحماية الحقيقية في RLS مش هنا: سياسة `bookings_own_read` بتمر على
 * `fn_is_my_sbota_revealed`، وهي بتدّي الحق للكابتن **ولصاحب الخروجة**
 * بعد `reveal_at` بس (0078). فالفحص اللي تحت راحة للعين مش حد أمني —
 * أي حد تاني بيوصل هنا بيلاقي قايمة فاضية، مش بيانات ناس.
 */
export default function CaptainBoardPage() {
  const t = useT()
  const params = useParams<{ sbotaId: string }>()
  const [board, setBoard] = useState<CaptainBoard | null>(null)
  const [arrived, setArrived] = useState<Record<string, boolean>>({})
  const [report, setReport] = useState<string[]>(
    Array(captainReportFields.length).fill('')
  )
  const [photos, setPhotos] = useState(0)
  const [saved, setSaved] = useState(false)
  const [allowed, setAllowed] = useState<boolean | null>(null)

  useEffect(() => {
    // أي عضو داخل بيعدّي: صاحب الخروجة عضو عادي ومفيش دور بيميّزه في
    // الجلسة. الزائر بس هو اللي بنوقفه هنا — وده علشان يشوف رسالة مفهومة
    // بدل لوحة فاضية. مين بيشوف الأسماء فعلًا قرار RLS مش قرار الملف ده.
    setAllowed(isLoggedIn())
    getCaptainBoard(params.sbotaId).then(setBoard)
  }, [params.sbotaId])

  if (allowed === false) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back={t('captainboard.label.3')} padded={false} />
        <div className="pt-10">
          <h1 className="m-0 font-display text-30 font-black">{t('captainboard.text.9')}</h1>
          <p className="mt-2 font-body text-16" style={{ color: 'var(--muted)' }}>{t('captainboard.text.8')}</p>
          <Link
            href="/captains"
            className="mt-4 inline-block font-body text-16 font-semibold underline"
            style={{ color: 'var(--accent-text)' }}
          >{t('captainboard.text.7')}</Link>
        </div>
      </main>
    )
  }

  if (!board) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back={t('captainboard.label.3')} padded={false} />
        <div className="pt-8" style={{ color: 'var(--muted)' }}>{t('captainboard.text.6')}</div>
      </main>
    )
  }

  const arrivedCount = Object.values(arrived).filter(Boolean).length

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-8">
      <InnerHeader back={t('captainboard.label.3')} padded={false} />

      <h1 className="mb-0 mt-[10px] font-display text-30 font-black leading-[1.15]">
        {board.sbota.name}
      </h1>
      <div className="mt-1 font-body text-16" style={{ color: 'var(--muted)' }}>
        {board.sbota.when} · {board.sbota.area}
      </div>

      <div className="mt-3">
        <Sticker color="orange" rotate={-3} size="lg">
          {t('captainboard.arrived', { n: arrivedCount, total: board.roster.length })}
        </Sticker>
      </div>

      {/* ===== زر الطوارئ ===== */}
      <a
        href={`tel:${emergencyPhone}`}
        className="mt-6 grid w-full place-items-center rounded-16 font-display text-22 font-black"
        style={{ background: '#8E2F1F', color: '#FBF7EF', minHeight: 64 }}
      >{t('captainboard.text.5')}</a>

      {/* ===== الكشف بالصور ===== */}
      <h2 className="mt-8 font-display text-24 font-black">{t('captainboard.text.4')}</h2>
      <div className="mt-3 flex flex-col gap-2">
        {board.roster.map((p) => {
          const on = !!arrived[p.name]
          return (
            <div
              key={p.name}
              className="flex items-center gap-3 rounded-20 p-3"
              style={{ background: 'var(--surface)' }}
            >
              <PhotoPlaceholder label={p.photo} circle size={56} />
              <div className="min-w-0 flex-1">
                <div className="font-display text-17 font-black">{p.name}</div>
                <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  {p.tag}
                </div>
                <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  {p.line}
                </div>
              </div>
              <label className="flex min-h-[44px] shrink-0 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={async (e) => {
                    const v = e.target.checked
                    setArrived((s) => ({ ...s, [p.name]: v }))
                    await markArrived(params.sbotaId, p.name, v)
                  }}
                  className="sr-only"
                />
                <span
                  aria-hidden="true"
                  className="grid h-[30px] w-[30px] place-items-center font-display text-16 font-black"
                  style={{
                    border: '2px solid var(--fg)',
                    borderRadius: 8,
                    background: on ? '#3E5C43' : 'transparent',
                    color: '#FBF7EF',
                  }}
                >
                  {on ? '✓' : ''}
                </span>
                <span className="font-display text-14 font-black">{t('captainboard.text.3')}</span>
              </label>
            </div>
          )
        })}
      </div>

      {/* ===== الصور ===== */}
      <h2 className="mt-8 font-display text-24 font-black">{t('captainboard.text.2')}</h2>
      <button
        type="button"
        onClick={async () => {
          const n = photos + 3
          setPhotos(n)
          await uploadGroupPhotos(params.sbotaId, n)
        }}
        className="mt-3 w-full cursor-pointer rounded-16 font-display text-16 font-black"
        style={{
          minHeight: 58,
          background: 'transparent',
          color: 'var(--fg)',
          border: '2px dashed var(--fg)',
        }}
      >
        {photos ? t('captainboard.photosDone', { n: photos }) : t('captainboard.label.2')}
      </button>

      {/* ===== التقرير ===== */}
      <h2 className="mt-8 font-display text-24 font-black">{t('captainboard.text.1')}</h2>
      <div className="mt-3 flex flex-col gap-3">
        {captainReportFields.map((f, i) => (
          <TextArea
            key={f}
            label={f}
            value={report[i]}
            onChange={(e) =>
              setReport((r) => r.map((x, n) => (n === i ? e.target.value : x)))
            }
          />
        ))}
        <PrimaryButton
          size="lg"
          className="mt-2 w-full"
          onClick={async () => {
            await saveCaptainReport(params.sbotaId, report)
            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
          }}
        >
          {saved ? t('captainboard.saved') : t('captainboard.label.1')}
        </PrimaryButton>
      </div>
    </main>
  )
}
