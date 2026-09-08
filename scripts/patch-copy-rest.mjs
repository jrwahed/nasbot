/**
 * الجولة الأخيرة من نقل النصوص — الحالات اللي الكودمود ما قدرش يوصلها:
 *   نص فيه متغيّر جواه   →  t('key', { n })  مع {{n}} في القيمة
 *   شرط بفرعين            →  t('a') : t('b')
 *   نص جوه template literal
 *
 * كل تعديل مكتوب صريح، ولازم يطابق مرة واحدة بالظبط — لو طابق صفر أو أكتر
 * السكربت بيقف من غير ما يكتب حاجة.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const S = 'src'

/** نصوص جديدة — دي اللي هتتزرع في copy_strings وفي الملف الاحتياطي */
const KEYS = {
  'shared.wait': 'ثانية واحدة…',
  'shared.copied': 'اتنسخ',
  'shared.egp': '{{n}} جنيه',
  'shared.egpMinus': '−{{n}} جنيه',
  'shared.ofTotal': '{{n}} من {{total}}',
  'shared.myProfile': 'ملفي',
  'shared.themeDay': 'نهاري',
  'shared.themeDayAria': 'حوّل للوضع النهاري',
  'shared.marquee.highlight': 'فاضل',

  'captainboard.arrived': 'وصل {{n}} من {{total}}',
  'captainboard.saved': 'اتحفظ ✓',
  'captainboard.photosDone': 'اترفعت {{n}} صور ✓',

  'game.backFirst': 'رجوع',
  'game.showResult': 'وريني النتيجة',
  'result.youAre': 'طلعت {{type}}',

  'join.bookingFor': 'بتحجز:',
  'join.resend': 'ابعتهولي تاني',
  'join.photoDone': 'اتحطت ✓',

  'me.sbotCount': 'مسبوط {{n}} مرات',
  'me.opened': 'اتفتحت',
  'me.chatWith': 'شات {{name}}',
  'me.chatClosed': 'اتقفل',

  'group.yourGroupOn': 'مجموعتك يوم {{day}}',
  'group.whoIsGoing': 'اللي رايحين معاك — {{n}}',

  'done.shareTitle': 'نسبوط — {{name}}',
  'done.shareText': 'تعالى معايا {{name}} على نسبوط. الكود: {{code}}',
  'done.pendingHi': 'وصلنا تحويلك يا {{name}}.',
  'done.okHi': 'تمام يا {{name}}، مكانك محجوز.',
  'done.copiedDot': 'اتنسخ.',

  'sbota.firstTimeOffer': 'أول مرة معانا؟ بـ {{price}} جنيه — بيتخصم لوحده.',
  'sbota.cta': 'أنا جاي — {{price}}',
  'sbota.waitlistNote': 'هنبعتلك أول ما مكان يفضى.',

  'pay.refApplied': 'تمام — خصم {{pct}}%',
  'pay.transferAmount': 'حوّل {{n}} جنيه على',
  'pay.reviewWithin': 'بنراجعه خلال {{n}} ساعة',

  'chat.closed': '— اتقفل',
  'chat.closesAt': '— بيتقفل {{when}} 10 بالليل',
  'chat.pinned': 'مثبتة',
}

/** [ملف, النص القديم, النص الجديد] */
const EDITS = [
  // ===== لوحة الكابتن =====
  [
    `${S}/app/captain/[sbotaId]/page.tsx`,
    `          وصل {arrivedCount} من {board.roster.length}`,
    `          {t('captainboard.arrived', { n: arrivedCount, total: board.roster.length })}`,
  ],
  [
    `${S}/app/captain/[sbotaId]/page.tsx`,
    "{photos ? `اترفعت ${photos} صور ✓` : t('captainboard.label.2')}",
    "{photos ? t('captainboard.photosDone', { n: photos }) : t('captainboard.label.2')}",
  ],
  [
    `${S}/app/captain/[sbotaId]/page.tsx`,
    "{saved ? 'اتحفظ ✓' : t('captainboard.label.1')}",
    "{saved ? t('captainboard.saved') : t('captainboard.label.1')}",
  ],

  // ===== اللعبة =====
  [
    `${S}/app/game/page.tsx`,
    "back={i === 0 ? 'رجوع' : t('game.label.4')}",
    "back={i === 0 ? t('game.backFirst') : t('game.label.4')}",
  ],
  [
    `${S}/app/game/page.tsx`,
    "{isLast ? 'وريني النتيجة' : t('game.label.1')}",
    "{isLast ? t('game.showResult') : t('game.label.1')}",
  ],
  [
    `${S}/app/game/result/page.tsx`,
    `        طلعت {shown}`,
    `        {t('result.youAre', { type: shown })}`,
  ],
  [
    `${S}/app/game/result/page.tsx`,
    "{busy ? 'ثانية واحدة…' : t('result.label.1')}",
    "{busy ? t('shared.wait') : t('result.label.1')}",
  ],

  // ===== الانضمام =====
  [`${S}/app/join/page.tsx`, `بتحجز:{' '}`, `{t('join.bookingFor')}{' '}`],
  [
    `${S}/app/join/page.tsx`,
    "{sending ? 'ثانية واحدة…' : otpSent ? 'ابعتهولي تاني' : t('join.label.11')}",
    "{sending ? t('shared.wait') : otpSent ? t('join.resend') : t('join.label.11')}",
  ],
  [
    `${S}/app/join/page.tsx`,
    "{photo ? 'اتحطت ✓' : t('join.label.2')}",
    "{photo ? t('join.photoDone') : t('join.label.2')}",
  ],

  // ===== ملفي =====
  [
    `${S}/app/me/page.tsx`,
    `              مسبوط {me.count} مرات`,
    `              {t('me.sbotCount', { n: me.count })}`,
  ],
  [
    `${S}/app/me/page.tsx`,
    "{on ? 'اتفتحت' : t('me.label.6')}",
    "{on ? t('me.opened') : t('me.label.6')}",
  ],
  [
    `${S}/app/me/page.tsx`,
    `<span className="font-display text-28 font-black">{me.credit} جنيه</span>`,
    `<span className="font-display text-28 font-black">{t('shared.egp', { n: me.credit })}</span>`,
  ],
  [
    `${S}/app/me/page.tsx`,
    "{copied ? 'اتنسخ' : t('me.label.5')}",
    "{copied ? t('shared.copied') : t('me.label.5')}",
  ],
  [
    `${S}/app/me/page.tsx`,
    `                  شات {b.sbotaName}`,
    `                  {t('me.chatWith', { name: b.sbotaName })}`,
  ],
  [
    `${S}/app/me/page.tsx`,
    "{closed ? 'اتقفل' : t('me.label.2')}",
    "{closed ? t('me.chatClosed') : t('me.label.2')}",
  ],
  [
    `${S}/app/me/page.tsx`,
    "{theme === 'day' ? 'نهاري' : t('me.label.1')}",
    "{theme === 'day' ? t('shared.themeDay') : t('me.label.1')}",
  ],

  // ===== المجموعة =====
  [
    `${S}/app/my/[bookingId]/page.tsx`,
    `        مجموعتك يوم {booking.when.split(' ')[0]}`,
    `        {t('group.yourGroupOn', { day: booking.when.split(' ')[0] })}`,
  ],
  [
    `${S}/app/my/[bookingId]/page.tsx`,
    `        اللي رايحين معاك — {people.length}`,
    `        {t('group.whoIsGoing', { n: people.length })}`,
  ],
  [
    // اسم المكان بعد الكشف بيجي من fn_sbota_address مش متكتوب في المكوّن
    `${S}/app/my/[bookingId]/page.tsx`,
    `<b>{revealed ? 'ملاعب النادي — التجمع الخامس' : sbota.area}</b>`,
    `<b>{revealed ? sbota.venueName || sbota.area : sbota.area}</b>`,
  ],

  // ===== تمام =====
  [
    `${S}/app/s/[slug]/done/page.tsx`,
    'title: `نسبوط — ${sbota.name}`,',
    "title: t('done.shareTitle', { name: sbota.name }),",
  ],
  [
    `${S}/app/s/[slug]/done/page.tsx`,
    'const text = `تعالى معايا ${sbota?.name} على نسبوط. الكود: ${code}`',
    "const text = t('done.shareText', { name: sbota?.name ?? '', code })",
  ],
  [
    `${S}/app/s/[slug]/done/page.tsx`,
    "            ? `وصلنا تحويلك يا ${name || t('done.label.2')}.`\n            : `تمام يا ${name || t('done.label.2')}، مكانك محجوز.`}",
    "            ? t('done.pendingHi', { name: name || t('done.label.2') })\n            : t('done.okHi', { name: name || t('done.label.2') })}",
  ],
  [
    `${S}/app/s/[slug]/done/page.tsx`,
    "{copied ? 'اتنسخ.' : t('done.label.1')}",
    "{copied ? t('done.copiedDot') : t('done.label.1')}",
  ],

  // ===== صفحة السبوطة =====
  [
    `${S}/app/s/[slug]/page.tsx`,
    `            أول مرة معانا؟ بـ {sbota.firstTimeOffer.price} جنيه — بيتخصم لوحده.`,
    `            {t('sbota.firstTimeOffer', { price: sbota.firstTimeOffer.price })}`,
  ],
  [
    `${S}/app/s/[slug]/page.tsx`,
    `              أنا جاي — {sbota.price}`,
    `              {t('sbota.cta', { price: sbota.price })}`,
  ],
  [
    `${S}/app/s/[slug]/page.tsx`,
    "              ? 'هنبعتلك أول ما مكان يفضى.'",
    "              ? t('sbota.waitlistNote')",
  ],

  // ===== الدفع =====
  [
    `${S}/app/s/[slug]/pay/page.tsx`,
    'setRefMsg(`تمام — خصم ${Math.round(r.discount * 100)}%`)',
    "setRefMsg(t('pay.refApplied', { pct: Math.round(r.discount * 100) }))",
  ],
  [
    `${S}/app/s/[slug]/pay/page.tsx`,
    `            حوّل {started.amount} جنيه على`,
    `            {t('pay.transferAmount', { n: started.amount })}`,
  ],
  [
    `${S}/app/s/[slug]/pay/page.tsx`,
    `              بنراجعه خلال {started.reviewHours} ساعة`,
    `              {t('pay.reviewWithin', { n: started.reviewHours })}`,
  ],
  [
    `${S}/app/s/[slug]/pay/page.tsx`,
    `<span className="font-semibold">{sbota.priceValue} جنيه</span>`,
    `<span className="font-semibold">{t('shared.egp', { n: sbota.priceValue })}</span>`,
  ],
  [
    `${S}/app/s/[slug]/pay/page.tsx`,
    `<span className="font-semibold">−{sbota.priceValue - total} جنيه</span>`,
    `<span className="font-semibold">{t('shared.egpMinus', { n: sbota.priceValue - total })}</span>`,
  ],
  [
    `${S}/app/s/[slug]/pay/page.tsx`,
    `            {started?.amount ?? total} جنيه`,
    `            {t('shared.egp', { n: started?.amount ?? total })}`,
  ],

  // ===== مكوّنات مشتركة =====
  [
    `${S}/components/Buttons.tsx`,
    "      {loading ? 'ثانية واحدة…' : children}",
    "      {loading ? t('shared.wait') : children}",
  ],
  [
    `${S}/components/Buttons.tsx`,
    `  const isOff = disabled || loading
  const dims =
    size === 'lg'
      ? 'min-h-[58px] rounded-16 text-[22px] px-5'`,
    `  const t = useT()
  const isOff = disabled || loading
  const dims =
    size === 'lg'
      ? 'min-h-[58px] rounded-16 text-[22px] px-5'`,
  ],
  [
    `${S}/components/ChatRoom.tsx`,
    "{closed ? '— اتقفل' : `— بيتقفل ${closeLabel} 10 بالليل`}",
    "{closed ? t('chat.closed') : t('chat.closesAt', { when: closeLabel })}",
  ],
  [
    `${S}/components/ChatRoom.tsx`,
    `            {pinned.author} · مثبتة`,
    `            {pinned.author} · {t('chat.pinned')}`,
  ],
  [
    `${S}/components/Header.tsx`,
    "{loggedIn ? 'ملفي' : t('shared.label.12')}",
    "{loggedIn ? t('shared.myProfile') : t('shared.label.12')}",
  ],
  [
    `${S}/components/ThemeToggle.tsx`,
    "aria-label={next === 'day' ? 'حوّل للوضع النهاري' : t('shared.label.40')}",
    "aria-label={next === 'day' ? t('shared.themeDayAria') : t('shared.label.40')}",
  ],
  [
    `${S}/components/ThemeToggle.tsx`,
    "title={next === 'day' ? 'نهاري' : t('shared.label.39')}",
    "title={next === 'day' ? t('shared.themeDay') : t('shared.label.39')}",
  ],
  [
    `${S}/components/WhoBooked.tsx`,
    `        {data.booked} من {data.total}`,
    `        {t('shared.ofTotal', { n: data.booked, total: data.total })}`,
  ],

  // ===== الشريط المتحرك — الكلمة اللي بتتلوّن بقت من اللوحة =====
  [
    `${S}/components/Marquee.tsx`,
    `export function Marquee({ text }: { text: string }) {
  // «فاضل 3» و«فاضل 5» بالبرتقالي وبخط عريض — زي الملف
  const parts = text.split(/(فاضل \\d+)/g)
  const content = parts.map((p, i) =>
    /^فاضل \\d+$/.test(p) ? (`,
    `export function Marquee({ text }: { text: string }) {
  const t = useT()
  // «فاضل 3» و«فاضل 5» بالبرتقالي وبخط عريض — زي الملف.
  // الكلمة نفسها من اللوحة علشان لو اتغيّرت في الشريط تفضل متلوّنة.
  const word = t('shared.marquee.highlight')
  const parts = text.split(new RegExp('(' + word + ' \\\\d+)', 'g'))
  const isHit = new RegExp('^' + word + ' \\\\d+$')
  const content = parts.map((p, i) =>
    isHit.test(p) ? (`,
  ],

  // ===== نوع السبوطة: اسم المكان بعد الكشف =====
  [`${S}/types/index.ts`, `  address: string`, `  address: string\n  venueName?: string`],
  [
    `${S}/lib/map-db.ts`,
    `    address: address?.address ?? '',`,
    `    address: address?.address ?? '',\n    venueName: address?.venue_name ?? '',`,
  ],
]

/** ملفات لازم يكون فيها import للـ useT */
const NEEDS_IMPORT = [`${S}/components/Buttons.tsx`, `${S}/components/Marquee.tsx`]
const NEEDS_USE_CLIENT = [`${S}/components/Marquee.tsx`]

const write = process.argv.includes('--write')
const files = new Map()
const crlf = new Set() // الملفات اللي أصلها بنهايات ويندوز — نرجّعها زي ما كانت
const read = (f) => {
  if (!files.has(f)) {
    const raw = readFileSync(f, 'utf8')
    if (raw.includes('\r\n')) crlf.add(f)
    files.set(f, raw.split('\r\n').join('\n'))
  }
  return files.get(f)
}

let failed = 0
for (const [file, from, to] of EDITS) {
  const src = read(file)
  const n = src.split(from).length - 1
  if (n !== 1) {
    failed++
    console.error(`✗ ${file}: طابق ${n} مرة — المفروض مرة واحدة`)
    console.error(`   «${from.trim().slice(0, 70)}»`)
    continue
  }
  files.set(file, src.replace(from, () => to))
}
if (failed) {
  console.error(`\nوقفنا — ${failed} تعديل مش مظبوط. مفيش ملف اتغيّر.`)
  process.exit(1)
}

// الاستيراد و'use client'
const IMP = "import { useT } from '@/components/CopyProvider'"
for (const f of NEEDS_IMPORT) {
  let s = read(f)
  if (s.includes(IMP)) continue
  const imports = [...s.matchAll(/^import [\s\S]*?from\s+'[^']+'[^\n]*\n/gm)]
  if (imports.length) {
    const last = imports[imports.length - 1]
    const at = last.index + last[0].length
    s = s.slice(0, at) + IMP + '\n' + s.slice(at)
  } else {
    const uc = s.match(/^'use client'\n+/)
    const at = uc ? uc[0].length : 0
    s = s.slice(0, at) + IMP + '\n\n' + s.slice(at)
  }
  files.set(f, s)
}
for (const f of NEEDS_USE_CLIENT) {
  const s = read(f)
  if (!s.startsWith("'use client'")) files.set(f, "'use client'\n\n" + s)
}

// ===== الملف الاحتياطي =====
const FB = `${S}/data/copy-fallback.ts`
let fb = read(FB)
const added = []
for (const [k, v] of Object.entries(KEYS)) {
  if (fb.includes(`"${k}":`)) continue
  added.push([k, v])
}
if (added.length) {
  const close = fb.lastIndexOf('\n}')
  const rows = added.map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n')
  fb = fb.slice(0, close) + ',\n' + rows + fb.slice(close)
  files.set(FB, fb)
}

if (!write) {
  console.log(`(تجربة) ${EDITS.length} تعديل تمام · ${added.length} مفتاح جديد`)
  console.log('شغّل بـ --write علشان يتكتب')
  process.exit(0)
}

for (const [f, s] of files) writeFileSync(f, crlf.has(f) ? s.split('\n').join('\r\n') : s)
writeFileSync('scripts/new-copy-keys.json', JSON.stringify(KEYS, null, 2) + '\n')
console.log(`✓ ${EDITS.length} تعديل · ${files.size} ملف · ${added.length} مفتاح جديد`)
console.log('  المفاتيح اتكتبت كمان في scripts/new-copy-keys.json علشان تتزرع في القاعدة')
