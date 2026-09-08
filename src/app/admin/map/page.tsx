'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import {
  Card,
  Btn,
  SelectField,
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

export default function AdminMapPage() {
  return (
    <AdminShell title="الخريطة" needs="map.edit">
      {() => <MapEditor />}
    </AdminShell>
  )
}

function MapEditor() {
  const [rows, setRows] = useState<VenueRow[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [areaFilter, setAreaFilter] = useState('all')
  const [selected, setSelected] = useState<string | null>(null)
  const { flash, node: flashNode } = useFlash()

  const reload = useCallback(async () => {
    const db = supabase()
    const [v, s] = await Promise.all([
      db
        .from('venues')
        .select('id, name, kind, area, area_label_ar, address, map_lat, map_lng, is_active')
        .order('area')
        .order('name'),
      db.from('sbotat').select('venue_id').limit(5000),
    ])
    setRows((v.data ?? []) as VenueRow[])
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
