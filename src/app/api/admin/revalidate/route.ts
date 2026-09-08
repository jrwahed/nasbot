import { NextResponse } from 'next/server'
import { admin } from '@/lib/server/supabase-admin'
import { revalidateCopy } from '@/lib/copy'

export const runtime = 'nodejs'

/**
 * اللوحة بتنادي المسار ده بعد أي حفظ نصوص علشان التغيير يبان على طول.
 *
 * الصلاحية بتتأكد من توكن الجلسة نفسه — مش من أي حاجة جاية من المتصفح.
 * حتى من غير النداء ده التغيير بيبان خلال 30 ثانية لوحده (revalidate في lib/copy).
 */
export async function POST(req: Request) {
  const auth = req.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  if (!token) return NextResponse.json({ error: 'مش مسموح' }, { status: 401 })

  const db = admin()
  const { data: user, error } = await db.auth.getUser(token)
  if (error || !user.user) {
    return NextResponse.json({ error: 'مش مسموح' }, { status: 401 })
  }

  const { data: row } = await db
    .from('admin_users')
    .select('role_key, is_active')
    .eq('profile_id', user.user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'مش مسموح' }, { status: 403 })

  revalidateCopy()
  return NextResponse.json({ ok: true })
}
