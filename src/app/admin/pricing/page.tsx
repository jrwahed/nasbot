'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import { rejected } from '@/lib/admin'
import { Card, Section, Btn, Table, Loading, Tag, useFlash } from '@/components/admin-ui'

/**
 * التسعير — الفلسفة والقواعد وحاسبة السيناريوهات.
 *
 * ليه في اللوحة مش ملف HTML جنبك: الحاسبة بتبدأ من **أرقامك الحقيقية** —
 * متوسط رسم السبوطة من القوالب، سبوطات آخر ٤ أسابيع، متوسط النفوس من
 * الحجوزات المدفوعة، وعمولة البوابة من الإعدادات. الأرقام المفترضة بتوريك
 * شكل الموديل؛ أرقامك بتوريك موقفك انت.
 *
 * الافتراضات بتتحفظ في settings.pricing_assumptions (هجرة 0074) — تخطيط بس،
 * الموقع ما بيشتغلش بيها.
 */

/* ------------------------------------------------------------- الأرقام */

interface Assumptions {
  /** رسم السبوطة للنفر — بالقروش */
  feePiastres: number
  avgHeads: number
  sbotatPerWeek: number
  /** نسبة السبوطات المدفوعة 0..100 */
  paidSharePct: number
  /** متوسط الهامش للنفر في المدفوع — بالقروش */
  marginPiastres: number
  gatewayPct: number
  /** أجر الكابتن للسبوطة — بالقروش */
  captainPiastres: number
  /** ثابت شهري — بالقروش */
  fixedMonthlyPiastres: number
}

const WEEKS_PER_MONTH = 4.3

const PRESETS: { key: string; label: string; hint: string; patch: Partial<Assumptions> }[] = [
  {
    key: 'safe',
    label: 'محافظ',
    hint: 'بداية هادية — سبوطتين في الأسبوع',
    patch: { sbotatPerWeek: 2, avgHeads: 6, paidSharePct: 40, marginPiastres: 3000 },
  },
  {
    key: 'real',
    label: 'واقعي',
    hint: 'بعد ما تمشي شوية',
    patch: { sbotatPerWeek: 6, avgHeads: 7, paidSharePct: 50, marginPiastres: 4000 },
  },
  {
    key: 'big',
    label: 'طموح',
    hint: 'لو الطلب مشي فعلًا',
    patch: { sbotatPerWeek: 15, avgHeads: 7, paidSharePct: 55, marginPiastres: 4500 },
  },
]

const DEFAULTS: Assumptions = {
  feePiastres: 4000,
  avgHeads: 7,
  sbotatPerWeek: 6,
  paidSharePct: 50,
  marginPiastres: 4000,
  gatewayPct: 2.75,
  captainPiastres: 0,
  fixedMonthlyPiastres: 800000,
}

/* ------------------------------------------------------------- الحساب */

interface Result {
  headsPerMonth: number
  feeIncome: number
  marginIncome: number
  income: number
  gatewayCost: number
  captainCost: number
  fixedCost: number
  costs: number
  net: number
  marginPct: number
  breakEvenSbotat: number
}

/** كل المبالغ بالقروش جوّه، والعرض بيحوّلها جنيه */
function compute(a: Assumptions): Result {
  const sbotatPerMonth = a.sbotatPerWeek * WEEKS_PER_MONTH
  const headsPerMonth = sbotatPerMonth * a.avgHeads

  const feeIncome = headsPerMonth * a.feePiastres
  const marginIncome = headsPerMonth * (a.paidSharePct / 100) * a.marginPiastres
  const income = feeIncome + marginIncome

  const gatewayCost = income * (a.gatewayPct / 100)
  const captainCost = sbotatPerMonth * a.captainPiastres
  const fixedCost = a.fixedMonthlyPiastres
  const costs = gatewayCost + captainCost + fixedCost

  const net = income - costs

  // ربح السبوطة الواحدة بعد المتغيّر — منه بنعرف كام سبوطة تغطّي الثابت
  const perSbotaIncome = a.avgHeads * (a.feePiastres + (a.paidSharePct / 100) * a.marginPiastres)
  const perSbotaNet = perSbotaIncome * (1 - a.gatewayPct / 100) - a.captainPiastres

  return {
    headsPerMonth,
    feeIncome,
    marginIncome,
    income,
    gatewayCost,
    captainCost,
    fixedCost,
    costs,
    net,
    marginPct: income > 0 ? (net / income) * 100 : 0,
    breakEvenSbotat: perSbotaNet > 0 ? Math.ceil(fixedCost / perSbotaNet) : Infinity,
  }
}

/* ------------------------------------------------------------- عرض */

const ar = (n: number) => Math.round(n).toLocaleString('ar-EG')
const pounds = (piastres: number) => ar(piastres / 100)

function Num({
  label,
  value,
  onChange,
  suffix,
  step = 1,
  min = 0,
  max,
  hint,
}: {
  label: string
  value: number
  onChange: (v: number) => void
  suffix?: string
  step?: number
  min?: number
  max?: number
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-[130px] rounded-14 px-3 py-2 font-body text-16"
          style={{
            background: 'var(--surface)',
            color: 'var(--fg)',
            border: '2px solid var(--line)',
          }}
        />
        {suffix && (
          <span className="font-body text-14" style={{ color: 'var(--muted)' }}>
            {suffix}
          </span>
        )}
      </span>
      {hint && (
        <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}

function Stat({
  label,
  value,
  sub,
  big,
  tone,
}: {
  label: string
  value: string
  sub?: string
  big?: boolean
  tone?: 'good' | 'bad'
}) {
  const color = tone === 'good' ? '#1E7A44' : tone === 'bad' ? '#8E2F1F' : 'var(--fg)'
  return (
    <div className="rounded-16 p-4" style={{ background: 'var(--bg)', border: '2px solid var(--line)' }}>
      <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div
        className="mt-1 font-display font-black"
        style={{ fontSize: big ? 30 : 22, lineHeight: 1.1, color }}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- الصفحة */

export default function AdminPricingPage() {
  return (
    <AdminShell title="التسعير" needs="settings.view">
      {() => <Pricing />}
    </AdminShell>
  )
}

interface RealNumbers {
  feePiastres: number | null
  gatewayPct: number | null
  sbotatPerWeek: number | null
  avgHeads: number | null
  paidSharePct: number | null
}

function Pricing() {
  const [a, setA] = useState<Assumptions>(DEFAULTS)
  const [real, setReal] = useState<RealNumbers | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const { flash, node: flashNode } = useFlash()

  const set = <K extends keyof Assumptions>(k: K, v: Assumptions[K]) =>
    setA((cur) => ({ ...cur, [k]: v }))

  const load = useCallback(async () => {
    const db = supabase()
    const since = new Date(Date.now() - 28 * 86400_000).toISOString()

    const [cfg, tpls, sbCount, bkCount] = await Promise.all([
      db.from('settings').select('gateway_fee_pct, pricing_assumptions').maybeSingle(),
      db.from('sbota_templates').select('org_fee, default_price'),
      db.from('sbotat').select('id', { count: 'exact', head: true }).gte('starts_at', since),
      db
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .in('status', ['paid', 'attended'])
        .gte('created_at', since),
    ])

    const s = cfg.data as { gateway_fee_pct?: number; pricing_assumptions?: Partial<Assumptions> } | null
    const rows = (tpls.data ?? []) as { org_fee: number; default_price: number }[]

    const avgFee = rows.length
      ? Math.round(rows.reduce((t, r) => t + (r.org_fee ?? 0), 0) / rows.length)
      : null
    const paidShare = rows.length
      ? Math.round((rows.filter((r) => (r.default_price ?? 0) > 0).length / rows.length) * 100)
      : null
    const sbotat = sbCount.count ?? 0
    const heads = bkCount.count ?? 0

    const r: RealNumbers = {
      feePiastres: avgFee,
      gatewayPct: s?.gateway_fee_pct ?? null,
      sbotatPerWeek: sbotat > 0 ? Math.round((sbotat / 4) * 10) / 10 : null,
      avgHeads: sbotat > 0 && heads > 0 ? Math.round((heads / sbotat) * 10) / 10 : null,
      paidSharePct: paidShare,
    }
    setReal(r)

    // المحفوظ الأول، وبعده الحقيقي، وبعده الافتراضي
    const saved = s?.pricing_assumptions ?? {}
    setA({
      ...DEFAULTS,
      ...(r.feePiastres != null ? { feePiastres: r.feePiastres } : {}),
      ...(r.gatewayPct != null ? { gatewayPct: Number(r.gatewayPct) } : {}),
      ...(saved as Partial<Assumptions>),
    })
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const res = useMemo(() => compute(a), [a])

  async function save() {
    setSaving(true)
    const { data, error } = await supabase()
      .from('settings')
      .update({ pricing_assumptions: a })
      .eq('id', true)
      .select('id')
    setSaving(false)
    if (error) {
      flash(`مااتحفظش: ${error.message}`)
      return
    }
    if (rejected(data)) {
      flash('مااتحفظش — القاعدة رفضت، محتاج صلاحية settings.edit')
      return
    }
    flash('اتحفظ ✓')
  }

  function useReal() {
    if (!real) return
    setA((cur) => ({
      ...cur,
      ...(real.feePiastres != null ? { feePiastres: real.feePiastres } : {}),
      ...(real.gatewayPct != null ? { gatewayPct: Number(real.gatewayPct) } : {}),
      ...(real.sbotatPerWeek != null ? { sbotatPerWeek: real.sbotatPerWeek } : {}),
      ...(real.avgHeads != null ? { avgHeads: real.avgHeads } : {}),
      ...(real.paidSharePct != null ? { paidSharePct: real.paidSharePct } : {}),
    }))
    flash('الحاسبة بقت على أرقامك الحقيقية')
  }

  if (loading) return <Loading />

  const hasReal = real && real.sbotatPerWeek != null

  return (
    <>
      {flashNode}

      <Card
        title="إنت بتبيع إيه بالظبط"
        hint="نص التجارب في نسبوط مجانية أو رمزية — قعدة كافيه، غدا مع بعض، غروب في حديقة. يعني إنت مش بتبيع النشاط."
      >
        <div className="mt-3 font-body text-15 leading-[1.9]">
          اللي بتبيعه فعلًا، وموجود في كل سبوطة سواء غالية أو مجانية، حاجة واحدة:{' '}
          <b>إنك تحطّ المسبوط في جروب ناس جداد متوافقين، تظبّطله الميعاد والمكان، وتضمنله إن القعدة تطلع حلوة.</b>{' '}
          ده «رسم السبوطة» — وهو <code>org_fee</code> في القاعدة، وبيتظبط لكل قالب من صفحة القوالب.
        </div>
        <div
          className="mt-3 rounded-16 p-3 font-body text-14"
          style={{ background: 'var(--bg)', border: '2px solid var(--line)' }}
        >
          <b>القاعدة العملية:</b> الدخول والنشاط الأساسي شاملين في سعر واحد بيتدفع لنسبوط وفيه هامشك.
          الأكل والشرب الزيادة على المسبوط في المكان. الاستثناء الوحيد: لو الأكل هو التجربة نفسها
          (فطار على النيل، عشا معسكر) — ساعتها بيبقى شامل.
        </div>
      </Card>

      <Section title="الفلوس بتيجي منين">
        <div className="grid gap-3 md:grid-cols-3">
          <Card title="١ · رسم السبوطة" hint="في كل سبوطة">
            <div className="mt-2 font-body text-14 leading-[1.8]">
              مبلغ ثابت على كل نفر، أجرك على المطابقة والتنظيم والضمان. ثابت حتى لو التجربة مجانية.
            </div>
          </Card>
          <Card title="٢ · هامش سعر الجملة" hint="في التجارب المدفوعة بس">
            <div className="mt-2 font-body text-14 leading-[1.8]">
              لما تحجز جروب، المكان بيديك سعر أرخص من الفرد. تبيع بسعر قريب من الفرد وتقبض الفرق.
            </div>
          </Card>
          <Card title="٣ · دخل الأماكن" hint="مرحلة تانية · B2B">
            <div className="mt-2 font-body text-14 leading-[1.8]">
              لما تبقى بتجيب جروبات ثابتة كل أسبوع، الأماكن نفسها تدّيك عمولة أو سعر أحسن.
            </div>
          </Card>
        </div>
      </Section>

      <Section title="مش كل سبوطة زي التانية">
        <Card>
          <Table head={['نوع السبوطة', 'أمثلة', 'المسبوط بيدفع لنسبوط', 'مين يدفع الأكل']}>
            <tr style={{ borderTop: '1px solid var(--line)' }}>
              <td className="p-2 font-semibold">مجانية / رمزية</td>
              <td className="p-2">قعدة كافيه · غدا مع بعض · غروب · جري</td>
              <td className="p-2">رسم السبوطة بس</td>
              <td className="p-2">كل واحد على نفسه في المكان</td>
            </tr>
            <tr style={{ borderTop: '1px solid var(--line)' }}>
              <td className="p-2 font-semibold">مدفوعة بسعر ثابت</td>
              <td className="p-2">جو كارت · تسلق · كاياك · بينت بول</td>
              <td className="p-2">رسم + هامش الجملة</td>
              <td className="p-2">الزيادة على المسبوط</td>
            </tr>
            <tr style={{ borderTop: '1px solid var(--line)' }}>
              <td className="p-2 font-semibold">الأكل جزء منها</td>
              <td className="p-2">فطار على النيل · عشا معسكر وادي دجلة</td>
              <td className="p-2">رسم + هامش شامل الأكل</td>
              <td className="p-2">شامل في السعر</td>
            </tr>
          </Table>
        </Card>
      </Section>

      <Section title="حاسبة السيناريوهات">
        <Card
          title="افتراضاتك"
          hint="دي لعبة عدد مش لعبة هامش — نجاحك في تكرار السبوطات، مش في ربح ضخم من الواحدة."
        >
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {PRESETS.map((p) => (
              <Btn key={p.key} onClick={() => setA((cur) => ({ ...cur, ...p.patch }))}>
                {p.label}
              </Btn>
            ))}
            <Btn kind="primary" onClick={useReal} disabled={!hasReal}>
              {hasReal ? 'املأ من أرقامي الحقيقية' : 'لسه مفيش سبوطات كفاية'}
            </Btn>
            <Btn onClick={save} disabled={saving}>
              {saving ? 'بنحفظ…' : 'احفظ الافتراضات'}
            </Btn>
          </div>

          {real && (
            <div className="mt-3 flex flex-wrap gap-2">
              <Tag>
                آخر ٤ أسابيع:{' '}
                <b>{real.sbotatPerWeek != null ? `${real.sbotatPerWeek} سبوطة/أسبوع` : 'مفيش سبوطات'}</b>
              </Tag>
              {real.avgHeads != null && (
                <Tag>
                  متوسط النفوس الحقيقي: <b>{real.avgHeads}</b>
                </Tag>
              )}
              {real.feePiastres != null && (
                <Tag>
                  متوسط رسم القوالب: <b>{pounds(real.feePiastres)} ج</b>
                </Tag>
              )}
              {real.paidSharePct != null && (
                <Tag>
                  نسبة القوالب المدفوعة: <b>{real.paidSharePct}٪</b>
                </Tag>
              )}
            </div>
          )}

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Num
              label="رسم السبوطة للنفر"
              suffix="جنيه"
              value={Math.round(a.feePiastres / 100)}
              onChange={(v) => set('feePiastres', Math.max(0, v) * 100)}
              hint="ده org_fee — بيتظبط لكل قالب من صفحة القوالب"
            />
            <Num
              label="متوسط النفوس في السبوطة"
              suffix="نفر"
              value={a.avgHeads}
              min={1}
              max={8}
              onChange={(v) => set('avgHeads', Math.min(8, Math.max(1, v)))}
              hint="السقف ٨ — ده وعد نسبوط نفسه"
            />
            <Num
              label="سبوطات في الأسبوع"
              suffix="سبوطة"
              value={a.sbotatPerWeek}
              step={0.5}
              onChange={(v) => set('sbotatPerWeek', Math.max(0, v))}
            />
            <Num
              label="نسبة السبوطات المدفوعة"
              suffix="٪"
              value={a.paidSharePct}
              max={100}
              onChange={(v) => set('paidSharePct', Math.min(100, Math.max(0, v)))}
            />
            <Num
              label="متوسط الهامش للنفر (المدفوع)"
              suffix="جنيه"
              value={Math.round(a.marginPiastres / 100)}
              onChange={(v) => set('marginPiastres', Math.max(0, v) * 100)}
              hint="الفرق بين سعر الجملة وسعر الفرد"
            />
            <Num
              label="عمولة بوابة الدفع"
              suffix="٪"
              value={a.gatewayPct}
              step={0.05}
              max={100}
              onChange={(v) => set('gatewayPct', Math.min(100, Math.max(0, v)))}
              hint="من الإعدادات — دلوقتي التحويل يدوي فالعمولة الفعلية صفر"
            />
            <Num
              label="أجر الكابتن للسبوطة"
              suffix="جنيه"
              value={Math.round(a.captainPiastres / 100)}
              onChange={(v) => set('captainPiastres', Math.max(0, v) * 100)}
            />
            <Num
              label="تكاليف ثابتة شهرية"
              suffix="جنيه"
              value={Math.round(a.fixedMonthlyPiastres / 100)}
              step={100}
              onChange={(v) => set('fixedMonthlyPiastres', Math.max(0, v) * 100)}
              hint="تسويق + أدوات + الموقع والدومين"
            />
          </div>
        </Card>

        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Stat label="الدخل الشهري" value={`${pounds(res.income)} ج`} sub="قبل التكاليف" big />
          <Stat label="التكاليف الشهرية" value={`${pounds(res.costs)} ج`} sub="عمولة + كباتن + ثابت" big />
          <Stat
            label="صافي الربح الشهري"
            value={`${pounds(res.net)} ج`}
            sub="بعد التكاليف"
            big
            tone={res.net >= 0 ? 'good' : 'bad'}
          />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <Stat label="صافي سنوي" value={`${pounds(res.net * 12)} ج`} />
          <Stat label="هامش الربح" value={`${Math.round(res.marginPct)}٪`} />
          <Stat
            label="نقطة التعادل"
            value={Number.isFinite(res.breakEvenSbotat) ? `${ar(res.breakEvenSbotat)}` : '—'}
            sub="سبوطة في الشهر تغطّي الثابت"
            tone={
              Number.isFinite(res.breakEvenSbotat) &&
              res.breakEvenSbotat <= a.sbotatPerWeek * WEEKS_PER_MONTH
                ? 'good'
                : 'bad'
            }
          />
          <Stat label="نفر-سبوطة / شهر" value={ar(res.headsPerMonth)} />
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <Stat label="دخل الرسم" value={`${pounds(res.feeIncome)} ج`} sub="ثابت مهما كانت التجربة" />
          <Stat label="دخل الهامش" value={`${pounds(res.marginIncome)} ج`} sub="من المدفوع بس" />
        </div>

        <Card>
          <div className="font-body text-13 leading-[1.9]" style={{ color: 'var(--muted)' }}>
            <b>المعادلات:</b> نفر-سبوطة في الشهر = سبوطات الأسبوع × ٤٫٣ × متوسط النفوس ·{' '}
            دخل الرسم = نفر-سبوطة × رسم السبوطة · دخل الهامش = نفر-سبوطة × نسبة المدفوع × الهامش ·{' '}
            التكاليف = عمولة الدفع + (أجر الكابتن × السبوطات) + الثابت · الصافي = الدخل − التكاليف.
            <br />
            <b>نقطة التعادل</b> = الثابت الشهري ÷ صافي السبوطة الواحدة بعد المتغيّر. تحت الرقم ده إنت بتخسر.
          </div>
        </Card>
      </Section>

      <Section title="قواعد تسعير ماتكسرهاش">
        <Card>
          <ul className="mt-1 flex list-disc flex-col gap-2 ps-5 font-body text-15 leading-[1.8]">
            <li>سعر الجملة مخفي عن كل مسبوط — يشوف سعر واحد شامل بس.</li>
            <li>الرسم زيّه زيّه في السبوطة المجانية والمدفوعة — هو أجرك على التنظيم مش على النشاط.</li>
            <li>ماتلمسش فلوس الأكل في القعدات المجانية — وجع كاش فلو ومسؤولية مقابل صفر ربح.</li>
            <li>الضمان مكتوب فوق زرّ الدفع دايمًا — ده اللي بيبرّر الرسم.</li>
            <li>مفيش سعر مخصوص يكسر السعر المعلن عشان تقفل حجز أسرع.</li>
            <li>جودة المطابقة هي المنتج — لو الجروبات طلعت وحشة، محدش هيدفع رسم يقعد في كافيه.</li>
          </ul>
        </Card>
      </Section>

      <Card dim>
        <div className="font-body text-13 leading-[1.8]" style={{ color: 'var(--muted)' }}>
          الأرقام دي توضيحية عشان تفهم شكل الموديل — مش وعد ولا هدف. اضغط «املأ من أرقامي الحقيقية»
          بعد أول ٥–١٠ سبوطات فعلية وهتشوف موقفك انت. الافتراضات بتتحفظ في الإعدادات، والموقع
          ما بيشتغلش بيها — دي شاشة تخطيط بس.
        </div>
      </Card>
    </>
  )
}
