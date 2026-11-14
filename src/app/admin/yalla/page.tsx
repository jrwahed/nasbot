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
      db.from('sbota_templates').select('id, slug, name_ar').eq('is_active', true).order('name_ar'),
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
          tpls={tpls}
          areaList={areaList}
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

function NewCall({
  tpls,
  areaList,
  canEdit,
  say,
  onDone,
}: {
  tpls: Tpl[]
  areaList: AreaRow[]
  canEdit: boolean
  say: (m: string) => void
  onDone: () => void
}) {
  const [tpl, setTpl] = useState('')
  const [line, setLine] = useState('')
  const [size, setSize] = useState(6)
  const [min, setMin] = useState(4)
  const [lockHours, setLockHours] = useState(48)
  const [cost, setCost] = useState('')
  const [dur, setDur] = useState(120)
  /** كل ميعاد: يوم + ساعة بتوقيت القاهرة */
  const [when1, setWhen1] = useState<{ d: string; t: string }[]>([
    { d: todayCairo(), t: '20:00' },
  ])
  const [picked, setPicked] = useState<string[]>([])
  const [words, setWords] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    loadBannedWords().then(setWords)
    // ⚠ الافتراضيات من `settings` مش من الكود (§٣.٢) — المالك بيغيّرهم من
    //   «الإعدادات ← الأرقام» والفورم بيبدأ منهم.
    const boot = async () => {
      const { data } = await supabase()
        .from('settings')
        .select('yalla_group_size, yalla_min_group, yalla_lock_hours')
        .maybeSingle()
      const d = data as {
        yalla_group_size?: number
        yalla_min_group?: number
        yalla_lock_hours?: number
      } | null
      if (!d) return
      setSize(d.yalla_group_size ?? 6)
      setMin(d.yalla_min_group ?? 4)
      setLockHours(d.yalla_lock_hours ?? 48)
    }
    boot()
  }, [])

  const toggleArea = (k: string) =>
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))

  const save = async () => {
    if (!canEdit) return
    if (!tpl) return say('اختار النشاط')
    if (!line.trim()) return say('اكتب سطر النداء')
    const bad = bannedIn(`${line} ${cost}`, words)
    if (bad.length) return say(`في كلمات ممنوعة: ${bad.join('، ')}`)
    if (min < 2 || min > size) return say('الحد الأدنى لازم يكون بين ٢ وعدد المجموعة')
    if (picked.length === 0) return say('اختار منطقة واحدة على الأقل')
    const iso = when1
      .filter((w) => w.d && w.t)
      .map((w) => cairoToIso(w.d, w.t))
      .filter((x) => new Date(x).getTime() > Date.now())
    if (iso.length === 0) return say('حط ميعاد واحد على الأقل في المستقبل')

    setBusy(true)
    const { data, error } = await supabase().rpc('fn_yalla_create', {
      p_template: tpl,
      p_line: line.trim(),
      p_group_size: size,
      p_min_group: min,
      p_deadline: new Date(Date.now() + lockHours * 3_600_000).toISOString(),
      p_slots: iso,
      p_areas: picked,
      p_cost_note: cost.trim() || null,
      p_duration: dur,
    })
    setBusy(false)
    if (error || !data) return say(error?.message ?? 'القاعدة رفضت')
    say('النداء نزل ✓ — الناس تقدر تختار دلوقتي')
    onDone()
  }

  return (
    <div className="mt-6 flex flex-col gap-4">
      <Card
        title="نداء جديد"
        hint="النداء بينزل على طول وبيبان في «يلا» — لو المفتاح مفتوح من الإعدادات."
      >
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              النشاط (قالب)
            </span>
            <select
              value={tpl}
              onChange={(e) => setTpl(e.target.value)}
              className="rounded-14 px-3 py-2 font-body text-16"
              style={{
                background: 'var(--bg)',
                color: 'var(--fg)',
                border: '2px solid var(--line)',
              }}
            >
              <option value="">— اختار —</option>
              {tpls.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name_ar}
                </option>
              ))}
            </select>
            <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
              صورة القالب هي صورة البوست. من غير صورة البوست بيبان كلام بس — وده تمام.
            </span>
          </label>

          <TextField
            label="سطر النداء"
            value={line}
            onSave={setLine}
            hint="كلام بوست مش عنوان إعلان. مثال: «يلا نسبوط — بادل. إمتى وفين؟»"
          />
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <NumberField label="عدد المجموعة" value={size} onSave={setSize} min={2} suffix="شخص" />
          <NumberField
            label="الحد الأدنى"
            value={min}
            onSave={setMin}
            min={2}
            suffix="شخص"
            hint="تحته النداء يتقفل من غير مجموعة"
          />
          <NumberField label="مهلة القفل" value={lockHours} onSave={setLockHours} min={1} suffix="ساعة" />
          <NumberField label="مدة الخروجة" value={dur} onSave={setDur} min={30} suffix="دقيقة" />
        </div>

        <div className="mt-4">
          <TextField
            label="سطر التكلفة (اختياري)"
            value={cost}
            onSave={setCost}
            hint="معلومة مش مبلغ بنحصّله — مفيش دفع في «يلا» خالص."
          />
        </div>
      </Card>

      <Card title="المواعيد المعروضة" hint="بتوقيت القاهرة. العضو يقدر يختار أكتر من واحد.">
        <div className="mt-3 flex flex-col gap-2">
          {when1.map((w, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={w.d}
                onChange={(e) =>
                  setWhen1((p) => p.map((x, j) => (j === i ? { ...x, d: e.target.value } : x)))
                }
                className="rounded-14 px-3 py-2 font-body text-16"
                style={{
                  background: 'var(--bg)',
                  color: 'var(--fg)',
                  border: '2px solid var(--line)',
                }}
              />
              <input
                type="time"
                value={w.t}
                onChange={(e) =>
                  setWhen1((p) => p.map((x, j) => (j === i ? { ...x, t: e.target.value } : x)))
                }
                className="rounded-14 px-3 py-2 font-body text-16"
                style={{
                  background: 'var(--bg)',
                  color: 'var(--fg)',
                  border: '2px solid var(--line)',
                }}
              />
              {when1.length > 1 && (
                <Btn kind="danger" onClick={() => setWhen1((p) => p.filter((_, j) => j !== i))}>
                  شيل
                </Btn>
              )}
            </div>
          ))}
          <div>
            <Btn onClick={() => setWhen1((p) => [...p, { d: todayCairo(), t: '20:00' }])}>
              + ميعاد
            </Btn>
          </div>
        </div>
      </Card>

      <Card
        title="المناطق المعروضة"
        hint="من قايمة المناطق الموجودة — الأسامي بتتعدّل من «الخريطة»."
      >
        <div className="mt-3 flex flex-wrap gap-2">
          {areaList.map((a) => {
            const on = picked.includes(a.key)
            return (
              <button
                key={a.key}
                type="button"
                onClick={() => toggleArea(a.key)}
                aria-pressed={on}
                className="cursor-pointer rounded-pill px-4 py-2 font-display text-15 font-black"
                style={{
                  background: on ? 'var(--fg)' : 'transparent',
                  color: on ? 'var(--bg)' : 'var(--fg)',
                  border: `2px solid ${on ? 'var(--fg)' : 'var(--chip-idle-border)'}`,
                }}
              >
                {a.label_ar}
              </button>
            )
          })}
        </div>
      </Card>

      <div>
        <Btn kind="primary" onClick={save} disabled={!canEdit || busy}>
          {busy ? 'ثانية واحدة…' : 'نزّل النداء'}
        </Btn>
      </div>
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

  const label = (k: string) => areaList.find((a) => a.key === k)?.label_ar ?? k
  const slotAt = (id: string | null) => slots.find((s) => s.id === id)?.starts_at ?? null
  const overdue = call.status === 'open' && new Date(call.deadline).getTime() <= Date.now()

  const loadDetail = useCallback(async () => {
    const db = supabase()
    const [c, p] = await Promise.all([
      // ⚠ `fn_yalla_counts` مش `fn_yalla_top`: التانية **مقفولة على الكل**
      //   (داخلية)، ودي غلاف عليها بصلاحية `sbotat.view`.
      db.rpc('fn_yalla_counts', { p_call: call.id }),
      db.rpc('fn_yalla_admin', { p_call: call.id }),
    ])
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

      {/* ===== الاتجاه ===== */}
      {call.status === 'open' && (
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
