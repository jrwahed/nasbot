/**
 * الترجمة بين القاعدة (إنجليزي) والواجهة (عربي).
 * الواجهات ما بتعرفش القاعدة خالص — كل التحويل هنا وفي api.ts بس.
 */

import type {
  Gender,
  GirlsOnlyPref,
  SkillLevel,
  Sbota,
  Person,
  Captain,
  Booking,
  Clue,
  PersonaId,
} from '@/types'
import { personas } from '@/data/personas'

/* ---------------------------------------------------------- الأنواع البسيطة */

export const genderToDb = (g?: Gender | null) =>
  g === 'بنت' ? 'female' : g === 'شاب' ? 'male' : null

export const genderFromDb = (g?: string | null): Gender | undefined =>
  g === 'female' ? 'بنت' : g === 'male' ? 'شاب' : undefined

export const girlsPrefToDb = (p?: GirlsOnlyPref | null) =>
  p === 'دايمًا' ? 'always' : p === 'أحيانًا' ? 'sometimes' : p === 'مش مهم' ? 'no' : null

const SKILL_TO_DB: Record<SkillLevel, string> = {
  'أول مرة': 'first_time',
  مبتدئ: 'beginner',
  متوسط: 'intermediate',
  كويس: 'good',
}
export const skillToDb = (s: SkillLevel) => SKILL_TO_DB[s]

const AREA_TO_DB: Record<string, string> = {
  التجمع: 'tagamoa',
  المعادي: 'maadi',
  'زايد-أكتوبر': 'zayed_october',
  'مصر الجديدة-مدينة نصر': 'heliopolis_nasr',
  'وسط-زمالك': 'downtown_zamalek',
  'غير كده': 'other',
}
const AREA_FROM_DB: Record<string, string> = Object.fromEntries(
  Object.entries(AREA_TO_DB).map(([ar, en]) => [en, ar])
)
export const areaToDb = (a?: string | null) => (a ? (AREA_TO_DB[a] ?? 'other') : null)
export const areaFromDb = (a?: string | null) => (a ? (AREA_FROM_DB[a] ?? 'غير كده') : '')

/** بادل + جري + سباحة → أسماء القاعدة */
export const activityToDb = (a: string) =>
  a === 'بادل' ? 'padel' : a === 'جري' ? 'running' : 'swimming'

/** الميزانية «لحد 500» → 500 */
export const budgetToDb = (b?: string | null) => {
  if (!b) return null
  const m = b.match(/\d+/)
  return m ? Number(m[0]) : null
}

/** أيام الأسبوع من اللعبة → free_slots */
const SLOT_TO_DB: Record<string, string> = {
  'خميس بالليل': 'thu_night',
  'جمعة الصبح': 'fri_morning',
  'جمعة بالليل': 'fri_night',
  'وسط الأسبوع': 'midweek',
}
export const slotsToDb = (days: string[]) =>
  days.map((d) => SLOT_TO_DB[d]).filter(Boolean)

/* ---------------------------------------------------------- الفلوس */

/** القاعدة بالقروش والواجهة بالجنيه */
export const toPounds = (piastres: number) => Math.round(piastres / 100)
export const toPiastres = (pounds: number) => Math.round(pounds * 100)
export const priceLabel = (piastres: number) => `${toPounds(piastres)} جنيه`

/* ---------------------------------------------------------- التواريخ */

const DAY_AR: Record<string, string> = {
  Sun: 'الحد', Mon: 'الاتنين', Tue: 'التلات', Wed: 'الأربع',
  Thu: 'الخميس', Fri: 'الجمعة', Sat: 'السبت',
}

/** «الخميس 8 بالليل» — دايمًا بتوقيت القاهرة مهما كان جهاز المستخدم */
export function whenLabel(iso: string): string {
  if (!iso) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  }).formatToParts(new Date(iso))

  const wd = parts.find((p) => p.type === 'weekday')?.value ?? 'Thu'
  const h24 = Number(parts.find((p) => p.type === 'hour')?.value ?? 0)
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const part =
    h24 < 5 ? 'بالليل' : h24 < 12 ? 'الصبح' : h24 < 16 ? 'الضهر' : h24 < 19 ? 'المغرب' : 'بالليل'
  return `${DAY_AR[wd] ?? ''} ${h12} ${part}`
}

/** «ساعتين» · «تلات ساعات» */
export function durationLabel(min: number): string {
  const h = Math.round(min / 60)
  if (h <= 1) return 'ساعة'
  if (h === 2) return 'ساعتين'
  if (h <= 10) return `${['', '', '', 'تلات', 'أربع', 'خمس', 'ست', 'سبع', 'تمن', 'تسع', 'عشر'][h]} ساعات`
  return `${h} ساعة`
}

/* ---------------------------------------------------------- الأنواع الكبيرة */

type DbSbota = Record<string, unknown>

/** صف من sbotat_public → شكل Sbota اللي الواجهة بتفهمه */
export function sbotaFromDb(
  row: DbSbota,
  who?: {
    booked: number
    total: number
    girls: number
    boys: number
    age_min: number | null
    age_max: number | null
    first_timers: number
    returning_count: number
  } | null,
  address?: { address: string; venue_name: string } | null
): Sbota {
  const r = row as {
    id: string; slug: string; name_ar: string; story_ar: string; kind: string
    mood_ar: string | null; meta_prefix_ar: string | null; level_ar: string | null
    price: number; capacity: number; status: string
    girls_only: boolean; is_day: boolean; is_mystery: boolean
    starts_at: string; duration_min: number; area: string | null; area_label_ar: string | null
    includes_ar: string[]; excludes_ar: string[]; hero_photos: string[]
    org_fee: number; captain_id: string | null
  }

  const booked = who?.booked ?? 0
  const left = Math.max(0, r.capacity - booked)
  const full = r.status === 'full' || left === 0

  return {
    slug: r.slug,
    name: r.name_ar,
    meta: [r.meta_prefix_ar, whenLabel(r.starts_at), r.area_label_ar ?? areaFromDb(r.area)]
      .filter(Boolean)
      .join(' · '),
    mood: r.mood_ar ?? '',
    price: priceLabel(r.price),
    priceValue: toPounds(r.price),
    priceNote: '',
    left: full ? 'كامل' : `فاضل ${left} من ${r.capacity}`,
    spotsLeft: left,
    spotsTotal: r.capacity,
    full,
    girls: r.girls_only,
    kind: r.is_mystery ? 'mystery' : r.kind === 'work' ? 'work' : 'normal',
    timeOfDay: r.is_day ? 'day' : 'night',
    area: r.area_label_ar ?? areaFromDb(r.area),
    tags: [areaFromDb(r.area), r.area_label_ar ?? '', r.kind === 'work' ? 'شغل' : '']
      .filter(Boolean),
    img: r.hero_photos?.[0] ?? '[صورة]',
    gallery: r.hero_photos ?? [],
    captainId: r.captain_id ?? '',
    story: r.story_ar,
    when: whenLabel(r.starts_at),
    duration: durationLabel(r.duration_min),
    level: r.level_ar ?? '',
    addressHint: address ? '' : '(العنوان بعد الحجز)',
    address: address?.address ?? '',
    venueName: address?.venue_name ?? '',
    includes: r.includes_ar ?? [],
    excludes: r.excludes_ar ?? [],
    priceBreakdown: `شامل ${toPounds(r.org_fee)} جنيه رسوم تنظيم المجموعة والكابتن.`,
    whoBooked: {
      booked,
      total: r.capacity,
      line: whoLine(who),
      revealLine: 'هتعرف مجموعتك قبلها بيوم الساعة 8 بالليل.',
    },
  }
}

/** «3 بنات و2 شباب · الأعمار 25–31 · اتنين أول مرة · تلاتة رايحين معانا قبل كده.» */
function whoLine(w?: {
  girls: number; boys: number; age_min: number | null; age_max: number | null
  first_timers: number; returning_count: number
} | null): string {
  if (!w || (w.girls === 0 && w.boys === 0)) return 'لسه محدش حجز — كن أول واحد.'
  const n = (x: number) =>
    ['', 'واحد', 'اتنين', 'تلاتة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'تمانية'][x] ?? String(x)
  const parts: string[] = []
  if (w.girls && w.boys) parts.push(`${w.girls} بنات و${w.boys} شباب`)
  else if (w.girls) parts.push(`${w.girls} بنات`)
  else if (w.boys) parts.push(`${w.boys} شباب`)
  if (w.age_min && w.age_max) parts.push(`الأعمار ${w.age_min}–${w.age_max}`)
  if (w.first_timers) parts.push(`${n(w.first_timers)} أول مرة`)
  if (w.returning_count) parts.push(`${n(w.returning_count)} رايحين معانا قبل كده`)
  return parts.join(' · ') + '.'
}

export function captainFromDb(row: Record<string, unknown>): Captain {
  const r = row as {
    id: string
    bio_line: string
    display_name: string | null
    craft_ar: string | null
    photo_path: string | null
  }
  const name = r.display_name ?? ''
  const craft = r.craft_ar ?? ''
  return {
    id: r.id,
    name: name ? `الكابتن ${name}` : 'الكابتن',
    craft,
    title: craft ? `الكابتن ${name} — ${craft}` : `الكابتن ${name}`,
    line: r.bio_line,
    intro: r.bio_line,
    gateLine: r.bio_line,
    photo: r.photo_path ?? '[صورة]',
  }
}

const PERSONA_BY_ID: Record<string, PersonaId> = {
  explorer: 'explorer',
  social_captain: 'social',
  quiet_observer: 'quiet',
  first_timer: 'firsttime',
  energy: 'energy',
  storyteller: 'storyteller',
}
export const personaIdFromDb = (t?: string | null) =>
  (t ? PERSONA_BY_ID[t] : undefined) ?? 'explorer'
export const personaToDb = (id: PersonaId) =>
  Object.entries(PERSONA_BY_ID).find(([, v]) => v === id)?.[0] ?? 'explorer'

export function personFromDb(row: Record<string, unknown>, gender?: string): Person {
  const r = row as {
    profile_id: string; first_name: string; initial: string
    persona: string | null; line_ar: string; avatar_path?: string | null
  }
  const p = personas.find((x) => x.id === personaIdFromDb(r.persona)) ?? personas[0]
  const isF = gender === 'female'
  return {
    id: r.profile_id,
    name: r.first_name,
    initial: r.initial || r.first_name?.[0] || '؟',
    tag: isF ? p.nameF : p.name,
    line: r.line_ar,
    tagColors: p.colors,
    photo: r.avatar_path ?? '[صورة]',
  }
}

export function bookingFromDb(row: Record<string, unknown>): Booking {
  const r = row as {
    id: string; status: string
    sbotat: {
      id: string; starts_at: string; reveal_at: string; chat_closes_at: string
      area: string | null
      area_label_ar: string | null
      sbota_templates: { slug: string; name_ar: string } | null
    } | null
  }
  const s = r.sbotat
  const past = ['attended', 'no_show', 'refunded'].includes(r.status)
    || (s ? new Date(s.starts_at).getTime() < Date.now() : false)
  return {
    id: r.id,
    slug: s?.sbota_templates?.slug ?? '',
    sbotaName: s?.sbota_templates?.name_ar ?? '',
    when: s ? whenLabel(s.starts_at) : '',
    area: s?.area_label_ar ?? areaFromDb(s?.area),
    startsAt: s?.starts_at ?? '',
    revealAt: s?.reveal_at ?? '',
    chatClosesAt: s?.chat_closes_at ?? '',
    status: past ? 'past' : 'upcoming',
    reviewed: false,
    paid: r.status === 'paid' || r.status === 'attended',
  }
}

export function clueFromDb(row: Record<string, unknown>): Clue {
  const r = row as {
    day_index: number; kind: string; path_or_text: string; unlocks_at: string
  }
  return {
    day: r.day_index,
    kind: r.kind as Clue['kind'],
    label: `الدليل ${['', 'الأول', 'التاني', 'التالت', 'الرابع', 'الخامس', 'السادس', 'السابع'][r.day_index]}`,
    content: r.path_or_text,
    unlocked: new Date(r.unlocks_at).getTime() <= Date.now(),
  }
}
