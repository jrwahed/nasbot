import 'server-only'
import { createHash, timingSafeEqual } from 'node:crypto'
import { admin } from '@/lib/server/supabase-admin'
import { getCopy } from '@/lib/copy'
import { siteUrl } from '@/app/sitemap'
import { sbotaLink } from '@/lib/sbota-link'

/**
 * بوت تليجرام للأعضاء (0128) — «أول ما خروجة تنزل، تعرف».
 *
 * ⚠ بوت **تاني** غير بوت المالك (`telegram.ts`): التوكن في ڤيرسل
 *   `TELEGRAM_MEMBER_BOT_TOKEN`. بوت المالك بيوصّل بيانات الناس والفلوس.
 *
 * الربط: `/me` ← `fn_tg_link_token()` ← `t.me/<البوت>?start=<التوكن>` ←
 * تليجرام بيبعت `/start <التوكن>` لـ`/api/telegram/member` (webhook) ←
 * `fn_tg_member_link` بمفتاح الخدمة.
 *
 * الإعلان: محفّز على `sbotat` بيحط سطر في `member_tg_outbox` وبينده
 * `/api/cron/member-telegram` ← `runMemberTelegram()` بتبعت لكل متوصّل.
 *
 * كل النصوص من `copy_strings` (`tgbot.*`) — بتتعدّل من «النصوص» في اللوحة.
 */

const API = 'https://api.telegram.org/bot'

export const memberBotToken = () => process.env.TELEGRAM_MEMBER_BOT_TOKEN?.trim() || ''

class TgError extends Error {
  constructor(
    message: string,
    public code: number
  ) {
    super(message)
  }
}

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
    error_code?: number
    result?: unknown
  }
  if (!res.ok || !json.ok) {
    throw new TgError(json.description || `HTTP ${res.status}`, json.error_code ?? res.status)
  }
  return json.result
}

/** `{{x}}` ← القيمة. نفس شكل `t()` في الواجهة. */
function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? '')
}

async function copyOf(key: string, vars: Record<string, string> = {}): Promise<string> {
  const copy = await getCopy()
  return fill((copy[key] ?? '').replace(/\r\n?/g, '\n'), vars)
}

/**
 * سر الـwebhook — متشتق من توكن البوت و`CRON_SECRET` فمش محتاج متغيّر تالت.
 * تليجرام بيبعته في `X-Telegram-Bot-Api-Secret-Token` مع كل رسالة.
 */
export function webhookSecret(token = memberBotToken()): string {
  return createHash('sha256')
    .update(`${token}:${process.env.CRON_SECRET ?? ''}:member-bot`)
    .digest('hex')
    .slice(0, 48)
}

export function webhookSecretOk(header: string | null): boolean {
  const token = memberBotToken()
  if (!token || !header) return false
  const a = Buffer.from(header)
  const b = Buffer.from(webhookSecret(token))
  return a.length === b.length && timingSafeEqual(a, b)
}

/* ---------------------------------------------------------- اسم البوت */

let cachedName: { name: string | null; at: number } | null = null

/** يوزرنيم البوت (من غير @) — من `getMe`، بيتكاش ساعة. null لو مفيش توكن. */
export async function memberBotUsername(): Promise<string | null> {
  const token = memberBotToken()
  if (!token) return null
  if (cachedName && Date.now() - cachedName.at < 60 * 60 * 1000) return cachedName.name
  try {
    const me = (await tg(token, 'getMe', {})) as { username?: string }
    cachedName = { name: me.username ?? null, at: Date.now() }
  } catch {
    cachedName = { name: null, at: Date.now() - 55 * 60 * 1000 } // جرّب تاني بعد ٥ دقايق
  }
  return cachedName.name
}

/* ---------------------------------------------------------- الإعداد (من اللوحة) */

export async function setupMemberWebhook(): Promise<{ username: string | null; url: string }> {
  const token = memberBotToken()
  if (!token) throw new Error('مفيش TELEGRAM_MEMBER_BOT_TOKEN في ڤيرسل')
  const url = `${siteUrl()}/api/telegram/member`
  await tg(token, 'setWebhook', {
    url,
    secret_token: webhookSecret(token),
    allowed_updates: ['message'],
    drop_pending_updates: true,
  })
  cachedName = null
  return { username: await memberBotUsername(), url }
}

export async function memberBotStatus(): Promise<Record<string, unknown>> {
  const token = memberBotToken()
  const db = admin()
  const [{ count: linked }, { count: active }] = await Promise.all([
    db.from('member_telegram').select('profile_id', { count: 'exact', head: true }).not('chat_id', 'is', null),
    db
      .from('member_telegram')
      .select('profile_id', { count: 'exact', head: true })
      .not('chat_id', 'is', null)
      .eq('news', true),
  ])
  if (!token) return { configured: false, linked: linked ?? 0, active: active ?? 0 }
  const info = (await tg(token, 'getWebhookInfo', {}).catch(() => null)) as {
    url?: string
    last_error_message?: string
    pending_update_count?: number
  } | null
  return {
    configured: true,
    username: await memberBotUsername(),
    webhook: info?.url || null,
    webhookOk: info?.url === `${siteUrl()}/api/telegram/member`,
    lastError: info?.last_error_message || null,
    linked: linked ?? 0,
    active: active ?? 0,
  }
}

/* ---------------------------------------------------------- الرسايل الجاية من الأعضاء */

interface TgUpdate {
  message?: {
    text?: string
    chat?: { id: number; type?: string }
    from?: { username?: string }
  }
}

export async function handleMemberUpdate(update: TgUpdate): Promise<void> {
  const token = memberBotToken()
  const msg = update.message
  const chat = msg?.chat
  if (!token || !msg || !chat || chat.type !== 'private') return

  const text = (msg.text ?? '').trim()
  const db = admin()
  const reply = (body: string) =>
    tg(token, 'sendMessage', { chat_id: chat.id, text: body, disable_web_page_preview: true }).catch(
      () => null
    )

  if (text.startsWith('/start')) {
    const arg = text.slice(6).trim()
    if (/^[0-9a-f]{24}$/.test(arg)) {
      const { data: name } = await db.rpc('fn_tg_member_link', {
        p_token: arg,
        p_chat: chat.id,
        p_username: msg.from?.username ?? null,
      })
      if (typeof name === 'string') {
        await reply(await copyOf('tgbot.linked', { name: name || '' }))
        return
      }
    }
    // من غير توكن (أو توكن غلط): لو المحادثة متوصّلة أصلًا نرجّع الرسايل
    const { data: known } = await db.rpc('fn_tg_member_news', { p_chat: chat.id, p_on: true })
    await reply(
      known === true
        ? await copyOf('tgbot.resumed')
        : await copyOf('tgbot.unknown', { link: `${siteUrl()}/me` })
    )
    return
  }

  if (text.startsWith('/stop')) {
    await db.rpc('fn_tg_member_news', { p_chat: chat.id, p_on: false })
    await reply(await copyOf('tgbot.stopped'))
    return
  }

  await reply(await copyOf('tgbot.help'))
}

/* ---------------------------------------------------------- الإعلانات */

/** «السبت ٣ أكتوبر · ٧ بالليل» بتوقيت القاهرة */
function niceWhen(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ar-EG', {
      timeZone: 'Africa/Cairo',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runMemberTelegram(): Promise<Record<string, unknown>> {
  const token = memberBotToken()
  if (!token) return { members_tg: 'مفيش TELEGRAM_MEMBER_BOT_TOKEN' }

  const db = admin()
  const { data: cfg } = await db.from('settings').select('telegram_members').limit(1).maybeSingle()
  const settings = cfg as { telegram_members: boolean } | null
  if (!settings) return { members_tg: 'الهجرة 0128 لسه ما اتلزقتش' }
  if (!settings.telegram_members) return { members_tg: 'مقفول من اللوحة' }

  const { data: rows, error } = await db.rpc('fn_claim_member_tg', { p_limit: 3 })
  if (error) return { members_tg: `مقدرناش نسحب الطابور: ${error.message}` }
  const jobs = (rows ?? []) as { id: number; sbota_id: string; kind: 'proposed' | 'open' }[]
  if (!jobs.length) return { members_tg: { sent: 0 } }

  // كل المتوصّلين اللي ما وقّفوش — من غير الممسوحين والمحظورين
  const { data: subs } = await db
    .from('member_telegram')
    .select('chat_id, profiles!inner(deleted_at, banned_at)')
    .not('chat_id', 'is', null)
    .eq('news', true)
    .is('profiles.deleted_at', null)
    .is('profiles.banned_at', null)
  const chats = ((subs ?? []) as { chat_id: number }[]).map((s) => s.chat_id)

  const site = siteUrl()
  let sent = 0
  let failed = 0
  for (const job of jobs) {
    const { data: s } = await db
      .from('sbotat_public')
      .select('id, slug, name_ar, starts_at, status, area_label_ar')
      .eq('id', job.sbota_id)
      .maybeSingle()
    const row = s as {
      id: string
      slug: string
      name_ar: string
      starts_at: string
      status: string
      area_label_ar: string | null
    } | null

    // الخروجة اتلغت أو اتقلبت مسودة أو ميعادها عدّى قبل ما نبعت — مفيش إعلان
    if (!row || row.status !== job.kind || new Date(row.starts_at).getTime() <= Date.now()) {
      await db
        .from('member_tg_outbox')
        .update({ sent_at: new Date().toISOString(), sent_count: 0, last_error: 'الحالة اتغيّرت قبل الإرسال' })
        .eq('id', job.id)
      continue
    }

    const area = row.area_label_ar?.trim() ? ` · ${row.area_label_ar.trim()}` : ''
    const text = await copyOf(job.kind === 'proposed' ? 'tgbot.new.proposed' : 'tgbot.new.open', {
      name: row.name_ar,
      when: niceWhen(row.starts_at),
      area,
    })
    const url = `${site}/s/${sbotaLink(row.slug, row.id)}`
    const btn = (await copyOf('tgbot.btn')) || '↗'

    let ok = 0
    for (const chat of chats) {
      try {
        await tg(token, 'sendMessage', {
          chat_id: chat,
          text,
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: [[{ text: btn, url }]] },
        })
        ok++
      } catch (e) {
        failed++
        // العضو بلّك البوت أو مسح المحادثة — نوقّف الرسايل له
        if (e instanceof TgError && e.code === 403) {
          await db.rpc('fn_tg_member_news', { p_chat: chat, p_on: false })
        }
      }
      await sleep(40) // تليجرام: ~٣٠ رسالة في الثانية
    }
    sent += ok
    await db
      .from('member_tg_outbox')
      .update({ sent_at: new Date().toISOString(), sent_count: ok, last_error: null })
      .eq('id', job.id)
  }
  return { members_tg: { sent, failed, jobs: jobs.length } }
}
