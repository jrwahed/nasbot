import { NextResponse } from 'next/server'
import { admin } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'
// رفع صورة التحويل ممكن ياخد ثواني على نت ضعيف — الافتراضي على Hobby عشرة
export const maxDuration = 30

/**
 * شراء كارت الشغل — **تحويل يدوي بس** زي باقي الدفع في المشروع.
 *
 *   POST  → بيعمل work_passes (pending) + payments (initiated) وبيرجّع الرقم اللي يحوّل عليه.
 *   PUT   → صورة التحويل → الدفعة بتبقى pending_review والإدارة بتراجع (fn_approve_transfer).
 *
 * الكارت **ما بيتفعّلش من هنا خالص**. التفعيل في fn_activate_pass، وبيتنادى
 * من fn_approve_transfer لما الإدارة تأكد التحويل — وساعتها بس بيتحدد
 * starts_at/expires_at. مفيش طريق من المتصفح يخلي كارت active.
 *
 * السعر بيتقرا من settings على الخادم. أي رقم جاي من العميل بيتترمي.
 */

type PassKind = 'four' | 'eight'
type Method = 'vodafone_cash' | 'instapay'

/** نفس حدود دلو receipts في الهجرة 0025 */
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024
const RECEIPT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

interface WorkPriceSettings {
  work_pass4_price: number | null
  work_pass8_price: number | null
  vodafone_number: string | null
  instapay_handle: string | null
  manual_review_hours: number | null
}

async function userFromToken(req: Request) {
  const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
  if (!token) return null
  // المستخدم بيتحدد من التوكن بتاعه — مش من أي id جاي من العميل
  const { data } = await admin().auth.getUser(token)
  return data.user?.id ?? null
}

/* ============================================================ POST — طلب الكارت */

export async function POST(req: Request) {
  const uid = await userFromToken(req)
  if (!uid) return NextResponse.json({ error: 'لازم تسجل دخول' }, { status: 401 })

  let kind: PassKind
  let method: Method
  try {
    const b = await req.json()
    kind = b.kind === 'eight' ? 'eight' : 'four'
    method = b.method === 'vodafone_cash' ? 'vodafone_cash' : 'instapay'
  } catch {
    return NextResponse.json({ error: 'طلب مش مفهوم' }, { status: 400 })
  }

  const db = admin()

  // الموقع مقفول للصيانة؟ ما ياخدش فلوس وهو مقفول (A3). نفس المصدر اللي
  // fn_can_book بتقرا منه، علشان الحجز والكارت يتوقفوا مع بعض.
  const { data: maint } = await db.rpc('fn_maintenance_on')
  if (maint === true) {
    return NextResponse.json(
      { error: 'الموقع مقفول دلوقتي لشوية صيانة. ارجعلنا بعد شوية.' },
      { status: 503 }
    )
  }

  // طلب مستني قبل كده؟ ما ينفعش يتراكم كروت pending على نفس العضو —
  // الإدارة بتبص على تحويل واحد وما تعرفش هو لأنهي واحد فيهم.
  const { data: waiting } = await db
    .from('work_passes')
    .select('id')
    .eq('profile_id', uid)
    .eq('status', 'pending')
    .limit(1)
  if ((waiting ?? []).length > 0) {
    return NextResponse.json(
      { error: 'عندك طلب كارت مستني المراجعة. كمّل التحويل أو كلمنا نلغيه.' },
      { status: 409 }
    )
  }

  const { data: cfg, error: cfgErr } = await db
    .from('settings')
    .select('work_pass4_price, work_pass8_price, vodafone_number, instapay_handle, manual_review_hours')
    .single()
  if (cfgErr || !cfg) return NextResponse.json({ error: 'الإعدادات مش متاحة' }, { status: 500 })
  const s = cfg as WorkPriceSettings

  const amount = kind === 'eight' ? s.work_pass8_price : s.work_pass4_price
  if (typeof amount !== 'number' || amount <= 0) {
    return NextResponse.json({ error: 'سعر الكارت مش متظبط — كلمنا' }, { status: 500 })
  }
  const sessions = kind === 'eight' ? 8 : 4

  // الكارت pending. starts_at/expires_at بيتحددوا عند الاعتماد مش دلوقتي.
  const { data: made, error: passErr } = await db
    .from('work_passes')
    .insert({
      profile_id: uid,
      kind,
      sessions_total: sessions,
      sessions_used: 0,
      price_paid: amount,
      status: 'pending',
    })
    .select('id')
  if (passErr || !made || made.length === 0) {
    return NextResponse.json({ error: 'مقدرناش نعمل الكارت' }, { status: 500 })
  }
  const passId = (made as { id: string }[])[0].id

  const { data: pay, error: payErr } = await db
    .from('payments')
    .insert({
      booking_id: null,
      pass_id: passId,
      provider: method,
      amount,
      status: 'initiated',
      idempotency_key: `pass:${passId}`,
    })
    .select('id')
  if (payErr || !pay || pay.length === 0) {
    // مفيش دفعة = الإدارة مش هتشوف حاجة تعتمدها. نشيل الكارت بدل ما يفضل يتيم.
    await db.from('work_passes').delete().eq('id', passId)
    return NextResponse.json({ error: 'مقدرناش نبدأ الدفع' }, { status: 500 })
  }
  const paymentId = (pay as { id: string }[])[0].id

  await db.from('work_passes').update({ payment_id: paymentId }).eq('id', passId)

  await db.from('audit_log').insert({
    actor_id: uid,
    action: 'pass_requested',
    entity: 'work_passes',
    entity_id: passId,
    after: { kind, amount, method },
  })

  return NextResponse.json({
    ok: true,
    passId,
    amount,
    method,
    payTo: method === 'vodafone_cash' ? (s.vodafone_number ?? '') : (s.instapay_handle ?? ''),
    reviewHours: s.manual_review_hours ?? 24,
  })
}

/* ============================================================ PUT — صورة التحويل */

/**
 * الرفع بيحصل **هنا** مش من المتصفح: سياسة `receipts_own_write` في 0025
 * بتشترط إن أول جزء من مسار الملف يكون رقم **حجز** بتاع نفس العضو،
 * والكارت مش حجز — فرفع العميل مرفوض مهما عملنا. الهجرات 0039–0046
 * ما مدّتش السياسة دي، فالخادم هو اللي بيرفع بمفتاح الخدمة بعد ما
 * يتأكد إن الكارت كارت صاحب التوكن.
 */
export async function PUT(req: Request) {
  const uid = await userFromToken(req)
  if (!uid) return NextResponse.json({ error: 'لازم تسجل دخول' }, { status: 401 })

  let passId = ''
  let file: File | null = null
  try {
    const form = await req.formData()
    passId = String(form.get('passId') ?? '')
    const f = form.get('receipt')
    file = f instanceof File ? f : null
  } catch {
    return NextResponse.json({ error: 'طلب مش مفهوم' }, { status: 400 })
  }

  if (!passId || !file) return NextResponse.json({ error: 'ناقص بيانات' }, { status: 400 })
  if (file.size === 0 || file.size > MAX_RECEIPT_BYTES) {
    return NextResponse.json({ error: 'الصورة كبيرة — أقصى 5 ميجا' }, { status: 400 })
  }
  if (!RECEIPT_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'ابعت صورة (jpg / png / webp) أو PDF' }, { status: 400 })
  }

  const db = admin()

  const { data: wp } = await db
    .from('work_passes')
    .select('id, profile_id, status')
    .eq('id', passId)
    .maybeSingle()
  const pass = wp as { id: string; profile_id: string; status: string } | null
  if (!pass || pass.profile_id !== uid) {
    return NextResponse.json({ error: 'مش كارتك' }, { status: 403 })
  }
  if (pass.status !== 'pending') {
    return NextResponse.json({ error: 'الكارت ده مش مستني تحويل' }, { status: 400 })
  }

  const safeName = (file.name || 'receipt').replace(/[^\w.-]/g, '_').slice(-60)
  const path = `pass/${passId}/${Date.now()}-${safeName}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: upErr } = await db.storage
    .from('receipts')
    .upload(path, bytes, { contentType: file.type, upsert: false })
  if (upErr) return NextResponse.json({ error: 'الصورة مترفعتش. جرب تاني.' }, { status: 500 })

  const { data: updated, error } = await db
    .from('payments')
    .update({ receipt_path: path, status: 'pending_review' })
    .eq('pass_id', passId)
    .in('provider', ['instapay', 'vodafone_cash'])
    .select('id')
  if (error || !updated || updated.length === 0) {
    return NextResponse.json({ error: 'مقدرناش نسجل التحويل' }, { status: 500 })
  }

  await db.from('notifications').insert({
    profile_id: uid,
    channel: 'whatsapp',
    template_key: 'transfer_received',
    payload: { pass_id: passId },
  })

  await db.from('audit_log').insert({
    actor_id: uid,
    action: 'transfer_submitted',
    entity: 'work_passes',
    entity_id: passId,
  })

  return NextResponse.json({ ok: true })
}
