import { NextResponse } from 'next/server'
import { adminAuthResponse, requirePermission, writeAudit } from '@/lib/server/admin-auth'
import { memberBotStatus, setupMemberWebhook } from '@/lib/server/telegram-members'

export const runtime = 'nodejs'

/**
 * بوت الأعضاء من `/admin/settings`:
 *   { action: 'status' } ← `settings.view` — شغّال؟ كام متوصّل؟
 *   { action: 'setup' }  ← `settings.edit` — بيربط الـwebhook بالموقع (مرة واحدة
 *                          بعد ما التوكن يتحط في ڤيرسل، أو لو الدومين اتغيّر).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: string }
  const setup = body.action === 'setup'

  let me
  try {
    me = await requirePermission(req, setup ? 'settings.edit' : 'settings.view')
  } catch (e) {
    return adminAuthResponse(e)
  }

  try {
    if (setup) {
      const res = await setupMemberWebhook()
      await writeAudit({
        actorId: me.profileId,
        action: 'member_bot_setup',
        entity: 'settings',
        after: { url: res.url, username: res.username },
      }).catch(() => false)
      return NextResponse.json({ ok: true, ...res })
    }
    return NextResponse.json({ ok: true, ...(await memberBotStatus()) })
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    )
  }
}
