'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import { rejected, loadBannedWords, bannedIn } from '@/lib/admin'
import {
  Card,
  Btn,
  Tabs,
  TextField,
  NumberField,
  Empty,
  Loading,
  Tag,
  useFlash,
  when,
  cairoToIso,
  todayCairo,
} from '@/components/admin-ui'
import { Inp } from '@/app/admin/_components/sbota-form'
import { yallaLink } from '@/lib/yalla-link'

/**
 * «يلا» — النداء اللي الناس بتقرر ميعاده ومنطقته.
 *
 * قرار المالك (٢٠٢٦-١١-١٥). الصفحة دي بتعمل تلات حاجات:
 *   ١) تنزّل النداء (فورم سريع للموبايل).
 *   ٢) توريك الأعداد لكل (ميعاد × منطقة) — **الاتجاه، مش أسامي**.
 *   ٣) بعد القفل: المجموعة وقايمة الانتظار و«بدّل» بينهم، والأماكن اللي
 *      الناس كتبتها، وخانة المكان بالظبط، وزرار «اكشف».
 *
 * ⚠ **كل كتابة وراها `rejected()`** (§٧) — المصفوفة الفاضية معناها إن
 *   القاعدة رفضت، مش نجاح. والنداء نفسه بيتعمل بـ`fn_yalla_create` علشان
 *   هو ومواعيده ومناطقه يتكتبوا مع بعض أو مايتكتبوش.
 *
 * ⚠ **مفيش هنا «اختار الكسبان بإيدك».** الكسبان بيتحدد من الأعداد في
 *   القاعدة (العدد يكمل · أو المهلة تخلص والأعلى يكسب) — لو اللوحة قدرت
 *   تختار، النداء يبقى استطلاع شكلي والناس تحس إن اختيارها مش بيفرق.
 *   اللي اللوحة بتقدر عليه: **«اقفل دلوقتي»** (نفس المنطق بالظبط بس
 *   دلوقتي)، و«بدّل» بين المجموعة والانتظار للتوازن.
 *
 * ⚠ **اسم المكان اللي العضو كتبه بيوصل من `fn_yalla_admin` بس** — مفيش
 *   سياسة قراية على الجدول، ومفيش دالة عامة بترجّعه.
 */

interface Call {
  id: string
  template_id: string
  line_ar: string
  group_size: number
  min_group: number
  cost_note_ar: string | null
  deadline: string
  status: 'open' | 'locked' | 'closed'
  /** `post` = بوست الويك اند (دوسة واحدة + كلام) · `choice` = النداء القديم */
  kind: 'post' | 'choice'
  won_slot_id: string | null
  won_area: string | null
  lock_reason: string | null
  created_at: string
}

interface Slot {
  id: string
  call_id: string
  starts_at: string
  duration_min: number
  sort: number
}

interface CallArea {
  call_id: string
  area_key: string
  sort: number
}

interface Tpl {
  id: string
  slug: string
  name_ar: string
}

interface AreaRow {
  key: string
  label_ar: string
  sort: number
}

interface Person {
  profile_id: string
  first_name: string | null
  gender: 'male' | 'female' | null
  state: 'in' | 'wait' | 'other'
  booking_id: string | null
  waitlist_id: string | null
  area_label: string | null
  slot_count: number
  venue_note: string | null
  chose_at: string
}

interface Sb {
  id: string
  venue_name_ar: string | null
  address_ar: string | null
  reveal_at: string | null
  status: string
  capacity: number
}

const TABS = [
  { id: 'live' as const, label: 'الشغّالة' },
  { id: 'new' as const, label: '+ نداء جديد' },
  { id: 'past' as const, label: 'اللي خلص' },
]
type TabId = (typeof TABS)[number]['id']

export default function AdminYallaPage() {
  return (
    <AdminShell title="يلا" needs="sbotat.view">
      {(me) => (
        <Body
          canEdit={me.permissions.has('sbotat.edit')}
          canBook={me.permissions.has('bookings.edit')}
          canReveal={me.permissions.has('matching.approve')}
        />
      )}
    </AdminShell>
  )
}

function Body({
  canEdit,
  canBook,
  canReveal,
}: {
  canEdit: boolean
  canBook: boolean
  canReveal: boolean
}) {
  const [tab, setTab] = useState<TabId>('live')
  const [calls, setCalls] = useState<Call[] | null>(null)
  const [slots, setSlots] = useState<Slot[]>([])
  const [areas, setAreas] = useState<CallArea[]>([])
  const [tpls, setTpls] = useState<Tpl[]>([])
  const [areaList, setAreaList] = useState<AreaRow[]>([])
  const [sbotat, setSbotat] = useState<Record<string, Sb>>({})
  const { flash, node: flashNode } = useFlash()

  const load = useCallback(async () => {
    const db = supabase()
    const [c, s, a, t, m, sb] = await Promise.all([
      db.from('yalla_calls').select('*').order('created_at', { ascending: false }).limit(60),
      db.from('yalla_slots').select('*').order('sort'),
      db.from('yalla_call_areas').select('*').order('sort'),
      // ⚠ **مفيش عمود `is_active` في `sbota_templates`** — كان مكتوب هنا
      //   `.eq('is_active', true)` وPostgREST بيرفض الاستعلام كله، فقايمة
      //   القوالب كانت بترجع **فاضية** ومفيش طريقة تنزّل نداء أصلًا.
      //   الدرس الخمستاشر: الاستعلام بيتبني وقت التشغيل، فلا `tsc` ولا
      //   البناء بيشوفوه. الفلتر الصح هنا هو **قوالب الشغل بره** — نداء
      //   «يلا» خروجة عادية، مش يوم شغل.
      db.from('sbota_templates').select('id, slug, name_ar').eq('is_work', false).order('name_ar'),
      db.from('map_areas').select('key, label_ar, sort').eq('is_active', true).order('sort'),
      db.from('sbotat').select('id, yalla_id, venue_name_ar, address_ar, reveal_at, status, capacity').not('yalla_id', 'is', null),
    ])
    setCalls((c.data ?? []) as Call[])
    setSlots((s.data ?? []) as Slot[])
    setAreas((a.data ?? []) as CallArea[])
    setTpls((t.data ?? []) as Tpl[])
    setAreaList((m.data ?? []) as AreaRow[])
    const map: Record<string, Sb> = {}
    for (const row of (sb.data ?? []) as (Sb & { yalla_id: string })[]) map[row.yalla_id] = row
    setSbotat(map)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (calls === null) return <Loading />

  const live = calls.filter((c) => c.status !== 'closed')
  const past = calls.filter((c) => c.status === 'closed')
  const shown = tab === 'live' ? live : tab === 'past' ? past : []

  return (
    <>
      <Tabs tabs={TABS} value={tab} onChange={setTab} extra={<Btn onClick={load}>حدّث</Btn>} />
      {flashNode}

      {tab === 'new' ? (
        <NewCall
          canEdit={canEdit}
          say={flash}
          onDone={() => {
            setTab('live')
            load()
          }}
        />
      ) : shown.length === 0 ? (
        <div className="mt-6">
          <Empty>
            {tab === 'live'
              ? 'مفيش نداء شغّال. اعمل واحد من «+ نداء جديد».'
              : 'مفيش نداء خلص لسه.'}
          </Empty>
        </div>
      ) : (
        <div className="mt-6 flex flex-col gap-5">
          {shown.map((c) => (
            <CallCard
              key={c.id}
              call={c}
              slots={slots.filter((s) => s.call_id === c.id)}
              areas={areas.filter((a) => a.call_id === c.id)}
              areaList={areaList}
              tpl={tpls.find((t) => t.id === c.template_id)}
              sb={sbotat[c.id]}
              canEdit={canEdit}
              canBook={canBook}
              canReveal={canReveal}
              say={flash}
              reload={load}
            />
          ))}
        </div>
      )}

      {!canEdit && (
        <Card>
          <p className="font-body text-14">
            إنت شايف بس. تنزيل نداء وقفله محتاج صلاحية <strong>sbotat.edit</strong>.
          </p>
        </Card>
      )}
    </>
  )
}

/* ============================================================ نداء جديد */

/**
 * «+ نداء جديد» — **خانة واحدة** (قرار المالك ٢٠٢٦-١١-١٥).
 *
 * كان بيطلب ٧ حاجات: القالب · السطر · العدد · الحد الأدنى · المهلة ·
 * المواعيد · المناطق. والمالك قال: «أنا بنزّل بوست أو اقتراح، **والناس
 * اللي تحدد معايا** — ده اللي هو يلا».
 *
 * فكله اتشال، و`fn_yalla_post` (`0146`) بتحسبه:
 *   · القالب   → القالب العام `nedaa-yalla`، واسم الخروجة بعد القفل
 *                بيتاخد من **سطر البوست** نفسه.
 *   · المواعيد → أيام `settings.yalla_days_ahead` الجاية × تلات فترات.
 *   · المناطق  → كل كتل الخريطة النشطة.
 *   · الأرقام  → `settings` (العدد · الحد الأدنى · المهلة).
 *
 * ⚠ **الكلمات الممنوعة بتتفحص هنا كمان** — مش علشان الأمان (القاعدة
 *   بترفض برضه في `fn_guard_sbota_text`) لكن علشان المالك يشوف الرسالة
 *   قبل ما يدوس، بدل ما القاعدة ترميله استثناء.
 */
function NewCall({
  canEdit,
  say,
  onDone,
}: {
  canEdit: boolean
  say: (m: string) => void
  onDone: () => void
}) {
  const [line, setLine] = useState('')
  const [busy, setBusy] = useState(false)
  const [words, setWords] = useState<string[]>([])

  useEffect(() => {
    loadBannedWords().then(setWords)
  }, [])

  const save = async () => {
    if (!canEdit) return
    if (!line.trim()) return say('اكتب البوست')
    const bad = bannedIn(line, words)
    if (bad.length) return say(`في كلمات ممنوعة: ${bad.join('، ')}`)

    setBusy(true)
    const { data, error } = await supabase().rpc('fn_yalla_post', {
      p_line: line.trim(),
    })
    setBusy(false)
    if (error || !data) return say(error?.message ?? 'القاعدة رفضت')
    setLine('')
    say('النداء نزل ✓ — الناس تقدر تحدد دلوقتي')
    onDone()
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <Card
        title="نداء جديد"
        hint="اكتب البوست وبس. المواعيد والمناطق بتتعرض للناس لوحدها، وهم اللي يحددوا."
      >
        <textarea
          value={line}
          onChange={(e) => setLine(e.target.value)}
          rows={3}
          placeholder="يلا نعمل حاجة الأسبوع ده… إمتى وفين؟"
          className="w-full rounded-12 border p-3 text-16 leading-[1.6]"
          style={{ borderColor: 'var(--line)', background: 'var(--bg)', color: 'var(--fg)' }}
        />
        <div className="mt-2 text-13" style={{ color: 'var(--muted)' }}>
          الأرقام (عدد المجموعة · الحد الأدنى · مهلة القفل · كام يوم بيتعرضوا)
          بتتظبط من «الإعدادات» ← «يلا».
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={busy || !canEdit || !line.trim()}
            className="min-h-[44px] cursor-pointer rounded-12 px-5 text-15 font-bold"
            style={{ background: '#F4632A', color: '#FBF7EF', border: 0, opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'بينزل…' : 'نزّل النداء'}
          </button>
        </div>
      </Card>
    </div>
  )
}

/* ============================================================ نداء شغّال */

function CallCard({
  call,
  slots,
  areas,
  areaList,
  tpl,
  sb,
  canEdit,
  canBook,
  canReveal,
  say,
  reload,
}: {
  call: Call
  slots: Slot[]
  areas: CallArea[]
  areaList: AreaRow[]
  tpl?: Tpl
  sb?: Sb
  canEdit: boolean
  canBook: boolean
  canReveal: boolean
  say: (m: string) => void
  reload: () => void
}) {
  const [counts, setCounts] = useState<
    { slot_id: string; starts_at: string; area_key: string; area_label: string; n: number }[]
  >([])
  const [people, setPeople] = useState<Person[]>([])
  const [busy, setBusy] = useState(false)
  const [venue, setVenue] = useState(sb?.venue_name_ar ?? '')
  const [addr, setAddr] = useState(sb?.address_ar ?? '')
  /** البوست: انت بتكتب الميعاد والمكان الحقيقيين وقت القفل */
  const [lockDay, setLockDay] = useState('')
  const [lockTime, setLockTime] = useState('20:00')
  const [lockArea, setLockArea] = useState('')
  /** كلام الأعضاء — ده اللي بتقرا منه إمتى فاضيين وفين */
  const [talk, setTalk] = useState<
    {
      id: string
      parent_id: string | null
      first_name: string
      as_nasbot: boolean
      body_ar: string
      created_at: string
    }[]
  >([])
  /** الرد باسم نسبوط: على مين، وبإيه */
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState('')
  /** التصويت */
  const [poll, setPoll] = useState<
    { option_id: string; starts_at: string; area_label: string; note_ar: string | null; votes: number }[]
  >([])
  const [optDay, setOptDay] = useState('')
  const [optTime, setOptTime] = useState('20:00')
  const [optArea, setOptArea] = useState('')
  const [optNote, setOptNote] = useState('')

  const label = (k: string) => areaList.find((a) => a.key === k)?.label_ar ?? k
  const slotAt = (id: string | null) => slots.find((s) => s.id === id)?.starts_at ?? null
  const overdue = call.status === 'open' && new Date(call.deadline).getTime() <= Date.now()

  const loadDetail = useCallback(async () => {
    const db = supabase()
    const [c, p, k, pl] = await Promise.all([
      // ⚠ `fn_yalla_counts` مش `fn_yalla_top`: التانية **مقفولة على الكل**
      //   (داخلية)، ودي غلاف عليها بصلاحية `sbotat.view`.
      db.rpc('fn_yalla_counts', { p_call: call.id }),
      db.rpc('fn_yalla_admin', { p_call: call.id }),
      // ⚠ نفس دالة الأعضاء — **الاسم الأول وبس**، مفيش `profile_id`.
      //   اللوحة مش بتشوف أكتر من اللي العضو شايفه هنا، وده كفاية: ده
      //   المكان اللي المالك بيقرا منه «أنا فاضي الجمعة بالليل».
      db.rpc('fn_yalla_comments', { p_call: call.id }),
      db.rpc('fn_yalla_poll', { p_call: call.id }),
    ])
    setTalk(
      (k.data ?? []) as {
        id: string
        parent_id: string | null
        first_name: string
        as_nasbot: boolean
        body_ar: string
        created_at: string
      }[]
    )
    setPoll(
      (pl.data ?? []) as {
        option_id: string
        starts_at: string
        area_label: string
        note_ar: string | null
        votes: number
      }[]
    )
    setCounts(
      (c.data ?? []) as {
        slot_id: string
        starts_at: string
        area_key: string
        area_label: string
        n: number
      }[]
    )
    setPeople((p.data ?? []) as Person[])
  }, [call.id])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  useEffect(() => {
    setVenue(sb?.venue_name_ar ?? '')
    setAddr(sb?.address_ar ?? '')
  }, [sb?.venue_name_ar, sb?.address_ar])

  const lockNow = async () => {
    setBusy(true)
    const { data, error } = await supabase().rpc('fn_yalla_lock_now', { p_call: call.id })
    setBusy(false)
    if (error) return say(error.message)
    const d = (data ?? {}) as { locked?: boolean; seated?: number; wait?: number }
    say(
      d.locked
        ? `اتقفل ✓ — قعدوا ${d.seated ?? 0} واستنوا ${d.wait ?? 0}`
        : 'اتقفل من غير مجموعة — كل اللي شاركوا وصلهم الخبر ومعاهم أولوية'
    )
    reload()
    loadDetail()
  }

  /**
   * اقفل البوست على ميعاد ومكان **انت كاتبهم**.
   *
   * ⚠ مش `fn_yalla_lock_now`: دي بتقفل على «أكتر ميعاد»، وفي البوست مفيش
   *   غير ميعاد واحد مخفي (الجمعة الجاية) — يعني كانت هتقفل على تخمين.
   *   `fn_yalla_lock_post` بتعدّل الميعاد والمنطقة المخفيين الأول وبعدين
   *   بتنادي **نفس** `fn_yalla_lock` (الدرس الستاشر — مفيش نسخة تانية من
   *   القعدة والتوازن والانتظار).
   */
  /**
   * رد باسم نسبوط على كلام عضو.
   *
   * ⚠ الحارس في القاعدة (`fn_yalla_say` بترفض `p_as_nasbot` من غير
   *   `sbotat.edit`) — ده مجرد الزرار. ولو حد شال الزرار من المتصفح
   *   القاعدة لسه بترفض.
   */
  const sayAsNasbot = async (parent: string) => {
    const text = replyBody.trim()
    if (!text) return
    setBusy(true)
    const { error } = await supabase().rpc('fn_yalla_say', {
      p_call: call.id,
      p_body: text,
      p_parent: parent,
      p_photo: null,
      p_as_nasbot: true,
    })
    setBusy(false)
    if (error) return say(error.message)
    setReplyBody('')
    setReplyTo(null)
    say('الرد اتنشر باسم نسبوط ✓')
    loadDetail()
  }

  /** امسح أي كلام (بصلاحية `sbotat.edit` — الحارس في القاعدة) */
  const delSaid = async (id: string) => {
    setBusy(true)
    const { error } = await supabase().rpc('fn_yalla_unsay', { p_id: id })
    setBusy(false)
    if (error) return say(error.message)
    loadDetail()
  }

  /** ضيف اختيار للتصويت — من اللي اتقال في النقاش */
  const addOption = async () => {
    if (!optDay) return say('اكتب اليوم')
    if (!optArea) return say('اختار المنطقة')
    setBusy(true)
    const { error } = await supabase().rpc('fn_yalla_poll_add', {
      p_call: call.id,
      p_when: cairoToIso(optDay, optTime),
      p_area: optArea,
      p_note: optNote.trim() || null,
    })
    setBusy(false)
    if (error) return say(error.message)
    setOptNote('')
    say('الاختيار اتضاف ✓')
    loadDetail()
  }

  const removeOption = async (id: string) => {
    setBusy(true)
    const { error } = await supabase().rpc('fn_yalla_poll_remove', { p_option: id })
    setBusy(false)
    if (error) return say(error.message)
    loadDetail()
  }

  /**
   * اقفل على اللي كسب التصويت.
   *
   * ⚠ بتنادي `fn_yalla_lock_winner` اللي بتنادي `fn_yalla_lock_post` —
   *   **مش منسوخة** (الدرس الستاشر). فالقعدة ونص ولاد ونص بنات وقايمة
   *   الانتظار والإشعارات كلهم زي ما هم بالحرف.
   */
  const lockWinner = async () => {
    setBusy(true)
    const { data, error } = await supabase().rpc('fn_yalla_lock_winner', { p_call: call.id })
    setBusy(false)
    if (error) return say(error.message)
    const d = (data ?? {}) as { locked?: boolean; seated?: number; wait?: number; votes?: number }
    say(
      d.locked
        ? `اتقفل على الكسبان (${d.votes ?? 0} صوت) — قعدوا ${d.seated ?? 0} واستنوا ${d.wait ?? 0}`
        : 'اتقفل من غير مجموعة — كل اللي شاركوا وصلهم الخبر ومعاهم أولوية'
    )
    reload()
    loadDetail()
  }

  const lockPost = async () => {
    if (!lockDay) return say('اكتب اليوم')
    if (!lockArea) return say('اختار المنطقة')
    setBusy(true)
    const { data, error } = await supabase().rpc('fn_yalla_lock_post', {
      p_call: call.id,
      p_when: cairoToIso(lockDay, lockTime),
      p_area: lockArea,
    })
    setBusy(false)
    if (error) return say(error.message)
    const d = (data ?? {}) as { locked?: boolean; seated?: number; wait?: number }
    say(
      d.locked
        ? `اتقفل ✓ — قعدوا ${d.seated ?? 0} واستنوا ${d.wait ?? 0}`
        : 'اتقفل من غير مجموعة — كل اللي شاركوا وصلهم الخبر ومعاهم أولوية'
    )
    reload()
    loadDetail()
  }

  const saveVenue = async () => {
    if (!sb) return
    const { data } = await supabase()
      .from('sbotat')
      .update({ venue_name_ar: venue.trim() || null, address_ar: addr.trim() || null })
      .eq('id', sb.id)
      .select('id')
    if (rejected(data)) return say('القاعدة رفضت الحفظ')
    say('المكان اتحفظ ✓')
    reload()
  }

  const doReveal = async () => {
    setBusy(true)
    const { data, error } = await supabase().rpc('fn_yalla_reveal', { p_call: call.id })
    setBusy(false)
    if (error) return say(error.message)
    const d = (data ?? {}) as { ok?: boolean; why?: string }
    if (d.ok === false) return say(d.why ?? 'مش اتكشفت')
    say('اتكشفت ✓ — المجموعة شايفة المكان وأسامي بعضها')
    reload()
    loadDetail()
  }

  const bench = async (bookingId: string) => {
    const { error } = await supabase().rpc('fn_yalla_bench', { p_booking: bookingId })
    if (error) return say(error.message)
    say('اتنقل لأول قايمة الانتظار')
    loadDetail()
    reload()
  }

  const admit = async (waitlistId: string) => {
    const { error } = await supabase().rpc('fn_admit_waitlist', { p_waitlist_id: waitlistId })
    if (error) return say(error.message)
    say('اتدخّل المجموعة ✓')
    loadDetail()
    reload()
  }

  const inGroup = people.filter((p) => p.state === 'in')
  const waiting = people.filter((p) => p.state === 'wait')
  const others = people.filter((p) => p.state === 'other')
  const boys = inGroup.filter((p) => p.gender === 'male').length
  const girls = inGroup.filter((p) => p.gender === 'female').length
  const notes = people.filter((p) => p.venue_note)

  return (
    <Card>
      {/* ===== الترويسة ===== */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="font-display text-20 font-black">{call.line_ar}</div>
          <div className="mt-1 font-body text-13" style={{ color: 'var(--muted)' }}>
            {tpl?.name_ar ?? '—'} · نزل {when(call.created_at)} · المجموعة {call.group_size} ·
            الحد الأدنى {call.min_group}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {call.status === 'open' && <Tag color="#2B4CFF">مفتوح</Tag>}
          {call.status === 'locked' && <Tag color="#3E5C43">كمل</Tag>}
          {call.status === 'closed' && <Tag>مكمّلش</Tag>}
          {overdue && <Tag color="#F4632A">المهلة عدّت</Tag>}
          {sb?.reveal_at && <Tag color="#3E5C43">اتكشفت</Tag>}
        </div>
      </div>

      {tpl && (
        <div className="mt-2 font-body text-12" style={{ color: 'var(--muted)' }}>
          اللينك: <code>/yalla/{yallaLink(tpl.slug, call.id)}</code>
        </div>
      )}

      {/* ===== البوست: الكلام + القفل بإيدك ===== */}
      {call.status === 'open' && call.kind === 'post' && (
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <div className="font-display text-16 font-black">
              قالوا جايين: {people.length}
              {people.length > 0 && (
                <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  {' '}
                  · {people.filter((p) => p.gender === 'male').length} ولد و
                  {people.filter((p) => p.gender === 'female').length} بنت
                </span>
              )}
            </div>
            <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
              الدوسة مجهولة للناس — إنت بتشوفهم هنا. والميعاد والمكان
              بيتكتبوا في الكلام تحت، إنت اللي بتقرر منهم.
            </div>

            {/* ⚠ **الأسامي للوحة بس.** §٣.٧ «الاختيار سري» معناها إن
                **الأعضاء** ما يشوفوش بعض قبل الكشف — مش إن المالك يشتغل
                وهو أعمى. `fn_yalla_admin` بترجّع ده أصلًا بصلاحية
                (`sbotat.view`)، وده نفس اللي بيتعرض للمجموعة بعد القفل
                تحت بالظبط. والفيد العام لسه رقم بس — ما اتلمسش. */}
            {people.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {people.map((p) => (
                  <div
                    key={p.profile_id}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b py-1 font-body text-14"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <span>
                      {p.first_name ?? '—'}{' '}
                      <span style={{ color: 'var(--muted)' }}>
                        {p.gender === 'female' ? 'بنت' : p.gender === 'male' ? 'ولد' : '—'}
                      </span>
                      {/* اسم المكان اللي كتبه — مش ظاهر لحد غيرك */}
                      {p.venue_note && (
                        <span style={{ color: 'var(--accent-text)' }}>
                          {' '}
                          · اقترح: {p.venue_note}
                        </span>
                      )}
                    </span>
                    <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
                      {when(p.chose_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ⚠ **ده أهم قسم في الصفحة** — ده اللي المالك بيقرا منه إمتى
              الناس فاضية وإيه المكان اللي يعجبها. من غيره النداء بوست
              والرد بيروح في الهوا. */}
          <div>
            <div className="font-display text-16 font-black">الكلام ({talk.length})</div>
            <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
              دوس «رد باسم نسبوط» تحت أي كلام علشان ترد عليه من حساب الموقع.
            </div>
            {talk.length === 0 ? (
              <div className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
                لسه محدش كتب.
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-3">
                {talk
                  .filter((c) => !c.parent_id)
                  .map((root) => (
                    <div
                      key={root.id}
                      className="border-b pb-3 font-body text-14"
                      style={{ borderColor: 'var(--line)' }}
                    >
                      <SaidRow c={root} onDel={delSaid} canEdit={canEdit} busy={busy} />

                      {/* الردود — مستوى واحد، زي الواجهة العامة بالظبط */}
                      {talk.filter((r) => r.parent_id === root.id).length > 0 && (
                        <div
                          className="mt-2 flex flex-col gap-2 ps-3"
                          style={{ borderInlineStart: '2px solid var(--line)' }}
                        >
                          {talk
                            .filter((r) => r.parent_id === root.id)
                            .map((r) => (
                              <SaidRow
                                key={r.id}
                                c={r}
                                onDel={delSaid}
                                canEdit={canEdit}
                                busy={busy}
                              />
                            ))}
                        </div>
                      )}

                      {call.status === 'open' &&
                        (replyTo === root.id ? (
                          <div className="mt-2 flex flex-col gap-2">
                            <textarea
                              value={replyBody}
                              onChange={(e) => setReplyBody(e.target.value)}
                              rows={2}
                              maxLength={400}
                              placeholder="رد نسبوط…"
                              className="w-full rounded-10 p-2 font-body text-14"
                              style={{
                                background: 'var(--bg)',
                                color: 'var(--fg)',
                                border: '1px solid var(--line)',
                                resize: 'none',
                              }}
                            />
                            <div className="flex flex-wrap gap-2">
                              <Btn
                                kind="primary"
                                onClick={() => sayAsNasbot(root.id)}
                                disabled={!canEdit || busy || !replyBody.trim()}
                              >
                                انشر باسم نسبوط
                              </Btn>
                              <Btn onClick={() => { setReplyTo(null); setReplyBody('') }}>
                                بطّل
                              </Btn>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2">
                            <Btn
                              onClick={() => { setReplyTo(root.id); setReplyBody('') }}
                              disabled={!canEdit}
                            >
                              رد باسم نسبوط
                            </Btn>
                          </div>
                        ))}
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* ===== التصويت ===== */}
          <div>
            <div className="font-display text-16 font-black">
              التصويت ({poll.length} اختيار · {poll.reduce((n, o) => n + o.votes, 0)} صوت)
            </div>
            <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
              اقرا الكلام فوق، وحوّل اللي اتقال لاختيارات هنا. الناس تصوّت،
              وانت تقفل على اللي كسب. ⚠ <strong>صوت العضو معناه إنه جاي</strong> —
              فاللي بيصوّت بيدخل المجموعة لوحده.
            </div>

            {poll.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                {poll.map((o) => (
                  <div
                    key={o.option_id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b py-1 font-body text-14"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <span>
                      {when(o.starts_at)} · {o.area_label}
                      {o.note_ar && (
                        <span style={{ color: 'var(--muted)' }}> · {o.note_ar}</span>
                      )}
                    </span>
                    <span className="flex items-center gap-2">
                      <strong className="font-display text-16">{o.votes}</strong>
                      <Btn
                        kind="danger"
                        onClick={() => removeOption(o.option_id)}
                        disabled={!canEdit || busy}
                      >
                        شيل
                      </Btn>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {call.status === 'open' && (
              <>
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <Inp label="اليوم" type="date" value={optDay} onChange={setOptDay} />
                  <Inp label="الساعة" type="time" value={optTime} onChange={setOptTime} />
                  <label className="flex flex-col gap-1">
                    <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
                      المنطقة
                    </span>
                    <select
                      value={optArea}
                      onChange={(e) => setOptArea(e.target.value)}
                      className="min-h-[40px] rounded-10 px-2 font-body text-14"
                      style={{
                        background: 'var(--bg)',
                        color: 'var(--fg)',
                        border: '1px solid var(--line)',
                      }}
                    >
                      <option value="">—</option>
                      {areaList.map((a) => (
                        <option key={a.key} value={a.key}>
                          {a.label_ar}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Inp label="ملاحظة (اختياري)" value={optNote} onChange={setOptNote} />
                  <Btn onClick={addOption} disabled={!canEdit || busy}>
                    ضيف اختيار
                  </Btn>
                </div>

                {poll.length > 0 && (
                  <div className="mt-3">
                    <Btn kind="primary" onClick={lockWinner} disabled={!canEdit || busy}>
                      اقفل على اللي كسب
                    </Btn>
                  </div>
                )}
              </>
            )}
          </div>

          <div>
            <div className="font-display text-16 font-black">اقفل على ميعاد ومكان</div>
            <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
              اكتب الميعاد الحقيقي والمنطقة. أول ما تقفل: اللي قالوا جايين
              بياخدوا مكانهم (ونص ولاد ونص بنات محترم)، والزيادة تروح الانتظار
              ومعاها أولوية في النداء الجاي.
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              {/* ⚠ `Inp` المشترك من `sbota-form` — نفس خانة «خروجة جديدة»
                  بالظبط. متعملش خانة تانية (§٧ «متعملش فورم تاني»). */}
              <Inp label="اليوم" type="date" value={lockDay} onChange={setLockDay} />
              <Inp label="الساعة" type="time" value={lockTime} onChange={setLockTime} />
              <label className="flex flex-col gap-1">
                <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
                  المنطقة
                </span>
                <select
                  value={lockArea}
                  onChange={(e) => setLockArea(e.target.value)}
                  className="min-h-[40px] rounded-10 px-2 font-body text-14"
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--fg)',
                    border: '1px solid var(--line)',
                  }}
                >
                  <option value="">—</option>
                  {areaList.map((a) => (
                    <option key={a.key} value={a.key}>
                      {a.label_ar}
                    </option>
                  ))}
                </select>
              </label>
              <Btn kind="primary" onClick={lockPost} disabled={!canEdit || busy}>
                اقفل عليه
              </Btn>
            </div>
            <div className="mt-2 font-body text-12" style={{ color: 'var(--muted)' }}>
              المهلة: {when(call.deadline)}
              {overdue
                ? ' — عدّت. المهمة المجدولة بتقفل لوحدها على الجمعة الجاية لو ما قفلتهاش بإيدك.'
                : ''}
            </div>
          </div>
        </div>
      )}

      {/* ===== النداء القديم: الاتجاه ===== */}
      {call.status === 'open' && call.kind !== 'post' && (
        <div className="mt-4">
          <div className="font-display text-16 font-black">الأعداد — مين قال إيه</div>
          <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
            أول (ميعاد + منطقة) يوصل {call.group_size} يكسب والنداء يقفل عليه لوحده.
          </div>
          {counts.length === 0 ? (
            <div className="mt-2 font-body text-14" style={{ color: 'var(--muted)' }}>
              لسه محدش اختار.
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-1">
              {counts.map((c) => (
                <div
                  key={`${c.slot_id}-${c.area_key}`}
                  className="flex items-baseline justify-between gap-3 border-b py-1 font-body text-14"
                  style={{ borderColor: 'var(--line)' }}
                >
                  <span>
                    {when(c.starts_at)} · {c.area_label}
                  </span>
                  <strong className="font-display text-16">
                    {c.n} من {call.group_size}
                  </strong>
                </div>
              ))}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Btn kind={overdue ? 'primary' : 'ghost'} onClick={lockNow} disabled={!canEdit || busy}>
              اقفل دلوقتي
            </Btn>
            <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
              المهلة: {when(call.deadline)}
              {overdue ? ' — عدّت، والمهمة المجدولة بتقفله لوحده كل ٥ دقايق' : ''}
            </span>
          </div>
        </div>
      )}

      {/* ===== بعد القفل ===== */}
      {call.status === 'locked' && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="font-body text-15">
            كملت على <strong>{when(slotAt(call.won_slot_id))}</strong> في{' '}
            <strong>{call.won_area ? label(call.won_area) : '—'}</strong>
          </div>

          <div>
            <div className="font-display text-16 font-black">
              المجموعة ({inGroup.length} من {sb?.capacity ?? call.group_size}) · {boys} ولد و{girls} بنت
            </div>
            {inGroup.length === 0 ? (
              <div className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
                مفيش حد في المجموعة.
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-1">
                {inGroup.map((p) => (
                  <div
                    key={p.profile_id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b py-1 font-body text-14"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <span>
                      {p.first_name ?? '—'}{' '}
                      <span style={{ color: 'var(--muted)' }}>
                        {p.gender === 'female' ? 'بنت' : p.gender === 'male' ? 'ولد' : '—'}
                      </span>
                    </span>
                    {p.booking_id && (
                      <Btn kind="danger" onClick={() => bench(p.booking_id!)} disabled={!canBook}>
                        بدّل → انتظار
                      </Btn>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="font-display text-16 font-black">
              قايمة الانتظار ({waiting.length})
            </div>
            {waiting.length === 0 ? (
              <div className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
                مفيش حد مستني.
              </div>
            ) : (
              <div className="mt-2 flex flex-col gap-1">
                {waiting.map((p) => (
                  <div
                    key={p.profile_id}
                    className="flex flex-wrap items-center justify-between gap-2 border-b py-1 font-body text-14"
                    style={{ borderColor: 'var(--line)' }}
                  >
                    <span>
                      {p.first_name ?? '—'}{' '}
                      <span style={{ color: 'var(--muted)' }}>
                        {p.gender === 'female' ? 'بنت' : p.gender === 'male' ? 'ولد' : '—'}
                      </span>
                    </span>
                    {p.waitlist_id && (
                      <Btn onClick={() => admit(p.waitlist_id!)} disabled={!canBook}>
                        دخّله المجموعة
                      </Btn>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {others.length > 0 && (
            <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
              و{others.length} قالوا ميعاد تاني — وصلهم «تيجي معاهم؟» وبيدخلوا بدوسة واحدة.
            </div>
          )}

          {/* ===== المكان بالظبط ===== */}
          {sb && (
            <div>
              <div className="font-display text-16 font-black">المكان بالظبط</div>
              <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
                إجباري قبل الكشف، ولازم يكون <strong>مكان عام</strong>. المجموعة بس هي اللي
                بتشوفه — وبعد «اكشف».
              </div>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <TextField label="اسم المكان" value={venue} onSave={setVenue} />
                <TextField label="العنوان" value={addr} onSave={setAddr} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Btn onClick={saveVenue} disabled={!canEdit}>
                  احفظ المكان
                </Btn>
                {!sb.reveal_at && (
                  <Btn
                    kind="primary"
                    onClick={doReveal}
                    disabled={!canReveal || busy || !venue.trim() || !addr.trim()}
                  >
                    اكشف
                  </Btn>
                )}
                {sb.reveal_at && (
                  <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                    اتكشفت {when(sb.reveal_at)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== أسامي الأماكن اللي الناس كتبتها ===== */}
      {notes.length > 0 && (
        <div className="mt-4">
          <div className="font-display text-16 font-black">أماكن الناس اقترحتها</div>
          <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
            ⚠ دي بتوصلك إنت بس — مش بتظهر لحد على الموقع.
          </div>
          <ul className="mt-2 flex flex-col gap-1">
            {notes.map((p) => (
              <li key={p.profile_id} className="font-body text-14">
                {p.venue_note}{' '}
                <span style={{ color: 'var(--muted)' }}>
                  — {p.first_name ?? '—'} · {p.area_label ?? '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ===== المواعيد والمناطق المعروضة ===== */}
      <div className="mt-4 font-body text-12" style={{ color: 'var(--muted)' }}>
        المعروض: {slots.map((s) => when(s.starts_at)).join(' · ')} — في{' '}
        {areas.map((a) => label(a.area_key)).join(' · ')}
      </div>

      {call.status === 'closed' && (
        <div className="mt-3 font-body text-13" style={{ color: 'var(--muted)' }}>
          اتقفل من غير مجموعة (أعلى اختيار كان تحت الحد الأدنى). كل اللي شاركوا عرفوا، ومعاهم
          أولوية في النداء الجاي.
        </div>
      )}
    </Card>
  )
}

/**
 * سطر كلام في اللوحة — جذر أو رد، نفس الشكل.
 *
 * ⚠ وسم «نسبوط» هنا علشان تفرّق بين ردك ورد عضو اسمه نسبوط. والمسح
 *   بصلاحية `sbotat.edit` — الحارس في القاعدة (`fn_yalla_unsay`).
 */
function SaidRow({
  c,
  onDel,
  canEdit,
  busy,
}: {
  c: {
    id: string
    first_name: string
    as_nasbot: boolean
    body_ar: string
    created_at: string
  }
  onDel: (id: string) => void
  canEdit: boolean
  busy: boolean
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-14 font-black">{c.first_name}</span>
        {c.as_nasbot && <Tag color="#F4632A">نسبوط</Tag>}
        <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {when(c.created_at)}
        </span>
        <button
          type="button"
          onClick={() => onDel(c.id)}
          disabled={!canEdit || busy}
          className="cursor-pointer border-0 bg-transparent p-0 font-body text-12 underline"
          style={{ color: 'var(--muted)' }}
        >
          امسح
        </button>
      </div>
      <div className="mt-1 font-body text-14">{c.body_ar}</div>
    </div>
  )
}
