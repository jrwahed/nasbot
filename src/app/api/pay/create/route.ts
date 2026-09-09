import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { isPlaceholderPayTo, PAY_TO_MISSING } from '@/lib/server/pay-guard'
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
/** اختيار الدفع لسبوطة الشغل — `pass` بيتضاف في المرحلة 3 (fn_redeem_pass) */
type PayWith = 'single' | 'first_time'

export async function POST(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'لازم تسجل دخول' }, { status: 401 })

  // المستخدم بيتحدد من التوكن بتاعه — مش من أي id جاي من العميل
  const { data: auth } = await admin().auth.getUser(token)
  const uid = auth.user?.id
  if (!uid) return NextResponse.json({ error: 'لازم تسجل دخول' }, { status: 401 })

  let slug: string
  let method: Method
  let referralCode: string | undefined
  let useWallet: boolean
  let payWith: PayWith | undefined
  try {
    const b = await req.json()
    slug = String(b.slug)
    method = b.method === 'vodafone_cash' ? 'vodafone_cash' : 'instapay'
    referralCode = b.referralCode ? String(b.referralCode).trim().toUpperCase() : undefined
    useWallet = Boolean(b.useWallet)
    payWith = b.payWith === 'first_time' ? 'first_time' : b.payWith === 'single' ? 'single' : undefined
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
    work_single_price?: number | null
    work_first_time_price?: number | null
  }

  /**
   * وجهة التحويل لسه القيمة الوهمية اللي بتيجي مع القاعدة؟
   * نرفض **قبل** ما نعمل أي حجز — بدل ما العضو يبعت فلوسه لرقم مش بتاعنا،
   * وبدل ما نسيب حجز معلّق ورانا. (شوف src/lib/server/pay-guard.ts)
   */
  const payTo = method === 'vodafone_cash' ? s.vodafone_number : s.instapay_handle
  if (isPlaceholderPayTo(payTo)) {
    return NextResponse.json({ error: PAY_TO_MISSING }, { status: 503 })
  }

  const { data: prof } = await db
    .from('profiles').select('wallet_balance').eq('id', uid).maybeSingle()

  // الحجز الموجود (لو العضو رجع يغيّر طريقة الدفع/الكوبون) — علشان ما نحرقش
  // استخدام كوبون مرتين على نفس الحجز
  const { data: existingBooking } = await db
    .from('bookings')
    .select('id, referral_code_used')
    .eq('sbota_id', sbota.id)
    .eq('profile_id', uid)
    .maybeSingle()
  const prevCode = (existingBooking as { referral_code_used: string | null } | null)?.referral_code_used ?? null

  // ===== سبوطة الشغل: السعر من settings.work_* حسب الاختيار =====
  // بنسأل الجدول نفسه مش العرض — لو العمود لسه مش موجود بنعتبرها مش شغل ومفيش كسر.
  let isWork = false
  if (payWith) {
    const { data: w, error: wErr } = await db.from('sbotat').select('is_work').eq('id', sbota.id).maybeSingle()
    isWork = !wErr && Boolean((w as { is_work?: boolean } | null)?.is_work)
  }
  let basePrice = sbota.price
  if (isWork && payWith === 'first_time') {
    // إعادة تحقق على الخادم: العرض لأول حجز شغل بس — مش بنثق في العميل
    const { data: prior } = await db
      .from('bookings')
      .select('id, sbotat!inner(is_work)')
      .eq('profile_id', uid)
      .eq('sbotat.is_work', true)
      .in('status', ['paid', 'attended'])
      .limit(1)
    if ((prior ?? []).length > 0) {
      return NextResponse.json({ error: 'عرض أول مرة لأول سبوطة شغل بس — اختار «أنا جاي»' }, { status: 400 })
    }
    if (typeof s.work_first_time_price === 'number') basePrice = s.work_first_time_price
  } else if (isWork && payWith === 'single') {
    if (typeof s.work_single_price === 'number') basePrice = s.work_single_price
  }

  // ===== الحساب =====
  let amount = basePrice
  let discount = 0
  // الكوبون اللي اتطبّق فعلًا (لو فيه) — بنحجز استخدامه ذرّيًا قبل ما نثبّت الحجز
  let appliedCoupon: { id: string; used_count: number } | null = null

  if (referralCode) {
    const { data: owner } = await db
      .from('profiles').select('id').eq('referral_code', referralCode).neq('id', uid).maybeSingle()
    if (owner) {
      discount = Math.round((amount * s.referral_discount_pct) / 100)
    } else {
      const { data: c } = await db
        .from('coupons')
        .select('id, kind, value, expires_at, max_uses, used_count, first_booking_only')
        .eq('code', referralCode).maybeSingle()
      const cp = c as {
        id: string; kind: string; value: number; expires_at: string | null
        max_uses: number | null; used_count: number; first_booking_only: boolean
      } | null
      if (cp) {
        // منتهي؟
        if (cp.expires_at && new Date(cp.expires_at) <= new Date()) {
          return NextResponse.json({ error: 'الكوبون ده خلصت مدته' }, { status: 400 })
        }
        // اتستخدم بالكامل؟
        if (cp.max_uses !== null && cp.used_count >= cp.max_uses) {
          return NextResponse.json({ error: 'الكوبون ده خلص عدد مرات استخدامه' }, { status: 400 })
        }
        // لأول حجز بس؟ نتأكد إن العضو ماعندوش حجز مدفوع/حاضر قبل كده (D3)
        if (cp.first_booking_only) {
          const { data: paidBefore } = await db
            .from('bookings')
            .select('id')
            .eq('profile_id', uid)
            .in('status', ['paid', 'attended'])
            .limit(1)
          if ((paidBefore ?? []).length > 0) {
            return NextResponse.json({ error: 'الكوبون ده لأول حجز بس' }, { status: 400 })
          }
        }
        discount = cp.kind === 'percent' ? Math.round((amount * cp.value) / 100) : cp.value
        appliedCoupon = { id: cp.id, used_count: cp.used_count }
      }
    }
  }
  amount = Math.max(0, amount - discount)

  const walletUsed = useWallet
    ? Math.min((prof as { wallet_balance: number } | null)?.wallet_balance ?? 0, amount)
    : 0
  amount -= walletUsed

  // ===== حجز استخدام الكوبون (D2) — ذرّي بـ compare-and-swap =====
  // بنزوّد used_count بس لو الكوبون لسه على نفس القيمة اللي قريناها. لو طلب تاني
  // متوازي سبقنا، الـ update بيطابق صفر صفوف → الكوبون خلص، بنرفض قبل ما نثبّت.
  // بنحجز مرة واحدة بس لكل حجز: لو الحجز موجود بنفس الكود يبقى محجوز خلاص.
  let reservedCouponId: string | null = null
  if (appliedCoupon && prevCode !== referralCode) {
    const { data: bumped } = await db
      .from('coupons')
      .update({ used_count: appliedCoupon.used_count + 1 })
      .eq('id', appliedCoupon.id)
      .eq('used_count', appliedCoupon.used_count)
      .select('id')
      .maybeSingle()
    if (!bumped) {
      return NextResponse.json({ error: 'الكوبون ده خلص عدد مرات استخدامه' }, { status: 400 })
    }
    reservedCouponId = appliedCoupon.id
  }

  // ===== الحجز المبدئي — مهلته ساعة علشان يحوّل ويرفع =====
  // price_paid = الكاش اللي اتدفع فعلًا (بعد خصم الرصيد) — مش السعر قبل المحفظة.
  // fn_cancel_booking بيرجّع price_paid كاش، فلازم يساوي الكاش بالظبط (D1).
  // جزء المحفظة متسجّل في wallet_used (واتخصم من wallet_ledger في fn_booking_paid).
  const { data: booking, error: bErr } = await db
    .from('bookings')
    .upsert(
      {
        sbota_id: sbota.id,
        profile_id: uid,
        status: 'pending_payment',
        price_paid: amount,
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
    // فشل الحجز — نرجّع حجز الكوبون اللي كنا زوّدناه (CAS عكسي)
    if (reservedCouponId && appliedCoupon) {
      await db
        .from('coupons')
        .update({ used_count: appliedCoupon.used_count })
        .eq('id', reservedCouponId)
        .eq('used_count', appliedCoupon.used_count + 1)
    }
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
    payTo,
    reviewHours: s.manual_review_hours,
  })
}
