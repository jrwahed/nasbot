'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import { revalidateSite, loadBannedWords, bannedIn } from '@/lib/admin'
import {
  Card,
  Btn,
  TextField,
  NumberField,
  Toggle,
  SelectField,
  PhotosField,
  Empty,
  Loading,
  Tag,
  useFlash,
  money,
  day,
} from '@/components/admin-ui'

/**
 * قوالب السبوطات.
 *
 * القالب هو الكلام الثابت بتاع السبوطة: الاسم، الحدوتة، اللي داخل واللي مش داخل،
 * والسعر والمدة والعدد الافتراضي. كل موعد في /admin/sbotat بيتعمل من قالب،
 * وبياخد منه القيم دي كبداية وينفع تغيّرها في الموعد نفسه.
 *
 * التعديل هنا بيغيّر الكلام في كل المواعيد اللي جاية من نفس القالب —
 * فخلي بالك وإنت بتلعب في السعر أو العدد.
 *
 * ملاحظة على القاعدة: جدول sbota_templates مفيهوش عمود is_active،
 * يعني مفيش «تشغيل/إيقاف» للقالب. اللي بيتحكم في الظهور هو حالة الموعد نفسه.
 */

interface Row {
  id: string
  slug: string
  name_ar: string
  story_ar: string
  kind: string
  default_price: number
  org_fee: number
  duration_min: number
  min_group: number
  max_group: number
  mood_ar: string | null
  meta_prefix_ar: string | null
  level_ar: string | null
  includes_ar: string[]
  excludes_ar: string[]
  is_day: boolean
  girls_only: boolean
  overnight: boolean
  hero_photos: string[]
  created_at: string
  updated_at: string
}

const KINDS = [
  { value: 'sport', label: 'رياضة' },
  { value: 'nile', label: 'النيل' },
  { value: 'nature', label: 'طبيعة' },
  { value: 'food', label: 'أكل' },
  { value: 'games', label: 'ألعاب' },
  { value: 'work', label: 'شغل' },
  { value: 'workshop', label: 'ورشة' },
  { value: 'mystery', label: 'غامضة' },
  { value: 'trip', label: 'رحلة' },
]

const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k

/** سطور المربع → مصفوفة نضيفة */
const toList = (text: string) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

/** كل الكلام اللي في التعديل، علشان نفحصه من الكلمات الممنوعة */
function textsOf(patch: Record<string, unknown>): string {
  const out: string[] = []
  for (const v of Object.values(patch)) {
    if (typeof v === 'string') out.push(v)
    else if (Array.isArray(v)) out.push(...v.filter((x): x is string => typeof x === 'string'))
  }
  return out.join(' ')
}

/** اسم لطيف للـ slug من الاسم العربي */
const slugify = (name: string) =>
  name
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .toLowerCase()
    .slice(0, 60)

export default function AdminTemplatesPage() {
  return (
    <AdminShell title="قوالب السبوطات" needs="sbotat.edit">
      {() => <TemplatesEditor />}
    </AdminShell>
  )
}

function TemplatesEditor() {
  const [rows, setRows] = useState<Row[]>([])
  const [banned, setBanned] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('الكل')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const { flash, node: flashNode } = useFlash()

  const reload = useCallback(async () => {
    const { data, error } = await supabase()
      .from('sbota_templates')
      .select('*')
      .order('name_ar')
    if (error) {
      setLoading(false)
      return
    }
    setRows((data ?? []) as Row[])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    loadBannedWords().then(setBanned)
  }, [reload])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (kind !== 'الكل' && r.kind !== kind) return false
      if (!needle) return true
      return (
        r.name_ar.toLowerCase().includes(needle) ||
        r.slug.toLowerCase().includes(needle) ||
        r.story_ar.toLowerCase().includes(needle)
      )
    })
  }, [rows, q, kind])

  /** أي تعديل على قالب بيعدي من هنا: فحص كلام، حفظ، وتحديث الموقع */
  async function patch(id: string, p: Record<string, unknown>) {
    const bad = bannedIn(textsOf(p), banned)
    if (bad.length) {
      flash(`فيه كلمة ممنوعة: ${bad.join('، ')}`)
      return
    }
    // بنطلب الصف بعد التعديل علشان لو RLS منعنا نعرف — من غير كده بيرجع «تمام» وهو ما عملش حاجة
    const { data, error } = await supabase()
      .from('sbota_templates')
      .update(p)
      .eq('id', id)
      .select('id')
    if (error) {
      flash(`مقدرناش نحفظ: ${error.message}`)
      return
    }
    if (!data || (data as unknown[]).length === 0) {
      flash('مااتحفظش — القاعدة رفضت الكتابة، محتاج صلاحية sbotat.edit')
      return
    }
    await reload()
    const ok = await revalidateSite()
    flash(ok ? 'اتحفظ ✓ وبان في الموقع' : 'اتحفظ ✓ — هيبان خلال أقل من دقيقة')
  }

  async function remove(r: Row) {
    if (!confirm(`هنمسح قالب «${r.name_ar}» خالص. لو عليه مواعيد المسح هيفشل. تمام؟`)) return
    const { data, error } = await supabase()
      .from('sbota_templates')
      .delete()
      .eq('id', r.id)
      .select('id')
    if (error) {
      flash(`مقدرناش نمسح: ${error.message}`)
      return
    }
    if (!data || (data as unknown[]).length === 0) {
      flash('مااتمسحش — القاعدة رافضة المسح من القوالب')
      return
    }
    await reload()
    await revalidateSite()
    flash('القالب اتمسح ✓')
  }

  if (loading) return <Loading />

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
            دوّر في القوالب
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مثلًا: بادل"
            className="min-w-[240px] rounded-14 px-4 py-2 font-body text-16"
            style={{
              background: 'var(--surface)',
              color: 'var(--fg)',
              border: '2px solid var(--line)',
            }}
          />
        </label>

        <SelectField
          label="النوع"
          value={kind}
          onChange={setKind}
          options={[{ value: 'الكل', label: 'كل الأنواع' }, ...KINDS]}
        />

        <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
          {shown.length} من {rows.length}
        </div>

        <div className="ms-auto">
          <Btn kind="primary" onClick={() => setAdding((v) => !v)}>
            {adding ? 'اقفل' : 'قالب جديد'}
          </Btn>
        </div>
      </div>

      <p className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
        القالب مالوش «شغّال/مقفول» — اللي بيتحكم في ظهور السبوطة للناس هو حالة الموعد نفسه في
        المواعيد.
      </p>

      {flashNode}

      {adding && (
        <div className="mt-4">
          <NewTemplate
            banned={banned}
            flash={flash}
            onDone={async () => {
              setAdding(false)
              await reload()
              await revalidateSite()
            }}
          />
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3">
        {shown.length === 0 && <Empty>مفيش قالب بالفلتر ده.</Empty>}

        {shown.map((r) => {
          const open = openId === r.id
          return (
            <Card key={r.id}>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="cursor-pointer bg-transparent p-0 text-start font-display text-18 font-black"
                  style={{ color: 'var(--fg)', border: 0 }}
                >
                  {open ? '▾' : '▸'} {r.name_ar}
                </button>
                <Tag>{kindLabel(r.kind)}</Tag>
                {r.girls_only && <Tag color="#F4B4C8">بنات بس</Tag>}
                {r.is_day && <Tag>نهاري</Tag>}
                {r.overnight && <Tag>بمبيت</Tag>}
                <span className="font-body text-14" style={{ color: 'var(--muted)' }}>
                  {money(r.default_price)} · {r.duration_min} دقيقة · {r.min_group}–{r.max_group} شخص
                </span>
                <span className="ms-auto font-body text-12" style={{ color: 'var(--muted)' }}>
                  آخر تعديل {day(r.updated_at)}
                </span>
              </div>

              {open && (
                <div className="mt-4 flex flex-col gap-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <TextField
                      label="الاسم"
                      value={r.name_ar}
                      onSave={(v) => patch(r.id, { name_ar: v })}
                    />
                    <TextField
                      label="الاسم في اللينك (slug)"
                      value={r.slug}
                      hint="حروف ولاتينية وشرطات — بيبان في عنوان الصفحة."
                      onSave={(v) => patch(r.id, { slug: v })}
                    />
                  </div>

                  <TextField
                    label="الحدوتة"
                    value={r.story_ar}
                    multiline
                    hint="الكلام اللي الناس بتقراه قبل ما تحجز."
                    onSave={(v) => patch(r.id, { story_ar: v })}
                  />

                  <div className="grid gap-3 md:grid-cols-3">
                    <SelectField
                      label="النوع"
                      value={r.kind}
                      options={KINDS}
                      onChange={(v) => patch(r.id, { kind: v })}
                    />
                    <TextField
                      label="الجو (سطر قصير)"
                      value={r.mood_ar ?? ''}
                      onSave={(v) => patch(r.id, { mood_ar: v || null })}
                    />
                    <TextField
                      label="المستوى"
                      value={r.level_ar ?? ''}
                      hint="مثلًا: لأول مرة · متوسط"
                      onSave={(v) => patch(r.id, { level_ar: v || null })}
                    />
                  </div>

                  <TextField
                    label="السطر اللي فوق الاسم"
                    value={r.meta_prefix_ar ?? ''}
                    hint="مثلًا: سبوطة بادل"
                    onSave={(v) => patch(r.id, { meta_prefix_ar: v || null })}
                  />

                  <div className="grid gap-3 md:grid-cols-2">
                    <TextField
                      label="اللي داخل في السعر"
                      value={r.includes_ar.join('\n')}
                      multiline
                      hint="حاجة في كل سطر."
                      onSave={(v) => patch(r.id, { includes_ar: toList(v) })}
                    />
                    <TextField
                      label="اللي مش داخل"
                      value={r.excludes_ar.join('\n')}
                      multiline
                      hint="حاجة في كل سطر."
                      onSave={(v) => patch(r.id, { excludes_ar: toList(v) })}
                    />
                  </div>

                  <div className="flex flex-wrap gap-4">
                    <NumberField
                      label="السعر الافتراضي"
                      value={Math.round(r.default_price / 100)}
                      min={0}
                      suffix="جنيه"
                      hint="ينفع تغيّره في كل موعد لوحده."
                      onSave={(v) => patch(r.id, { default_price: Math.round(v) * 100 })}
                    />
                    <NumberField
                      label="عمولتنا"
                      value={Math.round(r.org_fee / 100)}
                      min={0}
                      suffix="جنيه"
                      onSave={(v) => patch(r.id, { org_fee: Math.round(v) * 100 })}
                    />
                    <NumberField
                      label="المدة"
                      value={r.duration_min}
                      min={15}
                      suffix="دقيقة"
                      onSave={(v) => patch(r.id, { duration_min: Math.round(v) })}
                    />
                    <NumberField
                      label="أقل عدد"
                      value={r.min_group}
                      min={2}
                      suffix="شخص"
                      hint="القاعدة مش بتقبل أقل من 2."
                      onSave={(v) => patch(r.id, { min_group: Math.round(v) })}
                    />
                    <NumberField
                      label="أكبر عدد"
                      value={r.max_group}
                      min={1}
                      suffix="شخص"
                      onSave={(v) => patch(r.id, { max_group: Math.round(v) })}
                    />
                  </div>

                  <PhotosField
                    label="صور السبوطة"
                    hint="أول صورة هي اللي بتظهر على الكارت في الرئيسية، والباقي في معرض صفحة السبوطة. JPG أو PNG أو WEBP، لحد 10 ميجا."
                    value={r.hero_photos ?? []}
                    folder={`templates/${r.id}`}
                    onSave={(next) => patch(r.id, { hero_photos: next })}
                  />

                  <div className="flex flex-wrap gap-6">
                    <Toggle
                      label="بنات بس"
                      value={r.girls_only}
                      onChange={(v) => patch(r.id, { girls_only: v })}
                    />
                    <Toggle
                      label="نهاري"
                      value={r.is_day}
                      onChange={(v) => patch(r.id, { is_day: v })}
                    />
                    <Toggle
                      label="فيها مبيت"
                      value={r.overnight}
                      onChange={(v) => patch(r.id, { overnight: v })}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <Btn kind="danger" onClick={() => remove(r)}>
                      امسح القالب
                    </Btn>
                    <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                      كل خانة بتتحفظ لوحدها أول ما تسيبها.
                    </span>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================ قالب جديد */

function NewTemplate({
  banned,
  flash,
  onDone,
}: {
  banned: string[]
  flash: (m: string) => void
  onDone: () => Promise<void>
}) {
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [story, setStory] = useState('')
  const [kind, setKind] = useState('sport')
  const [price, setPrice] = useState('300')
  const [orgFee, setOrgFee] = useState('40')
  const [duration, setDuration] = useState('120')
  const [minGroup, setMinGroup] = useState('4')
  const [maxGroup, setMaxGroup] = useState('8')
  const [busy, setBusy] = useState(false)

  async function create() {
    const n = name.trim()
    const s = (slug.trim() || slugify(n)).trim()
    const st = story.trim()
    if (!n) return flash('اكتب اسم القالب الأول')
    if (!s) return flash('محتاجين اسم في اللينك (slug)')
    if (!st) return flash('اكتب الحدوتة — دي اللي الناس بتقراها')

    const bad = bannedIn(`${n} ${st}`, banned)
    if (bad.length) return flash(`فيه كلمة ممنوعة: ${bad.join('، ')}`)

    const min = Number(minGroup)
    const max = Number(maxGroup)
    if (!(min >= 2)) return flash('أقل عدد لازم يكون 2 على الأقل')
    if (!(max >= min)) return flash('أكبر عدد لازم يكون أكبر من أقل عدد أو زيه')
    const dur = Number(duration)
    if (!(dur > 0)) return flash('المدة لازم تكون أكتر من صفر')

    setBusy(true)
    const { error } = await supabase()
      .from('sbota_templates')
      .insert({
        slug: s,
        name_ar: n,
        story_ar: st,
        kind,
        default_price: Math.round(Number(price) || 0) * 100,
        org_fee: Math.round(Number(orgFee) || 0) * 100,
        duration_min: Math.round(dur),
        min_group: Math.round(min),
        max_group: Math.round(max),
      })
    setBusy(false)

    if (error) return flash(`مقدرناش نعمل القالب: ${error.message}`)
    flash('القالب اتعمل ✓ — افتحه وكمّل باقي التفاصيل')
    await onDone()
  }

  return (
    <Card title="قالب جديد" hint="املا الأساسي دلوقتي، والباقي تكمّله من القالب نفسه بعد ما يتعمل.">
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <TextField label="الاسم" value={name} onSave={setName} />
        <TextField
          label="الاسم في اللينك (slug)"
          value={slug}
          hint="سيبه فاضي وهنعمله من الاسم."
          onSave={setSlug}
        />
      </div>

      <div className="mt-3">
        <TextField label="الحدوتة" value={story} multiline onSave={setStory} />
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <SelectField label="النوع" value={kind} options={KINDS} onChange={setKind} />
        <NumberField
          label="السعر"
          value={Number(price)}
          min={0}
          suffix="جنيه"
          onSave={(v) => setPrice(String(v))}
        />
        <NumberField
          label="عمولتنا"
          value={Number(orgFee)}
          min={0}
          suffix="جنيه"
          onSave={(v) => setOrgFee(String(v))}
        />
        <NumberField
          label="المدة"
          value={Number(duration)}
          min={15}
          suffix="دقيقة"
          onSave={(v) => setDuration(String(v))}
        />
        <NumberField
          label="أقل عدد"
          value={Number(minGroup)}
          min={2}
          onSave={(v) => setMinGroup(String(v))}
        />
        <NumberField
          label="أكبر عدد"
          value={Number(maxGroup)}
          min={1}
          onSave={(v) => setMaxGroup(String(v))}
        />
      </div>

      <div className="mt-4">
        <Btn kind="primary" onClick={create} disabled={busy}>
          {busy ? 'ثانية واحدة…' : 'اعمل القالب'}
        </Btn>
      </div>
    </Card>
  )
}
