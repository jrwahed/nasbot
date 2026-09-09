'use client'

import { useState } from 'react'
import { Field, Select, TextArea } from '@/components/Field'
import { submitLead } from '@/lib/api'
import { leadTimesOptions } from '@/data/lists'
import { useT } from '@/components/CopyProvider'

/**
 * نموذج الشركات — صندوق رملي زي «مش فاضي الأسبوع ده؟» في الرئيسية.
 * بيكتب في leads عبر fn_submit_lead (إدراج للكل بحد معدل)، ومفيش قراءة من هنا.
 */
export function LeadForm({ className = '' }: { className?: string }) {
  const t = useT()
  const [company, setCompany] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [people, setPeople] = useState('')
  const [times, setTimes] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [failed, setFailed] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (!company.trim()) errs.company = t('shoghl.lead.err.company')
    if (!name.trim()) errs.name = t('shoghl.lead.err.name')
    if (phone.replace(/\D/g, '').length < 11) errs.phone = t('shoghl.lead.err.phone')
    const n = Number(people)
    if (!n || n < 1) errs.people = t('shoghl.lead.err.people')
    setErrors(errs)
    if (Object.keys(errs).length) return

    setBusy(true)
    setFailed('')
    const res = await submitLead({
      company,
      contactName: name,
      phone,
      peopleCount: n,
      timesPerMonth: Number(times) || 1,
      note,
    })
    setBusy(false)
    if (!res.ok) {
      setFailed(t('shoghl.lead.err.generic'))
      return
    }
    setSent(true)
  }

  return (
    <section
      className={`rounded-20 p-5 ${className}`}
      style={{ background: '#EFE3CF', color: '#14161A' }}
    >
      <h2 className="m-0 font-display text-24 font-black leading-[1.15]">{t('shoghl.lead.title')}</h2>
      <div className="mt-1 font-body text-14" style={{ color: '#55575C' }}>
        {t('shoghl.lead.sub')}
      </div>

      {sent ? (
        <div
          role="status"
          className="mt-[14px] rounded-14 p-3 font-body text-15 font-semibold"
          style={{ background: '#FBF7EF', color: '#14161A' }}
        >
          {t('shoghl.lead.thanks')}
        </div>
      ) : (
        <form onSubmit={submit} className="mt-[14px] flex flex-col gap-3">
          <Field
            label={t('shoghl.lead.company')}
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            error={errors.company}
            autoComplete="organization"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label={t('shoghl.lead.name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              error={errors.name}
              autoComplete="name"
            />
            <Field
              label={t('shoghl.lead.phone')}
              dir="ltr"
              inputMode="tel"
              placeholder="01x xxxx xxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              error={errors.phone}
              autoComplete="tel"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t('shoghl.lead.people')}
              inputMode="numeric"
              value={people}
              onChange={(e) => setPeople(e.target.value.replace(/\D/g, ''))}
              error={errors.people}
            />
            <Select
              label={t('shoghl.lead.times')}
              value={times}
              onChange={(e) => setTimes(e.target.value)}
              placeholder={t('shoghl.lead.timesPick')}
              options={leadTimesOptions.map((o) => ({ value: String(o.value), label: t(o.key) }))}
            />
          </div>
          <TextArea
            label={t('shoghl.lead.note')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
          />
          {failed && (
            <div role="alert" className="font-body text-13 font-semibold" style={{ color: 'var(--err-text)' }}>
              {failed}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full cursor-pointer rounded-14 border-0 font-display text-16 font-black disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: '#14161A', color: '#FBF7EF', minHeight: 50 }}
          >
            {busy ? t('shared.wait') : t('shoghl.lead.cta')}
          </button>
        </form>
      )}
    </section>
  )
}
