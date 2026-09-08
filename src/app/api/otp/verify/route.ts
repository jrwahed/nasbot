import { NextResponse } from 'next/server'
import { createHash, randomBytes } from 'node:crypto'
import { admin, normalizePhone, phoneEmail } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'

const hash = (code: string, phone: string) =>
  createHash('sha256').update(`${code}:${phone}:${process.env.CRON_SECRET ?? 'nasbot'}`).digest('hex')

/** كود إحالة فريد من 6 حروف */
function referralCode() {
  return randomBytes(4).toString('base64url').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6).padEnd(6, 'X')
}

export async function POST(req: Request) {
  let phone: string
  let code: string
  try {
    const body = await req.json()
    const norm = normalizePhone(String(body.phone ?? ''))
    if (!norm) return NextResponse.json({ error: 'الرقم ده مش شكله صح' }, { status: 400 })
    phone = norm
    code = String(body.code ?? '').trim()
  } catch {
    return NextResponse.json({ error: 'طلب مش مفهوم' }, { status: 400 })
  }

  const db = admin()

  const { data: row } = await db
    .from('otp_codes')
    .select('id, code_hash, expires_at, attempts, consumed_at')
    .eq('phone', phone)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!row) return NextResponse.json({ error: 'اطلب الرمز الأول' }, { status: 400 })

  const r = row as {
    id: string; code_hash: string; expires_at: string; attempts: number
  }

  if (new Date(r.expires_at) < new Date()) {
    return NextResponse.json({ error: 'الرمز خلصت مدته. اطلب واحد جديد.' }, { status: 400 })
  }
  if (r.attempts >= 5) {
    return NextResponse.json({ error: 'جربت كتير. اطلب رمز جديد.' }, { status: 429 })
  }
  if (r.code_hash !== hash(code, phone)) {
    await db.from('otp_codes').update({ attempts: r.attempts + 1 }).eq('id', r.id)
    return NextResponse.json({ error: 'الرمز مش مظبوط' }, { status: 400 })
  }

  await db.from('otp_codes').update({ consumed_at: new Date().toISOString() }).eq('id', r.id)

  // ===== المستخدم: موجود ولا نعمله؟ =====
  const email = phoneEmail(phone)
  const { data: existing } = await db
    .from('profiles')
    .select('id')
    .eq('phone', phone)
    .maybeSingle()

  let userId = (existing as { id: string } | null)?.id

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
      referral_code: rc,
      phone_verified_at: new Date().toISOString(),
    })
    if (pErr) return NextResponse.json({ error: 'مقدرناش نعمل الملف' }, { status: 500 })
  } else {
    await db.from('profiles').update({ phone_verified_at: new Date().toISOString() }).eq('id', userId)

    // المستخدمين القدام ممكن يكونوا اتعملوا بالموبايل من غير إيميل.
    // الرابط السحري بيدوّر بالإيميل بس، فلازم نتأكد إن الإيميل متسجّل على
    // نفس الحساب. لو ما ينفعش، بنوقف هنا — لأن generateLink ساعتها
    // هيعمل حساب تاني بنفس الإيميل من غير ملف، والعضو هيدخل ويلاقي كل حاجة مقفولة.
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
