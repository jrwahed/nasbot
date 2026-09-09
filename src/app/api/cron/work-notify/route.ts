import { NextResponse } from 'next/server'
import { runWorkNotify, notifyMailConfigured } from '@/lib/server/notify'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * مصرف إشعارات الشغل.
 *
 * المهام والمحفّزات في القاعدة بتكتب في `notifications` بقناة واتساب،
 * وواتساب لسه مقفول — فالصفوف بتقف. المسار ده بياخد لحد 20 صف
 * `work_*` واقفين ويبعتهم إيميل ويقفلهم.
 *
 * الحماية: نفس فحص `CRON_SECRET` بتاع /api/copy/revalidate بالحرف.
 * الجدولة: RUNBOOK §15 — pg_cron جوه سوبابيس بـ net.http_post.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET
  // نفس فحص /api/copy/revalidate. الشكل التاني (Authorization: Bearer)
  // موجود لأن Vercel Cron ما بيعرفش يبعت هيدر باسم من عندنا — نفس السر
  // بالظبط، مش سر تاني.
  const ok =
    Boolean(secret) &&
    (req.headers.get('x-nasbot-secret') === secret ||
      req.headers.get('authorization') === `Bearer ${secret}`)
  if (!ok) {
    return NextResponse.json({ error: 'مش مسموح' }, { status: 401 })
  }

  if (!notifyMailConfigured()) {
    return NextResponse.json(
      { error: 'مفيش مزوّد إيميل متظبط — راجع SMTP_HOST/SMTP_USER/SMTP_PASS' },
      { status: 503 }
    )
  }

  const res = await runWorkNotify()
  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...res })
}

export async function GET(req: Request) {
  return handle(req)
}

export async function POST(req: Request) {
  return handle(req)
}
