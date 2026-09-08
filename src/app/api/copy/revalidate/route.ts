import { NextResponse } from 'next/server'
import { revalidateCopy } from '@/lib/copy'

export const runtime = 'nodejs'

/**
 * تبطيل كاش النصوص على الطلب.
 *
 * اللوحة بتنادي revalidateCopy() على طول لأنها في نفس العملية،
 * والمسار ده للحالات اللي التعديل بيحصل فيها من بره Next —
 * زي تعديل مباشر في القاعدة أو webhook من Supabase.
 *
 * محمي بـ CRON_SECRET زي باقي مسارات الخدمة.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('x-nasbot-secret') !== secret) {
    return NextResponse.json({ error: 'مش مسموح' }, { status: 401 })
  }
  revalidateCopy()
  return NextResponse.json({ ok: true, at: new Date().toISOString() })
}
