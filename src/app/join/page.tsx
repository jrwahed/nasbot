'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { Sticker } from '@/components/Sticker'
import { Field, Select, ChoicePill, Checkbox } from '@/components/Field'
import { PrimaryButton } from '@/components/Buttons'
import { StickyCTA } from '@/components/StickyCTA'
import {
  interests as ALL_INTERESTS,
  defaultInterests,
  MAX_INTERESTS,
  areas,
  skillLevels,
  sports,
  budgets,
  days,
  girlsOnlyOptions,
} from '@/data/lists'
import { signInOrSignUp, ensureAccount, createAccount, uploadAvatar, type AuthFail } from '@/lib/api'
import { setSession } from '@/lib/session'
import type { Gender, SkillLevel } from '@/types'
import { useT } from '@/components/CopyProvider'

/** سنوات الميلاد — من 18 سنة لحد 1950، الأحدث الأول. نفس حد القاعدة (≥ 18) */
const MAX_BIRTH_YEAR = new Date().getFullYear() - 18
const BIRTH_YEARS = Array.from({ length: MAX_BIRTH_YEAR - 1950 + 1 }, (_, i) => {
  const y = String(MAX_BIRTH_YEAR - i)
  return { value: y, label: y }
})

/** أخطاء الدخول → مفاتيح النصوص */
const AUTH_ERR: Record<AuthFail, string> = {
  wrongPassword: 'join.err.wrongPassword',
  weakPassword: 'join.err.weakPassword',
  invalidEmail: 'join.err.invalidEmail',
  rateLimited: 'join.err.rateLimited',
  notConfirmed: 'join.err.notConfirmed',
  disabled: 'join.err.disabled',
  unknown: 'join.err.auth',
}

/** رقم الخطوة — ستيكر برتقالي مايل، من الملف */
function Step({ n, title, rotate, extra }: { n: number; title: string; rotate: number; extra?: React.ReactNode }) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-[10px]">
      <Sticker color="orange" rotate={rotate} size="step">
        {n}
      </Sticker>
      <span className="font-display text-20 font-black">{title}</span>
      {extra}
    </div>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="mt-[14px] font-semibold">{children}</div>
}

function JoinForm() {
  const t = useT()
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get('next') ?? '/me'

  // 1 — رقمك
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // 2 — عنك
  const [firstName, setFirstName] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [gender, setGender] = useState<Gender | null>(null)
  const [area, setArea] = useState<string | null>(null)
  const [girlsOnly, setGirlsOnly] = useState<string>('أحيانًا')

  // 3 — بتحب إيه
  const [picked, setPicked] = useState<string[]>(defaultInterests)
  const [levels, setLevels] = useState<Record<string, SkillLevel>>({
    بادل: 'أول مرة',
    جري: 'مبتدئ',
    سباحة: 'كويس',
  })
  const [budget, setBudget] = useState<string>('لحد 500')
  const [pickedDays, setPickedDays] = useState<string[]>(['تلات', 'خميس', 'جمعة'])

  // 4 — صورتك: الملف من الجهاز + معاينة، والرفع بيحصل بعد إنشاء الحساب
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!photoFile) {
      setPhotoUrl(null)
      return
    }
    const url = URL.createObjectURL(photoFile)
    setPhotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photoFile])

  // 5 — موافقتك
  const [agreeRules, setAgreeRules] = useState(true)
  const [agreeData, setAgreeData] = useState(false)

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)

  /** نفس سلوك الملف: لو مختار 5 والمستخدم داس على واحد جديد — مفيش تغيير */
  const toggleInterest = (label: string) =>
    setPicked((s) =>
      s.includes(label)
        ? s.filter((x) => x !== label)
        : s.length < MAX_INTERESTS
          ? [...s, label]
          : s
    )

  const toggleDay = (d: string) =>
    setPickedDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]))

  const submit = async () => {
    const e: Record<string, string> = {}
    const digits = phone.replace(/\D/g, '')

    if (digits.length < 11) e.phone = t('join.label.25')
    if (!email.includes('@')) e.email = t('join.label.22')
    if (password.length < 6) e.password = t('join.err.passwordShort')
    if (!firstName.trim()) e.firstName = t('join.label.21')
    const y = Number(birthYear)
    if (!y || y < 1950 || y > MAX_BIRTH_YEAR) e.birthYear = t('join.label.20')
    if (!gender) e.gender = t('join.label.19')
    if (!area) e.area = t('join.label.18')
    if (picked.length !== MAX_INTERESTS) e.interests = t('join.label.17')
    if (!pickedDays.length) e.days = t('join.label.16')
    if (!agreeRules || !agreeData) e.agree = t('join.label.15')

    setErrors(e)
    if (Object.keys(e).filter((k) => e[k]).length) {
      document
        .querySelector('[data-err="1"]')
        ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }

    setSubmitting(true)

    // الدخول عند سوبابيس: يدخل لو الحساب موجود، ويسجّل لو جديد
    const auth = await signInOrSignUp(email.trim().toLowerCase(), password)
    if (!auth.ok) {
      setSubmitting(false)
      // رسالة سوبابيس الأصلية بتظهر جنب العربي — من غيرها بنفضل نخمّن
      const detail = 'detail' in auth && auth.detail ? ` (${auth.detail})` : ''
      setErrors((prev) => ({ ...prev, password: t(AUTH_ERR[auth.code]) + detail }))
      document.querySelector('[data-err="1"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    // الملف في profiles — بيتعمل على الخادم لو مش موجود
    const ens = await ensureAccount(digits)
    if (!ens.ok) {
      setSubmitting(false)
      setErrors((prev) => ({ ...prev, phone: ens.error }))
      document.querySelector('[data-err="1"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }

    await createAccount({
      phone: digits,
      email,
      firstName,
      birthYear,
      gender: gender!,
      interests: picked,
      budget: budget as never,
      days: pickedDays,
    })
    if (photoFile) {
      const up = await uploadAvatar(photoFile)
      if (!up.ok) {
        // الحساب اتعمل — الصورة بس اللي وقعت. نوقف هنا علشان يجرب تاني بدل ما تضيع بصمت.
        setSubmitting(false)
        setErrors((prev) => ({ ...prev, photo: up.error }))
        document.querySelector('[data-err="1"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }
    }
    setSession({ phone: digits, firstName, gender: gender!, role: 'member' })
    router.push(next)
  }

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-6">
      <InnerHeader back={t('join.label.14')} padded={false} />

      <h1 className="mb-0 mt-[10px] font-display text-30 font-black leading-[1.15]">{t('join.text.17')}</h1>
      <div className="mt-1" style={{ color: 'var(--muted)' }}>
        {t('join.bookingFor')}{' '}
        <b style={{ color: 'var(--fg)' }}>{t('join.text.16')}</b>
      </div>

      {/* ===== 1 · رقمك ===== */}
      <Step n={1} title={t('join.label.13')} rotate={-3} />
      <div className="mt-3 flex flex-col gap-[10px]">
        <div data-err={errors.phone ? '1' : undefined}>
          <Field
            dir="ltr"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01x xxxx xxxx"
            aria-label={t('join.label.12')}
            error={errors.phone}
            className="text-end"
          />
        </div>
        <div data-err={errors.email ? '1' : undefined}>
          <Field
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('join.label.8')}
            aria-label={t('join.label.8')}
            error={errors.email}
          />
        </div>
        <div data-err={errors.password ? '1' : undefined}>
          <Field
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('join.label.password')}
            aria-label={t('join.label.password')}
            error={errors.password}
            hint={t('join.text.password')}
          />
        </div>
      </div>

      {/* ===== 2 · عنك ===== */}
      <Step n={2} title={t('join.label.7')} rotate={3} />
      <div className="mt-3 grid grid-cols-2 gap-[10px]">
        <div data-err={errors.firstName ? '1' : undefined} className="min-w-0">
          <Field
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder={t('join.label.6')}
            aria-label={t('join.label.6')}
            error={errors.firstName}
          />
        </div>
        <div data-err={errors.birthYear ? '1' : undefined} className="min-w-0">
          <Select
            value={birthYear}
            onChange={(e) => setBirthYear(e.target.value)}
            placeholder={t('join.label.5')}
            aria-label={t('join.label.5')}
            options={BIRTH_YEARS}
            error={errors.birthYear}
          />
        </div>
      </div>

      <Label>{t('join.text.14')}</Label>
      <div className="mt-[6px] flex gap-2" data-err={errors.gender ? '1' : undefined}>
        {(['بنت', 'شاب'] as Gender[]).map((g) => (
          <ChoicePill
            key={g}
            selected={gender === g}
            onClick={() => setGender(g)}
            fontSize={16}
            padding="0"
            className="min-h-[48px] flex-1"
          >
            {g}
          </ChoicePill>
        ))}
      </div>
      {errors.gender && (
        <div role="alert" className="mt-1 text-13 font-semibold" style={{ color: 'var(--err-text)' }}>
          {errors.gender}
        </div>
      )}

      <Label>{t('join.text.13')}</Label>
      <div className="mt-[6px] flex flex-wrap gap-2" data-err={errors.area ? '1' : undefined}>
        {areas.map((a) => (
          <ChoicePill key={a} selected={area === a} onClick={() => setArea(a)}>
            {a}
          </ChoicePill>
        ))}
      </div>
      {errors.area && (
        <div role="alert" className="mt-1 text-13 font-semibold" style={{ color: 'var(--err-text)' }}>
          {errors.area}
        </div>
      )}

      {/* «بنات بس» — بتظهر للبنات بس */}
      {gender === 'بنت' && (
        <div className="mt-[14px] rounded-16 p-[14px]" style={{ background: '#EFE3CF' }}>
          <div className="flex flex-wrap items-center gap-[10px]">
            <Sticker color="cobalt" rotate={-3} fontSize={14} padding="3px 12px">{t('join.text.12')}</Sticker>
            <span className="font-semibold" style={{ color: '#14161A' }}>{t('join.text.11')}</span>
          </div>
          <div className="mt-[10px] flex gap-2">
            {girlsOnlyOptions.map((o) => (
              <ChoicePill
                key={o}
                selected={girlsOnly === o}
                onClick={() => setGirlsOnly(o)}
                fontSize={14}
                padding="0"
                className="flex-1"
              >
                {o}
              </ChoicePill>
            ))}
          </div>
        </div>
      )}

      {/* ===== 3 · بتحب إيه؟ ===== */}
      <Step
        n={3}
        title={t('join.label.4')}
        rotate={-2}
        extra={
          <span className="text-14" style={{ color: 'var(--muted)' }}>{t('join.text.10')}<b style={{ color: 'var(--fg)' }}>{picked.length}/5</b>
          </span>
        }
      />
      <div className="mt-3 flex flex-wrap gap-2" data-err={errors.interests ? '1' : undefined}>
        {ALL_INTERESTS.map((label, i) => {
          const on = picked.includes(label)
          return (
            <button
              key={label}
              type="button"
              onClick={() => toggleInterest(label)}
              aria-pressed={on}
              className="min-h-[44px] cursor-pointer rounded-pill px-4 font-display text-15 font-black leading-none"
              style={{
                border: '2px solid var(--fg)',
                background: on ? '#F4632A' : 'transparent',
                color: on ? '#14161A' : 'var(--fg)',
                transform: on ? `rotate(${i % 2 ? 3 : -3}deg)` : undefined,
              }}
            >
              {label}
            </button>
          )
        })}
      </div>
      {errors.interests && (
        <div role="alert" className="mt-1 text-13 font-semibold" style={{ color: 'var(--err-text)' }}>
          {errors.interests}
        </div>
      )}

      <Label>{t('join.text.9')}</Label>
      <div className="mt-[6px] flex flex-col gap-2 text-14">
        {sports.map((sport) => (
          <div key={sport} className="flex items-center gap-2">
            <span className="w-[56px] shrink-0 font-semibold">{sport}</span>
            <div className="flex flex-1 gap-[6px]">
              {skillLevels.map((lvl) => (
                <ChoicePill
                  key={lvl}
                  selected={levels[sport] === lvl}
                  onClick={() => setLevels((s) => ({ ...s, [sport]: lvl }))}
                  fontSize={12}
                  padding="6px 0"
                  className="min-h-[44px] flex-1"
                >
                  {lvl}
                </ChoicePill>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Label>{t('join.text.8')}</Label>
      <div className="mt-[6px] flex gap-[6px]">
        {budgets.map((b) => (
          <ChoicePill
            key={b}
            selected={budget === b}
            onClick={() => setBudget(b)}
            fontSize={13}
            padding="8px 0"
            className="flex-1"
          >
            {b}
          </ChoicePill>
        ))}
      </div>

      <Label>{t('join.text.7')}</Label>
      <div className="mt-[6px] flex gap-[6px]" data-err={errors.days ? '1' : undefined}>
        {days.map((d) => (
          <ChoicePill
            key={d}
            selected={pickedDays.includes(d)}
            onClick={() => toggleDay(d)}
            radius={12}
            fontSize={13}
            padding="8px 0"
            className="flex-1"
          >
            {d}
          </ChoicePill>
        ))}
      </div>
      {errors.days && (
        <div role="alert" className="mt-1 text-13 font-semibold" style={{ color: 'var(--err-text)' }}>
          {errors.days}
        </div>
      )}

      {/* ===== 4 · صورتك ===== */}
      <Step n={4} title={t('join.label.3')} rotate={3} />
      <div className="mt-[14px] flex flex-col items-center gap-3" data-err={errors.photo ? '1' : undefined}>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            setPhotoFile(f)
            setErrors((prev) => ({ ...prev, photo: '' }))
            // علشان اختيار نفس الملف تاني يشغّل onChange
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          aria-label={t('join.label.2')}
          className="relative grid h-[140px] w-[140px] cursor-pointer place-items-center overflow-hidden rounded-full bg-transparent font-display text-18 font-black"
          style={{ border: photoUrl ? '3px solid var(--fg)' : '3px dashed var(--fg)', color: 'var(--fg)' }}
        >
          {photoUrl ? (
            // معاينة محلية — object URL، مش صورة من الشبكة
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            t('join.label.2')
          )}
        </button>
        {photoUrl && (
          <div className="font-body text-13 font-semibold" style={{ color: 'var(--muted)' }}>
            {t('join.photoDone')}
          </div>
        )}
        {errors.photo && (
          <div role="alert" className="text-13 font-semibold" style={{ color: 'var(--err-text)' }}>
            {errors.photo}
          </div>
        )}
        <div
          className="rounded-16 px-4 py-[14px] text-15 font-semibold"
          style={{ background: '#EFE3CF', color: '#14161A' }}
        >{t('join.text.6')}</div>
      </div>

      {/* ===== 5 · موافقتك ===== */}
      <Step n={5} title={t('join.label.1')} rotate={-3} />
      <div className="mt-3" data-err={errors.agree ? '1' : undefined}>
        <Checkbox checked={agreeRules} onChange={setAgreeRules} error={!!errors.agree}>{t('join.text.5')}<b>{t('join.text.4')}</b>
        </Checkbox>
        <div className="mt-[6px]">
          <Checkbox checked={agreeData} onChange={setAgreeData} error={!!errors.agree}>{t('join.text.3')}</Checkbox>
        </div>
      </div>
      {errors.agree && (
        <div role="alert" className="mt-1 text-13 font-semibold" style={{ color: 'var(--err-text)' }}>
          {errors.agree}
        </div>
      )}

      {/* ===== الزر اللاصق ===== */}
      <div className="mt-6">
        <StickyCTA>
          <PrimaryButton size="lg" className="w-full" onClick={submit} loading={submitting}>{t('join.text.2')}</PrimaryButton>
          <div
            className="mt-[6px] text-center font-body text-13"
            style={{ color: 'var(--muted)' }}
          >{t('join.text.1')}</div>
        </StickyCTA>
      </div>
    </main>
  )
}

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinForm />
    </Suspense>
  )
}
