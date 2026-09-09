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
  DaySchedule,
  GroupProfession,
  NoiseLevel,
  OutletsLevel,
  WorkPass,
  WorkSettings,
  WorkVenue,
} from '@/types'
import { personas } from '@/data/personas'
import { workScheduleDefaults, workSettingsDefaults } from '@/data/lists'

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
  // أيام الأسبوع من صفحة الانضمام — كانت بتضيع لأنها مش في الخريطة
  سبت: 'sat',
  حد: 'sun',
  اتنين: 'mon',
  تلات: 'tue',
  أربع: 'wed',
  خميس: 'thu',
  جمعة: 'fri',
}
const SLOT_FROM_DB: Record<string, string> = Object.fromEntries(
  Object.entries(SLOT_TO_DB).map(([k, v]) => [v, k])
)
export const slotsToDb = (days: string[]) =>
  days.map((d) => SLOT_TO_DB[d]).filter(Boolean)
export const slotsFromDb = (slots?: string[] | null) =>
  (slots ?? []).map((s) => SLOT_FROM_DB[s]).filter(Boolean)

export const girlsPrefFromDb = (p?: string | null): GirlsOnlyPref | undefined =>
  p === 'always' ? 'دايمًا' : p === 'sometimes' ? 'أحيانًا' : p === 'no' ? 'مش مهم' : undefined

const SKILL_FROM_DB: Record<string, SkillLevel> = Object.fromEntries(
  Object.entries(SKILL_TO_DB).map(([k, v]) => [v, k as SkillLevel])
)
export const skillFromDb = (s?: string | null): SkillLevel | undefined =>
  s ? SKILL_FROM_DB[s] : undefined
export const activityFromDb = (a: string) =>
  a === 'padel' ? 'بادل' : a === 'running' ? 'جري' : 'سباحة'

/** 500 → «لحد 500». null في القاعدة = «مفيش مشكلة» (القيد بيسمح بـ 250/500/1000 بس) */
export const budgetFromDb = (n?: number | null): string =>
  n === 250 ? 'لحد 250' : n === 500 ? 'لحد 500' : n === 1000 ? 'لحد 1000' : 'مفيش مشكلة'

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

/* ---------------------------------------------------------- الشغل */


export const outletsFromDb = (v?: string | null): OutletsLevel | null =>
  v === 'few' || v === 'enough' || v === 'plenty' ? v : null

export const noiseFromDb = (v?: string | null): NoiseLevel | null =>
  v === 'quiet' || v === 'medium' || v === 'lively' ? v : null

const venueKindFromDb = (k?: string | null): WorkVenue['kind'] =>
  k === 'cafe_work' || k === 'coworking' ? k : 'other'

/** «10:00:00» → «10:00» */
export const clockFromDb = (t?: string | null): string => {
  if (!t) return ''
  const m = String(t).match(/^(\d{1,2}):(\d{2})/)
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : String(t)
}

/** «13:00» → «1 الضهر» · «14:30» → «2:30 الضهر» */
export function hourLabel(hhmm: string): string {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return hhmm
  const h24 = Number(m[1])
  const min = m[2]
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  const part =
    h24 < 5 ? 'بالليل' : h24 < 12 ? 'الصبح' : h24 < 16 ? 'الضهر' : h24 < 19 ? 'العصر' : 'بالليل'
  return `${h12}${min === '00' ? '' : `:${min}`} ${part}`
}

/** صف settings → أرقام الشغل بالجنيه. أي عمود ناقص بياخد الافتراضي. */
export function workSettingsFromDb(row: Record<string, unknown> | null): WorkSettings {
  const n = (k: string, d: number) => {
    const v = row?.[k]
    return typeof v === 'number' && Number.isFinite(v) ? v : d
  }
  const s = (k: string, d: string) => {
    const v = row?.[k]
    return typeof v === 'string' && v ? v : d
  }
  const D = workSettingsDefaults
  return {
    pass4Price: row?.work_pass4_price != null ? toPounds(n('work_pass4_price', 0)) : D.pass4Price,
    pass4Weeks: n('work_pass4_weeks', D.pass4Weeks),
    pass8Price: row?.work_pass8_price != null ? toPounds(n('work_pass8_price', 0)) : D.pass8Price,
    pass8Weeks: n('work_pass8_weeks', D.pass8Weeks),
    singlePrice:
      row?.work_single_price != null ? toPounds(n('work_single_price', 0)) : D.singlePrice,
    firstTimePrice:
      row?.work_first_time_price != null
        ? toPounds(n('work_first_time_price', 0))
        : D.firstTimePrice,
    vodafoneNumber: s('vodafone_number', D.vodafoneNumber),
    instapayHandle: s('instapay_handle', D.instapayHandle),
    reviewHours: n('manual_review_hours', D.reviewHours),
  }
}

/** صف من work_venues_public → WorkVenue. سعر الجملة مش في العرض أصلًا. */
export function workVenueFromDb(
  row: Record<string, unknown>,
  hasUpcomingSbota = false
): WorkVenue {
  const r = row as {
    venue_id: string
    name: string | null
    kind: string | null
    area: string | null
    area_label_ar: string | null
    desks_count: number | null
    wifi_mbps: number | null
    wifi_note_ar: string | null
    power_outlets: string | null
    noise_level: string | null
    has_meeting_room: boolean | null
    has_parking: boolean | null
    has_ac: boolean | null
    min_consumption: number | null
    open_from: string | null
    open_to: string | null
    best_days: string[] | null
    photos: string[] | null
    address: string | null
  }
  return {
    venueId: r.venue_id,
    name: r.name ?? '',
    area: r.area_label_ar ?? areaFromDb(r.area),
    kind: venueKindFromDb(r.kind),
    desksCount: r.desks_count ?? null,
    wifiMbps: r.wifi_mbps ?? null,
    wifiNote: r.wifi_note_ar ?? '',
    outlets: outletsFromDb(r.power_outlets),
    noise: noiseFromDb(r.noise_level),
    hasMeetingRoom: Boolean(r.has_meeting_room),
    hasParking: Boolean(r.has_parking),
    hasAc: Boolean(r.has_ac),
    minConsumption: r.min_consumption != null ? toPounds(r.min_consumption) : null,
    openFrom: clockFromDb(r.open_from),
    openTo: clockFromDb(r.open_to),
    bestDays: slotsFromDb(r.best_days),
    photos: r.photos ?? [],
    // العنوان بيتعرض بس لو فيه سبوطة شغل معلنة — حتى لو العرض رجّعه
    address: hasUpcomingSbota ? (r.address ?? '') : '',
    hasUpcomingSbota,
  }
}

/** sbota_templates.work_config → جدول اليوم. أي حقل ناقص بياخد الافتراضي. */
export function workScheduleFromConfig(cfg: unknown): DaySchedule {
  const c = (cfg && typeof cfg === 'object' ? cfg : {}) as Record<string, unknown>
  const str = (k: string, d: string) => {
    const v = c[k]
    return typeof v === 'string' && v ? clockFromDb(v) : d
  }
  const D = workScheduleDefaults
  const start = str('start', D.start)
  const end = str('end', D.end)
  const lunchAt = str('lunch_hour_at', D.lunchAt)
  const complaintAt = str('complaint_hour_at', D.complaintAt)
  const raw = Array.isArray(c.focus_blocks) ? c.focus_blocks : []
  const focusBlocks = raw
    .map((b) => {
      if (typeof b === 'string') return b
      if (b && typeof b === 'object') {
        const o = b as { from?: string; to?: string; start?: string; end?: string }
        const f = clockFromDb(o.from ?? o.start)
        const t = clockFromDb(o.to ?? o.end)
        return f && t ? `${f}–${t}` : ''
      }
      return ''
    })
    .filter(Boolean)
  return {
    start,
    end,
    lunchAt,
    complaintAt,
    focusBlocks: focusBlocks.length ? focusBlocks : [`${start}–${lunchAt}`],
    deskType: typeof c.desk_type === 'string' ? c.desk_type : '',
  }
}

/**
 * ناتج fn_group_professions → قائمة مجالات.
 * الدالة بترجّع jsonb: {revealed, count, professions: [{key, name_ar, icon_key, color, n}]}
 * (وقبل الكشف من غير professions). بنقبل كمان مصفوفة مباشرة علشان شكلها ما يكسرش الصفحة.
 */
export function professionsFromDb(data: unknown): GroupProfession[] {
  const list = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && Array.isArray((data as { professions?: unknown }).professions)
      ? ((data as { professions: unknown[] }).professions)
      : []
  const out: GroupProfession[] = []
  for (const row of list) {
    if (typeof row === 'string') {
      out.push({ name: row, count: 1 })
      continue
    }
    if (row && typeof row === 'object') {
      const r = row as { name_ar?: unknown; profession_ar?: unknown; name?: unknown; n?: unknown; count?: unknown }
      const name = [r.name_ar, r.profession_ar, r.name].find((x) => typeof x === 'string' && x)
      if (typeof name !== 'string') continue
      const n = [r.n, r.count].find((x) => typeof x === 'number')
      out.push({ name, count: typeof n === 'number' ? n : 1 })
    }
  }
  return out
}

export function workPassFromDb(row: Record<string, unknown>): WorkPass {
  const r = row as {
    id: string; kind: string; sessions_total: number; sessions_used: number
    expires_at: string | null; status: string
  }
  const total = r.sessions_total ?? 0
  const used = r.sessions_used ?? 0
  const status = (['pending', 'active', 'used_up', 'expired', 'refunded'] as const).find(
    (s) => s === r.status
  )
  return {
    id: r.id,
    kind: r.kind === 'eight' ? 'eight' : 'four',
    sessionsTotal: total,
    sessionsUsed: used,
    sessionsLeft: Math.max(0, total - used),
    expiresAt: r.expires_at ?? null,
    status: status ?? 'pending',
  }
}
