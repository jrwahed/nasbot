'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { Sticker } from '@/components/Sticker'
import { Select, TextArea, Field, Checkbox } from '@/components/Field'
import { PrimaryButton } from '@/components/Buttons'
import { FeatureGate } from '@/components/FlagsProvider'
import { useT } from '@/components/CopyProvider'
import { isLoggedIn } from '@/lib/session'
import { track } from '@/lib/track'
import { getHostLimits, createSbota } from '@/lib/api'
import { getRegistrationLists, listsFallback, type RegistrationLists } from '@/lib/fields'
import type { HostLimits } from '@/types'

/**
 * «افتح خروجة» — العضو بيكتب خروجته بنفسه.
 *
 * ⚠ **كان فيه قايمتين اختيار** (قالب + مكان) وكلهم بيانات عرض مبذورة —
 * يعني عضو يفتح خروجة حقيقية في مكان نسبوط مالوش اتفاق معاه بسعر مخترع.
 * دلوقتي بيكتب: الاسم · التفاصيل · المكان · العنوان · التكلفة التقريبية.
 * الاختيارات في الحاجات الأساسية بس.
 *
 * ⚠ **مفيش خانة سعر ومش هيبقى فيه.** الحجز في خروجة العضو ببلاش على
 * نسبوط — «التكلفة التقريبية» دي **معلومة للناس** بيدفعوها في المكان،
 * مش مبلغ نسبوط بيحصّله. لو حد ضاف سعر هنا بعدين، بيكون حوّل نسبوط
 * لوسيط بيمسك فلوس نيابة عن أعضاء، وده منتج تاني خالص.
 *
 * والحدود (العدد · المهلة · أبعد ميعاد) كلها من `settings` — مفيش رقم
 * مكتوب في الملف ده.
 */

/** المدة — اختيار أساسي. الدقايق بتتحول لـ`ends_at` في القاعدة. */
const DURATIONS = [60, 90, 120, 150, 180, 240, 300, 360]

function toIso(local: string): string {
  return new Date(local).toISOString()
}

function localMin(hoursAhead: number): string {
  const d = new Date(Date.now() + hoursAhead * 3600_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localMax(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 864e5)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T23:59`
}

function NewSbotaForm() {
  const t = useT()
  const router = useRouter()

  const [limits, setLimits] = useState<HostLimits | null>(null)
  const [lists, setLists] = useState<RegistrationLists>(listsFallback)
  const [loading, setLoading] = useState(true)

  const [title, setTitle] = useState('')
  const [details, setDetails] = useState('')
  const [venueName, setVenueName] = useState('')
  const [address, setAddress] = useState('')
  const [area, setArea] = useState('')
  const [when, setWhen] = useState('')
  const [duration, setDuration] = useState('120')
  const [capacity, setCapacity] = useState('')
  const [girlsOnly, setGirlsOnly] = useState(false)
  const [costNote, setCostNote] = useState('')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/login?next=/new')
      return
    }
    Promise.all([getHostLimits(), getRegistrationLists()])
      .then(([lim, ls]) => {
        setLimits(lim)
        setLists(ls)
      })
      .finally(() => setLoading(false))
  }, [router])

  const capOptions = useMemo(() => {
    if (!limits) return []
    const out: Array<{ value: string; label: string }> = []
    for (let i = limits.minCapacity; i <= limits.maxCapacity; i++) {
      out.push({ value: String(i), label: String(i) })
    }
    return out
  }, [limits])

  async function submit() {
    setErr('')
    if (!title || !details || !venueName || !address || !area || !when || !capacity) {
      setErr(t('host.new.required'))
      return
    }
    setBusy(true)
    track('create_sbota', { area })
    const res = await createSbota({
      title,
      details,
      venueName,
      address,
      area,
      startsAt: toIso(when),
      durationMin: Number(duration),
      capacity: Number(capacity),
      girlsOnly,
      costNote,
    })
    setBusy(false)
    // رسالة القاعدة عربية ومكتوبة للعضو («اكتب العنوان بالتفاصيل»، أو
    // «الكلمة دي مش من كلامنا») — بنعرضها زي ما هي بدل رسالة عامة.
    if (!res.ok) {
      setErr(res.error || t('host.new.err'))
      return
    }
    router.push('/me/sbotati?new=1')
  }

  return (
    <>
      <InnerHeader />
      <main className="mx-auto flex w-full max-w-[560px] flex-col gap-5 px-4 pb-24 pt-6">
        <div>
          <Sticker color="orange" rotate={-3} size="md">
            {t('host.new.kicker')}
          </Sticker>
          <h1 className="mt-3 font-display text-32 font-black leading-[1.1]">
            {t('host.new.title')}
          </h1>
          <p className="mt-2 font-body text-16" style={{ color: '#55575C' }}>
            {t('host.new.intro')}
          </p>
        </div>

        {loading ? (
          <p className="font-body text-16">{t('host.new.loading')}</p>
        ) : (
          <>
            <Field
              label={t('host.new.name')}
              value={title}
              maxLength={60}
              placeholder={t('host.new.namePh')}
              onChange={(e) => setTitle(e.target.value)}
            />

            <TextArea
              label={t('host.new.details')}
              value={details}
              maxLength={600}
              placeholder={t('host.new.detailsPh')}
              onChange={(e) => setDetails(e.target.value)}
            />

            <Field
              label={t('host.new.venue')}
              value={venueName}
              maxLength={80}
              placeholder={t('host.new.venuePh')}
              onChange={(e) => setVenueName(e.target.value)}
            />

            <TextArea
              label={t('host.new.address')}
              value={address}
              maxLength={300}
              placeholder={t('host.new.addressPh')}
              onChange={(e) => setAddress(e.target.value)}
            />
            {/* `TextArea` مفيهاش hint — بنكتبها تحتها. والسطر ده مهم:
                العنوان سر لحد الكشف، وصاحب الخروجة لازم يعرف كده وهو بيكتبه. */}
            <p className="-mt-3 font-body text-14" style={{ color: '#55575C' }}>
              {t('host.new.addressHint')}
            </p>

            <Select
              label={t('host.new.area')}
              placeholder={t('host.new.pickArea')}
              value={area}
              onChange={(e) => setArea(e.target.value)}
              options={lists.areas.map((a) => ({ value: a.value, label: a.label }))}
            />

            <Field
              label={t('host.new.when')}
              type="datetime-local"
              value={when}
              min={limits ? localMin(limits.minLeadHours) : undefined}
              max={limits ? localMax(limits.maxDaysAhead) : undefined}
              onChange={(e) => setWhen(e.target.value)}
              hint={
                limits
                  ? t('host.new.whenHint', { hours: limits.minLeadHours, days: limits.maxDaysAhead })
                  : undefined
              }
            />

            <Select
              label={t('host.new.duration')}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              options={DURATIONS.map((m) => ({
                value: String(m),
                label: t('host.new.durationValue', { h: Math.round((m / 60) * 10) / 10 }),
              }))}
            />

            <Select
              label={t('host.new.capacity')}
              placeholder={t('host.new.pickCapacity')}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              options={capOptions}
            />

            <Field
              label={t('host.new.cost')}
              value={costNote}
              maxLength={80}
              placeholder={t('host.new.costPh')}
              hint={t('host.new.costHint')}
              onChange={(e) => setCostNote(e.target.value)}
            />

            <Checkbox checked={girlsOnly} onChange={setGirlsOnly}>
              {t('host.new.girls')}
            </Checkbox>

            {err && (
              <p role="alert" className="font-body text-15 font-semibold" style={{ color: 'var(--err-text)' }}>
                {err}
              </p>
            )}

            <PrimaryButton onClick={submit} disabled={busy}>
              {busy ? t('host.new.sending') : t('host.new.submit')}
            </PrimaryButton>

            <p className="font-body text-14" style={{ color: '#55575C' }}>
              {t('host.new.reviewNote')}
            </p>
            <p className="font-body text-14" style={{ color: '#55575C' }}>
              {t('host.new.secretNote')}
            </p>
          </>
        )}
      </main>
    </>
  )
}

export default function NewSbotaPage() {
  return (
    <FeatureGate flag="member_sbota">
      <NewSbotaForm />
    </FeatureGate>
  )
}
