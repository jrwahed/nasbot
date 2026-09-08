import { NextResponse } from 'next/server'
import { admin } from '@/lib/server/supabase-admin'
import {
  adminUserForSession,
  checkLoginRate,
  clientIp,
  generateTotpSecret,
  logLoginAttempt,
  openAdminSession,
  otpauthUri,
  verifyTotp,
  writeAudit,
} from '@/lib/server/admin-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * تفعيل التحقق بخطوتين لأول مرة.
 *
 *   `action:'begin'`    → بيولّد سر جديد، بيحفظه على admin_users، وبيرجّعه
 *                         مع رابط otpauth:// علشان المدير يحطه في تطبيق المصادقة.
 *                         **مش** بيفعّل حاجة — totp_enabled_at بيفضل فاضي.
 *
 *   `action:'confirm'`  → بياخد كود من التطبيق. لو ظبط، ساعتها بس
 *                         totp_enabled_at بتتحط، وبنفتح جلسة لوحة على طول
 *                         (لأن العاملين الاتنين اتثبتوا: الرقم في الخطوة اللي
 *                         فاتت، وكود التطبيق في الطلب ده).
 *
 * الشروط اللي بتحمي المسار ده:
 *
 *  · لازم جلسة سوبابيس صالحة — يعني الشخص عدّى OTP الواتساب على رقمه.
 *    مفيش أي طريقة يوصل هنا من غير الخطوة دي.
 *  · لازم يكون صف admin_users نشط ومربوط بنفس الجلسة.
 *  · ⚠ **ممنوع** لو totp_enabled_at متحطة أصلًا. لو سمحنا بده، أي حد ماسك
 *    موبايل المدير يقدر يصفّر السر ويعدّي التحقق بخطوتين خالص — يعني نرجع
 *    لعامل واحد. تصفير سر مفعّل لازم يتعمل من القاعدة بإيد بني آدم تاني.
 */

const noStore = { 'cache-control': 'no-store' }

const nope = (status = 401) =>
  NextResponse.json(
    { error: 'مش مسموح. ادخل بالرقم الأول.' },
    { status, headers: noStore }
  )

export async function POST(req: Request) {
  const ip = clientIp(req)
  const ua = req.headers.get('user-agent')

  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'طلب مش مفهوم' }, { status: 400, headers: noStore })
  }

  const rate = await checkLoginRate(null, ip)
  if (!rate.ok) {
    return NextResponse.json(
      { error: 'جربت كتير. استنى شوية وجرب تاني.' },
      { status: 429, headers: noStore }
    )
  }

  // لازم جلسة سوبابيس + صف مدير نشط. غير كده مفيش تفعيل.
  const found = await adminUserForSession(req)
  if (!found || !found.row) return nope()

  const row = found.row

  // مفعّل خلاص؟ يبقى مفيش تصفير من هنا. خالص.
  if (row.totp_enabled_at) {
    await writeAudit({
      actorId: found.uid,
      action: 'admin.totp.reset_refused',
      entity: 'admin_users',
      entityId: row.id,
      ip,
    })
    return NextResponse.json(
      { error: 'التحقق بخطوتين مفعّل على الحساب ده. لو ضاع منك، كلّم المالك.' },
      { status: 409, headers: noStore }
    )
  }

  const action = String(body.action ?? 'begin')

  /* ------------------------------------------------ توليد السر */

  if (action === 'begin') {
    const secret = generateTotpSecret()

    const { data: saved, error } = await admin()
      .from('admin_users')
      .update({ totp_secret: secret, updated_at: new Date().toISOString() })
      // شرط تاني على مستوى الاستعلام: لو حد فعّل في نفس اللحظة، التحديث ما يعديش
      .eq('id', row.id)
      .is('totp_enabled_at', null)
      .select('id')
      .maybeSingle()

    // لازم نتأكد إن الصف اتغيّر فعلًا. لو صفر صفوف (سباق مع تفعيل تاني)
    // يبقى السر ده **مش** متخزن — وممنوع نرجّعه للمستخدم على إنه سره.
    if (error || !saved) {
      return NextResponse.json(
        { error: 'حصلت مشكلة. جرب تاني.' },
        { status: 500, headers: noStore }
      )
    }

    const account = await accountLabel(found.uid)

    await writeAudit({
      actorId: found.uid,
      action: 'admin.totp.begin',
      entity: 'admin_users',
      entityId: row.id,
      ip,
      // ⚠ السر نفسه عمره ما بيتكتب في السجل
      after: { role: row.role_key },
    })

    return NextResponse.json(
      {
        ok: true,
        secret,
        uri: otpauthUri(secret, account),
        account,
      },
      { status: 200, headers: noStore }
    )
  }

  /* ------------------------------------- تأكيد إن التطبيق شغال */

  if (action === 'confirm') {
    if (!row.totp_secret) {
      return NextResponse.json(
        { error: 'ابدأ التفعيل الأول.' },
        { status: 400, headers: noStore }
      )
    }

    const check = verifyTotp(row.totp_secret, String(body.code ?? ''))
    if (!check.ok) {
      await logLoginAttempt({
        ok: false,
        stage: 'enrol',
        ip,
        actorId: found.uid,
        note: 'bad_totp',
      })
      return NextResponse.json(
        { error: 'الكود مش مظبوط. جرب الكود اللي ظاهر دلوقتي.' },
        { status: 400, headers: noStore }
      )
    }

    // دلوقتي بس بنفعّل — بعد ما أثبت إنه بيقدر يولّد كود صح.
    // الشرط `is null` بيمنع إن طلبين في نفس اللحظة يدوسوا على بعض.
    const { error } = await admin()
      .from('admin_users')
      .update({ totp_enabled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .is('totp_enabled_at', null)

    if (error) {
      return NextResponse.json(
        { error: 'حصلت مشكلة. جرب تاني.' },
        { status: 500, headers: noStore }
      )
    }

    await writeAudit({
      actorId: found.uid,
      action: 'admin.totp.enabled',
      entity: 'admin_users',
      entityId: row.id,
      ip,
      after: { role: row.role_key },
    })

    const phone = await phoneOf(found.uid)

    // العاملين اتثبتوا في نفس الطلب (الرقم قبل شوية، والتطبيق دلوقتي) —
    // فبنفتح الجلسة على طول بدل ما نطلب منه كود تاني بعد ٣٠ ثانية.
    return await openAdminSession({
      adminUserId: row.id,
      profileId: found.uid,
      roleKey: row.role_key,
      step: check.step,
      phone,
      ip,
      ua,
      stage: 'enrol',
    })
  }

  return NextResponse.json({ error: 'طلب مش مفهوم' }, { status: 400, headers: noStore })
}

/* ==================================================================== أدوات */

async function phoneOf(profileId: string): Promise<string | null> {
  const { data } = await admin()
    .from('profiles')
    .select('phone')
    .eq('id', profileId)
    .maybeSingle()
  return (data as { phone: string } | null)?.phone ?? null
}

/** الاسم اللي هيبان جوه تطبيق المصادقة — الرقم أوضح حاجة للمدير */
async function accountLabel(profileId: string): Promise<string> {
  const phone = await phoneOf(profileId)
  return phone ?? 'admin'
}
