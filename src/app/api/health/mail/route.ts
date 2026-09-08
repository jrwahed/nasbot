import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { mailConfigured, mailProvider, sendAuthCodeEmail, mailSender } from '@/lib/server/mailer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * فحص قناة الإيميل — للتشغيل، مش للأعضاء.
 *
 *   GET /api/health/mail
 *     بيرجّع الحالة بس (أنهي مزوّد متظبط، ومن أنهي عنوان). مفيش أسرار.
 *
 *   GET /api/health/mail?send=1&key=<CRON_SECRET>
 *     بيبعت إيميل تجربة **لعنوان المرسِل نفسه** وبيرجّع رد المزوّد كما هو —
 *     ده اللي بيقولك جيميل رفض ليه (535 كلمة مرور، 534 تحقق بخطوتين… إلخ).
 *     مقفول بالسر علشان محدش يستخدمه يزعّجك، وبيبعت لصاحب الحساب بس.
 */
export async function GET(req: Request) {
  const url = new URL(req.url)
  const status = {
    configured: mailConfigured(),
    provider: mailProvider(),
    from: mailSender(),
    whatsapp: Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
    // أنهي كوميت شغال فعلًا — Vercel بتحطه لوحدها. بيحسم «التصليح نزل ولا لأ».
    build: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'local',
  }

  if (url.searchParams.get('send') !== '1') return NextResponse.json(status)

  const secret = process.env.CRON_SECRET
  const key = url.searchParams.get('key') ?? ''
  const okKey =
    Boolean(secret) &&
    key.length === secret!.length &&
    timingSafeEqual(Buffer.from(key), Buffer.from(secret!))
  if (!okKey) return NextResponse.json({ ...status, error: 'المفتاح مش صح' }, { status: 401 })

  if (!status.configured) {
    return NextResponse.json({ ...status, error: 'مفيش مزوّد إيميل متظبط — راجع SMTP_* أو RESEND_API_KEY' })
  }

  // لصاحب الحساب بس — العنوان اللي في SMTP_USER أو MAIL_FROM
  const to = process.env.SMTP_USER || extractAddress(status.from)
  if (!to) return NextResponse.json({ ...status, error: 'مش عارف أبعت لمين — حط SMTP_USER أو MAIL_FROM' })

  const started = Date.now()
  const r = await sendAuthCodeEmail(to, '000000')
  return NextResponse.json({
    ...status,
    test: { to, ok: r.ok, ref: r.ref, error: r.error, ms: Date.now() - started },
  })
}

function extractAddress(from: string): string | null {
  const m = from.match(/<([^>]+)>/)
  return (m ? m[1] : from).trim() || null
}
