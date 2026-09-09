/**
 * ============================================================
 *  طبقة القوايم — حقول التسجيل وكتل الخريطة
 * ============================================================
 *
 *  ليه الملف ده موجود (مراجعة A4 · A5):
 *    • /admin/profile-fields كان بيعدّل profile_fields · field_options ·
 *      skill_activities · consents — و/join بتقرا من src/data/lists.ts.
 *    • /admin/map بيعدّل venues — والخريطة العامة بتقرا من src/data/areas.ts.
 *    يعني المالك بيعدّل ومفيش حاجة بتتغيّر. الملف ده بيوصّل السلك.
 *
 *  نفس نمط src/lib/copy.ts بالظبط:
 *    القاعدة هي المصدر · والقوايم في src/data هي **الاحتياطي** لما القاعدة
 *    مش متاحة (hasSupabase=false) أو الطلب وقع أو رجّع فاضي.
 *
 *  ونفس حارس safeWork في src/lib/work.ts: كل قراءة عليها مهلة — الطلب ممكن
 *  يعلّق من غير ما يرمي، وساعتها الصفحة تفضل بتلف للأبد. المهلة مش رفاهية.
 *
 *  ⚠ الاتفاق مع القاعدة: `field_options.value` هي القيمة اللي طبقة البيانات
 *  بتفهمها (جداول الترجمة في map-db.ts)، و`label_ar` هو النص المعروض. يعني
 *  المالك يقدر يغيّر الاسم المعروض من اللوحة من غير ما يكسر الحفظ.
 */

import { supabase, hasSupabase } from '@/lib/supabase'
import {
  interests as FB_INTERESTS,
  defaultInterests as FB_DEFAULT_INTERESTS,
  MAX_INTERESTS as FB_MAX_INTERESTS,
  areas as FB_AREAS,
  skillLevels as FB_SKILL_LEVELS,
  sports as FB_SPORTS,
  budgets as FB_BUDGETS,
  days as FB_DAYS,
  defaultDays as FB_DEFAULT_DAYS,
  girlsOnlyOptions as FB_GIRLS_ONLY,
} from '@/data/lists'
import { mapAreas as FB_MAP_AREAS, mysteryPin as FB_MYSTERY } from '@/data/areas'

/** بيتحدد مرة واحدة عند التحميل — نفس نمط api.ts و work.ts */
const DB = hasSupabase

/* ============================================================ الحارس */

const LISTS_TIMEOUT_MS = 8000

/**
 * نسخة من safeWork في work.ts — الملف ده ما بيلمسش work.ts ولا api.ts.
 * أي وقوع بيرجّع الاحتياطي، والصفحة بترسم عادي.
 */
async function safeList<T>(label: string, run: () => Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      run(),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('المهلة خلصت')), LISTS_TIMEOUT_MS)
      }),
    ])
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[القوايم] ${label} وقع — بنكمّل بالاحتياطي:`, (e as Error).message)
    return fallback
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/* ============================================================ الأنواع */

/** خيار واحد: `value` للقاعدة و`label` للعرض */
export interface Choice {
  value: string
  label: string
}

export interface RegistrationLists {
  interests: Choice[]
  defaultInterests: string[]
  maxInterests: number
  areas: Choice[]
  budgets: Choice[]
  days: Choice[]
  defaultDays: string[]
  girlsOnly: Choice[]
  skillLevels: Choice[]
  sports: Choice[]
  /** نص الموافقة بمفتاحه — 'rules' و'privacy'. فاضي = استعمل نص الكوبي */
  consents: Record<string, string>
  /** true يعني القوايم جت من القاعدة فعلًا */
  fromDb: boolean
}

/** كتلة منطقة على الخريطة — مساحة الرسم 400×520 */
export interface MapBlock {
  key: string
  label: string
  /** المنطقة المعدودة (area_t) — بتقابل «راحها قبل كده» */
  area: string | null
  /** أسماء المناطق المعروضة اللي بتقع في الكتلة دي */
  matchLabels: string[]
  x: number
  y: number
  w: number
  h: number
  r: number
  lx: number
  ly: number
  far: boolean
  note: string | null
}

export interface MapData {
  blocks: MapBlock[]
  mystery: { x: number; y: number }
  /** أكواد المناطق (area_t) اللي صاحب الحساب راحها */
  visitedAreas: string[]
  fromDb: boolean
}

/** نقطة سبوطة بعد ما اتحطت جوه كتلة منطقتها */
export interface PlacedPin {
  slug: string
  x: number
  y: number
}

/* ============================================================ الاحتياطي */

const choices = (list: readonly string[]): Choice[] =>
  list.map((v) => ({ value: v, label: v }))

/** القوايم من الكود — نفس شكل اللي جاي من القاعدة */
export const listsFallback: RegistrationLists = {
  interests: choices(FB_INTERESTS),
  defaultInterests: [...FB_DEFAULT_INTERESTS],
  maxInterests: FB_MAX_INTERESTS,
  areas: choices(FB_AREAS),
  budgets: choices(FB_BUDGETS),
  days: choices(FB_DAYS),
  defaultDays: [...FB_DEFAULT_DAYS],
  girlsOnly: choices(FB_GIRLS_ONLY),
  skillLevels: choices(FB_SKILL_LEVELS),
  sports: choices(FB_SPORTS),
  consents: {},
  fromDb: false,
}

/** كتل الخريطة من الكود */
export const mapFallback: MapData = {
  blocks: FB_MAP_AREAS.map((a) => ({
    key: a.id,
    label: a.label,
    area: null,
    matchLabels: [a.label],
    x: a.x,
    y: a.y,
    w: a.w,
    h: a.h,
    r: a.r,
    lx: a.lx,
    ly: a.ly,
    far: !!a.far,
    note: a.note ?? null,
  })),
  mystery: { ...FB_MYSTERY },
  visitedAreas: [],
  fromDb: false,
}

/* ============================================================ حقول التسجيل */

interface OptionRow {
  field_key: string
  value: string
  label_ar: string
  order: number
}

/** خيارات حقل واحد، ولو فاضية بترجع الاحتياطي بتاعه */
function pick(rows: OptionRow[], key: string, fallback: Choice[]): Choice[] {
  const list = rows
    .filter((r) => r.field_key === key)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((r) => ({ value: r.value, label: r.label_ar || r.value }))
  return list.length ? list : fallback
}

/**
 * قوايم نموذج التسجيل من القاعدة.
 * كل قايمة بترجع للاحتياطي **لوحدها** — لو المالك قفل قايمة واحدة بالغلط،
 * ما بتقعش الصفحة كلها.
 */
export async function getRegistrationLists(): Promise<RegistrationLists> {
  if (!DB) return listsFallback

  return safeList(
    'getRegistrationLists',
    async () => {
      const db = supabase()
      const [fields, options, skills, consents] = await Promise.all([
        db.from('profile_fields').select('key, validation').eq('is_active', true),
        // `order` كلمة محجوزة في PostgREST — بناخد الصف كله وهما جداول صغيرة
        db.from('field_options').select('*').eq('is_active', true),
        db.from('skill_activities').select('*').eq('is_active', true),
        db.from('consents').select('key, text_ar').not('published_at', 'is', null),
      ])

      const optionRows = (options.data ?? []) as unknown as OptionRow[]
      if (!optionRows.length && !skills.data?.length) return listsFallback

      const interests = pick(optionRows, 'interests', listsFallback.interests)
      const values = new Set(interests.map((c) => c.value))
      const preset = listsFallback.defaultInterests.filter((v) => values.has(v))

      const days = pick(optionRows, 'free_slots', listsFallback.days)
      const dayValues = new Set(days.map((c) => c.value))

      const sportRows = ((skills.data ?? []) as unknown as {
        label_ar: string
        order: number
      }[])
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      const sports = sportRows.length
        ? sportRows.map((s) => ({ value: s.label_ar, label: s.label_ar }))
        : listsFallback.sports

      const validation = ((fields.data ?? []) as { key: string; validation: unknown }[]).find(
        (f) => f.key === 'interests'
      )?.validation as Record<string, unknown> | undefined
      const max = Number(validation?.max)

      const texts: Record<string, string> = {}
      for (const c of (consents.data ?? []) as { key: string; text_ar: string }[]) {
        if (c.text_ar) texts[c.key] = c.text_ar
      }

      return {
        interests,
        // الاختيار الافتراضي بيتفلتر على المتاح — عشان ما نبدأش بخيار مقفول
        defaultInterests: preset.length ? preset : [],
        maxInterests: Number.isFinite(max) && max > 0 ? max : listsFallback.maxInterests,
        areas: pick(optionRows, 'area', listsFallback.areas),
        budgets: pick(optionRows, 'budget', listsFallback.budgets),
        days,
        defaultDays: listsFallback.defaultDays.filter((d) => dayValues.has(d)),
        girlsOnly: pick(optionRows, 'girls_only', listsFallback.girlsOnly),
        skillLevels: pick(optionRows, 'skill_level', listsFallback.skillLevels),
        sports,
        consents: texts,
        fromDb: true,
      }
    },
    listsFallback
  )
}

/* ============================================================ الخريطة */

interface AreaRow {
  key: string
  label_ar: string
  area: string | null
  match_labels: string[] | null
  x: number
  y: number
  w: number
  h: number
  r: number
  lx: number
  ly: number
  is_far: boolean
  note_ar: string | null
  is_mystery: boolean
}

/**
 * كتل الخريطة + نقطة الغامضة + المناطق اللي صاحب الحساب راحها.
 * القراية العامة من `map_areas` (سياسة القراية بتسمح للزائر بالنشط بس).
 * الحجوزات بترجع فاضية للزائر — ده متوقّع، مش خطأ.
 */
export async function getMapData(): Promise<MapData> {
  if (!DB) return mapFallback

  return safeList(
    'getMapData',
    async () => {
      const db = supabase()
      const [areas, mine] = await Promise.all([
        db
          .from('map_areas')
          .select(
            'key, label_ar, area, match_labels, x, y, w, h, r, lx, ly, is_far, note_ar, is_mystery'
          )
          .eq('is_active', true)
          .order('sort', { ascending: true }),
        db.from('bookings').select('sbotat(area)').in('status', ['paid', 'attended']),
      ])

      const rows = (areas.data ?? []) as unknown as AreaRow[]
      if (!rows.length) return mapFallback

      const visitedAreas = Array.from(
        new Set(
          ((mine.data ?? []) as { sbotat?: { area?: string } }[])
            .map((r) => r.sbotat?.area)
            .filter(Boolean) as string[]
        )
      )

      const mysteryRow = rows.find((r) => r.is_mystery)
      return {
        blocks: rows
          .filter((r) => !r.is_mystery)
          .map((r) => ({
            key: r.key,
            label: r.label_ar,
            area: r.area,
            matchLabels: r.match_labels?.length ? r.match_labels : [r.label_ar],
            x: r.x,
            y: r.y,
            w: r.w,
            h: r.h,
            r: r.r,
            lx: r.lx,
            ly: r.ly,
            far: r.is_far,
            note: r.note_ar,
          })),
        mystery: mysteryRow ? { x: mysteryRow.lx, y: mysteryRow.ly } : mapFallback.mystery,
        visitedAreas,
        fromDb: true,
      }
    },
    mapFallback
  )
}

/**
 * بيحط نقطة كل سبوطة جوه كتلة منطقتها.
 *
 * قبل كده النقط كانت قايمة يدوية بـ ٧ slugs في src/data/areas.ts — يعني أي
 * سبوطة جديدة عمرها ما كانت تبان على الخريطة. دلوقتي كل سبوطة معروضة ليها
 * نقطة، ومكانها محسوب من منطقتها.
 *
 * الترتيب شبكة ثابتة جوه الكتلة (مش عشوائي) — نفس المدخلات = نفس الرسم،
 * وما فيش نقطة بتخرج بره الكتلة.
 */
export function placePins(
  blocks: MapBlock[],
  sbotat: { slug: string; area: string; tags?: string[] }[]
): PlacedPin[] {
  const byBlock = new Map<string, { slug: string }[]>()

  for (const s of sbotat) {
    const labels = [s.area, ...(s.tags ?? [])].filter(Boolean)
    const block =
      blocks.find((b) => labels.some((l) => b.matchLabels.includes(l))) ??
      blocks.find((b) => b.label === s.area)
    if (!block) continue
    const list = byBlock.get(block.key) ?? []
    list.push({ slug: s.slug })
    byBlock.set(block.key, list)
  }

  const pins: PlacedPin[] = []
  const PAD = 22

  for (const block of blocks) {
    const list = byBlock.get(block.key)
    if (!list?.length) continue

    const cols = Math.ceil(Math.sqrt(list.length))
    const rows = Math.ceil(list.length / cols)
    const innerW = Math.max(block.w - PAD * 2, 0)
    const innerH = Math.max(block.h - PAD * 2, 0)

    list.forEach((item, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      pins.push({
        slug: item.slug,
        x: Math.round(block.x + PAD + (innerW * (col + 0.5)) / cols),
        y: Math.round(block.y + PAD + (innerH * (row + 0.5)) / rows),
      })
    })
  }

  return pins
}
