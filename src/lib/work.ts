/**
 * ============================================================
 *  طبقة بيانات «الشغل» — المرحلة 3 (الكارت) والمرحلة 4 (اليوم الثابت).
 *
 *  منفصلة عن src/lib/api.ts عن قصد: الملف ده كله كروت وأيام ثابتة،
 *  وبيتنادى من /shoghl/pass و/me/shoghl والمكوّنات اللي جواهم.
 *
 *  قاعدتين ما بنكسرهمش هنا:
 *   1. كل قراءة بتعدّي على safeWork — مهلة 8 ثواني وبديل، علشان الصفحة
 *      عمرها ما تفضل على «ثانية واحدة…» لو الطلب علّق من غير ما يرمي.
 *   2. كل كتابة بتنتهي بـ .select('id') — مصفوفة فاضية = القاعدة رفضت (RLS)
 *      حتى لو مفيش error. من غير الفحص ده بنقول «اتحفظ» وإحنا ما عملناش حاجة.
 *
 *  الفلوس كلها قروش في القاعدة، وبتتعرض بالجنيه.
 * ============================================================
 */

import { supabase, hasSupabase } from '@/lib/supabase'

/** بيتحدد مرة واحدة عند التحميل — نفس نمط api.ts */
const DB = hasSupabase

/* ============================================================ الحارس */

const WORK_TIMEOUT_MS = 8000

/**
 * الطلب ممكن **يعلّق** من غير ما يرمي (شبكة بتبلع الحزم، الخدمة واقعة) —
 * وساعتها الصفحة تفضل مستنية للأبد. المهلة هنا مش رفاهية.
 * نسخة من safeWork في api.ts بالحرف (الملف ده ما بيلمسش api.ts).
 */
async function safeWork<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      run(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('المهلة خلصت')), WORK_TIMEOUT_MS)
      }),
    ])
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[الشغل] ${label} وقع:`, (e as Error).message)
    return fallback
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** لو الـ select رجّع فاضي بعد الكتابة، يبقى RLS رفض بصمت */
const rejected = (data: unknown) => !data || (data as unknown[]).length === 0

/** ترويسة الجلسة — مسارات /api بتتحقق من التوكن ده مش من أي id جاي من العميل */
async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase().auth.getSession()
  const tk = data.session?.access_token
  return {
    'content-type': 'application/json',
    ...(tk ? { authorization: `Bearer ${tk}` } : {}),
  }
}

/** نفس الترويسة من غير content-type — الـ FormData بتحدد الحد بتاعها بنفسها */
async function authOnly(): Promise<Record<string, string>> {
  const { data } = await supabase().auth.getSession()
  const tk = data.session?.access_token
  return tk ? { authorization: `Bearer ${tk}` } : {}
}

async function myId(): Promise<string | null> {
  const { data } = await supabase().auth.getUser()
  return data.user?.id ?? null
}

/** قروش → جنيه */
const toPounds = (piastres: number | null | undefined) => Math.round((piastres ?? 0) / 100)

/* ============================================================ الأيام */

/** أكواد أيام الموقع — نفس أكواد free_slots و work_days_pref، بتبدأ بالسبت */
export const DAY_CODES = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'] as const

export type DayCode = (typeof DAY_CODES)[number]

/**
 * `recurring_bookings.weekday` بنمط **بوستجرس**: `extract(dow)` — 0 = الحد … 6 = السبت
 * (والهجرة 0041 بتقول كده بالحرف، و`job_work_recurring` بتحسب بيه).
 * شرايط الموقع بتبدأ بالسبت، يعني الترتيب مختلف تمامًا عن الرقم المخزّن.
 * الجدول ده هو الترجمة **الوحيدة** بين الاتنين — أي مكان تاني بيعد أيام
 * بإيده هيبوظ يوم المستخدم بيوم أو يومين.
 */
const DOW_BY_CODE: Record<DayCode, number> = {
  sat: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
}

/** كود يوم الموقع → رقم بوستجرس المخزّن في recurring_bookings.weekday */
export const dayCodeToDow = (code: DayCode): number => DOW_BY_CODE[code]

/** رقم بوستجرس المخزّن → كود يوم الموقع */
export function dowToDayCode(dow: number): DayCode {
  const found = DAY_CODES.find((c) => DOW_BY_CODE[c] === dow)
  return found ?? 'sat'
}

/** مفتاح النص للاسم العربي لليوم — النصوص نفسها في copy_strings */
export const dayCopyKey = (code: DayCode) => `shoghl.day.${code}`

/* ============================================================ الأنواع */

export type PassKindCode = 'four' | 'eight'

export type PassStatusCode =
  | 'pending'
  | 'active'
  | 'used_up'
  | 'expired'
  | 'refunded'
  | 'cancelled'

export type PayMethod = 'vodafone_cash' | 'instapay'

/** كارت من كروتي — الفلوس بالجنيه */
export interface MyPass {
  id: string
  kind: PassKindCode
  sessionsTotal: number
  sessionsUsed: number
  sessionsLeft: number
  status: PassStatusCode
  startsAt: string | null
  expiresAt: string | null
  pricePaid: number
  createdAt: string
}

export type RecurringStatusCode = 'active' | 'paused' | 'cancelled'

/** يومي الثابت */
export interface MyRecurring {
  id: string
  dayCode: DayCode
  weekday: number
  templateId: string
  templateName: string
  venueId: string | null
  timeOfDay: string | null
  autoBook: boolean
  pauseUntil: string | null
  status: RecurringStatusCode
  lastGeneratedFor: string | null
}

export interface WorkTemplateOption {
  id: string
  nameAr: string
  slug: string
}

export interface ProfessionOption {
  id: string
  key: string
  nameAr: string
}

export interface VenueOption {
  id: string
  name: string
}

export type WorkStatusCode =
  | 'freelancer'
  | 'remote_employee'
  | 'business_owner'
  | 'student'
  | 'employee'
  | 'other'

export type WorkStyleCode = 'silent' | 'chatty' | 'depends'

export const WORK_STATUS_CODES: readonly WorkStatusCode[] = [
  'freelancer',
  'remote_employee',
  'business_owner',
  'student',
  'employee',
  'other',
]

export const WORK_STYLE_CODES: readonly WorkStyleCode[] = ['silent', 'chatty', 'depends']

/** الأعمدة اللي بتتعدّل من «مجالي وأسلوبي» في /me/shoghl */
export interface MyWorkProfile {
  workStatus: WorkStatusCode | null
  professionId: string | null
  workStyle: WorkStyleCode | null
}

export type WriteResult = { ok: true } | { ok: false; error: string }

/* ============================================================ الكروت */

interface PassRowDb {
  id: string
  kind: string
  sessions_total: number
  sessions_used: number
  price_paid: number
  status: string
  starts_at: string | null
  expires_at: string | null
  created_at: string
}

const PASS_STATUSES: readonly PassStatusCode[] = [
  'pending',
  'active',
  'used_up',
  'expired',
  'refunded',
  'cancelled',
]

function passFromDb(row: PassRowDb): MyPass {
  const total = row.sessions_total ?? 0
  const used = row.sessions_used ?? 0
  return {
    id: row.id,
    kind: row.kind === 'eight' ? 'eight' : 'four',
    sessionsTotal: total,
    sessionsUsed: used,
    sessionsLeft: Math.max(0, total - used),
    status: PASS_STATUSES.find((s) => s === row.status) ?? 'pending',
    startsAt: row.starts_at ?? null,
    expiresAt: row.expires_at ?? null,
    pricePaid: toPounds(row.price_paid),
    createdAt: row.created_at,
  }
}

const PASS_COLS =
  'id, kind, sessions_total, sessions_used, price_paid, status, starts_at, expires_at, created_at'

/** كل كروتي — الأحدث الأول. مصفوفة فاضية لو مش داخل أو القاعدة مش متاحة. */
export async function getMyPasses(): Promise<MyPass[]> {
  if (!DB) return []
  return safeWork(
    'getMyPasses',
    async () => {
      const uid = await myId()
      if (!uid) return []
      const { data, error } = await supabase()
        .from('work_passes')
        .select(PASS_COLS)
        .eq('profile_id', uid)
        .order('created_at', { ascending: false })
      if (error || !data) return []
      return (data as unknown as PassRowDb[]).map(passFromDb)
    },
    []
  )
}

/**
 * حالة كروتي في نداء واحد: الشغّال، والمستني المراجعة، والرصيد الكلي.
 * الصفحة بتبني عليها كل شاشاتها — من غير ما تعمل 3 نداءات.
 */
export interface MyPassState {
  active: MyPass | null
  pending: MyPass | null
  balance: number
  all: MyPass[]
}

export const EMPTY_PASS_STATE: MyPassState = {
  active: null,
  pending: null,
  balance: 0,
  all: [],
}

export async function getMyPassState(): Promise<MyPassState> {
  const all = await getMyPasses()
  const now = Date.now()
  const live = all.filter(
    (p) => p.status === 'active' && (!p.expiresAt || new Date(p.expiresAt).getTime() > now)
  )
  // أقدم كارت شغّال هو اللي بيتخصم منه الأول (نفس ترتيب fn_redeem_pass)
  const active =
    live.slice().sort((a, b) => (a.startsAt ?? a.createdAt).localeCompare(b.startsAt ?? b.createdAt))[0] ??
    null
  return {
    active,
    pending: all.find((p) => p.status === 'pending') ?? null,
    balance: live.reduce((n, p) => n + p.sessionsLeft, 0),
    all,
  }
}

/** دفعة الكارت المستني — العضو بيقراها بسياسة payments_pass_own_read */
export interface PassPayment {
  passId: string
  /** بالجنيه */
  amount: number
  method: PayMethod
  receiptPath: string | null
  status: string
}

/**
 * الدفعة المربوطة بكارت مستني — علشان الصفحة تعرف تكمّل من فين لو العضو
 * قفل الصفحة بعد ما طلب الكارت وقبل ما يرفع الصورة.
 */
export async function getPassPayment(passId: string): Promise<PassPayment | null> {
  if (!DB) return null
  return safeWork(
    'getPassPayment',
    async () => {
      const { data, error } = await supabase()
        .from('payments')
        .select('pass_id, amount, provider, receipt_path, status')
        .eq('pass_id', passId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error || !data) return null
      const r = data as {
        pass_id: string
        amount: number
        provider: string
        receipt_path: string | null
        status: string
      }
      return {
        passId: r.pass_id,
        amount: toPounds(r.amount),
        method: r.provider === 'vodafone_cash' ? 'vodafone_cash' : 'instapay',
        receiptPath: r.receipt_path ?? null,
        status: r.status,
      }
    },
    null
  )
}

/**
 * الخطوة 1 من شراء الكارت: الخادم بيقرا السعر من settings ويعمل
 * work_passes (pending) + payments (initiated). مفيش سعر جاي من المتصفح.
 */
export async function startPassPurchase(input: {
  kind: PassKindCode
  method: PayMethod
}): Promise<
  | { ok: true; passId: string; amount: number; payTo: string; method: PayMethod }
  | { ok: false; error: string }
> {
  if (!DB) {
    return { ok: true as const, passId: 'demo', amount: 0, payTo: '', method: input.method }
  }
  try {
    const res = await fetch('/api/pay/pass', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ kind: input.kind, method: input.method }),
    })
    const json = (await res.json()) as {
      passId?: string
      amount?: number
      payTo?: string
      method?: string
      error?: string
    }
    if (!res.ok || !json.passId) {
      return { ok: false as const, error: json.error ?? 'مقدرناش نبدأ الطلب' }
    }
    return {
      ok: true as const,
      passId: json.passId,
      amount: json.amount ?? 0,
      payTo: json.payTo ?? '',
      method: json.method === 'instapay' ? 'instapay' : 'vodafone_cash',
    }
  } catch {
    return { ok: false as const, error: 'الشبكة مش راضية. جرب تاني.' }
  }
}

/**
 * الخطوة 2: صورة التحويل → الدفعة بتبقى pending_review والإدارة بتراجع.
 *
 * الرفع هنا **من الخادم** مش من المتصفح — سياسة دلو `receipts` في 0025
 * بتشترط إن أول جزء من المسار يكون **رقم حجز** بتاع نفس العضو، والكارت
 * مش حجز فمفيش رفع من العميل ينجح. فبنبعت الملف للمسار وهو بيرفعه
 * بمفتاح الخدمة (وبيتأكد إن الكارت كارتي قبلها).
 */
export async function submitPassReceipt(passId: string, file: File): Promise<WriteResult> {
  if (!DB) return { ok: true as const }
  try {
    const fd = new FormData()
    fd.append('passId', passId)
    fd.append('receipt', file)
    const res = await fetch('/api/pay/pass', {
      method: 'PUT',
      headers: await authOnly(),
      body: fd,
    })
    const json = (await res.json()) as { error?: string }
    return res.ok ? { ok: true as const } : { ok: false as const, error: json.error ?? 'مقدرناش نسجل التحويل' }
  } catch {
    return { ok: false as const, error: 'الصورة مترفعتش. جرب تاني.' }
  }
}

/**
 * خصم جلسة من الكارت لحجز موجود — `fn_redeem_pass` بيختار أقدم كارت شغّال،
 * بيسجّل في pass_redemptions، وبيخلي الحجز `paid` لو كان مستني دفع.
 */
export async function redeemPassForBooking(
  bookingId: string
): Promise<{ ok: true; remaining: number } | { ok: false; error: string }> {
  if (!DB) return { ok: true as const, remaining: 0 }
  const { data, error } = await supabase().rpc('fn_redeem_pass', { p_booking_id: bookingId })
  if (error) return { ok: false as const, error: error.message }
  const res = data as { ok?: boolean; remaining?: number } | null
  if (!res?.ok) return { ok: false as const, error: 'مقدرناش نخصم من الكارت' }
  return { ok: true as const, remaining: res.remaining ?? 0 }
}

/**
 * «استخدم كارتي» على صفحة سبوطة الشغل: بيعمل الحجز بصفر جنيه ثم يخصم الجلسة.
 * نفس اللي بتعمله `job_work_recurring` بالحرف — الحجز لوحده ما بيبقاش مدفوع،
 * `fn_redeem_pass` هو اللي بيخليه `paid` ولو مفيش رصيد بيرمي والحجز بينتهي لوحده.
 */
export async function bookWorkSbotaWithPass(
  slug: string
): Promise<{ ok: true; bookingId: string; remaining: number } | { ok: false; error: string }> {
  if (!DB) return { ok: false as const, error: 'القاعدة مش متاحة' }

  const uid = await myId()
  if (!uid) return { ok: false as const, error: 'لازم تسجل دخول' }

  const { data: sb } = await supabase()
    .from('sbotat_public')
    .select('id')
    .eq('slug', slug)
    .eq('is_work', true)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  const sbotaId = (sb as { id: string } | null)?.id
  if (!sbotaId) return { ok: false as const, error: 'السبوطة دي مش موجودة' }

  // كل قواعد الحجز في القاعدة — بننادي نسخة العميل بدل ما نكررها هنا
  const { data: blocked } = await supabase().rpc('fn_can_i_book', { s_id: sbotaId })
  if (typeof blocked === 'string' && blocked) return { ok: false as const, error: blocked }

  const { data: existing } = await supabase()
    .from('bookings')
    .select('id, status')
    .eq('sbota_id', sbotaId)
    .eq('profile_id', uid)
    .maybeSingle()
  const prev = existing as { id: string; status: string } | null

  let bookingId: string
  if (prev && ['pending_payment', 'paid', 'attended'].includes(prev.status)) {
    bookingId = prev.id
  } else if (prev) {
    // حجز ملغي على نفس السبوطة — القيد الفريد (sbota_id, profile_id) بيمنع
    // إدراج تاني، والعضو مالوش سياسة UPDATE على bookings. الإدارة بس تقدر ترجّعه.
    return { ok: false as const, error: 'كان عندك حجز متلغي هنا — كلمنا علشان نرجّعه' }
  } else {
    const { data: made, error: insErr } = await supabase()
      .from('bookings')
      .insert({
        sbota_id: sbotaId,
        profile_id: uid,
        status: 'pending_payment',
        price_paid: 0,
        expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      })
      .select('id')
    if (insErr) return { ok: false as const, error: insErr.message }
    if (rejected(made)) return { ok: false as const, error: 'القاعدة رفضت الحجز' }
    bookingId = (made as { id: string }[])[0].id
  }

  const red = await redeemPassForBooking(bookingId)
  if (!red.ok) return { ok: false as const, error: red.error }
  return { ok: true as const, bookingId, remaining: red.remaining }
}

/* ============================================================ اليوم الثابت */

interface RecurringRowDb {
  id: string
  weekday: number
  template_id: string
  venue_id: string | null
  time_of_day: string | null
  auto_book: boolean
  pause_until: string | null
  status: string
  last_generated_for: string | null
  sbota_templates: { name_ar: string } | { name_ar: string }[] | null
}

const RECURRING_STATUSES: readonly RecurringStatusCode[] = ['active', 'paused', 'cancelled']

function recurringFromDb(row: RecurringRowDb): MyRecurring {
  const tpl = Array.isArray(row.sbota_templates) ? row.sbota_templates[0] : row.sbota_templates
  return {
    id: row.id,
    dayCode: dowToDayCode(row.weekday),
    weekday: row.weekday,
    templateId: row.template_id,
    templateName: tpl?.name_ar ?? '',
    venueId: row.venue_id ?? null,
    timeOfDay: row.time_of_day ? row.time_of_day.slice(0, 5) : null,
    autoBook: Boolean(row.auto_book),
    pauseUntil: row.pause_until ?? null,
    status: RECURRING_STATUSES.find((s) => s === row.status) ?? 'active',
    lastGeneratedFor: row.last_generated_for ?? null,
  }
}

const RECURRING_COLS =
  'id, weekday, template_id, venue_id, time_of_day, auto_book, pause_until, status, ' +
  'last_generated_for, sbota_templates(name_ar)'

/** أيامي الثابتة اللي لسه مش ملغية */
export async function getMyRecurring(): Promise<MyRecurring[]> {
  if (!DB) return []
  return safeWork(
    'getMyRecurring',
    async () => {
      const uid = await myId()
      if (!uid) return []
      const { data, error } = await supabase()
        .from('recurring_bookings')
        .select(RECURRING_COLS)
        .eq('profile_id', uid)
        .neq('status', 'cancelled')
        .order('weekday')
      if (error || !data) return []
      return (data as unknown as RecurringRowDb[]).map(recurringFromDb)
    },
    []
  )
}

/** قوالب سبوطات الشغل — العضو بيختار منها يومه الثابت */
export async function getWorkTemplates(): Promise<WorkTemplateOption[]> {
  if (!DB) return []
  return safeWork(
    'getWorkTemplates',
    async () => {
      const { data, error } = await supabase()
        .from('sbota_templates')
        .select('id, name_ar, slug')
        .eq('is_work', true)
        .order('name_ar')
      if (error || !data) return []
      return (data as { id: string; name_ar: string; slug: string }[]).map((r) => ({
        id: r.id,
        nameAr: r.name_ar,
        slug: r.slug,
      }))
    },
    []
  )
}

/** أماكن الشغل للاختيار — من العرض العام (مفيش سعر جملة فيه أصلًا) */
export async function getWorkVenueOptions(): Promise<VenueOption[]> {
  if (!DB) return []
  return safeWork(
    'getWorkVenueOptions',
    async () => {
      const { data, error } = await supabase()
        .from('work_venues_public')
        .select('venue_id, name')
        .eq('is_active', true)
        .order('name')
      if (error || !data) return []
      return (data as { venue_id: string; name: string }[]).map((r) => ({
        id: r.venue_id,
        name: r.name,
      }))
    },
    []
  )
}

/** «ثبّت يومي» — صف واحد لكل (عضو، يوم)، والقيد الفريد في القاعدة بيحرسها */
export async function createRecurring(input: {
  dayCode: DayCode
  templateId: string
  venueId?: string | null
  timeOfDay?: string | null
}): Promise<WriteResult> {
  if (!DB) return { ok: true as const }
  const uid = await myId()
  if (!uid) return { ok: false as const, error: 'لازم تسجل دخول' }

  const { data, error } = await supabase()
    .from('recurring_bookings')
    .insert({
      profile_id: uid,
      template_id: input.templateId,
      venue_id: input.venueId ?? null,
      weekday: dayCodeToDow(input.dayCode),
      time_of_day: input.timeOfDay ?? null,
      status: 'active',
      auto_book: true,
    })
    .select('id')
  if (error) {
    // 23505 = القيد الفريد recurring_one_per_weekday
    const code = (error as { code?: string }).code
    if (code === '23505') return { ok: false as const, error: 'عندك يوم ثابت في نفس اليوم ده' }
    return { ok: false as const, error: error.message }
  }
  if (rejected(data)) return { ok: false as const, error: 'القاعدة رفضت الحفظ' }
  return { ok: true as const }
}

/** «أوقف أسبوعين» — pause_until = النهاردة + 14. الحالة بتفضل active فبيرجع لوحده. */
export async function pauseRecurringTwoWeeks(id: string): Promise<WriteResult> {
  const until = new Date()
  until.setDate(until.getDate() + 14)
  return updateRecurring(id, { pause_until: until.toISOString().slice(0, 10), status: 'active' })
}

/** «رجّعه» — شيل الإيقاف ورجّع الحالة active */
export async function resumeRecurring(id: string): Promise<WriteResult> {
  return updateRecurring(id, { pause_until: null, status: 'active' })
}

/** إلغاء نهائي — القيد الفريد بيستثني الملغي فيقدر يعمل يوم جديد بعدها */
export async function cancelRecurring(id: string): Promise<WriteResult> {
  return updateRecurring(id, { status: 'cancelled' })
}

/** تشغيل/إيقاف الحجز التلقائي من غير إلغاء اليوم */
export async function setRecurringAutoBook(id: string, on: boolean): Promise<WriteResult> {
  return updateRecurring(id, { auto_book: on })
}

interface RecurringPatch {
  status?: RecurringStatusCode
  pause_until?: string | null
  auto_book?: boolean
}

async function updateRecurring(id: string, patch: RecurringPatch): Promise<WriteResult> {
  if (!DB) return { ok: true as const }
  const { data, error } = await supabase()
    .from('recurring_bookings')
    .update(patch)
    .eq('id', id)
    .select('id')
  if (error) return { ok: false as const, error: error.message }
  if (rejected(data)) return { ok: false as const, error: 'القاعدة رفضت التعديل' }
  return { ok: true as const }
}

/* ============================================================ مجالي وأسلوبي */

/** المجالات المفعّلة — القراءة مفتوحة للكل (سياسة professions_read) */
export async function getProfessions(): Promise<ProfessionOption[]> {
  if (!DB) return []
  return safeWork(
    'getProfessions',
    async () => {
      const { data, error } = await supabase()
        .from('professions')
        .select('id, key, name_ar')
        .eq('is_active', true)
        .order('sort_order')
        .order('name_ar')
      if (error || !data) return []
      return (data as { id: string; key: string; name_ar: string }[]).map((r) => ({
        id: r.id,
        key: r.key,
        nameAr: r.name_ar,
      }))
    },
    []
  )
}

export const EMPTY_WORK_PROFILE: MyWorkProfile = {
  workStatus: null,
  professionId: null,
  workStyle: null,
}

export async function getMyWorkProfile(): Promise<MyWorkProfile> {
  if (!DB) return { ...EMPTY_WORK_PROFILE }
  return safeWork(
    'getMyWorkProfile',
    async () => {
      const uid = await myId()
      if (!uid) return { ...EMPTY_WORK_PROFILE }
      const { data, error } = await supabase()
        .from('profiles')
        .select('work_status, profession_id, work_style')
        .eq('id', uid)
        .maybeSingle()
      if (error || !data) return { ...EMPTY_WORK_PROFILE }
      const r = data as { work_status: string | null; profession_id: string | null; work_style: string | null }
      return {
        workStatus: WORK_STATUS_CODES.find((s) => s === r.work_status) ?? null,
        professionId: r.profession_id ?? null,
        workStyle: WORK_STYLE_CODES.find((s) => s === r.work_style) ?? null,
      }
    },
    { ...EMPTY_WORK_PROFILE }
  )
}

export async function saveMyWorkProfile(p: MyWorkProfile): Promise<WriteResult> {
  if (!DB) return { ok: true as const }
  const uid = await myId()
  if (!uid) return { ok: false as const, error: 'لازم تسجل دخول' }
  const { data, error } = await supabase()
    .from('profiles')
    .update({
      work_status: p.workStatus,
      profession_id: p.professionId,
      work_style: p.workStyle,
    })
    .eq('id', uid)
    .select('id')
  if (error) return { ok: false as const, error: error.message }
  if (rejected(data)) return { ok: false as const, error: 'القاعدة رفضت الحفظ' }
  return { ok: true as const }
}

/* ============================================================================
 *  المرحلة 6 — اللوحة: تقارير الأماكن · المؤشرات · الشركات
 *
 *  الكتلة دي بتتنادى من /admin/shoghl بس، ومحطوطة هنا مش في الصفحة علشان
 *  تعدّي على نفس الحارسين اللي فوق: safeWork (مهلة 8 ثواني) في كل قراءة،
 *  و.select('id') بعد كل كتابة. تبويب في اللوحة بيفضل على «ثانية واحدة…»
 *  للأبد هو عطل زي أي عطل.
 *
 *  كل قراءة بترجّع { rows, error } بدل ما ترمي: الفرق بين «مفيش بيانات»
 *  و«القاعدة رفضت» لازم يوصل للشاشة، مش يتلبّس في مصفوفة فاضية.
 * ========================================================================== */

/** نتيجة قراءة للوحة: صفوف + سبب لو القراءة نفسها وقعت */
export interface WorkAdminLoad<T> {
  rows: T[]
  error: string | null
}

const loadFailed = <T,>(error: string): WorkAdminLoad<T> => ({ rows: [], error })

/** تاريخ النهاردة بتوقيت القاهرة — yyyy-mm-dd */
const cairoToday = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })

/** yyyy-mm-dd → تاريخ ثابت الساعة (UTC) علشان الحساب ما يتأثرش بمنطقة المتصفح */
const parseDay = (d: string) => new Date(`${d}T00:00:00Z`)

const fmtDay = (d: Date) => d.toISOString().slice(0, 10)

/**
 * اتنين الأسبوع اللي التاريخ ده واقع فيه — **نفس** `date_trunc('week')`
 * في بوستجرس (الأسبوع بيبدأ الاتنين)، وهي اللي `fn_venue_report` بتخزّن بيها.
 * أي حساب تاني هنا هيخلّي اللوحة تدوّر على أسبوع مش موجود في الجدول.
 */
export function weekStartOf(day: string): string {
  const d = parseDay(day)
  const dow = d.getUTCDay() // 0 = الحد
  const back = (dow + 6) % 7 // الاتنين = 0
  d.setUTCDate(d.getUTCDate() - back)
  return fmtDay(d)
}

/** آخر أسبوع **كامل** — الافتراضي في تبويب التقارير، ونفس اللي المهمة بتبنيه */
export const lastCompletedWeekStart = (): string => {
  const d = parseDay(cairoToday())
  d.setUTCDate(d.getUTCDate() - 7)
  return weekStartOf(fmtDay(d))
}

/** أسبوع قدام أو ورا */
export function shiftWeek(weekStart: string, weeks: number): string {
  const d = parseDay(weekStart)
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return fmtDay(d)
}

/** هل الأسبوع ده خلص فعلًا؟ (قبل كده التقرير بيبقى ناقص) */
export const weekIsOver = (weekStart: string): boolean =>
  shiftWeek(weekStart, 1) <= cairoToday()

/* ---------------------------------------------------- تقارير الأماكن */

/** صف تقرير مكان — `amountDue` بالقروش زي القاعدة (اللوحة بتعرضه بـ money) */
export interface VenueReportRow {
  id: string
  venueId: string
  venueName: string
  area: string | null
  weekStart: string
  sessionsCount: number
  attendeesCount: number
  noShows: number
  avgRating: number | null
  amountDue: number
  paidAt: string | null
  notes: string | null
}

interface VenueReportRaw {
  id: string
  venue_id: string
  week_start: string
  sessions_count: number | null
  attendees_count: number | null
  no_shows: number | null
  avg_rating: number | string | null
  amount_due: number | null
  paid_at: string | null
  notes: string | null
  venues: { name: string; area: string | null }[] | { name: string; area: string | null } | null
}

const oneRel = <T,>(v: T[] | T | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

const VENUE_REPORT_COLS =
  'id, venue_id, week_start, sessions_count, attendees_count, no_shows, ' +
  'avg_rating, amount_due, paid_at, notes, venues(name, area)'

function venueReportFromDb(r: VenueReportRaw): VenueReportRow {
  const v = oneRel(r.venues)
  const rating = r.avg_rating === null || r.avg_rating === undefined ? null : Number(r.avg_rating)
  return {
    id: r.id,
    venueId: r.venue_id,
    venueName: v?.name ?? 'مكان اتشال',
    area: v?.area ?? null,
    weekStart: r.week_start,
    sessionsCount: r.sessions_count ?? 0,
    attendeesCount: r.attendees_count ?? 0,
    noShows: r.no_shows ?? 0,
    avgRating: rating !== null && Number.isFinite(rating) ? rating : null,
    amountDue: r.amount_due ?? 0,
    paidAt: r.paid_at ?? null,
    notes: r.notes ?? null,
  }
}

/** تقارير أسبوع واحد — القراءة محتاجة payments.view (سياسة venue_reports_read) */
export async function getVenueReports(weekStart: string): Promise<WorkAdminLoad<VenueReportRow>> {
  if (!DB) return { rows: [], error: null }
  return safeWork(
    'getVenueReports',
    async () => {
      const { data, error } = await supabase()
        .from('venue_reports')
        .select(VENUE_REPORT_COLS)
        .eq('week_start', weekStart)
        .limit(200)
      if (error) return loadFailed<VenueReportRow>(error.message)
      const rows = ((data ?? []) as unknown as VenueReportRaw[]).map(venueReportFromDb)
      rows.sort((a, b) => a.venueName.localeCompare(b.venueName, 'ar'))
      return { rows, error: null }
    },
    loadFailed<VenueReportRow>('الطلب طوّل أكتر من ٨ ثواني — جرّب «حدّث» تاني')
  )
}

/** الأسابيع اللي فيها تقارير فعلًا — علشان قايمة الاختيار */
export async function getVenueReportWeeks(limit = 26): Promise<string[]> {
  if (!DB) return []
  return safeWork(
    'getVenueReportWeeks',
    async () => {
      const { data, error } = await supabase()
        .from('venue_reports')
        .select('week_start')
        .order('week_start', { ascending: false })
        .limit(limit * 12)
      if (error || !data) return []
      const seen: string[] = []
      for (const r of data as { week_start: string }[]) {
        if (!seen.includes(r.week_start)) seen.push(r.week_start)
        if (seen.length >= limit) break
      }
      return seen
    },
    []
  )
}

/** «اتدفع» — بتحتاج payments.review (سياسة venue_reports_write) */
export async function markVenueReportPaid(id: string): Promise<WriteResult> {
  if (!DB) return { ok: true as const }
  const uid = await myId()
  const { data, error } = await supabase()
    .from('venue_reports')
    .update({ paid_at: new Date().toISOString(), paid_by: uid })
    .eq('id', id)
    .select('id')
  if (error) return { ok: false as const, error: error.message }
  if (rejected(data))
    return { ok: false as const, error: 'القاعدة رفضت — محتاج صلاحية payments.review' }
  return { ok: true as const }
}

/**
 * «ابنِ تقرير الأسبوع» — الغلاف بتاع الهجرة 0050، مش `fn_venue_report`
 * مباشرة: دي اتقفلت على الخادم والغلاف بس (0050 بند 4).
 */
export async function buildVenueReport(weekStart: string): Promise<WriteResult> {
  if (!DB) return { ok: true as const }
  const { error } = await supabase().rpc('fn_admin_build_venue_report', {
    p_week_start: weekStart,
  })
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

/* ---------------------------------------------------- المؤشرات */

/** صف أسبوعي من `work_metrics` — الأرقام زي ما هي في العرض المادي */
export interface WorkMetricRow {
  week: string
  workSbotat: number
  workBookings: number
  attended: number
  noShowPct: number | null
  passBookings: number
  passesSold: number
  passesRevenue: number
  sessionsRedeemed: number
  workFirstTimers: number
  converted30d: number
  conversion30dPct: number | null
  collabMutualPct: number | null
}

interface WorkMetricRaw {
  week: string
  work_sbotat: number | null
  work_bookings: number | null
  attended: number | null
  no_show_pct: number | string | null
  pass_bookings: number | null
  passes_sold: number | null
  passes_revenue: number | null
  sessions_redeemed: number | null
  work_first_timers: number | null
  converted_30d: number | null
  conversion_30d_pct: number | string | null
  collab_mutual_pct: number | string | null
}

const num = (v: number | string | null | undefined): number | null => {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * المؤشرات الأسبوعية عبر `fn_work_metrics` (settings.view).
 * الدالة بترجّع صفر صفوف لو الصلاحية ناقصة — فالصفحة لازم تفحص الصلاحية
 * بنفسها قبل ما تقول «مفيش بيانات».
 */
export async function getWorkMetrics(weeks = 12): Promise<WorkAdminLoad<WorkMetricRow>> {
  if (!DB) return { rows: [], error: null }
  return safeWork(
    'getWorkMetrics',
    async () => {
      const { data, error } = await supabase().rpc('fn_work_metrics', { p_weeks: weeks })
      if (error) return loadFailed<WorkMetricRow>(error.message)
      const rows = ((data ?? []) as WorkMetricRaw[]).map((r) => ({
        week: r.week,
        workSbotat: r.work_sbotat ?? 0,
        workBookings: r.work_bookings ?? 0,
        attended: r.attended ?? 0,
        noShowPct: num(r.no_show_pct),
        passBookings: r.pass_bookings ?? 0,
        passesSold: r.passes_sold ?? 0,
        passesRevenue: r.passes_revenue ?? 0,
        sessionsRedeemed: r.sessions_redeemed ?? 0,
        workFirstTimers: r.work_first_timers ?? 0,
        converted30d: r.converted_30d ?? 0,
        conversion30dPct: num(r.conversion_30d_pct),
        collabMutualPct: num(r.collab_mutual_pct),
      }))
      return { rows, error: null }
    },
    loadFailed<WorkMetricRow>('الطلب طوّل أكتر من ٨ ثواني — جرّب «حدّث الأرقام» تاني')
  )
}

/** مستهدف التحوّل من `settings` — القراءة مفتوحة (سياسة settings_read) */
export async function getConversionTarget(): Promise<number | null> {
  if (!DB) return null
  return safeWork(
    'getConversionTarget',
    async () => {
      const { data, error } = await supabase()
        .from('settings')
        .select('work_conversion_target_pct')
        .eq('id', true)
        .maybeSingle()
      if (error || !data) return null
      return num((data as { work_conversion_target_pct: number | null }).work_conversion_target_pct)
    },
    null
  )
}

/** «حدّث الأرقام» — غلاف 0050 على `job_work_metrics()` */
export async function refreshWorkMetrics(): Promise<WriteResult> {
  if (!DB) return { ok: true as const }
  const { error } = await supabase().rpc('fn_admin_refresh_work_metrics')
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const }
}

/* ---------------------------------------------------- الأيام الثابتة */

/** «ولّد دلوقتي» — غلاف 0050 على `job_work_recurring()` (bookings.edit) */
export async function runWorkRecurringNow(): Promise<
  { ok: true; count: number } | { ok: false; error: string }
> {
  if (!DB) return { ok: true as const, count: 0 }
  const { data, error } = await supabase().rpc('fn_admin_run_work_recurring')
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, count: Number(data ?? 0) || 0 }
}

/* ---------------------------------------------------- الشركات */

export type LeadStatusCode = 'new' | 'contacted' | 'converted' | 'dropped'

export const LEAD_STATUS_CODES: readonly LeadStatusCode[] = [
  'new',
  'contacted',
  'converted',
  'dropped',
]

export interface LeadRow {
  id: string
  company: string
  contactName: string
  phone: string
  peopleCount: number | null
  timesPerMonth: number | null
  note: string | null
  adminNote: string | null
  status: LeadStatusCode
  createdAt: string
}

interface LeadRaw {
  id: string
  company: string | null
  contact_name: string | null
  phone: string | null
  people_count: number | null
  times_per_month: number | null
  note: string | null
  admin_note: string | null
  status: string
  created_at: string
}

const LEAD_COLS =
  'id, company, contact_name, phone, people_count, times_per_month, note, admin_note, status, created_at'

const leadFromDb = (r: LeadRaw): LeadRow => ({
  id: r.id,
  company: r.company ?? '—',
  contactName: r.contact_name ?? '—',
  phone: r.phone ?? '',
  peopleCount: r.people_count ?? null,
  timesPerMonth: r.times_per_month ?? null,
  note: r.note ?? null,
  adminNote: r.admin_note ?? null,
  status: LEAD_STATUS_CODES.find((s) => s === r.status) ?? 'new',
  createdAt: r.created_at,
})

/** طلبات الشركات — الأحدث الأول. القراءة محتاجة people.view (سياسة leads_read) */
export async function getLeads(limit = 300): Promise<WorkAdminLoad<LeadRow>> {
  if (!DB) return { rows: [], error: null }
  return safeWork(
    'getLeads',
    async () => {
      const { data, error } = await supabase()
        .from('leads')
        .select(LEAD_COLS)
        .order('created_at', { ascending: false })
        .limit(limit)
      if (error) return loadFailed<LeadRow>(error.message)
      return { rows: ((data ?? []) as LeadRaw[]).map(leadFromDb), error: null }
    },
    loadFailed<LeadRow>('الطلب طوّل أكتر من ٨ ثواني — جرّب «حدّث» تاني')
  )
}

/**
 * صفحة واحدة من طلبات الشركات + العدد الكلي بعد الفلتر (مراجعة A17).
 * الفلتر والترقيم بيتنفّذوا **في القاعدة** — نفس نمط /admin/people.
 * `status` فاضية أو 'all' يعني كل الحالات.
 */
export async function getLeadsPage(opts: {
  page: number
  pageSize: number
  status?: string
}): Promise<WorkAdminLoad<LeadRow> & { total: number | null }> {
  if (!DB) return { rows: [], error: null, total: 0 }
  const from = opts.page * opts.pageSize
  const res = await safeWork(
    'getLeadsPage',
    async () => {
      let q = supabase()
        .from('leads')
        .select(LEAD_COLS, { count: 'exact' })
        .order('created_at', { ascending: false })
      if (opts.status && opts.status !== 'all') q = q.eq('status', opts.status)
      const { data, error, count } = await q.range(from, from + opts.pageSize - 1)
      if (error) return { ...loadFailed<LeadRow>(error.message), total: 0 }
      return {
        rows: ((data ?? []) as LeadRaw[]).map(leadFromDb),
        error: null,
        total: count ?? null,
      }
    },
    { ...loadFailed<LeadRow>('الطلب طوّل أكتر من ٨ ثواني — جرّب «حدّث» تاني'), total: 0 }
  )
  return res
}

/**
 * تعديل طلب شركة — الحالة أو ملاحظة الإدارة.
 * سياسة `leads_write` في 0043 هي **update بس** ومحتاجة `people.view`
 * (مش صلاحية كتابة منفصلة) — فالفحص في اللوحة لازم يبقى على `people.view`.
 * وبنكتب `handled_by` مع أول تغيير حالة علشان نعرف مين بيتابع الطلب.
 */
export async function updateLead(
  id: string,
  patch: { status?: LeadStatusCode; adminNote?: string | null }
): Promise<WriteResult> {
  if (!DB) return { ok: true as const }
  const body: Record<string, unknown> = {}
  if (patch.status !== undefined) {
    body.status = patch.status
    body.handled_by = await myId()
  }
  if (patch.adminNote !== undefined) body.admin_note = patch.adminNote
  if (Object.keys(body).length === 0) return { ok: true as const }

  const { data, error } = await supabase().from('leads').update(body).eq('id', id).select('id')
  if (error) return { ok: false as const, error: error.message }
  if (rejected(data))
    return { ok: false as const, error: 'القاعدة رفضت — محتاج صلاحية people.view' }
  return { ok: true as const }
}
