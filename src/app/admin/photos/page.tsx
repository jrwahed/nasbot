'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import {
  ADMIN_PAGE_SIZE,
  Btn,
  Card,
  Empty,
  Loading,
  Pager,
  Stat,
  Tabs,
  Tag,
  useFlash,
  when,
} from '@/components/admin-ui'
import { rejected } from '@/lib/admin'

/**
 * صور الخروجات — طابور الإشراف.
 *
 * ⚠ **الصفحة دي اتعملت مع الألبوم في نفس اليوم عن قصد.** فتحنا باب رفع
 *   الصور للأعضاء (`0113`)، ولو مفيش مكان تشوف منه اللي اترفع وتمسح
 *   الغلط، يبقى فتحنا باب ومحطناش عليه باب. صاحب الموقع لوحده، فالإشراف
 *   لازم يبقى في صفحة واحدة مرتّبة بالأحدث — مش إنه يفتح كل خروجة.
 *
 * الصور في باكت **خاص**، فالعرض برابط موقّع بيتبني هنا وبينتهي لوحده.
 *
 * والمسح بيمسح الصف **والملف** — ومعدّي على `rejected()`، فلو القاعدة
 * رفضت الصفحة بتقول رفضت مش «اتمسحت ✓».
 *
 * 🔴 **والصورة ما بتنزلش غير لما حد من هنا يوافق** (`0116`). العضو بيرفع،
 *    والصف بيوصل `published_to_members_at = null` — يعني **مستنية**.
 *    المجموعة ما بتشوفهاش غير بعد «انشر». التبويب الافتراضي هو «المستنية»
 *    علشان الطابور يبان أول ما تفتح، مش تدوّر عليه.
 */

const SIGNED_SECONDS = 600

type Tab = 'pending' | 'published'

interface PhotoRow {
  id: string
  sbota_id: string
  path: string
  caption_ar: string | null
  uploaded_by: string | null
  published_to_members_at: string | null
  created_at: string
  sbotat: {
    title_ar: string | null
    starts_at: string
    sbota_templates: { name_ar: string } | { name_ar: string }[] | null
  } | null
}

const one = <T,>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

export default function AdminPhotosPage() {
  return (
    <AdminShell title="صور الخروجات" needs="sbotat.view">
      {(me) => <Body canEdit={me.permissions.has('sbotat.edit')} />}
    </AdminShell>
  )
}

function Body({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<PhotoRow[] | null>(null)
  const [names, setNames] = useState<Record<string, string>>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [total, setTotal] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('pending')
  const [waiting, setWaiting] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const { flash, node: flashNode } = useFlash()

  const load = useCallback(async () => {
    setRows(null)
    const from = page * ADMIN_PAGE_SIZE
    const q = supabase()
      .from('sbota_photos')
      .select(
        [
          'id',
          'sbota_id',
          'path',
          'caption_ar',
          'uploaded_by',
          'published_to_members_at',
          'created_at',
          'sbotat(title_ar, starts_at, sbota_templates(name_ar))',
        ].join(','),
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, from + ADMIN_PAGE_SIZE - 1)

    const { data, count } =
      tab === 'pending' ? await q.is('published_to_members_at', null)
                        : await q.not('published_to_members_at', 'is', null)

    const list = (data ?? []) as unknown as PhotoRow[]
    setRows(list)
    setTotal(typeof count === 'number' ? count : null)

    // أسامي اللي رفعوا — للصفحة دي بس
    const ids = Array.from(new Set(list.map((r) => r.uploaded_by).filter(Boolean))) as string[]
    if (ids.length) {
      const { data: ps } = await supabase().from('profiles').select('id, first_name').in('id', ids)
      const map: Record<string, string> = {}
      for (const p of (ps ?? []) as { id: string; first_name: string | null }[]) {
        map[p.id] = (p.first_name ?? '').trim() || '—'
      }
      setNames(map)
    }

    // روابط موقّتة للعرض
    const signed: Record<string, string> = {}
    await Promise.all(
      list.map(async (r) => {
        const { data: s } = await supabase()
          .storage.from('sbota-photos')
          .createSignedUrl(r.path, SIGNED_SECONDS)
        if (s?.signedUrl) signed[r.id] = s.signedUrl
      })
    )
    setUrls(signed)
  }, [page, tab])

  useEffect(() => {
    void load()
  }, [load])

  // عدّاد المستنية — بيفضل باين حتى وانت في تبويب «المنشورة»
  useEffect(() => {
    let alive = true
    void supabase()
      .from('sbota_photos')
      .select('id', { count: 'exact', head: true })
      .is('published_to_members_at', null)
      .then((res: { count: number | null }) => {
        if (alive) setWaiting(typeof res.count === 'number' ? res.count : null)
      })
    return () => {
      alive = false
    }
  }, [rows])

  /** انشرها للمجموعة — ده الفعل اللي بيخلّي الصورة تبان أصلًا */
  async function publish(r: PhotoRow) {
    setBusy(true)
    const { data } = await supabase()
      .from('sbota_photos')
      .update({ published_to_members_at: new Date().toISOString() })
      .eq('id', r.id)
      .select('id')
    if (rejected(data)) flash('القاعدة رفضت النشر — محتاج صلاحية «تعديل السبوطات»')
    else {
      flash('اتنشرت للمجموعة')
      await load()
    }
    setBusy(false)
  }

  async function remove(r: PhotoRow) {
    if (!confirm('تمسح الصورة دي؟ مش هترجع.')) return
    setBusy(true)
    const { data } = await supabase().from('sbota_photos').delete().eq('id', r.id).select('id')
    if (rejected(data)) {
      flash('القاعدة رفضت المسح — شوف صلاحيتك')
    } else {
      await supabase().storage.from('sbota-photos').remove([r.path])
      flash('اتمسحت')
      await load()
    }
    setBusy(false)
  }

  if (rows === null) return <Loading />

  return (
    <>
      {flashNode}

      <div className="mb-4 flex flex-wrap gap-3">
        <Stat
          label="مستنية موافقتك"
          value={String(waiting ?? '—')}
          hint="المجموعة ما بتشوفهاش قبل ما تنشرها"
        />
        <Stat label="في التبويب ده" value={String(total ?? rows.length)} />
      </div>

      <Tabs
        value={tab}
        onChange={(v) => {
          setTab(v)
          setPage(0)
        }}
        tabs={[
          { id: 'pending' as Tab, label: `مستنية${waiting ? ` (${waiting})` : ''}` },
          { id: 'published' as Tab, label: 'اتنشرت' },
        ]}
      />

      {rows.length === 0 ? (
        <Empty>
          {tab === 'pending'
            ? 'مفيش صور مستنية. تمام.'
            : 'لسه مفيش صور اتنشرت.'}
        </Empty>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {rows.map((r) => {
            const sb = r.sbotat
            const name =
              (sb?.title_ar ?? '').trim() || one(sb?.sbota_templates)?.name_ar || '—'
            return (
              <Card key={r.id}>
                <div className="overflow-hidden rounded-12" style={{ background: 'var(--surface)' }}>
                  {urls[r.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[r.id]} alt={r.caption_ar ?? name} className="block h-auto w-full" />
                  ) : (
                    <div className="grid h-[140px] place-items-center font-body text-13" style={{ color: 'var(--muted)' }}>
                      مش قادرين نعرضها
                    </div>
                  )}
                </div>

                <div className="mt-2 font-display text-15 font-black">{name}</div>
                {r.caption_ar && <div className="mt-1 font-body text-14">{r.caption_ar}</div>}
                <div className="mt-1 flex flex-wrap items-center gap-2 font-body text-13" style={{ color: 'var(--muted)' }}>
                  <Tag>{r.uploaded_by ? names[r.uploaded_by] ?? '—' : 'اللوحة'}</Tag>
                  <span>{when(r.created_at)}</span>
                </div>

                {canEdit && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!r.published_to_members_at && (
                      <Btn onClick={() => publish(r)} disabled={busy} kind="primary">
                        انشر
                      </Btn>
                    )}
                    <Btn onClick={() => remove(r)} disabled={busy} kind="danger">
                      امسح
                    </Btn>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Pager page={page} shown={rows.length} total={total} onPage={setPage} busy={busy} />
    </>
  )
}
