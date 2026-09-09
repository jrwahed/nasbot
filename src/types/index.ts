/** أنواع البيانات المشتركة — نسبوط */

export type Theme = 'day' | 'night'

export type Gender = 'بنت' | 'شاب'

export type GirlsOnlyPref = 'دايمًا' | 'أحيانًا' | 'مش مهم'

export type SkillLevel = 'أول مرة' | 'مبتدئ' | 'متوسط' | 'كويس'

export type Budget = 'لحد 250' | 'لحد 500' | 'لحد 1000' | 'مفيش مشكلة'

export type Area =
  | 'التجمع'
  | 'المعادي'
  | 'زايد-أكتوبر'
  | 'مصر الجديدة-مدينة نصر'
  | 'وسط-زمالك'
  | 'غير كده'

/** نوع السبوطة — بيحدد التخطيط والوضع */
export type SbotaKind = 'normal' | 'work' | 'mystery'

/** وقت السبوطة — بيحدد إمتى تظهر في «نديها واحدة؟» وفي الوضع النهاري */
export type TimeOfDay = 'day' | 'night'

export interface Sbota {
  slug: string
  name: string
  /** سطر الميتا الكامل زي ما هو في الملف: «بادل مبتدئين · الخميس 8 بالليل · التجمع» */
  meta: string
  mood: string
  /** السعر بالنص زي الملف: «300 جنيه» */
  price: string
  /** الرقم للحسابات (الدفع، الخصم) */
  priceValue: number
  priceNote: string
  /** «فاضل 3 من 8» أو «كامل» */
  left: string
  spotsLeft: number
  spotsTotal: number
  full: boolean
  girls: boolean
  kind: SbotaKind
  timeOfDay: TimeOfDay
  area: string
  /** وسوم الفلترة — بتطابق أسماء الفلاتر */
  tags: string[]
  /** وصف الصورة بين قوسين مربعين */
  img: string
  /** صور المعرض في صفحة السبوطة */
  gallery: string[]
  captainId: string
  /** سطر الحكاية تحت الاسم */
  story: string
  when: string
  duration: string
  level: string
  addressHint: string
  /** العنوان الكامل — يظهر بعد الحجز بس */
  address: string
  venueName?: string
  includes: string[]
  excludes: string[]
  priceBreakdown: string
  /** عرض أول مرة — «أول مرة بـ 60» · بيتطبق تلقائيًا لأول حجز */
  firstTimeOffer?: { label: string; price: number }
  whoBooked: WhoBooked
}

export interface WhoBooked {
  booked: number
  total: number
  /** «3 بنات و2 شباب · الأعمار 25–31 · اتنين أول مرة · تلاتة رايحين معانا قبل كده.» */
  line: string
  /** «هتعرف مجموعتك الأربع الساعة 8 بالليل.» */
  revealLine: string
}

export interface Captain {
  id: string
  /** «الكابتن يوسف» */
  name: string
  /** «بادل» */
  craft: string
  /** «الكابتن يوسف — بادل» */
  title: string
  line: string
  /** جملة الكابتن في صفحة السبوطة */
  intro: string
  /** جملته في كشف المجموعة */
  gateLine: string
  photo: string
}

/** ستيكر النوع بألوانه من الملف */
export interface TypeTag {
  bg: string
  fg: string
}

export interface Person {
  /** معرّف القاعدة — اختياري علشان البيانات الوهمية القديمة تفضل شغالة */
  id?: string
  name: string
  initial: string
  /** اسم النوع — «مستكشفة الإجازة» */
  tag: string
  line: string
  tagColors: TypeTag
  /** بتظهر للكابتن بس، وفي «رايحين معاك» بعد التقييم المتبادل */
  photo: string
  arrived?: boolean
}

export interface Booking {
  id: string
  slug: string
  sbotaName: string
  when: string
  area: string
  /** وقت السبوطة نفسها */
  startsAt: string
  /** الكشف بيحصل قبلها بيوم الساعة 8 */
  revealAt: string
  /** الشات بيتقفل بعد السبوطة بيومين */
  chatClosesAt: string
  status: 'upcoming' | 'past'
  reviewed: boolean
  paid: boolean
}

export interface ChatMessage {
  id: string
  roomId: string
  author: string
  initial: string
  text: string
  at: string
  /** رسالة الكابتن المثبتة */
  pinned?: boolean
  isCaptain?: boolean
  /** رسالة مني */
  mine?: boolean
}

export interface Clue {
  day: number
  /** 'photo' | 'audio' | 'word' */
  kind: 'photo' | 'audio' | 'word'
  label: string
  content: string
  unlocked: boolean
}

/** نوع الشخصية من اللعبة */
export type PersonaId =
  | 'explorer'
  | 'social'
  | 'quiet'
  | 'firsttime'
  | 'energy'
  | 'storyteller'

export interface Persona {
  id: PersonaId
  /** صيغة المذكر — نتيجة اللعبة */
  name: string
  /** صيغة المؤنث — زي ما هي في كشف المجموعة في الملف */
  nameF: string
  line: string
  colors: TypeTag
}

export interface GameAnswers {
  q1?: string
  q2?: string
  q3?: string
  q4?: string
  q5?: string
  q6?: string
  q7?: string[]
  q8?: string
}

export interface Profile {
  phone: string
  email: string
  firstName: string
  birthYear: string
  gender: Gender
  area: Area
  /** المنطقة بالنص لما area = «غير كده» */
  areaOther?: string
  girlsOnly?: GirlsOnlyPref
  interests: string[]
  levels: { بادل: SkillLevel; جري: SkillLevel; سباحة: SkillLevel }
  budget: Budget
  days: string[]
  photo: string
  agreedRules: boolean
  agreedData: boolean
}

export interface Me {
  firstName: string
  photo: string
  /** رابط موقّع لصورة العضو — لو رفع واحدة */
  photoUrl?: string | null
  persona: Persona
  /** «مسبوط 4 مرات» */
  count: number
  credit: number
  referralCode: string
  role: 'member' | 'captain'
}

export type TrackEvent =
  | 'view_schedule'
  | 'open_card'
  | 'click_ana_gai'
  | 'start_game'
  | 'finish_game'
  | 'reach_payment'
  | 'paid'
  | 'share_type_card'
  | 'use_referral'

/* ============================================================ الشغل */

/** البريز — outlets_t */
export type OutletsLevel = 'few' | 'enough' | 'plenty'
/** الصوت — noise_t */
export type NoiseLevel = 'quiet' | 'medium' | 'lively'
/** نوع الكارت — pass_kind_t */
export type PassKind = 'four' | 'eight'
/** اختيار الدفع لسبوطة الشغل — `pass` بيتفعّل في المرحلة 3 */
export type WorkPayWith = 'single' | 'first_time'

/** أرقام الشغل من صف settings — بالجنيه، جاهزة للعرض */
export interface WorkSettings {
  pass4Price: number
  pass4Weeks: number
  pass8Price: number
  pass8Weeks: number
  singlePrice: number
  firstTimePrice: number
  vodafoneNumber: string
  instapayHandle: string
  reviewHours: number
  /** الافتراضي لجدول اليوم لو قالب السبوطة ما حددش — من settings.work_lunch_at */
  lunchAt: string
  complaintAt: string
}

/** مكان شغل — من work_venues_public (من غير سعر الجملة أبدًا) */
export interface WorkVenue {
  venueId: string
  name: string
  /** المنطقة بالعربي للعرض */
  area: string
  kind: 'cafe_work' | 'coworking' | 'other'
  desksCount: number | null
  wifiMbps: number | null
  wifiNote: string
  outlets: OutletsLevel | null
  noise: NoiseLevel | null
  hasMeetingRoom: boolean
  hasParking: boolean
  hasAc: boolean
  /** بالجنيه */
  minConsumption: number | null
  /** «10:00» */
  openFrom: string
  openTo: string
  /** أيام بالعربي — سبت … جمعة */
  bestDays: string[]
  photos: string[]
  /** بيظهر بس لو فيه سبوطة شغل معلنة في المكان ده */
  address: string
  hasUpcomingSbota: boolean
}

/** جدول اليوم — من sbota_templates.work_config أو الافتراضي */
export interface DaySchedule {
  start: string
  end: string
  lunchAt: string
  complaintAt: string
  /** «10:00–13:00» */
  focusBlocks: string[]
  deskType: string
}

/** سبوطة شغل — نفس Sbota + المكان والجدول */
export interface WorkSbota extends Sbota {
  sbotaId: string
  venue: WorkVenue | null
  schedule: DaySchedule
}

/** مجال في مجموعة سبوطة — من fn_group_professions، من غير أسماء ناس */
export interface GroupProfession {
  name: string
  count: number
}

/** كارت شغل نشط للمستخدم الحالي */
export interface WorkPass {
  id: string
  kind: PassKind
  sessionsTotal: number
  sessionsUsed: number
  sessionsLeft: number
  expiresAt: string | null
  status: 'pending' | 'active' | 'used_up' | 'expired' | 'refunded'
}

/** نموذج الشركات → leads */
export interface LeadInput {
  company: string
  contactName: string
  phone: string
  peopleCount: number
  timesPerMonth: number
  note?: string
}
