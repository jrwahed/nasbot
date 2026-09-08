'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { InnerHeader } from '@/components/Header'
import { supabase, hasSupabase } from '@/lib/supabase'

/**
 * دخول اللوحة — خطوتين.
 *
 *   ١. رقمك  →  رمز الواتساب  →  بنفتح جلسة سوبابيس في المتصفح.
 *   ٢. كود تطبيق المصادقة  →  بنفتح جلسة اللوحة (٤ ساعات).
 *
 * لو لسه ما فعّلتش التطبيق، بتظهر خطوة التفعيل لأول مرة (السر + الرابط).
 *
 * الرسايل هنا **عامة** عن قصد: الشاشة ما بتقولش أبدًا إن الرقم ده بتاع حد
 * من الفريق ولا لأ. الحماية الحقيقية على السيرفر مش هنا.
 */

/* ------------------------------------------------------------- تنسيقات */

const CARD = 'rounded-20 p-5'
const cardStyle = { background: 'var(--surface)' }

const INPUT =
  'w-full rounded-14 px-3 py-3 font-body text-18 tracking-[0.12em] text-center'
const inputStyle = {
  background: 'var(--bg)',
  color: 'var(--fg)',
  border: '2px solid var(--line)',
}

function Btn({
  children,
  onClick,
  busy,
  disabled,
  kind = 'primary',
}: {
  children: React.ReactNode
  onClick: () => void
  busy?: boolean
  disabled?: boolean
  kind?: 'primary' | 'ghost'
}) {
  const style =
    kind === 'primary'
      ? { background: '#F4632A', color: '#14161A', border: 0 }
      : { background: 'transparent', color: 'var(--fg)', border: '2px solid var(--chip-idle-border)' }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy || disabled}
      className="min-h-[48px] w-full cursor-pointer rounded-pill px-4 font-display text-16 font-black disabled:cursor-not-allowed disabled:opacity-40"
      style={style}
    >
      {busy ? 'ثانية واحدة…' : children}
    </button>
  )
}

function Err({ children }: { children: React.ReactNode }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className="mt-3 rounded-14 px-3 py-2 font-body text-14"
      style={{ background: 'var(--bg)', color: 'var(--err-text)' }}
    >
      {children}
    </div>
  )
}

/** نص يتنسخ بضغطة — للسر ورابط otpauth */
function Copyable({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false)
  return (
    <div className="mt-3">
      <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div
        className="mt-1 flex items-start gap-2 rounded-14 p-3"
        style={{ background: 'var(--bg)', border: '2px solid var(--line)' }}
      >
        <code
          dir="ltr"
          className="grow break-all font-body text-13"
          style={{ color: 'var(--fg)' }}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value).then(
              () => {
                setDone(true)
                setTimeout(() => setDone(false), 2000)
              },
              () => {}
            )
          }}
          className="shrink-0 cursor-pointer rounded-pill px-3 py-1 font-display text-13 font-black"
          style={{ background: 'transparent', color: 'var(--fg)', border: '2px solid var(--chip-idle-border)' }}
        >
          {done ? 'اتنسخ ✓' : 'انسخ'}
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- الصفحة */

type Step = 'password' | 'totp' | 'enrol'

function LoginForm() {
  const router = useRouter()
  const search = useSearchParams()
  const next = search.get('next') ?? '/admin'

  const [step, setStep] = useState<Step>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  // بيانات التفعيل لأول مرة
  const [secret, setSecret] = useState('')
  const [uri, setUri] = useState('')

  const post = async (payload: Record<string, unknown>, path = '/api/admin/login') => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    let json: Record<string, unknown> = {}
    try {
      json = (await res.json()) as Record<string, unknown>
    } catch {
      /* رد من غير JSON — بنسيبه فاضي */
    }
    return { res, json }
  }

  /* --------------------------------------- ١ — إيميل وباسورد */

  const signIn = async () => {
    setErr('')
    if (!email.includes('@') || password.length < 6) {
      setErr('اكتب الإيميل والباسورد.')
      return
    }
    if (!hasSupabase) {
      setErr('الخدمة مش متظبطة.')
      return
    }
    setBusy(true)
    // الدخول عند سوبابيس مباشرة — الكوكيز اللي بتتكتب هي اللي الميدل وير والسيرفر بيقروا منها.
    // الرسالة عامة عن قصد: ما بتقولش الإيميل ده بتاع حد من الفريق ولا لأ.
    const { error } = await supabase().auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    setBusy(false)
    if (error) {
      setErr(error.status === 429 ? 'جربت كتير. استنى دقيقة.' : 'الدخول مظبطش.')
      return
    }
    setPassword('')
    setStep('totp')
  }

  /* ------------------------------------------- ٢ — كود التطبيق */

  const checkTotp = async () => {
    setErr('')
    if (totp.replace(/\D/g, '').length !== 6) {
      setErr('الكود ٦ أرقام.')
      return
    }
    setBusy(true)
    const { res, json } = await post({ action: 'totp', code: totp })
    setBusy(false)

    // مدير لسه ما فعّلش التطبيق → نروح للتفعيل
    if (res.ok && json.next === 'enrol') {
      setTotp('')
      await beginEnrol()
      return
    }
    if (!res.ok || !json.ok) {
      setErr(String(json.error ?? 'الدخول مظبطش.'))
      return
    }
    router.replace(next.startsWith('/admin') ? next : '/admin')
  }

  /* --------------------------------------- التفعيل لأول مرة */

  const beginEnrol = async () => {
    setErr('')
    setBusy(true)
    const { res, json } = await post({ action: 'begin' }, '/api/admin/totp')
    setBusy(false)
    if (!res.ok) {
      setErr(String(json.error ?? 'مقدرناش نبدأ التفعيل.'))
      return
    }
    setSecret(String(json.secret ?? ''))
    setUri(String(json.uri ?? ''))
    setStep('enrol')
  }

  const confirmEnrol = async () => {
    setErr('')
    if (totp.replace(/\D/g, '').length !== 6) {
      setErr('الكود ٦ أرقام.')
      return
    }
    setBusy(true)
    const { res, json } = await post({ action: 'confirm', code: totp }, '/api/admin/totp')
    setBusy(false)
    if (!res.ok || !json.ok) {
      setErr(String(json.error ?? 'الكود مش مظبوط.'))
      return
    }
    router.replace(next.startsWith('/admin') ? next : '/admin')
  }

  /* --------------------------------------------------- الرسم */

  return (
    <main className="mx-auto w-full max-w-[480px] px-5 pb-16">
      <InnerHeader back="الرئيسية" padded={false} />

      <h1 className="mb-1 mt-2 font-display text-30 font-black">دخول اللوحة</h1>
      <p className="mb-5 font-body text-15" style={{ color: 'var(--muted)' }}>
        اللوحة للفريق بس. الدخول بخطوتين: إيميلك وباسوردك، وبعدين كود من تطبيق المصادقة.
      </p>

      {step === 'password' && (
        <section className={CARD} style={cardStyle}>
          <div className="font-display text-18 font-black">١ — إيميلك وباسوردك</div>
          <p className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
            نفس حسابك في الموقع.
          </p>
          <input
            dir="ltr"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && signIn()}
            placeholder="you@example.com"
            className={`${INPUT} mt-3`}
            style={inputStyle}
          />
          <input
            dir="ltr"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && signIn()}
            placeholder="••••••••"
            className={`${INPUT} mt-2`}
            style={inputStyle}
          />
          <Err>{err}</Err>
          <div className="mt-4">
            <Btn onClick={signIn} busy={busy}>
              كمّل
            </Btn>
          </div>
        </section>
      )}

      {step === 'totp' && (
        <section className={CARD} style={cardStyle}>
          <div className="font-display text-18 font-black">٢ — كود التطبيق</div>
          <p className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
            افتح تطبيق المصادقة وهات الكود الظاهر دلوقتي.
          </p>
          <input
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && checkTotp()}
            placeholder="••••••"
            className={`${INPUT} mt-3`}
            style={inputStyle}
          />
          <Err>{err}</Err>
          <div className="mt-4">
            <Btn onClick={checkTotp} busy={busy}>
              ادخل
            </Btn>
          </div>
        </section>
      )}

      {step === 'enrol' && (
        <section className={CARD} style={cardStyle}>
          <div className="font-display text-18 font-black">تفعيل التطبيق — أول مرة بس</div>
          <p className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
            نزّل أي تطبيق مصادقة (Google Authenticator أو Aegis أو 1Password)،
            وضيف حساب جديد بالسر ده. لو التطبيق بيقبل رابط، الصق الرابط على طول.
          </p>

          {secret && <Copyable label="السر" value={secret} />}
          {uri && <Copyable label="الرابط" value={uri} />}

          <p className="mt-4 font-body text-14" style={{ color: 'var(--muted)' }}>
            بعد ما تضيفه، اكتب الكود اللي ظهر علشان نتأكد إنه شغال.
            من غير الخطوة دي مش هيتفعّل.
          </p>

          <input
            dir="ltr"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            value={totp}
            onChange={(e) => setTotp(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && confirmEnrol()}
            placeholder="••••••"
            className={`${INPUT} mt-3`}
            style={inputStyle}
          />
          <Err>{err}</Err>
          <div className="mt-4">
            <Btn onClick={confirmEnrol} busy={busy}>
              فعّل وادخل
            </Btn>
          </div>

          <p className="mt-4 font-body text-13" style={{ color: 'var(--muted)' }}>
            احتفظ بالسر في مكان آمن. لو ضاع منك التطبيق، مفيش تصفير من الشاشة دي —
            لازم حد تاني من الفريق يظبطه من القاعدة.
          </p>
        </section>
      )}

      <p className="mt-6 font-body text-14" style={{ color: 'var(--muted)' }}>
        مش من الفريق؟{' '}
        <Link href="/" className="underline" style={{ color: 'var(--accent-text)' }}>
          ارجع للرئيسية
        </Link>
      </p>
    </main>
  )
}

export default function AdminLoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-[480px] px-5">
          <div className="pt-8 font-body text-16" style={{ color: 'var(--muted)' }}>
            ثانية واحدة…
          </div>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
