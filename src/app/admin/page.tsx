'use client'

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import type { AdminMe } from '@/lib/admin'
import { Card, Section, Tabs, Loading, Tag, Stat, money } from '@/components/admin-ui'

/**
 * الرئيسية — الأرقام والمهام.
 *
 * الصفحة دي **مش** بتشتغل شغل الأقسام التانية: مفيش تعديل ولا اعتماد ولا
 * مراجعة هنا. كل قسم بقى له صفحته (ADMIN_PLAN.md §3)، والرئيسية بقت حاجتين بس:
 *
 *  1. «محتاج شغل دلوقتي» — كل حاجة مستنية إيد بني آدم، بعددها ولينك القسم.
 *  2. «الأرقام» — نبض الأسبوع/الشهر، وتحت كل رقم سطر بيقول يعني إيه بالظبط.
 *
 * كل الأعداد بتتحسب بـ head + count=exact — يعني القاعدة بترجّع رقم بس،
 * مش صفوف. الاستثناء الوحيد «السبوطات الناقصة» لأنها محتاجة تقارن حجوزات
 * كل سبوطة بالحد الأدنى بتاعها، وده مش عدد واحد.
 *
 * الصلاحيات هنا **إخفاء واجهة بس** — المنع الحقيقي في RLS. وأي استعلام
 * الدور ما بيقراش جدوله بيرجّع null وبيتعرض «—»، الصفحة ما بتقعش وما
 * بتوريش خطأ Postgres في وش حد.
 *
 * ملاحظة: weekly_metrics (المنظر الجاهز اللي كانت الصفحة القديمة بتقرا منه)
 * مش متاح لدور authenticated في القاعدة، فكان بيرجّع فاضي دايمًا.
 * بنحسب الأرقام هنا من الجداول نفسها.
 */

/* ---------------------------------------------------------- أدوات */

const DAY_MS = 86_400_000

/** تاريخ من كام يوم فاتوا، بصيغة القاعدة */
const daysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString()

/** عدد بالعربي، و«—» لو الرقم مش متاح */
const num = (n: number | null) => (n === null ? '—' : n.toLocaleString('ar-EG'))

type CountQuery = PromiseLike<{ count: number | null; error: unknown }>

/**
 * بترجّع العدد، أو null لو القاعدة رفضت.
 * مش بنرمي الخطأ فوق — تايل واحد ما بيقراش نفسه ما يوقّعش الصفحة كلها.
 */
async function askCount(q: CountQuery): Promise<number | null> {
  try {
    const { count, error } = await q
    if (error) return null
    return count ?? 0
  } catch {
    return null
  }
}

/* ---------------------------------------------------------- المهام */

interface TaskCounts {
  transfers: number | null
  transfersLate: number | null
  reports: number | null
  reportsLate: number | null
  thin: number | null
  thinSoon: number | null
  failedMsgs: number | null
  captainApps: number | null
  matching: number | null
}

const EMPTY_TASKS: TaskCounts = {
  transfers: null,
  transfersLate: null,
  reports: null,
  reportsLate: null,
  thin: null,
  thinSoon: null,
  failedMsgs: null,
  captainApps: null,
  matching: null,
}

/**
 * السبوطات الجاية اللي لسه ما وصلتش الحد الأدنى.
 *
 * مفيش عدد جاهز يجاوب ده: لازم نقارن حجوزات كل سبوطة بـ min_to_run بتاعها.
 * فبنجيب المواعيد الجاية (أعمدة قليلة) + عمود sbota_id بس من الحجوزات
 * المدفوعة بتاعتهم، وبنعدّ في المتصفح.
 */
async function loadThin(): Promise<{ total: number | null; soon: number | null }> {
  try {
    const db = supabase()
    const { data, error } = await db
      .from('sbotat')
      .select('id, starts_at, min_to_run')
      .gt('starts_at', new Date().toISOString())
      .in('status', ['open', 'full', 'locked'])
      .order('starts_at', { ascending: true })
      .limit(200)

    if (error || !data) return { total: null, soon: null }

    const rows = data as { id: string; starts_at: string; min_to_run: number | null }[]
    if (rows.length === 0) return { total: 0, soon: 0 }

    const { data: booked, error: bErr } = await db
      .from('bookings')
      .select('sbota_id')
      .in(
        'sbota_id',
        rows.map((r) => r.id)
      )
      .in('status', ['paid', 'attended'])
      .limit(5000)

    if (bErr) return { total: null, soon: null }

    const paid = new Map<string, number>()
    for (const b of (booked ?? []) as { sbota_id: string }[]) {
      paid.set(b.sbota_id, (paid.get(b.sbota_id) ?? 0) + 1)
    }

    const thin = rows.filter((r) => (paid.get(r.id) ?? 0) < (r.min_to_run ?? 0))
    const soon = thin.filter((r) => new Date(r.starts_at).getTime() - Date.now() < 2 * DAY_MS)
    return { total: thin.length, soon: soon.length }
  } catch {
    return { total: null, soon: null }
  }
}

/* ---------------------------------------------------------- الأرقام */

interface Metrics {
  signups: number | null
  paidBookings: number | null
  attended: number | null
  cancels: number | null
  cashIn: number | null
  newReports: number | null
  doneSbotat: number | null
  upcoming: number | null
  sentMsgs: number | null
}

const EMPTY_METRICS: Metrics = {
  signups: null,
  paidBookings: null,
  attended: null,
  cancels: null,
  cashIn: null,
  newReports: null,
  doneSbotat: null,
  upcoming: null,
  sentMsgs: null,
}

/** مجموع التحويلات اللي اتأكدت — بنجيب عمود المبلغ بس وبنجمّع هنا */
async function loadCashIn(since: string): Promise<number | null> {
  try {
    const { data, error } = await supabase()
      .from('payments')
      .select('amount')
      .eq('status', 'succeeded')
      .gte('created_at', since)
      .limit(5000)
    if (error || !data) return null
    return (data as { amount: number | null }[]).reduce((s, r) => s + (r.amount ?? 0), 0)
  } catch {
    return null
  }
}

/* ---------------------------------------------------------- الصفحة */

export default function AdminHomePage() {
  return <AdminShell title="الرئيسية">{(me) => <Dashboard me={me} />}</AdminShell>
}

function Dashboard({ me }: { me: AdminMe }) {
  const can = useCallback((p: string) => me.permissions.has(p), [me])

  const [tasks, setTasks] = useState<TaskCounts>(EMPTY_TASKS)
  const [tasksBusy, setTasksBusy] = useState(true)
  const [win, setWin] = useState<'7' | '30'>('7')
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS)
  const [metricsBusy, setMetricsBusy] = useState(true)

  /* --------------------------------------------- تحميل المهام */

  useEffect(() => {
    let alive = true
    const db = supabase()
    const late = daysAgo(1)

    const skip = Promise.resolve<number | null>(null)

    Promise.all([
      can('payments.review')
        ? askCount(
            db.from('payments').select('id', { count: 'exact', head: true }).eq('status', 'pending_review')
          )
        : skip,
      can('payments.review')
        ? askCount(
            db
              .from('payments')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'pending_review')
              .lt('created_at', late)
          )
        : skip,
      can('reports.view')
        ? askCount(db.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open'))
        : skip,
      can('reports.view')
        ? askCount(
            db
              .from('reports')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'open')
              .lt('created_at', late)
          )
        : skip,
      can('sbotat.view') ? loadThin() : Promise.resolve({ total: null, soon: null }),
      can('notifications.view')
        ? askCount(db.from('notifications').select('id', { count: 'exact', head: true }).eq('status', 'failed'))
        : skip,
      can('captains.edit')
        ? askCount(db.from('captain_applications').select('id', { count: 'exact', head: true }).is('handled_at', null))
        : skip,
      can('matching.view')
        ? askCount(db.from('matching_runs').select('id', { count: 'exact', head: true }).is('approved_at', null))
        : skip,
    ]).then(([transfers, transfersLate, reports, reportsLate, thin, failedMsgs, captainApps, matching]) => {
      if (!alive) return
      setTasks({
        transfers,
        transfersLate,
        reports,
        reportsLate,
        thin: thin.total,
        thinSoon: thin.soon,
        failedMsgs,
        captainApps,
        matching,
      })
      setTasksBusy(false)
    })

    return () => {
      alive = false
    }
  }, [can])

  /* --------------------------------------------- تحميل الأرقام */

  useEffect(() => {
    let alive = true
    setMetricsBusy(true)

    const db = supabase()
    const since = daysAgo(Number(win))
    const skip = Promise.resolve<number | null>(null)

    Promise.all([
      can('people.view')
        ? askCount(
            db
              .from('profiles')
              .select('id', { count: 'exact', head: true })
              .gte('created_at', since)
              .is('deleted_at', null)
          )
        : skip,
      can('bookings.view')
        ? askCount(
            db
              .from('bookings')
              .select('id', { count: 'exact', head: true })
              .in('status', ['paid', 'attended'])
              .gte('created_at', since)
          )
        : skip,
      can('bookings.view')
        ? askCount(
            db
              .from('bookings')
              .select('id', { count: 'exact', head: true })
              .not('checked_in_at', 'is', null)
              .gte('checked_in_at', since)
          )
        : skip,
      can('bookings.view')
        ? askCount(
            db
              .from('bookings')
              .select('id', { count: 'exact', head: true })
              .in('status', ['cancelled_by_user', 'cancelled_by_us'])
              .gte('cancelled_at', since)
          )
        : skip,
      can('payments.view') ? loadCashIn(since) : skip,
      can('reports.view')
        ? askCount(db.from('reports').select('id', { count: 'exact', head: true }).gte('created_at', since))
        : skip,
      can('sbotat.view')
        ? askCount(
            db
              .from('sbotat')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'done')
              .gte('starts_at', since)
          )
        : skip,
      can('sbotat.view')
        ? askCount(
            db
              .from('sbotat')
              .select('id', { count: 'exact', head: true })
              .in('status', ['open', 'full', 'locked'])
              .gt('starts_at', new Date().toISOString())
          )
        : skip,
      can('notifications.view')
        ? askCount(
            db
              .from('notifications')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'sent')
              .gte('created_at', since)
          )
        : skip,
    ]).then(
      ([signups, paidBookings, attended, cancels, cashIn, newReports, doneSbotat, upcoming, sentMsgs]) => {
        if (!alive) return
        setMetrics({
          signups,
          paidBookings,
          attended,
          cancels,
          cashIn,
          newReports,
          doneSbotat,
          upcoming,
          sentMsgs,
        })
        setMetricsBusy(false)
      }
    )

    return () => {
      alive = false
    }
  }, [can, win])

  /* --------------------------------------------- صفوف المهام */

  const rows = useMemo<TaskRow[]>(() => {
    const list: TaskRow[] = []

    if (can('payments.review')) {
      list.push({
        key: 'transfers',
        label: 'تحويلات مستنية مراجعة',
        note: 'ناس حوّلت ورفعت صورة التحويل ومستنية حد يبص عليها ويأكد.',
        count: tasks.transfers,
        late: tasks.transfersLate,
        lateNote: 'بقالهم أكتر من ٢٤ ساعة مستنيين',
        href: '/admin/payments',
        cta: 'راجع التحويلات',
      })
    }

    if (can('reports.view')) {
      list.push({
        key: 'reports',
        label: 'بلاغات مفتوحة',
        note: 'حد اشتكى من حد وشايف إن إحنا هنرد. البلاغ المفتوح يعني حد مستني.',
        count: tasks.reports,
        late: tasks.reportsLate,
        lateNote: 'مفتوحين من أكتر من ٢٤ ساعة',
        href: '/admin/reports',
        cta: 'افتح البلاغات',
      })
    }

    if (can('sbotat.view')) {
      list.push({
        key: 'thin',
        label: 'سبوطات جاية ناقصة',
        note: 'العدد المدفوع لسه تحت الحد الأدنى للتشغيل — يا نروّج ليها يا نلغيها بدري.',
        count: tasks.thin,
        late: tasks.thinSoon,
        lateNote: 'ميعادهم خلال يومين',
        href: '/admin/sbotat',
        cta: 'شوف المواعيد',
      })
    }

    if (can('captains.edit')) {
      list.push({
        key: 'captains',
        label: 'طلبات كباتن مستنية',
        note: 'ناس قدّمت علشان تبقى كباتن ولسه محدش رد عليهم.',
        count: tasks.captainApps,
        href: '/admin/captains',
        cta: 'راجع الطلبات',
      })
    }

    if (can('matching.view')) {
      list.push({
        key: 'matching',
        label: 'مطابقات مستنية اعتماد',
        note: 'المطابقة اتحسبت والمجموعات جاهزة، بس لسه محدش اعتمدها.',
        count: tasks.matching,
        href: '/admin/matching',
        cta: 'شوف المطابقة',
      })
    }

    if (can('notifications.view')) {
      list.push({
        key: 'msgs',
        label: 'رسايل فشلت',
        note: 'رسايل ما وصلتش أصحابها — يعني فيه حد ما عرفش ميعاده أو تأكيده.',
        count: tasks.failedMsgs,
        href: '/admin/notifications',
        cta: 'شوف الطابور',
      })
    }

    // الأهم فوق: المتأخر، بعدين اللي عليه شغل، وآخر حاجة اللي خلصانة.
    return list.sort((a, b) => rank(a) - rank(b))
  }, [can, tasks])

  const pending = rows.reduce((s, r) => s + (r.count ?? 0), 0)
  const anyLate = rows.some((r) => (r.late ?? 0) > 0)
  const allClear = !tasksBusy && rows.length > 0 && pending === 0

  return (
    <>
      {/* ============================================ محتاج شغل دلوقتي */}
      <Section title="محتاج شغل دلوقتي">
        {tasksBusy ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Card hint="دورك ما فيهوش أي طابور شغل — روح على الأقسام اللي تحت.">
            <div className="font-display text-18 font-black">مفيش حاجة على إيدك.</div>
          </Card>
        ) : (
          <>
            <div
              className="rounded-20 px-4 py-3 font-display text-18 font-black"
              style={{
                background: allClear ? 'var(--surface)' : anyLate ? 'var(--err-text)' : '#F4632A',
                color: allClear ? 'var(--ok-text)' : anyLate ? '#FBF7EF' : '#14161A',
                border: allClear ? '2px solid var(--ok-text)' : '2px solid transparent',
              }}
            >
              {allClear
                ? 'كله تمام النهاردة ✓ مفيش حاجة مستنية.'
                : anyLate
                  ? `فيه ${pending.toLocaleString('ar-EG')} حاجة مستنية — وفيها حاجات متأخرة.`
                  : `فيه ${pending.toLocaleString('ar-EG')} حاجة مستنية النهاردة.`}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {rows.map((r) => (
                <TaskCard key={r.key} row={r} />
              ))}
            </div>
          </>
        )}
      </Section>

      {/* ============================================ الأرقام */}
      <Section title="الأرقام">
        <Tabs
          tabs={[
            { id: '7', label: 'آخر ٧ أيام' },
            { id: '30', label: 'آخر ٣٠ يوم' },
          ]}
          value={win}
          onChange={setWin}
        />

        {metricsBusy ? (
          <Loading />
        ) : (
          <div className="mt-4 flex flex-col gap-5">
            <Group title="الناس والحجز">
              {can('people.view') && (
                <Stat
                  label="حسابات جديدة"
                  value={num(metrics.signups)}
                  hint={`عدد اللي عملوا حساب في آخر ${win} يوم — مش شرط يكونوا حجزوا.`}
                />
              )}
              {can('bookings.view') && (
                <>
                  <Stat
                    label="حجوزات مدفوعة"
                    value={num(metrics.paidBookings)}
                    hint="حجوزات اتعملت واتدفعت في الفترة دي — مش شاملة اللي لسه ما دفعش."
                  />
                  <Stat
                    label="حضور فعلي"
                    value={num(metrics.attended)}
                    hint="ناس اتعمللهم تسجيل حضور على الأرض في الفترة دي."
                  />
                  <Stat
                    label="إلغاءات"
                    value={num(metrics.cancels)}
                    hint="حجوزات اتلغت في الفترة دي — سواء العضو لغى أو إحنا لغينا."
                  />
                </>
              )}
            </Group>

            <Group title="الفلوس والتشغيل">
              {can('payments.view') && (
                <Stat
                  label="فلوس دخلت"
                  value={metrics.cashIn === null ? '—' : money(metrics.cashIn)}
                  hint={`مجموع التحويلات اللي اتأكدت في آخر ${win} يوم — قبل أي استرداد.`}
                />
              )}
              {can('sbotat.view') && (
                <>
                  <Stat
                    label="سبوطات خلصت"
                    value={num(metrics.doneSbotat)}
                    hint="مواعيد اتنفذت فعلًا وحالتها بقت «خلصت» في الفترة دي."
                  />
                  <Stat
                    label="سبوطات جاية"
                    value={num(metrics.upcoming)}
                    hint="مواعيد لسه ما جاتش والحجز عليها مفتوح — رقم النهاردة مش رقم الفترة."
                  />
                </>
              )}
              {can('reports.view') && (
                <Stat
                  label="بلاغات جديدة"
                  value={num(metrics.newReports)}
                  hint="كل البلاغات اللي دخلت في الفترة — مقفولة ومفتوحة."
                />
              )}
              {can('notifications.view') && (
                <Stat
                  label="رسايل وصلت"
                  value={num(metrics.sentMsgs)}
                  hint="رسايل واتساب/SMS خرجت بنجاح في الفترة دي."
                />
              )}
            </Group>

            <div className="font-body text-12" style={{ color: 'var(--muted)' }}>
              «—» يعني الرقم ده مش من صلاحية دورك تقراه، مش إنه صفر.
            </div>
          </div>
        )}
      </Section>

      {/* ============================================ الأرقام الأسبوعية */}
      {can('settings.view') && <WeeklyMetrics />}

      {/* ============================================ روابط سريعة */}
      <Section title="روابط سريعة">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {LINKS.filter((l) => !l.perm || can(l.perm)).map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-16 px-3 py-3 no-underline"
              style={{ background: 'var(--surface)', color: 'var(--fg)' }}
            >
              <div className="font-display text-15 font-black">{l.label}</div>
              <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
                {l.note}
              </div>
            </Link>
          ))}
        </div>
      </Section>
    </>
  )
}

/* ------------------------------------------------- الأرقام الأسبوعية */

interface WeekRow {
  week: string
  signups: number
  payers: number
  attended: number
  satisfaction: number | null
  repeat_30d: number
  referrals: number
  girls_pct: number | null
  spend: number
}

/**
 * الأرقام الثمانية أسبوع بأسبوع.
 *
 * مصدرها عرض مادي (weekly_metrics) وصلاحياته لمفتاح الخدمة بس، فبنقراه
 * من دالة بتتأكد من الصلاحية الأول (fn_weekly_metrics). العرض ده بيتحدّث
 * بمهمة مجدولة، يعني الأرقام دي بتاعة آخر تحديث مش دقيقتها.
 */
function WeeklyMetrics() {
  const [rows, setRows] = useState<WeekRow[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    supabase()
      .rpc('fn_weekly_metrics', { p_weeks: 8 })
      .then((res: { data: unknown; error: unknown }) => {
        if (res.error) setFailed(true)
        else setRows((res.data ?? []) as WeekRow[])
      })
  }, [])

  if (failed) return null
  if (!rows) return null

  if (!rows.length) {
    return (
      <Section title="الأرقام أسبوع بأسبوع">
        <div className="font-body text-15" style={{ color: 'var(--muted)' }}>
          لسه مفيش أسابيع محسوبة. الجدول ده بيتحدّث بمهمة مجدولة بعد أول أسبوع شغل.
        </div>
      </Section>
    )
  }

  const pct = (v: number | null) => (v == null ? '—' : `${Math.round(v)}%`)
  const num = (v: number | null) => (v == null ? '—' : String(v))

  return (
    <Section title="الأرقام أسبوع بأسبوع">
      <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
        محسوبة بمهمة مجدولة، فآخر أسبوع ممكن يكون لسه ناقص.
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse font-body text-14">
          <thead>
            <tr>
              {[
                'الأسبوع',
                'حسابات جديدة',
                'دفعوا',
                'راحوا فعلًا',
                'التقييم',
                'رجعوا خلال شهر',
                'دعوات',
                'نسبة البنات',
                'مصاريف تسويق',
              ].map((h) => (
                <th key={h} className="whitespace-nowrap p-2 text-start font-display text-14 font-black">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.week}>
                <td className="whitespace-nowrap p-2 font-display font-black">
                  {new Date(r.week).toLocaleDateString('ar-EG', {
                    timeZone: 'Africa/Cairo',
                    day: 'numeric',
                    month: 'short',
                  })}
                </td>
                <td className="p-2">{num(r.signups)}</td>
                <td className="p-2">{num(r.payers)}</td>
                <td className="p-2">{num(r.attended)}</td>
                <td className="p-2">
                  {r.satisfaction == null ? '—' : Number(r.satisfaction).toFixed(1)}
                </td>
                <td className="p-2">{num(r.repeat_30d)}</td>
                <td className="p-2">{num(r.referrals)}</td>
                <td className="p-2">{pct(r.girls_pct)}</td>
                <td className="p-2">{money(r.spend)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  )
}

/* ---------------------------------------------------------- قطع صغيرة */

interface TaskRow {
  key: string
  label: string
  note: string
  count: number | null
  /** جزء من العدد بقاله كتير أو ميعاده قرّب — ده اللي بيخلي السطر أحمر */
  late?: number | null
  lateNote?: string
  href: string
  cta: string
}

/** الترتيب: المتأخر الأول، بعده اللي فيه شغل، بعده اللي مش متاح، وآخرًا الصفر */
function rank(r: TaskRow): number {
  if ((r.late ?? 0) > 0) return 0
  if ((r.count ?? 0) > 0) return 1
  if (r.count === null) return 2
  return 3
}

function TaskCard({ row }: { row: TaskRow }) {
  const late = (row.late ?? 0) > 0
  const busy = (row.count ?? 0) > 0
  const unknown = row.count === null

  const edge = late ? 'var(--err-text)' : busy ? '#F4632A' : 'var(--line)'

  return (
    <Link
      href={row.href}
      className="flex items-start gap-3 rounded-20 p-4 no-underline"
      style={{
        background: 'var(--surface)',
        color: 'var(--fg)',
        border: `2px solid ${edge}`,
        opacity: unknown || (!busy && !late) ? 0.72 : 1,
      }}
    >
      <div
        className="min-w-[64px] rounded-16 px-2 py-2 text-center font-display text-30 font-black"
        style={{
          background: late ? 'var(--err-text)' : busy ? '#F4632A' : 'var(--bg)',
          color: late ? '#FBF7EF' : busy ? '#14161A' : 'var(--muted)',
        }}
      >
        {num(row.count)}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-18 font-black">{row.label}</span>
          {late && row.lateNote && (
            <Tag color="#D9A441">
              {(row.late ?? 0).toLocaleString('ar-EG')} {row.lateNote}
            </Tag>
          )}
          {!busy && !unknown && <Tag>تمام ✓</Tag>}
        </div>

        <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
          {unknown ? 'الرقم ده مش من صلاحيتك تقراه.' : row.note}
        </div>

        <div className="font-display text-14 font-black" style={{ color: 'var(--accent-text)' }}>
          {row.cta} ←
        </div>
      </div>
    </Link>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="font-display text-16 font-black" style={{ color: 'var(--muted)' }}>
        {title}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">{children}</div>
    </div>
  )
}

/* ---------------------------------------------------------- الروابط */

const LINKS: { href: string; label: string; note: string; perm: string | null }[] = [
  { href: '/admin/sbotat', label: 'السبوطات', note: 'المواعيد والحجز عليها', perm: 'sbotat.view' },
  { href: '/admin/bookings', label: 'الحجوزات', note: 'مين حاجز في إيه', perm: 'bookings.view' },
  { href: '/admin/payments', label: 'الفلوس', note: 'التحويلات والاسترداد', perm: 'payments.view' },
  { href: '/admin/people', label: 'الناس', note: 'الأعضاء وبياناتهم', perm: 'people.view' },
  { href: '/admin/matching', label: 'المطابقة', note: 'تقسيم المجموعات', perm: 'matching.view' },
  { href: '/admin/reports', label: 'البلاغات', note: 'الشكاوى والإجراءات', perm: 'reports.view' },
  { href: '/admin/captains', label: 'الكباتن', note: 'الكباتن والأماكن', perm: 'captains.edit' },
  { href: '/admin/notifications', label: 'الرسايل', note: 'القوالب والطابور', perm: 'notifications.view' },
  { href: '/admin/templates', label: 'القوالب', note: 'كلام السبوطات الثابت', perm: 'sbotat.edit' },
  { href: '/admin/content', label: 'النصوص', note: 'كل كلمة في الموقع', perm: 'content.edit' },
  { href: '/admin/game', label: 'اللعبة', note: 'أسئلة «مين جاي؟»', perm: 'game.edit' },
  { href: '/admin/profile-fields', label: 'حقول التسجيل', note: 'اللي بنسأله وقت التسجيل', perm: 'fields.edit' },
  { href: '/admin/map', label: 'الخريطة', note: 'المناطق والأماكن', perm: 'map.edit' },
  { href: '/admin/settings', label: 'الإعدادات', note: 'الأرقام والقواعد العامة', perm: 'settings.view' },
  { href: '/admin/audit', label: 'السجل', note: 'مين عمل إيه وامتى', perm: 'audit.view' },
]
