'use client'

import { useState } from 'react'
import { InnerHeader } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { CaptainTile } from '@/components/CaptainCard'
import { Field, TextArea } from '@/components/Field'
import { PrimaryButton } from '@/components/Buttons'
import { captains } from '@/data/captains'
import { applyAsCaptain } from '@/lib/api'
import { useT } from '@/components/CopyProvider'

/** الكباتن + نموذج «بقى كابتن» */
export default function CaptainsPage() {
  const t = useT()
  const [form, setForm] = useState({ name: '', phone: '', job: '', why: '' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    const e: Record<string, string> = {}
    if (!form.name.trim()) e.name = t('captains.label.9')
    if (form.phone.replace(/\D/g, '').length < 11) e.phone = t('captains.label.8')
    if (!form.job.trim()) e.job = t('captains.label.7')
    if (!form.why.trim()) e.why = t('captains.label.6')
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    await applyAsCaptain(form)
    setBusy(false)
    setSent(true)
  }

  return (
    <main className="mx-auto w-full max-w-page">
      <div className="px-5">
        <InnerHeader back={t('captains.label.5')} padded={false} />

        <h1 className="mb-0 mt-[10px] font-display text-40 font-black leading-[1.1]">{t('captains.text.6')}</h1>
        <p className="mb-0 mt-2 text-17">{t('captains.text.5')}</p>

        <div className="mt-8 grid grid-cols-2 gap-6">
          {captains.map((c) => (
            <CaptainTile key={c.id} captain={c} />
          ))}
        </div>

        {/* ===== بقى كابتن ===== */}
        <h2 className="mt-10 font-display text-30 font-black leading-[1.15]">{t('captains.text.4')}</h2>
        <p className="mb-0 mt-2 font-body text-16" style={{ color: 'var(--muted)' }}>{t('captains.text.3')}</p>

        {sent ? (
          <div
            role="status"
            className="mt-6 rounded-20 p-5 font-body text-16 font-semibold"
            style={{ background: '#EFE3CF', color: '#14161A' }}
          >{t('captains.text.2')}</div>
        ) : (
          <div className="mt-6 flex flex-col gap-3">
            <Field
              label={t('captains.label.4')}
              value={form.name}
              onChange={(e) => set('name')(e.target.value)}
              error={errors.name}
            />
            <Field
              label={t('captains.label.3')}
              dir="ltr"
              inputMode="tel"
              placeholder="01x xxxx xxxx"
              value={form.phone}
              onChange={(e) => set('phone')(e.target.value)}
              error={errors.phone}
              className="text-end"
            />
            <Field
              label={t('captains.label.2')}
              value={form.job}
              onChange={(e) => set('job')(e.target.value)}
              error={errors.job}
            />
            <TextArea
              label={t('captains.label.1')}
              value={form.why}
              onChange={(e) => set('why')(e.target.value)}
              error={errors.why}
            />
            <PrimaryButton
              size="lg"
              className="mt-2 w-full"
              onClick={submit}
              loading={busy}
            >{t('captains.text.1')}</PrimaryButton>
          </div>
        )}
      </div>

      <Footer />
    </main>
  )
}
