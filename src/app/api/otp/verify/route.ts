import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { admin, normalizePhone } from '@/lib/server/supabase-admin'
import { codeHash, resolveEmail, otpLimits, rateOk, ipKey } from '@/lib/server/otp'
import type { SupabaseClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

/**
 * الطريق القديم — بيتنادى بس لو fn_otp_try مش موجودة (الهجرة 0070 لسه ما
 * اتلزقتش). فيه سباق معروف تحت الضغط، وموجود هنا علشان النشر ما يقفلش
 * الدخول قبل ما القاعدة تتحدّث. يتشال بعد ما 0070 تتطبّق.
 */
async function legacyOtpTry(
  db: SupabaseClient,
  phone: string,
  hash: string,
  maxAttempts: number
): Promise<string> {
  const { data: row } = await db
    .from('otp_codes')
    .select('id, code_hash, expires_at, attempts, consumed_at')
    .eq('phone', phone)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!row) return 'none'
  const r = row as { id: string; code_hash: string; expires_at: string; attempts: number }

  if (new Date(r.expires_at) < new Date()) return 'expired'
  if (r.attempts >= maxAttempts) return 'locked'
  if (r.code_hash !== hash) {
    await db.from('otp_codes').update({ attempts: r.attempts + 1 }).eq('id', r.id)
    return 'wrong'
  }
  await db.from('otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', r.id)
  return 'ok'
}

/** كود إحالة فريد من 6 حروف */
function referralCode() {
  return randomBytes(4).toString('base64url').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6).padEnd(6, 'X')
}

export async function POST(req: Request) {
  let phone: string
  let code: string
  let submittedEmail: unknown
  try {
    const body = await req.json()
    const norm = normalizePhone(String(body.phone ?? ''))
    if (!norm) return NextResponse.json({ error: 'الرقم ده مش شكله صح' }, { status: 400 })
    phone = norm
    code = String(body.code ?? '').trim()
    submittedEmail = body.email
  } catch {
    return NextResponse.json({ error: 'طلب مش مفهوم' }, { status: 400 })
  }

  const db = admin()

  // نفس قاعدة الإرسال بالظبط — وإلا الهاش ما يطابقش
  const target = await resolveEmail(db, phone, submittedEmail)
  if (!target.ok) return NextResponse.json({ error: target.error }, { status: target.status })
  const email = target.email

  // حد المعدل على الجهاز — رقم واحد محدود، بس مهاجم معاه ألف رقم كان بياخد
  // ألف نصيب من نفس الجهاز (S7).
  const limits = await otpLimits(db)
  if (!(await rateOk(db, ipKey('otp_verify', req), limits.ipVerifiesPerHour))) {
    return NextResponse.json({ error: 'محاولات كتير من الجهاز ده. استنى شوية.' }, { status: 429 })
  }

  /**
   * التحقق كله جوه fn_otp_try — بيقفل الصف فالمحاولات المتوازية بتتصفّ ورا
   * بعض. الكود القديم كان بيقرا العدّاد وبعدين يكتبه في خطوتين، فـ٥٠ طلب
   * متوازي كانوا بيقروا كلهم صفر وحد الـ٥ عمره ما بيمسك (اتثبت عمليًا: عدّى
   * ٢٨ تخمين بدل ٥). ⚠ نفس المسار بيخدم دخول اللوحة.
   *
   * لو الهجرة 0070 لسه ما اتلزقتش، الدالة مش موجودة فبنرجع للطريق القديم
   * علشان الدخول ما يقفش على الناس — أضعف، بس مش مقفول.
   */
  const hash = codeHash(code, phone, email)
  const { data: verdictRaw, error: rpcErr } = await db.rpc('fn_otp_try', {
    p_phone: phone,
    p_hash: hash,
  })

  let verdict: string
  if (rpcErr) {
    verdict = await legacyOtpTry(db, phone, hash, limits.maxAttempts)
  } else {
    verdict = String(verdictRaw)
  }

  if (verdict === 'none') return NextResponse.json({ error: 'اطلب الرمز الأول' }, { status: 400 })
  if (verdict === 'expired') {
    return NextResponse.json({ error: 'الرمز خلصت مدته. اطلب واحد جديد.' }, { status: 400 })
  }
  if (verdict === 'locked') {
    return NextResponse.json({ error: 'جربت كتير. اطلب رمز جديد.' }, { status: 429 })
  }
  if (verdict !== 'ok') {
    return NextResponse.json({ error: 'الرمز مش مظبوط' }, { status: 400 })
  }

  // ===== المستخدم: موجود ولا نعمله؟ =====
  let userId = target.profileId ?? undefined

  if (!userId) {
    const { data: created, error: cErr } = await db.auth.admin.createUser({
      email,
      phone,
      email_confirm: true,
      phone_confirm: true,
    })
    if (cErr || !created.user) {
      return NextResponse.json({ error: 'مقدرناش نعمل الحساب' }, { status: 500 })
    }
    userId = created.user.id

    // كود إحالة فريد
    let rc = referralCode()
    for (let i = 0; i < 5; i++) {
      const { data: clash } = await db
        .from('profiles').select('id').eq('referral_code', rc).maybeSingle()
      if (!clash) break
      rc = referralCode()
    }

    const { error: pErr } = await db.from('profiles').insert({
      id: userId,
      phone,
      email,
      referral_code: rc,
      // الإيميل هو اللي اتأكد — الرقم بقى وسيلة تواصل من غير تحقق
      phone_verified_at: null,
    })
    if (pErr) return NextResponse.json({ error: 'مقدرناش نعمل الملف' }, { status: 500 })
  } else {
    // أول تحقق بإيميل حقيقي لحساب قديم — نثبّته على الملف
    if (!target.existing) await db.from('profiles').update({ email }).eq('id', userId)

    // الحسابات القديمة اتعملت بإيميل اصطناعي (+20…@phone.nasbot.app).
    // الرابط السحري بيدوّر بالإيميل، فلازم إيميل الحساب في auth يبقى هو
    // الحقيقي. لو ما ينفعش، بنوقف هنا — لأن generateLink ساعتها هيعمل
    // حساب تاني بنفس الإيميل من غير ملف، والعضو هيدخل ويلاقي كل حاجة مقفولة.
    const { data: u } = await db.auth.admin.getUserById(userId)
    if (u.user && u.user.email !== email) {
      const { error: uErr } = await db.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
      })
      if (uErr) {
        return NextResponse.json(
          { error: 'في مشكلة في الحساب ده. كلّمنا وهنظبطه.' },
          { status: 409 }
        )
      }
    }
  }

  // ===== الجلسة: رابط سحري بنرجّع منه token_hash علشان المتصفح يفتح الجلسة =====
  const { data: link, error: lErr } = await db.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (lErr || !link.properties?.hashed_token) {
    return NextResponse.json({ error: 'مقدرناش نفتح الجلسة' }, { status: 500 })
  }

  // حزام أمان: لازم الجلسة تطلع لنفس الحساب اللي عليه الملف.
  // لو طلعت لحساب تاني يبقى في حاجة غلط — أحسن نوقف بدل ما ندخّله على موقع فاضي.
  if (link.user?.id && link.user.id !== userId) {
    return NextResponse.json(
      { error: 'في مشكلة في الحساب ده. كلّمنا وهنظبطه.' },
      { status: 409 }
    )
  }

  return NextResponse.json({
    ok: true,
    token_hash: link.properties.hashed_token,
  })
}
