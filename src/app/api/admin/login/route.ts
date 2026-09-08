import { NextResponse } from 'next/server'
import { admin, normalizePhone } from '@/lib/server/supabase-admin'
import {
  adminUserForSession,
  checkLoginRate,
  clearAdminCookie,
  clientIp,
  generateTotpSecret,
  logLoginAttempt,
  openAdminSession,
  revokeAdminSessions,
  totpStepUsed,
  verifyTotp,
  writeAudit,
} from '@/lib/server/admin-auth'

// المسارين دول بيتنادوا زي ما هما — مفيش نسخ لمنطق التحقق ولا تخفيف فيه.
import { POST as otpSendRoute } from '@/app/api/otp/send/route'
import { POST as otpVerifyRoute } from '@/app/api/otp/verify/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * دخول اللوحة — خطوتين، ولازم الاتنين.
 *
 *   1) `action:'start'`  { phone }        → بيبعت رمز واتساب (نفس مسار الأعضاء)
 *      `action:'otp'`    { phone, code }  → بيتحقق من الرمز ويرجّع token_hash
 *                                            علشان المتصفح يفتح جلسة سوبابيس.
 *
 *   2) `action:'totp'`   { code }         → بيقرا جلسة سوبابيس من الكوكيز،
 *                                            بيتأكد إنها لمدير نشط، وبيتحقق من
 *                                            كود التطبيق. وبعد كده **بس** بيفتح
 *                                            صف في admin_sessions ويحط الكوكي.
 *
 *   `action:'logout'`                     → بيلغي جلسات اللوحة ويمسح الكوكي.
 *
 * ليه الخطوة الأولى بتعدّي على مسار الأعضاء؟ علشان إثبات إن الشخص ماسك الرقم
 * يبقى جلسة سوبابيس حقيقية موقّعة من سوبابيس نفسها — مش ادّعاء إحنا بنصدّقه.
 * وكمان علشان ما نكتبش تحقق تاني ممكن يطلع أضعف من الأصلي.
 *
 * ⚠ الرسايل: الفشل في «مش مدير» و«الرمز غلط» و«كود التطبيق غلط» **رسالة واحدة**
 *   بالظبط وبنفس الكود — علشان محدش يعرف رقم مين من الفريق ورقم مين لأ.
 */

/** الرسالة الوحيدة لأي فشل في الخطوة التانية */
const SAME_FAILURE = 'الدخول مظبطش. راجع الرقم والكودين.'

const noStore = { 'cache-control': 'no-store' }

const fail = (status = 401) =>
  NextResponse.json({ error: SAME_FAILURE }, { status, headers: noStore })

const tooMany = () =>
  NextResponse.json(
    { error: 'جربت كتير. استنى شوية وجرب تاني.' },
    { status: 429, headers: noStore }
  )

/** سر وهمي ثابت الشكل — بنتحقق بيه لما ما يكونش في مدير، علشان الزمن ما يفرقش */
const DECOY_SECRET = generateTotpSecret()

export async function POST(req: Request) {
  const ip = clientIp(req)
  const ua = req.headers.get('user-agent')

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'طلب مش مفهوم' }, { status: 400, headers: noStore })
  }

  const action = String(body.action ?? '')

  /* ---------------------------------------------------- خروج */

  if (action === 'logout') {
    const found = await adminUserForSession(req)
    if (found?.row) {
      await revokeAdminSessions(found.row.id)
      await writeAudit({
        actorId: found.uid,
        action: 'admin.logout',
        entity: 'admin_sessions',
        ip,
      })
    }
    return NextResponse.json(
      { ok: true },
      { status: 200, headers: { ...noStore, 'set-cookie': clearAdminCookie() } }
    )
  }

  /* ---------------------------------------- الخطوة ١أ: بعت الرمز */

  if (action === 'start') {
    const phone = normalizePhone(String(body.phone ?? ''))
    if (!phone) {
      return NextResponse.json({ error: 'الرقم ده مش شكله صح' }, { status: 400, headers: noStore })
    }

    const rate = await checkLoginRate(phone, ip)
    if (!rate.ok) return tooMany()

    // نفس مسار الأعضاء بحرفه — بحد المعدل بتاعه (٣ في الساعة للرقم)
    return passThrough(await otpSendRoute(cloneJson(req, { phone })))
  }

  /* ------------------------------------- الخطوة ١ب: تحقق الرمز */

  if (action === 'otp') {
    const phone = normalizePhone(String(body.phone ?? ''))
    if (!phone) {
      return NextResponse.json({ error: 'الرقم ده مش شكله صح' }, { status: 400, headers: noStore })
    }

    const rate = await checkLoginRate(phone, ip)
    if (!rate.ok) return tooMany()

    const res = await otpVerifyRoute(
      cloneJson(req, { phone, code: String(body.code ?? '') })
    )

    if (!res.ok) {
      await logLoginAttempt({ ok: false, stage: 'otp', phone, ip })
    }
    // ملاحظة: السلوك هنا مطابق تمامًا لمسار الأعضاء العام — نجاحه ما بيقولش
    // إن الرقم بتاع مدير، لأن أي رقم بيعدّي منه بنفس الشكل.
    return passThrough(res)
  }

  /* --------------------------------- الخطوة ٢: كود تطبيق المصادقة */

  if (action === 'totp') {
    const submitted = String(body.code ?? '')

    // حد المعدل بالـ IP الأول — الرقم لسه ما نعرفوش من غير الجلسة
    const ipRate = await checkLoginRate(null, ip)
    if (!ipRate.ok) return tooMany()

    const found = await adminUserForSession(req)

    // مفيش جلسة سوبابيس خالص → نفس رسالة الفشل، من غير ما نقول إن دي المشكلة
    if (!found) {
      verifyTotp(DECOY_SECRET, submitted)
      await logLoginAttempt({ ok: false, stage: 'totp', ip, note: 'no_session' })
      return fail()
    }

    // الرقم الحقيقي من الملف — مش من الجسم اللي المتصفح بعته
    const phone = await phoneOf(found.uid)

    const phoneRate = await checkLoginRate(phone, ip)
    if (!phoneRate.ok) return tooMany()

    const row = found.row

    // مش مدير / موقوف → نفس الرسالة بالظبط، ونفس المجهود الزمني
    if (!row) {
      verifyTotp(DECOY_SECRET, submitted)
      await logLoginAttempt({ ok: false, stage: 'totp', phone, ip, note: 'not_admin' })
      return fail()
    }

    // مدير لسه ما فعّلش التحقق بخطوتين → الواجهة بتوديه للتفعيل لأول مرة.
    // (ده بيتقال بس لحد عدّى OTP الرقم ده فعلًا — يعني ماسك الموبايل.)
    if (!row.totp_secret || !row.totp_enabled_at) {
      return NextResponse.json(
        { ok: false, next: 'enrol' },
        { status: 200, headers: noStore }
      )
    }

    const check = verifyTotp(row.totp_secret, submitted)

    // منع إعادة استعمال نفس الكود في نافذته
    const reused = check.ok && check.step !== null
      ? await totpStepUsed(found.uid, check.step)
      : false

    if (!check.ok || reused) {
      await logLoginAttempt({
        ok: false,
        stage: 'totp',
        phone,
        ip,
        actorId: found.uid,
        note: reused ? 'replay' : 'bad_totp',
      })
      return fail()
    }

    return await openAdminSession({
      adminUserId: row.id,
      profileId: found.uid,
      roleKey: row.role_key,
      step: check.step,
      phone,
      ip,
      ua,
      stage: 'totp',
    })
  }

  return NextResponse.json({ error: 'طلب مش مفهوم' }, { status: 400, headers: noStore })
}

/* ==================================================================== أدوات */

/** طلب جديد بنفس الترويسات المهمة وجسم JSON جديد — علشان نمرّره لمسار تاني */
function cloneJson(req: Request, payload: unknown): Request {
  const headers = new Headers()
  headers.set('content-type', 'application/json')
  for (const h of ['x-forwarded-for', 'x-real-ip', 'user-agent']) {
    const v = req.headers.get(h)
    if (v) headers.set(h, v)
  }
  return new Request(req.url, { method: 'POST', headers, body: JSON.stringify(payload) })
}

/** بنرجّع رد المسار التاني زي ما هو، مع منع التخزين */
async function passThrough(res: Response): Promise<NextResponse> {
  const text = await res.text()
  return new NextResponse(text, {
    status: res.status,
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/json',
      ...noStore,
    },
  })
}

/** رقم صاحب الملف — بنستخدمه لحد المعدل والسجل، مش بناخده من المتصفح */
async function phoneOf(profileId: string): Promise<string | null> {
  const { data } = await admin()
    .from('profiles')
    .select('phone')
    .eq('id', profileId)
    .maybeSingle()
  return (data as { phone: string } | null)?.phone ?? null
}
