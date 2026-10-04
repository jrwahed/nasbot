import { NextResponse } from 'next/server'
import {
  handleMemberUpdate,
  memberBotUsername,
  webhookSecretOk,
} from '@/lib/server/telegram-members'

export const runtime = 'nodejs'
export const maxDuration = 20

/**
 * بوت الأعضاء (0128).
 *
 * GET  ← يوزرنيم البوت لكرت «وصّلني على تليجرام» في `/me`. null = الكرت بيختفي.
 * POST ← الـwebhook: تليجرام بيبعت هنا كل رسالة للبوت، ومعاها
 *        `X-Telegram-Bot-Api-Secret-Token` اللي اتحط وقت «شغّل بوت الأعضاء».
 *        من غيره = مش تليجرام = 401.
 */
export async function GET() {
  const username = await memberBotUsername()
  return NextResponse.json(
    { username },
    { headers: { 'cache-control': 'public, s-maxage=300, stale-while-revalidate=600' } }
  )
}

export async function POST(req: Request) {
  if (!webhookSecretOk(req.headers.get('x-telegram-bot-api-secret-token'))) {
    return NextResponse.json({ error: 'مش مسموح' }, { status: 401 })
  }
  const update = await req.json().catch(() => null)
  // دايمًا 200 — لو رجّعنا غلط تليجرام بيعيد نفس الرسالة تاني وتالت
  if (update) await handleMemberUpdate(update).catch(() => null)
  return NextResponse.json({ ok: true })
}
