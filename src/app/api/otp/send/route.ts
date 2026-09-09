import { NextResponse } from 'next/server'
import { randomInt } from 'node:crypto'
import { admin, normalizePhone } from '@/lib/server/supabase-admin'
import { codeHash, deliverCode, resolveEmail, OTP_TTL_MS, otpLimits, rateOk, ipKey } from '@/lib/server/otp'

export const runtime = 'nodejs'
// إرسال SMTP بياخد ثواني — الافتراضي على Vercel Hobby 10 ثواني وده على الحافة
export const maxDuration = 30

/** أرقام الاختبار — بتقبل 1234، وفي غير الإنتاج بس */
function isTestPhone(phone: string) {
  if (process.env.NODE_ENV === 'production') return false
  const list = (process.env.TEST_PHONE_ALLOWLIST ?? '').split(',').map((s) => s.trim())
  return list.includes(phone)
}

export async function POST(req: Request) {
  let phone: string
  let submittedEmail: unknown
  try {
    const body = await req.json()
    const norm = normalizePhone(String(body.phone ?? ''))
    if (!norm) {
      return NextResponse.json({ error: 'الرقم ده مش شكله صح' }, { status: 400 })
    }
    phone = norm
    submittedEmail = body.email
  } catch {
    return NextResponse.json({ error: 'طلب مش مفهوم' }, { status: 400 })
  }

  const db = admin()

  // الإيميل اللي الرمز هيروح عليه — راجع resolveEmail لقواعد الربط بالرقم
  const target = await resolveEmail(db, phone, submittedEmail)
  if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })

  const limits = await otpLimits(db)

  // حد المعدل على الجهاز — الحد بالرقم لوحده مكانش بيكفي: مهاجم معاه ألف
  // رقم كان بياخد ألف نصيب من نفس الجهاز (S7).
  if (!(await rateOk(db, ipKey('otp_send', req), limits.ipSendsPerHour))) {
    return NextResponse.json(
      { error: 'طلبات كتير من الجهاز ده. استنى شوية.' },
      { status: 429 }
    )
  }

  // حد المعدل لكل رقم — الرقم بييجي من الطلب فالعدّاد على otp_codes نفسه
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await db
    .from('otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', hourAgo)

  if ((count ?? 0) >= limits.sendsPerHour) {
    return NextResponse.json(
      { error: 'بعتنالك الرمز كذا مرة. استنى شوية وجرب تاني.' },
      { status: 429 }
    )
  }

  const code = isTestPhone(phone) ? '1234' : String(randomInt(100000, 999999))

  const { error } = await db.from('otp_codes').insert({
    phone,
    code_hash: codeHash(code, phone, target.email),
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString(),
  })
  if (error) {
    return NextResponse.json({ error: 'حصلت مشكلة. جرب تاني.' }, { status: 500 })
  }

  const sent = await deliverCode(phone, target.email, code)
  if (!sent.ok) {
    return NextResponse.json({ error: sent.error ?? 'مقدرناش نبعت الرمز دلوقتي' }, { status: 503 })
  }

  // ⚠ الرمز نفسه ما بيرجعش للعميل أبدًا. القناة بترجع علشان الصفحة تقول «على إيميلك».
  // الإيميل بيرجع مقنّع — كفاية يعرف هو أنهي حساب، من غير ما يكشف عنوان حد تاني.
  return NextResponse.json({ ok: true, channel: sent.channel, to: mask(target.email) })
}

/** a***@gmail.com */
function mask(email: string): string {
  const [user, domain] = email.split('@')
  return `${user.slice(0, 1)}***@${domain}`
}
