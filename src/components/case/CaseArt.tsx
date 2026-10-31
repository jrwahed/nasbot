/**
 * رسومات «قضية الليلة» — SVG مرسوم بالكود، مش صور.
 *
 * ليه مرسوم مش صور؟
 * · **مفيش صور حقيقية للقضايا** — والقاعدة إن أي حاجة بتتعرض للزائر تكون
 *   حقيقية أو تتشال (§٨ «مفيش بيانات وهمية»). صورة مخزون من النت لمشهد
 *   «تحقيق» دي بالظبط الحاجة اللي اتشالت من الموقع قبل كده.
 * · والرسم بالكود بيلتزم بألوان الهوية (§٣.٧) من غير تدرجات ولا ظلال
 *   ناعمة، وبيحمّل فورًا، وبيتكبّر من غير ما يبوظ.
 *
 * ⚠ **مفيش ولا حرف جوه الرسومات** — لا نص ولا `aria-label` عربي، علشان
 *   حارس `check-copy.mjs` وعلشان الرسمة ديكور: الكلام كله في `copy_strings`.
 *   كلهم `aria-hidden` — قارئ الشاشة بيقرا العنوان جنبها.
 *
 * ⚠ الرسمة بتتاخد بالـ**slug** (مفتاح ثابت) مش بالعنوان — المالك بيغيّر
 *   العنوان من اللوحة (الدرس العاشر). ولو جت قضية جديدة مالهاش رسمة،
 *   بتنزل رسمة **العالم**، ولو العالم كمان مش معروف بتنزل العدسة.
 *   يعني مفيش حالة بتطلّع مربع فاضي.
 */

/**
 * ⚠ **الألوان من متغيّرات الثيم مش ثوابت.** الموقع له وضع نهاري وليلي
 *   (`--bg`/`--fg`/`--surface` في `globals.css`)، فرسمة مرسومة بـ`#14161A`
 *   بتختفي خالص على الخلفية الغامقة. اتكشف باللقطة: عناوين الأقسام
 *   والخطوط الفاصلة كانت غير مرئية في الليلي.
 *   البرتقالي الوحيد الثابت هو `--accent-text` — وهو أصلًا نسختين
 *   (أغمق في النهاري علشان التباين).
 */
const HOT = 'var(--accent-text)'
/**
 * ⚠ الخط **`currentColor`** مش لون ثابت — علشان الرسمة تشتغل جوه «ملف
 *   القضية» كمان، واللي له ورقته الخاصة حسب عالم القضية (`doc.theme`):
 *   ورقة غامقة والموقع نهاري = رسمة غامقة على غامق. دلوقتي بتورّث لون
 *   النص من الحاوية، فمستحيل تفترق عنها.
 */
const LINE = 'currentColor'
const BLUE = 'var(--logo-stroke)'

type Props = {
  /** slug القضية من `fn_cases_public` */
  slug?: string | null
  /** slug العالم — الاحتياطي لو القضية مالهاش رسمة */
  world?: string | null
  /** رسمة الصدارة (الدوسيه) — مش بتاعة قضية بعينها */
  hero?: boolean
  /** الخلفية: رملي (على الكريمي) أو كريمي (جوه كارت رملي) */
  tone?: 'sand' | 'cream' | 'ink'
  /** تجاوز الخلفية ولون التعبئة — للسياقات اللي ليها ورقتها (ملف القضية) */
  bg?: string
  /** لون تعبئة الأشكال المصمتة. افتراضيًا خلفية الصفحة. */
  fill?: string
  className?: string
}

/** أبعاد اللوحة — كل الرسومات على نفس المقاس */
const W = 120
const H = 84

function Frame({
  tone = 'sand',
  bg,
  fill,
  className,
  children,
}: {
  tone?: 'sand' | 'cream' | 'ink'
  bg?: string
  fill?: string
  className?: string
  children: React.ReactNode
}) {
  const paper =
    bg ??
    (tone === 'ink'
      ? 'rgba(127,127,127,.12)'
      : tone === 'cream'
        ? 'var(--bg)'
        : 'var(--surface)')
  // ⚠ الخلفية **div** مش `rect` جوه الـSVG: الصفحة لحد 720px، ولو الرسمة
  //   اتمدّت على العرض ده كله بقت لوحة ٥٠٠ بكسل. فالخلفية بتملا العرض،
  //   والرسمة نفسها بحد أقصى في النص.
  return (
    <div
      className={className}
      style={
        {
          background: paper,
          borderRadius: 16,
          padding: '14px 10px',
          // التعبئة المصمتة = لون الورقة، علشان الأشكال تفضل «مفرّغة»
          '--case-fill': fill ?? (bg ? bg : 'var(--bg)'),
        } as React.CSSProperties
      }
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        aria-hidden="true"
        focusable="false"
        style={{ display: 'block', width: '100%', maxWidth: 340, height: 'auto', margin: '0 auto' }}
      >
        <g
          fill="none"
          stroke={LINE}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {children}
        </g>
      </svg>
    </div>
  )
}

/* ========================================================================
   أبيض وأسود — عقد الهانم · الجواب المجهول · ورقة اليانصيب
   ====================================================================== */

/** عقد لؤلؤ على قوس، ولؤلؤة واحدة **ناقصة** (الفجوة البرتقالي) */
function Necklace() {
  const beads = [
    [30, 34], [36, 42], [44, 48], [53, 51], [62, 51], [71, 48], [79, 42], [85, 34],
  ]
  return (
    <>
      <path d="M26 24c0 22 14 34 34 34s34-12 34-34" />
      {beads.map(([x, y], i) =>
        // اللؤلؤة رقم ٤ مرسومة تحت كفجوة برتقالي — فمفيش دايرة هنا خالص
        i === 4 ? null : <circle key={i} cx={x} cy={y} r="3.4" fill={'var(--case-fill)'} />,
      )}
      {/* اللؤلؤة اللي اختفت */}
      <circle cx="62" cy="51" r="4.4" stroke={HOT} strokeDasharray="3 3" fill="none" />
      {/* القفل */}
      <path d="M26 24v-5M94 24v-5" />
      <rect x="52" y="64" width="16" height="12" rx="3" />
      <path d="M56 64v-3a4 4 0 0 1 8 0v3" />
    </>
  )
}

/** ظرف مفتوح وجواه ورقة بسطر واحد وعلامة استفهام */
function Letter() {
  return (
    <>
      <rect x="20" y="30" width="62" height="40" rx="4" />
      <path d="M20 34l31 20 31-20" />
      <rect x="58" y="14" width="40" height="30" rx="3" fill={'var(--case-fill)'} />
      <path d="M64 24h26M64 31h18" />
      <path d="M86 56c0-4 6-4 6-8 0-2.5-2-4-4.5-4S83 45.5 83 48" stroke={HOT} />
      <circle cx="87" cy="63" r="1.6" fill={HOT} stroke="none" />
    </>
  )
}

/** ورقة يانصيب معلّقة بدبوس — والورقة راحت، فضل الدبوس */
function LotteryTicket() {
  return (
    <>
      {/* الحيطة والدبوس */}
      <path d="M12 16h96" strokeDasharray="4 4" opacity="0.5" />
      <circle cx="44" cy="22" r="3.2" fill={HOT} stroke={HOT} />
      <path d="M44 25v6" stroke={HOT} />
      {/* الورقة */}
      <path d="M24 31h40a4 4 0 0 1 4 4v30a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V35a4 4 0 0 1 4-4z" />
      <path d="M28 41h20M28 48h28M28 55h14" />
      <circle cx="56" cy="59" r="5" stroke={HOT} />
      {/* فراغها على الحيطة */}
      <path
        d="M80 31h20a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H80a4 4 0 0 1-4-4V35a4 4 0 0 1 4-4z"
        strokeDasharray="4 4"
        opacity="0.55"
      />
    </>
  )
}

/* ========================================================================
   المهمة — الشفرة · العميلين · الخزنة
   ====================================================================== */

/** ظرف مختوم بختم شمع + ساعة بتعدّ */
function SealedCode() {
  return (
    <>
      <rect x="14" y="26" width="62" height="42" rx="4" />
      <path d="M14 30l31 20 31-20" opacity="0.5" />
      <circle cx="45" cy="52" r="8" fill={HOT} stroke={HOT} />
      <path d="M41 52l3 3 5-6" stroke={'var(--case-fill)'} strokeWidth="2" />
      {/* الساعة */}
      <circle cx="94" cy="40" r="15" />
      <path d="M94 31v9l6 4" />
      <path d="M86 21l-4-4M102 21l4-4" />
    </>
  )
}

/** ظرفين: واحد مختوم وواحد فاضي — واتنين بيغطّوا على بعض */
function TwoAgents() {
  return (
    <>
      {/* الاتنين */}
      <circle cx="36" cy="30" r="9" />
      <path d="M22 60c0-8 6-14 14-14s14 6 14 14" />
      <circle cx="74" cy="30" r="9" />
      <path d="M60 60c0-8 6-14 14-14s14 6 14 14" />
      {/* الخيط اللي بينهم */}
      <path d="M50 38h10" stroke={HOT} strokeDasharray="3 3" />
      {/* الظرف المختوم */}
      <rect x="92" y="48" width="22" height="16" rx="2.5" />
      <path d="M92 50l11 7 11-7" opacity="0.5" />
      <circle cx="103" cy="57" r="3.4" fill={HOT} stroke={HOT} />
      {/* علامة على الاتنين */}
      <path d="M31 28l3 3 5-5" stroke={HOT} strokeWidth="2" />
      <path d="M69 28l3 3 5-5" stroke={HOT} strokeWidth="2" />
    </>
  )
}

/** خزنة بعجلة وأربع خانات فاضية */
function Vault() {
  return (
    <>
      <rect x="16" y="14" width="88" height="58" rx="6" />
      <rect x="23" y="21" width="74" height="44" rx="4" opacity="0.4" />
      {/* العجلة */}
      <circle cx="46" cy="43" r="13" />
      <circle cx="46" cy="43" r="4" fill={HOT} stroke={HOT} />
      <path d="M46 30v-4M46 60v4M33 43h-4M63 43h4M37 34l-3-3M55 52l3 3M55 34l3-3M37 52l-3 3" />
      {/* الخانات الأربعة */}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={68 + i * 9} y="34" width="7" height="12" rx="1.5" stroke={HOT} />
      ))}
      <path d="M68 54h27" opacity="0.45" />
    </>
  )
}

/* ========================================================================
   مين عملها؟ — المحشي · الريموت · الجروب
   ====================================================================== */

/** حلة والغطا مرفوع ونصها راح */
function Pot() {
  return (
    <>
      {/* الغطا مرمي جنبها */}
      <path d="M78 34c0-6 6-10 13-10s13 4 13 10" />
      <path d="M74 34h34" />
      <circle cx="91" cy="20" r="2.6" fill={HOT} stroke={HOT} />
      {/* الحلة */}
      <path d="M18 34h48v26a8 8 0 0 1-8 8H26a8 8 0 0 1-8-8V34z" />
      <path d="M18 34h48" />
      <path d="M14 40h4M66 40h4" />
      {/* نص المحشي */}
      <path d="M20 52h44" stroke={HOT} strokeDasharray="4 3" />
      <circle cx="30" cy="60" r="3.2" />
      <circle cx="41" cy="61" r="3.2" />
      <circle cx="52" cy="60" r="3.2" />
      {/* بخار */}
      <path d="M32 28c0-4 4-4 4-8M48 28c0-4 4-4 4-8" opacity="0.55" />
    </>
  )
}

/** تلفزيون شغال على القناة الغلط + ريموت مش موجود */
function Remote() {
  return (
    <>
      <rect x="12" y="16" width="62" height="42" rx="5" />
      <path d="M30 68h26M43 58v10" />
      {/* شوشرة */}
      <path d="M20 30h14M38 30h8M20 38h8M32 38h22M20 46h30" opacity="0.5" />
      <circle cx="62" cy="46" r="4" stroke={HOT} />
      {/* الريموت — فراغ متقطع */}
      <rect x="86" y="20" width="22" height="50" rx="6" strokeDasharray="4 4" stroke={HOT} />
      <circle cx="97" cy="31" r="2.6" stroke={HOT} opacity="0.7" />
      <circle cx="92" cy="43" r="2.2" stroke={HOT} opacity="0.5" />
      <circle cx="102" cy="43" r="2.2" stroke={HOT} opacity="0.5" />
      <circle cx="92" cy="53" r="2.2" stroke={HOT} opacity="0.5" />
      <circle cx="102" cy="53" r="2.2" stroke={HOT} opacity="0.5" />
    </>
  )
}

/** موبايل فيه جروب — وواحد خرج */
function GroupChat() {
  return (
    <>
      <rect x="34" y="8" width="52" height="68" rx="8" />
      <path d="M52 14h16" />
      {/* فقاعات */}
      <path d="M42 28h22a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H42a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z" />
      <path d="M58 46h20a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H58a3 3 0 0 1-3-3v-6a3 3 0 0 1 3-3z" />
      {/* الرسالة اللي اتمسحت */}
      <path
        d="M42 62h22a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H42a3 3 0 0 1-3-3v-4a3 3 0 0 1 3-3z"
        strokeDasharray="3 3"
        stroke={HOT}
      />
      {/* العداد: واحد ناقص */}
      <circle cx="96" cy="24" r="11" stroke={HOT} />
      <path d="M90 24h12" stroke={HOT} />
    </>
  )
}

/* ========================================================================
   رسومات العوالم — احتياطي ووسم
   ====================================================================== */

/** شمعدان — أبيض وأسود */
function Candles() {
  return (
    <>
      <path d="M40 70h40M60 70V44" />
      <path d="M36 44h48" />
      <path d="M36 44v-6M60 44v-8M84 44v-6" />
      <path d="M36 38c0-4 4-4 4-8 0 4 4 4 4 8" stroke={HOT} />
      <path d="M56 36c0-5 4-5 4-10 0 5 4 5 4 10" stroke={HOT} />
      <path d="M76 38c0-4 4-4 4-8 0 4 4 4 4 8" stroke={HOT} />
      <path d="M48 74h24" opacity="0.4" />
    </>
  )
}

/** ساعة بعداد — المهمة */
function Timer() {
  return (
    <>
      <circle cx="60" cy="46" r="24" />
      <path d="M60 30v16l10 7" stroke={HOT} />
      <path d="M52 16h16M60 16v6" />
      <path d="M38 24l-5-5M82 24l5-5" />
      <circle cx="60" cy="46" r="2.4" fill={LINE} stroke="none" />
    </>
  )
}

/** بيت وشوكة — مين عملها؟ */
function House() {
  return (
    <>
      <path d="M26 44L60 20l34 24" />
      <path d="M34 42v28h52V42" />
      <rect x="52" y="52" width="16" height="18" rx="2" stroke={HOT} />
      <path d="M78 26v-8" />
      <circle cx="78" cy="16" r="2.4" fill={HOT} stroke={HOT} />
    </>
  )
}

/**
 * دوسيه مفتوح وعليه عدسة — رسمة صدارة الصفحة.
 * مش احتياطي لقضية: دي صورة «اللعبة» نفسها.
 */
function Dossier() {
  return (
    <>
      {/* الملف وطيّته */}
      <path d="M18 10h38l12 12v48a4 4 0 0 1-4 4H18a4 4 0 0 1-4-4V14a4 4 0 0 1 4-4z" />
      <path d="M56 10v12h12" opacity="0.55" />
      <path d="M23 34h24M23 42h30M23 50h18" opacity="0.5" />
      {/* ختم «الملف» */}
      <rect x="22" y="58" width="24" height="9" rx="2" stroke={HOT} />
      {/* العدسة فوق الملف */}
      <circle cx="90" cy="40" r="17" strokeWidth="2.6" />
      <circle cx="90" cy="40" r="10.5" opacity="0.28" />
      <path d="M102 52l10 10" stroke={HOT} strokeWidth="3.4" />
      {/* علامة سؤال جوّه العدسة */}
      <path d="M86 40c0-4 6-4 6-8 0-2.4-2-4-4.4-4S83 29.6 83 32" opacity="0.75" />
      <circle cx="88.4" cy="48" r="1.7" fill={LINE} stroke="none" opacity="0.75" />
    </>
  )
}

/** عدسة — الاحتياطي الأخير */
function Lens() {
  return (
    <>
      <circle cx="52" cy="38" r="22" />
      <circle cx="52" cy="38" r="15" opacity="0.35" />
      <path d="M68 54l20 20" stroke={HOT} strokeWidth="3.2" />
      <path d="M44 30a12 12 0 0 1 8-4" opacity="0.6" />
    </>
  )
}

/* ====================================================================== */

const BY_CASE: Record<string, () => React.ReactElement> = {
  'aqd-elhanem': Necklace,
  'elgawab-elmaghool': Letter,
  'waraqet-elyanaseeb': LotteryTicket,
  elshafra: SealedCode,
  el3ameleen: TwoAgents,
  elkhazna: Vault,
  'meen-kal-elmahshi': Pot,
  elremote: Remote,
  'meen-sab-elgroup': GroupChat,
}

const BY_WORLD: Record<string, () => React.ReactElement> = {
  mono: Candles,
  mission: Timer,
  whodunit: House,
}

export function CaseArt({ slug, world, hero, tone = 'sand', bg, fill, className }: Props) {
  const Art = hero
    ? Dossier
    : (slug && BY_CASE[slug]) || (world && BY_WORLD[world]) || Lens
  return (
    <Frame tone={tone} bg={bg} fill={fill} className={className}>
      <Art />
    </Frame>
  )
}

/* ====================================================================== */

/**
 * وسم العالم — أيقونة صغيرة جنب اسم العالم. نفس رسمة العالم بس من غير
 * خلفية ولا حدود، علشان تقعد جنب نص.
 */
export function WorldMark({ world, size = 26 }: { world?: string | null; size?: number }) {
  const Art = (world && BY_WORLD[world]) || Lens
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={size}
      height={(size * H) / W}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <g fill="none" stroke={BLUE} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
        <Art />
      </g>
    </svg>
  )
}
