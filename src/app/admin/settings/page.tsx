'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import { revalidateSite, rejected } from '@/lib/admin'
import type { AdminMe } from '@/lib/admin'
import {
  Card,
  Section,
  Tabs,
  Btn,
  TextField,
  NumberField,
  Toggle,
  SelectField,
  Table,
  Empty,
  Loading,
  Tag,
  useFlash,
  when,
} from '@/components/admin-ui'

/**
 * الإعدادات — كل رقم وقاعدة ومفتاح بيشغّل النادي، من غير ما حد يفتح الكود.
 *
 * أربع أقسام:
 *   الأرقام        → جدول settings (صف واحد، id = true)
 *   مفاتيح المزايا  → feature_flags (مفتاح لكل ميزة)
 *   الصيانة        → maintenance (صف واحد)
 *   الكلمات الممنوعة → banned_words
 *
 * كل حاجة بتتحفظ لما تسيب الحقل، وبعدها بننده revalidateSite علشان
 * الموقع يشوف الجديد على طول.
 *
 */

/* ---------------------------------------------------------- أنواع */

type Row = Record<string, unknown>

interface FlagRow {
  key: string
  name_ar: string
  is_on: boolean
  off_message_ar: string | null
}

interface BannedRow {
  word: string
  added_at: string
}

const TABS = [
  { id: 'numbers', label: 'الأرقام' },
  { id: 'flags', label: 'مفاتيح المزايا' },
  { id: 'maint', label: 'الصيانة' },
  { id: 'words', label: 'الكلمات الممنوعة' },
] as const
type TabId = (typeof TABS)[number]['id']

/* ---------------------------------------------------------- وصف الأرقام */

interface NumSpec {
  col: string
  label: string
  hint: string
  suffix?: string
  /** العمود متخزّن قروش — بنعرضه جنيه وبنحفظه قروش */
  money?: boolean
  min?: number
  max?: number
  /** العمود موجود في القاعدة بس محدش بيقراه — تعديله هنا ما بيأثرش على الموقع */
  unwired?: boolean
}

interface TxtSpec {
  col: string
  label: string
  hint: string
  unwired?: boolean
}

interface Group {
  title: string
  nums?: NumSpec[]
  txts?: TxtSpec[]
  picks?: {
    col: string
    label: string
    hint: string
    options: { value: string; label: string }[]
  }[]
}

const GROUPS: Group[] = [
  {
    title: 'الاسترداد والإلغاء',
    nums: [
      {
        col: 'refund_full_days',
        label: 'ترجيع الفلوس كاملة قبل',
        suffix: 'يوم',
        hint: 'العضو اللي يلغي قبل السبوطة بالمدة دي بياخد فلوسه كلها.',
        min: 0,
      },
      {
        col: 'refund_half_days',
        label: 'ترجيع نص الفلوس قبل',
        suffix: 'يوم',
        hint: 'أقل من المدة اللي فوق وأكتر من دي = نص المبلغ. صفر يعني مفيش مرحلة نص أصلًا.',
        min: 0,
      },
      {
        col: 'refund_credit_hours',
        unwired: true,
        label: 'رصيد محفظة بدل كاش قبل',
        suffix: 'ساعة',
        hint: 'الإلغاء المتأخر مبيرجّعش كاش — بيتحط رصيد في المحفظة لو باقي على السبوطة الساعات دي.',
        min: 0,
      },
      {
        col: 'our_cancel_bonus_pct',
        label: 'زيادة لما إحنا اللي نلغي',
        suffix: '%',
        hint: 'لو إحنا لغينا السبوطة، بنرجّع الفلوس كلها وزيادة النسبة دي اعتذار.',
        min: 0,
        max: 100,
      },
    ],
  },
  {
    title: 'العمولة والدفع',
    nums: [
      {
        col: 'commission_pct',
        unwired: true,
        label: 'عمولتنا',
        suffix: '%',
        hint: 'نسبتنا من سعر السبوطة. الباقي مستحق للمكان.',
        min: 0,
        max: 100,
      },
      {
        col: 'gateway_fee_pct',
        unwired: true,
        label: 'رسوم بوابة الدفع',
        suffix: '%',
        hint: 'اللي البوابة بتاخده من كل عملية، وبيتحسب في صافي المستحق. تقدر تكتب كسور زي 2.75.',
        min: 0,
        max: 100,
      },
      {
        col: 'manual_review_hours',
        label: 'مراجعة الإيصال في خلال',
        suffix: 'ساعة',
        hint: 'الوقت اللي بنوعد بيه العضو لما يحوّل فودافون كاش أو إنستاباي ويرفع صورة التحويل.',
        min: 0,
      },
    ],
    picks: [
      {
        col: 'payment_provider',
        label: 'طريقة الدفع الشغالة',
        hint: 'اللي بيتعرض للعضو في صفحة الدفع. paymob وkashier محجوزين لو رجعنا لبوابة أوتوماتيك.',
        options: [
          { value: 'instapay', label: 'إنستاباي' },
          { value: 'vodafone_cash', label: 'فودافون كاش' },
          { value: 'wallet', label: 'المحفظة' },
          { value: 'paymob', label: 'Paymob (بوابة)' },
          { value: 'kashier', label: 'Kashier (بوابة)' },
        ],
      },
    ],
    txts: [
      {
        col: 'vodafone_number',
        label: 'رقم فودافون كاش',
        hint: 'الرقم اللي العضو بيحوّل عليه. غلطة هنا = فلوس رايحة لحد تاني.',
      },
      {
        col: 'instapay_handle',
        label: 'حساب إنستاباي',
        hint: 'الاسم اللي بيظهر للعضو علشان يحوّل عليه.',
      },
      {
        col: 'emergency_phone',
        label: 'رقم الطوارئ',
        hint: 'زرار الاتصال في صفحة القواعد. سيبه فاضي والزرار هيختفي خالص — أحسن من رقم غلط.',
      },
    ],
  },
  {
    title: 'الخصومات والمكافآت',
    nums: [
      {
        col: 'referral_discount_pct',
        label: 'خصم الإحالة',
        suffix: '%',
        hint: 'الخصم اللي بياخده الصاحب الجديد في أول سبوطة ليه.',
        min: 0,
        max: 100,
      },
      {
        col: 'referral_reward',
        label: 'مكافأة اللي عزم',
        suffix: 'جنيه',
        money: true,
        hint: 'بتتحط رصيد في محفظته لما صاحبه يحضر أول سبوطة فعلًا. متخزّنة قروش في القاعدة.',
        min: 0,
      },
      {
        col: 'review_coupon_pct',
        unwired: true,
        label: 'كوبون التقييم',
        suffix: '%',
        hint: 'الخصم اللي بياخده العضو لما يقيّم سبوطة حضرها.',
        min: 0,
        max: 100,
      },
      {
        col: 'first_time_work_discount_pct',
        unwired: true,
        label: 'خصم أول سبوطة شغل',
        suffix: '%',
        hint: 'نسبة بتتخصم من أول سبوطة شغل للعضو. صفر يعني مفيش خصم.',
        min: 0,
        max: 100,
      },
    ],
  },
  {
    title: 'الساعات والمواعيد',
    nums: [
      {
        col: 'reveal_hour_cairo',
        unwired: true,
        label: 'ساعة كشف المجموعة',
        suffix: 'بتوقيت القاهرة',
        hint: 'الساعة اللي بنكشف فيها تفاصيل المجموعة للأعضاء.',
        min: 0,
        max: 23,
      },
      {
        col: 'chat_open_hours',
        unwired: true,
        label: 'الشات بيفتح قبل السبوطة بـ',
        suffix: 'ساعة',
        hint: 'قبل كده مفيش شات — المجموعة لسه مقفولة.',
        min: 0,
      },
      {
        col: 'chat_close_hours',
        unwired: true,
        label: 'الشات بيقفل بعد السبوطة بـ',
        suffix: 'ساعة',
        hint: 'بعد المدة دي الأوضة بتتقفل ومحدش يقدر يكتب فيها.',
        min: 0,
      },
      {
        col: 'day_mode_start_hour',
        unwired: true,
        label: 'وضع النهار بيبدأ الساعة',
        suffix: 'بتوقيت القاهرة',
        hint: 'الموقع بيقلب لشكل النهار من الساعة دي.',
        min: 0,
        max: 23,
      },
      {
        col: 'day_mode_end_hour',
        unwired: true,
        label: 'وضع النهار بيخلص الساعة',
        suffix: 'بتوقيت القاهرة',
        hint: 'وبعدها بيرجع لشكل الليل.',
        min: 0,
        max: 23,
      },
    ],
  },
  {
    title: 'المطابقة',
    nums: [
      {
        col: 'match_max_age_gap',
        label: 'أكبر فرق سن جوه المجموعة',
        suffix: 'سنة',
        hint: 'بنحاول محدش يلاقي نفسه مع ناس أكبر أو أصغر منه بأكتر من كده.',
        min: 0,
      },
      {
        col: 'match_min_starters',
        label: 'أقل عدد ناس بيفتحوا الكلام',
        suffix: 'شخص',
        hint: 'كل مجموعة لازم يكون فيها العدد ده على الأقل من نوع «بيفتح الكلام» علشان الجو ميبقاش ميت.',
        min: 0,
      },
      {
        col: 'match_girls_ratio_min',
        label: 'أقل نسبة بنات في المجموعة',
        suffix: '%',
        hint: 'أقل من كده المجموعة مش هتتقفل.',
        min: 0,
        max: 100,
      },
      {
        col: 'match_girls_ratio_max',
        label: 'أكبر نسبة بنات في المجموعة',
        suffix: '%',
        hint: 'الحد التاني للتوازن — أعلى من كده برضه مش هتتقفل.',
        min: 0,
        max: 100,
      },
      {
        col: 'match_mutual_weight',
        label: 'وزن الاهتمام المشترك',
        suffix: 'نقطة',
        hint: 'كل اهتمام مشترك بين اتنين بيزوّد نقط المجموعة بالرقم ده. أعلى = بنجمّع المتشابهين أكتر.',
        min: 0,
      },
      {
        col: 'match_no_show_limit',
        label: 'حد الغياب',
        suffix: 'مرة',
        hint: 'العضو اللي غاب العدد ده من غير ما يلغي بيتوقف عن المطابقة التلقائية.',
        min: 0,
      },
      {
        col: 'algorithm_version',
        label: 'نسخة خوارزمية المطابقة',
        hint: 'متغيّرهاش من غير ما نتكلم — نتايج المطابقة القديمة بتتقارن على أساس الرقم ده.',
        min: 1,
      },
    ],
  },
  {
    title: 'الأعضاء والتسجيل',
    nums: [
      {
        col: 'min_age',
        unwired: true,
        label: 'أقل سن للتسجيل',
        suffix: 'سنة',
        hint: 'أصغر من كده مش هيقدر يكمّل تسجيل أصلًا.',
        min: 0,
      },
      {
        col: 'min_age_overnight',
        unwired: true,
        label: 'أقل سن للسبوطة اللي فيها مبيت',
        suffix: 'سنة',
        hint: 'الرحلات اللي بتبات بره بتطلب سن أكبر.',
        min: 0,
      },
      {
        col: 'max_interests',
        unwired: true,
        label: 'أقصى عدد اهتمامات',
        suffix: 'اهتمام',
        hint: 'العضو مش هيقدر يختار أكتر من كده في ملفه. أعلى = مطابقة أدق بس ملف أطول.',
        min: 1,
      },
      {
        col: 'otp_max_attempts',
        label: 'أقصى محاولات على رمز الدخول',
        suffix: 'محاولة',
        hint: 'بعدها الرمز بيتقفل ولازم يطلب واحد جديد. ده كمان بيحمي دخول اللوحة — متعلّيهوش من غير سبب.',
        min: 1,
        max: 20,
      },
      {
        col: 'otp_sends_per_hour',
        label: 'أقصى إرسالات رمز في الساعة للرقم',
        suffix: 'إرسالة',
        hint: 'حماية علشان محدش يستخدمنا نزنّ على رقم حد.',
        min: 1,
        max: 100,
      },
      {
        col: 'otp_ip_sends_per_hour',
        label: 'أقصى إرسالات في الساعة من نفس الجهاز',
        suffix: 'إرسالة',
        hint: 'الحد بالرقم لوحده مكانش بيكفي — مهاجم معاه ألف رقم كان بياخد ألف نصيب من نفس الجهاز.',
        min: 1,
        max: 1000,
      },
      {
        col: 'otp_ip_verifies_per_hour',
        label: 'أقصى محاولات تحقق في الساعة من نفس الجهاز',
        suffix: 'محاولة',
        hint: 'سقف تاني فوق سقف المحاولات على الرمز الواحد. نزّله لو شفت محاولات تخمين في السجل.',
        min: 1,
        max: 1000,
      },
    ],
  },
  {
    title: 'السبوطات والرسايل',
    nums: [
      {
        col: 'mystery_min_sbotat',
        label: 'أقل عدد سبوطات قبل الغامضة',
        suffix: 'سبوطة',
        hint: 'العضو لازم يحضر العدد ده الأول قبل ما نسيبه يحجز سبوطة غامضة.',
        min: 0,
      },
      {
        col: 'daily_broadcast_limit',
        label: 'أقصى رسايل جماعية في اليوم',
        suffix: 'رسالة',
        hint: 'حماية علشان محدش يزنّ على الأعضاء بالغلط.',
        min: 0,
      },
      {
        col: 'admin_page_size',
        label: 'عدد الصفوف في صفحة اللوحة',
        suffix: 'صف',
        hint: 'كل جداول اللوحة بتقلّب بالرقم ده. أكبر = تقليب أقل بس تحميل أتقل. (10–200)',
        min: 10,
        max: 200,
      },
      {
        col: 'notify_max_stale_hours',
        label: 'أقصى تأخير قبل ما نلغي الإشعار',
        suffix: 'ساعة',
        hint: 'إشعار فات ميعاده بأكتر من كده مبيتبعتش خالص — بيتقفل. بيمنعنا نبعت تذكير بسبوطة عدّت لو الطابور وقف فترة. صفر = ابعت كل حاجة مهما قدمت.',
        min: 0,
        max: 8760,
      },
    ],
  },
]

/** أعمدة JSON — ليها معاملة خاصة علشان لازم تتأكد إنها سليمة قبل الحفظ */
const JSON_COLS: { col: string; label: string; hint: string; unwired?: boolean }[] = [
  {
    col: 'weather_rules',
        unwired: true,
    label: 'قواعد الجو',
    hint: 'لكل نشاط: إمتى نلغي أو ننقل بسبب الحر أو المطر. لازم يبقى JSON سليم وإلا مش هيتحفظ.',
  },
  {
    col: 'metric_thresholds',
        unwired: true,
    label: 'حدود الأرقام',
    hint: 'الحدود اللي بتلوّن أرقام الرئيسية أخضر ولا أحمر. لازم يبقى JSON سليم وإلا مش هيتحفظ.',
  },
]

/** شرح مختصر لكل مفتاح ميزة — إيه اللي بيتقفل بالظبط */
const FLAG_HINTS: Record<string, string> = {
  booking: 'بيقفل الحجز كله — الأعضاء يتفرجوا على السبوطات بس ومش هيقدروا يحجزوا.',
  game: 'بيخفي لعبة «مين جاي؟» من التسجيل ومن صفحتها.',
  map: 'بيقفل خريطة المناطق والمواضع اللي عليها.',
  mystery: 'بيوقف السبوطة الغامضة — مش هتظهر في القايمة.',
  work_sbota: 'بيوقف سبوطات الشغل بس، الباقي شغال عادي.',
  chat: 'بيقفل شات المجموعات كله، حتى المجموعات المفتوحة حاليًا.',
  referral: 'بيوقف الإحالة — لا لينكات جديدة ولا خصم ولا مكافأة.',
}

/* ---------------------------------------------------------- مساعدات */

/**
 * تحذير الحقل غير الموصّل — بيتزاد قدام الشرح علشان المالك يعرف إن تعديله
 * هنا ما بيأثرش على الموقع لسه (العمود موجود في القاعدة بس محدش بيقراه).
 */
const UNWIRED_NOTE = '⚠ مش موصّل بالموقع لسه — تعديله هنا ما بيأثرش. '
const hintFor = (spec: { hint: string; unwired?: boolean }) =>
  spec.unwired ? UNWIRED_NOTE + spec.hint : spec.hint

const num = (row: Row | null, col: string) => Number(row?.[col] ?? 0)
const txt = (row: Row | null, col: string) => String(row?.[col] ?? '')
const pretty = (v: unknown) => {
  try {
    return JSON.stringify(v ?? {}, null, 2)
  } catch {
    return '{}'
  }
}

/** عرض للقراءة بس — لما الشخص عنده settings.view من غير settings.edit */
function ReadOnly({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <span className="font-display text-18 font-black">{value}</span>
      {hint && (
        <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      )}
    </div>
  )
}

/* ---------------------------------------------------------- الصفحة */

export default function AdminSettingsPage() {
  return (
    <AdminShell title="الإعدادات" needs="settings.view">
      {(me) => <SettingsEditor me={me} />}
    </AdminShell>
  )
}

function SettingsEditor({ me }: { me: AdminMe }) {
  const canEdit = me.permissions.has('settings.edit')
  const canDanger = me.permissions.has('settings.danger')

  const [tab, setTab] = useState<TabId>('numbers')
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<Row | null>(null)
  const [flags, setFlags] = useState<FlagRow[]>([])
  const [maint, setMaint] = useState<Row | null>(null)
  const [words, setWords] = useState<BannedRow[]>([])
  const [newWord, setNewWord] = useState('')
  const { flash, node: flashNode } = useFlash()

  const reload = useCallback(async () => {
    const db = supabase()
    const [s, f, m, w] = await Promise.all([
      db.from('settings').select('*').maybeSingle(),
      db.from('feature_flags').select('key, name_ar, is_on, off_message_ar').order('key'),
      db.from('maintenance').select('*').maybeSingle(),
      db.from('banned_words').select('word, added_at').order('word'),
    ])
    setSettings((s.data ?? null) as Row | null)
    setFlags((f.data ?? []) as FlagRow[])
    setMaint((m.data ?? null) as Row | null)
    setWords((w.data ?? []) as BannedRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  /* ------------------------------------------------ حفظ */

  /** بيحفظ عمود واحد في settings ويرجّع الموقع يقرا الجديد */
  async function saveSetting(col: string, value: unknown, label: string) {
    if (!canEdit) return
    const { data, error } = await supabase()
      .from('settings')
      .update({ [col]: value })
      .eq('id', true)
      .select('id')
    if (error) {
      flash(`«${label}» مااتحفظش: ${error.message}`)
      return
    }
    if (rejected(data)) {
      flash(`«${label}» مااتحفظش — القاعدة رفضت الكتابة، محتاج صلاحية settings.edit`)
      return
    }
    setSettings((s) => (s ? { ...s, [col]: value } : s))
    const ok = await revalidateSite()
    flash(ok ? `«${label}» اتحفظ ✓ وبان في الموقع` : `«${label}» اتحفظ ✓ — هيبان خلال أقل من دقيقة`)
  }

  async function saveJson(col: string, raw: string, label: string) {
    if (!canEdit) return
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      flash(`«${label}» فيه غلطة في صيغة JSON — مااتحفظش. راجع الأقواس والفواصل والعلامات.`)
      return
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      flash(`«${label}» لازم يبقى كائن JSON بين قوسين { } — مااتحفظش.`)
      return
    }
    await saveSetting(col, parsed, label)
  }

  async function saveFlag(key: string, patch: Partial<FlagRow>, label: string) {
    if (!canEdit) return
    const { data, error } = await supabase()
      .from('feature_flags')
      .update(patch)
      .eq('key', key)
      .select('key')
    if (error) {
      flash(`«${label}» مااتحفظش: ${error.message}`)
      return
    }
    if (rejected(data)) {
      flash(`«${label}» مااتحفظش — القاعدة رفضت الكتابة، محتاج صلاحية settings.edit`)
      return
    }
    setFlags((fs) => fs.map((f) => (f.key === key ? { ...f, ...patch } : f)))
    const ok = await revalidateSite()
    flash(ok ? `«${label}» اتحفظ ✓ وبان في الموقع` : `«${label}» اتحفظ ✓ — هيبان خلال أقل من دقيقة`)
  }

  async function saveMaint(patch: Row, note: string) {
    const { data, error } = await supabase()
      .from('maintenance')
      .update(patch)
      .eq('id', true)
      .select('id')
    if (error) {
      flash(`مااتحفظش: ${error.message}`)
      return
    }
    if (rejected(data)) {
      flash('مااتحفظش — القاعدة رفضت الكتابة، محتاج صلاحية settings.edit')
      return
    }
    setMaint((m) => (m ? { ...m, ...patch } : m))
    const ok = await revalidateSite()
    flash(ok ? `${note} ✓ وبان في الموقع` : `${note} ✓ — هيبان خلال أقل من دقيقة`)
  }

  function toggleMaint(on: boolean) {
    if (!canDanger) return
    if (on) {
      const ok = confirm(
        'دي هتقفل نسبوط على كل الأعضاء فورًا — محدش هيقدر يحجز ولا يفتح الشات.\n\nمتأكد إنك عايز تقفل الموقع؟'
      )
      if (!ok) return
    }
    saveMaint({ is_on: on }, on ? 'الموقع اتقفل للصيانة' : 'الموقع رجع اشتغل')
  }

  async function addWord() {
    const w = newWord.trim()
    if (!w) return
    if (words.some((x) => x.word === w)) {
      flash('الكلمة دي موجودة أصلًا.')
      return
    }
    const { data, error } = await supabase()
      .from('banned_words')
      .insert({ word: w })
      .select('word')
    if (error) {
      flash(`مقدرناش نضيفها: ${error.message}`)
      return
    }
    if (rejected(data)) {
      flash('مااتضافتش — القاعدة رفضت الكتابة، محتاج صلاحية settings.edit')
      return
    }
    setNewWord('')
    await reload()
    flash(`«${w}» اتضافت للممنوعات ✓`)
  }

  async function removeWord(w: string) {
    if (!confirm(`هنشيل «${w}» من الممنوعات، ويبقى ينفع تتكتب في اللوحة. تمام؟`)) return
    const { data, error } = await supabase()
      .from('banned_words')
      .delete()
      .eq('word', w)
      .select('word')
    if (error) {
      flash(`مقدرناش نشيلها: ${error.message}`)
      return
    }
    if (rejected(data)) {
      flash('مااتشالتش — القاعدة رفضت الكتابة، محتاج صلاحية settings.edit')
      return
    }
    setWords((ws) => ws.filter((x) => x.word !== w))
    flash(`«${w}» اتشالت ✓`)
  }

  /* ------------------------------------------------ الرسم */

  if (loading) return <Loading />

  return (
    <div>
      <Tabs tabs={TABS.map((t) => ({ id: t.id, label: t.label }))} value={tab} onChange={setTab} />

      {!canEdit && (
        <div className="mt-4">
          <Card
            title="إنت شايف بس"
            hint="عندك صلاحية تتفرج على الإعدادات، بس التعديل محتاج settings.edit. كلّم صاحب الحساب."
          >
            <span />
          </Card>
        </div>
      )}

      {flashNode}

      {tab === 'numbers' && (
        <NumbersTab
          settings={settings}
          canEdit={canEdit}
          onSave={saveSetting}
          onSaveJson={saveJson}
        />
      )}

      {tab === 'flags' && (
        <FlagsTab flags={flags} canEdit={canEdit} onSave={saveFlag} />
      )}

      {tab === 'maint' && (
        <MaintTab
          maint={maint}
          canDanger={canDanger}
          canEdit={canEdit}
          onToggle={toggleMaint}
          onSaveMessage={(v) => saveMaint({ message_ar: v }, 'رسالة الصيانة اتحفظت')}
          onSaveRoles={(roles) => {
            // لو مفيش ولا دور مسموح، محدش هيقدر يقفل الصيانة تاني
            if (!roles.length) {
              flash('لازم دور واحد على الأقل يفضل داخل.')
              return
            }
            saveMaint({ allow_roles: roles }, 'الأدوار المسموح لها اتحفظت')
          }}
        />
      )}

      {tab === 'words' && (
        <WordsTab
          words={words}
          canEdit={canEdit}
          newWord={newWord}
          setNewWord={setNewWord}
          onAdd={addWord}
          onRemove={removeWord}
        />
      )}
    </div>
  )
}

/* ---------------------------------------------------------- الأرقام */

function NumbersTab({
  settings,
  canEdit,
  onSave,
  onSaveJson,
}: {
  settings: Row | null
  canEdit: boolean
  onSave: (col: string, value: unknown, label: string) => void
  onSaveJson: (col: string, raw: string, label: string) => void
}) {
  if (!settings) {
    return <Empty>مفيش صف إعدادات في القاعدة. ده لازم يتظبط من هجرة، مش من هنا.</Empty>
  }

  return (
    <div>
      <div className="mt-4 font-body text-14" style={{ color: 'var(--muted)' }}>
        كل رقم هنا بيتحفظ لما تسيب الحقل، وبيأثر على الموقع على طول.
        آخر تعديل: {when(txt(settings, 'updated_at'))}
      </div>

      {GROUPS.map((g) => (
        <Section key={g.title} title={g.title}>
          <Card>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(g.nums ?? []).map((f) => {
                const raw = num(settings, f.col)
                const shown = f.money ? Math.round(raw / 100) : raw
                if (!canEdit) {
                  return (
                    <ReadOnly
                      key={f.col}
                      label={f.label}
                      value={`${shown.toLocaleString('ar-EG')}${f.suffix ? ` ${f.suffix}` : ''}`}
                      hint={hintFor(f)}
                    />
                  )
                }
                return (
                  <NumberField
                    key={f.col}
                    label={f.label}
                    value={shown}
                    min={f.min}
                    max={f.max}
                    suffix={f.suffix}
                    hint={hintFor(f)}
                    onSave={(v) => onSave(f.col, f.money ? Math.round(v * 100) : v, f.label)}
                  />
                )
              })}

              {(g.picks ?? []).map((p) =>
                canEdit ? (
                  <div key={p.col} className="flex flex-col gap-1">
                    <SelectField
                      label={p.label}
                      value={txt(settings, p.col)}
                      options={p.options}
                      onChange={(v) => onSave(p.col, v, p.label)}
                    />
                    <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
                      {p.hint}
                    </span>
                  </div>
                ) : (
                  <ReadOnly
                    key={p.col}
                    label={p.label}
                    value={
                      p.options.find((o) => o.value === txt(settings, p.col))?.label ??
                      txt(settings, p.col)
                    }
                    hint={p.hint}
                  />
                )
              )}

              {(g.txts ?? []).map((f) =>
                canEdit ? (
                  <TextField
                    key={f.col}
                    label={f.label}
                    value={txt(settings, f.col)}
                    hint={hintFor(f)}
                    onSave={(v) => onSave(f.col, v, f.label)}
                  />
                ) : (
                  <ReadOnly key={f.col} label={f.label} value={txt(settings, f.col)} hint={hintFor(f)} />
                )
              )}
            </div>
          </Card>
        </Section>
      ))}

      <Section title="قواعد بصيغة JSON">
        <Card hint="دي مش أرقام عادية — دي جداول قواعد. لو الصيغة غلط مش هنحفظ، وهنقولك.">
          <div className="mt-3 flex flex-col gap-4">
            {JSON_COLS.map((j) =>
              canEdit ? (
                <TextField
                  key={j.col}
                  label={j.label}
                  multiline
                  value={pretty(settings[j.col])}
                  hint={hintFor(j)}
                  onSave={(v) => onSaveJson(j.col, v, j.label)}
                />
              ) : (
                <ReadOnly
                  key={j.col}
                  label={j.label}
                  value={pretty(settings[j.col])}
                  hint={hintFor(j)}
                />
              )
            )}
          </div>
        </Card>
      </Section>
    </div>
  )
}

/* ---------------------------------------------------------- المزايا */

function FlagsTab({
  flags,
  canEdit,
  onSave,
}: {
  flags: FlagRow[]
  canEdit: boolean
  onSave: (key: string, patch: Partial<FlagRow>, label: string) => void
}) {
  if (!flags.length) return <Empty>مفيش مفاتيح مزايا في القاعدة.</Empty>

  return (
    <Section title="مفاتيح المزايا">
      <div
        className="mb-3 rounded-2xl p-3 font-body text-14"
        style={{ background: 'var(--surface)', color: 'var(--fg)', border: '1px solid var(--line)' }}
      >
        ⚠ <strong>المفاتيح دي لسه مش موصّلة بالموقع.</strong> القفل والفتح هنا بيتحفظ في القاعدة
        بس الموقع العام لسه مش بيقراهم — يعني قفل «الحجز» مثلًا <strong>مش</strong> هيقفل الحجز فعلًا.
        لو عايز تقفل الموقع كله دلوقتي، استعمل تبويب «الصيانة». هنشيل التحذير ده أول ما المفاتيح
        تتوصّل بالمسارات (الحجز · اللعبة · الشات · الخريطة · الغامضة · الإحالة · الشغل).
      </div>
      <div className="mb-3 font-body text-14" style={{ color: 'var(--muted)' }}>
        كل مفتاح المفروض يقفل حتة واحدة من الموقع من غير ما نقفل الموقع كله. لما تقفل حاجة،
        العضو المفروض يشوف الرسالة اللي إنت كاتبها مكانها — فاكتب حاجة تفهّمه، مش «عطل».
      </div>

      <div className="flex flex-col gap-3">
        {flags.map((f) => (
          <Card key={f.key}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-18 font-black">{f.name_ar}</span>
              <code className="font-body text-12" style={{ color: 'var(--muted)' }}>
                {f.key}
              </code>
              <span className="ms-auto">
                {f.is_on ? <Tag>شغّالة</Tag> : <Tag color="#F4632A">مقفولة</Tag>}
              </span>
            </div>

            <div className="mt-3 flex flex-col gap-3">
              {canEdit ? (
                <Toggle
                  label={f.is_on ? 'شغّالة للأعضاء' : 'مقفولة على الأعضاء'}
                  value={f.is_on}
                  hint={FLAG_HINTS[f.key] ?? 'بيقفل الميزة دي على الأعضاء.'}
                  onChange={(v) => onSave(f.key, { is_on: v }, f.name_ar)}
                />
              ) : (
                <ReadOnly
                  label="الحالة"
                  value={f.is_on ? 'شغّالة' : 'مقفولة'}
                  hint={FLAG_HINTS[f.key] ?? 'بيقفل الميزة دي على الأعضاء.'}
                />
              )}

              {canEdit ? (
                <TextField
                  label="الرسالة اللي العضو بيشوفها وهي مقفولة"
                  multiline
                  value={f.off_message_ar ?? ''}
                  hint="بتظهر مكان الميزة نفسها. خليها بلغتنا ومن غير كلام رسمي."
                  onSave={(v) => onSave(f.key, { off_message_ar: v }, f.name_ar)}
                />
              ) : (
                <ReadOnly
                  label="الرسالة وهي مقفولة"
                  value={f.off_message_ar ?? '—'}
                />
              )}
            </div>
          </Card>
        ))}
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------- الصيانة */

/** أدوار اللوحة — من admin_roles */
const ROLE_KEYS = ['owner', 'admin', 'ops', 'finance', 'support']

function MaintTab({
  maint,
  canDanger,
  canEdit,
  onToggle,
  onSaveMessage,
  onSaveRoles,
}: {
  maint: Row | null
  canDanger: boolean
  canEdit: boolean
  onToggle: (on: boolean) => void
  onSaveMessage: (v: string) => void
  onSaveRoles: (roles: string[]) => void
}) {
  if (!maint) return <Empty>مفيش صف صيانة في القاعدة.</Empty>

  const on = Boolean(maint.is_on)

  return (
    <Section title="قفل الموقع للصيانة">
      <div
        className="rounded-20 p-4"
        style={{
          background: 'var(--surface)',
          border: `3px solid ${on ? 'var(--err-text)' : 'var(--chip-idle-border)'}`,
        }}
      >
        <div className="font-display text-22 font-black">
          {on ? 'الموقع مقفول دلوقتي 🔴' : 'الموقع شغّال عادي'}
        </div>
        <p className="mt-2 font-body text-15" style={{ color: 'var(--muted)' }}>
          لما تفتح المفتاح ده، <b>نسبوط بيتقفل على كل الأعضاء فورًا</b> — مفيش حجز،
          مفيش شات، مفيش تسجيل. اللي هيفتح الموقع هيشوف الرسالة اللي تحت وبس.
          الفريق بيفضل داخل اللوحة عادي.
        </p>
        <p className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
          استعملها وقت الحاجة الحقيقية بس. لو عايز تقفل حتة واحدة، روح لـ«مفاتيح المزايا»
          بدل ما تقفل الدنيا كلها.
        </p>

        <div className="mt-4">
          {canDanger ? (
            <Btn kind={on ? 'primary' : 'danger'} onClick={() => onToggle(!on)}>
              {on ? 'رجّع الموقع يشتغل' : 'اقفل الموقع للصيانة'}
            </Btn>
          ) : (
            <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
              قفل الموقع محتاج صلاحية settings.danger. إنت شايف الحالة بس.
            </div>
          )}
        </div>

        <div className="mt-5">
          {canEdit ? (
            <TextField
              label="الرسالة اللي الأعضاء بيشوفوها وقت الصيانة"
              multiline
              value={String(maint.message_ar ?? '')}
              hint="قولهم إحنا بنعمل إيه وهنرجع إمتى. كلمتين بلغتنا أحسن من فقرة رسمية."
              onSave={onSaveMessage}
            />
          ) : (
            <ReadOnly label="رسالة الصيانة" value={String(maint.message_ar ?? '—')} />
          )}
        </div>

        <div className="mt-4 font-body text-13" style={{ color: 'var(--muted)' }}>
          آخر تعديل: {when(String(maint.updated_at ?? ''))}
        </div>

        <div className="mt-4">
          <div className="font-display text-16 font-black">مين يفضل داخل وقت الصيانة</div>
          <div className="mt-1 font-body text-13" style={{ color: 'var(--muted)' }}>
            الأدوار دي بتفضل تقدر تفتح الموقع واللوحة والصيانة شغالة. سيب «owner»
            على الأقل، وإلا مش هتعرف تقفل الصيانة تاني.
          </div>
          <div className="mt-2 flex flex-wrap gap-4">
            {ROLE_KEYS.map((role) => {
              const allowed = (maint.allow_roles as string[] | null) ?? []
              return (
                <Toggle
                  key={role}
                  label={role}
                  value={allowed.includes(role)}
                  onChange={(v) => {
                    if (!canEdit) return
                    const next = v
                      ? [...allowed, role]
                      : allowed.filter((r) => r !== role)
                    onSaveRoles(next)
                  }}
                />
              )
            })}
          </div>
        </div>
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------- الكلمات الممنوعة */

function WordsTab({
  words,
  canEdit,
  newWord,
  setNewWord,
  onAdd,
  onRemove,
}: {
  words: BannedRow[]
  canEdit: boolean
  newWord: string
  setNewWord: (v: string) => void
  onAdd: () => void
  onRemove: (w: string) => void
}) {
  return (
    <Section title="الكلمات الممنوعة">
      <Card hint="الكلمات دي بتمنع الحفظ في أي مكان في اللوحة — نصوص الموقع، القوالب، أسماء السبوطات، أي حاجة. دي حاجزنا إن نسبوط ميتكلمش زي تطبيقات التعارف ولا زي منصة تذاكر.">
        {canEdit && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                كلمة جديدة
              </span>
              <input
                value={newWord}
                onChange={(e) => setNewWord(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onAdd()
                }}
                placeholder="مثلًا: تعارف"
                className="min-w-[220px] rounded-14 px-3 py-2 font-body text-16"
                style={{
                  background: 'var(--bg)',
                  color: 'var(--fg)',
                  border: '2px solid var(--line)',
                }}
              />
            </label>
            <Btn kind="primary" onClick={onAdd} disabled={!newWord.trim()}>
              ضيفها
            </Btn>
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              المنع بيشتغل على أي نص فيه الكلمة، مش الكلمة لوحدها.
            </span>
          </div>
        )}

        <div className="mt-4">
          {words.length === 0 ? (
            <Empty>مفيش كلمات ممنوعة. يعني أي حد يقدر يكتب أي حاجة.</Empty>
          ) : (
            <Table head={['الكلمة', 'اتضافت', '']}>
              {words.map((w) => (
                <tr key={w.word}>
                  <td className="p-2 font-body text-16">{w.word}</td>
                  <td className="p-2 font-body text-13" style={{ color: 'var(--muted)' }}>
                    {when(w.added_at)}
                  </td>
                  <td className="p-2 text-end">
                    {canEdit && (
                      <Btn kind="danger" onClick={() => onRemove(w.word)}>
                        شيلها
                      </Btn>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      </Card>
    </Section>
  )
}
