import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { admin } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'

/**
 * تسجيل صورة التحويل — الحجز بيروح لمراجعة الإدارة.
 * ما بيخليش الحجز paid: ده بيحصل بس في fn_approve_transfer.
 */
export async function POST(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'لازم تسجل دخول' }, { status: 401 })

  const asUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { authorization: `Bearer ${token}` } } }
  )
  const { data: auth } = await asUser.auth.getUser()
  const uid = auth.user?.id
  if (!uid) return NextResponse.json({ error: 'لازم تسجل دخول' }, { status: 401 })

  const { bookingId, receiptPath } = await req.json()
  if (!bookingId || !receiptPath) {
    return NextResponse.json({ error: 'ناقص بيانات' }, { status: 400 })
  }

  const db = admin()

  const { data: bk } = await db
    .from('bookings').select('id, profile_id, sbota_id').eq('id', bookingId).maybeSingle()
  if (!bk || (bk as { profile_id: string }).profile_id !== uid) {
    return NextResponse.json({ error: 'مش حجزك' }, { status: 403 })
  }

  const { error } = await db
    .from('payments')
    .update({ receipt_path: receiptPath, status: 'pending_review' })
    .eq('booking_id', bookingId)
    .in('provider', ['instapay', 'vodafone_cash'])

  if (error) return NextResponse.json({ error: 'مقدرناش نسجل التحويل' }, { status: 500 })

  // مهلة أطول دلوقتي — في مراجعة بشرية
  await db
    .from('bookings')
    .update({ expires_at: new Date(Date.now() + 24 * 3600_000).toISOString() })
    .eq('id', bookingId)

  await db.from('notifications').insert({
    profile_id: uid,
    channel: 'whatsapp',
    template_key: 'transfer_received',
    payload: { booking_id: bookingId },
  })

  await db.from('audit_log').insert({
    actor_id: uid, action: 'transfer_submitted', entity: 'bookings', entity_id: bookingId,
  })

  return NextResponse.json({ ok: true })
}
