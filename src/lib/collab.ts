'use client'

/**
 * ============================================================
 *  طبقة التعاون — «عايز تشوف مين تاني؟» و«عايز تشتغل مع مين؟»
 *  + بيانات الشغل في التسجيل واللعبة.
 *
 *  ليه ملف لوحده مش جوه api.ts؟ لأن الكتابة في الجدولين (pair_affinity
 *  و work_affinity) **لازم** تعدي على دوال security definer — مفيش سياسة
 *  select للأعضاء على أي منهم، فأي upsert مباشر من المتصفح بيضرب.
 *  الملف ده هو المنفذ الوحيد للحاجتين دول من ناحية العميل.
 * ============================================================
 */

import { supabase, hasSupabase } from '@/lib/supabase'
import { slotsToDb, slotsFromDb } from '@/lib/map-db'

const DB = hasSupabase

/**
 * نفس نمط safeWork في api.ts: أي طلب ممكن يرمي أو **يعلّق** من غير ما يرمي،
 * وساعتها الصفحة تفضل على السبينر للأبد. المهلة 8 ثواني والرجوع للبديل.
 */
const COLLAB_TIMEOUT_MS = 8000

async function safeCollab<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      run(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('المهلة خلصت')), COLLAB_TIMEOUT_MS)
      }),
    ])
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[التعاون] ${label} وقع:`, (e as Error).message)
    return fallback
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/* ============================================================ الأنواع */

/** حالة التبادل — نفس اللي بترجّعه fn_pair_want / fn_work_want */
export type CollabState = 'mutual' | 'none'

export type WorkStyleKey = 'silent' | 'chatty' | 'depends'
export type ExperienceKey = 'under_1' | 'one_to_three' | 'three_to_five' | 'five_plus'
export type WorkStatusKey =
  | 'freelancer'
  | 'remote_employee'
  | 'business_owner'
  | 'student'
  | 'employee'
  | 'other'

export const WORK_STYLE_KEYS: readonly WorkStyleKey[] = ['silent', 'chatty', 'depends']
export const EXPERIENCE_KEYS: readonly ExperienceKey[] = [
  'under_1',
  'one_to_three',
  'three_to_five',
  'five_plus',
]
export const WORK_STATUS_KEYS: readonly WorkStatusKey[] = [
  'freelancer',
  'remote_employee',
  'business_owner',
  'student',
  'employee',
  'other',
]

/** الحالات اللي بتفتح خطوة الشغل في التسجيل من غير ?from=shoghl */
export const WORK_STEP_TRIGGERS: readonly WorkStatusKey[] = ['freelancer', 'remote_employee']

export interface ProfessionOption {
  id: string
  key: string
  nameAr: string
  iconKey: string | null
  color: string | null
}

/** زميل في نفس المجموعة — الاسم والمعرّف بس، زي fn_group_members بالظبط */
export interface Mate {
  id: string
  firstName: string
}

export interface BookingCollab {
  /** الحجز ده لسبوطة شغل؟ */
  isWork: boolean
  /** زمايل المجموعة بعد الكشف — فاضية قبله */
  mates: Mate[]
}

export interface WorkProfileForm {
  workStatus: WorkStatusKey | null
  professionId: string | null
  workStyle: WorkStyleKey | null
  yearsExperience: ExperienceKey | null
  /** أيام بالعربي زي صفحة الانضمام — بتتحوّل لأكواد free_slots عند الحفظ */
  workDays: string[]
}

export const emptyWorkProfile: WorkProfileForm = {
  workStatus: null,
  professionId: null,
  workStyle: null,
  yearsExperience: null,
  workDays: [],
}

/* ============================================================ مساعدات */

function asState(v: unknown): CollabState {
  return v === 'mutual' ? 'mutual' : 'none'
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null
}

async function myId(): Promise<string | null> {
  const { data } = await supabase().auth.getUser()
  return data.user?.id ?? null
}

/* ============================================================ الاختيار المتبادل */

/**
 * «عايز أشوف الشخص ده تاني» — بتكتب جهتي أنا بس في pair_affinity.
 *
 * ⚠ ما تكتبش في الجدول مباشرة. سياسات 0009 مدّياش الأعضاء سياسة select،
 * وبوستجريس بتطبّق سياسة الـ select على الصفوف اللي الـ UPDATE بيقراها —
 * يعني الـ update بيعدّي على صفر صفوف، والـ insert بيضرب في
 * unique(a_id, b_id). fn_pair_want (هجرة 0047) هي المنفذ الوحيد الشغّال.
 */
export async function pairWant(
  otherId: string,
  bookingId?: string,
  want = true
): Promise<CollabState | null> {
  if (!DB) return null
  return safeCollab(
    'pairWant',
    async () => {
      const { data, error } = await supabase().rpc('fn_pair_want', {
        p_other: otherId,
        p_booking_id: bookingId ?? null,
        p_want: want,
      })
      if (error) return null
      return asState(data)
    },
    null
  )
}

/** «عايز أشتغل مع الشخص ده» — نفس الحكاية بالظبط بس على work_affinity */
export async function workWant(
  otherId: string,
  bookingId?: string,
  want = true
): Promise<CollabState | null> {
  if (!DB) return null
  return safeCollab(
    'workWant',
    async () => {
      const { data, error } = await supabase().rpc('fn_work_want', {
        p_other: otherId,
        p_booking_id: bookingId ?? null,
        p_want: want,
      })
      if (error) return null
      return asState(data)
    },
    null
  )
}

/** في تبادل بيني وبين الشخص ده في الشغل؟ (fn_work_collab_state) */
export async function workCollabState(otherId: string): Promise<CollabState> {
  if (!DB) return 'none'
  return safeCollab(
    'workCollabState',
    async () => {
      const { data, error } = await supabase().rpc('fn_work_collab_state', { p_other: otherId })
      if (error) return 'none' as CollabState
      return asState(data)
    },
    'none' as CollabState
  )
}

/* ============================================================ التقييم */

/**
 * الحجز ده لسبوطة شغل؟ ومين زمايلي فيه؟
 * الأسامي من fn_group_members (بعد الكشف بس — قبله بترجّع فاضي).
 */
export async function getBookingCollab(bookingId: string): Promise<BookingCollab> {
  const empty: BookingCollab = { isWork: false, mates: [] }
  if (!DB) return empty
  return safeCollab(
    'getBookingCollab',
    async () => {
      const { data: b } = await supabase()
        .from('bookings')
        .select('sbota_id')
        .eq('id', bookingId)
        .maybeSingle()
      const sbotaId = (b as { sbota_id?: string } | null)?.sbota_id
      if (!sbotaId) return empty

      const [s, m] = await Promise.all([
        supabase().from('sbotat_public').select('is_work').eq('id', sbotaId).maybeSingle(),
        supabase().rpc('fn_group_members', { p_booking_id: bookingId }),
      ])

      const rows = (m.data ?? []) as { profile_id?: string; first_name?: string | null }[]
      return {
        isWork: Boolean((s.data as { is_work?: boolean } | null)?.is_work),
        mates: rows
          .filter((r): r is { profile_id: string; first_name: string | null } => !!r.profile_id)
          .map((r) => ({ id: r.profile_id, firstName: (r.first_name ?? '').trim() })),
      }
    },
    empty
  )
}

/* ============================================================ المجالات */

/** قاموس المجالات — القراءة مفتوحة للكل (سياسة professions_read) */
export async function getProfessions(): Promise<ProfessionOption[]> {
  if (!DB) return []
  return safeCollab(
    'getProfessions',
    async () => {
      const { data, error } = await supabase()
        .from('professions')
        .select('id, key, name_ar, icon_key, color')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) return []
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.id),
        key: String(r.key ?? ''),
        nameAr: String(r.name_ar ?? ''),
        iconKey: r.icon_key ? String(r.icon_key) : null,
        color: r.color ? String(r.color) : null,
      }))
    },
    []
  )
}

/* ============================================================ ملف الشغل */

/** أعمدة الشغل في ملفي — للتعبئة المسبقة في وضع التعديل */
export async function getMyWorkProfile(): Promise<WorkProfileForm | null> {
  if (!DB) return null
  return safeCollab(
    'getMyWorkProfile',
    async () => {
      const uid = await myId()
      if (!uid) return null
      const { data, error } = await supabase()
        .from('profiles')
        .select('work_status, profession_id, work_style, years_experience, work_days_pref')
        .eq('id', uid)
        .maybeSingle()
      if (error || !data) return null
      const r = data as Record<string, unknown>
      return {
        workStatus: oneOf(r.work_status, WORK_STATUS_KEYS),
        professionId: r.profession_id ? String(r.profession_id) : null,
        workStyle: oneOf(r.work_style, WORK_STYLE_KEYS),
        yearsExperience: oneOf(r.years_experience, EXPERIENCE_KEYS),
        workDays: slotsFromDb((r.work_days_pref ?? []) as string[]),
      }
    },
    null
  )
}

/**
 * حفظ أعمدة الشغل على ملفي.
 * بنكتب الأعمدة اللي اتملت بس — علشان اللي بيعدّل من اللعبة ما يمسحش
 * اللي كتبه في التسجيل والعكس.
 */
export async function saveWorkProfile(
  form: Partial<WorkProfileForm>
): Promise<{ ok: boolean; error?: string }> {
  if (!DB) return { ok: true }
  return safeCollab(
    'saveWorkProfile',
    async () => {
      const uid = await myId()
      if (!uid) return { ok: false, error: 'لازم تسجل دخول' }

      const patch: Record<string, unknown> = {}
      if (form.workStatus) patch.work_status = form.workStatus
      if (form.professionId) patch.profession_id = form.professionId
      if (form.workStyle) patch.work_style = form.workStyle
      if (form.yearsExperience) patch.years_experience = form.yearsExperience
      if (form.workDays?.length) patch.work_days_pref = slotsToDb(form.workDays)
      if (!Object.keys(patch).length) return { ok: true }

      const { error } = await supabase().from('profiles').update(patch).eq('id', uid)
      return error ? { ok: false, error: error.message } : { ok: true }
    },
    { ok: false, error: 'الشبكة مش راضية — جرّب تاني' }
  )
}

/** اللعبة: سؤال «بتشتغل في إيه؟» بيكتب المجال بس */
export async function saveMyProfession(professionId: string): Promise<boolean> {
  const res = await saveWorkProfile({ professionId })
  return res.ok
}

/* ============================================================ اللعبة */

/**
 * اللعبة مالهاش سؤال «بتشتغل إيه؟» مثبّت في الكود — أسئلتها كلها من القاعدة
 * وبتتعدّل من /admin/game. فبدل ما نربط الكود بسؤال بعينه، بندوّر على إجابة
 * فيها كلمة «فريلانسر» (أو freelancer) في أي سؤال. أول ما اللوحة تضيف
 * الاختيار ده لأي سؤال، سؤال المجال بيظهر لوحده — ولغير كده ما بيظهرش.
 */
const FREELANCER_MARKERS = ['فريلانس', 'freelance', 'شغل حر', 'حسابي الخاص']

export function looksFreelancer(answers: Record<string, unknown>): boolean {
  const values: string[] = []
  for (const v of Object.values(answers)) {
    if (typeof v === 'string') values.push(v)
    else if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') values.push(x)
  }
  const hay = values.join(' | ').toLowerCase()
  return FREELANCER_MARKERS.some((m) => hay.includes(m.toLowerCase()))
}

/* ============================================================ اللعبة → التسجيل */

/**
 * اللعبة بتتلعب من غير تسجيل دخول، فلو محدش داخل بنسيب اختيار المجال في
 * المتصفح لحد ما يعمل حساب — وصفحة الانضمام بتقراه وتبعته مع باقي بيانات
 * الشغل. من غير كده الإجابة كانت هتضيع خالص.
 */
const PENDING_KEY = 'nasbot.work.pendingProfession'

export function rememberProfession(professionId: string) {
  try {
    window.localStorage.setItem(PENDING_KEY, professionId)
  } catch {
    // متصفح مقفّل التخزين — الإجابة بتضيع وخلاص، مش سبب نكسر الصفحة
  }
}

export function takePendingProfession(): string | null {
  try {
    const v = window.localStorage.getItem(PENDING_KEY)
    if (v) window.localStorage.removeItem(PENDING_KEY)
    return v
  } catch {
    return null
  }
}

/* ============================================================ شغالين معاك */

/**
 * زميل شغل في تبادل معايا — اللي بيتعرض في «شغالين معاك» في /me/shoghl.
 * مفيش أي حاجة هنا بتكشف اختيار الطرف التاني: الاسم والمجال بييجوا من
 * work_group_members (زمايل مجموعتي بعد الكشف بس)، والتبادل نفسه بييجي من
 * fn_work_collab_state اللي بترجّع mutual/none وخلاص.
 */
export interface WorkCollab {
  /** معرّف الملف — بيتبعت لـ openOneOnOne */
  id: string
  firstName: string
  professionAr: string | null
  professionIcon: string | null
  professionColor: string | null
  /** «اتقابلنا في» — ممكن يكونوا فاضيين لو السبوطة عدّت وما بقتش مقروءة */
  sbotaName: string | null
  venueName: string | null
}

/**
 * أكتر 3 سبوطات شغل حجزتهم — الحد ده مقصود.
 * مفيش دالة بترجّع كل التبادلات بتاعتي دفعة واحدة (fn_work_collab_state
 * بتفحص زوج واحد بس)، فبنسأل عن زمايل آخر 3 سبوطات وخلاص بدل عشرات النداءات.
 */
const COLLAB_MAX_SBOTAT = 3
/** وحتى لو السبوطات الـ 3 مليانة: أقصى عدد نداء لـ fn_work_collab_state */
const COLLAB_MAX_CANDIDATES = 18

interface MateRow {
  sbota_id?: string | null
  profile_id?: string | null
  first_name?: string | null
  profession_ar?: string | null
  profession_icon?: string | null
  profession_color?: string | null
}

/**
 * «شغالين معاك» — اللي بيني وبينهم تبادل في الشغل.
 *
 * الطريق الطويل ده سببه إن مفيش `fn_my_work_collabs()` في القاعدة:
 *   1. حجوزاتي (الأحدث الأول) — علشان نعرف ترتيب سبوطاتي
 *   2. `work_group_members` — زمايلي في سبوطات الشغل بعد الكشف بس
 *   3. أحدث 3 سبوطات مشتركة → زمايلهم من غير تكرار
 *   4. `fn_work_collab_state` لكل واحد — دي القراءة الوحيدة المسموحة لـ work_affinity
 * الكل جوه safeCollab واحدة، فأقصى انتظار 8 ثواني وبعدها قايمة فاضية.
 */
export async function getMyWorkCollabs(): Promise<WorkCollab[]> {
  if (!DB) return []
  return safeCollab(
    'getMyWorkCollabs',
    async () => {
      // نداء واحد بدل ٥ استعلامات + نداء لكل زميل. الدالة security definer
      // (هجرة 0051) وبترجّع الصفوف اللي فيها تبادل بس — الاختيار من طرف
      // واحد عمره ما يخرج منها. وبتقدر كمان تسمّي سبوطة خلصت، وده اللي
      // البناء من الواجهة ما كانش يقدر عليه لأن sbotat_public بتعرض المفتوح بس.
      const { data } = await supabase().rpc('fn_my_work_collabs')
      return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: String(r.profile_id ?? ''),
        firstName: String(r.first_name ?? ''),
        professionAr: (r.profession_ar as string | null) ?? null,
        professionIcon: (r.profession_icon as string | null) ?? null,
        professionColor: (r.profession_color as string | null) ?? null,
        sbotaName: (r.sbota_name_ar as string | null) ?? null,
        venueName: (r.venue_name as string | null) ?? null,
      })).filter((c) => c.id && c.firstName)
    },
    []
  )
}
