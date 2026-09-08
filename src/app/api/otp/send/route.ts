import { NextResponse } from 'next/server'
import { createHash, randomInt } from 'node:crypto'
import { admin, normalizePhone } from '@/lib/server/supabase-admin'
import { sendAuthCode, sendSms } from '@/lib/server/whatsapp'

export const runtime = 'nodejs'

const hash = (code: string, phone: string) =>
  createHash('sha256').update(`${code}:${phone}:${process.env.CRON_SECRET ?? 'nasbot'}`).digest('hex')

/** أرقام الاختبار — بتقبل 1234، وفي غير الإنتاج بس */
function isTestPhone(phone: string) {
  if (process.env.NODE_ENV === 'production') return false
  const list = (process.env.TEST_PHONE_ALLOWLIST ?? '').split(',').map((s) => s.trim())
  return list.includes(phone)
}

export async function POST(req: Request) {
  let phone: string
  try {
    const body = await req.json()
    const norm = normalizePhone(String(body.phone ?? ''))
    if (!norm) {
      return NextResponse.json({ error: 'الرقم ده مش شكله صح' }, { status: 400 })
    }
    phone = norm
  } catch {
    return NextResponse.json({ error: 'طلب مش مفهوم' }, { status: 400 })
  }

  const db = admin()

  // حد المعدل: 3 إرسالات في الساعة لكل رقم
  const hourAgo = new Date(Date.now() - 3600_000).toISOString()
  const { count } = await db
    .from('otp_codes')
    .select('id', { count: 'exact', head: true })
    .eq('phone', phone)
    .gte('created_at', hourAgo)

  if ((count ?? 0) >= 3) {
    return NextResponse.json(
      { error: 'بعتنالك الرمز كذا مرة. استنى شوية وجرب تاني.' },
      { status: 429 }
    )
  }

  const code = isTestPhone(phone) ? '1234' : String(randomInt(100000, 999999))

  const { error } = await db.from('otp_codes').insert({
    phone,
    code_hash: hash(code, phone),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  })
  if (error) {
    return NextResponse.json({ error: 'حصلت مشكلة. جرب تاني.' }, { status: 500 })
  }

  let sent = await sendAuthCode(phone, code)
  if (!sent.ok) {
    // البديل: رسالة نصية
    sent = await sendSms(phone, `رمزك في نسبوط: ${code}`)
  }

  if (!sent.ok) {
    return NextResponse.json({ error: 'مقدرناش نبعت الرمز دلوقتي' }, { status: 502 })
  }

  // ⚠ الرمز نفسه ما بيرجعش للعميل أبدًا
  return NextResponse.json({ ok: true })
}
