import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { themeInitScript } from '@/lib/theme'

/**
 * حارس الحافة — بيعمل حاجتين:
 *
 *   1. حماية اللوحة على `/admin/*` (زي الأول بالظبط): تجديد كوكي الجلسة
 *      وتحويل غير الداخلين لـ /admin/login. مفيش فحص صلاحيات هنا —
 *      ده بيحصل على السيرفر في `requirePermission`.
 *
 *   2. وضع الصيانة على باقي الموقع: بيقرا `maintenance.is_on` (قراءة عامة
 *      بسياسة mt_read) عبر REST بمفتاح anon، وبيخزّنها في كاش خفيف على
 *      الحافة لمدة قصيرة. لو الصيانة شغّالة، أي زائر **مش** معاه كوكي جلسة
 *      لوحة بيشوف صفحة صيانة (503) — والأدمن (اللي معاه الكوكي) و`/admin/*`
 *      بيعدّوا عادي علشان يقفلوا/يفتحوا الموقع.
 *
 * كله edge-safe: مفيش استيراد node-only، ومفيش مفتاح خدمة. القراءة الوحيدة
 * للقاعدة هي جدول `maintenance` المتاح للقراءة العامة، وبكاش علشان ما نضربش
 * القاعدة كل طلب.
 */

/** لازم يطابق ADMIN_COOKIE في src/lib/server/admin-auth.ts */
const ADMIN_COOKIE = 'nb_admin'

/** صفحة الدخول نفسها لازم تفضل مفتوحة، وإلا هتلف على نفسها */
const OPEN_PATHS = ['/admin/login']

/* ------------------------------------------------ كاش الصيانة على الحافة */

interface MaintState {
  at: number
  on: boolean
  message: string
}

/** بيعيش في نطاق الموديول — بيفضل بين الطلبات في نفس الـ isolate */
let maintCache: MaintState | null = null
const MAINT_TTL_MS = 20_000

/**
 * بيقرا حالة الصيانة بكاش قصير. لو القراءة فشلت (شبكة/إعداد) بنفترض الموقع
 * شغّال — ما ينفعش نقفل على الكل بسبب غلطة عابرة. القفل قرار صريح من اللوحة.
 */
async function readMaintenance(url: string, key: string): Promise<MaintState> {
  const now = Date.now()
  if (maintCache && now - maintCache.at < MAINT_TTL_MS) return maintCache
  try {
    const r = await fetch(`${url}/rest/v1/maintenance?select=is_on,message_ar&id=eq.true`, {
      headers: { apikey: key, authorization: `Bearer ${key}` },
      cache: 'no-store',
    })
    if (r.ok) {
      const rows = (await r.json()) as { is_on: boolean; message_ar: string }[]
      const row = rows[0]
      maintCache = { at: now, on: Boolean(row?.is_on), message: row?.message_ar ?? '' }
      return maintCache
    }
  } catch {
    // نسيبها زي ما هي تحت
  }
  // فشل القراءة: نحافظ على آخر حالة معروفة، وإلا نفترض شغّال
  maintCache = { at: now, on: maintCache?.on ?? false, message: maintCache?.message ?? '' }
  return maintCache
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * صفحة الصيانة — HTML مستقل (مفيش React على الحافة). نفس لغة الموقع البصرية:
 * كريمي/ink، RTL، علامة استفهام برتقالي مايلة، والرسالة من `maintenance.message_ar`.
 * الوضع بيتظبط بنفس سكريبت الموقع قبل أول رسم.
 */
function maintenanceResponse(message: string): NextResponse {
  const body = escapeHtml(message || 'بنظبط حاجات صغيرة. ارجعلنا بعد شوية.')
  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>نسبوط — بنظبط حاجة</title>
<script>${themeInitScript}</script>
<style>
  :root[data-theme='day']{--bg:#fbf7ef;--fg:#14161a;--muted:#55575c}
  :root[data-theme='night']{--bg:#14161a;--fg:#fbf7ef;--muted:#c9c4b8}
  html,body{margin:0}
  body{background:var(--bg);color:var(--fg);min-height:100vh;
    font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,system-ui,sans-serif;
    display:grid;place-items:center;padding:24px;box-sizing:border-box}
  .wrap{width:100%;max-width:440px;text-align:center}
  .mark{width:96px;height:96px;border-radius:24px;background:#f4632a;color:#14161a;
    display:grid;place-items:center;margin:0 auto;font-weight:900;font-size:62px;line-height:1;
    transform:skewX(-6deg) rotate(-18deg);font-family:Rubik,'Segoe UI',sans-serif}
  h1{margin:32px 0 12px;font-family:Rubik,'Segoe UI',sans-serif;font-weight:900;
    font-size:30px;line-height:1.15}
  p{margin:0;color:var(--muted);font-size:17px;line-height:1.7}
</style>
</head>
<body>
  <main class="wrap">
    <div class="mark" role="img" aria-label="نسبوط">؟</div>
    <h1>نسبوط بيتظبط دلوقتي</h1>
    <p>${body}</p>
  </main>
</body>
</html>`
  return new NextResponse(html, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'retry-after': '120',
    },
  })
}

/* ------------------------------------------------ حماية اللوحة (زي الأول) */

async function guardAdmin(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl

  if (OPEN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next()
  }

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

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // اللوحة: الأدمن بيعدّي دايمًا (علشان يقفل/يفتح الصيانة) — نفس المنطق القديم
  if (pathname.startsWith('/admin')) return guardAdmin(req)

  // باقي الموقع: فحص الصيانة بس
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return NextResponse.next()

  const maint = await readMaintenance(url, key)
  // الأدمن (معاه كوكي جلسة اللوحة) بيتفرّج على الموقع عادي وقت الصيانة
  const isAdmin = Boolean(req.cookies.get(ADMIN_COOKIE)?.value)
  if (maint.on && !isAdmin) return maintenanceResponse(maint.message)

  return NextResponse.next()
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
   * كل الموقع ما عدا: ملفات Next الداخلية، الـ API، والأصول الساكنة (أي ملف
   * بامتداد). `/admin/*` داخلة — بتاخد فرع حماية اللوحة. باقي المسارات بتاخد
   * فحص الصيانة بس.
   */
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|.*\\.[\\w]+$).*)',
  ],
}
