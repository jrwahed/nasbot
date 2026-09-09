'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import type { AdminMe } from '@/lib/admin'
import {
  ADMIN_PAGE_SIZE,
  ADMIN_SCAN_MAX,
  Btn,
  Card,
  Empty,
  Loading,
  NumberField,
  Pager,
  SelectField,
  Stat,
  Table,
  Tabs,
  Tag,
  TextField,
  day,
  money,
  useFlash,
  when,
} from '@/components/admin-ui'

/**
 * الفلوس.
 *
 * الدفع عندنا **يدوي بالكامل**: العضو بيحوّل فودافون كاش أو إنستا باي
 * وبيرفع صورة التحويل، وإحنا بنبص عليها بعينينا ونأكد أو نرفض.
 * مفيش بوابة دفع ولا كروت ولا webhook — ومتزوّدش، ده قرار صاحب الموقع.
 *
 * التأكيد والرفض بيمشوا من fn_approve_transfer بس، علشان الدفعة والحجز
 * يتحركوا مع بعض. لو عدّلنا الجدولين بإيدينا هيتفصلوا عن بعض ونتوه.
 *
 * الفلوس كلها متخزنة **قروش** في القاعدة. 300 جنيه = 30000.
 * أي رقم بيتعرض بيعدي على money()، وأي رقم بندخّله بالجنيه بيتضرب في 100.
 *
 * الترقيم من القاعدة: كل تبويب بيجيب صفحة واحدة بـ range مع عدّ دقيق،
 * والفلترة والبحث بيتعملوا على الخادم. postgrest ما بيعرفش يعمل «أو» بين
 * أعمدة من جدولين، علشان كده البحث في «كل المعاملات» فيه اختيار «بندوّر في
 * إيه» (العضو / رقم العملية / السبوطة) — بدل ما نجيب ٣٠٠ صف ونفلترهم عندك.
 */

/* ============================================================ ثوابت */

type TabId = 'pending' | 'all' | 'refunds' | 'wallet' | 'coupons'

const TABS: { id: TabId; label: string }[] = [
  { id: 'pending', label: 'التحويلات المستنية' },
  { id: 'all', label: 'كل المعاملات' },
  { id: 'refunds', label: 'الاسترداد' },
  { id: 'wallet', label: 'المحفظة' },
  { id: 'coupons', label: 'الكوبونات' },
]

const PROVIDER_AR: Record<string, string> = {
  vodafone_cash: 'فودافون كاش',
  instapay: 'إنستا باي',
  wallet: 'رصيد المحفظة',
  paymob: 'بايموب',
  kashier: 'كاشير',
}

const PAY_STATUS_AR: Record<string, string> = {
  initiated: 'لسه ما حوّلش',
  pending_review: 'مستنية مراجعة',
  succeeded: 'تمّت',
  failed: 'مرفوضة',
  refunded: 'اترجّعت',
  partially_refunded: 'اترجّع جزء',
}

const PAY_STATUS_COLOR: Record<string, string | undefined> = {
  pending_review: '#F0C36D',
  succeeded: '#9CC5A1',
  failed: '#E39A8E',
  refunded: '#C9C3F0',
  partially_refunded: '#C9C3F0',
}

const BOOKING_STATUS_AR: Record<string, string> = {
  pending_payment: 'مستني الدفع',
  paid: 'مدفوع',
  waitlist: 'في الانتظار',
  cancelled_by_user: 'ألغاه بنفسه',
  cancelled_by_us: 'إحنا ألغيناه',
  no_show: 'مجاش',
  attended: 'حضر',
  refunded: 'اترد',
}

const REFUND_KIND_AR: Record<string, string> = {
  gateway: 'رجّعنا الفلوس تحويل',
  wallet_credit: 'رصيد في المحفظة',
}

const LEDGER_REASON_AR: Record<string, string> = {
  referral_reward: 'مكافأة إحالة',
  refund_credit: 'رصيد بدل استرداد',
  cancel_credit: 'رصيد إلغاء',
  coupon: 'كوبون',
  spend: 'صرف من الرصيد',
  captain_free_sbota: 'سبوطة مجانية لكابتن',
  admin_adjust: 'تعديل يدوي من الإدارة',
}

/** الأسباب اللي مسموح نضيف بيها رصيد بإيدينا */
const CREDIT_REASONS = [
  'admin_adjust',
  'refund_credit',
  'cancel_credit',
  'referral_reward',
  'coupon',
  'captain_free_sbota',
]

const RECEIPTS_BUCKET = 'receipts'
const SIGNED_SECONDS = 300
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

/** بنستنى ثانية تلت بعد آخر حرف قبل ما نروح للقاعدة */
const SEARCH_DELAY_MS = 300

/** أقصى عدد اقتراحات في خانة اختيار الدفعة للاسترداد */
const PICK_MAX = 8

/** بننضّف اللي المستخدم كتبه من الرموز اللي بتكسر فلتر postgrest */
const safeLike = (s: string) => s.replace(/[,()*%".:\\]/g, ' ').trim()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** الحالات اللي ينفع نسترد منها */
const REFUNDABLE = ['succeeded', 'partially_refunded']

/**
 * بدون مسافات — PostgREST بياخد الـ select كنص واحد.
 *
 * `join` بيحدد فين نحط `!inner`. من غيره الفلتر على جدول مدمج بيفلتر
 * الجزء المدمج بس والدفعة نفسها بتفضل ظاهرة فاضية — وده اللي بيخلي
 * البحث «شغّال» في الشكل وغلط في النتيجة.
 */
const paySelect = (join: 'none' | 'person' | 'sbota' = 'none') =>
  [
    'id,booking_id,provider,provider_ref,amount,fee_amount,status,receipt_path,reviewed_at,created_at',
    `bookings!payments_booking_id_fkey${join === 'none' ? '' : '!inner'}(`,
    'id,profile_id,status,price_paid,discount,wallet_used,',
    `profiles!bookings_profile_id_fkey${join === 'person' ? '!inner' : ''}(first_name,phone),`,
    `sbotat${join === 'sbota' ? '!inner' : ''}(starts_at,sbota_templates${join === 'sbota' ? '!inner' : ''}(name_ar))`,
    ')',
  ].join('')

const PAY_SELECT = paySelect()

/* ============================================================ أنواع */

interface PersonLite {
  first_name: string | null
  phone: string
}

interface BookingLite {
  id: string
  profile_id: string
  status: string
  price_paid: number
  discount: number
  wallet_used: number
  profiles: PersonLite | null
  sbotat: { starts_at: string; sbota_templates: { name_ar: string } | null } | null
}

interface PayRow {
  id: string
  booking_id: string
  provider: string
  provider_ref: string | null
  amount: number
  fee_amount: number
  status: string
  receipt_path: string | null
  reviewed_at: string | null
  created_at: string
  bookings: BookingLite | null
}

interface RefundRow {
  id: string
  payment_id: string
  amount: number
  kind: string
  reason: string | null
  status: string
  created_at: string
  payments: {
    amount: number
    provider: string
    bookings: { profiles: PersonLite | null } | null
  } | null
}

interface LedgerRow {
  id: string
  profile_id: string
  delta: number
  reason: string
  note: string | null
  created_at: string
}

interface ProfileRow {
  id: string
  first_name: string | null
  phone: string
  wallet_balance: number
}

interface CouponRow {
  id: string
  code: string
  kind: string
  value: number
  max_uses: number | null
  used_count: number
  expires_at: string | null
  first_booking_only: boolean
  created_at: string
}

/* ============================================================ مساعدات */

const nameOf = (p: PersonLite | null | undefined) => p?.first_name?.trim() || 'من غير اسم'

const personOf = (p: PayRow) => p.bookings?.profiles ?? null

const outingOf = (p: PayRow) => p.bookings?.sbotat?.sbota_templates?.name_ar ?? 'سبوطة اتشالت'

/** جنيه → قروش، وبنتأكد إنه رقم صحيح مش كسر */
const toPiastres = (pounds: number) => Math.round(pounds * 100)

/** قروش → جنيه علشان يتحط في خانة إدخال */
const toPounds = (piastres: number) => Math.round(piastres / 100)

const localInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null)

const INPUT_CLS = 'w-full rounded-14 px-3 py-2 font-body text-16'
const INPUT_ST = {
  background: 'var(--bg)',
  color: 'var(--fg)',
  border: '2px solid var(--line)',
}

/** خانة إدخال محكومة — الحقول المشتركة بتحفظ عند الخروج، ودي للفورمات */
function Field({
  label,
  value,
  onChange,
  hint,
  type = 'text',
  placeholder,
  multiline,
  width,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  type?: string
  placeholder?: string
  multiline?: boolean
  width?: string
}) {
  return (
    <label className="flex flex-col gap-1" style={{ width: width ?? '100%', maxWidth: '100%' }}>
      <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      {multiline ? (
        <textarea
          rows={2}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT_CLS}
          style={INPUT_ST}
        />
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT_CLS}
          style={INPUT_ST}
        />
      )}
      {hint && (
        <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div
      className="mt-3 rounded-14 px-3 py-2 font-body text-13"
      style={{ background: 'var(--bg)', color: 'var(--muted)' }}
    >
      {children}
    </div>
  )
}

function StatusTag({ status }: { status: string }) {
  return <Tag color={PAY_STATUS_COLOR[status]}>{PAY_STATUS_AR[status] ?? status}</Tag>
}

/* ============================================================ الصفحة */

export default function AdminPaymentsPage() {
  return (
    <AdminShell title="الفلوس" needs="payments.view">
      {(me) => <PaymentsEditor me={me} />}
    </AdminShell>
  )
}

function PaymentsEditor({ me }: { me: AdminMe }) {
  const canReview = me.permissions.has('payments.review')
  const canRefund = me.permissions.has('payments.refund')
  const canCredit = me.permissions.has('wallet.credit')
  const canCoupons = me.permissions.has('coupons.edit')

  const [tab, setTab] = useState<TabId>('pending')
  const { flash, node: flashNode } = useFlash()

  /** flash بيتعمل من أول بكل render — بنثبّته علشان الـ reload ما يلفّش على نفسه */
  const flashRef = useRef(flash)
  flashRef.current = flash
  const say = useCallback((m: string) => flashRef.current(m, 4000), [])

  const [sums, setSums] = useState<{ income: number; waiting: number; refunded: number } | null>(
    null
  )

  const loadSums = useCallback(async () => {
    const db = supabase()
    const since = new Date(Date.now() - WEEK_MS).toISOString()
    // أسبوع واحد بس، والسقف حزام أمان لو الأسبوع طلع ضخم
    const [income, waiting, refunded] = await Promise.all([
      db
        .from('payments')
        .select('amount')
        .eq('status', 'succeeded')
        .gte('created_at', since)
        .range(0, ADMIN_SCAN_MAX - 1),
      db
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending_review'),
      db.from('refunds').select('amount').gte('created_at', since).range(0, ADMIN_SCAN_MAX - 1),
    ])
    setSums({
      income: ((income.data ?? []) as { amount: number }[]).reduce((a, r) => a + r.amount, 0),
      waiting: waiting.count ?? 0,
      refunded: ((refunded.data ?? []) as { amount: number }[]).reduce((a, r) => a + r.amount, 0),
    })
  }, [])

  useEffect(() => {
    loadSums()
  }, [loadSums])

  return (
    <div className="mt-6">
      {/* الشريط اللي فوق */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="دخل آخر ٧ أيام"
          value={sums ? money(sums.income) : '…'}
          hint="التحويلات اللي اتأكدت بس"
        />
        <Stat
          label="تحويلات مستنية مراجعة"
          value={sums ? String(sums.waiting) : '…'}
          hint={sums && sums.waiting > 0 ? 'في ناس مستنيّة ردّك' : 'مفيش حاجة مستنية'}
        />
        <Stat
          label="اللي رجعناه آخر ٧ أيام"
          value={sums ? money(sums.refunded) : '…'}
          hint="فلوس رجعت أو اتحطت رصيد"
        />
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {flashNode}

      <div className="mt-4">
        {tab === 'pending' && (
          <PendingTab canReview={canReview} say={say} afterChange={loadSums} />
        )}
        {tab === 'all' && <AllTab say={say} />}
        {tab === 'refunds' && (
          <RefundsTab canRefund={canRefund} say={say} afterChange={loadSums} />
        )}
        {tab === 'wallet' && <WalletTab canCredit={canCredit} say={say} />}
        {tab === 'coupons' && <CouponsTab canEdit={canCoupons} say={say} />}
      </div>
    </div>
  )
}

/* ============================================ ١ · التحويلات المستنية */

function PendingTab({
  canReview,
  say,
  afterChange,
}: {
  canReview: boolean
  say: (m: string) => void
  afterChange: () => void
}) {
  const [rows, setRows] = useState<PayRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  const sign = useCallback(async (list: PayRow[]) => {
    const db = supabase()
    const map: Record<string, string> = {}
    await Promise.all(
      list.map(async (p) => {
        if (!p.receipt_path) return
        const { data } = await db.storage
          .from(RECEIPTS_BUCKET)
          .createSignedUrl(p.receipt_path, SIGNED_SECONDS)
        if (data?.signedUrl) map[p.id] = data.signedUrl
      })
    )
    setUrls((u) => ({ ...u, ...map }))
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, count, error } = await supabase()
      .from('payments')
      .select(PAY_SELECT, { count: 'exact' })
      .eq('status', 'pending_review')
      .order('created_at', { ascending: false })
      .range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1)
    setLoading(false)
    if (error) {
      say(`مقدرناش نجيب التحويلات: ${error.message}`)
      return
    }
    const list = (data ?? []) as unknown as PayRow[]
    setRows(list)
    setTotal(count ?? null)
    sign(list)
  }, [say, sign, page])

  useEffect(() => {
    reload()
  }, [reload])

  async function resign(p: PayRow) {
    if (!p.receipt_path) return
    const { data, error } = await supabase()
      .storage.from(RECEIPTS_BUCKET)
      .createSignedUrl(p.receipt_path, SIGNED_SECONDS)
    if (error || !data?.signedUrl) {
      say(`مش عارفين نفتح الصورة: ${error?.message ?? 'الملف مش موجود'}`)
      return
    }
    setUrls((u) => ({ ...u, [p.id]: data.signedUrl }))
  }

  /** التأكيد والرفض بيمشوا من الـ RPC بس — هو اللي بيحرّك الحجز مع الدفعة */
  async function review(p: PayRow, ok: boolean) {
    if (!canReview) return
    const who = nameOf(personOf(p))
    const note = (notes[p.id] ?? '').trim()

    if (!ok && note.length < 4) {
      say('اكتب سبب الرفض الأول — العضو هيوصله الكلام ده.')
      return
    }
    const q = ok
      ? `هتأكد تحويل ${money(p.amount)} من ${who}؟ الحجز هيبقى مدفوع على طول.`
      : `هترفض تحويل ${money(p.amount)} من ${who} وتلغي حجزه؟\n\nالسبب: ${note}`
    if (!confirm(q)) return

    setBusy((b) => ({ ...b, [p.id]: true }))
    const { error } = await supabase().rpc('fn_approve_transfer', {
      p_payment_id: p.id,
      p_ok: ok,
      p_note: ok ? note || null : note,
    })
    setBusy((b) => ({ ...b, [p.id]: false }))

    if (error) {
      say(`مقدرناش: ${error.message}`)
      return
    }
    setRows((rs) => rs.filter((r) => r.id !== p.id))
    setTotal((n) => (n === null ? n : Math.max(0, n - 1)))
    say(ok ? `اتأكد ✓ — حجز ${who} بقى مدفوع` : `اترفض — و${who} هيوصله السبب`)
    afterChange()
  }

  if (loading) return <Loading />

  if (!rows.length && page === 0)
    return (
      <Card title="مفيش تحويل مستني" hint="أول ما حد يحوّل ويرفع صورة، هيطلع هنا على طول.">
        <Empty>خلّصت كل حاجة. 👏</Empty>
      </Card>
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-18 font-black">{total ?? rows.length} تحويل مستني</span>
        <Btn onClick={reload}>حدّث</Btn>
        {!canReview && (
          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
            تقدر تتفرّج بس — التأكيد محتاج صلاحية payments.review.
          </span>
        )}
      </div>

      {rows.map((p) => {
        const person = personOf(p)
        const url = urls[p.id]
        return (
          <Card key={p.id}>
            <div className="flex flex-wrap gap-4">
              {/* الإيصال */}
              <div className="min-w-[280px] flex-1">
                {p.receipt_path ? (
                  url ? (
                    <a href={url} target="_blank" rel="noreferrer" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`صورة تحويل ${nameOf(person)}`}
                        onError={() => resign(p)}
                        className="max-h-[460px] w-full rounded-16 object-contain"
                        style={{ background: 'var(--bg)' }}
                      />
                    </a>
                  ) : (
                    <div
                      className="flex h-[200px] items-center justify-center rounded-16 font-body text-14"
                      style={{ background: 'var(--bg)', color: 'var(--muted)' }}
                    >
                      بنفتح الصورة…
                    </div>
                  )
                ) : (
                  <div
                    className="flex h-[200px] items-center justify-center rounded-16 font-body text-15"
                    style={{ background: 'var(--bg)', color: 'var(--err-text)' }}
                  >
                    مرفعش صورة تحويل خالص
                  </div>
                )}

                {p.receipt_path && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Btn onClick={() => resign(p)}>الصورة مش بانة؟ جدّدها</Btn>
                    {url && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-body text-14 underline"
                        style={{ color: 'var(--accent-text)' }}
                      >
                        افتحها بحجمها الكامل ↗
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* التفاصيل والأزرار */}
              <div className="min-w-[300px] flex-1">
                <div className="font-display text-22 font-black">{money(p.amount)}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Tag color="#F0C36D">{PROVIDER_AR[p.provider] ?? p.provider}</Tag>
                  <span className="font-body text-15">{nameOf(person)}</span>
                  <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                    {person?.phone ?? '—'}
                  </span>
                </div>

                <div className="mt-3 font-body text-15">{outingOf(p)}</div>
                <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  ميعاد السبوطة: {when(p.bookings?.sbotat?.starts_at)}
                </div>

                <div className="mt-3 font-body text-14" style={{ color: 'var(--muted)' }}>
                  حوّل من: <span style={{ color: 'var(--fg)' }}>{when(p.created_at)}</span>
                </div>
                {p.provider_ref && (
                  <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
                    رقم العملية: <span style={{ color: 'var(--fg)' }}>{p.provider_ref}</span>
                  </div>
                )}
                {p.bookings && (
                  <div className="mt-1 font-body text-13" style={{ color: 'var(--muted)' }}>
                    سعر الحجز {money(p.bookings.price_paid)}
                    {p.bookings.discount > 0 && ` · خصم ${money(p.bookings.discount)}`}
                    {p.bookings.wallet_used > 0 && ` · من الرصيد ${money(p.bookings.wallet_used)}`}
                    {' · '}
                    {BOOKING_STATUS_AR[p.bookings.status] ?? p.bookings.status}
                  </div>
                )}

                <div className="mt-4">
                  <Field
                    label="سبب الرفض"
                    value={notes[p.id] ?? ''}
                    onChange={(v) => setNotes((n) => ({ ...n, [p.id]: v }))}
                    placeholder="المبلغ ناقص ٥٠ جنيه"
                    hint="لازم تكتبه قبل ما ترفض — العضو بيوصله الكلام ده بالحرف."
                    multiline
                  />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn
                    kind="primary"
                    disabled={!canReview || Boolean(busy[p.id])}
                    onClick={() => review(p, true)}
                  >
                    {busy[p.id] ? 'ثانية واحدة…' : 'أكّد التحويل'}
                  </Btn>
                  <Btn
                    kind="danger"
                    disabled={!canReview || Boolean(busy[p.id])}
                    onClick={() => review(p, false)}
                  >
                    ارفض
                  </Btn>
                </div>
              </div>
            </div>
          </Card>
        )
      })}

      <Pager page={page} shown={rows.length} total={total} onPage={setPage} />
    </div>
  )
}

/* ================================================ ٢ · كل المعاملات */

/** بندوّر في إيه — postgrest ما بيعملش «أو» بين جدولين، فالمدى بيتحدد */
type SearchIn = 'person' | 'ref' | 'sbota'

const SEARCH_IN: { value: SearchIn; label: string }[] = [
  { value: 'person', label: 'اسم العضو أو رقمه' },
  { value: 'ref', label: 'رقم العملية' },
  { value: 'sbota', label: 'اسم السبوطة' },
]

function AllTab({ say }: { say: (m: string) => void }) {
  const [rows, setRows] = useState<PayRow[]>([])
  const [count, setCount] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [searchIn, setSearchIn] = useState<SearchIn>('person')
  /** اللي راح للقاعدة فعلًا — بيتأخر شوية عن اللي بتكتبه */
  const [needle, setNeedle] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0)
      setNeedle(safeLike(q))
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [q])

  const reload = useCallback(async () => {
    setLoading(true)
    const join = needle && searchIn !== 'ref' ? searchIn : 'none'
    let query = supabase().from('payments').select(paySelect(join), { count: 'exact' })

    if (status !== 'all') query = query.eq('status', status)
    if (needle) {
      if (searchIn === 'person') {
        query = query.or(`first_name.ilike.*${needle}*,phone.ilike.*${needle}*`, {
          referencedTable: 'bookings.profiles',
        })
      } else if (searchIn === 'sbota') {
        query = query.ilike('bookings.sbotat.sbota_templates.name_ar', `%${needle}%`)
      } else {
        // رقم العملية عند المزوّد، أو رقم الدفعة عندنا لو مكتوب كامل
        query = query.or(
          UUID_RE.test(needle)
            ? `provider_ref.ilike.*${needle}*,id.eq.${needle}`
            : `provider_ref.ilike.*${needle}*`
        )
      }
    }

    const { data, count: n, error } = await query
      .order('created_at', { ascending: false })
      .range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1)
    setLoading(false)
    if (error) {
      say(`مقدرناش نجيب المعاملات: ${error.message}`)
      setRows([])
      setCount(0)
      return
    }
    setRows((data ?? []) as unknown as PayRow[])
    setCount(n ?? null)
  }, [say, status, needle, searchIn, page])

  useEffect(() => {
    reload()
  }, [reload])

  /** مجموع اللي تمّ في الصفحة اللي قدامك — مش المجموع الكلي */
  const pageTotal = useMemo(
    () => rows.filter((p) => p.status === 'succeeded').reduce((a, p) => a + p.amount, 0),
    [rows]
  )

  /**
   * المجموع الحقيقي على **كل** الصفوف — من القاعدة (fn_payments_totals، هجرة
   * 0071). بعد الترقيم الصفحة بتشوف ٥٠ صف بس، فمجموعها مش دخل النادي. الرقم
   * ده اللي المالك بيقراه، فلازم يكون كامل.
   */
  const [grandTotal, setGrandTotal] = useState<number | null>(null)
  const [grandCount, setGrandCount] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    const load = async () => {
      const { data, error } = await supabase().rpc('fn_payments_totals')
      if (!alive || error || !data) return
      const rowsT = data as { status: string; n: number; total_piastres: number }[]
      const done = rowsT.find((t) => t.status === 'succeeded')
      setGrandTotal(Number(done?.total_piastres ?? 0))
      setGrandCount(Number(done?.n ?? 0))
    }
    load()
    return () => {
      alive = false
    }
  }, [])

  async function openReceipt(p: PayRow) {
    if (!p.receipt_path) return
    const { data, error } = await supabase()
      .storage.from(RECEIPTS_BUCKET)
      .createSignedUrl(p.receipt_path, SIGNED_SECONDS)
    if (error || !data?.signedUrl) {
      say(`مش عارفين نفتح الصورة: ${error?.message ?? 'الملف مش موجود'}`)
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <Card title="كل المعاملات" hint="الفلتر والبحث بيتنفّذوا في القاعدة، والصفوف بتيجي صفحة صفحة.">
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <SelectField
          label="الحالة"
          value={status}
          onChange={(v) => {
            setPage(0)
            setStatus(v)
          }}
          options={[
            { value: 'all', label: 'الكل' },
            ...Object.keys(PAY_STATUS_AR).map((s) => ({ value: s, label: PAY_STATUS_AR[s] })),
          ]}
        />
        <SelectField
          label="بندوّر في إيه"
          value={searchIn}
          onChange={(v) => {
            setPage(0)
            setSearchIn(v as SearchIn)
          }}
          options={SEARCH_IN}
        />
        <div className="min-w-[240px] flex-1">
          <Field
            label="دوّر"
            value={q}
            onChange={setQ}
            placeholder={searchIn === 'person' ? 'مثلًا: منّة' : 'اكتب اللي بتدوّر عليه'}
          />
        </div>
        <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
          {count ?? 0} معاملة في الفلتر ده · مجموع الصفحة {money(pageTotal)}
          {grandTotal !== null && (
            <>
              {' · '}
              <b style={{ color: 'var(--fg)' }}>
                إجمالي اللي تمّ من غير فلتر: {money(grandTotal)} ({grandCount} معاملة)
              </b>
            </>
          )}
        </div>
        <Btn onClick={reload}>حدّث</Btn>
      </div>

      <div className="mt-4">
        {loading ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>مفيش معاملة بالفلتر ده.</Empty>
        ) : (
          <Table
            head={['مين', 'السبوطة', 'المبلغ', 'الطريقة', 'الحالة', 'امتى', 'الإيصال']}
          >
            {rows.map((p) => {
              const person = personOf(p)
              return (
                <tr key={p.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="p-2 align-top">
                    <div>{nameOf(person)}</div>
                    <div className="font-body text-12" style={{ color: 'var(--muted)' }}>
                      {person?.phone ?? '—'}
                    </div>
                  </td>
                  <td className="p-2 align-top">{outingOf(p)}</td>
                  <td className="p-2 align-top">{money(p.amount)}</td>
                  <td className="p-2 align-top">{PROVIDER_AR[p.provider] ?? p.provider}</td>
                  <td className="p-2 align-top">
                    <StatusTag status={p.status} />
                  </td>
                  <td className="p-2 align-top">{when(p.created_at)}</td>
                  <td className="p-2 align-top">
                    {p.receipt_path ? (
                      <button
                        type="button"
                        onClick={() => openReceipt(p)}
                        className="cursor-pointer border-0 bg-transparent p-0 font-body text-14 underline"
                        style={{ color: 'var(--accent-text)' }}
                      >
                        شوف الصورة
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              )
            })}
          </Table>
        )}

        <Pager page={page} shown={rows.length} total={count} onPage={setPage} busy={loading} />
      </div>
    </Card>
  )
}

/* ==================================================== ٣ · الاسترداد */

function RefundsTab({
  canRefund,
  say,
  afterChange,
}: {
  canRefund: boolean
  say: (m: string) => void
  afterChange: () => void
}) {
  const [refunds, setRefunds] = useState<RefundRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [pick, setPick] = useState<PayRow | null>(null)
  const [q, setQ] = useState('')
  const [matches, setMatches] = useState<PayRow[]>([])
  const [seeking, setSeeking] = useState(false)
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState('wallet_credit')
  const [state, setState] = useState('succeeded')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, count, error } = await supabase()
      .from('refunds')
      .select(
        'id,payment_id,amount,kind,reason,status,created_at,payments(amount,provider,bookings!payments_booking_id_fkey(profiles!bookings_profile_id_fkey(first_name,phone)))',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1)
    setLoading(false)
    if (error) {
      say(`مقدرناش نجيب الاستردادات: ${error.message}`)
      setRefunds([])
      setTotal(0)
      return
    }
    setRefunds((data ?? []) as unknown as RefundRow[])
    setTotal(count ?? null)
  }, [say, page])

  useEffect(() => {
    reload()
  }, [reload])

  /**
   * البحث على الدفعة بيروح للقاعدة — استعلامين صغيرين (بالعضو وباسم السبوطة)
   * لأن postgrest ما بيعملش «أو» بين جدولين، وبنلمّهم مع بعض.
   * الأصل كان بيحمّل ٢٠٠ دفعة على الفاضي ويفلترهم عندك.
   */
  useEffect(() => {
    const needle = safeLike(q)
    if (!needle) {
      setMatches([])
      return
    }
    let alive = true
    setSeeking(true)
    const t = setTimeout(async () => {
      const db = supabase()
      const [byPerson, bySbota] = await Promise.all([
        db
          .from('payments')
          .select(paySelect('person'))
          .in('status', REFUNDABLE)
          .or(`first_name.ilike.*${needle}*,phone.ilike.*${needle}*`, {
            referencedTable: 'bookings.profiles',
          })
          .order('created_at', { ascending: false })
          .range(0, PICK_MAX - 1),
        db
          .from('payments')
          .select(paySelect('sbota'))
          .in('status', REFUNDABLE)
          .ilike('bookings.sbotat.sbota_templates.name_ar', `%${needle}%`)
          .order('created_at', { ascending: false })
          .range(0, PICK_MAX - 1),
      ])
      if (!alive) return
      setSeeking(false)
      const seen = new Map<string, PayRow>()
      for (const r of [
        ...((byPerson.data ?? []) as unknown as PayRow[]),
        ...((bySbota.data ?? []) as unknown as PayRow[]),
      ]) {
        seen.set(r.id, r)
      }
      setMatches(Array.from(seen.values()).slice(0, PICK_MAX))
    }, SEARCH_DELAY_MS)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])

  function choose(p: PayRow) {
    setPick(p)
    setAmount(String(toPounds(p.amount)))
    setQ('')
  }

  async function submit() {
    if (!canRefund || !pick) return
    const pounds = Number(amount)
    if (!Number.isFinite(pounds) || pounds <= 0) {
      say('اكتب مبلغ صح بالجنيه.')
      return
    }
    const piastres = toPiastres(pounds)
    if (piastres > pick.amount) {
      say(`المبلغ أكبر من الدفعة نفسها (${money(pick.amount)}).`)
      return
    }
    if (reason.trim().length < 4) {
      say('لازم سبب مكتوب — ده اللي بيفضل في السجل.')
      return
    }
    if (
      !confirm(
        `استرداد ${money(piastres)} لـ ${nameOf(personOf(pick))}\n` +
          `الطريقة: ${REFUND_KIND_AR[kind]}\n` +
          `السبب: ${reason.trim()}\n\nمتأكد؟`
      )
    )
      return

    setBusy(true)
    // بيعدّي من دالة على الخادم — هي اللي بتتأكد إن المبلغ ما يزيدش عن المدفوع
    // وبتسجّل الحركة في السجل. الجدول نفسه مقفول على الكتابة من المتصفح.
    const { error } = await supabase().rpc('fn_issue_refund', {
      p_payment_id: pick.id,
      p_amount: piastres,
      p_kind: kind,
      p_reason: reason.trim(),
    })
    setBusy(false)
    if (error) {
      say(`مقدرناش نسجّل الاسترداد: ${error.message}`)
      return
    }
    setPick(null)
    setAmount('')
    setReason('')
    say(`اتسجّل استرداد ${money(piastres)} ✓`)
    await reload()
    afterChange()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="اعمل استرداد"
        hint="دوّر على الدفعة الأول، وبعدين حدّد المبلغ والسبب. المبلغ بالجنيه."
      >
        {!canRefund && (
          <Note>القسم ده للقراءة عندك — الاسترداد محتاج صلاحية payments.refund.</Note>
        )}

        {!pick ? (
          <div className="mt-3">
            <Field
              label="دوّر على العضو أو السبوطة"
              value={q}
              onChange={setQ}
              placeholder="اسم أو رقم تليفون"
            />
            {q.trim() && (
              <div className="mt-2 flex flex-col gap-2">
                {seeking && (
                  <span className="font-body text-14" style={{ color: 'var(--muted)' }}>
                    ثانية واحدة…
                  </span>
                )}
                {!seeking && matches.length === 0 && (
                  <span className="font-body text-14" style={{ color: 'var(--muted)' }}>
                    مفيش دفعة متأكدة بالاسم ده.
                  </span>
                )}
                {matches.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => choose(p)}
                    className="cursor-pointer rounded-14 px-3 py-2 text-start font-body text-15"
                    style={{ background: 'var(--bg)', color: 'var(--fg)', border: 0 }}
                  >
                    {nameOf(personOf(p))} · {money(p.amount)} · {outingOf(p)} ·{' '}
                    {when(p.created_at)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-18 font-black">
                {nameOf(personOf(pick))} · {money(pick.amount)}
              </span>
              <span className="font-body text-14" style={{ color: 'var(--muted)' }}>
                {outingOf(pick)} · {when(pick.created_at)}
              </span>
              <Btn onClick={() => setPick(null)}>غيّر الدفعة</Btn>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field
                label="المبلغ اللي هيرجع (بالجنيه)"
                value={amount}
                onChange={setAmount}
                type="number"
                hint={`أقصى حاجة ${money(pick.amount)}. اكتب بالجنيه مش بالقرش.`}
              />
              <SelectField
                label="بيرجع إزاي"
                value={kind}
                onChange={setKind}
                options={[
                  { value: 'wallet_credit', label: REFUND_KIND_AR.wallet_credit },
                  { value: 'gateway', label: REFUND_KIND_AR.gateway },
                ]}
              />
              <SelectField
                label="الحالة"
                value={state}
                onChange={setState}
                options={[
                  { value: 'succeeded', label: 'اتعمل فعلًا' },
                  { value: 'initiated', label: 'لسه بننفّذه' },
                ]}
              />
              <Field
                label="السبب"
                value={reason}
                onChange={setReason}
                placeholder="السبوطة اتلغت بسبب الجو"
                hint="إجباري — ده اللي هيفضل في السجل."
                multiline
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Btn kind="primary" disabled={!canRefund || busy} onClick={submit}>
                {busy ? 'ثانية واحدة…' : 'سجّل الاسترداد'}
              </Btn>
              {amount && Number(amount) > 0 && (
                <span className="font-body text-14" style={{ color: 'var(--muted)' }}>
                  هيتسجّل {money(toPiastres(Number(amount)))}
                </span>
              )}
            </div>
          </div>
        )}

        <Note>
          الاسترداد بيعدّي من دالة على الخادم بتتأكد إن المبلغ ما يزيدش عن المدفوع،
          وبتسجّل الحركة في السجل. لو اخترت «رصيد في المحفظة» بيتزوّد للعضو على طول.
          حالة الدفعة والحجز نفسها بتتظبط من قسم الحجوزات.
        </Note>
      </Card>

      <Card title="الاستردادات اللي حصلت">
        {loading ? (
          <Loading />
        ) : refunds.length === 0 ? (
          <Empty>مرجعناش فلوس لحد دلوقتي.</Empty>
        ) : (
          <div className="mt-3">
            <Table head={['مين', 'المبلغ', 'رجع إزاي', 'الحالة', 'السبب', 'امتى']}>
              {refunds.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="p-2 align-top">
                    {nameOf(r.payments?.bookings?.profiles ?? null)}
                  </td>
                  <td className="p-2 align-top">{money(r.amount)}</td>
                  <td className="p-2 align-top">{REFUND_KIND_AR[r.kind] ?? r.kind}</td>
                  <td className="p-2 align-top">
                    <StatusTag status={r.status} />
                  </td>
                  <td className="p-2 align-top">{r.reason ?? '—'}</td>
                  <td className="p-2 align-top">{when(r.created_at)}</td>
                </tr>
              ))}
            </Table>
          </div>
        )}

        <Pager page={page} shown={refunds.length} total={total} onPage={setPage} busy={loading} />
      </Card>
    </div>
  )
}

/* ===================================================== ٤ · المحفظة */

function WalletTab({ canCredit, say }: { canCredit: boolean; say: (m: string) => void }) {
  const [q, setQ] = useState('')
  const [found, setFound] = useState<ProfileRow[]>([])
  const [who, setWho] = useState<ProfileRow | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[]>([])
  const [loading, setLoading] = useState(false)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('refund_credit')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  async function search() {
    const needle = q.trim()
    if (needle.length < 2) {
      say('اكتب حرفين على الأقل.')
      return
    }
    const { data, error } = await supabase()
      .from('profiles')
      .select('id,first_name,phone,wallet_balance')
      .or(`first_name.ilike.%${needle}%,phone.ilike.%${needle}%`)
      .limit(20)
    if (error) {
      say(`مقدرناش ندوّر: ${error.message}`)
      return
    }
    const list = (data ?? []) as ProfileRow[]
    setFound(list)
    if (!list.length) say('مفيش حد بالاسم أو الرقم ده.')
  }

  const openPerson = useCallback(async (p: ProfileRow) => {
    setWho(p)
    setFound([])
    setLoading(true)
    // حركة شخص واحد — محدودة بصفحة، وفيها أحدث الحركات
    const { data } = await supabase()
      .from('wallet_ledger')
      .select('id,profile_id,delta,reason,note,created_at')
      .eq('profile_id', p.id)
      .order('created_at', { ascending: false })
      .range(0, ADMIN_PAGE_SIZE - 1)
    setLedger((data ?? []) as LedgerRow[])
    setLoading(false)
  }, [])

  async function refreshPerson() {
    if (!who) return
    const { data } = await supabase()
      .from('profiles')
      .select('id,first_name,phone,wallet_balance')
      .eq('id', who.id)
      .maybeSingle()
    const fresh = (data ?? null) as ProfileRow | null
    if (fresh) await openPerson(fresh)
  }

  async function credit() {
    if (!canCredit || !who) return
    const pounds = Number(amount)
    if (!Number.isFinite(pounds) || pounds === 0) {
      say('اكتب مبلغ بالجنيه. لو هتخصم، اكتبه بالسالب.')
      return
    }
    if (note.trim().length < 4) {
      say('لازم تكتب سبب واضح — كل رصيد بنزوّده لازم يبقى متعرف جاي منين.')
      return
    }
    const piastres = toPiastres(pounds)
    const after = who.wallet_balance + piastres
    if (after < 0) {
      say(`الرصيد هيبقى بالسالب. عنده دلوقتي ${money(who.wallet_balance)} بس.`)
      return
    }
    if (
      !confirm(
        `${piastres > 0 ? 'هتزوّد' : 'هتخصم'} ${money(Math.abs(piastres))} من رصيد ${nameOf(who)}\n` +
          `الرصيد هيبقى ${money(after)}\n` +
          `السبب: ${note.trim()}\n\nمتأكد؟`
      )
    )
      return

    setBusy(true)
    // دالة على الخادم — بتمنع الرصيد ينزل تحت الصفر وبتسجّل الحركة.
    // wallet_ledger مقفول على الكتابة من المتصفح عن قصد.
    const { error } = await supabase().rpc('fn_wallet_adjust', {
      p_profile_id: who.id,
      p_delta: piastres,
      p_reason: reason,
      p_note: note.trim(),
    })
    setBusy(false)
    if (error) {
      say(`مقدرناش نزوّد الرصيد: ${error.message}`)
      return
    }
    setAmount('')
    setNote('')
    say('الرصيد اتظبط ✓')
    await refreshPerson()
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="دوّر على العضو" hint="بالاسم أو برقم التليفون.">
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[240px] flex-1">
            <Field label="الاسم أو الرقم" value={q} onChange={setQ} placeholder="مثلًا: 0100" />
          </div>
          <Btn kind="primary" onClick={search}>
            دوّر
          </Btn>
        </div>

        {found.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {found.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => openPerson(p)}
                className="cursor-pointer rounded-14 px-3 py-2 text-start font-body text-15"
                style={{ background: 'var(--bg)', color: 'var(--fg)', border: 0 }}
              >
                {nameOf(p)} · {p.phone} · رصيده {money(p.wallet_balance)}
              </button>
            ))}
          </div>
        )}
      </Card>

      {who && (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <div className="font-display text-22 font-black">{nameOf(who)}</div>
                <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  {who.phone}
                </div>
              </div>
              <div className="ms-auto">
                <Stat label="الرصيد دلوقتي" value={money(who.wallet_balance)} />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field
                label="المبلغ (بالجنيه)"
                value={amount}
                onChange={setAmount}
                type="number"
                hint="بالجنيه مش بالقرش. بالسالب لو هتخصم."
              />
              <SelectField
                label="نوع الحركة"
                value={reason}
                onChange={setReason}
                options={CREDIT_REASONS.map((r) => ({ value: r, label: LEDGER_REASON_AR[r] }))}
              />
              <div className="sm:col-span-2">
                <Field
                  label="السبب"
                  value={note}
                  onChange={setNote}
                  placeholder="تعويض عن سبوطة اتلغت يوم ٣/٩"
                  hint="إجباري — لازم أي حد يفتح السجل بعد سنة يفهم الرصيد ده جه ليه."
                  multiline
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Btn kind="primary" disabled={!canCredit || busy} onClick={credit}>
                {busy ? 'ثانية واحدة…' : 'ظبّط الرصيد'}
              </Btn>
              {amount && Number(amount) !== 0 && Number.isFinite(Number(amount)) && (
                <span className="font-body text-14" style={{ color: 'var(--muted)' }}>
                  {Number(amount) > 0 ? 'هيتزوّد' : 'هيتخصم'}{' '}
                  {money(Math.abs(toPiastres(Number(amount))))}
                </span>
              )}
              {!canCredit && (
                <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  محتاج صلاحية wallet.credit.
                </span>
              )}
            </div>

            <Note>
              التعديل بيعدّي من دالة على الخادم بتمنع الرصيد ينزل تحت الصفر وبتسجّل
              الحركة في السجل. محتاج صلاحية wallet.credit.
            </Note>
          </Card>

          <Card title="حركة الرصيد">
            {loading ? (
              <Loading />
            ) : ledger.length === 0 ? (
              <Empty>مفيش حركة على الرصيد ده.</Empty>
            ) : (
              <div className="mt-3">
                <Table head={['الحركة', 'النوع', 'الملاحظة', 'امتى']}>
                  {ledger.map((l) => (
                    <tr key={l.id} style={{ borderTop: '1px solid var(--line)' }}>
                      <td className="p-2 align-top">
                        <span
                          className="font-display font-black"
                          style={{ color: l.delta >= 0 ? 'var(--fg)' : 'var(--err-text)' }}
                        >
                          {l.delta >= 0 ? '+' : '−'} {money(Math.abs(l.delta))}
                        </span>
                      </td>
                      <td className="p-2 align-top">{LEDGER_REASON_AR[l.reason] ?? l.reason}</td>
                      <td className="p-2 align-top">{l.note ?? '—'}</td>
                      <td className="p-2 align-top">{when(l.created_at)}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

/* =================================================== ٥ · الكوبونات */

function CouponsTab({ canEdit, say }: { canEdit: boolean; say: (m: string) => void }) {
  const [rows, setRows] = useState<CouponRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [kind, setKind] = useState('percent')
  const [value, setValue] = useState('')
  const [maxUses, setMaxUses] = useState('')
  const [expires, setExpires] = useState('')
  const [firstOnly, setFirstOnly] = useState(false)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    const { data, count, error } = await supabase()
      .from('coupons')
      .select('id,code,kind,value,max_uses,used_count,expires_at,first_booking_only,created_at', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1)
    setLoading(false)
    if (error) {
      say(`مقدرناش نجيب الكوبونات: ${error.message}`)
      return
    }
    setRows((data ?? []) as CouponRow[])
    setTotal(count ?? null)
  }, [say, page])

  useEffect(() => {
    reload()
  }, [reload])

  function liveNow(c: CouponRow) {
    if (c.expires_at && new Date(c.expires_at) <= new Date()) return false
    if (c.max_uses !== null && c.used_count >= c.max_uses) return false
    return true
  }

  async function patch(c: CouponRow, p: Record<string, unknown>) {
    if (!canEdit) return
    const { error } = await supabase().from('coupons').update(p).eq('id', c.id)
    if (error) {
      say(`مقدرناش نحفظ: ${error.message}`)
      return
    }
    await reload()
    say('اتحفظ ✓')
  }

  async function add() {
    if (!canEdit) return
    const clean = code.trim().toUpperCase()
    if (clean.length < 4) {
      say('الكود لازم يبقى ٤ حروف على الأقل.')
      return
    }
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) {
      say(kind === 'percent' ? 'اكتب نسبة الخصم.' : 'اكتب الخصم بالجنيه.')
      return
    }
    if (kind === 'percent' && n > 100) {
      say('النسبة مش هتعدّي ١٠٠٪.')
      return
    }
    const stored = kind === 'percent' ? Math.round(n) : toPiastres(n)
    const uses = maxUses.trim() === '' ? null : Math.round(Number(maxUses))
    if (uses !== null && (!Number.isFinite(uses) || uses < 1)) {
      say('عدد مرات الاستخدام لازم يبقى رقم صح، أو سيبه فاضي لو من غير حد.')
      return
    }
    if (
      !confirm(
        `كوبون ${clean}\n` +
          `الخصم: ${kind === 'percent' ? `${stored}٪` : money(stored)}\n` +
          `عدد المرات: ${uses === null ? 'من غير حد' : uses}\n` +
          `ينتهي: ${expires ? day(fromLocalInput(expires)) : 'مفيش تاريخ'}\n\nنعمله؟`
      )
    )
      return

    setBusy(true)
    const { error } = await supabase().from('coupons').insert({
      code: clean,
      kind,
      value: stored,
      max_uses: uses,
      expires_at: fromLocalInput(expires),
      first_booking_only: firstOnly,
    })
    setBusy(false)
    if (error) {
      say(`مقدرناش نعمل الكوبون: ${error.message}`)
      return
    }
    setCode('')
    setValue('')
    setMaxUses('')
    setExpires('')
    setFirstOnly(false)
    await reload()
    say(`كوبون ${clean} جاهز ✓`)
  }

  async function stop(c: CouponRow) {
    if (!canEdit) return
    if (!confirm(`هنقفل كوبون ${c.code} من دلوقتي. تمام؟`)) return
    await patch(c, { expires_at: new Date().toISOString() })
  }

  async function remove(c: CouponRow) {
    if (!canEdit) return
    if (!confirm(`هنمسح كوبون ${c.code} خالص — اتستخدم ${c.used_count} مرة. متأكد؟`)) return
    const { error } = await supabase().from('coupons').delete().eq('id', c.id)
    if (error) {
      say(`مقدرناش نمسح: ${error.message}`)
      return
    }
    await reload()
    say('اتمسح ✓')
  }

  return (
    <div className="flex flex-col gap-4">
      <Card title="اعمل كوبون جديد" hint="الكود بيتكتب كابيتال أوتوماتيك.">
        {!canEdit && <Note>عندك قراءة بس — التعديل محتاج صلاحية coupons.edit.</Note>}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Field label="الكود" value={code} onChange={setCode} placeholder="NASBOT50" />
          <SelectField
            label="نوع الخصم"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'percent', label: 'نسبة ٪' },
              { value: 'fixed', label: 'مبلغ ثابت' },
            ]}
          />
          <Field
            label={kind === 'percent' ? 'الخصم (٪)' : 'الخصم (بالجنيه)'}
            value={value}
            onChange={setValue}
            type="number"
            hint={
              kind === 'percent'
                ? 'رقم من ١ لـ ١٠٠'
                : `بالجنيه. ${value && Number(value) > 0 ? `يعني ${money(toPiastres(Number(value)))}` : ''}`
            }
          />
          <Field
            label="أقصى عدد مرات"
            value={maxUses}
            onChange={setMaxUses}
            type="number"
            hint="سيبه فاضي لو من غير حد."
          />
          <Field
            label="ينتهي إمتى"
            value={expires}
            onChange={setExpires}
            type="datetime-local"
            hint="سيبه فاضي لو مش هينتهي."
          />
          <label className="flex items-end gap-2 pb-2">
            <input
              type="checkbox"
              checked={firstOnly}
              onChange={(e) => setFirstOnly(e.target.checked)}
            />
            <span className="font-body text-15">لأول حجز بس</span>
          </label>
        </div>
        <div className="mt-3">
          <Btn kind="primary" disabled={!canEdit || busy} onClick={add}>
            {busy ? 'ثانية واحدة…' : 'اعمل الكوبون'}
          </Btn>
        </div>
      </Card>

      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Card>
          <Empty>مفيش كوبونات لسه.</Empty>
        </Card>
      ) : (
        rows.map((c) => {
          const live = liveNow(c)
          return (
            <Card key={c.id} dim={!live}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-20 font-black">{c.code}</span>
                <Tag color={live ? '#9CC5A1' : undefined}>{live ? 'شغّال' : 'واقف'}</Tag>
                <span className="font-body text-14" style={{ color: 'var(--muted)' }}>
                  اتستخدم {c.used_count}
                  {c.max_uses !== null ? ` من ${c.max_uses}` : ' مرة'}
                </span>
                <span className="ms-auto font-body text-12" style={{ color: 'var(--muted)' }}>
                  اتعمل {day(c.created_at)}
                </span>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <TextField
                  key={`code-${c.id}-${c.code}`}
                  label="الكود"
                  value={c.code}
                  onSave={(v) => patch(c, { code: v.trim().toUpperCase() })}
                />
                <SelectField
                  label="نوع الخصم"
                  value={c.kind}
                  onChange={(v) => {
                    if (v === c.kind) return
                    if (
                      !confirm(
                        'تغيير النوع بيغيّر معنى الرقم اللي جوه. هتحتاج تكتب قيمة الخصم تاني. تمام؟'
                      )
                    )
                      return
                    patch(c, { kind: v, value: v === 'percent' ? 10 : 5000 })
                  }}
                  options={[
                    { value: 'percent', label: 'نسبة ٪' },
                    { value: 'fixed', label: 'مبلغ ثابت' },
                  ]}
                />
                <NumberField
                  key={`val-${c.id}-${c.kind}-${c.value}`}
                  label={c.kind === 'percent' ? 'الخصم (٪)' : 'الخصم (بالجنيه)'}
                  value={c.kind === 'percent' ? c.value : toPounds(c.value)}
                  min={1}
                  max={c.kind === 'percent' ? 100 : undefined}
                  suffix={c.kind === 'percent' ? '٪' : 'جنيه'}
                  hint={c.kind === 'percent' ? undefined : `دلوقتي ${money(c.value)}`}
                  onSave={(v) => {
                    if (v <= 0) return say('الخصم لازم يبقى أكبر من صفر.')
                    if (c.kind === 'percent' && v > 100) return say('النسبة مش هتعدّي ١٠٠٪.')
                    patch(c, { value: c.kind === 'percent' ? Math.round(v) : toPiastres(v) })
                  }}
                />
                <NumberField
                  key={`uses-${c.id}-${c.max_uses}`}
                  label="أقصى عدد مرات"
                  value={c.max_uses ?? 0}
                  min={0}
                  suffix="مرة"
                  hint="صفر يعني من غير حد."
                  onSave={(v) => patch(c, { max_uses: v <= 0 ? null : Math.round(v) })}
                />
                <label className="flex flex-col gap-1">
                  <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                    ينتهي إمتى
                  </span>
                  <input
                    type="datetime-local"
                    defaultValue={localInput(c.expires_at)}
                    className={INPUT_CLS}
                    style={INPUT_ST}
                    onBlur={(e) => {
                      const next = fromLocalInput(e.target.value)
                      if (next === c.expires_at) return
                      patch(c, { expires_at: next })
                    }}
                  />
                  <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
                    {c.expires_at ? day(c.expires_at) : 'مفيش تاريخ نهاية'}
                  </span>
                </label>
                <label className="flex items-end gap-2 pb-2">
                  <input
                    type="checkbox"
                    checked={c.first_booking_only}
                    onChange={(e) => patch(c, { first_booking_only: e.target.checked })}
                  />
                  <span className="font-body text-15">لأول حجز بس</span>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {live && (
                  <Btn disabled={!canEdit} onClick={() => stop(c)}>
                    وقّفه دلوقتي
                  </Btn>
                )}
                <Btn kind="danger" disabled={!canEdit} onClick={() => remove(c)}>
                  امسحه
                </Btn>
              </div>
            </Card>
          )
        })
      )}

      <Pager page={page} shown={rows.length} total={total} onPage={setPage} busy={loading} />

      <Note>
        مفيش عمود is_active في جدول coupons، فـ«شغّال / واقف» محسوبة من تاريخ الانتهاء وعدد
        المرات. «وقّفه دلوقتي» بيحط تاريخ النهاية على دلوقتي.
      </Note>
    </div>
  )
}
