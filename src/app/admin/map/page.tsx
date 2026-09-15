'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import { rejected } from '@/lib/admin'
import {
  Card,
  Btn,
  SelectField,
  TextField,
  Toggle,
  Table,
  Empty,
  Loading,
  Tag,
  Stat,
  useFlash,
} from '@/components/admin-ui'

/**
 * الخريطة: المناطق وإحداثيات الأماكن.
 *
 * مفيش خريطة جوجل ولا أي طبقات من بره — الموقع عليه CSP صارم وما بيسمحش
 * بأي نداء خارجي. اللي تحت رسم بسيط: كل مكان نقطة متحطة بحساب الطول والعرض
 * جوه إطار فاضي. مش خريطة حقيقية، بس بيوريك لو مكان واقع في منطقة غلط
 * أو الإحداثيات متبدّلة.
 */

/**
 * كتلة من كتل الخريطة العامة — جدول `map_areas` (هجرة 0066، والرسم الجديد 0099).
 *
 * ⚠ الهندسة (x/y/w/h) كانت **مقفولة** عن قصد: «تغييرها بالأرقام بيبوّظ الرسم».
 *    ده كان صح — تعديل رقم في خانة وانت مش شايف النتيجة مقامرة. بس النتيجة
 *    كانت إن المالك ما عندوش أي تحكم في خريطته غير إنه يطلب هجرة.
 *    الحل مش إنك تفتح الأرقام، الحل إنك **تشوف وانت بتحرّك**: المحرّر تحت
 *    بيرسم نفس خريطة `/map` وبتسحب الكتلة بإيدك.
 *
 *    و`lx`/`ly` (مكان التسمية) بقوا بيتحسبوا لوحدهم = نص الكتلة. كانوا
 *    عمودين منفصلين بيتظبطوا بالإيد، ولما الكتلة بتتحرّك كانت التسمية بتفضل
 *    مكانها وتطلع بره. عمود بيتحسب أضمن من عمود بيتنسى.
 */
interface AreaRow {
  key: string
  label_ar: string
  area: string | null
  match_labels: string[] | null
  is_far: boolean
  note_ar: string | null
  is_mystery: boolean
  is_active: boolean
  sort: number
  x: number
  y: number
  w: number
  h: number
  r: number
  lx: number
  ly: number
}

/** مساحة الرسم — نفس اللي في `src/components/CairoMap.tsx` */
const VB = { w: 400, h: 404 }

/** أقل مقاس للكتلة — أقل من كده التسمية ما تبانش */
const MIN_W = 60
const MIN_H = 44

/** عربي → مفتاح لاتيني للكتلة الجديدة */
const AR_TO_LATIN: Record<string, string> = {
  ا: 'a', أ: 'a', إ: 'a', آ: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'g', ح: 'h', خ: 'kh',
  د: 'd', ذ: 'z', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z',
  ع: 'a', غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w',
  ي: 'y', ى: 'a', ة: 'a', ء: '', ئ: 'y', ؤ: 'w',
}

function blockKey(label: string): string {
  const out: string[] = []
  for (const ch of label.trim()) {
    if (/[a-z0-9]/i.test(ch)) out.push(ch.toLowerCase())
    else if (ch in AR_TO_LATIN) out.push(AR_TO_LATIN[ch])
    else if (/\s|-/.test(ch)) out.push('_')
  }
  return (
    out.join('').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 30) ||
    `area_${Date.now().toString(36)}`
  )
}

interface VenueRow {
  id: string
  name: string
  kind: string
  area: string
  area_label_ar: string | null
  address: string
  map_lat: number | null
  map_lng: number | null
  is_active: boolean
}

const AREAS: { value: string; label: string }[] = [
  { value: 'tagamoa', label: 'التجمع' },
  { value: 'maadi', label: 'المعادي' },
  { value: 'zayed_october', label: 'زايد-أكتوبر' },
  { value: 'heliopolis_nasr', label: 'مصر الجديدة-مدينة نصر' },
  { value: 'downtown_zamalek', label: 'وسط-زمالك' },
  { value: 'other', label: 'غير كده' },
]

const AREA_COLOR: Record<string, string> = {
  tagamoa: '#F4632A',
  maadi: '#4CC9A7',
  zayed_october: '#FFD166',
  heliopolis_nasr: '#8AB4F8',
  downtown_zamalek: '#E879C7',
  other: '#B0B6BE',
}

const KINDS: Record<string, string> = {
  padel_club: 'نادي بادل',
  kayak: 'كاياك',
  cafe: 'كافيه',
  restaurant: 'مطعم',
  board_games: 'ألعاب طاولة',
  wadi: 'وادي',
  escape_room: 'غرفة هروب',
  paintball: 'بينتبول',
  workshop: 'ورشة',
  tour_operator: 'منظّم رحلات',
}

/** حدود القاهرة الكبرى — بنستعملها لو مفيش نقط كفاية نحسب منها */
const FALLBACK = { minLat: 29.75, maxLat: 30.25, minLng: 30.85, maxLng: 31.75 }

/** إحداثيات مصر تقريبًا — أي رقم بره ده يبقى غلط أكيد */
const EGYPT = { minLat: 21.5, maxLat: 32.0, minLng: 24.5, maxLng: 37.0 }

const inEgypt = (lat: number, lng: number) =>
  lat >= EGYPT.minLat && lat <= EGYPT.maxLat && lng >= EGYPT.minLng && lng <= EGYPT.maxLng

/* ==================================================== الأسماء المرادفة */

/**
 * أسماء المنطقة المرادفة — الخانة اللي بتقرر السبوطة هتقع فين.
 *
 * ⚠ ده مش تفصيلة تجميلية. السبوطة بتوصل لكتلتها بمطابقة **اسم المنطقة**
 *    اللي المالك كتبها مع القايمة دي. قبل كده كانت القايمة للقراية بس في
 *    اللوحة، يعني لو كتب «العبور» ومفيش كتلة فيها الاسم ده، السبوطة كانت
 *    **تختفي من الخريطة** من غير ولا رسالة. دلوقتي بتتعدّل من هنا.
 */
function MatchLabels({
  labels,
  onChange,
}: {
  labels: string[]
  onChange: (next: string[]) => void
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const v = draft.trim()
    if (!v) return
    if (labels.some((l) => l.trim() === v)) {
      setDraft('')
      return
    }
    onChange([...labels, v])
    setDraft('')
  }

  return (
    <div className="mt-3">
      <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
        الأسماء اللي بتوقّع السبوطة في الكتلة دي — زوّد كل اسم ممكن حد يكتبه.
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {labels.length === 0 && (
          <span className="font-body text-13" style={{ color: 'var(--err-text)' }}>
            مفيش ولا اسم — مش هيوصل الكتلة دي أي سبوطة.
          </span>
        )}

        {labels.map((l) => (
          <span
            key={l}
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 font-body text-14"
            style={{ background: 'var(--bg)', border: '2px solid var(--line)' }}
          >
            {l}
            <button
              type="button"
              onClick={() => onChange(labels.filter((x) => x !== l))}
              aria-label={`شيل ${l}`}
              className="cursor-pointer border-0 bg-transparent font-display text-16 font-black"
              style={{ color: 'var(--err-text)' }}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder="اسم زيادة — مثلًا: الشروق"
          className="min-w-[200px] rounded-14 px-3 py-2 font-body text-15"
          style={{ background: 'var(--bg)', color: 'var(--fg)', border: '2px solid var(--line)' }}
        />
        <Btn onClick={add} disabled={!draft.trim()}>
          زوّد
        </Btn>
      </div>
    </div>
  )
}

/* ==================================================== محرّر الخريطة بالسحب */

/** النيل — نفس الشكل اللي في الخريطة العامة بالظبط */
const NILE =
  'M168 0 C 160 70, 150 120, 146 175 C 142 240, 150 300, 162 360 L 162 404 L 186 404 ' +
  'C 176 330, 168 260, 172 190 C 176 120, 186 60, 192 0 Z'

/**
 * محرّر الخريطة — بتسحب الكتلة بإيدك وانت شايف النتيجة.
 *
 * ⚠ **ليه سحب مش خانات أرقام؟** الملاحظة القديمة في الصفحة دي كانت بتقول
 *    «الهندسة مش بتتعدّل من هنا عن قصد — تغييرها بالأرقام بيبوّظ الرسم بسهولة»
 *    وده صح تمامًا. بس النتيجة كانت إن المالك ما عندوش تحكم في خريطته خالص،
 *    ولازم يطلب هجرة علشان يحرّك كتلة. الحل إنك تشوف وانت بتحرّك.
 *
 * الحفظ بيحصل لما تسيب الكتلة (`pointerup`) — مش مع كل حركة، علشان ما
 * نضربش القاعدة بمية طلب في الثانية.
 */
function BlockCanvas({
  areas,
  onMove,
  selected,
  onSelect,
}: {
  areas: AreaRow[]
  onMove: (key: string, box: { x: number; y: number; w: number; h: number }) => void
  selected: string | null
  onSelect: (key: string) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  /** الحركة اللي بتحصل دلوقتي — بتتعرض فورًا وبتتحفظ لما تسيب */
  const [live, setLive] = useState<{
    key: string
    mode: 'move' | 'size'
    x: number
    y: number
    w: number
    h: number
  } | null>(null)
  const start = useRef<{ px: number; py: number; box: AreaRow } | null>(null)

  /** من إحداثيات الشاشة لإحداثيات الرسم — الاتجاه (rtl) ما بيأثرش على SVG */
  function toVb(e: { clientX: number; clientY: number }) {
    const r = svgRef.current?.getBoundingClientRect()
    if (!r) return { x: 0, y: 0 }
    return { x: ((e.clientX - r.left) / r.width) * VB.w, y: ((e.clientY - r.top) / r.height) * VB.h }
  }

  const drawn = areas.filter((a) => !a.is_mystery && a.w > 0 && a.h > 0 && a.is_active)

  function down(e: React.PointerEvent, a: AreaRow, mode: 'move' | 'size') {
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = toVb(e)
    start.current = { px: p.x, py: p.y, box: a }
    setLive({ key: a.key, mode, x: a.x, y: a.y, w: a.w, h: a.h })
    onSelect(a.key)
  }

  function move(e: React.PointerEvent) {
    if (!live || !start.current) return
    const p = toVb(e)
    const dx = p.x - start.current.px
    const dy = p.y - start.current.py
    const b = start.current.box
    // التقريب لأقرب ٢ — الكتل بتتلزق ببعض بدل ما تسيب خط شعرة بينها
    const snap = (n: number) => Math.round(n / 2) * 2

    if (live.mode === 'move') {
      setLive({
        ...live,
        x: Math.max(0, Math.min(VB.w - b.w, snap(b.x + dx))),
        y: Math.max(0, Math.min(VB.h - b.h, snap(b.y + dy))),
      })
    } else {
      setLive({
        ...live,
        w: Math.max(MIN_W, Math.min(VB.w - b.x, snap(b.w + dx))),
        h: Math.max(MIN_H, Math.min(VB.h - b.y, snap(b.h + dy))),
      })
    }
  }

  function up() {
    if (live) {
      const b = areas.find((a) => a.key === live.key)
      if (b && (b.x !== live.x || b.y !== live.y || b.w !== live.w || b.h !== live.h)) {
        onMove(live.key, { x: live.x, y: live.y, w: live.w, h: live.h })
      }
    }
    setLive(null)
    start.current = null
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${VB.w} ${VB.h}`}
      className="block h-auto w-full touch-none select-none"
      style={{ background: '#191C22', borderRadius: 20, border: '2px solid #333845' }}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <path d={NILE} fill="#2B3A52" />

      {drawn.map((a) => {
        const on = live?.key === a.key
        const box = on ? live : a
        const sel = selected === a.key
        return (
          <g key={a.key}>
            <rect
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              rx={a.r}
              fill={sel ? '#3A2B24' : '#262A32'}
              stroke={sel ? '#F4632A' : '#333845'}
              strokeWidth={sel ? 3 : 2}
              style={{ cursor: 'grab' }}
              onPointerDown={(e) => down(e, a, 'move')}
            />
            <text
              x={box.x + box.w / 2}
              y={box.y + box.h / 2 + 5}
              textAnchor="middle"
              fill={sel ? '#FBF7EF' : '#9EA2AB'}
              style={{ font: '800 14px var(--font-plex), sans-serif', pointerEvents: 'none' }}
            >
              {a.label_ar}
            </text>
            {/* مقبض التكبير — الركن اللي تحت */}
            <rect
              x={box.x + box.w - 14}
              y={box.y + box.h - 14}
              width="14"
              height="14"
              rx="4"
              fill={sel ? '#F4632A' : '#4A4E58'}
              style={{ cursor: 'nwse-resize' }}
              onPointerDown={(e) => down(e, a, 'size')}
            />
          </g>
        )
      })}
    </svg>
  )
}

export default function AdminMapPage() {
  return (
    <AdminShell title="الخريطة" needs="map.edit">
      {() => <MapEditor />}
    </AdminShell>
  )
}

function MapEditor() {
  const [rows, setRows] = useState<VenueRow[] | null>(null)
  const [areas, setAreas] = useState<AreaRow[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [areaFilter, setAreaFilter] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedArea, setSelectedArea] = useState<string | null>(null)
  const { flash, node: flashNode } = useFlash()

  const reload = useCallback(async () => {
    const db = supabase()
    const [v, s, a] = await Promise.all([
      db
        .from('venues')
        .select('id, name, kind, area, area_label_ar, address, map_lat, map_lng, is_active')
        .order('area')
        .order('name'),
      db.from('sbotat').select('venue_id').limit(5000),
      db
        .from('map_areas')
        .select(
          'key, label_ar, area, match_labels, is_far, note_ar, is_mystery, is_active, sort, x, y, w, h, r, lx, ly'
        )
        .order('sort'),
    ])
    setRows((v.data ?? []) as VenueRow[])
    setAreas((a.data ?? []) as AreaRow[])
    const c: Record<string, number> = {}
    for (const row of (s.data ?? []) as { venue_id: string | null }[]) {
      if (row.venue_id) c[row.venue_id] = (c[row.venue_id] ?? 0) + 1
    }
    setCounts(c)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const shown = useMemo(
    () => (rows ?? []).filter((r) => areaFilter === 'all' || r.area === areaFilter),
    [rows, areaFilter]
  )

  const placed = useMemo(
    () => shown.filter((r) => r.map_lat !== null && r.map_lng !== null),
    [shown]
  )
  const missing = useMemo(() => (rows ?? []).filter((r) => r.map_lat === null || r.map_lng === null), [rows])

  /** الإطار اللي هنرسم جواه — بيتلم على النقط الموجودة مع هامش */
  const bounds = useMemo(() => {
    if (placed.length < 2) return FALLBACK
    const lats = placed.map((r) => Number(r.map_lat))
    const lngs = placed.map((r) => Number(r.map_lng))
    const padLat = Math.max((Math.max(...lats) - Math.min(...lats)) * 0.15, 0.01)
    const padLng = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 0.15, 0.01)
    return {
      minLat: Math.min(...lats) - padLat,
      maxLat: Math.max(...lats) + padLat,
      minLng: Math.min(...lngs) - padLng,
      maxLng: Math.max(...lngs) + padLng,
    }
  }, [placed])

  async function patch(id: string, p: Partial<VenueRow>) {
    const { data, error } = await supabase().from('venues').update(p).eq('id', id).select('id')
    if (error) return flash(`مقدرناش نحفظ: ${error.message}`)
    if (!data || (data as unknown[]).length === 0)
      return flash('القاعدة ما قبلتش التعديل — يظهر إن صلاحيتك ما بتسمحش.')
    await reload()
    flash('اتحفظ ✓')
  }

  /**
   * حفظ كتلة خريطة. نفس حارس الكتابة في باقي اللوحة: `.select('key')` ثم
   * `rejected()` — المصفوفة الفاضية معناها RLS رفضت (`map_areas_write`
   * محتاجة صلاحية `map.edit`)، مش إن الحفظ نجح.
   */
  async function patchArea(key: string, p: Partial<AreaRow>) {
    const { data, error } = await supabase()
      .from('map_areas')
      .update(p)
      .eq('key', key)
      .select('key')
    if (error) return flash(`مقدرناش نحفظ الكتلة: ${error.message}`)
    if (rejected(data))
      return flash('القاعدة رفضت التعديل — محتاج صلاحية map.edit.')
    setAreas((list) => list.map((r) => (r.key === key ? { ...r, ...p } : r)))
    flash('الكتلة اتحفظت ✓ — الخريطة العامة هتشوفها على طول.')
  }

  /**
   * تحريك/تكبير كتلة. `lx`/`ly` بيتحسبوا لوحدهم = نص الكتلة — كانوا بيتظبطوا
   * بالإيد، ولما الكتلة بتتحرّك كانت التسمية بتفضل مكانها وتطلع بره الكتلة.
   */
  async function moveArea(key: string, box: { x: number; y: number; w: number; h: number }) {
    await patchArea(key, {
      ...box,
      lx: Math.round(box.x + box.w / 2),
      ly: Math.round(box.y + box.h / 2),
    })
  }

  /** الأسماء المرادفة — دي اللي بتحدد السبوطة هتقع في أنهي كتلة */
  async function setLabels(key: string, labels: string[]) {
    const clean = Array.from(new Set(labels.map((l) => l.trim()).filter(Boolean)))
    // ⚠ اسم في كتلتين = الترتيب هو اللي بيقرر، وده هش. بنمنعه هنا زي ما
    //    `test_map_blocks()` بتمنعه في القاعدة.
    const clash = areas.find(
      (a) => a.key !== key && (a.match_labels ?? []).some((l) => clean.includes(l.trim()))
    )
    if (clash) return flash(`الاسم ده متسجّل في «${clash.label_ar}» — اسم واحد لكتلة واحدة.`)
    await patchArea(key, { match_labels: clean })
  }

  /** منطقة جديدة على الخريطة */
  async function addArea() {
    const label = prompt('اسم المنطقة زي ما هيبان على الخريطة (قصير — «المقطم» مش «المقطم والهضبة»)')
    if (!label?.trim()) return
    const key = blockKey(label)
    if (areas.some((a) => a.key === key)) return flash('فيه منطقة بنفس الاسم خلاص.')

    const { data, error } = await supabase()
      .from('map_areas')
      .insert({
        key,
        label_ar: label.trim(),
        match_labels: [label.trim()],
        // بتتحط في ركن فاضي والمالك بيسحبها مكانها
        x: 8, y: VB.h - 80, w: 110, h: 64, r: 24,
        lx: 63, ly: VB.h - 48,
        sort: Math.max(0, ...areas.map((a) => a.sort)) + 10,
      })
      .select('key')
    if (error) return flash(`مقدرناش نضيف المنطقة: ${error.message}`)
    if (rejected(data)) return flash('القاعدة رفضت الإضافة — محتاج صلاحية map.edit.')
    await reload()
    setSelectedArea(key)
    flash('المنطقة اتضافت ✓ — اسحبها مكانها على الرسم.')
  }

  /** مكان جديد في دليل الأماكن */
  async function addVenue() {
    const name = prompt('اسم المكان')
    if (!name?.trim()) return
    const { data, error } = await supabase()
      .from('venues')
      .insert({ name: name.trim(), kind: 'cafe', area: 'other', address: '', is_active: true })
      .select('id')
    if (error) return flash(`مقدرناش نضيف المكان: ${error.message}`)
    // ⚠ `venues_write` بتطلب `sbotat.edit` مش `map.edit` — الصفحة دي بتفتح
    //    بـ`map.edit`، فممكن تكون داخل الصفحة ومش من حقك تضيف مكان.
    if (rejected(data)) return flash('القاعدة رفضت الإضافة — محتاج صلاحية sbotat.edit.')
    await reload()
    flash('المكان اتضاف ✓ — كمّل نوعه ومنطقته وإحداثياته تحت.')
  }

  /** بيغيّر اسم المنطقة العربي على كل أماكن المنطقة مرة واحدة */
  async function renameArea(area: string, label: string) {
    const hits = (rows ?? []).filter((r) => r.area === area)
    if (!hits.length) return
    if (!confirm(`هنغيّر اسم المنطقة على ${hits.length} مكان. تمام؟`)) return
    const db = supabase()
    let done = 0
    for (const h of hits) {
      const { data, error } = await db
        .from('venues')
        .update({ area_label_ar: label })
        .eq('id', h.id)
        .select('id')
      if (!error && data && (data as unknown[]).length > 0) done++
    }
    await reload()
    flash(done === hits.length ? `اتغيّر في ${done} مكان ✓` : `اتغيّر في ${done} من ${hits.length} بس`)
  }

  if (rows === null) return <Loading />

  const areaStats = AREAS.map((a) => {
    const list = (rows ?? []).filter((r) => r.area === a.value)
    const labels = Array.from(new Set(list.map((r) => r.area_label_ar).filter(Boolean))) as string[]
    return { ...a, count: list.length, noCoords: list.filter((r) => r.map_lat === null).length, labels }
  })

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-wrap gap-3">
        <Stat label="أماكن" value={String(rows.length)} />
        <Stat label="شغّالة" value={String(rows.filter((r) => r.is_active).length)} />
        <Stat
          label="من غير إحداثيات"
          value={String(missing.length)}
          hint={missing.length ? 'دول مش هيبانوا في الرسم' : 'كله متظبط'}
        />
      </div>

      {missing.length > 0 && (
        <div
          className="rounded-16 px-4 py-3"
          style={{ background: '#F4632A', color: '#14161A' }}
        >
          <div className="font-display text-18 font-black">
            {missing.length} مكان من غير إحداثيات
          </div>
          <div className="mt-1 font-body text-14">
            {missing.map((m) => m.name).join('، ')}
          </div>
        </div>
      )}

      {flashNode}

      {/* الرسم */}
      <Card
        title="مكان كل حتة"
        hint="رسم تقريبي بالطول والعرض — مش خريطة. الشمال فوق، والشرق على اليمين."
      >
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <SelectField
            label="المنطقة"
            value={areaFilter}
            options={[{ value: 'all', label: 'كل المناطق' }, ...AREAS]}
            onChange={setAreaFilter}
          />
          <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
            {placed.length} مكان متحطوط من {shown.length}
          </div>
        </div>

        <div
          className="relative mt-3 w-full overflow-hidden rounded-16"
          style={{
            aspectRatio: '3 / 2',
            background: 'var(--bg)',
            border: '2px solid var(--line)',
          }}
        >
          {/* شبكة خفيفة علشان العين تقدر تقارن */}
          {[25, 50, 75].map((p) => (
            <div key={`h${p}`} className="absolute" style={{ top: `${p}%`, left: 0, right: 0, height: 1, background: 'var(--line)', opacity: 0.5 }} />
          ))}
          {[25, 50, 75].map((p) => (
            <div key={`v${p}`} className="absolute" style={{ left: `${p}%`, top: 0, bottom: 0, width: 1, background: 'var(--line)', opacity: 0.5 }} />
          ))}

          {placed.map((r) => {
            const lat = Number(r.map_lat)
            const lng = Number(r.map_lng)
            const x = ((lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100
            const y = ((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * 100
            const on = selected === r.id
            const bad = !inEgypt(lat, lng)
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setSelected(on ? null : r.id)}
                title={`${r.name} — ${lat}, ${lng}`}
                className="absolute cursor-pointer rounded-pill px-2 py-[2px] font-display text-12 font-black"
                style={{
                  left: `${Math.min(98, Math.max(2, x))}%`,
                  top: `${Math.min(97, Math.max(3, y))}%`,
                  transform: 'translate(-50%, -50%)',
                  background: bad ? 'var(--err-text)' : (AREA_COLOR[r.area] ?? '#B0B6BE'),
                  color: '#14161A',
                  border: on ? '3px solid var(--fg)' : '2px solid transparent',
                  opacity: r.is_active ? 1 : 0.5,
                  whiteSpace: 'nowrap',
                  zIndex: on ? 2 : 1,
                }}
              >
                {r.name}
              </button>
            )
          })}

          {placed.length === 0 && (
            <div
              className="absolute inset-0 flex items-center justify-center font-body text-16"
              style={{ color: 'var(--muted)' }}
            >
              مفيش مكان بإحداثيات في الفلتر ده.
            </div>
          )}
        </div>

        <div className="mt-2 font-body text-12" style={{ color: 'var(--muted)' }}>
          الإطار: من {bounds.minLat.toFixed(3)} لـ {bounds.maxLat.toFixed(3)} عرض · من{' '}
          {bounds.minLng.toFixed(3)} لـ {bounds.maxLng.toFixed(3)} طول. النقطة الحمرا معناها إحداثيات
          بره مصر خالص — غالبًا الطول والعرض متبدّلين.
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {AREAS.map((a) => (
            <span
              key={a.value}
              className="rounded-pill px-2 py-[2px] font-body text-12"
              style={{ background: AREA_COLOR[a.value], color: '#14161A' }}
            >
              {a.label}
            </span>
          ))}
        </div>
      </Card>

      {/* كتل الخريطة العامة — map_areas */}
      <Card
        title="كتل الخريطة العامة"
        hint="ده اللي الأعضاء بيشوفوه في /map. اسحب الكتلة مكانها، وشدّ الركن تكبّرها."
      >
        <div className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
          اسحب أي كتلة بإيدك، والمربع الصغير في ركنها بيكبّرها ويصغّرها. بتتحفظ
          لما تسيبها. مكان التسمية بيتحسب لوحده في نص الكتلة.
          الكتلة المقفولة بتختفي من الخريطة العامة خالص.
        </div>

        <div className="mt-3">
          <BlockCanvas
            areas={areas}
            selected={selectedArea}
            onSelect={setSelectedArea}
            onMove={moveArea}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Btn kind="primary" onClick={addArea}>
            منطقة جديدة
          </Btn>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {areas.length === 0 && (
            <Empty>
              مفيش كتل. يعني هجرة 0066 لسه ما اتلزقتش — الخريطة بتقرا من الاحتياطي
              في الكود لحد ما تتلزق.
            </Empty>
          )}

          {areas.map((a) => (
            <div
              key={a.key}
              className="rounded-16 p-4"
              style={{
                background: 'var(--bg)',
                opacity: a.is_active ? 1 : 0.6,
                border: '3px solid transparent',
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-18 font-black">{a.label_ar}</span>
                <Tag>{a.key}</Tag>
                {a.is_mystery && <Tag color="#2B4CFF">نقطة الغامضة</Tag>}
                {a.is_far && <Tag color="#D9A441">بعيدة</Tag>}
                {!a.is_active && <Tag>مقفولة</Tag>}
                {a.area && (
                  <Tag color={AREA_COLOR[a.area]}>
                    {AREAS.find((x) => x.value === a.area)?.label ?? a.area}
                  </Tag>
                )}
                <span className="ms-auto font-body text-12" style={{ color: 'var(--muted)' }}>
                  {a.w > 0 ? `${a.w}×${a.h} عند ${a.x},${a.y}` : 'شريط تحت الخريطة'}
                </span>
              </div>

              {/*
                ⚠ **دي أهم خانة في الصفحة كلها.** السبوطة بتوصل لكتلتها بمطابقة
                  اسم المنطقة اللي كتبته مع الأسماء دي. لو ما لقتش، بتقع في
                  «مناطق تانية» — وقبل ما نعمل الكتلة دي كانت **بتختفي خالص**.
                  زوّد هنا كل اسم ممكن حد يكتبه للمنطقة.
              */}
              {!a.is_mystery && (
                <MatchLabels
                  labels={a.match_labels ?? []}
                  onChange={(next) => setLabels(a.key, next)}
                />
              )}

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <TextField
                  label="الاسم المعروض"
                  value={a.label_ar}
                  hint="ده النص اللي بيتكتب جوه الكتلة على الخريطة."
                  onSave={(v) => {
                    const t = v.trim()
                    if (!t) return flash('الاسم ما ينفعش يفضل فاضي.')
                    if (t !== a.label_ar) patchArea(a.key, { label_ar: t })
                  }}
                />

                <TextField
                  label="الملاحظة جنب الاسم"
                  value={a.note_ar ?? ''}
                  placeholder="مثلًا: ساعتين"
                  hint="بتظهر تحت الاسم على الخريطة. سيبها فاضية تختفي."
                  onSave={(v) => {
                    const t = v.trim()
                    if (t !== (a.note_ar ?? '')) patchArea(a.key, { note_ar: t || null })
                  }}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-5">
                <Toggle
                  label="بعيدة عن القاهرة"
                  value={a.is_far}
                  hint="بتتحط عليها علامة «بعيدة» في الخريطة."
                  onChange={(v) => patchArea(a.key, { is_far: v })}
                />
                <Toggle
                  label="ظاهرة للأعضاء"
                  value={a.is_active}
                  hint="اقفلها علشان تختفي من /map من غير ما تتمسح."
                  onChange={(v) => patchArea(a.key, { is_active: v })}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* المناطق */}
      <Card title="المناطق" hint="الاسم العربي هو اللي بيظهر للأعضاء مع السبوطة.">
        <div className="mt-3">
          <Table head={['المنطقة', 'أماكن', 'من غير إحداثيات', 'الاسم العربي المستعمل', 'غيّره في الكل']}>
            {areaStats.map((a) => (
              <tr key={a.value} style={{ borderTop: '1px solid var(--line)' }}>
                <td className="p-2">
                  <Tag color={AREA_COLOR[a.value]}>{a.label}</Tag>
                </td>
                <td className="p-2">{a.count}</td>
                <td className="p-2" style={{ color: a.noCoords ? 'var(--err-text)' : 'var(--muted)' }}>
                  {a.noCoords}
                </td>
                <td className="p-2">
                  {a.labels.length === 0 ? (
                    <span style={{ color: 'var(--muted)' }}>مفيش</span>
                  ) : (
                    a.labels.join(' · ')
                  )}
                </td>
                <td className="p-2">
                  <input
                    defaultValue={a.labels[0] ?? ''}
                    placeholder={a.label}
                    disabled={a.count === 0}
                    onBlur={(e) => {
                      const v = e.target.value.trim()
                      if (v && v !== (a.labels[0] ?? '')) renameArea(a.value, v)
                    }}
                    className="w-full min-w-[160px] rounded-14 px-3 py-2 font-body text-15"
                    style={{
                      background: 'var(--bg)',
                      color: 'var(--fg)',
                      border: '2px solid var(--line)',
                    }}
                  />
                </td>
              </tr>
            ))}
          </Table>
        </div>
      </Card>

      {/* الأماكن */}
      <Card title="الأماكن" hint="اكتب الإحداثيات وسيب الخانة، بتتحفظ لوحدها.">
        <div className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
          دي دليل أماكنك الداخلي (وأماكن الشغل). سبوطات نسبوط بقت بتكتب المكان
          والعنوان بإيدها في <code>/admin/sbotat</code>، فالأماكن هنا **مش**
          بتظهر على خريطة الأعضاء — الكتل اللي فوق هي اللي بتظهر.
        </div>

        <div className="mt-3">
          <Btn kind="primary" onClick={addVenue}>
            مكان جديد
          </Btn>
        </div>

        <div className="mt-3 flex flex-col gap-3">
          {shown.length === 0 && <Empty>مفيش أماكن في المنطقة دي.</Empty>}

          {shown.map((r) => {
            const lat = r.map_lat === null ? null : Number(r.map_lat)
            const lng = r.map_lng === null ? null : Number(r.map_lng)
            const noCoords = lat === null || lng === null
            const bad = !noCoords && !inEgypt(lat, lng)
            const used = counts[r.id] ?? 0

            return (
              <div
                key={r.id}
                onClick={() => setSelected(r.id)}
                className="rounded-16 p-4"
                style={{
                  background: 'var(--bg)',
                  opacity: r.is_active ? 1 : 0.6,
                  border: `3px solid ${
                    selected === r.id
                      ? 'var(--fg)'
                      : noCoords || bad
                        ? 'var(--err-text)'
                        : 'transparent'
                  }`,
                }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-18 font-black">{r.name}</span>
                  <Tag>{KINDS[r.kind] ?? r.kind}</Tag>
                  <Tag color={AREA_COLOR[r.area]}>{AREAS.find((a) => a.value === r.area)?.label ?? r.area}</Tag>
                  {!r.is_active && <Tag>مقفول</Tag>}
                  {noCoords && <Tag color="#F4632A">من غير إحداثيات</Tag>}
                  {bad && <Tag color="#F4632A">إحداثيات بره مصر</Tag>}
                  <span className="ms-auto font-body text-12" style={{ color: 'var(--muted)' }}>
                    {used ? `${used} سبوطة اتعملت هنا` : 'لسه مفيش سبوطة هنا'}
                  </span>
                </div>

                <div className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
                  {r.address}
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                      العرض (lat)
                    </span>
                    <input
                      type="number"
                      step="0.000001"
                      defaultValue={lat ?? ''}
                      placeholder="30.05"
                      onBlur={(e) => {
                        const raw = e.target.value.trim()
                        const n = raw === '' ? null : Number(raw)
                        if (raw !== '' && Number.isNaN(n)) return flash('اكتب رقم صح.')
                        if (n !== lat) patch(r.id, { map_lat: n })
                      }}
                      className="w-[150px] rounded-14 px-3 py-2 font-body text-15"
                      style={{
                        background: 'var(--surface)',
                        color: 'var(--fg)',
                        border: '2px solid var(--line)',
                      }}
                    />
                  </label>

                  <label className="flex flex-col gap-1">
                    <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                      الطول (lng)
                    </span>
                    <input
                      type="number"
                      step="0.000001"
                      defaultValue={lng ?? ''}
                      placeholder="31.35"
                      onBlur={(e) => {
                        const raw = e.target.value.trim()
                        const n = raw === '' ? null : Number(raw)
                        if (raw !== '' && Number.isNaN(n)) return flash('اكتب رقم صح.')
                        if (n !== lng) patch(r.id, { map_lng: n })
                      }}
                      className="w-[150px] rounded-14 px-3 py-2 font-body text-15"
                      style={{
                        background: 'var(--surface)',
                        color: 'var(--fg)',
                        border: '2px solid var(--line)',
                      }}
                    />
                  </label>

                  <SelectField
                    label="المنطقة"
                    value={r.area}
                    options={AREAS}
                    onChange={(v) => {
                      if (v === r.area) return
                      if (!confirm(`هننقل «${r.name}» لمنطقة تانية. تمام؟`)) return
                      patch(r.id, { area: v })
                    }}
                  />

                  <label className="flex flex-col gap-1">
                    <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                      الاسم العربي للمنطقة
                    </span>
                    <input
                      defaultValue={r.area_label_ar ?? ''}
                      placeholder={AREAS.find((a) => a.value === r.area)?.label ?? ''}
                      onBlur={(e) => {
                        const v = e.target.value.trim()
                        if (v !== (r.area_label_ar ?? '')) patch(r.id, { area_label_ar: v || null })
                      }}
                      className="w-[220px] rounded-14 px-3 py-2 font-body text-15"
                      style={{
                        background: 'var(--surface)',
                        color: 'var(--fg)',
                        border: '2px solid var(--line)',
                      }}
                    />
                  </label>

                  {!noCoords && (
                    <Btn onClick={() => setSelected(r.id)}>ورّيني في الرسم</Btn>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
