/**
 * ============================================================
 *  البيانات الوهمية — بديل احتياطي
 *  بتشتغل بس لو Supabase مش متظبط (مفيش مفاتيح في .env.local).
 *  المسار الحقيقي في api.ts.
 * ============================================================
 */

import type {
  Booking,
  ChatMessage,
  Clue,
  GameAnswers,
  Me,
  Person,
  Profile,
  Sbota,
  HostedSbota,
  HostLimits,
  NewSbotaInput,
} from '@/types'
import { sbotat, sbotaBySlug, nightOrder, dayOrder } from '@/data/sbotat'
import { captains, captainById } from '@/data/captains'
import { people, metBefore, whyThisGroup } from '@/data/people'
import { bookings, bookingById, seedMessages, clues } from '@/data/bookings'
import { gameFallback } from '@/data/game'
import { resultFor } from '@/lib/game-config'
import { personas } from '@/data/personas'
import { loadRoom, appendMessage } from '@/lib/chat-store'

const delay = (ms = 160) => new Promise((r) => setTimeout(r, ms))

/** رمز التحقق الوهمي في المرحلة دي */
export const DEV_OTP = '1234'

/** خصم كود الإحالة */
export const REFERRAL_DISCOUNT = 0.15

/* ---------------------------------------------------------- السبوطات */

export async function getSbotat(opts?: {
  filter?: string
  timeOfDay?: 'day' | 'night'
}): Promise<Sbota[]> {
  await delay()
  const order = opts?.timeOfDay === 'day' ? dayOrder : nightOrder
  let list = order
    .map((slug) => sbotat.find((s) => s.slug === slug))
    .filter((s): s is Sbota => Boolean(s))

  const f = opts?.filter
  if (f && f !== 'الكل') {
    list = list.filter((s) => s.tags.includes(f) || s.area === f)
  }
  return list
}

export async function getSbota(slug: string): Promise<Sbota | null> {
  await delay(120)
  return sbotaBySlug(slug) ?? null
}

/** «نديها واحدة؟» — واحدة بس، مختارة حسب وقت اليوم */
export async function getRandomSbota(
  timeOfDay?: 'day' | 'night',
  exclude?: string
): Promise<Sbota> {
  await delay(120)
  const pool = sbotat.filter(
    (s) =>
      s.kind !== 'mystery' &&
      !s.full &&
      (!timeOfDay || s.timeOfDay === timeOfDay) &&
      s.slug !== exclude
  )
  const fallback = sbotat.filter(
    (s) => s.kind !== 'mystery' && !s.full && s.slug !== exclude
  )
  const from = pool.length ? pool : fallback.length ? fallback : sbotat
  return from[Math.floor(Math.random() * from.length)]
}

/* ---------------------------------------------------------- الكباتن */

export async function getCaptains() {
  await delay(100)
  return captains
}

export async function getCaptain(id: string) {
  await delay(80)
  return captainById(id)
}

export async function applyAsCaptain(payload: {
  name: string
  phone: string
  job: string
  why: string
}) {
  await delay(300)
  return { ok: true as const, payload }
}

/* ---------------------------------------------------------- الحساب */

export async function signIn(_email: string, password: string) {
  await delay(400)
  return password.length >= 6
    ? { ok: true as const }
    : { ok: false as const, code: 'wrongPassword' as const }
}

export async function signInOrSignUp(_email: string, password: string) {
  await delay(400)
  return password.length >= 6
    ? { ok: true as const, created: true, token: undefined as string | undefined }
    : { ok: false as const, code: 'weakPassword' as const }
}

export async function sendOtp(phone: string, _email?: string) {
  await delay(400)
  return { ok: true as const, phone, hint: DEV_OTP }
}

export async function verifyOtp(phone: string, code: string, _email?: string) {
  await delay(300)
  return code.trim() === DEV_OTP
    ? { ok: true as const, phone }
    : { ok: false as const, error: 'الرمز مش مظبوط' }
}

export async function createAccount(profile: Partial<Profile>) {
  await delay(400)
  return { ok: true as const, profile }
}

export async function getMe(): Promise<Me> {
  await delay(120)
  return {
    firstName: 'أحمد',
    photo: '[صورة]',
    persona: personas[0],
    count: 4,
    credit: 150,
    referralCode: 'NSBT-3M4R',
    role: 'member',
  }
}

/* ---------------------------------------------------------- الحجز والدفع */

export async function book(slug: string) {
  await delay(300)
  const s = sbotaBySlug(slug)
  if (!s) return { ok: false as const, error: 'السبوطة دي مش موجودة' }
  return { ok: true as const, bookingId: 'b1', slug }
}

export async function redeemReferral(code: string) {
  await delay(250)
  const clean = code.trim()
  if (clean.length < 4) return { ok: false as const, error: 'الكود ده قصير' }
  return { ok: true as const, discount: REFERRAL_DISCOUNT }
}

/**
 * محاكاة الدفع.
 * أي رقم بطاقة بينتهي بـ 0000 = فشل — علشان نجرب مسار الفشل.
 */
export async function pay(input: {
  slug: string
  method: 'card' | 'wallet' | 'instapay'
  cardNumber?: string
  amount: number
}) {
  await delay(700)
  const digits = (input.cardNumber ?? '').replace(/\D/g, '')
  if (input.method === 'card' && digits.endsWith('0000')) {
    return { ok: false as const, error: 'الدفع معدّاش. مفيش حاجة اتخصمت.' }
  }
  return { ok: true as const, bookingId: 'b1' }
}

export async function getBookings(): Promise<Booking[]> {
  await delay(140)
  return bookings
}

export async function getBooking(id: string): Promise<Booking | null> {
  await delay(100)
  return bookingById(id) ?? null
}

/* ---------------------------------------------------------- المجموعة */

export interface Group {
  booking: Booking
  sbota: Sbota
  captain: ReturnType<typeof captainById>
  people: Person[]
  why: string
  /** الكشف حصل ولا لسه */
  revealed: boolean
}

export async function getGroup(bookingId: string): Promise<Group | null> {
  await delay(180)
  const booking = bookingById(bookingId)
  if (!booking) return null
  const sbota = sbotaBySlug(booking.slug)
  if (!sbota) return null
  const revealed = Date.now() >= new Date(booking.revealAt).getTime()
  return {
    booking,
    sbota,
    captain: captainById(sbota.captainId),
    people: revealed ? people : [],
    why: whyThisGroup,
    revealed,
  }
}

/** للبنات — نقل لمجموعة بنات بس */
export async function requestGirlsOnly(bookingId: string) {
  await delay(300)
  return { ok: true as const, bookingId }
}

/* ---------------------------------------------------------- الشات */

/**
 * حالة غرفة الشات.
 *
 * ⚠ `state` **مش زينة**: قبلها كانت الدالة بترجّع `null` لما الغرفة لسه
 *    ما اتعملتش، والواجهة بتقف على «بنحمّل» للأبد. الغرفة بتتعمل مع الكشف
 *    (قبل الخروجة بيوم) — يعني «لسه بدري» هو الوضع الطبيعي، مش استثناء.
 */
export type ChatState =
  /** الغرفة مفتوحة وفيها كلام */
  | 'ok'
  /** الحجز مدفوع بس المجموعة لسه ما اتكشفتش */
  | 'waiting'
  /** الحجز لسه مستني تأكيد التحويل */
  | 'unpaid'
  /** الحجز نفسه مش موجود (أو مش بتاعك) */
  | 'missing'

export interface ChatRoomState {
  state: ChatState
  messages: ChatMessage[]
  closed: boolean
  closesAt: string
  title: string
  roomId?: string
  /** ميعاد الكشف — بيتعرض في حالة `waiting` */
  revealAt?: string
}

export async function getChat(bookingId: string): Promise<ChatRoomState | null> {
  await delay(140)
  const booking = bookingById(bookingId)
  if (!booking) return null
  const stored = loadRoom(bookingId)
  const seeded = seedMessages.filter((m) => m.roomId === bookingId)
  return {
    state: 'ok',
    messages: [...seeded, ...stored],
    closed: Date.now() >= new Date(booking.chatClosesAt).getTime(),
    closesAt: booking.chatClosesAt,
    title: booking.sbotaName,
  }
}

export async function sendMessage(bookingId: string, text: string, author = 'أحمد') {
  await delay(90)
  const msg: ChatMessage = {
    id: `m-${Date.now()}`,
    roomId: bookingId,
    author,
    initial: author[0],
    text,
    at: new Date().toISOString(),
    mine: true,
  }
  appendMessage(bookingId, msg)
  return msg
}

export async function reportMessage(messageId: string) {
  await delay(200)
  return { ok: true as const, messageId }
}

export async function removeFromRoom(bookingId: string, personName: string) {
  await delay(250)
  return { ok: true as const, bookingId, personName }
}

/* ---------------------------------------------------------- التقييم */

export interface ReviewPayload {
  bookingId: string
  ratings: Record<string, number>
  seeAgain: string[]
  allowPhoto: boolean
}

export async function submitReview(payload: ReviewPayload) {
  await delay(450)
  return { ok: true as const, coupon: 10, payload }
}

/** «رايحين معاك» — الصور بتظهر هنا بس بعد الاختيار المتبادل */
export async function getMetBefore(): Promise<Person[]> {
  await delay(120)
  return metBefore
}

/* ---------------------------------------------------------- الغامضة */

export async function getClues(): Promise<Clue[]> {
  await delay(140)
  return clues
}

/** عدد السبوطات اللي المستخدم راحها — الغامضة محتاجة 2 على الأقل */
export async function getCompletedCount(): Promise<number> {
  await delay(80)
  return bookings.filter((b) => b.status === 'past').length
}

/* ---------------------------------------------------------- لوحة الكابتن */

export interface CaptainBoard {
  sbota: Sbota
  captain: ReturnType<typeof captainById>
  roster: Person[]
}

export async function getCaptainBoard(sbotaId: string): Promise<CaptainBoard | null> {
  await delay(180)
  const sbota = sbotaBySlug(sbotaId)
  if (!sbota) return null
  return {
    sbota,
    captain: captainById(sbota.captainId),
    // 8 — السبعة + المستخدم نفسه
    roster: [
      ...people,
      {
        name: 'أحمد',
        initial: 'أ',
        tag: 'مستكشف الإجازة',
        line: 'المرة الرابعة · بيحب يجرب الجديد',
        tagColors: { bg: '#F4632A', fg: '#14161A' },
        photo: '[صورة]',
      },
    ],
  }
}

export async function markArrived(sbotaId: string, name: string, arrived: boolean) {
  await delay(80)
  return { ok: true as const, sbotaId, name, arrived }
}

export async function uploadGroupPhotos(sbotaId: string, count: number) {
  await delay(500)
  return { ok: true as const, sbotaId, count }
}

export async function saveCaptainReport(sbotaId: string, fields: string[]) {
  await delay(350)
  return { ok: true as const, sbotaId, fields }
}

/* ---------------------------------------------------------- اللعبة */

export async function finishGame(answers: GameAnswers) {
  await delay(300)
  const t = resultFor(gameFallback, answers)
  const persona = personas.find((p) => p.id === t.key) ?? personas[0]
  const next = sbotat.find((s) => !s.full && s.kind === 'normal')!
  return { persona, next }
}

/* ---------------------------------------------------------- الجدول على واتساب */

export async function subscribeSchedule(phone: string) {
  await delay(350)
  return { ok: true as const, phone }
}

/* ---------------------------------------------------------- فتح خروجة من عضو

   الاحتياطي بيحاكي الشكل بس. الحدود هنا **صورة** من قيم `settings`
   الافتراضية في الهجرة 0078 — القيمة الحقيقية من القاعدة دايمًا، والملف
   ده بيشتغل لما مفيش قاعدة أصلًا.
*/

const hostedDemo: HostedSbota[] = [
  {
    id: 'demo-hosted-1',
    slug: 'ehna-el-rabe3',
    name: 'إحنا الرابع',
    when: 'الخميس 8 بالليل',
    startsAt: new Date(Date.now() + 6 * 864e5).toISOString(),
    capacity: 8,
    booked: 3,
    status: 'open',
    note: 'هنتقابل عند البوابة الساعة 7:45.',
  },
]

export async function getHostLimits(): Promise<HostLimits> {
  await delay(80)
  return { minCapacity: 4, maxCapacity: 12, maxOpen: 2, minLeadHours: 24, maxDaysAhead: 45 }
}

export async function createSbota(input: NewSbotaInput) {
  await delay(400)
  return { ok: true as const, id: `demo-${Date.now()}`, title: input.title }
}

/** قايمة الانتظار — وضع العرض: مفيش حد فيها، والسبوطة الكاملة بس هي اللي بتقفل */
const mockWaiting = new Set<string>()
export async function getMyWaitlist(sbotaId: string) {
  const on = mockWaiting.has(sbotaId)
  return { onList: on, rank: on ? 1 : null, canBook: true }
}
export async function joinWaitlist(sbotaId: string) {
  mockWaiting.add(sbotaId)
  return { ok: true as const, rank: 1 }
}
export async function leaveWaitlist(sbotaId: string) {
  mockWaiting.delete(sbotaId)
  return { ok: true as const }
}

export async function bookFree(sbotaId: string) {
  await delay(300)
  return { ok: true as const, bookingId: `demo-booking-${sbotaId}` }
}

export async function getMyHostedSbotat(): Promise<HostedSbota[]> {
  await delay(150)
  return hostedDemo
}

export async function updateMySbotaNote(id: string, note: string) {
  await delay(200)
  return { ok: true as const, id, note }
}

export async function cancelMySbota(id: string, reason?: string) {
  await delay(200)
  return { ok: true as const, id, reason }
}

/**
 * ألبوم الخروجة — بيانات عرض.
 *
 * ⚠ من غير قاعدة، `fn_sbota_album` مش موجودة. والدرس اللي اتعلمناه مع
 *   كرت «أول ربع ساعة»: لو الموك بيرجّع فاضي، الميزة **عمرها ما تتشاف في
 *   التطوير** — مبنية ومترجمة ومحدش شايفها.
 */
export async function getAlbum(sbotaId: string) {
  await delay(200)
  return [
    {
      id: 'demo-photo-1',
      path: `${sbotaId}/demo-1.jpg`,
      src: null,
      caption: 'آخر نقطة قبل ما نرجع',
      byName: 'مريم',
      isMine: false,
      pending: false,
      at: new Date(Date.now() - 3600_000).toISOString(),
    },
    {
      id: 'demo-photo-2',
      path: `${sbotaId}/demo-2.jpg`,
      src: null,
      caption: '',
      byName: 'انت',
      isMine: true,
      // ⚠ واحدة مستنية عن قصد — علشان الحالة دي تتشاف في التطوير
      pending: true,
      at: new Date(Date.now() - 7200_000).toISOString(),
    },
  ]
}

/** كروت «قريب» — بيانات عرض (نفس شكل `fn_coming_soon`) */
const soonWanted = new Set<string>()
export async function getComingSoon() {
  await delay(160)
  return [
    { templateId: 'soon-1', slug: 'kayak', name: 'كاياك في النيل', mood: 'هادي ومبلول', imgSrc: null, photoAlt: null },
    { templateId: 'soon-2', slug: 'fakhar', name: 'ورشة فخار', mood: 'إيدك في الطين', imgSrc: null, photoAlt: null },
  ].map((x) => ({ ...x, iWant: soonWanted.has(x.templateId) }))
}
export async function wantSoon(templateId: string, on: boolean) {
  await delay(160)
  if (on) soonWanted.add(templateId)
  else soonWanted.delete(templateId)
  return on
}

/** الفيد — بيانات عرض (نفس شكل `fn_feed`: خروجتي بصورها، وغيرها كرت أصم) */
export async function getFeed(limit = 30) {
  await delay(200)
  return [
    {
      sbotaId: 'demo-1',
      mine: true,
      title: 'فطار على النيل',
      when: 'الجمعة 7 الصبح',
      people: 6,
      photos: 4,
      photoSrc: null,
      bookingId: 'b2',
    },
    {
      sbotaId: 'demo-2',
      mine: false,
      title: 'ورشة فخار',
      when: 'السبت 6 بالليل',
      people: 5,
      photos: 0,
      photoSrc: null,
      bookingId: null,
    },
    {
      sbotaId: 'demo-3',
      mine: false,
      title: 'كاياك الصبح',
      when: 'الجمعة 7 الصبح',
      people: 8,
      photos: 0,
      photoSrc: null,
      bookingId: null,
    },
  ].slice(0, limit)
}

/* ============================================================ «يلا» (0142) */

/**
 * ⚠ **دي بتشتغل بس لما مفيش Supabase متظبط** (`if (!DB)` في `api.ts`) —
 *   يعني في التطوير واللقطات. على الموقع الحقيقي الفيد بيجي من
 *   `fn_yalla_feed`، ولو مفيش نداء الصفحة بتوري الحالة الفاضية الصح.
 *   القاعدة في CLAUDE.md §٨: `mock.*` مسموح **ورا `if (!DB)`** بس.
 *
 * ⚠ وموجودة علشان سبب محدد: من غيرها الشاشة ما تتشافش **غير فاضية**، وده
 *   بالظبط اللي حصل في «قضية الليلة» (الدرس الخمستاشر — «الكود اتكتب» مش
 *   «الصفحة بتشتغل»). بالبيانات دي بناخد لقطات للبوست وهو مليان.
 */
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

const demoAreas = [
  { key: 'tagamo3', label: 'التجمع' },
  { key: '3asher', label: 'العاشر من رمضان' },
  { key: 'shorouk', label: 'الشروق' },
]

const demoYalla = [
  {
    callId: '11111111-1111-1111-1111-111111111111',
    kind: 'post' as const,
    slug: 'padel',
    link: 'padel-11111111',
    createdAt: hoursFromNow(-2),
    status: 'open' as const,
    line: 'يلا نلعب بادل الويك اند الجاي. مين معانا؟',
    what: 'بادل',
    imgSrc: null,
    photoAlt: null,
    costNote: 'التكلفة تقريبًا ١٥٠ جنيه للواحد، بتتدفع في المكان.',
    groupSize: 6,
    deadline: hoursFromNow(40),
    totalN: 5,
    topN: 4,
    topWhen: hoursFromNow(80),
    topArea: 'العاشر من رمضان',
    wonWhen: null,
    wonArea: null,
    /**
     * ⚠ **ميعاد واحد ومنطقة واحدة — ده الشكل الحقيقي بعد `0147`.** كان ٢١
     * ميعاد × ١٦ منطقة (`0146`)، والمالك شاف النافذة وقال «مش عاوز
     * الاقتراحات دي كلها». دلوقتي الاتنين **سباكة مخفية** للقفل التلقائي
     * والواجهة ما بتعرضهمش خالص.
     */
    slots: [{ id: 's1', at: hoursFromNow(84) }],
    areas: demoAreas.slice(0, 1),
    mySlots: [] as string[],
    myArea: null,
    myN: null,
    myWhen: null,
    myAreaLabel: null,
    myBooking: null,
    myWaiting: false,
  },
  {
    callId: '22222222-2222-2222-2222-222222222222',
    kind: 'post' as const,
    slug: 'kayak',
    link: 'kayak-22222222',
    createdAt: hoursFromNow(-26),
    status: 'open' as const,
    line: 'كاياك على النيل قبل الشغل. مين معانا؟',
    what: 'كاياك الصبح',
    imgSrc: null,
    photoAlt: null,
    costNote: null,
    groupSize: 6,
    deadline: hoursFromNow(18),
    totalN: 2,
    topN: 2,
    topWhen: hoursFromNow(60),
    topArea: 'التجمع',
    wonWhen: null,
    wonArea: null,
    slots: [{ id: 'k1', at: hoursFromNow(60) }],
    areas: demoAreas.slice(0, 1),
    mySlots: ['k1'],
    myArea: 'tagamo3',
    myN: 2,
    myWhen: hoursFromNow(60),
    myAreaLabel: 'التجمع',
    myBooking: null,
    myWaiting: false,
  },
  {
    // ⚠ النداء القديم — بيتعرض بنافذة الاختيار. سايبينه في المحاكاة علشان
    //   الطريق القديم يتجرّب في التطوير (المالك عنده نداء واحد `choice`).
    callId: '33333333-3333-3333-3333-333333333333',
    kind: 'choice' as const,
    slug: 'bowling',
    link: 'bowling-33333333',
    createdAt: hoursFromNow(-50),
    status: 'locked' as const,
    line: 'بولينج الخميس. اللي جاي يقول.',
    what: 'بولينج',
    imgSrc: null,
    photoAlt: null,
    costNote: null,
    groupSize: 6,
    deadline: hoursFromNow(-4),
    totalN: 7,
    topN: 6,
    topWhen: hoursFromNow(30),
    topArea: 'الشروق',
    wonWhen: hoursFromNow(30),
    wonArea: 'الشروق',
    slots: [{ id: 'b1', at: hoursFromNow(30) }],
    areas: demoAreas.slice(2),
    mySlots: ['b1'],
    myArea: 'shorouk',
    myN: 6,
    myWhen: hoursFromNow(30),
    myAreaLabel: 'الشروق',
    myBooking: 'b1',
    myWaiting: false,
  },
]

/**
 * كلام المحاكاة — **الاسم الأول وبس**، زي اللي بيرجع من القاعدة بالظبط.
 * مفيش `profileId` ومفيش صورة، علشان المحاكاة ما تورّيش شكل مش موجود.
 */
type MockComment = {
  id: string
  parentId: string | null
  name: string
  asNasbot: boolean
  body: string
  photoUrl: string | null
  createdAt: string
  mine: boolean
}

/**
 * ⚠ **المحاكاة فيها رد ورد-باسم-نسبوط** عن قصد — مش كلام مسطّح.
 *   الدرس: الشكل اللي ما اتجرّبش وهو مليان بيطلع غلط على الشاشة بس
 *   (نافذة الـ٢١ ميعاد). فلازم يكون فيه خيط حقيقي في اللقطة.
 */
const demoTalk: Record<string, MockComment[]> = {
  '11111111-1111-1111-1111-111111111111': [
    {
      id: 'c1',
      parentId: null,
      name: 'نور',
      asNasbot: false,
      body: 'أنا فاضية الجمعة بالليل والسبت الصبح. التجمع أقرب ليا.',
      photoUrl: null,
      createdAt: hoursFromNow(-2),
      mine: false,
    },
    {
      id: 'c2',
      parentId: 'c1',
      name: 'نسبوط',
      asNasbot: true,
      body: 'تمام يا نور. حطينا الجمعة بالليل في التصويت تحت.',
      photoUrl: null,
      createdAt: hoursFromNow(-1.5),
      mine: false,
    },
    {
      id: 'c3',
      parentId: 'c1',
      name: 'كريم',
      asNasbot: false,
      body: 'وأنا كمان الجمعة. بس المعادي أقرب ليا من التجمع.',
      photoUrl: null,
      createdAt: hoursFromNow(-1),
      mine: false,
    },
    {
      id: 'c4',
      parentId: null,
      name: 'كريم',
      asNasbot: false,
      body: 'فيه ملعب حلو هنا، ده شكله.',
      photoUrl: null,
      createdAt: hoursFromNow(-0.5),
      mine: false,
    },
  ],
}

export async function getYallaComments(callId: string) {
  return demoTalk[callId] ?? []
}

export async function sayYalla(
  callId: string,
  body: string,
  opts: { parentId?: string | null; photoPath?: string | null; asNasbot?: boolean } = {}
): Promise<'ok'> {
  const list = demoTalk[callId] ?? (demoTalk[callId] = [])
  list.push({
    id: `c${list.length + 1}`,
    parentId: opts.parentId ?? null,
    name: opts.asNasbot ? 'نسبوط' : 'إنت',
    asNasbot: opts.asNasbot === true,
    body,
    photoUrl: opts.photoPath ? '/placeholder.svg' : null,
    createdAt: new Date().toISOString(),
    mine: !opts.asNasbot,
  })
  return 'ok'
}

/** اختيارات التصويت — ميعاد ومنطقة، زي الحقيقي بالظبط */
const demoPoll: Record<
  string,
  { optionId: string; at: string; areaLabel: string; note: string | null; votes: number; mine: boolean }[]
> = {
  '11111111-1111-1111-1111-111111111111': [
    // ⚠ الملاحظة لازم تطابق الميعاد — لقطة بتناقض نفسها أسوأ من لقطة مفيش.
    { optionId: 'o1', at: hoursFromNow(80), areaLabel: 'التجمع', note: null, votes: 3, mine: false },
    { optionId: 'o2', at: hoursFromNow(104), areaLabel: 'المعادي', note: null, votes: 1, mine: false },
  ],
}

export async function getYallaPoll(callId: string) {
  return demoPoll[callId] ?? []
}

export async function voteYalla(optionId: string) {
  for (const list of Object.values(demoPoll)) {
    const picked = list.find((o) => o.optionId === optionId)
    if (!picked) continue
    // صوت واحد بس — زي القاعدة
    for (const o of list) {
      if (o.mine) o.votes = Math.max(0, o.votes - 1)
      o.mine = false
    }
    picked.mine = true
    picked.votes += 1
  }
  return true
}

export async function imInYalla(callId: string) {
  const post = demoYalla.find((p) => p.callId === callId)
  if (post) {
    post.mySlots = post.slots.map((x) => x.id)
    post.myArea = post.areas[0]?.key ?? null
    post.myN = (post.topN ?? 0) + 1
    post.myWhen = post.slots[0]?.at ?? null
    post.myAreaLabel = post.areas[0]?.label ?? null
    post.totalN += 1
    post.topN += 1
  }
  return { n: (post?.totalN ?? 1), locked: false }
}

export async function getYallaFeed(limit = 20) {
  return demoYalla.slice(0, limit)
}

export async function chooseYalla(callId: string, slotIds: string[], areaKey: string) {
  const post = demoYalla.find((p) => p.callId === callId)
  const area = post?.areas.find((a) => a.key === areaKey)
  const slot = post?.slots.find((s) => s.id === slotIds[0])
  if (post) {
    post.mySlots = slotIds
    post.myArea = areaKey
    post.myN = (post.topN ?? 0) + 1
    post.myWhen = slot?.at ?? null
    post.myAreaLabel = area?.label ?? null
    post.totalN += 1
  }
  return {
    n: (post?.topN ?? 0) + 1,
    when: slot?.at ?? null,
    area: area?.label ?? null,
    locked: false,
  }
}

export async function joinYallaWinner(callId: string) {
  const post = demoYalla.find((p) => p.callId === callId)
  if (post) post.myBooking = 'b1'
  return { seated: true, booking: 'b1', waiting: false }
}
