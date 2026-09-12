/**
 * ============================================================
 *  طبقة البيانات — النقطة الوحيدة اللي بتعرف مصدر البيانات.
 *  الواجهات (src/app, src/components) بتنادي الملف ده وبس.
 *
 *  لو Supabase متظبط في .env.local → القاعدة الحقيقية.
 *  لو مش متظبط           → البيانات الوهمية من api-mock.ts
 *                          (علشان الموقع والاختبارات يشتغلوا من غير مفاتيح).
 * ============================================================
 */

import type {
  Booking,
  ChatMessage,
  Clue,
  GameAnswers,
  Me,
  Person,
  Persona,
  Profile,
  Sbota,
  Captain,
  Gender,
  GirlsOnlyPref,
  SkillLevel,
  GroupProfession,
  LeadInput,
  WorkPass,
  WorkPayWith,
  WorkSbota,
  WorkSettings,
  WorkVenue,
  HostedSbota,
  HostLimits,
  NewSbotaInput,
} from '@/types'
import { supabase, hasSupabase } from '@/lib/supabase'
import * as mock from '@/lib/api-mock'
import {
  sbotaFromDb,
  captainFromDb,
  personFromDb,
  bookingFromDb,
  clueFromDb,
  personaIdFromDb,
  personaToDb,
  genderToDb,
  genderFromDb,
  girlsPrefToDb,
  areaToDb,
  activityToDb,
  setActivityMap,
  skillToDb,
  budgetToDb,
  slotsToDb,
  toPiastres,
  toPounds,
  slotsFromDb,
  girlsPrefFromDb,
  skillFromDb,
  activityFromDb,
  budgetFromDb,
  areaFromDb,
  priceLabel,
  whenLabel,
  workSettingsFromDb,
  workVenueFromDb,
  workScheduleFromConfig,
  professionsFromDb,
  workPassFromDb,
} from '@/lib/map-db'
import { setSession, clearSession } from '@/lib/session'
import { personas } from '@/data/personas'
import { gameFallback } from '@/data/game'
import { resultFor, type GameConfig, type GameKind } from '@/lib/game-config'
import { WORK_WINDOW_DAYS, workSettingsDefaults, workScheduleDefaults } from '@/data/lists'

/** بيتحدد مرة واحدة عند التحميل */
const DB = hasSupabase

/** ترويسة الجلسة — مسارات /api الحساسة بتتحقق من التوكن ده مش من أي id جاي من العميل */
async function authHeaders(explicit?: string): Promise<Record<string, string>> {
  const { data } = await supabase().auth.getSession()
  const t = explicit ?? data.session?.access_token
  return {
    'content-type': 'application/json',
    ...(t ? { authorization: `Bearer ${t}` } : {}),
  }
}

/* ------------------------------------------------ نشاطات المهارة من القاعدة
 *
 * `skill_activities` هو مصدر أسماء النشاطات (بادل · جري · سباحة · عجل …).
 * قبل كده map-db كان بيترجم بتلات شروط ثابتة وأي نشاط جديد بيتحفظ «سباحة».
 * دلوقتي بنقرا الجدول مرة واحدة في عمر الصفحة وبنحمّله في جدول الترجمة.
 *
 * الفشل مش قاتل: البذرة في map-db بتفضل شغالة، وإحنا بنكتب الحاجات المعروفة بس.
 */
let activityMapOnce: Promise<void> | null = null

async function loadActivityMap(): Promise<void> {
  if (!DB) return
  if (!activityMapOnce) {
    activityMapOnce = (async () => {
      try {
        const { data } = await supabase().from('skill_activities').select('key, label_ar')
        const rows = (data ?? []) as { key: string; label_ar: string | null }[]
        if (rows.length) setActivityMap(rows)
      } catch {
        // البذرة في map-db بتكفّي
      }
    })()
  }
  return activityMapOnce
}

export const DEV_OTP = '1234'
export const REFERRAL_DISCOUNT = 0.15

/* ============================================================ السبوطات */

/**
 * أعمدة السبوطة قبل هجرة 0078 — الأساس اللي أكيد موجود.
 */
const SBOTA_COLS_BASE =
  'id, slug, name_ar, story_ar, kind, mood_ar, meta_prefix_ar, level_ar, price, org_fee, ' +
  'capacity, status, girls_only, is_day, is_mystery, starts_at, duration_min, area, area_label_ar, ' +
  'includes_ar, excludes_ar, hero_photos, captain_id, overnight, reveal_at'

/** أعمدة صاحب الخروجة — بتتضاف مع 0078 */
const SBOTA_COLS_HOST =
  'origin, host_id, host_name_ar, host_note_ar, venue_name_ar, cost_note_ar'

const SBOTA_COLS = `${SBOTA_COLS_BASE}, ${SBOTA_COLS_HOST}`

/**
 * ⚠ الكود بينزل على Vercel قبل ما الهجرة تتلزق على القاعدة — ده الترتيب
 * الطبيعي في المشروع ده (الإيجنت مالوش وصول للقاعدة، المالك بيلزق بإيده).
 * وفي الفترة دي أعمدة `origin`/`host_id` **مش موجودة**، وPostgREST بيرفض
 * الاستعلام كله بـ400. من غير الحارس ده، **قايمة السبوطات في الصفحة
 * الرئيسية كانت هتطلع فاضية** لحد ما المالك يلزق — أوحش من إن الوسم
 * الجديد ما يبانش.
 *
 * فبنجرّب بالأعمدة الجديدة، ولو القاعدة ما عرفتهاش بنعيد بالأساس بس.
 * بعد اللزق المسار الأول بينجح على طول والتاني عمره ما بيتنفّذ.
 */
/**
 * آخر مرة القاعدة قالت فيها إن الأعمدة مش موجودة. بنجرّب تاني بعد دقيقة،
 * علشان أول ما المالك يلزق الهجرة الوسم يبان من غير ما نستنى إعادة نشر.
 */
let hostColsMissingAt = 0
const HOST_COLS_RETRY_MS = 60_000

async function selectSbotat<T>(
  run: (cols: string) => PromiseLike<{ data: T; error: { message: string } | null }>
): Promise<{ data: T; error: { message: string } | null }> {
  const skip = hostColsMissingAt > 0 && Date.now() - hostColsMissingAt < HOST_COLS_RETRY_MS
  if (!skip) {
    const first = await run(SBOTA_COLS)
    if (!first.error) {
      hostColsMissingAt = 0
      return first
    }
    // مش أي غلطة — الغلطة بتاعة عمود مش موجود بس
    if (!/origin|host_id|host_name_ar|host_note_ar|venue_name_ar|cost_note_ar/.test(first.error.message))
      return first
    hostColsMissingAt = Date.now()
  }
  return run(SBOTA_COLS_BASE)
}

/** بيجيب أرقام «مين حاجز» لمجموعة سبوطات مرة واحدة */
async function whoBookedMap(ids: string[]) {
  const out = new Map<string, Awaited<ReturnType<typeof one>>>()
  async function one(id: string) {
    const { data } = await supabase().rpc('fn_who_booked', { s_id: id })
    return Array.isArray(data) ? data[0] : data
  }
  await Promise.all(ids.map(async (id) => out.set(id, await one(id))))
  return out
}

export async function getSbotat(opts?: {
  filter?: string
  timeOfDay?: 'day' | 'night'
}): Promise<Sbota[]> {
  if (!DB) return mock.getSbotat(opts)

  const { data, error } = await selectSbotat((cols) => {
    let q = supabase()
      .from('sbotat_public')
      .select(cols)
      .eq('is_mystery', false)
      .order('starts_at', { ascending: true })
    if (opts?.timeOfDay) q = q.eq('is_day', opts.timeOfDay === 'day')
    return q
  })
  if (error || !data) return []

  const rows = data as Record<string, unknown>[]
  const who = await whoBookedMap(rows.map((r) => r.id as string))
  let list = rows.map((r) => sbotaFromDb(r, who.get(r.id as string)))

  const f = opts?.filter
  if (f && f !== 'الكل') {
    list = list.filter(
      (s: Sbota) => s.tags.includes(f) || s.area === f || (f === 'بنات بس' && s.girls)
    )
  }
  return list
}

export async function getSbota(slug: string): Promise<Sbota | null> {
  if (!DB) return mock.getSbota(slug)

  const { data, error } = await selectSbotat<Record<string, unknown> | null>((cols) =>
    supabase()
      .from('sbotat_public')
      .select(cols)
      .eq('slug', slug)
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle()
  )

  if (error || !data) return null
  const id = (data as { id: string }).id
  const who = (await whoBookedMap([id])).get(id)

  // العنوان الكامل: الدالة للمسجّلين بس (والزائر بياخد 401)،
  // فبنسأل عنها لو في جلسة، والدالة نفسها بتتحقق إنه حاجز ودافع.
  let address: { address: string; venue_name: string } | null = null
  const { data: session } = await supabase().auth.getSession()
  if (session.session) {
    const { data: addr } = await supabase().rpc('fn_sbota_address', { s_id: id })
    address = Array.isArray(addr) && addr.length ? addr[0] : null
  }

  return sbotaFromDb(data, who, address)
}

export async function getRandomSbota(
  timeOfDay: 'day' | 'night',
  exclude?: string
): Promise<Sbota> {
  if (!DB) return mock.getRandomSbota(timeOfDay, exclude)

  const all = await getSbotat({ timeOfDay })
  const pool = all.filter((s) => !s.full && s.slug !== exclude)
  const fallback = (await getSbotat()).filter((s) => !s.full && s.slug !== exclude)
  const from = pool.length ? pool : fallback.length ? fallback : all
  return from[Math.floor(Math.random() * from.length)]
}

export async function getMystery(): Promise<Sbota | null> {
  if (!DB) return mock.getSbota('mystery')
  const { data } = await selectSbotat<Record<string, unknown> | null>((cols) =>
    supabase()
      .from('sbotat_public')
      .select(cols)
      .eq('is_mystery', true)
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle()
  )
  return data ? sbotaFromDb(data) : null
}

/** الخريطة — السبوطات بإحداثياتها */
export async function getMap() {
  if (!DB) return { sbotat: await mock.getSbotat(), visitedAreas: [] as string[] }
  const sbotat = await getSbotat()
  const { data: mine } = await supabase()
    .from('bookings')
    .select('sbotat(area)')
    .in('status', ['paid', 'attended'])
  const visitedAreas = Array.from(
    new Set(
      ((mine ?? []) as { sbotat?: { area?: string } }[])
        .map((r) => r.sbotat?.area)
        .filter(Boolean) as string[]
    )
  )
  return { sbotat, visitedAreas }
}

/* ============================================================ الكباتن */

export async function getCaptains(): Promise<Captain[]> {
  if (!DB) return mock.getCaptains()
  const { data } = await supabase()
    .from('captains')
    .select('id, bio_line, activities, display_name, craft_ar, photo_path')
    .eq('is_active', true)
  return (data ?? []).map(captainFromDb)
}

export async function getCaptain(id: string): Promise<Captain> {
  if (!DB) return mock.getCaptain(id)
  const { data } = await supabase()
    .from('captains')
    .select('id, bio_line, activities, display_name, craft_ar, photo_path')
    .eq('id', id)
    .maybeSingle()
  return data ? captainFromDb(data) : (await mock.getCaptain(id))
}

export async function applyAsCaptain(payload: {
  name: string
  phone: string
  job: string
  why: string
}) {
  if (!DB) return mock.applyAsCaptain(payload)
  const { error } = await supabase().from('captain_applications').insert({
    name: payload.name,
    phone: payload.phone,
    job: payload.job,
    why: payload.why,
  })
  return error ? { ok: false as const, error: error.message } : { ok: true as const, payload }
}

/* ============================================================ الدخول */

/**
 * الدخول بإيميل وباسورد — عند سوبابيس مباشرة، مفيش رمز ولا إرسال.
 * بنحاول ندخل الأول؛ لو الإيميل مش موجود بنعمله حساب. بترجّع كود خطأ
 * ثابت علشان الصفحة تعرضه من نصوص القاعدة بدل رسايل سوبابيس الإنجليزي.
 */
export type AuthFail =
  | 'wrongPassword'
  | 'weakPassword'
  | 'invalidEmail'
  | 'rateLimited'
  | 'notConfirmed'
  | 'disabled'
  | 'unknown'

export async function signInOrSignUp(email: string, password: string) {
  if (!DB) return mock.signInOrSignUp(email, password)

  const auth = supabase().auth
  const signIn = await auth.signInWithPassword({ email, password })
  if (!signIn.error) return { ok: true as const, created: false, token: signIn.data.session?.access_token }

  const m = signIn.error.message.toLowerCase()
  const fail = (code: AuthFail, detail?: string) => ({ ok: false as const, code, detail })
  if (m.includes('rate') || signIn.error.status === 429) return fail('rateLimited')
  // حساب اتعمل وقت ما كان «تأكيد الإيميل» شغال — لازم يتأكد أو يتمسح من لوحة سوبابيس
  if (m.includes('not confirmed')) return fail('notConfirmed', signIn.error.message)
  if (m.includes('disabled') || m.includes('not allowed')) return fail('disabled', signIn.error.message)
  if (!m.includes('invalid login')) return fail('unknown', signIn.error.message)

  // الإيميل مش مسجّل، أو الباسورد غلط — نجرّب نسجّل: لو الإيميل موجود سوبابيس هتقول
  const signUp = await auth.signUp({ email, password })
  if (!signUp.error) {
    // من غير جلسة = «تأكيد الإيميل» شغال في إعدادات سوبابيس — لازم يتقفل (DEPLOY_CHECKLIST §5.3)
    // مفيش جلسة رغم نجاح التسجيل: يا «تأكيد الإيميل» شغال، يا الإيميل موجود أصلًا
    // وسوبابيس بترجّع نجاح صامت (منع تعداد الإيميلات) — وساعتها الباسورد هو الغلط
    if (!signUp.data.session) {
      return signUp.data.user?.identities?.length === 0
        ? fail('wrongPassword')
        : fail('notConfirmed', 'signup ok, no session — confirm email is on?')
    }
    return { ok: true as const, created: true, token: signUp.data.session.access_token }
  }
  const u = signUp.error.message.toLowerCase()
  if (u.includes('already') || u.includes('registered')) return { ok: false as const, code: 'wrongPassword' as AuthFail }
  if (u.includes('password')) return { ok: false as const, code: 'weakPassword' as AuthFail }
  if (u.includes('email')) return { ok: false as const, code: 'invalidEmail' as AuthFail }
  if (u.includes('rate') || signUp.error.status === 429) return fail('rateLimited')
  if (u.includes('disabled') || u.includes('not allowed')) return fail('disabled', signUp.error.message)
  return fail('unknown', signUp.error.message)
}

/**
 * دخول بس — للي عنده حساب. ما بيعملش حساب جديد أبدًا؛ التسجيل من صفحة الانضمام.
 * الرسالة عامة عن قصد: ما بتفرّقش بين «إيميل مش موجود» و«باسورد غلط».
 */
export async function signIn(email: string, password: string) {
  if (!DB) return mock.signIn(email, password)
  const { error } = await supabase().auth.signInWithPassword({ email, password })
  if (!error) return { ok: true as const }
  const m = error.message.toLowerCase()
  if (m.includes('rate') || error.status === 429) return { ok: false as const, code: 'rateLimited' as AuthFail }
  if (m.includes('invalid login')) return { ok: false as const, code: 'wrongPassword' as AuthFail }
  if (m.includes('not confirmed')) return { ok: false as const, code: 'notConfirmed' as AuthFail, detail: error.message }
  return { ok: false as const, code: 'unknown' as AuthFail, detail: error.message }
}

/**
 * بعد أي دخول ناجح: نقرا الملف ونكتب كوكي الجلسة اللي باقي الموقع بيعتمد عليه
 * (isLoggedIn والاسم والنوع). بيرجّع false لو الحساب من غير ملف.
 */
export async function loadSessionFromProfile(): Promise<boolean> {
  if (!DB) return true
  const { data: auth } = await supabase().auth.getUser()
  const uid = auth.user?.id
  if (!uid) return false
  const { data } = await supabase()
    .from('profiles')
    .select('phone, first_name, gender, role')
    .eq('id', uid)
    .maybeSingle()
  if (!data) return false
  const r = data as { phone: string; first_name: string | null; gender: string | null; role: string }
  setSession({
    // القاعدة بتخزّن +2010… والموقع بيستخدم الشكل المحلي 010…
    phone: r.phone.replace(/^\+20/, '0'),
    firstName: r.first_name ?? '',
    gender: genderFromDb(r.gender),
    role: r.role === 'captain' ? 'captain' : 'member',
  })
  return true
}

/** خروج كامل — كوكي الموقع وجلسة سوبابيس مع بعض (قبل كده كان الكوكي بس) */
export async function signOut() {
  clearSession()
  if (DB) await supabase().auth.signOut()
}

/**
 * حذف الحساب — بينادي fn_soft_delete_profile في القاعدة (بيخفي البيانات الشخصية
 * فورًا، والمسح النهائي بعد 30 يوم عبر مهمة purge). بعد النجاح بيخرّج العضو.
 * بيرجّع true لو المسح نجح. (S6: الزرار كان بيعمل signOut بس من غير أي مسح.)
 */
export async function deleteMyAccount(): Promise<boolean> {
  if (!DB) {
    clearSession()
    return true
  }
  try {
    const { error } = await supabase().rpc('fn_soft_delete_profile')
    if (error) {
      // eslint-disable-next-line no-console
      console.warn('[الحساب] حذف الحساب وقع:', error.message)
      return false
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[الحساب] حذف الحساب وقع:', (e as Error).message)
    return false
  }
  await signOut()
  return true
}

/** بعد الدخول — نضمن إن للحساب ملف في profiles (بيتعمل على الخادم بمفتاح الخدمة) */
export async function ensureAccount(phone: string, token?: string) {
  if (!DB) return { ok: true as const }
  const headers = await authHeaders(token)
  if (!headers.authorization) {
    // الدخول نجح بس الجلسة ما اتخزّنتش في المتصفح — غالبًا كوكيز مقفولة
    return { ok: false as const, error: 'الجلسة ما اتفتحتش في المتصفح — اتأكد إن الكوكيز مسموحة وجرب تاني' }
  }
  const res = await fetch('/api/account/ensure', {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone }),
  })
  const json = await res.json().catch(() => ({}))
  return res.ok
    ? { ok: true as const }
    : { ok: false as const, error: (json.error as string | undefined) ?? 'مقدرناش نكمّل الحساب' }
}

/* ---------- الرمز — مؤجّل. المسارات شغالة لو رجعنا له (واتساب/إيميل) ---------- */

/**
 * الرمز بيروح على الإيميل المرتبط بالرقم. الإيميل لازم يتبعت لرقم جديد؛
 * لرقم مسجّل الخادم بيتجاهله وبيستخدم المتخزّن (راجع src/lib/server/otp.ts).
 */
export async function sendOtp(phone: string, email?: string) {
  if (!DB) return mock.sendOtp(phone)
  const res = await fetch('/api/otp/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, email }),
  })
  const json = await res.json()
  // ملاحظة: مفيش hint بالرمز هنا — الرمز بيروح على الإيميل بس
  return res.ok
    ? { ok: true as const, phone, to: json.to as string | undefined }
    : { ok: false as const, error: json.error ?? 'مقدرناش نبعت الرمز' }
}

export async function verifyOtp(phone: string, code: string, email?: string) {
  if (!DB) return mock.verifyOtp(phone, code)

  const res = await fetch('/api/otp/verify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code, email }),
  })
  const json = await res.json()
  if (!res.ok) return { ok: false as const, error: json.error ?? 'الرمز مش مظبوط' }

  // إنشاء الجلسة في المتصفح من التوكن اللي الخادم رجّعه
  const { error } = await supabase().auth.verifyOtp({
    token_hash: json.token_hash,
    type: 'email',
  })
  if (error) return { ok: false as const, error: 'مقدرناش نفتح الجلسة' }
  return { ok: true as const, phone }
}

/** رابط موقّع لصورة في دلو avatars الخاص — ساعة صلاحية */
export async function avatarUrl(path?: string | null): Promise<string | null> {
  if (!DB || !path) return null
  const { data } = await supabase().storage.from('avatars').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

/** الملف بشكل الفورم — لصفحة التعديل. null لو مفيش جلسة أو مفيش ملف. */
export interface ProfileForm {
  phone: string
  email: string
  firstName: string
  birthYear: string
  gender?: Gender
  area: string
  areaOther: string
  girlsOnly?: GirlsOnlyPref
  interests: string[]
  levels: Partial<Record<string, SkillLevel>>
  budget: string
  days: string[]
  avatarUrl: string | null
  agreedRules: boolean
  agreedData: boolean
}

export async function getProfileForm(): Promise<ProfileForm | null> {
  if (!DB) return null
  const { data: auth } = await supabase().auth.getUser()
  const uid = auth.user?.id
  if (!uid) return null

  const base =
    'phone, email, first_name, birth_year, gender, area, girls_only_pref, budget_max, free_slots, avatar_path, rules_accepted_at, data_consent_at'
  // area_other عمود جديد — لو الهجرة لسه ما اتطبّقتش نقرا من غيره بدل ما الصفحة تقع
  let row: Record<string, unknown> | null = null
  const withOther = await supabase().from('profiles').select(`${base}, area_other`).eq('id', uid).maybeSingle()
  if (!withOther.error) row = withOther.data as Record<string, unknown> | null
  else {
    const plain = await supabase().from('profiles').select(base).eq('id', uid).maybeSingle()
    row = plain.data as Record<string, unknown> | null
  }
  if (!row) return null

  const [{ data: ints }, { data: skills }] = await Promise.all([
    supabase().from('profile_interests').select('interests(label_ar)').eq('profile_id', uid),
    supabase().from('skill_levels').select('activity, level').eq('profile_id', uid),
    loadActivityMap(),
  ])

  const levels: Partial<Record<string, SkillLevel>> = {}
  for (const sk of (skills ?? []) as { activity: string; level: string }[]) {
    const lvl = skillFromDb(sk.level)
    if (lvl) levels[activityFromDb(sk.activity)] = lvl
  }

  return {
    phone: String(row.phone ?? '').replace(/^\+20/, '0'),
    email: String(row.email ?? ''),
    firstName: String(row.first_name ?? ''),
    birthYear: row.birth_year ? String(row.birth_year) : '',
    gender: genderFromDb(row.gender as string | null),
    area: areaFromDb(row.area as string | null),
    areaOther: String(row.area_other ?? ''),
    girlsOnly: girlsPrefFromDb(row.girls_only_pref as string | null),
    interests: ((ints ?? []) as unknown as { interests: { label_ar: string } | null }[])
      .map((r) => r.interests?.label_ar)
      .filter((x): x is string => Boolean(x)),
    levels,
    budget: budgetFromDb(row.budget_max as number | null),
    days: slotsFromDb(row.free_slots as string[] | null),
    avatarUrl: await avatarUrl(row.avatar_path as string | null),
    agreedRules: Boolean(row.rules_accepted_at),
    agreedData: Boolean(row.data_consent_at),
  }
}

export async function createAccount(profile: Partial<Profile>) {
  if (!DB) return mock.createAccount(profile)

  const { data: auth } = await supabase().auth.getUser()
  const uid = auth.user?.id
  if (!uid) return { ok: false as const, error: 'لازم تسجل دخول الأول' }

  const { error } = await supabase()
    .from('profiles')
    .update({
      first_name: profile.firstName,
      email: profile.email,
      birth_year: profile.birthYear ? Number(profile.birthYear) : null,
      gender: genderToDb(profile.gender),
      area: areaToDb(profile.area),
      girls_only_pref: girlsPrefToDb(profile.girlsOnly),
      budget_max: budgetToDb(profile.budget),
      free_slots: slotsToDb(profile.days ?? []),
      rules_accepted_at: profile.agreedRules ? new Date().toISOString() : null,
      data_consent_at: profile.agreedData ? new Date().toISOString() : null,
    })
    .eq('id', uid)

  if (error) return { ok: false as const, error: error.message }

  // المنطقة بالنص — تحديث منفصل عن قصد: لو العمود لسه ما اتضافش (الهجرة
  // 20260908230000) الملف بيتحفظ عادي والنص بس اللي بيضيع، مش الحساب كله.
  if (profile.area === 'غير كده' && profile.areaOther?.trim()) {
    const { error: aErr } = await supabase()
      .from('profiles')
      .update({ area_other: profile.areaOther.trim() })
      .eq('id', uid)
    // eslint-disable-next-line no-console
    if (aErr) console.warn('area_other لم يُحفظ — شغّل هجرة profiles_area_other:', aErr.message)
  }

  // الاهتمامات — 5 بالظبط
  if (profile.interests?.length) {
    const { data: rows } = await supabase()
      .from('interests')
      .select('id, label_ar')
      .in('label_ar', profile.interests)
    await supabase().from('profile_interests').delete().eq('profile_id', uid)
    if (rows?.length) {
      await supabase()
        .from('profile_interests')
        .insert(
          (rows as { id: string }[]).map((r) => ({ profile_id: uid, interest_id: r.id }))
        )
    }
  }

  // المستويات — الترجمة من `skill_activities`، والمجهول بيتخطّى بدل ما يتحفظ غلط
  if (profile.levels) {
    await loadActivityMap()
    const rows: { profile_id: string; activity: string; level: string }[] = []
    for (const [act, lvl] of Object.entries(profile.levels)) {
      const key = activityToDb(act)
      if (!key) {
        // نشاط مش في skill_activities — الكتابة كانت هتبقى «سباحة» بالغلط
        // eslint-disable-next-line no-console
        console.warn(`[nasbot] نشاط مش معروف، ما اتحفظش: ${act}`)
        continue
      }
      if (!lvl) continue
      rows.push({ profile_id: uid, activity: key, level: skillToDb(lvl) })
    }
    if (rows.length) {
      await supabase().from('skill_levels').upsert(rows, { onConflict: 'profile_id,activity' })
    }
  }

  return { ok: true as const, profile }
}

export async function getMe(): Promise<Me> {
  if (!DB) return mock.getMe()

  const { data: auth } = await supabase().auth.getUser()
  const uid = auth.user?.id
  if (!uid) return mock.getMe()

  const { data } = await supabase()
    .from('profiles')
    .select('id, first_name, avatar_path, type, wallet_balance, referral_code, sbota_count, role, gender')
    .eq('id', uid)
    .maybeSingle()

  if (!data) return mock.getMe()
  const r = data as {
    first_name: string; avatar_path: string | null; type: string | null
    wallet_balance: number; referral_code: string; sbota_count: number; role: string
  }
  const persona = personas.find((p) => p.id === personaIdFromDb(r.type)) ?? personas[0]

  return {
    firstName: r.first_name ?? '',
    photo: '[صورة]',
    photoUrl: await avatarUrl(r.avatar_path),
    persona,
    count: r.sbota_count ?? 0,
    credit: toPounds(r.wallet_balance ?? 0),
    referralCode: r.referral_code,
    role: r.role === 'captain' ? 'captain' : 'member',
  }
}

/* ============================================================ الحجز والدفع */

export async function book(slug: string) {
  if (!DB) return mock.book(slug)
  const s = await getSbota(slug)
  if (!s) return { ok: false as const, error: 'السبوطة دي مش موجودة' }
  return { ok: true as const, bookingId: '', slug }
}

export async function redeemReferral(code: string) {
  if (!DB) return mock.redeemReferral(code)
  const clean = code.trim().toUpperCase()
  if (clean.length < 4) return { ok: false as const, error: 'الكود ده قصير' }

  const { data: ref } = await supabase()
    .from('profiles')
    .select('id')
    .eq('referral_code', clean)
    .maybeSingle()
  if (ref) return { ok: true as const, discount: REFERRAL_DISCOUNT }

  const { data: coup } = await supabase()
    .from('coupons')
    .select('kind, value, expires_at')
    .eq('code', clean)
    .maybeSingle()
  if (!coup) return { ok: false as const, error: 'الكود ده مش شغال' }

  const c = coup as { kind: string; value: number; expires_at: string | null }
  if (c.expires_at && new Date(c.expires_at) < new Date())
    return { ok: false as const, error: 'الكود ده خلص' }

  return { ok: true as const, discount: c.kind === 'percent' ? c.value / 100 : 0 }
}

/**
 * ===== الدفع اليدوي =====
 * مفيش بوابة دلوقتي. المستخدم بيحوّل على فودافون كاش أو إنستا باي
 * وبيرفع صورة التحويل، والإدارة بتأكد.
 *
 * الخطوة 1: نحجز مبدئيًا ونجيب الرقم اللي يحوّل عليه.
 */
export async function startBooking(input: {
  slug: string
  method: 'vodafone_cash' | 'instapay'
  referralCode?: string
  useWallet?: boolean
  /** لسبوطات الشغل بس — الخادم بيتجاهله لغيرها */
  payWith?: WorkPayWith
}): Promise<
  | { ok: true; bookingId: string; amount?: number; payTo?: string; reviewHours?: number; paid?: boolean }
  | { ok: false; error: string }
> {
  if (!DB) {
    // وضع البيانات الوهمية — بنرجّع رقم تجربة
    return {
      ok: true,
      bookingId: 'b1',
      amount: 300,
      payTo: '010 0000 0000',
      reviewHours: 2,
    }
  }

  const res = await fetch('/api/pay/create', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({
      slug: input.slug,
      method: input.method,
      referralCode: input.referralCode,
      useWallet: input.useWallet ?? false,
      payWith: input.payWith,
    }),
  })
  const json = await res.json()
  if (!res.ok) return { ok: false, error: json.error ?? 'مقدرناش نبدأ الحجز' }
  return {
    ok: true,
    bookingId: json.bookingId,
    amount: json.amount,
    payTo: json.payTo,
    reviewHours: json.reviewHours,
    paid: json.paid ?? false,
  }
}

/**
 * صورة العضو — بتتضغط في المتصفح لأقصى ضلع 1024 وبتترفع JPEG على
 * avatars/<uid>/avatar.jpg (الدلو خاص، وسياسته: كل واحد مجلده هو بس).
 * المسار بيتخزّن في profiles.avatar_path.
 */
export async function uploadAvatar(file: File) {
  if (!DB) return { ok: true as const, path: null }

  const { data: auth } = await supabase().auth.getUser()
  const uid = auth.user?.id
  if (!uid) return { ok: false as const, error: 'لازم تسجل دخول الأول' }

  let blob: Blob
  try {
    blob = await shrinkImage(file, 1024)
  } catch {
    return { ok: false as const, error: 'الصورة دي مش مقروءة. جرب صورة تانية.' }
  }

  const path = `${uid}/avatar.jpg`
  const { error: upErr } = await supabase()
    .storage.from('avatars')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (upErr) return { ok: false as const, error: 'الصورة مترفعتش. جرب تاني.' }

  const { error } = await supabase().from('profiles').update({ avatar_path: path }).eq('id', uid)
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, path }
}

/** تصغير الصورة على canvas — بيحل كمان مشكلة صور الموبايل الكبيرة (حد الدلو 5MB) */
async function shrinkImage(file: File, maxSide: number): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image()
      i.onload = () => res(i)
      i.onerror = () => rej(new Error('decode'))
      i.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height))
    const w = Math.max(1, Math.round(img.width * scale))
    const h = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.drawImage(img, 0, 0, w, h)
    return await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', 0.85)
    )
  } finally {
    URL.revokeObjectURL(url)
  }
}

/** الخطوة 2: رفع صورة التحويل — الحجز بيروح لمراجعة الإدارة */
export async function submitTransfer(bookingId: string, file: File) {
  if (!DB) return { ok: true as const, bookingId }

  const path = `${bookingId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
  const { error: upErr } = await supabase().storage.from('receipts').upload(path, file)
  if (upErr) return { ok: false as const, error: 'الصورة مترفعتش. جرب تاني.' }

  const res = await fetch('/api/pay/transfer', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ bookingId, receiptPath: path }),
  })
  const json = await res.json()
  return res.ok
    ? { ok: true as const, bookingId }
    : { ok: false as const, error: json.error ?? 'مقدرناش نسجل التحويل' }
}

/** حالة الحجز — الصفحة بعد التحويل بتستخدمها */
export async function getBookingStatus(bookingId: string) {
  if (!DB) return { status: 'pending_payment' as const }
  const { data } = await supabase()
    .from('bookings').select('status').eq('id', bookingId).maybeSingle()
  return { status: ((data as { status: string } | null)?.status ?? 'pending_payment') as string }
}

export async function getBookings(): Promise<Booking[]> {
  if (!DB) return mock.getBookings()
  // حجوزاتي أنا بس. RLS بتسمح كمان بقراءة حجوزات باقي المجموعة بعد الكشف،
  // وكل الحجوزات للمدير — فمن غير الفلتر ده صفحة /me كانت بتعرض حجوزات غيري.
  const { data: auth } = await supabase().auth.getUser()
  const uid = auth.user?.id
  if (!uid) return []
  const { data } = await supabase()
    .from('bookings')
    .select(
      'id, status, sbotat(id, starts_at, reveal_at, chat_closes_at, area, area_label_ar, sbota_templates(slug, name_ar))'
    )
    .eq('profile_id', uid)
    .order('created_at', { ascending: false })
  return (data ?? []).map(bookingFromDb)
}

export async function getBooking(id: string): Promise<Booking | null> {
  if (!DB) return mock.getBooking(id)
  const { data } = await supabase()
    .from('bookings')
    .select(
      'id, status, sbotat(id, starts_at, reveal_at, chat_closes_at, area, area_label_ar, sbota_templates(slug, name_ar))'
    )
    .eq('id', id)
    .maybeSingle()
  return data ? bookingFromDb(data) : null
}

export async function cancelBooking(bookingId: string, reason?: string) {
  if (!DB) return { ok: true as const }
  const { data, error } = await supabase().rpc('fn_cancel_booking', {
    p_booking_id: bookingId,
    p_by: 'user',
    p_reason: reason ?? null,
  })
  return error ? { ok: false as const, error: error.message } : { ok: true as const, ...data }
}

/* ============================================================ المجموعة */

export interface Group {
  booking: Booking
  sbota: Sbota
  captain: Captain
  people: Person[]
  why: string
  revealed: boolean
}

export async function getGroup(bookingId: string): Promise<Group | null> {
  if (!DB) return mock.getGroup(bookingId) as unknown as Promise<Group | null>

  const booking = await getBooking(bookingId)
  if (!booking) return null
  const sbota = await getSbota(booking.slug)
  if (!sbota) return null

  const revealed = booking.revealAt ? Date.now() >= new Date(booking.revealAt).getTime() : false

  const { data: grp } = await supabase()
    .from('bookings')
    .select('sbota_groups(why_ar, captains(id, bio_line, activities, display_name, craft_ar, photo_path))')
    .eq('id', bookingId)
    .maybeSingle()

  const g = (grp as { sbota_groups?: { why_ar: string; captains: unknown } } | null)?.sbota_groups
  const captain = g?.captains
    ? captainFromDb(g.captains as Record<string, unknown>)
    : await getCaptain(sbota.captainId)

  let people: Person[] = []
  if (revealed) {
    const { data } = await supabase().rpc('fn_group_members', { p_booking_id: bookingId })
    people = (data ?? []).map((r: Record<string, unknown>) => personFromDb(r))
  }

  return {
    booking,
    sbota,
    captain,
    people,
    why: g?.why_ar ?? '',
    revealed,
  }
}

export async function requestGirlsOnly(bookingId: string) {
  if (!DB) return mock.requestGirlsOnly(bookingId)
  const { data: auth } = await supabase().auth.getUser()
  const { error } = await supabase().from('reports').insert({
    reporter_id: auth.user?.id,
    booking_id: bookingId,
    reason: 'other',
    note: 'طلب نقل لمجموعة بنات بس',
  })
  return error ? { ok: false as const, error: error.message } : { ok: true as const, bookingId }
}

/* ================================================ فتح خروجة من عضو

   نسبوط ما بقاش قايم على الكابتن والتنظيم: العضو بيفتح خروجته بنفسه.

   ⚠ كل الكتابة هنا بتمر على دوال القاعدة (`fn_create_sbota` وإخواتها)
   ومفيش ولا كتابة مباشرة على `sbotat` — بالظبط زي `fn_pair_want`.
   الباب المباشر مقفول في القاعدة أصلًا (0078)، والسعر بيتحسب **جوه**
   الدالة من القالب و`settings`، فمفيش سعر بيتبعت من المتصفح خالص.
*/

/** حدود فتح الخروجة — كلها من `settings`، مفيش رقم في الكود */
export async function getHostLimits(): Promise<HostLimits | null> {
  if (!DB) return mock.getHostLimits()
  const { data, error } = await supabase()
    .from('settings')
    .select(
      'member_sbota_min_capacity, member_sbota_max_capacity, member_sbota_max_open, ' +
        'member_sbota_min_lead_hours, member_sbota_max_days_ahead'
    )
    .maybeSingle()
  if (error || !data) return null
  const r = data as Record<string, number>
  return {
    minCapacity: r.member_sbota_min_capacity,
    maxCapacity: r.member_sbota_max_capacity,
    maxOpen: r.member_sbota_max_open,
    minLeadHours: r.member_sbota_min_lead_hours,
    maxDaysAhead: r.member_sbota_max_days_ahead,
  }
}

/**
 * بيفتح خروجة جديدة على اسم العضو الداخل — بكلامه هو، مش باختيار من قايمة.
 *
 * ⚠ مفيش سعر في المدخلات **عن قصد**: خروجة العضو الحجز فيها ببلاش على
 * نسبوط، والقاعدة بتحط صفر بالقوة. التكلفة بتتكتب في `costNote` كمعلومة
 * للناس («حوالي 150 في المكان») وكل واحد بيدفع لنفسه هناك — نسبوط ما
 * بيمسكش فلوس نيابة عن حد.
 */
export async function createSbota(input: NewSbotaInput) {
  if (!DB) return mock.createSbota(input)
  const { data, error } = await supabase().rpc('fn_create_sbota', {
    p_title: input.title,
    p_details: input.details,
    p_venue_name: input.venueName,
    p_address: input.address,
    // ⚠ قوايم التسجيل بترجّع المنطقة **بالعربي** («التجمع»)، والقاعدة
    //   عايزة قيمة `area_t` («tagamoa»). التحويل مكانه هنا في طبقة
    //   البيانات مش في الفورم — ده شغل `map-db` بالظبط.
    p_area: areaToDb(input.area),
    p_starts_at: input.startsAt,
    p_duration_min: input.durationMin,
    p_capacity: input.capacity,
    p_girls_only: input.girlsOnly ?? false,
    p_cost_note: input.costNote ?? null,
  })
  // رسالة القاعدة عربية ومكتوبة للعضو — بنعرضها زي ما هي بدل رسالة عامة.
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, id: data as string }
}

/**
 * حجز في خروجة عضو — ببلاش، من غير مسار دفع.
 *
 * ⚠ القاعدة بترفض أي سبوطة سعرها مش صفر أو مش من عضو. سياسة الإدراج
 * للعضو (0054) لسه مضيّقة على `pending_payment` وصفر فلوس — الدالة دي
 * هي الطريق المشروع الوحيد للتأكيد.
 */
export async function bookFree(sbotaId: string) {
  if (!DB) return mock.bookFree(sbotaId)
  const { data, error } = await supabase().rpc('fn_book_free', { p_sbota_id: sbotaId })
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, bookingId: data as string }
}

/** الخروجات اللي أنا فاتحها — الأعداد بس، مفيش أسماء قبل الكشف */
export async function getMyHostedSbotat(): Promise<HostedSbota[]> {
  if (!DB) return mock.getMyHostedSbotat()
  const { data, error } = await supabase().rpc('fn_my_hosted_sbotat')
  if (error || !data) return []
  return (data as {
    id: string; slug: string; name_ar: string; starts_at: string
    capacity: number; booked: number; status: string; note_ar: string | null
  }[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name_ar,
    when: whenLabel(r.starts_at),
    startsAt: r.starts_at,
    capacity: r.capacity,
    booked: r.booked,
    status: r.status,
    note: r.note_ar ?? '',
  }))
}

/** تعديل سطر صاحب الخروجة. الميعاد والسعر والعدد ما بيتعدّلوش — الناس حجزت عليهم. */
export async function updateMySbotaNote(id: string, note: string) {
  if (!DB) return mock.updateMySbotaNote(id, note)
  const { error } = await supabase().rpc('fn_update_own_sbota', { p_id: id, p_note: note })
  return error ? { ok: false as const, error: error.message } : { ok: true as const }
}

/** إلغاء خروجتي — بيترفض من القاعدة لو في حد دافع (الاسترداد شغل اللوحة). */
export async function cancelMySbota(id: string, reason?: string) {
  if (!DB) return mock.cancelMySbota(id, reason)
  const { error } = await supabase().rpc('fn_cancel_own_sbota', {
    p_id: id,
    p_reason: reason ?? null,
  })
  return error ? { ok: false as const, error: error.message } : { ok: true as const }
}

/* ============================================================ الشات */

export interface ChatRoomState {
  messages: ChatMessage[]
  closed: boolean
  closesAt: string
  title: string
  roomId?: string
}

async function roomForBooking(bookingId: string) {
  const { data } = await supabase()
    .from('bookings')
    .select('sbota_groups(chat_room_id), sbotat(sbota_templates(name_ar))')
    .eq('id', bookingId)
    .maybeSingle()
  const r = data as {
    sbota_groups?: { chat_room_id: string | null }
    sbotat?: { sbota_templates?: { name_ar: string } }
  } | null
  return {
    roomId: r?.sbota_groups?.chat_room_id ?? null,
    title: r?.sbotat?.sbota_templates?.name_ar ?? '',
  }
}

export async function getChat(bookingId: string): Promise<ChatRoomState | null> {
  if (!DB) return mock.getChat(bookingId)

  const { roomId, title } = await roomForBooking(bookingId)
  if (!roomId) return null

  const { data: room } = await supabase()
    .from('chat_rooms')
    .select('id, opens_at, closes_at, is_closed, pinned_message_id')
    .eq('id', roomId)
    .maybeSingle()
  if (!room) return null
  const rm = room as {
    closes_at: string | null; is_closed: boolean; pinned_message_id: string | null
  }

  const { data: msgs } = await supabase()
    .from('messages')
    .select(
      'id, room_id, sender_id, body, created_at, profiles!messages_sender_id_fkey(first_name)'
    )
    .eq('room_id', roomId)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  const { data: auth } = await supabase().auth.getUser()
  const me = auth.user?.id

  const { data: caps } = await supabase()
    .from('chat_members')
    .select('profile_id')
    .eq('room_id', roomId)
    .eq('role', 'captain')
  const captainIds = new Set(
    ((caps ?? []) as { profile_id: string }[]).map((c) => c.profile_id)
  )

  type DbMsg = {
    id: string; room_id: string; sender_id: string | null; body: string
    created_at: string; profiles?: { first_name: string } | null
  }
  const messages: ChatMessage[] = ((msgs ?? []) as DbMsg[]).map((r) => {
    const name = r.profiles?.first_name ?? 'حد'
    return {
      id: r.id,
      roomId: r.room_id,
      author: captainIds.has(r.sender_id ?? '') ? `الكابتن ${name}` : name,
      initial: name[0] ?? '؟',
      text: r.body,
      at: r.created_at,
      pinned: r.id === rm.pinned_message_id,
      isCaptain: captainIds.has(r.sender_id ?? ''),
      mine: r.sender_id === me,
    }
  })

  const closed = rm.is_closed || (rm.closes_at ? Date.now() >= new Date(rm.closes_at).getTime() : false)

  return { messages, closed, closesAt: rm.closes_at ?? '', title: `شات ${title}`, roomId }
}

export async function sendMessage(bookingId: string, text: string, author = 'أنا') {
  if (!DB) return mock.sendMessage(bookingId, text, author)
  const { roomId } = await roomForBooking(bookingId)
  const { data: auth } = await supabase().auth.getUser()
  const uid = auth.user?.id
  if (!roomId || !uid) throw new Error('الغرفة مش موجودة')

  const { data, error } = await supabase()
    .from('messages')
    .insert({ room_id: roomId, sender_id: uid, body: text })
    .select('id, created_at')
    .single()
  if (error) throw new Error(error.message)

  const r = data as { id: string; created_at: string }
  return {
    id: r.id,
    roomId,
    author,
    initial: author[0] ?? '؟',
    text,
    at: r.created_at,
    mine: true,
  } as ChatMessage
}

/** اشتراك لحظي — بيرجّع دالة إلغاء */
export function subscribeChat(roomId: string, onChange: () => void) {
  if (!DB) return () => {}
  const ch = supabase()
    .channel(`room:${roomId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, onChange)
    .subscribe()
  return () => {
    supabase().removeChannel(ch)
  }
}

export async function reportMessage(messageId: string) {
  if (!DB) return mock.reportMessage(messageId)
  const { data: auth } = await supabase().auth.getUser()
  const { error } = await supabase().from('reports').insert({
    reporter_id: auth.user?.id,
    message_id: messageId,
    reason: 'harassment',
  })
  return error ? { ok: false as const, error: error.message } : { ok: true as const, messageId }
}

export async function removeFromRoom(bookingId: string, personName: string, personId?: string) {
  if (!DB) return mock.removeFromRoom(bookingId, personName)
  const { roomId } = await roomForBooking(bookingId)
  if (!roomId) return { ok: false as const, error: 'الغرفة مش موجودة' }

  let target = personId
  if (!target) {
    const { data } = await supabase().rpc('fn_group_members', { p_booking_id: bookingId })
    target = (data ?? []).find(
      (p: { first_name: string }) => p.first_name === personName
    )?.profile_id
  }
  if (!target) return { ok: false as const, error: 'مالقيناش الشخص ده' }

  const { data: auth } = await supabase().auth.getUser()
  const { error } = await supabase()
    .from('chat_members')
    .update({ removed_at: new Date().toISOString(), removed_by: auth.user?.id })
    .eq('room_id', roomId)
    .eq('profile_id', target)

  return error
    ? { ok: false as const, error: error.message }
    : { ok: true as const, bookingId, personName }
}

export async function openOneOnOne(profileId: string) {
  if (!DB) return { ok: false as const, error: 'مش متاح' }
  const { data, error } = await supabase().rpc('fn_open_one_on_one', { other_id: profileId })
  return error
    ? { ok: false as const, error: 'الشات ده بيتفتح بس لما تكونوا اخترتوا بعض' }
    : { ok: true as const, roomId: data as string }
}

/* ============================================================ التقييم */

export interface ReviewPayload {
  bookingId: string
  ratings: Record<string, number>
  seeAgain: string[]
  allowPhoto: boolean
  /** المعرّفات — أدق من الأسامي لو متاحة */
  seeAgainIds?: string[]
}

export async function submitReview(payload: ReviewPayload) {
  if (!DB) return mock.submitReview(payload)

  const { data: auth } = await supabase().auth.getUser()
  const uid = auth.user?.id
  if (!uid) return { ok: false as const, error: 'لازم تسجل دخول' }

  const { data: b } = await supabase()
    .from('bookings')
    .select('sbota_id')
    .eq('id', payload.bookingId)
    .maybeSingle()
  if (!b) return { ok: false as const, error: 'الحجز مش موجود' }

  const r = payload.ratings
  await supabase().from('reviews').insert({
    booking_id: payload.bookingId,
    profile_id: uid,
    sbota_id: (b as { sbota_id: string }).sbota_id,
    score_sbota: r['السبوطة'] ?? null,
    score_captain: r['الكابتن'] ?? null,
    score_venue: r['المكان'] ?? null,
    score_group: r['المجموعة'] ?? null,
    will_rebook: (r['هتحجز تاني خلال شهر؟'] ?? 0) >= 4,
    photo_consent: payload.allowPhoto,
  })

  // «عايز تشوف مين تاني» — بيتكتب في pair_affinity، والطرف التاني ما يعرفش
  let ids = payload.seeAgainIds ?? []
  if (!ids.length && payload.seeAgain.length) {
    const { data } = await supabase().rpc('fn_group_members', {
      p_booking_id: payload.bookingId,
    })
    ids = (data ?? [])
      .filter((p: { first_name: string }) => payload.seeAgain.includes(p.first_name))
      .map((p: { profile_id: string }) => p.profile_id)
  }

  // ⚠ الكتابة عبر fn_pair_want بس (هجرة 0047). الطريقة القديمة (select ثم
  // insert/update) كانت **مستحيل** تشتغل للطرف التاني: مفيش سياسة select
  // للأعضاء على pair_affinity (سياسات 0009)، وبوستجرس بتطبّق سياسة الـ select
  // على الصفوف اللي الـ UPDATE بيقراها — فالـ select بيرجّع فاضي دايمًا،
  // والـ insert بيضرب في unique(a_id, b_id)، والـ update بيعدّي على صفر صفوف.
  // النتيجة: mutual_at عمره ما اتحط ومحدش اتوصّل بحد.
  for (const other of ids) {
    await supabase().rpc('fn_pair_want', {
      p_other: other,
      p_booking_id: payload.bookingId,
      p_want: true,
    })
  }

  return { ok: true as const, coupon: 10, payload }
}

export async function getMetBefore(): Promise<Person[]> {
  if (!DB) return mock.getMetBefore()
  const { data } = await supabase().rpc('fn_met_before')
  return (data ?? []).map((r: Record<string, unknown>) =>
    personFromDb({ ...r, initial: String(r.first_name ?? '؟')[0], line_ar: '' })
  )
}

/* ============================================================ الغامضة */

export async function getClues(): Promise<Clue[]> {
  if (!DB) return mock.getClues()
  const m = await getMystery()
  if (!m) return []
  const { data: s } = await supabase()
    .from('sbotat_public')
    .select('id')
    .eq('is_mystery', true)
    .limit(1)
    .maybeSingle()
  if (!s) return []
  const { data } = await supabase()
    .from('mystery_clues')
    .select('day_index, kind, path_or_text, unlocks_at')
    .eq('sbota_id', (s as { id: string }).id)
    .order('day_index')
  return (data ?? []).map(clueFromDb)
}

export async function getCompletedCount(): Promise<number> {
  if (!DB) return mock.getCompletedCount()
  const { data: auth } = await supabase().auth.getUser()
  if (!auth.user) return 0
  const { data } = await supabase()
    .from('profiles')
    .select('sbota_count')
    .eq('id', auth.user.id)
    .maybeSingle()
  return (data as { sbota_count: number } | null)?.sbota_count ?? 0
}

/* ====================================== لوحة صاحب الخروجة (والكابتن)

   الصفحة دي كانت «لوحة الكابتن». بعد ما المنتج بطّل يبقى قايم على
   الكابتن، بقت لوحة **اللي ماسك المجموعة** — عضو فتح الخروجة، أو كابتن
   نسبوط في السبوطات اللي لسه ليها كابتن.

   ⚠ الحد الأمني الحقيقي هو RLS مش الكود ده: سياسة `bookings_own_read`
   بتمر على `fn_is_my_sbota_revealed`، واللي 0078 وسّعتها لصاحب الخروجة
   **بعد الكشف بس**. فاللي ما لهوش حق بيشوف قايمة فاضية مش بيشوف الناس.
*/

export interface CaptainBoard {
  sbota: Sbota
  /** كابتن نسبوط — null في خروجة العضو */
  captain: Captain | null
  roster: Person[]
}

/** السبوطة بالمعرّف. `getSbota` بتاخد **slug** مش id — الفرق ده كان باج. */
async function getSbotaById(id: string): Promise<Sbota | null> {
  const { data, error } = await selectSbotat<Record<string, unknown> | null>((cols) =>
    supabase().from('sbotat_public').select(cols).eq('id', id).maybeSingle()
  )
  if (error || !data) return null
  const who = (await whoBookedMap([id])).get(id)
  return sbotaFromDb(data, who)
}

export async function getCaptainBoard(sbotaId: string): Promise<CaptainBoard | null> {
  if (!DB) return mock.getCaptainBoard(sbotaId) as unknown as Promise<CaptainBoard | null>

  // ⚠ كان بينادي `getSbota(sbotaId)` وهي بتدوّر بالـslug — يعني بترجّع null
  //   دايمًا واللوحة كانت فاضية على طول. باج قديم، بان دلوقتي وإحنا بنحوّلها.
  const sbota = await getSbotaById(sbotaId)
  if (!sbota) return null
  // خروجة العضو مالهاش كابتن — و`getCaptain('')` بترجّع كابتن وهمي.
  const captain = sbota.captainId ? await getCaptain(sbota.captainId) : null

  // هنا بس الصور بتظهر — اللي ماسك المجموعة محتاج يعرف الناس عند البوابة
  // ⚠ `.eq('sbota_id')` كان ناقص: من غيره الاستعلام بيرجّع **كل** الحجوزات
  //   اللي RLS تسمح بيها، يعني كشوف سبوطات تانية بتتخلط في اللوحة دي.
  const { data } = await supabase()
    .from('bookings')
    .select(
      'id, checked_in_at, profiles!bookings_profile_id_fkey(id, first_name, type, avatar_path, sbota_count)'
    )
    .eq('sbota_id', sbotaId)
    .in('status', ['paid', 'attended'])

  type DbRoster = {
    checked_in_at: string | null
    profiles: {
      id: string; first_name: string; type: string | null
      avatar_path: string | null; sbota_count: number
    } | null
  }
  const roster: Person[] = ((data ?? []) as DbRoster[]).map((r) => {
    const p = personas.find((x) => x.id === personaIdFromDb(r.profiles?.type)) ?? personas[0]
    return {
      id: r.profiles?.id,
      name: r.profiles?.first_name ?? '',
      initial: (r.profiles?.first_name ?? '؟')[0],
      tag: p.name,
      line: (r.profiles?.sbota_count ?? 0) === 0 ? 'أول مرة' : `المرة ${(r.profiles?.sbota_count ?? 0) + 1}`,
      tagColors: p.colors,
      photo: r.profiles?.avatar_path ?? '[صورة]',
      arrived: Boolean(r.checked_in_at),
    }
  })

  return { sbota, captain, roster }
}

export async function markArrived(
  sbotaId: string,
  name: string,
  arrived: boolean,
  bookingId?: string
) {
  if (!DB) return mock.markArrived(sbotaId, name, arrived)
  if (!bookingId) return { ok: false as const, error: 'محتاجين معرّف الحجز' }
  const { data: auth } = await supabase().auth.getUser()
  const { error } = await supabase()
    .from('bookings')
    .update({
      checked_in_at: arrived ? new Date().toISOString() : null,
      checked_in_by: arrived ? auth.user?.id : null,
    })
    .eq('id', bookingId)
  return error ? { ok: false as const, error: error.message } : { ok: true as const, sbotaId, name, arrived }
}

export async function uploadGroupPhotos(sbotaId: string, count: number, files?: File[]) {
  if (!DB || !files?.length) return mock.uploadGroupPhotos(sbotaId, count)
  const { data: auth } = await supabase().auth.getUser()
  for (const f of files) {
    const path = `${sbotaId}/${Date.now()}-${f.name}`
    const { error } = await supabase().storage.from('sbota-photos').upload(path, f)
    if (!error) {
      await supabase().from('sbota_photos').insert({
        sbota_id: sbotaId,
        path,
        uploaded_by: auth.user?.id,
        signed_by_captain: true,
      })
    }
  }
  return { ok: true as const, sbotaId, count: files.length }
}

export async function saveCaptainReport(sbotaId: string, fields: string[]) {
  if (!DB) return mock.saveCaptainReport(sbotaId, fields)
  const { data: cap } = await supabase().rpc('fn_my_captain_id')
  if (!cap) return { ok: false as const, error: 'مش كابتن' }
  const { error } = await supabase().from('captain_reports').upsert(
    {
      sbota_id: sbotaId,
      captain_id: cap as string,
      what_worked: fields[0] ?? null,
      what_didnt: fields[1] ?? null,
      incident: fields[2] ?? null,
      suggestion: fields[3] ?? null,
      attendance_json: { notes: fields[4] ?? '' },
    },
    { onConflict: 'sbota_id,captain_id' }
  )
  return error ? { ok: false as const, error: error.message } : { ok: true as const, sbotaId, fields }
}

/* ============================================================ اللعبة والتحليلات */

/**
 * إعدادات اللعبة — الأسئلة والاختيارات والنقاط والأنواع.
 * كلها من القاعدة وبتتعدّل من /admin/game. لو القاعدة مش متاحة
 * بنرجع للنسخة الاحتياطية علشان اللعبة تفضل شغالة.
 */
export async function getGameConfig(): Promise<GameConfig> {
  if (!DB) return gameFallback

  const db = supabase()
  const [q, t] = await Promise.all([
    db
      .from('game_questions')
      .select(
        'id, order, question_ar, kind, required, progress_label_ar, placeholder_ar, is_active,' +
          ' game_options(id, order, label_ar, icon_key, value, is_active,' +
          ' game_option_scores(type_key, points))'
      )
      .eq('is_active', true)
      .order('order'),
    db.from('personality_types').select('*').eq('is_active', true).order('order'),
  ])

  if (q.error || t.error || !q.data?.length || !t.data?.length) return gameFallback

  type ScoreRow = { type_key: string; points: number }
  type OptRow = {
    id: string; order: number; label_ar: string; icon_key: string | null
    value: string; is_active: boolean; game_option_scores: ScoreRow[]
  }
  type QRow = {
    id: string; order: number; question_ar: string; kind: string; required: boolean
    progress_label_ar: string | null; placeholder_ar: string | null
    game_options: OptRow[]
  }
  type TRow = {
    key: string; name_ar: string; name_ar_f: string; line_ar: string
    sticker_bg: string; sticker_fg: string
  }

  const questions = (q.data as unknown as QRow[]).map((row) => ({
    id: row.id,
    // المفتاح اللي بتتخزن بيه الإجابة — بيتبع ترتيب السؤال
    slot: `q${row.order}`,
    text: row.question_ar,
    kind: (['single', 'multi', 'text'].includes(row.kind) ? row.kind : 'single') as GameKind,
    required: row.required,
    progressLabel: row.progress_label_ar ?? '',
    placeholder: row.placeholder_ar ?? '',
    options: (row.game_options ?? [])
      .filter((o) => o.is_active)
      .sort((a, b) => a.order - b.order)
      .map((o) => ({
        id: o.id,
        label: o.label_ar,
        iconKey: o.icon_key ?? 'mood',
        value: o.value,
        scores: Object.fromEntries(
          (o.game_option_scores ?? []).map((sc) => [sc.type_key, sc.points])
        ),
      })),
  }))

  const types = (t.data as unknown as TRow[]).map((row) => ({
    key: row.key,
    name: row.name_ar,
    nameF: row.name_ar_f,
    line: row.line_ar,
    bg: row.sticker_bg,
    fg: row.sticker_fg,
  }))

  return { questions, types }
}

/** نوع اللعبة → شكل Persona اللي الواجهات بتعرفه */
function personaFromType(t: GameConfig['types'][number]): Persona {
  const known = personas.find((p) => p.id === t.key)
  return {
    // المعرّف بيفضل من القايمة المعروفة علشان الكتابة في profiles.type،
    // بس كل اللي بيتعرض (الاسم والجملة واللون) جاي من اللوحة.
    id: known?.id ?? personas[0].id,
    name: t.name,
    nameF: t.nameF,
    line: t.line,
    colors: { bg: t.bg, fg: t.fg },
  }
}

export async function finishGame(answers: GameAnswers) {
  const cfg = await getGameConfig()
  const persona = personaFromType(resultFor(cfg, answers))
  const next = (await getSbotat()).find((s) => !s.full) ?? (await mock.finishGame(answers)).next

  if (DB) {
    const { data: auth } = await supabase().auth.getUser()
    if (auth.user) {
      await supabase()
        .from('profiles')
        .update({ type: personaToDb(persona.id), type_scores: answers as unknown as object })
        .eq('id', auth.user.id)
    }
  }
  return { persona, next }
}

export async function subscribeSchedule(phone: string) {
  if (!DB) return mock.subscribeSchedule(phone)
  const e164 = phone.startsWith('+') ? phone : `+2${phone.replace(/\D/g, '')}`
  const { error } = await supabase()
    .from('weekly_schedule_subs')
    .upsert({ phone: e164 }, { onConflict: 'phone' })
  return error ? { ok: false as const, error: error.message } : { ok: true as const, phone }
}

/** التحليلات — بتتكتب في جدول events بدون أي بيانات شخصية زيادة */
export async function logEvent(name: string, props: Record<string, unknown> = {}) {
  if (!DB) return
  const { data: auth } = await supabase().auth.getUser()
  await supabase().from('events').insert({
    name,
    props,
    profile_id: auth.user?.id ?? null,
  })
}

/* ============================================================ الشغل */

/**
 * أي طلب لسوبابيس ممكن **يرمي** (شبكة مقطوعة، مفتاح غلط، الخدمة واقعة) —
 * مش بس يرجّع error. الصفحات هنا بتتحكم في العرض بحالة `null`، فرمية واحدة
 * كانت بتسيبها على «ثانية واحدة…» للأبد. كل دوال الشغل بتعدي من هنا
 * فبترجّع البديل بدل ما ترمي.
 */
const WORK_TIMEOUT_MS = 8000

async function safeWork<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    // المهلة مش رفاهية: الطلب ممكن **يعلّق** من غير ما يرمي (شبكة بتبلع الحزم،
    // الخدمة واقعة) — وساعتها الصفحة تفضل على «ثانية واحدة…» للأبد.
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

/**
 * أعمدة settings.work_* — بالقروش في القاعدة، بالجنيه هنا.
 * أي عمود ناقص (الهجرة لسه ما اتطبّقتش) بياخد الافتراضي من lists.ts.
 */
/**
 * الافتراضي الكامل — أعمدة الشغل + افتراضي جدول اليوم. الاتنين مصدرهم
 * `src/data/lists.ts`، وبنركّبهم هنا علشان WorkSettings بقت شايلة ساعتَي
 * الغدا والشكوى كمان (A16).
 */
const WORK_SETTINGS_FALLBACK: WorkSettings = {
  ...workSettingsDefaults,
  lunchAt: workScheduleDefaults.lunchAt,
  complaintAt: workScheduleDefaults.complaintAt,
}

export async function getWorkSettings(): Promise<WorkSettings> {
  if (!DB) return { ...WORK_SETTINGS_FALLBACK }
  return safeWork(
    'getWorkSettings',
    async () => {
        const { data, error } = await supabase().from('settings').select('*').limit(1).maybeSingle()
        if (error || !data) return { ...WORK_SETTINGS_FALLBACK }
        return workSettingsFromDb(data as Record<string, unknown>)
    },
    { ...WORK_SETTINGS_FALLBACK }
  )
}

/**
 * رقم الطوارئ من `settings.emergency_phone` (A15).
 *
 * كان متحطوط في `src/data/lists.ts` كرقم **وهمي** (`+201000000000`) ومعروض
 * في /rules كزرار اتصال — يعني عضو في مشكلة كان هيرن على رقم مش بتاعنا،
 * والمالك بيعدّل الرقم في اللوحة ومحدش بيقراه.
 *
 * بترجّع `null` لو مفيش رقم متظبط، والصفحة بتخفي الزرار خالص — إخفاء أنضف
 * من رقم غلط.
 */
export async function getEmergencyPhone(): Promise<string | null> {
  if (!DB) return null
  return safeWork(
    'getEmergencyPhone',
    async () => {
      const { data, error } = await supabase()
        .from('settings')
        .select('emergency_phone')
        .limit(1)
        .maybeSingle()
      if (error || !data) return null
      const raw = String((data as { emergency_phone?: string | null }).emergency_phone ?? '').trim()
      // الأرقام الوهمية (كلها أصفار بعد كود الدولة) بتتعامل كأنها فاضية
      if (!raw || /^\+?2?0?1?0{6,}$/.test(raw.replace(/[\s-]/g, ''))) return null
      return raw
    },
    null as string | null
  )
}

/** أماكن الشغل من work_venues_public — مفتاحها venue_id */
async function workVenuesMap(venueIds: string[]): Promise<Map<string, WorkVenue>> {
  const out = new Map<string, WorkVenue>()
  const ids = Array.from(new Set(venueIds.filter(Boolean)))
  if (!ids.length) return out
  const { data } = await supabase().from('work_venues_public').select('*').in('venue_id', ids)
  for (const row of (data ?? []) as Record<string, unknown>[]) {
    // جاية من سبوطة معلنة أصلًا — العنوان مسموح (والعرض نفسه بيخفيه لو مش مسموح)
    const v = workVenueFromDb(row, true)
    out.set(v.venueId, v)
  }
  return out
}

/** الأعمدة الزيادة اللي بنحتاجها من sbotat_public لسبوطة الشغل (العرض بيجيب work_config من القالب) */
const WORK_SBOTA_COLS = `${SBOTA_COLS}, template_id, venue_id, is_work, work_config`

function workSbotaFromRows(
  row: Record<string, unknown>,
  who: Parameters<typeof sbotaFromDb>[1],
  venue: WorkVenue | null,
  /** افتراضي جدول اليوم من settings — القالب بيغلبه لو حدّد (A16) */
  schedDefaults?: { lunchAt: string; complaintAt: string }
): WorkSbota {
  const base = sbotaFromDb(row, who)
  const r = row as { id: string; work_config?: unknown }
  return {
    ...base,
    kind: 'work',
    venueName: venue?.name ?? base.venueName,
    tags: Array.from(new Set([...base.tags, 'شغل'])),
    sbotaId: r.id,
    venue,
    schedule: workScheduleFromConfig(r.work_config ?? null, schedDefaults),
  }
}

/** نسخة وهمية — من بيانات mock (السبوطات اللي kind = work) */
function mockWorkVenue(name: string, area: string): WorkVenue {
  return {
    venueId: 'v-mock',
    name,
    area,
    kind: 'cafe_work',
    desksCount: 6,
    wifiMbps: 80,
    wifiNote: '',
    outlets: 'plenty',
    noise: 'quiet',
    hasMeetingRoom: false,
    hasParking: true,
    hasAc: true,
    minConsumption: 60,
    openFrom: '09:00',
    openTo: '23:00',
    bestDays: ['تلات', 'أربع'],
    photos: ['[صورة — الترابيزة الكبيرة واللابتوبات]'],
    address: '',
    hasUpcomingSbota: true,
  }
}

async function mockWorkSbotat(): Promise<WorkSbota[]> {
  const all = await mock.getSbotat({ timeOfDay: 'day' })
  return all
    .filter((s) => s.kind === 'work')
    .map((s) => ({
      ...s,
      sbotaId: `mock-${s.slug}`,
      venue: mockWorkVenue(s.venueName ?? '', s.area),
      schedule: workScheduleFromConfig(null),
    }))
}

/** سبوطات الشغل المعلنة في الـ 14 يوم الجايين */
export async function getWorkSbotat(): Promise<WorkSbota[]> {
  if (!DB) return mockWorkSbotat()
  return safeWork(
    'getWorkSbotat',
    async () => {

        const now = new Date()
        const until = new Date(now.getTime() + WORK_WINDOW_DAYS * 24 * 3600_000)
        const { data, error } = await supabase()
          .from('sbotat_public')
          .select(WORK_SBOTA_COLS)
          .eq('is_work', true)
          .eq('is_mystery', false)
          .gte('starts_at', now.toISOString())
          .lte('starts_at', until.toISOString())
          .order('starts_at', { ascending: true })
        if (error || !data) return []

        const rows = data as unknown as Record<string, unknown>[]
        const [who, venues, cfg] = await Promise.all([
          whoBookedMap(rows.map((r) => r.id as string)),
          workVenuesMap(rows.map((r) => String(r.venue_id ?? ''))),
          getWorkSettings(),
        ])
        return rows.map((r) =>
          workSbotaFromRows(r, who.get(r.id as string), venues.get(String(r.venue_id ?? '')) ?? null, {
            lunchAt: cfg.lunchAt,
            complaintAt: cfg.complaintAt,
          })
        )
    },
    []
  )
}

/** سبوطة شغل واحدة بالـ slug — null لو مش موجودة أو مش شغل */
export async function getWorkSbota(slug: string): Promise<WorkSbota | null> {
  if (!DB) return (await mockWorkSbotat()).find((s) => s.slug === slug) ?? null

  const { data, error } = await supabase()
    .from('sbotat_public')
    .select(WORK_SBOTA_COLS)
    .eq('slug', slug)
    .eq('is_work', true)
    .gte('starts_at', new Date(Date.now() - 6 * 3600_000).toISOString())
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null

  const row = data as unknown as Record<string, unknown>
  const id = row.id as string
  const [who, venues, cfg] = await Promise.all([
    whoBookedMap([id]),
    workVenuesMap([String(row.venue_id ?? '')]),
    getWorkSettings(),
  ])
  return workSbotaFromRows(row, who.get(id), venues.get(String(row.venue_id ?? '')) ?? null, {
    lunchAt: cfg.lunchAt,
    complaintAt: cfg.complaintAt,
  })
}

/**
 * أماكن الشغل النشطة للصفحة العامة.
 * العنوان بيتعرض بس لو للمكان سبوطة شغل معلنة قدام — العرض بيقول has_open_sbota
 * (وبيخفي address أصلًا لو مفيش)، وبنأكد من sbotat_public كمان.
 */
export async function getWorkVenues(): Promise<WorkVenue[]> {
  if (!DB) {
    const list = await mockWorkSbotat()
    return list.map((s) => s.venue).filter((v): v is WorkVenue => Boolean(v))
  }
  return safeWork(
    'getWorkVenues',
    async () => {

        const [{ data: venues, error }, { data: upcoming }] = await Promise.all([
          supabase().from('work_venues_public').select('*').eq('is_active', true).order('name'),
          supabase()
            .from('sbotat_public')
            .select('venue_id')
            .eq('is_work', true)
            .gte('starts_at', new Date().toISOString()),
        ])
        if (error || !venues) return []
        const withSbota = new Set(
          ((upcoming ?? []) as { venue_id: string | null }[]).map((r) => r.venue_id ?? '')
        )
        return (venues as Record<string, unknown>[]).map((row) =>
          workVenueFromDb(
            row,
            Boolean(row.has_open_sbota) || withSbota.has(String(row.venue_id ?? ''))
          )
        )
    },
    []
  )
}

/** مجالات المجموعة — الدالة نفسها بترجّع العدد بس قبل الكشف */
export async function getGroupProfessions(sbotaId: string): Promise<GroupProfession[]> {
  if (!DB) {
    return [
      { name: 'مصممة', count: 1 },
      { name: 'مطور', count: 1 },
      { name: 'كاتبة محتوى', count: 1 },
      { name: 'مسوّق', count: 1 },
    ]
  }
  return safeWork(
    'getGroupProfessions',
    async () => {
        const { data, error } = await supabase().rpc('fn_group_professions', { p_sbota_id: sbotaId })
        if (error) return []
        return professionsFromDb(data)
    },
    []
  )
}

/** أقدم كارت نشط للمستخدم الحالي — null لو مفيش أو مش داخل */
export async function getMyActivePass(): Promise<WorkPass | null> {
  if (!DB) return null
  return safeWork(
    'getMyActivePass',
    async () => {
        const { data: auth } = await supabase().auth.getUser()
        const uid = auth.user?.id
        if (!uid) return null
        const { data, error } = await supabase()
          .from('work_passes')
          .select('id, kind, sessions_total, sessions_used, expires_at, status')
          .eq('profile_id', uid)
          .eq('status', 'active')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        if (error || !data) return null
        return workPassFromDb(data as Record<string, unknown>)
    },
    null
  )
}

/** هل حجز سبوطة شغل قبل كده (مدفوعة أو حضرها)؟ — بيحدد عرض «أول مرة» */
export async function hasPriorWorkBooking(): Promise<boolean> {
  if (!DB) return false
  return safeWork(
    'hasPriorWorkBooking',
    async () => {
        const { data: auth } = await supabase().auth.getUser()
        const uid = auth.user?.id
        if (!uid) return false
        const { data, error } = await supabase()
          .from('bookings')
          .select('id, sbotat!inner(is_work)')
          .eq('profile_id', uid)
          .eq('sbotat.is_work', true)
          .in('status', ['paid', 'attended'])
          .limit(1)
        if (error) return false
        return (data ?? []).length > 0
    },
    false
  )
}

/** نموذج الشركات → fn_submit_lead (إدراج للكل بحد معدل) */
export async function submitLead(input: LeadInput) {
  if (!DB) return { ok: true as const }
  const digits = input.phone.replace(/\D/g, '')
  const e164 = input.phone.trim().startsWith('+') ? `+${digits}` : `+2${digits}`
  const { error } = await supabase().rpc('fn_submit_lead', {
    p_company: input.company.trim(),
    p_contact_name: input.contactName.trim(),
    p_phone: e164,
    p_people_count: input.peopleCount,
    p_times_per_month: input.timesPerMonth,
    p_note: input.note?.trim() || null,
  })
  return error ? { ok: false as const, error: error.message } : { ok: true as const }
}

export { genderFromDb, toPiastres }
