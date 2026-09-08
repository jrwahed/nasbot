import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * حارس اللوحة على الحافة.
 *
 * ⚠ النطاق: `/admin/:path*` **بس**. أي حاجة تانية في الموقع — الرئيسية،
 *   السبوطات، الحجز، الشات، صور `_next` — عمرها ما بتعدّي من هنا خالص.
 *   الـ matcher تحت هو الضمانة، فاقراه قبل ما تلمسه.
 *
 * بيعمل حاجتين بس، وكلاهما رخيص:
 *
 *   1. بيجدّد كوكي جلسة سوبابيس بالطريقة الرسمية لـ @supabase/ssr
 *      (getUser بتقرا الكوكيز وبتكتب المتجدد في رد الطلب).
 *   2. لو مفيش جلسة، أو مفيش كوكي جلسة لوحة — بيوديه على /admin/login.
 *
 * ما بيعملش **فحص صلاحيات**، وما بيلمسش القاعدة، وما بيستوردش node:crypto
 * ولا مفتاح الخدمة. الميدل وير بيشتغل على الحافة، وده كله مش بتاعه.
 *
 * الفحص الحقيقي (الجلسة في admin_sessions + الخمول + الدور + الصلاحية)
 * بيحصل على السيرفر في `requirePermission` من `src/lib/server/admin-auth.ts`.
 * الميدل وير ده راحة للمستخدم وطبقة أولى — **مش** هو الحد الأمني.
 */

/** لازم يطابق ADMIN_COOKIE في src/lib/server/admin-auth.ts */
const ADMIN_COOKIE = 'nb_admin'

/** صفحة الدخول نفسها لازم تفضل مفتوحة، وإلا هتلف على نفسها */
const OPEN_PATHS = ['/admin/login']

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // حزام أمان تاني جنب الـ matcher: لو حاجة برّه /admin وصلت هنا بأي شكل، سيبها
  if (!pathname.startsWith('/admin')) return NextResponse.next()

  if (OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

  // الرد اللي هنكتب عليه الكوكيز المتجددة
  let res = NextResponse.next({ request: req })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // من غير إعداد مفيش طريقة نتأكد — والقفل أأمن من الفتح
  if (!url || !key) return toLogin(req)

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        for (const { name, value } of cookiesToSet) {
          req.cookies.set(name, value)
        }
        res = NextResponse.next({ request: req })
        for (const { name, value, options } of cookiesToSet) {
          res.cookies.set(name, value, options)
        }
        // ردود بتحط كوكيز جلسة ممنوع أي CDN يخزّنها
        for (const [k, v] of Object.entries(headers ?? {})) res.headers.set(k, v)
      },
    },
  })

  // getUser (مش getSession) — دي بتتحقق من التوكن على سيرفر سوبابيس
  let signedIn = false
  try {
    const { data } = await supabase.auth.getUser()
    signedIn = Boolean(data.user)
  } catch {
    signedIn = false
  }

  if (!signedIn) return toLogin(req)

  // كوكي جلسة اللوحة لازم يكون موجود. صلاحيته الحقيقية بتتفحص على السيرفر —
  // هنا بنشوف وجوده بس، علشان ما نوديش المدير لصفحة فاضية.
  if (!req.cookies.get(ADMIN_COOKIE)?.value) return toLogin(req)

  return res
}

function toLogin(req: NextRequest) {
  const to = req.nextUrl.clone()
  to.pathname = '/admin/login'
  to.search = ''
  // بنرجّعه لمكانه بعد الدخول — المسار الداخلي بس، مش أي URL كامل
  const back = `${req.nextUrl.pathname}${req.nextUrl.search}`
  if (back.startsWith('/admin') && !back.startsWith('//')) {
    to.searchParams.set('next', back)
  }
  return NextResponse.redirect(to)
}

export const config = {
  /**
   * اللوحة بس. `/admin` نفسها داخلة (`:path*` بيقبل صفر مقاطع).
   * `_next/*` و`/api/*` وباقي الموقع مش داخلين أصلاً في النمط ده.
   */
  matcher: ['/admin/:path*'],
}
