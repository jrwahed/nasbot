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
