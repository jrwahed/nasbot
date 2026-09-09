import { NextResponse } from 'next/server'
import { runNotify, notifyMailConfigured } from '@/lib/server/notify'

export const runtime = 'nodejs'
// الإرسال بياخد ثواني — نمدد المهلة زي مسار OTP
export const maxDuration = 30

/**
 * مصرف الإشعارات العام — بيتنده من pg_cron كل دقيقة (WORK_CRON.sql / DB_PLAN §6).
 * بيسحب **كل** الإشعارات المطلوبة في الطابور (booking_confirmed · group_reveal ·
 * التذكيرات · mutual_match · إشعارات الشغل …) مش الشغل بس.
 *
 * محمي بـ CRON_SECRET: لازم `x-nasbot-secret` أو `Authorization: Bearer <secret>`.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET
  const ok =
    secret &&
    (req.headers.get('x-nasbot-secret') === secret ||
      req.headers.get('authorization') === `Bearer ${secret}`)
  if (!ok) return NextResponse.json({ error: 'مش مسموح' }, { status: 401 })

  if (!notifyMailConfigured()) {
    return NextResponse.json(
      { error: 'مفيش مزوّد إيميل متظبط — راجع RESEND_API_KEY أو SMTP_HOST/SMTP_USER/SMTP_PASS' },
      { status: 503 }
    )
  }

  const res = await runNotify()
  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...res })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
