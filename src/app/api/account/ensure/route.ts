import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { admin, normalizePhone } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'

/**
 * بعد الدخول بإيميل وباسورد من المتصفح — نتأكد إن للحساب صف في profiles.
 *
 * الدخول نفسه بيحصل عند سوبابيس (signUp / signInWithPassword)، فمفيش رمز
 * ولا إرسال. الصف بيتعمل هنا بمفتاح الخدمة علشان كود الإحالة الفريد
 * وفحص إن الرقم مش مسجّل بحساب تاني — حاجات ما ينفعش نسيبها للعميل.
 *
 * المستخدم بيتحدد من التوكن بتاعه — مش من أي id جاي من العميل.
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
  const user = auth.user
  if (!user) return NextResponse.json({ error: 'لازم تسجل دخول' }, { status: 401 })

  let phone: string | null = null
  try {
    const body = await req.json()
    phone = normalizePhone(String(body.phone ?? ''))
  } catch {
    /* من غير جسم — هنتعامل تحت */
  }

  const db = admin()
  const email = user.email?.toLowerCase() ?? null

  const { data: mine } = await db
    .from('profiles')
    .select('id, phone, email')
    .eq('id', user.id)
    .maybeSingle()

  if (mine) {
    // موجود — نكمّل الإيميل لو ناقص، ومفيش تغيير للرقم من هنا
    const cur = mine as { email: string | null }
    if (email && !cur.email) await db.from('profiles').update({ email }).eq('id', user.id)
    return NextResponse.json({ ok: true, created: false })
  }

  // حساب جديد — الرقم لازم، وفريد
  if (!phone) return NextResponse.json({ error: 'الرقم ده مش شكله صح' }, { status: 400 })

  const { data: taken } = await db.from('profiles').select('id').eq('phone', phone).maybeSingle()
  if (taken) {
    return NextResponse.json(
      { error: 'الرقم ده مسجّل بحساب تاني. ادخل بالإيميل اللي سجّلت بيه.' },
      { status: 409 }
    )
  }

  let rc = referralCode()
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await db.from('profiles').select('id').eq('referral_code', rc).maybeSingle()
    if (!clash) break
    rc = referralCode()
  }

  const { error } = await db.from('profiles').insert({
    id: user.id,
    phone,
    email,
    referral_code: rc,
    // الإيميل هو اللي سوبابيس أكّده (أو ما أكّدهوش حسب الإعداد) — الرقم وسيلة تواصل
    phone_verified_at: null,
  })
  if (error) return NextResponse.json({ error: 'مقدرناش نعمل الملف' }, { status: 500 })

  return NextResponse.json({ ok: true, created: true })
}

/** كود إحالة فريد من 6 حروف */
function referralCode() {
  return randomBytes(4).toString('base64url').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6).padEnd(6, 'X')
}
