'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * عميل المتصفح — بيستخدم المفتاح العام بس.
 * الحماية كلها من سياسات الصفوف (RLS) في القاعدة، مش من إخفاء المفتاح.
 * ممنوع مفتاح الخدمة يوصل هنا.
 */
let client: ReturnType<typeof createBrowserClient> | null = null

export function supabase() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return client
}

/** هل الاتصال متظبط أصلًا؟ لو لأ بنرجع للبيانات الوهمية بدل ما الموقع يقع. */
export const hasSupabase = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

/** الدلو العام لصور السبوطات والكباتن — قراية للكل، والكتابة بصلاحية sbotat.edit */
export const PUBLIC_MEDIA_BUCKET = 'public-media'

/**
 * مسار جوه `public-media` → رابط كامل.
 *
 * بنخزّن **المسار** في القاعدة مش الرابط، علشان لو عنوان المشروع اتغيّر
 * الصور ما تقعش. الرابط بيتبني هنا من متغيّر البيئة.
 *
 * بترجّع null لو القيمة مش مسار صورة — القيم القديمة في `hero_photos` عبارة
 * عن أوصاف بين قوسين مربعين زي «[صورة المجموعة الحقيقية — شوي في وادي دجلة]»،
 * ودي نص بيتعرض مكان الصورة مش ملف.
 */
export function publicMediaUrl(pathOrUrl?: string | null): string | null {
  const v = (pathOrUrl ?? '').trim()
  if (!v) return null
  // وصف مكان الصورة، مش ملف
  if (v.startsWith('[')) return null
  // اترفعت بنسخة قديمة كانت بتخزّن الرابط كامل — بنسيبها زي ما هي
  if (/^https?:\/\//i.test(v)) return v
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!base) return null
  return `${base.replace(/\/+$/, '')}/storage/v1/object/public/${PUBLIC_MEDIA_BUCKET}/${v
    .replace(/^\/+/, '')
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`
}
