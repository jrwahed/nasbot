import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'
import { admin } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'

/**
 * الحجز والدفع — **يدوي بس**.
 *
 * المستخدم بيحوّل على فودافون كاش أو إنستا باي وبيرفع صورة التحويل،
 * والحجز بيفضل `pending_payment` والدفعة `pending_review` لحد ما الإدارة تأكد
 * (عبر `fn_approve_transfer`). محدش بيبقى `paid` من المتصفح.
 *
 * مفيش بوابة ومفيش رقم بطاقة بيعدي علينا خالص.
 */

type Method = 'vodafone_cash' | 'instapay'

export async function POST(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'لازم تسجل دخول' }, { status: 401 })

  // المستخدم بيتحدد من التوكن بتاعه — مش من أي id جاي من العميل
  const asUser = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { authorization: `Bearer ${token}` } } }
  )
  const { data: auth } = await asUser.auth.getUser(token)
  const uid = auth.user?.id
  if (!uid) return NextResponse.json({ error: 'لازم تسجل دخول' }, { status: 401 })

  let slug: string
  let method: Method
  let referralCode: string | undefined
  let useWallet: boolean
  try {
    const b = await req.json()
    slug = String(b.slug)
    method = b.method === 'vodafone_cash' ? 'vodafone_cash' : 'instapay'
    referralCode = b.referralCode ? String(b.referralCode).trim().toUpperCase() : undefined
    useWallet = Boolean(b.useWallet)
  } catch {
    return NextResponse.json({ error: 'طلب مش مفهوم' }, { status: 400 })
  }

  const db = admin()

  const { data: sb } = await db
    .from('sbotat_public')
    .select('id, price')
    .eq('slug', slug)
    .order('starts_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!sb) return NextResponse.json({ error: 'السبوطة دي مش موجودة' }, { status: 404 })
  const sbota = sb as { id: string; price: number }

  // كل قواعد الحجز في القاعدة — مش بنكررها هنا
  const { data: blocked } = await db.rpc('fn_can_book', { p_id: uid, s_id: sbota.id })
  if (blocked) return NextResponse.json({ error: blocked }, { status: 400 })

  const { data: cfg } = await db.from('settings').select('*').single()
  const s = cfg as {
    referral_discount_pct: number
    vodafone_number: string
    instapay_handle: string
    manual_review_hours: number
  }

  const { data: prof } = await db
    .from('profiles').select('wallet_balance').eq('id', uid).maybeSingle()

  // ===== الحساب =====
  let amount = sbota.price
  let discount = 0

  if (referralCode) {
    const { data: owner } = await db
      .from('profiles').select('id').eq('referral_code', referralCode).neq('id', uid).maybeSingle()
    if (owner) {
      discount = Math.round((amount * s.referral_discount_pct) / 100)
    } else {
      const { data: c } = await db
        .from('coupons')
        .select('kind, value, expires_at, max_uses, used_count')
        .eq('code', referralCode).maybeSingle()
      const cp = c as {
        kind: string; value: number; expires_at: string | null
        max_uses: number | null; used_count: number
      } | null
      if (
        cp &&
        (!cp.expires_at || new Date(cp.expires_at) > new Date()) &&
        (cp.max_uses === null || cp.used_count < cp.max_uses)
      ) {
        discount = cp.kind === 'percent' ? Math.round((amount * cp.value) / 100) : cp.value
      }
    }
  }
  amount = Math.max(0, amount - discount)

  const walletUsed = useWallet
    ? Math.min((prof as { wallet_balance: number } | null)?.wallet_balance ?? 0, amount)
    : 0
  amount -= walletUsed

  // ===== الحجز المبدئي — مهلته ساعة علشان يحوّل ويرفع =====
  const { data: booking, error: bErr } = await db
    .from('bookings')
    .upsert(
      {
        sbota_id: sbota.id,
        profile_id: uid,
        status: 'pending_payment',
        price_paid: sbota.price - discount,
        discount,
        wallet_used: walletUsed,
        referral_code_used: referralCode ?? null,
        expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
      },
      { onConflict: 'sbota_id,profile_id' }
    )
    .select('id')
    .single()

  if (bErr || !booking) {
    return NextResponse.json({ error: 'مقدرناش نعمل الحجز' }, { status: 500 })
  }
  const bookingId = (booking as { id: string }).id

  // الرصيد غطّى الحجز كله — مفيش تحويل أصلًا
  if (amount === 0) {
    await db.from('payments').insert({
      booking_id: bookingId, provider: 'wallet', amount: 0,
      status: 'succeeded', idempotency_key: randomUUID(),
    })
    await db.from('bookings').update({ status: 'paid', expires_at: null }).eq('id', bookingId)
    return NextResponse.json({ ok: true, bookingId, paid: true, amount: 0 })
  }

  // دفعة يدوية مستنية التحويل
  await db
    .from('payments')
    .upsert(
      {
        booking_id: bookingId,
        provider: method,
        amount,
        status: 'initiated',
        idempotency_key: `manual:${bookingId}`,
      },
      { onConflict: 'idempotency_key' }
    )

  return NextResponse.json({
    ok: true,
    bookingId,
    amount,
    manual: true,
    method,
    payTo: method === 'vodafone_cash' ? s.vodafone_number : s.instapay_handle,
    reviewHours: s.manual_review_hours,
  })
}
