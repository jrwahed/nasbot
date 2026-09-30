import { NextResponse } from 'next/server'
import { runAdminAlerts } from '@/lib/server/telegram'

export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * إشعارات اللوحة على تليجرام — بينده من القاعدة أول ما حدث يحصل
 * (`fn_admin_alert` في 0122). محمي بـ CRON_SECRET زي `/api/cron/notify`.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET
  const ok =
    secret &&
    (req.headers.get('x-nasbot-secret') === secret ||
      req.headers.get('authorization') === `Bearer ${secret}`)
  if (!ok) return NextResponse.json({ error: 'مش مسموح' }, { status: 401 })
  const res = await runAdminAlerts()
  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...res })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
