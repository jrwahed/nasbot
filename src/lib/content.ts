import 'server-only'
import { unstable_cache, revalidateTag } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { COPY_TAG } from '@/lib/copy'
import { contentFallback, stagedPages } from '@/data/content-fallback'
import type { ContentPage } from '@/types'

/**
 * صفحات المحتوى (القواعد · الأسئلة · مين إحنا · الشروط) من القاعدة،
 * بكاش موسوم — **نفس نمط `src/lib/copy.ts` و`src/lib/flags.ts` بالحرف**.
 *
 * ليه جدول مش `copy_strings`؟ لأن ده قايمة متغيّرة الطول. المالك بيضيف
 * سؤال في «الأسئلة» من اللوحة وبيبان على الموقع من غير هجرة ولا نشر.
 *
 * التبطيل بوسمين — `content` **و** وسم النصوص `copy`. ليه الاتنين؟ لأن
 * `revalidateSite()` اللي اللوحة بتناديها بعد أي حفظ بتبطّل وسم النصوص بس،
 * فبربط المحتوى بيه كمان أي تعديل بيبان **فورًا** من غير ما نلمس المسار
 * ده. ولو النداء وقع لأي سبب، الكاش عمره 30 ثانية.
 *
 * ⚠ الاحتياطي هنا **مش** نسخة كاملة من المحتوى — هو الهيكل الأدنى علشان
 * الصفحة ما تطلعش مكسورة لو القاعدة وقعت. مصدر الحقيقة القاعدة.
 */

export const CONTENT_TAG = 'content'

interface PageRow {
  slug: string
  title_ar: string
  intro_ar: string | null
  footer_label_ar: string | null
  is_active: boolean
}

interface BlockRow {
  page_slug: string
  kind: string
  heading_ar: string | null
  body_ar: string
  tone: string | null
  ref: string | null
  sort: number
}

async function fetchContent(): Promise<Record<string, ContentPage>> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return contentFallback

  try {
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const [pages, blocks] = await Promise.all([
      db
        .from('content_pages')
        .select('slug, title_ar, intro_ar, footer_label_ar, is_active')
        .order('sort'),
      db
        .from('content_blocks')
        .select('page_slug, kind, heading_ar, body_ar, tone, ref, sort')
        .eq('is_active', true)
        .order('sort'),
    ])

    // القاعدة وقعت أو الجدول لسه ما اتلزقش → الاحتياطي، مش صفحة فاضية
    if (pages.error || !pages.data) return contentFallback

    const out: Record<string, ContentPage> = {}
    for (const p of pages.data as PageRow[]) {
      out[p.slug] = {
        slug: p.slug,
        title: p.title_ar,
        intro: p.intro_ar ?? '',
        // صفحة مقفولة = مفيش رابط في الذيل. ده اللي بيخلّي المالك يكتب
        // على راحته قبل ما الناس تشوف الصفحة.
        footerLabel: p.is_active ? (p.footer_label_ar ?? '') : '',
        blocks: [],
      }
    }

    for (const b of (blocks.data ?? []) as BlockRow[]) {
      const page = out[b.page_slug]
      if (!page) continue
      page.blocks.push({
        kind:
          b.kind === 'qa' || b.kind === 'numbered' || b.kind === 'callout'
            ? b.kind
            : 'section',
        heading: b.heading_ar ?? '',
        body: b.body_ar,
        tone: b.tone === 'cobalt' ? 'cobalt' : 'sand',
        ref: b.ref ?? '',
      })
    }

    // ⚠ الاحتياطي بيملا **الفقرات الناقصة**، مش الصفحة الناقصة بس.
    //
    //   الغلطة اللي وقعت: الشرط كان `if (!out[slug])` بس. وهجرة صفحات
    //   المحتوى بتعمل الصفحات الأربعة **من غير فقرات**، فالصفحة بتبقى
    //   موجودة وفاضية — والاحتياطي عمره ما بيشتغل. النتيجة إن /about
    //   و/faq كانوا بيقولوا «بنكتب الصفحة دي دلوقتي» والمحتوى موجود في
    //   الكود قدامنا.
    //
    //   صفحة من غير ولا فقرة **مش قرار** — القرار إن المالك يقفلها من
    //   اللوحة (`is_active`). فصفر فقرات = لسه ما اتلزقتش، والاحتياطي
    //   هو اللي بيسدّ الفرق. نفس دور `copy-fallback` بالظبط: بيملا
    //   المفاتيح الناقصة، مش الجدول الناقص بس.
    for (const [slug, fb] of Object.entries(contentFallback)) {
      if (stagedPages.has(slug)) continue
      const page = out[slug]
      if (!page) {
        out[slug] = fb
      } else if (page.blocks.length === 0 && fb.blocks.length > 0) {
        page.blocks = fb.blocks
        if (!page.intro) page.intro = fb.intro
      }
    }

    // الصفحة المسوّدة ما بيبانش ليها رابط في الذيل حتى لو القاعدة فاتحاها
    for (const slug of stagedPages) {
      if (out[slug]) out[slug].footerLabel = ''
    }
    return out
  } catch {
    return contentFallback
  }
}

export const getContent = unstable_cache(fetchContent, ['nasbot-content'], {
  tags: [CONTENT_TAG, COPY_TAG],
  revalidate: 30,
})

/** صفحة واحدة بالـslug — بترجّع null لو مش موجودة خالص */
export async function getContentPage(slug: string): Promise<ContentPage | null> {
  const all = await getContent()
  return all[slug] ?? null
}

/** بتتنادى من اللوحة بعد أي تعديل محتوى */
export function revalidateContent() {
  revalidateTag(CONTENT_TAG)
}

/** روابط الذيل — الصفحات النشطة اللي ليها اسم، بترتيبها */
export async function getFooterLinks(): Promise<Array<{ href: string; label: string }>> {
  const all = await getContent()
  return Object.values(all)
    .filter((p) => p.footerLabel)
    .map((p) => ({ href: `/${p.slug}`, label: p.footerLabel }))
}
