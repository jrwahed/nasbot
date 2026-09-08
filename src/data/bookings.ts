import type { Booking, ChatMessage, Clue } from '@/types'

/** الحجز الأساسي المستخدم في المسار الكامل */
export const BOOKING_ID = 'b1'

/**
 * التواريخ محسوبة نسبة لدلوقتي علشان العد التنازلي والشات يشتغلوا
 * في أي وقت من غير ما تبوظ الشاشة.
 * السبوطة كمان 22 ساعة — نفس رقم الملف: «فاضل 22 ساعة».
 */
const now = () => Date.now()
const H = 3600_000

export const bookings: Booking[] = [
  {
    id: 'b1',
    slug: 'ehna-el-rabe3',
    sbotaName: 'إحنا الرابع',
    when: 'الخميس 8 بالليل',
    area: 'التجمع',
    startsAt: new Date(now() + 22 * H).toISOString(),
    revealAt: new Date(now() - 2 * H).toISOString(),
    chatClosesAt: new Date(now() + 22 * H + 48 * H).toISOString(),
    status: 'upcoming',
    reviewed: false,
    paid: true,
  },
  {
    id: 'b2',
    slug: 'fetar-3al-nil',
    sbotaName: 'فطار على النيل',
    when: 'الجمعة 7 الصبح',
    area: 'المعادي',
    startsAt: new Date(now() - 8 * 24 * H).toISOString(),
    revealAt: new Date(now() - 9 * 24 * H).toISOString(),
    chatClosesAt: new Date(now() - 6 * 24 * H).toISOString(),
    status: 'past',
    reviewed: true,
    paid: true,
  },
  {
    id: 'b3',
    slug: 'tarabeza-setta',
    sbotaName: 'ترابيزة ستة',
    when: 'الاتنين 8 بالليل',
    area: 'التجمع',
    startsAt: new Date(now() - 22 * 24 * H).toISOString(),
    revealAt: new Date(now() - 23 * 24 * H).toISOString(),
    chatClosesAt: new Date(now() - 20 * 24 * H).toISOString(),
    status: 'past',
    reviewed: true,
    paid: true,
  },
]

export const bookingById = (id: string) => bookings.find((b) => b.id === id)

/** رسالة الكابتن المثبتة + رسائل التجربة */
export const seedMessages: ChatMessage[] = [
  {
    id: 'm0',
    roomId: 'b1',
    author: 'الكابتن يوسف',
    initial: 'ي',
    text: 'أهلًا بيكم. أنا يوسف، كابتن السبوطة. هكون واقف عند البوابة 7:50 بتيشيرت أسود عليه نسبوط. لو اتأخرت أو تهت كلمني هنا على طول. المضارب موجودة لو محدش جايب، والإيجار بـ 50.',
    at: new Date(now() - 100 * 60_000).toISOString(),
    pinned: true,
    isCaptain: true,
  },
  {
    id: 'm1',
    roomId: 'b1',
    author: 'مريم',
    initial: 'م',
    text: 'تمام يا كابتن. أنا هاجي من التجمع الأول، هبقى بدري إن شاء الله.',
    at: new Date(now() - 82 * 60_000).toISOString(),
  },
  {
    id: 'm2',
    roomId: 'b1',
    author: 'كريم',
    initial: 'ك',
    text: 'أنا أول مرة ألعب بادل — في حاجة لازم أجيبها معايا؟',
    at: new Date(now() - 64 * 60_000).toISOString(),
  },
  {
    id: 'm3',
    roomId: 'b1',
    author: 'الكابتن يوسف',
    initial: 'ي',
    text: 'ولا حاجة يا كريم. جيب كوتشي رياضي بس والباقي علينا.',
    at: new Date(now() - 58 * 60_000).toISOString(),
    isCaptain: true,
  },
  {
    id: 'm4',
    roomId: 'b1',
    author: 'نور',
    initial: 'ن',
    text: 'في حد جاي من ناحية المعادي ونركب سوا؟',
    at: new Date(now() - 30 * 60_000).toISOString(),
  },
]

/** الأدلة السبعة للسبوطة الغامضة — واحد بيتفتح كل يوم */
export const clues: Clue[] = [
  {
    day: 1,
    kind: 'photo',
    label: 'الدليل الأول',
    content: '[صورة مقصوصة — حتة من حيطة عليها لون أصفر]',
    unlocked: true,
  },
  {
    day: 2,
    kind: 'audio',
    label: 'الدليل التاني',
    content: '[صوت — مية بتجري وناس بعيد]',
    unlocked: true,
  },
  { day: 3, kind: 'word', label: 'الدليل التالت', content: 'فوق', unlocked: true },
  {
    day: 4,
    kind: 'photo',
    label: 'الدليل الرابع',
    content: '[صورة مقصوصة — سلم حجر]',
    unlocked: false,
  },
  { day: 5, kind: 'word', label: 'الدليل الخامس', content: 'بالليل', unlocked: false },
  {
    day: 6,
    kind: 'audio',
    label: 'الدليل السادس',
    content: '[صوت — عود بيتعزف]',
    unlocked: false,
  },
  {
    day: 7,
    kind: 'photo',
    label: 'الدليل السابع',
    content: '[صورة مقصوصة — الباب]',
    unlocked: false,
  },
]

/** أسئلة التقييم الخمسة */
export const reviewQuestions = [
  'السبوطة',
  'الكابتن',
  'المكان',
  'المجموعة',
  'هتحجز تاني خلال شهر؟',
]

/** حقول تقرير السبوطة في لوحة الكابتن */
export const captainReportFields = [
  'مين مجاش؟',
  'حصل أي مشكلة؟',
  'المكان كان عامل إيه؟',
  'حد يستاهل يتشكر؟',
  'حاجة تانية؟',
]
