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
import {
  getVenueOptions,
  getTemplateOptions,
  getHostLimits,
  createSbota,
} from '@/lib/api'
import type { VenueOption, TemplateOption, HostLimits } from '@/types'

/**
 * «افتح خروجة» — العضو بيظبّط خروجته بنفسه.
 *
 * ⚠ مفيش خانة سعر هنا **عن قصد**. السعر بيتحسب في القاعدة من القالب
 * و`settings` (شوف `fn_create_sbota` في 0078). لو حد ضاف خانة سعر هنا
 * بعدين، المتصفح يبقى بيحدد الفلوس — وده بالظبط «الحجز ببلاش» اللي
 * المراجعة الأمنية سدّته.
 *
 * وكل الحدود المعروضة (العدد · المهلة · أبعد ميعاد) بتتقرا من `settings`،
 * مفيش رقم مكتوب في الملف ده.
 */

/** `datetime-local` بيدي «2026-09-20T19:30» — بنحوّلها لـ ISO بتوقيت الجهاز */
function toIso(local: string): string {
  return new Date(local).toISOString()
}

/** أقل ميعاد مسموح بيه في منتقي التاريخ — بصيغة `datetime-local` محليًا */
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

  const [templates, setTemplates] = useState<TemplateOption[]>([])
  const [venues, setVenues] = useState<VenueOption[]>([])
  const [limits, setLimits] = useState<HostLimits | null>(null)
  const [loading, setLoading] = useState(true)

  const [templateId, setTemplateId] = useState('')
  const [venueId, setVenueId] = useState('')
  const [when, setWhen] = useState('')
  const [capacity, setCapacity] = useState('')
  const [girlsOnly, setGirlsOnly] = useState(false)
  const [note, setNote] = useState('')

  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace('/login?next=/new')
      return
    }
    Promise.all([getTemplateOptions(), getVenueOptions(), getHostLimits()])
      .then(([tpl, ven, lim]) => {
        setTemplates(tpl)
        setVenues(ven)
        setLimits(lim)
      })
      .finally(() => setLoading(false))
  }, [router])

  const chosen = useMemo(
    () => templates.find((x) => x.id === templateId) ?? null,
    [templates, templateId]
  )

  // حدود العدد: الأضيق بين حد القالب وحد الإعدادات — القاعدة بتفحص الاتنين
  const capOptions = useMemo(() => {
    if (!limits) return []
    const lo = Math.max(limits.minCapacity, chosen?.minGroup ?? limits.minCapacity)
    const hi = Math.min(limits.maxCapacity, chosen?.maxGroup ?? limits.maxCapacity)
    const out: Array<{ value: string; label: string }> = []
    for (let i = lo; i <= hi; i++) out.push({ value: String(i), label: String(i) })
    return out
  }, [limits, chosen])

  async function submit() {
    setErr('')
    if (!templateId || !venueId || !when || !capacity) {
      setErr(t('host.new.required'))
      return
    }
    setBusy(true)
    track('create_sbota', { template: templateId })
    const res = await createSbota({
      templateId,
      venueId,
      startsAt: toIso(when),
      capacity: Number(capacity),
      girlsOnly,
      note,
    })
    setBusy(false)
    // رسالة القاعدة عربية ومكتوبة للعضو («العدد لازم يكون بين 4 و 12») —
    // بنعرضها زي ما هي بدل رسالة عامة ما تقولش إيه اللي غلط.
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
            <Select
              label={t('host.new.type')}
              placeholder={t('host.new.pickType')}
              value={templateId}
              onChange={(e) => {
                setTemplateId(e.target.value)
                setCapacity('')
              }}
              options={templates.map((x) => ({ value: x.id, label: `${x.name} · ${x.price}` }))}
            />

            <Select
              label={t('host.new.venue')}
              placeholder={t('host.new.pickVenue')}
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              options={venues.map((v) => ({ value: v.id, label: `${v.name} · ${v.area}` }))}
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
              label={t('host.new.capacity')}
              placeholder={t('host.new.pickCapacity')}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              options={capOptions}
            />

            <Checkbox checked={girlsOnly} onChange={setGirlsOnly}>
              {t('host.new.girls')}
            </Checkbox>

            <TextArea
              label={t('host.new.note')}
              placeholder={t('host.new.notePlaceholder')}
              value={note}
              maxLength={140}
              onChange={(e) => setNote(e.target.value)}
            />

            {/* السعر بيتحدد من نوع الخروجة — بنقولها صريح علشان محدش يستنى
                خانة سعر مش موجودة */}
            <p className="font-body text-14" style={{ color: '#55575C' }}>
              {chosen
                ? t('host.new.priceFrom', { price: chosen.price })
                : t('host.new.priceNote')}
            </p>

            {err && (
              <p role="alert" className="font-body text-15 font-semibold" style={{ color: 'var(--err-text)' }}>
                {err}
              </p>
            )}

            <PrimaryButton onClick={submit} disabled={busy}>
              {busy ? t('host.new.sending') : t('host.new.submit')}
            </PrimaryButton>

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
