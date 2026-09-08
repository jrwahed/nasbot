'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { Field } from '@/components/Field'
import { PrimaryButton } from '@/components/Buttons'
import { signIn, loadSessionFromProfile, type AuthFail } from '@/lib/api'
import { useT } from '@/components/CopyProvider'

/**
 * تسجيل الدخول — للي عنده حساب. إيميل + باسورد عند سوبابيس مباشرة.
 * التسجيل الجديد في /join؛ من هنا لينك له بنفس `next` علشان يرجع لمكانه بعد التسجيل.
 */

const ERR: Record<AuthFail, string> = {
  wrongPassword: 'login.err.wrong',
  weakPassword: 'login.err.wrong',
  invalidEmail: 'join.err.invalidEmail',
  rateLimited: 'join.err.rateLimited',
  notConfirmed: 'join.err.notConfirmed',
  disabled: 'join.err.disabled',
  unknown: 'login.err.auth',
}

/** المسار الداخلي بس — مش أي URL كامل */
const safeNext = (n: string | null) => (n && n.startsWith('/') && !n.startsWith('//') ? n : '/me')

function LoginForm() {
  const t = useT()
  const router = useRouter()
  const search = useSearchParams()
  const next = safeNext(search.get('next'))

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const submit = async () => {
    const e: { email?: string; password?: string } = {}
    if (!email.includes('@')) e.email = t('join.label.22')
    if (!password) e.password = t('join.err.passwordShort')
    setErrors(e)
    if (e.email || e.password) return

    setBusy(true)
    const r = await signIn(email.trim().toLowerCase(), password)
    if (!r.ok) {
      setBusy(false)
      const detail = 'detail' in r && r.detail ? ` (${r.detail})` : ''
      setErrors({ password: t(ERR[r.code]) + detail })
      return
    }
    const ok = await loadSessionFromProfile()
    setBusy(false)
    if (!ok) {
      // دخل عند سوبابيس بس مالوش ملف — يكمّل بياناته من صفحة الانضمام
      router.push(`/join?next=${encodeURIComponent(next)}`)
      return
    }
    router.push(next)
  }

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-10">
      <InnerHeader padded={false} />

      <h1 className="mb-0 mt-[10px] font-display text-30 font-black leading-[1.15]">{t('login.title')}</h1>
      <div className="mt-1" style={{ color: 'var(--muted)' }}>{t('login.subtitle')}</div>

      <form
        className="mt-6 flex flex-col gap-[10px]"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Field
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('join.label.8')}
          aria-label={t('join.label.8')}
          error={errors.email}
        />
        <Field
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('login.password')}
          aria-label={t('login.password')}
          error={errors.password}
        />
        <div className="mt-2">
          <PrimaryButton type="submit" loading={busy} disabled={busy} className="w-full">
            {t('login.submit')}
          </PrimaryButton>
        </div>
      </form>

      <div className="mt-6 text-center font-body text-15" style={{ color: 'var(--muted)' }}>
        {t('login.new')}{' '}
        <Link
          href={`/join?next=${encodeURIComponent(next)}`}
          className="font-semibold underline"
          style={{ color: 'var(--fg)' }}
        >
          {t('login.signupLink')}
        </Link>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  )
}
