import { NextResponse } from 'next/server'
import { runMemberTelegram } from '@/lib/server/telegram-members'

export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * إعلانات بوت الأعضاء — بينده من القاعدة أول ما خروجة تنزل
 * (`fn_member_tg_announce` في 0128). محمي بـ CRON_SECRET زي `/api/cron/notify`.
 */
async function handle(req: Request) {
  const secret = process.env.CRON_SECRET
  const ok =
    secret &&
    (req.headers.get('x-nasbot-secret') === secret ||
      req.headers.get('authorization') === `Bearer ${secret}`)
  if (!ok) return NextResponse.json({ error: 'مش مسموح' }, { status: 401 })
  const res = await runMemberTelegram()
  return NextResponse.json({ ok: true, at: new Date().toISOString(), ...res })
}

export async function GET(req: Request) {
  return handle(req)
}
export async function POST(req: Request) {
  return handle(req)
}
