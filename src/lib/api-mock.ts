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
  timeOfDay: 'day' | 'night',
  exclude?: string
): Promise<Sbota> {
  await delay(120)
  const pool = sbotat.filter(
    (s) =>
      s.kind !== 'mystery' &&
      !s.full &&
      s.timeOfDay === timeOfDay &&
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
    ? { ok: true as const, created: true }
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

export interface ChatRoomState {
  messages: ChatMessage[]
  closed: boolean
  closesAt: string
  title: string
}

export async function getChat(bookingId: string): Promise<ChatRoomState | null> {
  await delay(140)
  const booking = bookingById(bookingId)
  if (!booking) return null
  const stored = loadRoom(bookingId)
  const seeded = seedMessages.filter((m) => m.roomId === bookingId)
  return {
    messages: [...seeded, ...stored],
    closed: Date.now() >= new Date(booking.chatClosesAt).getTime(),
    closesAt: booking.chatClosesAt,
    title: `شات ${booking.sbotaName}`,
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
