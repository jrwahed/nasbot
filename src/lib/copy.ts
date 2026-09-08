import 'server-only'
import { unstable_cache, revalidateTag } from 'next/cache'
import { createClient } from '@supabase/supabase-js'
import { copyFallback } from '@/data/copy-fallback'

/**
 * قراءة نصوص الموقع من القاعدة مع كاش بوسم.
 * أي حفظ في اللوحة بينادي revalidateCopy() فالتغيير يبان خلال ثواني
 * من غير نشر جديد.
 *
 * لو القاعدة مش متاحة أو النص ناقص، بنرجع لـ copy-fallback.ts
 * (المتولّد من سكريبت الترحيل) — فالموقع يفضل عربي سليم في كل الأحوال.
 */

export type CopyMap = Record<string, string>

export const COPY_TAG = 'copy'

async function fetchCopy(): Promise<CopyMap> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return copyFallback

  try {
    const db = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data, error } = await db.from('copy_strings').select('key, value_ar')
    if (error || !data) return copyFallback

    const map: CopyMap = { ...copyFallback }
    for (const row of data as { key: string; value_ar: string }[]) {
      map[row.key] = row.value_ar
    }
    return map
  } catch {
    return copyFallback
  }
}

/** بيتكاش بوسم `copy` — بيتبطّل عند أي حفظ في اللوحة */
export const getCopy = unstable_cache(fetchCopy, ['nasbot-copy'], {
  tags: [COPY_TAG],
  // أقصى تأخير لو التبطيل ما وصلش لأي سبب — تحت الدقيقة زي المطلوب
  revalidate: 30,
})

/** بتتنادى من اللوحة بعد أي تعديل نص */
export function revalidateCopy() {
  revalidateTag(COPY_TAG)
}
