'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { revalidateSite, rejected } from '@/lib/admin'
import {
  Card,
  Section,
  Btn,
  TextField,
  SelectField,
  Toggle,
  Empty,
  Loading,
  useFlash,
} from '@/components/admin-ui'

/**
 * محرّر صفحات الموقع — القواعد · الأسئلة · مين إحنا · الشروط.
 *
 * قبل كده الأربع روابط دي كانوا **أربعتهم بيروحوا `/rules`**، ومحتوى
 * القواعد نفسه كان متحطوط في `src/data/lists.ts` يعني مش قابل للتعديل.
 * دلوقتي كل صفحة ليها فقرات في `content_blocks`، وبتتضاف وتتمسح وتترتّب
 * من هنا من غير هجرة ولا نشر.
 *
 * ⚠ كل كتابة ورا `rejected()`: مصفوفة فاضية معناها **القاعدة رفضت**، مش
 * نجاح. من غير الحارس ده الصفحة بتقول «اتحفظ ✓» وهي بتكدب (نمط §٧).
 */

interface PageRow {
  slug: string
  title_ar: string
  intro_ar: string | null
  footer_label_ar: string | null
  is_active: boolean
  sort: number
}

interface BlockRow {
  id: string
  page_slug: string
  kind: string
  heading_ar: string | null
  body_ar: string
  tone: string | null
  sort: number
  is_active: boolean
}

const KINDS = [
  { value: 'section', label: 'عنوان ونص' },
  { value: 'qa', label: 'سؤال وجواب' },
  { value: 'numbered', label: 'كرت مرقّم' },
  { value: 'callout', label: 'صندوق ملوّن' },
]

const TONES = [
  { value: 'sand', label: 'رملي' },
  { value: 'cobalt', label: 'كوبالت' },
]

export function PagesEditor() {
  const [pages, setPages] = useState<PageRow[]>([])
  const [blocks, setBlocks] = useState<BlockRow[]>([])
  const [slug, setSlug] = useState('rules')
  const [loading, setLoading] = useState(true)
  const { flash, node: flashNode } = useFlash()

  const load = useCallback(async () => {
    const db = supabase()
    const [p, b] = await Promise.all([
      db.from('content_pages').select('*').order('sort'),
      db.from('content_blocks').select('*').order('sort'),
    ])
    setPages((p.data ?? []) as PageRow[])
    setBlocks((b.data ?? []) as BlockRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const page = pages.find((x) => x.slug === slug) ?? null
  const mine = blocks.filter((b) => b.page_slug === slug)

  /** أي كتابة بتعدّي من هنا — الحارس في مكان واحد بس */
  async function write(
    run: () => PromiseLike<{ data: unknown; error: { message: string } | null }>,
    note: string
  ) {
    const { data, error } = await run()
    if (error) {
      flash(`مقدرناش نحفظ: ${error.message}`)
      return false
    }
    if (rejected(data)) {
      flash('مااتحفظش — مالكش صلاحية content.edit')
      return false
    }
    await load()
    await revalidateSite()
    flash(note)
    return true
  }

  function savePage(patch: Partial<PageRow>) {
    return write(
      () => supabase().from('content_pages').update(patch).eq('slug', slug).select('slug'),
      'اتحفظ ✓'
    )
  }

  function saveBlock(id: string, patch: Partial<BlockRow>) {
    return write(
      () => supabase().from('content_blocks').update(patch).eq('id', id).select('id'),
      'اتحفظ ✓'
    )
  }

  function addBlock() {
    const next = mine.length ? Math.max(...mine.map((b) => b.sort)) + 1 : 1
    return write(
      () =>
        supabase()
          .from('content_blocks')
          .insert({
            page_slug: slug,
            kind: slug === 'faq' ? 'qa' : 'section',
            heading_ar: '',
            body_ar: '',
            sort: next,
            is_active: false,
          })
          .select('id'),
      'فقرة جديدة اتضافت — مقفولة لحد ما تكتبها وتفتحها'
    )
  }

  function removeBlock(id: string) {
    return write(
      () => supabase().from('content_blocks').delete().eq('id', id).select('id'),
      'الفقرة اتمسحت'
    )
  }

  /** بيبدّل ترتيب فقرتين — أبسط من إعادة ترقيم القايمة كلها */
  async function move(i: number, dir: -1 | 1) {
    const a = mine[i]
    const b = mine[i + dir]
    if (!a || !b) return
    const okA = await write(
      () => supabase().from('content_blocks').update({ sort: b.sort }).eq('id', a.id).select('id'),
      'الترتيب اتغيّر'
    )
    if (!okA) return
    await write(
      () => supabase().from('content_blocks').update({ sort: a.sort }).eq('id', b.id).select('id'),
      'الترتيب اتغيّر'
    )
  }

  if (loading) return <Loading />

  return (
    <div className="mt-6">
      {flashNode}

      <div className="nb-scroll-x gap-2">
        {pages.map((p) => {
          const on = p.slug === slug
          return (
            <button
              key={p.slug}
              type="button"
              onClick={() => setSlug(p.slug)}
              aria-pressed={on}
              className="cursor-pointer whitespace-nowrap rounded-pill px-4 py-2 font-display text-15 font-black"
              style={{
                background: on ? 'var(--fg)' : 'transparent',
                color: on ? 'var(--bg)' : 'var(--fg)',
                border: `2px solid ${on ? 'var(--fg)' : 'var(--chip-idle-border)'}`,
              }}
            >
              {p.footer_label_ar || p.slug}
              {!p.is_active && ' (مقفولة)'}
            </button>
          )
        })}
      </div>

      {!page ? (
        <Empty>
          الصفحات مش موجودة في القاعدة. الزق WORK_MIGRATION_9.sql الأول.
        </Empty>
      ) : (
        <>
          <Section title={`الصفحة — /${page.slug}`}>
            <Card hint="العنوان والمقدمة بيظهروا فوق الصفحة. اسم الرابط هو اللي بيتكتب في ذيل الموقع.">
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <TextField
                  label="عنوان الصفحة"
                  value={page.title_ar}
                  onSave={(v) => savePage({ title_ar: v })}
                />
                <TextField
                  label="اسم الرابط في الذيل"
                  value={page.footer_label_ar ?? ''}
                  hint="سيبه فاضي والرابط هيختفي من الذيل"
                  onSave={(v) => savePage({ footer_label_ar: v })}
                />
                <TextField
                  label="المقدمة"
                  multiline
                  value={page.intro_ar ?? ''}
                  onSave={(v) => savePage({ intro_ar: v })}
                />
                <Toggle
                  label="الصفحة مفتوحة للناس"
                  value={page.is_active}
                  onChange={(v) => savePage({ is_active: v })}
                  hint="مقفولة = الرابط بيختفي من الذيل، واللي يفتح المسار بيلاقي «بنكتبها دلوقتي»"
                />
              </div>
            </Card>
          </Section>

          <Section title={`الفقرات (${mine.length})`}>
            <Card hint="الترتيب من فوق لتحت. الفقرة المقفولة مش بتظهر للناس — اكتبها الأول وبعدين افتحها.">
              <div className="mt-3 flex flex-col gap-4">
                {mine.length === 0 && (
                  <div className="font-body text-15" style={{ color: 'var(--muted)' }}>
                    مفيش فقرات لسه. دوس «ضيف فقرة».
                  </div>
                )}

                {mine.map((b, i) => (
                  <div
                    key={b.id}
                    className="rounded-16 p-4"
                    style={{
                      background: 'var(--bg)',
                      border: '2px solid var(--line)',
                      opacity: b.is_active ? 1 : 0.6,
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-16 font-black">{i + 1}</span>
                      <div className="ms-auto flex flex-wrap gap-1">
                        <Btn onClick={() => move(i, -1)} disabled={i === 0}>
                          فوق
                        </Btn>
                        <Btn onClick={() => move(i, 1)} disabled={i === mine.length - 1}>
                          تحت
                        </Btn>
                        <Btn kind="danger" onClick={() => removeBlock(b.id)}>
                          امسح
                        </Btn>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <SelectField
                        label="النوع"
                        value={b.kind}
                        options={KINDS}
                        onChange={(v) => saveBlock(b.id, { kind: v })}
                      />
                      {b.kind === 'callout' && (
                        <SelectField
                          label="اللون"
                          value={b.tone ?? 'sand'}
                          options={TONES}
                          onChange={(v) => saveBlock(b.id, { tone: v })}
                        />
                      )}
                      <TextField
                        label={b.kind === 'qa' ? 'السؤال' : 'العنوان'}
                        value={b.heading_ar ?? ''}
                        onSave={(v) => saveBlock(b.id, { heading_ar: v })}
                      />
                      <Toggle
                        label="ظاهرة للناس"
                        value={b.is_active}
                        onChange={(v) => saveBlock(b.id, { is_active: v })}
                      />
                    </div>

                    <div className="mt-4">
                      <TextField
                        label={b.kind === 'qa' ? 'الجواب' : 'النص'}
                        multiline
                        value={b.body_ar}
                        onSave={(v) => saveBlock(b.id, { body_ar: v })}
                      />
                    </div>
                  </div>
                ))}

                <div>
                  <Btn kind="primary" onClick={addBlock}>
                    ضيف فقرة
                  </Btn>
                </div>
              </div>
            </Card>
          </Section>
        </>
      )}
    </div>
  )
}
