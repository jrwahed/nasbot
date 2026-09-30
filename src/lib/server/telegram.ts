import 'server-only'
import { admin } from '@/lib/server/supabase-admin'
import { siteUrl } from '@/app/sitemap'

/**
 * إشعارات اللوحة على تليجرام (0122).
 *
 * القاعدة بتكتب كل حدث في `admin_alerts` وبتنده `/api/cron/admin-alerts` على
 * طول، ومهمة الإيميلات (كل ٥ دقايق) بتنادي نفس الدالة كاحتياطي.
 *
 * الإعداد (مرة واحدة):
 *   ١. المالك يعمل بوت من @BotFather ويحط التوكن في ڤيرسل `TELEGRAM_BOT_TOKEN`.
 *   ٢. يبعت `/start` للبوت. أول سحب بعدها بيلاقي المحادثة ويحفظها في
 *      `settings.telegram_chat_id` ويبعت «تمام».
 * ⚠ الربط بياخد **أول** محادثة تبعت /start والخانة فاضية — المالك يعملها
 *   على طول بعد ما يحط التوكن. ولربط محادثة تانية: امسح الخانة من اللوحة.
 */

const API = 'https://api.telegram.org/bot'

async function tg(token: string, method: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    description?: string
    result?: unknown
  }
  if (!res.ok || !json.ok) throw new Error(json.description || `HTTP ${res.status}`)
  return json.result
}

/** بيدوّر على آخر /start بعته حد للبوت */
async function findStartChat(token: string): Promise<string | null> {
  const updates = (await tg(token, 'getUpdates', { allowed_updates: ['message'] })) as {
    message?: { text?: string; chat?: { id: number } }
  }[]
  for (const u of [...(updates ?? [])].reverse()) {
    if (u.message?.text?.trim().startsWith('/start') && u.message.chat?.id != null) {
      return String(u.message.chat.id)
    }
  }
  return null
}

export async function runAdminAlerts(): Promise<Record<string, unknown>> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim()
  if (!token) return { telegram: 'مفيش TELEGRAM_BOT_TOKEN' }

  const db = admin()
  const { data: cfg } = await db
    .from('settings')
    .select('telegram_alerts, telegram_chat_id')
    .limit(1)
    .maybeSingle()
  const settings = cfg as { telegram_alerts: boolean; telegram_chat_id: string | null } | null
  if (!settings) return { telegram: 'الهجرة 0122 لسه ما اتلزقتش' }
  if (!settings.telegram_alerts) return { telegram: 'مقفول من اللوحة' }

  let chat = settings.telegram_chat_id
  if (!chat) {
    chat = await findStartChat(token).catch(() => null)
    if (!chat) return { telegram: 'مستني /start للبوت' }
    // `is null` علشان سحبين في نفس الوقت ما يكتبوش فوق بعض
    await db.from('settings').update({ telegram_chat_id: chat }).eq('id', true).is('telegram_chat_id', null)
    await tg(token, 'sendMessage', {
      chat_id: chat,
      text: '✅ تمام — إشعارات نسبوط هتوصل هنا من دلوقتي.',
    }).catch(() => null)
  }

  const { data: rows, error } = await db.rpc('fn_claim_admin_alerts', { p_limit: 30 })
  if (error) return { telegram: `مقدرناش نسحب الطابور: ${error.message}` }

  const site = siteUrl()
  let sent = 0
  let failed = 0
  for (const a of (rows ?? []) as { id: number; body: string; path: string | null }[]) {
    try {
      await tg(token, 'sendMessage', {
        chat_id: chat,
        text: a.path ? `${a.body}\n\n${site}${a.path}` : a.body,
        disable_web_page_preview: true,
      })
      await db.from('admin_alerts').update({ sent_at: new Date().toISOString(), last_error: null }).eq('id', a.id)
      sent++
    } catch (e) {
      await db
        .from('admin_alerts')
        .update({ last_error: e instanceof Error ? e.message : String(e) })
        .eq('id', a.id)
      failed++
    }
  }
  return { telegram: { sent, failed } }
}
