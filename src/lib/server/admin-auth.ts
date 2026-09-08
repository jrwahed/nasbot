import 'server-only'

import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServerClient, parseCookieHeader } from '@supabase/ssr'
import { admin } from '@/lib/server/supabase-admin'

/* ==========================================================================
 *
 *  حدود اللوحة — الطبقة الحقيقية للتحقق من صلاحيات الإدارة.
 *
 *  ┌──────────────────────────────────────────────────────────────────────┐
 *  │  العقد: **كل** Server Action أو مسار API إداري لازم يبدأ بالسطر ده:  │
 *  │                                                                      │
 *  │      const me = await requirePermission(req, 'payments.refund')      │
 *  │                                                                      │
 *  │  الدالة **بترمي** AdminAuthError لو أي شرط اتكسر — يعني لو حد نسي    │
 *  │  يتحقق من النتيجة، الطلب بيقع بدل ما يعدّي. الفشل مقفول بطبعه.       │
 *  │                                                                      │
 *  │  للرد المنظم:                                                        │
 *  │      try { … } catch (e) { return adminAuthResponse(e) }             │
 *  └──────────────────────────────────────────────────────────────────────┘
 *
 *  بتتأكد من ٦ حاجات مع بعض، وكلها لازم تعدّي:
 *
 *   1. جلسة سوبابيس موجودة في الكوكيز وصالحة (getUser بيتحقق منها على السيرفر).
 *   2. كوكي جلسة اللوحة (nb_admin) موجود، وهاشه موجود في admin_sessions.
 *   3. صف admin_sessions مش ملغي، ولسه في مدته (٤ ساعات)، والخمول أقل من ٣٠ دقيقة.
 *   4. صف admin_users نشط، و profile_id بتاعه = صاحب جلسة سوبابيس.
 *      (الربط ده مهم: كوكي لوحة مسروق لوحده مش كفاية، ولا جلسة عضو لوحدها.)
 *   5. الدور بتاعه فيه الصلاحية المطلوبة في role_permissions.
 *   6. لو الطلب جاي من أصل تاني (Origin) — يترفض. حماية من CSRF.
 *
 *  ملاحظة: ده **مش** بديل عن RLS. الاتنين مع بعض:
 *  RLS بيحمي القاعدة، و requirePermission بيحمي الأفعال اللي بتعدّي بمفتاح الخدمة.
 *
 * ========================================================================== */

/* ------------------------------------------------------------------ ثوابت */

/** اسم كوكي جلسة اللوحة — قيمة عشوائية، والهاش بس اللي متخزن في القاعدة */
export const ADMIN_COOKIE = 'nb_admin'

/** عمر جلسة اللوحة: ٤ ساعات (ADMIN_PLAN §5) */
export const ADMIN_SESSION_MS = 4 * 60 * 60 * 1000

/** الخمول المسموح: ٣٠ دقيقة من غير أي طلب (ADMIN_PLAN §5) */
export const ADMIN_IDLE_MS = 30 * 60 * 1000

/** الكيان اللي بنسجّل تحته محاولات الدخول في audit_log — بيستخدم لحد المعدل */
const LOGIN_ENTITY = 'admin_login'

/** نافذة حد المعدل */
const RL_WINDOW_MS = 15 * 60 * 1000
/** أقصى محاولات فاشلة للرقم الواحد في النافذة */
const RL_MAX_PER_PHONE = 5
/** أقصى محاولات (ناجحة أو فاشلة) للـ IP الواحد في النافذة */
const RL_MAX_PER_IP = 20

/**
 * سر السيرفر اللي بنشتق بيه هاش الرقم في سجل المحاولات.
 * SHA-256 لوحده على رقم موبايل مصري بيتكسر بالتخمين في ثواني (المجال صغير)،
 * فلازم HMAC بمفتاح مش موجود في القاعدة.
 */
const pepper = () =>
  process.env.ADMIN_AUTH_PEPPER ?? process.env.CRON_SECRET ?? 'nasbot'

/* ==========================================================================
 *  TOTP — RFC 6238 (وفوقه RFC 4226 لـ HOTP)، بـ node:crypto بس.
 *
 *  https://www.rfc-editor.org/rfc/rfc6238  — TOTP: Time-Based One-Time Password
 *  https://www.rfc-editor.org/rfc/rfc4226  — HOTP: HMAC-Based One-Time Password
 *  https://www.rfc-editor.org/rfc/rfc4648#section-6 — Base32
 *
 *  مفيش أي مكتبة خارجية هنا عن قصد.
 * ========================================================================== */

/** كل خطوة ٣٠ ثانية — الافتراضي في RFC 6238 §4 واللي كل التطبيقات بتستخدمه */
export const TOTP_PERIOD_SEC = 30
/** ٦ خانات — RFC 4226 §5.3 */
export const TOTP_DIGITS = 6
/** ±خطوة واحدة لفرق الساعة — RFC 6238 §5.2 بينصح بنافذة صغيرة زي دي */
export const TOTP_WINDOW = 1

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** ترميز Base32 (RFC 4648 §6) من غير حشو `=` — ده اللي تطبيقات المصادقة بتقراه */
export function base32Encode(buf: Buffer): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of buf) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  // الباقي: بنكمّل بأصفار لليمين
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

/**
 * فك Base32. بيتجاهل المسافات والشرط والحشو، وبيقبل الحروف الصغيرة.
 * بيرمي لو في حرف مش من الأبجدية — أحسن من إننا نفك سر غلط في سكات.
 */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/[\s\-=]/g, '').toUpperCase()
  if (!clean) throw new Error('base32: فاضي')

  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32_ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error('base32: حرف مش صالح')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** سر جديد: ٢٠ بايت عشوائية = ١٦٠ بت، اللي RFC 4226 §4 R6 بينصح بيه لـ HMAC-SHA1 */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/** رقم الخطوة الزمنية الحالية — T = floor((unixtime - T0) / X)، RFC 6238 §4.2 */
export function totpStep(atMs: number = Date.now()): number {
  return Math.floor(atMs / 1000 / TOTP_PERIOD_SEC)
}

/**
 * توليد كود HOTP لخطوة معينة — RFC 4226 §5.3 (Dynamic Truncation).
 *
 *  1. العدّاد ٨ بايت big-endian.
 *  2. HMAC-SHA1(K, C) → ٢٠ بايت.
 *  3. offset = آخر ٤ بت من آخر بايت.
 *  4. ٤ بايت من عند offset، مع تصفير أعلى بت (علشان ما يبقاش سالب).
 *  5. الباقي على 10^digits، مع أصفار على الشمال.
 */
export function totpCode(secretB32: string, step: number): string {
  const key = base32Decode(secretB32)
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(step))

  const digest = createHmac('sha1', key).update(counter).digest()

  const offset = digest[digest.length - 1] & 0x0f
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff)

  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0')
}

/** مقارنة زمنها ثابت — ممنوع `===` على كود سري */
function sameCode(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export interface TotpResult {
  ok: boolean
  /** الخطوة اللي الكود طلع منها — بنستخدمها علشان نمنع إعادة استعمال نفس الكود */
  step: number | null
}

/**
 * التحقق من كود TOTP مع نافذة ±TOTP_WINDOW خطوة.
 *
 * مهم: بنلف على كل الخطوات من غير `break`، والمقارنة نفسها timingSafeEqual —
 * علشان الزمن ما يقولش حاجة عن الكود ولا عن الخطوة الصح.
 */
export function verifyTotp(
  secretB32: string,
  submitted: string,
  atMs: number = Date.now()
): TotpResult {
  const code = String(submitted ?? '').replace(/\D/g, '')
  const now = totpStep(atMs)

  let ok = false
  let step: number | null = null

  for (let d = -TOTP_WINDOW; d <= TOTP_WINDOW; d++) {
    let expected: string
    try {
      expected = totpCode(secretB32, now + d)
    } catch {
      // سر بايظ — بنكمّل اللفة علشان الزمن يفضل ثابت، والنتيجة تفضل فشل
      continue
    }
    const hit = sameCode(expected, code)
    if (hit) {
      ok = true
      step = now + d
    }
  }

  return { ok, step }
}

/**
 * رابط `otpauth://` اللي تطبيق المصادقة بيقراه.
 * بنعرضه في الواجهة كنص يتنسخ — **مفيش** كود QR من خدمة برّه،
 * لأن CSP في next.config.mjs قافل أي img-src خارجي، وكمان ده هيسرّب السر لطرف تالت.
 */
export function otpauthUri(secretB32: string, account: string, issuer = 'Nasbot'): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`
  const q = new URLSearchParams({
    secret: secretB32,
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SEC),
  })
  return `otpauth://totp/${label}?${q.toString()}`
}

/* ==========================================================================
 *  أدوات الطلب: IP، الأصل، الكوكيز، جلسة سوبابيس
 * ========================================================================== */

/**
 * عمود `ip` في القاعدة نوعه inet — لو بعتنا نص مش IP، الإدخال هيقع
 * وحد المعدل هيبوظ. فبنتأكد من الشكل هنا وبنرجّع null لو مش مظبوط.
 */
export function clientIp(req: Request): string | null {
  // ترتيب الأفضلية: ترويسة المنصة الأول (Vercel بتحطها بنفسها وصعب تتزوّر)،
  // وبعدين X-Forwarded-For. ⚠ لو الموقع اتنشر ورا بروكسي بيمرّر XFF من العميل
  // زي ما هو، الرقم ده ممكن يتزوّر — وساعتها حد المعدل بالـ IP بيبقى تقريبي.
  // حد المعدل بالرقم مش متأثر لأن الرقم بييجي من الملف مش من الطلب.
  const raw =
    req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    ''
  if (!raw) return null

  // IPv4
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(raw)) {
    return raw.split('.').every((o) => Number(o) <= 255) ? raw : null
  }
  // IPv6 — شكل مبسّط: خانات ست عشرية و`:` بس
  if (/^[0-9a-fA-F:]+$/.test(raw) && raw.includes(':') && raw.length <= 45) return raw

  return null
}

/** هاش الرقم لسجل المحاولات — HMAC علشان ما يترجعش بالتخمين */
export function phoneKey(phone: string): string {
  return createHmac('sha256', pepper()).update(phone).digest('hex')
}

/** هاش توكن جلسة اللوحة — اللي بيتخزن في admin_sessions.token_hash */
function tokenHash(token: string): string {
  return createHash('sha256').update(`${token}:${pepper()}`).digest('hex')
}

/**
 * حماية CSRF: لو المتصفح بعت Origin وكان مش نفس مضيف الطلب — نرفض.
 * الكوكي أصلاً SameSite=Strict، وده حزام تاني.
 */
function originOk(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true // طلبات same-origin كتير مش بتبعت Origin أصلاً
  try {
    const host = req.headers.get('host')
    return !!host && new URL(origin).host === host
  } catch {
    return false
  }
}

/**
 * عميل سوبابيس بيقرا جلسة المتصفح من كوكيز الطلب.
 * بيستخدم المفتاح العام بس — التحقق الحقيقي من التوكن بيحصل في getUser()
 * على سيرفر سوبابيس، مش عندنا.
 */
function supabaseFromRequest(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new AdminAuthError('config', 'الخدمة مش متظبطة', 503)

  const header = req.headers.get('cookie') ?? ''
  return createServerClient(url, key, {
    cookies: {
      getAll: () => (header ? parseCookieHeader(header) : []),
      // مسارات الـ API مش بتجدّد الكوكيز — الميدل وير وعميل المتصفح بيعملوا ده
      setAll: () => {},
    },
  })
}

/** صاحب جلسة سوبابيس الحالية من كوكيز الطلب — null لو مفيش */
export async function sessionUserId(req: Request): Promise<string | null> {
  const sb = supabaseFromRequest(req)
  const { data, error } = await sb.auth.getUser()
  if (error || !data.user) return null
  return data.user.id
}

/** قراءة كوكي جلسة اللوحة من الطلب */
function adminCookie(req: Request): string | null {
  const header = req.headers.get('cookie')
  if (!header) return null
  const hit = parseCookieHeader(header).find((c) => c.name === ADMIN_COOKIE)
  return hit?.value || null
}

/* ==========================================================================
 *  الأخطاء
 * ========================================================================== */

export type AdminAuthCode =
  | 'config'
  | 'no_session'
  | 'no_admin_session'
  | 'expired'
  | 'idle'
  | 'not_admin'
  | 'forbidden'
  | 'csrf'
  | 'rate_limited'

export class AdminAuthError extends Error {
  readonly code: AdminAuthCode
  readonly status: number
  constructor(code: AdminAuthCode, message: string, status: number) {
    super(message)
    this.name = 'AdminAuthError'
    this.code = code
    this.status = status
  }
}

/**
 * رد موحّد لأي فشل في التحقق.
 * الرسالة عامة عن قصد — ما بتقولش للمهاجم فشل فين بالظبط.
 */
export function adminAuthResponse(e: unknown): Response {
  const err = e instanceof AdminAuthError ? e : null
  const status = err?.status ?? 500
  const body =
    status === 403
      ? 'القسم ده مش من صلاحيتك.'
      : status === 401
        ? 'الجلسة خلصت. ادخل تاني.'
        : status === 429
          ? 'جربت كتير. استنى شوية.'
          : 'مش مسموح.'
  return new Response(JSON.stringify({ error: body, code: err?.code ?? 'error' }), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

/* ==========================================================================
 *  هوية المدير
 * ========================================================================== */

export interface AdminIdentity {
  /** admin_users.id */
  adminUserId: string
  /** profiles.id — نفسه auth.users.id */
  profileId: string
  roleKey: string
  /** admin_sessions.id للجلسة اللي الطلب جاي بيها */
  sessionId: string
  ip: string | null
}

interface AdminUserRow {
  id: string
  profile_id: string
  role_key: string
  is_active: boolean
  totp_secret: string | null
  totp_enabled_at: string | null
}

interface AdminSessionRow {
  id: string
  admin_user_id: string
  created_at: string
  last_seen_at: string
  expires_at: string
  revoked_at: string | null
}

/**
 * التحقق الكامل من جلسة اللوحة **من غير** فحص صلاحية معيّنة.
 * بيرمي AdminAuthError لو أي شرط اتكسر، وبيحدّث last_seen_at لو عدّى.
 */
export async function requireAdminSession(req: Request): Promise<AdminIdentity> {
  if (!originOk(req)) {
    throw new AdminAuthError('csrf', 'أصل الطلب مش مظبوط', 403)
  }

  // 1) جلسة سوبابيس (بتتأكد على سيرفر سوبابيس، مش عندنا)
  const uid = await sessionUserId(req)
  if (!uid) throw new AdminAuthError('no_session', 'مفيش جلسة', 401)

  // 2) كوكي جلسة اللوحة
  const token = adminCookie(req)
  if (!token) throw new AdminAuthError('no_admin_session', 'مفيش جلسة لوحة', 401)

  const db = admin()

  const { data: sRow, error: sErr } = await db
    .from('admin_sessions')
    .select('id, admin_user_id, created_at, last_seen_at, expires_at, revoked_at')
    .eq('token_hash', tokenHash(token))
    .maybeSingle()

  // لو الاستعلام نفسه وقع — نقفل، ما نفتحش
  if (sErr) throw new AdminAuthError('no_admin_session', 'مقدرناش نتأكد', 401)
  if (!sRow) throw new AdminAuthError('no_admin_session', 'مفيش جلسة لوحة', 401)

  const s = sRow as AdminSessionRow
  const now = Date.now()

  // 3) ملغية؟ خلصت مدتها؟ خاملة؟
  if (s.revoked_at) throw new AdminAuthError('expired', 'الجلسة اتلغت', 401)
  if (new Date(s.expires_at).getTime() <= now) {
    throw new AdminAuthError('expired', 'الجلسة خلصت', 401)
  }
  if (now - new Date(s.last_seen_at).getTime() > ADMIN_IDLE_MS) {
    // خمول: بنلغيها فعليًا علشان ما تتستخدمش تاني
    await db
      .from('admin_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', s.id)
    throw new AdminAuthError('idle', 'قعدت كتير من غير حركة', 401)
  }

  // 4) صف المدير — نشط، ومربوط بنفس صاحب جلسة سوبابيس
  const { data: aRow, error: aErr } = await db
    .from('admin_users')
    .select('id, profile_id, role_key, is_active, totp_secret, totp_enabled_at')
    .eq('id', s.admin_user_id)
    .maybeSingle()

  if (aErr) throw new AdminAuthError('not_admin', 'مقدرناش نتأكد', 401)
  const a = aRow as AdminUserRow | null

  if (!a || !a.is_active) throw new AdminAuthError('not_admin', 'مش من الفريق', 403)

  // الربط الأساسي: كوكي اللوحة لوحده مش كفاية، ولا جلسة العضو لوحدها.
  if (a.profile_id !== uid) {
    throw new AdminAuthError('not_admin', 'الجلستين مش لنفس الشخص', 403)
  }

  // TOTP لازم يكون مفعّل — ADMIN_PLAN §5: إجباري لكل الأدوار
  if (!a.totp_enabled_at || !a.totp_secret) {
    throw new AdminAuthError('not_admin', 'التحقق بخطوتين مش مفعّل', 403)
  }

  // 5) بصمة النشاط — بتحرّك عدّاد الخمول
  await db
    .from('admin_sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', s.id)

  return {
    adminUserId: a.id,
    profileId: a.profile_id,
    roleKey: a.role_key,
    sessionId: s.id,
    ip: clientIp(req),
  }
}

/**
 * ★ نقطة البداية لأي فعل إداري. ★
 *
 * بترمي AdminAuthError لو الجلسة مش صالحة أو الصلاحية مش موجودة.
 * مفيش قيمة رجوع تقول "لأ" — الفشل بيوقف الطلب، مش بيرجع flag ممكن حد ينساه.
 *
 * @example
 *   export async function POST(req: Request) {
 *     let me
 *     try { me = await requirePermission(req, 'payments.refund') }
 *     catch (e) { return adminAuthResponse(e) }
 *     …
 *   }
 */
export async function requirePermission(
  req: Request,
  key: string
): Promise<AdminIdentity> {
  const me = await requireAdminSession(req)

  const db = admin()
  const { data, error } = await db
    .from('role_permissions')
    .select('permission_key')
    .eq('role_key', me.roleKey)
    .eq('permission_key', key)
    .maybeSingle()

  // استعلام وقع = نقفل
  if (error) throw new AdminAuthError('forbidden', 'مقدرناش نتأكد', 403)
  if (!data) throw new AdminAuthError('forbidden', 'الصلاحية مش موجودة', 403)

  return me
}

/* ==========================================================================
 *  السجل (audit_log)
 * ========================================================================== */

export interface AuditEntry {
  /** profiles.id بتاع اللي عمل الفعل — null لو الفاعل لسه مش معروف */
  actorId?: string | null
  action: string
  entity: string
  /** لازم UUID — العمود في القاعدة uuid. أي حاجة تانية بتتحط null */
  entityId?: string | null
  before?: unknown
  after?: unknown
  ip?: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * كتابة سطر في audit_log.
 *
 * ما بيرميش أبدًا: فشل التسجيل ما يوقّفش الفعل نفسه — بس بيرجّع false
 * علشان اللي نداه يقدر ينبّه. (الاستثناء الوحيد: حد المعدل تحت،
 * اللي بيعتبر فشل الكتابة سبب كافي إنه يرفض.)
 */
export async function writeAudit(e: AuditEntry): Promise<boolean> {
  try {
    const { error } = await admin()
      .from('audit_log')
      .insert({
        actor_id: e.actorId && UUID_RE.test(e.actorId) ? e.actorId : null,
        action: e.action,
        entity: e.entity,
        entity_id: e.entityId && UUID_RE.test(e.entityId) ? e.entityId : null,
        before: e.before ?? null,
        after: e.after ?? null,
        ip: e.ip ?? null,
      })
    return !error
  } catch {
    return false
  }
}

/* ==========================================================================
 *  حد المعدل على الدخول
 *
 *  مفيش جدول مخصص لحد المعدل في القاعدة، وممنوع أعمل جدول جديد.
 *  فبنعدّ من `audit_log` نفسه: كل محاولة دخول بتتسجل كسطر
 *  entity='admin_login'، وبنعدّ الأسطر في آخر ربع ساعة.
 *
 *  ده دائم ومشترك بين كل نسخ السيرفر (مش ذاكرة محلية بتضيع مع كل نسخة).
 *  حدوده مذكورة في التقرير.
 * ========================================================================== */

export interface RateVerdict {
  ok: boolean
  reason?: 'phone' | 'ip' | 'error'
}

/**
 * بيتأكد إن الرقم/الـ IP لسه ماوصلش الحد.
 * **بيقفل عند الشك**: لو الاستعلام وقع، بنرجّع رفض.
 */
export async function checkLoginRate(
  phone: string | null,
  ip: string | null
): Promise<RateVerdict> {
  const db = admin()
  const since = new Date(Date.now() - RL_WINDOW_MS).toISOString()

  if (phone) {
    const { count, error } = await db
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('entity', LOGIN_ENTITY)
      .eq('action', 'admin.login.fail')
      .eq('after->>phone_key', phoneKey(phone))
      .gte('at', since)

    if (error) return { ok: false, reason: 'error' }
    if ((count ?? 0) >= RL_MAX_PER_PHONE) return { ok: false, reason: 'phone' }
  }

  if (ip) {
    const { count, error } = await db
      .from('audit_log')
      .select('id', { count: 'exact', head: true })
      .eq('entity', LOGIN_ENTITY)
      .eq('ip', ip)
      .gte('at', since)

    if (error) return { ok: false, reason: 'error' }
    if ((count ?? 0) >= RL_MAX_PER_IP) return { ok: false, reason: 'ip' }
  }

  return { ok: true }
}

/** تسجيل محاولة دخول — ده كمان اللي حد المعدل بيعدّ منه */
export async function logLoginAttempt(opts: {
  ok: boolean
  stage: 'otp' | 'totp' | 'enrol'
  phone?: string | null
  ip?: string | null
  actorId?: string | null
  /** خطوة TOTP اللي اتقبلت — بنستخدمها لمنع إعادة استعمال نفس الكود */
  step?: number | null
  note?: string
}): Promise<void> {
  await writeAudit({
    actorId: opts.actorId ?? null,
    action: opts.ok ? 'admin.login.ok' : 'admin.login.fail',
    entity: LOGIN_ENTITY,
    entityId: null,
    ip: opts.ip ?? null,
    after: {
      stage: opts.stage,
      // الرقم نفسه ما بيتخزنش — هاشه بس، علشان السجل ما يبقاش دليل أرقام
      phone_key: opts.phone ? phoneKey(opts.phone) : null,
      step: opts.step ?? null,
      note: opts.note ?? null,
    },
  })
}

/**
 * منع إعادة استعمال كود TOTP: الكود صالح ٩٠ ثانية بحكم النافذة،
 * فلو حد شافه على كتف المدير يقدر يستخدمه تاني في نفس الدقيقة.
 * بنتأكد إن الخطوة دي ما اتقبلتش قبل كده لنفس المدير.
 *
 * **بيقفل عند الشك**: استعلام واقع = نعتبره مستهلك.
 */
export async function totpStepUsed(actorId: string, step: number): Promise<boolean> {
  const since = new Date(Date.now() - (TOTP_WINDOW + 2) * TOTP_PERIOD_SEC * 1000).toISOString()
  const { count, error } = await admin()
    .from('audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('entity', LOGIN_ENTITY)
    .eq('action', 'admin.login.ok')
    .eq('actor_id', actorId)
    .eq('after->>step', String(step))
    .gte('at', since)

  if (error) return true
  return (count ?? 0) > 0
}

/* ==========================================================================
 *  إنشاء / إنهاء جلسة اللوحة
 * ========================================================================== */

export interface NewAdminSession {
  sessionId: string
  /** الهيدر الجاهز للـ Set-Cookie */
  setCookie: string
}

const secureCookie = process.env.NODE_ENV === 'production'

/**
 * إنشاء صف جلسة لوحة + الكوكي بتاعها.
 * ما بتتنادىش غير بعد ما الخطوتين (OTP + TOTP) يعدّوا.
 */
export async function createAdminSession(opts: {
  adminUserId: string
  ip: string | null
  ua: string | null
}): Promise<NewAdminSession> {
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()

  const { data, error } = await admin()
    .from('admin_sessions')
    .insert({
      admin_user_id: opts.adminUserId,
      token_hash: tokenHash(token),
      expires_at: new Date(now + ADMIN_SESSION_MS).toISOString(),
      ip: opts.ip,
      ua: opts.ua?.slice(0, 400) ?? null,
    })
    .select('id')
    .single()

  if (error || !data) throw new AdminAuthError('config', 'مقدرناش نفتح الجلسة', 500)

  const parts = [
    `${ADMIN_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(ADMIN_SESSION_MS / 1000)}`,
    secureCookie ? 'Secure' : '',
  ].filter(Boolean)

  return { sessionId: (data as { id: string }).id, setCookie: parts.join('; ') }
}

/** كوكي فاضي — للخروج أو لما الجلسة تبوظ */
export function clearAdminCookie(): string {
  return [
    `${ADMIN_COOKIE}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    secureCookie ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

/** إلغاء كل جلسات اللوحة المفتوحة لمدير — بيتنادى قبل ما نفتح جلسة جديدة */
export async function revokeAdminSessions(adminUserId: string): Promise<void> {
  await admin()
    .from('admin_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('admin_user_id', adminUserId)
    .is('revoked_at', null)
}

/**
 * صف المدير المرتبط بجلسة سوبابيس الحالية — من غير ما نطلب جلسة لوحة.
 * ده اللي مسار الدخول ومسار تفعيل TOTP بيستخدموه بعد خطوة الـ OTP.
 * بيرجّع null لو مفيش جلسة أو مش مدير — من غير ما يفرّق في الرد.
 */
export async function adminUserForSession(
  req: Request
): Promise<{ uid: string; row: AdminUserRow | null } | null> {
  const uid = await sessionUserId(req)
  if (!uid) return null

  const { data, error } = await admin()
    .from('admin_users')
    .select('id, profile_id, role_key, is_active, totp_secret, totp_enabled_at')
    .eq('profile_id', uid)
    .eq('is_active', true)
    .maybeSingle()

  if (error) return { uid, row: null }
  return { uid, row: (data as AdminUserRow | null) ?? null }
}

export type { AdminUserRow }

/* ==========================================================================
 *  فتح جلسة اللوحة بعد نجاح العاملين
 *
 *  موجودة هنا مش في ملف المسار، لأن Next بترفض أي export من route.ts
 *  غير دوال HTTP وإعداداتها — ومسارين محتاجينها (الدخول والتفعيل).
 * ========================================================================== */

/**
 * النقطة **الوحيدة** اللي بتفتح جلسة لوحة.
 * ممنوع تتنادى غير بعد ما الرقم (OTP) وكود التطبيق (TOTP) يثبتوا الاتنين.
 */
export async function openAdminSession(opts: {
  adminUserId: string
  profileId: string
  roleKey: string
  step: number | null
  phone: string | null
  ip: string | null
  ua: string | null
  stage: 'totp' | 'enrol'
}): Promise<Response> {
  // جلسة جديدة = القديمة تتقفل. أي كوكي قديم بيموت هنا.
  await revokeAdminSessions(opts.adminUserId)

  const session = await createAdminSession({
    adminUserId: opts.adminUserId,
    ip: opts.ip,
    ua: opts.ua,
  })

  await admin()
    .from('admin_users')
    .update({ last_login_at: new Date().toISOString(), last_ip: opts.ip })
    .eq('id', opts.adminUserId)

  // السطر ده هو اللي حارس إعادة الاستعمال (totpStepUsed) بيقرا منه
  await logLoginAttempt({
    ok: true,
    stage: opts.stage,
    phone: opts.phone,
    ip: opts.ip,
    actorId: opts.profileId,
    step: opts.step,
  })

  return new Response(
    JSON.stringify({
      ok: true,
      role: opts.roleKey,
      expires_at: new Date(Date.now() + ADMIN_SESSION_MS).toISOString(),
    }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'cache-control': 'no-store',
        'set-cookie': session.setCookie,
      },
    }
  )
}
