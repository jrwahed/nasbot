import 'server-only'
import { unstable_cache, revalidateTag } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { flagsFallback, type FlagMap } from '@/data/flags-fallback'
import { COPY_TAG } from '@/lib/copy'

/**
 * قراءة `feature_flags` من القاعدة بكاش موسوم — **نفس نمط `src/lib/copy.ts`
 * بالحرف** (مراجعة A2).
 *
 * قبل كده الجدول ده كان بيتعدّل من `/admin/settings` ومحدش بيقراه في الموقع:
 * المالك يقفل «الحجز» ويشوف «اتحفظ ✓» والحجز مفتوح. دلوقتي المفاتيح بتتحمّل
 * مرة واحدة في `src/app/layout.tsx` وبتتمرر لمزوّد عميل زي النصوص بالظبط.
 *
 * التبطيل: الوسم `flags` **و** وسم النصوص `copy` مع بعض. ليه الاتنين؟ لأن
 * `/api/admin/revalidate` (اللي `revalidateSite()` بتناديه بعد أي حفظ في
 * اللوحة) بيبطّل وسم النصوص بس — فبربط المفاتيح بيه كمان، قفل أي ميزة بيبان
 * **فورًا** من غير ما نلمس المسار. ولو النداء ده وقع لأي سبب، الكاش نفسه
 * عمره 20 ثانية فأقصى تأخير أقل من نص دقيقة.
 *
 * القاعدة الحاكمة: **الاحتياطي مفتوح**. قراءة وقعت = الموقع شغّال، مش مقفول.
 */

export const FLAGS_TAG = 'flags'

interface FlagRow {
  key: string
  is_on: boolean
  off_message_ar: string | null
}

async function fetchFlags(): Promise<FlagMap> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return flagsFallback

  try {
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await db
      .from('feature_flags')
      .select('key, is_on, off_message_ar')
    if (error || !data) return flagsFallback

    const map: FlagMap = { ...flagsFallback }
    for (const row of data as FlagRow[]) {
      map[row.key] = {
        on: Boolean(row.is_on),
        off: row.off_message_ar?.trim() || (flagsFallback[row.key]?.off ?? ''),
      }
    }
    return map
  } catch {
    return flagsFallback
  }
}

export const getFlags = unstable_cache(fetchFlags, ['nasbot-flags'], {
  tags: [FLAGS_TAG, COPY_TAG],
  revalidate: 20,
})

/** موجودة للاكتمال — اللوحة بتنادي revalidateSite() اللي بيبطّل COPY_TAG. */
export function revalidateFlags() {
  revalidateTag(FLAGS_TAG)
}
