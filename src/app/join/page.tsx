'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { Sticker } from '@/components/Sticker'
import { Field, Select, ChoicePill, Checkbox } from '@/components/Field'
import { PrimaryButton } from '@/components/Buttons'
import { StickyCTA } from '@/components/StickyCTA'
import {
  getRegistrationLists,
  listsFallback,
  type RegistrationLists,
} from '@/lib/fields'
import {
  signInOrSignUp,
  ensureAccount,
  createAccount,
  uploadAvatar,
  getProfileForm,
  type AuthFail,
} from '@/lib/api'
import {
  getProfessions,
  getMyWorkProfile,
  saveWorkProfile,
  takePendingProfession,
  WORK_STATUS_KEYS,
  WORK_STYLE_KEYS,
  EXPERIENCE_KEYS,
  WORK_STEP_TRIGGERS,
  type ProfessionOption,
  type WorkStatusKey,
  type WorkStyleKey,
  type ExperienceKey,
} from '@/lib/collab'
import { setSession } from '@/lib/session'
import { hasSupabase } from '@/lib/supabase'
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

  /**
   * قوايم النموذج — من `profile_fields` و`field_options` و`skill_activities`
   * و`consents` في القاعدة (مراجعة A4). البداية هي احتياطي الكود، فالنموذج
   * بيرسم من أول لحظة ولو القاعدة واقعة يفضل شغّال زي ما هو.
   */
  const [lists, setLists] = useState<RegistrationLists>(listsFallback)

  // 1 — رقمك
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // تعديل الملف: لو داخل فعلًا وعنده ملف — الفورم بيتملى ببياناته وبيحفظ فوقها
  const [editMode, setEditMode] = useState(false)
  const [existingAvatar, setExistingAvatar] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // 2 — عنك
  const [firstName, setFirstName] = useState('')
  const [birthYear, setBirthYear] = useState('')
  const [gender, setGender] = useState<Gender | null>(null)
  const [area, setArea] = useState<string | null>(null)
  const [areaOther, setAreaOther] = useState('')
  const [girlsOnly, setGirlsOnly] = useState<string>(
    listsFallback.girlsOnly[1]?.value ?? ''
  )

  // 3 — بتحب إيه
  const [picked, setPicked] = useState<string[]>(listsFallback.defaultInterests)
  const [levels, setLevels] = useState<Record<string, SkillLevel>>({})
  const [budget, setBudget] = useState<string>(listsFallback.budgets[1]?.value ?? '')
  const [pickedDays, setPickedDays] = useState<string[]>(listsFallback.defaultDays)

  /**
   * لما القوايم توصل من القاعدة: أي اختيار حالي مش موجود في القايمة الجديدة
   * بيتشال، والفاضي بياخد الافتراضي. كده تعديل المالك من اللوحة بيبان فورًا
   * من غير ما يسيب النموذج على قيمة مقفولة.
   */
  useEffect(() => {
    let alive = true
    getRegistrationLists().then((l) => {
      if (!alive) return
      setLists(l)
      const keep = (opts: { value: string }[], cur: string) =>
        opts.some((o) => o.value === cur)
      setPicked((cur) => {
        const ok = cur.filter((v) => keep(l.interests, v))
        return ok.length ? ok : l.defaultInterests
      })
      setPickedDays((cur) => {
        const ok = cur.filter((v) => keep(l.days, v))
        return ok.length ? ok : l.defaultDays
      })
      setBudget((cur) => (keep(l.budgets, cur) ? cur : (l.budgets[1] ?? l.budgets[0])?.value ?? cur))
      setGirlsOnly((cur) =>
        keep(l.girlsOnly, cur) ? cur : (l.girlsOnly[1] ?? l.girlsOnly[0])?.value ?? cur
      )
      setArea((cur) => (cur && !keep(l.areas, cur) ? null : cur))
      setLevels((cur) => {
        const nextLevel = { ...cur }
        const first = l.skillLevels[0]?.value as SkillLevel | undefined
        for (const s of l.sports) if (!nextLevel[s.value] && first) nextLevel[s.value] = first
        return nextLevel
      })
    })
    return () => {
      alive = false
    }
  }, [])

  /**
   * خطوة الشغل — **اختيارية وما بتظهرش لكل الناس** (WORK_PLAN §2).
   * بتفتح في حالتين بس: جاي من /shoghl (‏?from=shoghl)، أو قال في السؤال
   * الصغير إنه فريلانسر / موظف بيشتغل من البيت. أي حد تاني ما يشوفهاش —
   * كل حقل زيادة في التسجيل بياكل من نسبة اللي بيكمّلوه.
   */
  const fromShoghl = search.get('from') === 'shoghl'
  const [workStatus, setWorkStatus] = useState<WorkStatusKey | null>(null)
  const [professionId, setProfessionId] = useState<string | null>(null)
  const [workStyle, setWorkStyle] = useState<WorkStyleKey | null>(null)
  const [yearsExp, setYearsExp] = useState<ExperienceKey | null>(null)
  const [workDays, setWorkDays] = useState<string[]>([])
  const [professions, setProfessions] = useState<ProfessionOption[]>([])

  const showWork =
    fromShoghl || (workStatus !== null && WORK_STEP_TRIGGERS.includes(workStatus))

  // قايمة المجالات بتتجاب لما الخطوة تفتح بس — مش لكل واحد بيسجّل
  useEffect(() => {
    if (!showWork || professions.length) return
    let alive = true
    getProfessions().then((list) => {
      if (alive) setProfessions(list)
    })
    return () => {
      alive = false
    }
  }, [showWork, professions.length])

  // اللي جاوب سؤال المجال في اللعبة وهو لسه مش مسجّل — إجابته مستنياه هنا
  useEffect(() => {
    const pending = takePendingProfession()
    if (!pending) return
    setProfessionId(pending)
    setWorkStatus((cur) => cur ?? 'freelancer')
  }, [])

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

  useEffect(() => {
    let alive = true
    getProfileForm()
      .then((p) => {
        if (!alive || !p) return
        setEditMode(true)
        setPhone(p.phone)
        setEmail(p.email)
        setFirstName(p.firstName)
        setBirthYear(p.birthYear)
        setGender(p.gender ?? null)
        setArea(p.area || null)
        setAreaOther(p.areaOther)
        if (p.girlsOnly) setGirlsOnly(p.girlsOnly)
        if (p.interests.length) setPicked(p.interests)
        setLevels((cur) => ({ ...cur, ...(p.levels as Record<string, SkillLevel>) }))
        if (p.budget) setBudget(p.budget)
        if (p.days.length) setPickedDays(p.days)
        setExistingAvatar(p.avatarUrl)
        setAgreeRules(p.agreedRules)
        setAgreeData(p.agreedData)
      })
      .finally(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])

  // وضع التعديل: أعمدة الشغل بتتملى من الملف زي باقي الحقول
  useEffect(() => {
    let alive = true
    getMyWorkProfile().then((w) => {
      if (!alive || !w) return
      if (w.workStatus) setWorkStatus(w.workStatus)
      if (w.professionId) setProfessionId((cur) => cur ?? w.professionId)
      if (w.workStyle) setWorkStyle(w.workStyle)
      if (w.yearsExperience) setYearsExp(w.yearsExperience)
      if (w.workDays.length) setWorkDays(w.workDays)
    })
    return () => {
      alive = false
    }
  }, [])

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
        : s.length < lists.maxInterests
          ? [...s, label]
          : s
    )

  const toggleDay = (d: string) =>
    setPickedDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]))

  const toggleWorkDay = (d: string) =>
    setWorkDays((s) => (s.includes(d) ? s.filter((x) => x !== d) : [...s, d]))

  const submit = async () => {
    const e: Record<string, string> = {}
    const digits = phone.replace(/\D/g, '')

    if (digits.length < 11) e.phone = t('join.label.25')
    if (!email.includes('@')) e.email = t('join.label.22')
    if (!editMode && password.length < 6) e.password = t('join.err.passwordShort')
    if (!firstName.trim()) e.firstName = t('join.label.21')
    const y = Number(birthYear)
    if (!y || y < 1950 || y > MAX_BIRTH_YEAR) e.birthYear = t('join.label.20')
    if (!gender) e.gender = t('join.label.19')
    if (!area) e.area = t('join.label.18')
    else if (area === 'غير كده' && !areaOther.trim()) e.areaOther = t('join.err.areaOther')
    // الصورة إجبارية — الكابتن بيعرف الناس بيها عند البوابة
    if (!photoFile && !existingAvatar) e.photo = t('join.err.photoRequired')
    if (picked.length !== lists.maxInterests) e.interests = t('join.label.17')
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

    if (!editMode) {
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
      const ens = await ensureAccount(digits, auth.token)
      if (!ens.ok) {
        setSubmitting(false)
        setErrors((prev) => ({ ...prev, phone: ens.error }))
        document.querySelector('[data-err="1"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
        return
      }
    }

    await createAccount({
      phone: digits,
      email,
      firstName,
      birthYear,
      gender: gender!,
      area: area as never,
      areaOther: area === 'غير كده' ? areaOther.trim() : undefined,
      girlsOnly: gender === 'بنت' ? (girlsOnly as never) : undefined,
      interests: picked,
      levels: levels as never,
      budget: budget as never,
      days: pickedDays,
      agreedRules: agreeRules,
      agreedData: agreeData,
    })
    // أعمدة الشغل — بتتحفظ لوحدها علشان createAccount ما تعرفش عنها حاجة،
    // ولو وقعت ما تكسرش التسجيل نفسه (الحساب اتعمل خلاص).
    if (workStatus || professionId || workStyle || yearsExp || workDays.length) {
      await saveWorkProfile({
        workStatus,
        professionId,
        workStyle,
        yearsExperience: yearsExp,
        workDays,
      })
    }

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
    router.push(editMode ? '/me' : next)
  }

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-6">
      <InnerHeader back={t('join.label.14')} padded={false} />

      <h1 className="mb-0 mt-[10px] font-display text-30 font-black leading-[1.15]">
        {editMode ? t('profile.edit.title') : t('join.text.17')}
      </h1>
      {editMode ? (
        <div className="mt-1" style={{ color: 'var(--muted)' }}>{t('profile.edit.subtitle')}</div>
      ) : (
        <div className="mt-1" style={{ color: 'var(--muted)' }}>
          {t('join.bookingFor')}{' '}
          <b style={{ color: 'var(--fg)' }}>{t('join.text.16')}</b>
        </div>
      )}
      <div className="mt-2 font-body text-15" style={{ color: 'var(--muted)' }} hidden={editMode}>
        {t('join.haveAccount')}{' '}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="font-semibold underline"
          style={{ color: 'var(--fg)' }}
        >
          {t('join.loginLink')}
        </Link>
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
            hint={editMode ? t('profile.edit.phoneLocked') : undefined}
            readOnly={editMode}
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
        <div data-err={errors.password ? '1' : undefined} hidden={editMode}>
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
        {lists.areas.map((a) => (
          <ChoicePill key={a.value} selected={area === a.value} onClick={() => setArea(a.value)}>
            {a.label}
          </ChoicePill>
        ))}
      </div>
      {errors.area && (
        <div role="alert" className="mt-1 text-13 font-semibold" style={{ color: 'var(--err-text)' }}>
          {errors.area}
        </div>
      )}
      {area === 'غير كده' && (
        <div className="mt-[10px]" data-err={errors.areaOther ? '1' : undefined}>
          <Field
            value={areaOther}
            onChange={(e) => setAreaOther(e.target.value)}
            placeholder={t('join.label.areaOther')}
            aria-label={t('join.label.areaOther')}
            error={errors.areaOther}
            autoFocus
          />
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
            {lists.girlsOnly.map((o) => (
              <ChoicePill
                key={o.value}
                selected={girlsOnly === o.value}
                onClick={() => setGirlsOnly(o.value)}
                fontSize={14}
                padding="0"
                className="flex-1"
              >
                {o.label}
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
          <span className="text-14" style={{ color: 'var(--muted)' }}>{t('join.text.10')}<b style={{ color: 'var(--fg)' }}>{picked.length}/{lists.maxInterests}</b>
          </span>
        }
      />
      <div className="mt-3 flex flex-wrap gap-2" data-err={errors.interests ? '1' : undefined}>
        {lists.interests.map((opt, i) => {
          const label = opt.label
          const on = picked.includes(opt.value)
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleInterest(opt.value)}
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
        {lists.sports.map((sport) => (
          <div key={sport.value} className="flex items-center gap-2">
            <span className="w-[56px] shrink-0 font-semibold">{sport.label}</span>
            <div className="flex flex-1 gap-[6px]">
              {lists.skillLevels.map((lvl) => (
                <ChoicePill
                  key={lvl.value}
                  selected={levels[sport.value] === lvl.value}
                  onClick={() =>
                    setLevels((s) => ({ ...s, [sport.value]: lvl.value as SkillLevel }))
                  }
                  fontSize={12}
                  padding="6px 0"
                  className="min-h-[44px] flex-1"
                >
                  {lvl.label}
                </ChoicePill>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Label>{t('join.text.8')}</Label>
      <div className="mt-[6px] flex gap-[6px]">
        {lists.budgets.map((b) => (
          <ChoicePill
            key={b.value}
            selected={budget === b.value}
            onClick={() => setBudget(b.value)}
            fontSize={13}
            padding="8px 0"
            className="flex-1"
          >
            {b.label}
          </ChoicePill>
        ))}
      </div>

      <Label>{t('join.text.7')}</Label>
      <div className="mt-[6px] flex gap-[6px]" data-err={errors.days ? '1' : undefined}>
        {lists.days.map((d) => (
          <ChoicePill
            key={d.value}
            selected={pickedDays.includes(d.value)}
            onClick={() => toggleDay(d.value)}
            radius={12}
            fontSize={13}
            padding="8px 0"
            className="flex-1"
          >
            {d.label}
          </ChoicePill>
        ))}
      </div>
      {errors.days && (
        <div role="alert" className="mt-1 text-13 font-semibold" style={{ color: 'var(--err-text)' }}>
          {errors.days}
        </div>
      )}

      {/* ===== السؤال الصغير: بتشتغل إيه؟ (اختياري) ===== */}
      {/* ده اللي بيفتح خطوة الشغل — ومن غيره الخطوة ما بتظهرش لحد */}
      <Label>{t('join.work.q')}</Label>
      <div className="mt-[6px] flex flex-wrap gap-2">
        {WORK_STATUS_KEYS.map((k) => (
          <ChoicePill
            key={k}
            selected={workStatus === k}
            onClick={() => setWorkStatus((cur) => (cur === k ? null : k))}
            fontSize={14}
          >
            {t(`join.work.status.${k}`)}
          </ChoicePill>
        ))}
      </div>

      {/* ===== 4 · شغلك — بتظهر بس للي جاي من /shoghl أو قال فريلانسر ===== */}
      {showWork && (
        <>
          <Step n={4} title={t('join.work.title')} rotate={-3} />
          <div className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
            {t('join.work.hint')}
          </div>

          <Label>{t('join.work.profession')}</Label>
          {professions.length ? (
            <div className="mt-[6px] flex flex-wrap gap-2">
              {professions.map((pr) => (
                <ChoicePill
                  key={pr.id}
                  selected={professionId === pr.id}
                  onClick={() => setProfessionId((cur) => (cur === pr.id ? null : pr.id))}
                  fontSize={14}
                >
                  {pr.nameAr}
                </ChoicePill>
              ))}
            </div>
          ) : (
            <div className="mt-[6px] font-body text-14" style={{ color: 'var(--muted)' }}>
              {t('join.work.noProfessions')}
            </div>
          )}

          <Label>{t('join.work.style')}</Label>
          <div className="mt-[6px] flex gap-[6px]">
            {WORK_STYLE_KEYS.map((k) => (
              <ChoicePill
                key={k}
                selected={workStyle === k}
                onClick={() => setWorkStyle((cur) => (cur === k ? null : k))}
                fontSize={13}
                padding="8px 0"
                className="flex-1"
              >
                {t(`join.work.style.${k}`)}
              </ChoicePill>
            ))}
          </div>

          <Label>{t('join.work.experience')}</Label>
          <div className="mt-[6px] flex gap-[6px]">
            {EXPERIENCE_KEYS.map((k) => (
              <ChoicePill
                key={k}
                selected={yearsExp === k}
                onClick={() => setYearsExp((cur) => (cur === k ? null : k))}
                fontSize={12}
                padding="8px 0"
                className="flex-1"
              >
                {t(`join.work.exp.${k}`)}
              </ChoicePill>
            ))}
          </div>

          <Label>{t('join.work.days')}</Label>
          <div className="mt-[6px] flex gap-[6px]">
            {lists.days.map((d) => (
              <ChoicePill
                key={d.value}
                selected={workDays.includes(d.value)}
                onClick={() => toggleWorkDay(d.value)}
                radius={12}
                fontSize={13}
                padding="8px 0"
                className="flex-1"
              >
                {d.label}
              </ChoicePill>
            ))}
          </div>
        </>
      )}

      {/* ===== صورتك ===== */}
      <Step n={showWork ? 5 : 4} title={t('join.label.3')} rotate={3} />
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
          style={{ border: photoUrl || existingAvatar ? '3px solid var(--fg)' : '3px dashed var(--fg)', color: 'var(--fg)' }}
        >
          {photoUrl || existingAvatar ? (
            // معاينة محلية (object URL) أو الصورة المحفوظة (رابط موقّع)
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl ?? existingAvatar ?? ''} alt="" className="absolute inset-0 h-full w-full object-cover" />
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

      {/* ===== موافقتك ===== */}
      <Step n={showWork ? 6 : 5} title={t('join.label.1')} rotate={-3} />
      <div className="mt-3" data-err={errors.agree ? '1' : undefined}>
        <Checkbox checked={agreeRules} onChange={setAgreeRules} error={!!errors.agree}>
          {lists.consents.rules ?? (
            <>{t('join.text.5')}<b>{t('join.text.4')}</b></>
          )}
        </Checkbox>
        <div className="mt-[6px]">
          <Checkbox checked={agreeData} onChange={setAgreeData} error={!!errors.agree}>{lists.consents.privacy ?? t('join.text.3')}</Checkbox>
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
          <PrimaryButton size="lg" className="w-full" onClick={submit} loading={submitting} disabled={!ready && hasSupabase}>
            {editMode ? t('profile.edit.save') : t('join.text.2')}
          </PrimaryButton>
          {/* U3: كان مكتوب هنا «مفيش باسورد. رقمك هو دخولك.» وفوقه خانة باسورد
              — تناقض صريح. الدخول بقى بالإيميل والباسورد، فالسطر بيقول ده. */}
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
