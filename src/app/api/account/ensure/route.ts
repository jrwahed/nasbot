import { NextResponse } from 'next/server'
import { randomBytes } from 'node:crypto'
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

  const { data: auth, error: authErr } = await admin().auth.getUser(token)
  const user = auth.user
  if (!user) {
    // السبب بيرجع مع الرسالة — من غيره 401 ما بيقولش حاجة
    return NextResponse.json(
      { error: `لازم تسجل دخول (${authErr?.message ?? 'no user for token'})` },
      { status: 401 }
    )
  }

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
    .select('id, phone, email, deleted_at')
    .eq('id', user.id)
    .maybeSingle()

  if (mine) {
    const cur = mine as { email: string | null; deleted_at: string | null }

    // ⚠ حساب اتمسح من «امسح حسابي» ورجع صاحبه يسجّل بنفس الإيميل: سوبابيس
    //   بيدخّله على نفس الحساب القديم، و`/join` بيملا بياناته من تاني — بس
    //   `deleted_at` كان بيفضل متعلّم، فكل حجز يقول «الحساب مش موجود» من
    //   غير ما حد يفهم ليه (حصل للمالك نفسه ٢٠٢٦-٠٩-٣٠). رجوعه = رجّعه.
    //   الحظر (`banned_at`) عمود تاني وما بيتلمسش هنا.
    if (cur.deleted_at) {
      await db
        .from('profiles')
        .update({ deleted_at: null, ...(email && !cur.email ? { email } : {}) })
        .eq('id', user.id)
      await db.from('audit_log').insert({
        actor_id: user.id, action: 'restore_profile', entity: 'profiles', entity_id: user.id,
      })
      return NextResponse.json({ ok: true, created: false, restored: true })
    }

    // موجود — نكمّل الإيميل لو ناقص، ومفيش تغيير للرقم من هنا
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
