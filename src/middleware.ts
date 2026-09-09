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
 *   2. وضع الصيانة على باقي الموقع: بيقرا `maintenance` (قراءة عامة بسياسة
 *      mt_read) عبر REST بمفتاح anon، وبيخزّنها في كاش خفيف على الحافة لمدة
 *      قصيرة. لو الصيانة شغّالة، الزائر بيشوف صفحة صيانة (503).
 *
 *      **مين بيعدّي؟ اللي دوره في `maintenance.allow_roles`** — العمود ده كان
 *      بيتعدّل من `/admin/settings` ومحدش بيقراه، والميدل وير كان بيسيب أي حد
 *      **معاه كوكي `nb_admin`** يعدّي. والكوكي ده وجوده لوحده مش إثبات حاجة:
 *      أي زائر يقدر يكتبه من الـ console. دلوقتي البوابة تلات طبقات:
 *
 *        أ) كوكي `nb_admin` موجود   → فحص رخيص بيوفّر النداءات على الزوار.
 *        ب) جلسة سوبابيس صالحة      → `getUser()` بتتأكد منها على سيرفر سوبابيس.
 *        ج) صف `admin_users` نشط لنفس الشخص ودوره جوه `allow_roles`
 *           → القراية دي بتمشي بتوكن العضو نفسه، يعني **RLS** (سياسة `au_read`:
 *             `profile_id = auth.uid()`) هي اللي بتقرر، مش إحنا.
 *
 *      يعني الانتحال محتاج جلسة سوبابيس حقيقية لصف admin نشط — مش كوكي مكتوب
 *      بالإيد. (ب) و(ج) بيتنفّذوا وقت الصيانة بس، ولما الكوكي موجود بس.
 *
 *      `/admin/*` **بيفضل مفتوح** وقت الصيانة عن قصد: هو محمي أصلًا بجلسة
 *      لوحة + TOTP + `requirePermission` على السيرفر، وقفله ورا الصيانة كان
 *      هيخلق خطر إن المالك يقفل على نفسه من غير مكسب أمني.
 *
 * كله edge-safe: مفيش استيراد node-only، ومفيش مفتاح خدمة.
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
  /** أدوار اللوحة اللي بتفضل تشوف الموقع وهو مقفول — من `maintenance.allow_roles` */
  allow: string[]
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
    const r = await fetch(
      `${url}/rest/v1/maintenance?select=is_on,message_ar,allow_roles&id=eq.true`,
      {
        headers: { apikey: key, authorization: `Bearer ${key}` },
        cache: 'no-store',
      }
    )
    if (r.ok) {
      const rows = (await r.json()) as {
        is_on: boolean
        message_ar: string
        allow_roles: string[] | null
      }[]
      const row = rows[0]
      maintCache = {
        at: now,
        on: Boolean(row?.is_on),
        message: row?.message_ar ?? '',
        allow: Array.isArray(row?.allow_roles) ? row.allow_roles : [],
      }
      return maintCache
    }
  } catch {
    // نسيبها زي ما هي تحت
  }
  // فشل القراءة: نحافظ على آخر حالة معروفة، وإلا نفترض شغّال
  maintCache = {
    at: now,
    on: maintCache?.on ?? false,
    message: maintCache?.message ?? '',
    allow: maintCache?.allow ?? [],
  }
  return maintCache
}

/**
 * هل الطلب ده لواحد دوره مسموح له يعدّي وقت الصيانة؟
 *
 * الترتيب مقصود: الفحص الرخيص الأول (الكوكي) علشان الزائر العادي ما يكلّفناش
 * نداءين. الفحوصات اللي بعده هي اللي بتحكم فعلًا — وكلها بتوكن العضو نفسه،
 * فـ RLS هي الحكم مش الكود اللي هنا.
 *
 * أي وقوع = **مش مسموح**. الفشل مقفول، زي `requirePermission`.
 */
async function allowedThroughMaintenance(
  req: NextRequest,
  url: string,
  key: string,
  allow: string[]
): Promise<boolean> {
  if (!allow.length) return false
  if (!req.cookies.get(ADMIN_COOKIE)?.value) return false

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        // مفيش تجديد كوكيز في الفرع ده — إحنا بنقرا بس
        setAll: () => {},
      },
    })

    const { data: auth } = await supabase.auth.getUser()
    const uid = auth.user?.id
    if (!uid) return false

    const { data } = await supabase
      .from('admin_users')
      .select('role_key')
      .eq('profile_id', uid)
      .eq('is_active', true)
      .maybeSingle()

    const role = (data as { role_key: string } | null)?.role_key
    return Boolean(role && allow.includes(role))
  } catch {
    return false
  }
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
  if (!maint.on) return NextResponse.next()

  // الأدوار اللي في allow_roles بس هي اللي بتتفرّج على الموقع وهو مقفول
  if (await allowedThroughMaintenance(req, url, key, maint.allow)) {
    return NextResponse.next()
  }

  return maintenanceResponse(maint.message)
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
