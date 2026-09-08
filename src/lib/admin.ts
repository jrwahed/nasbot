'use client'

import { supabase, hasSupabase } from '@/lib/supabase'

/**
 * أدوات اللوحة المشتركة.
 *
 * الحماية الحقيقية في RLS: كل جدول بيتحقق من fn_has_permission بنفسه،
 * فحتى لو حد فتح الصفحة بالعافية مش هيقدر يقرا ولا يكتب حاجة.
 * اللي هنا للواجهة بس — نخفي اللي هو أصلًا ممنوع منه.
 */

export interface AdminMe {
  isAdmin: boolean
  roleKey: string | null
  permissions: Set<string>
}

export const NO_ADMIN: AdminMe = { isAdmin: false, roleKey: null, permissions: new Set() }

export async function loadAdminMe(): Promise<AdminMe> {
  if (!hasSupabase) return NO_ADMIN

  const db = supabase()
  const { data: auth } = await db.auth.getUser()
  if (!auth.user) return NO_ADMIN

  const { data: row } = await db
    .from('admin_users')
    .select('role_key')
    .eq('profile_id', auth.user.id)
    .eq('is_active', true)
    .maybeSingle()

  const roleKey = (row as { role_key: string } | null)?.role_key ?? null
  if (!roleKey) return NO_ADMIN

  const { data: perms } = await db
    .from('role_permissions')
    .select('permission_key')
    .eq('role_key', roleKey)

  return {
    isAdmin: true,
    roleKey,
    permissions: new Set(
      ((perms ?? []) as { permission_key: string }[]).map((p) => p.permission_key)
    ),
  }
}

/** بتخلي الموقع يقرا النصوص الجديدة على طول بدل ما يستنى المهلة */
export async function revalidateSite(): Promise<boolean> {
  if (!hasSupabase) return false
  const { data } = await supabase().auth.getSession()
  const token = data.session?.access_token
  if (!token) return false
  try {
    const res = await fetch('/api/admin/revalidate', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
    })
    return res.ok
  } catch {
    return false
  }
}

/** الكلمات الممنوعة — بتتقرا من القاعدة وبتتعدّل من اللوحة */
export async function loadBannedWords(): Promise<string[]> {
  if (!hasSupabase) return []
  const { data } = await supabase().from('banned_words').select('word')
  return ((data ?? []) as { word: string }[]).map((r) => r.word)
}

/** بترجّع الكلمات الممنوعة اللي في النص — فاضية يعني تمام */
export function bannedIn(text: string, words: string[]): string[] {
  const low = text.toLowerCase()
  return words.filter((w) => w && low.includes(w.toLowerCase()))
}
