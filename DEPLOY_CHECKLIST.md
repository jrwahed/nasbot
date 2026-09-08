# DEPLOY_CHECKLIST.md — نرفع «نسبوط» على Vercel

الملف ده مكتوب علشان تمشي عليه سطر سطر من غير ما تسأل حد.
كل خطوة فيها **إيه اللي تعمله** و**إزاي تتأكد إنها مشيت**.
لو حاجة وقعت، في آخر الملف قسم «لو حاجة وقعت».

---

## ⚠️ اتنين لازم يتعملوا قبل أول نشر — مش اختيار

### 1) دوّر مفتاح الخدمة (`SUPABASE_SERVICE_ROLE_KEY`)

المفتاح ده **اتلزق نص مكشوف وإحنا بنطوّر**. يعني اعتبره محروق.
هو مفتاح بيتخطى كل سياسات الصفوف (RLS) — اللي معاه بيقرا ويمسح أي حاجة في القاعدة.

**اعمل كده قبل ما ترفع:**

1. افتح Supabase ← **Project Settings ← API**.
2. جنب `service_role` اضغط **Reset / Rotate**.
3. انسخ المفتاح الجديد وحطه في Vercel (خطوة 3 تحت) وفي `.env.local` عندك.
4. اتأكد إن `.env.local` مش مرفوع على جيت: `git check-ignore -v .env.local`
   لازم يطبعلك سطر. لو مطبعش — **متكملش**، اظبط `.gitignore` الأول.
5. لو الملف اتعمله كوميت في أي وقت، المفتاح القديم لسه في تاريخ المستودع.
   دوّره تاني بعد ما تنضف التاريخ.

### 2) غيّر رقم فودافون كاش

في جدول `settings` لسه `vodafone_number = '010 0000 0000'` — ده **رقم وهمي**.
لو نشرت كده، الناس هتبعت فلوس لرقم مش بتاعك (أو لحد تاني خالص).

من Supabase ← **SQL Editor**:

```sql
update settings
   set vodafone_number = '010 XXXX XXXX',      -- رقمك الحقيقي
       instapay_handle = 'your-name@instapay'; -- وده كمان

select vodafone_number, instapay_handle from settings;
```

بعدها افتح صفحة الدفع في الموقع واتأكد إن الرقم اللي ظاهر هو رقمك.

---

## 0. قبل ما تبدأ — تأكيدات سريعة

- [ ] `npm run verify` بيعدي عندك محليًا (فحص النصوص + typecheck + build).
- [ ] عندك حساب Vercel، والمستودع على GitHub.
- [ ] عندك وصول لإعدادات الدومين (لو هتربط دومين).

---

## 1. اربط المستودع بـ Vercel

1. ادخل [vercel.com/new](https://vercel.com/new) واختار المستودع.
2. Vercel هيعرف لوحده إنه **Next.js** — سيب إعدادات البناء زي ما هي:
   - Build Command: `next build`
   - Output Directory: سيبه فاضي
   - Install Command: `npm ci`
3. **متضغطش Deploy لسه** — املا متغيرات البيئة الأول (خطوة 3).
4. الفروع:
   - `main` = **Production**
   - `dev` = **Preview** (ويفضّل تربطه بمشروع سوبابيس تاني للتجارب)

> الملف `vercel.json` موجود في المستودع ومش محتاج تلمسه. **متحطش فيه `regions`:**
> اختيار منطقة غير الافتراضية محجوز لخطة Pro، وعلى Hobby بيوقع النشر بعد ما
> البناء يعدّي. لو اتحوّلت Pro بعدين وعايز `fra1` (فرانكفورت، الأقرب لمصر)،
> ضيفها من إعدادات المشروع على Vercel مش من الملف.

---

## 2. المهام المجدولة — سيبها زي ما هي

**المهام شغالة على `pg_cron` جوه سوبابيس، مش على Vercel Crons.** ده قرار
متسجّل في `ADMIN_PLAN.md §0.2`: خطة Vercel المجانية بتسمح بـ **مهمتين بس**
و**مرة واحدة في اليوم**، وإحنا محتاجين مهام كل 5 و10 دقايق.

يعني: **متضيفش قسم `crons` في `vercel.json`.** لو ضفته هيفشل النشر على
الخطة المجانية، ولو مشي هيعمل ازدواج في التنفيذ.

---

## 3. متغيرات البيئة على Vercel

Project ← **Settings ← Environment Variables**. لكل متغير اختار البيئات
حسب الجدول.

| المتغير | البيئات | بتجيبه منين |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | الكل | Supabase ← Settings ← API ← Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | الكل | نفس الصفحة ← `anon` / `public` |
| `SUPABASE_SERVICE_ROLE_KEY` | Production + Preview | نفس الصفحة ← `service_role` — **الجديد بعد التدوير** |
| `NEXT_PUBLIC_SITE_URL` | Production | الدومين النهائي، مثال `https://nasbot.app` (من غير سلاش في الآخر) |
| `CRON_SECRET` | Production + Preview | ولّده: `openssl rand -hex 32` |
| `ADMIN_AUTH_PEPPER` | Production + Preview | ولّده: `openssl rand -hex 32` — **غير** الـ CRON_SECRET |
| `WHATSAPP_PROVIDER` | Production | `meta` |
| `WHATSAPP_TOKEN` | Production | Meta for Developers ← WhatsApp ← API Setup |
| `WHATSAPP_PHONE_ID` | Production | نفس الصفحة ← Phone number ID |
| `WHATSAPP_TEMPLATE_AUTH` | Production | اسم القالب المعتمد، الافتراضي `nasbot_auth_code` |
| `SMS_PROVIDER` · `SMS_PROVIDER_KEY` · `SMS_SENDER_ID` | Production | مزوّد الرسايل (لو فعّلته كبديل لواتساب) |
| `TEST_PHONE_ALLOWLIST` | **Development بس** | ⚠ سيبه **فاضي في الإنتاج** — بيخلي الرمز 1234 يعدي |

مش لازم تحطهم على Vercel: `SUPABASE_DB_URL` · `SITE_URL` · `BASE_URL` ·
`NEXT_DIST_DIR` · `MAX` — دول للطرفية والاختبارات المحلية بس.
و`RESEND_API_KEY` و`SENTRY_DSN` لسه مش متوصّلين في الكود.

الشرح الكامل لكل متغير في `.env.example`.

---

## 4. أسرار GitHub (علشان الفحص الآلي)

المستودع فيه `.github/workflows/verify.yml` بيشغّل `npm run verify` على كل
دفعة وكل Pull Request. البناء محتاج مفتاحين.

GitHub ← المستودع ← **Settings ← Secrets and variables ← Actions ←
New repository secret**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

لو مضفتهمش، الفحص **مش هيفشل** — هيستخدم قيم وهمية ويكمّل البناء.
ومتحطش `SUPABASE_SERVICE_ROLE_KEY` هنا خالص.

---

## 5. إعدادات سوبابيس اللي لازم تتراجع

### 5.1 عناوين الرجوع (Redirect URLs)

Supabase ← **Authentication ← URL Configuration**:

- **Site URL**: الدومين بتاعك، مثال `https://nasbot.app`
- **Redirect URLs**: ضيف دول كلهم —
  - `https://nasbot.app/**`
  - `https://*.vercel.app/**` (علشان نسخ المعاينة)
  - `http://localhost:3000/**` (للتطوير)

لو نسيت الخطوة دي، الدخول بالرمز هيرجّع المستخدم لمكان غلط.

### 5.2 سياسات التخزين (Storage)

Supabase ← **Storage**. لازم تلاقي دلوين:

- `avatars` — **خاص (private)**. الصور بتتقرا بروابط موقّعة، والسياسات
  بتسمح لصاحب الصورة وللكابتن وللأعضاء اللي بينهم إعجاب متبادل بس.
- `sbota-photos` — صور السبوتات، الكابتن بيرفع والأعضاء بيقروا.

اتأكد إن `avatars` **مش** `public`. لو بقى عام، صور الناس تبقى مكشوفة للكل.

> ملحوظة تقنية: `next.config.mjs` فاتح نطاق سوبابيس لـ `next/image` على
> `/storage/v1/object/public/**` و`/storage/v1/object/sign/**` — يعني الروابط
> الموقّعة بتشتغل عادي.

### 5.3 حماية القاعدة

- Supabase ← **Advisors ← Security** — لازم تكون خضرا (مفيش جدول من غير RLS).
- Supabase ← **Settings ← Database ← Network Restrictions** — سيبها مفتوحة،
  لأن Vercel بيتصل من عناوين متغيرة.

---

## 6. أول نشر

1. اضغط **Deploy**.
2. استنى البناء يخلص وافتح الرابط اللي Vercel هيديهولك.
3. لو البناء فشل، افتح **Deployments ← الأخير ← Building** واقرا آخر خطأ.
   في 90% من الحالات بيبقى متغير بيئة ناقص.

---

## 7. اتأكد إن pg_cron لسه شغال بعد النشر

النشر على Vercel **مش بيلمس** المهام — هي جوه القاعدة. بس اتأكد بنفسك.

Supabase ← **SQL Editor**:

```sql
-- المفروض تشوف 8 مهام كلهم active = true
select jobid, jobname, schedule, active
  from cron.job
 where jobname like 'nasbot-%'
 order by jobname;
```

المفروض تلاقي بالظبط دول:

| الاسم | كل قد إيه |
|---|---|
| `nasbot-expire` | 5 دقايق |
| `nasbot-reveal` | 10 دقايق |
| `nasbot-chats` | 10 دقايق |
| `nasbot-reminders` | 15 دقيقة |
| `nasbot-after` | 30 دقيقة |
| `nasbot-winback` | يوميًا 6 مساءً |
| `nasbot-metrics` | يوميًا 3 صباحًا |
| `nasbot-purge` | يوميًا 4 صباحًا |

وبعد ساعة من النشر، شوف إنهم فعلًا اشتغلوا:

```sql
select j.jobname, d.status, d.start_time, d.return_message
  from cron.job_run_details d
  join cron.job j on j.jobid = d.jobid
 where d.start_time > now() - interval '1 hour'
 order by d.start_time desc
 limit 30;
```

كله لازم يكون `succeeded`. لو لقيت `failed`، اقرا `return_message`.

---

## 8. الدومين

1. Vercel ← Project ← **Settings ← Domains ← Add**.
2. اكتب الدومين (`nasbot.app` مثلًا) وكمان `www.nasbot.app`.
3. Vercel هيديك سجلات DNS. عند مسجّل الدومين حط:
   - `A` للجذر `@` ← `76.76.21.21`
   - `CNAME` لـ `www` ← `cname.vercel-dns.com`

   خد القيم من شاشة Vercel نفسها — هي الأصح لو اتغيّرت.
4. استنى الانتشار (من دقايق لساعات) لحد ما Vercel يقول **Valid Configuration**.
5. الشهادة (HTTPS) بتتظبط لوحدها.
6. **بعد ما الدومين يشتغل:**
   - غيّر `NEXT_PUBLIC_SITE_URL` في Vercel للدومين الجديد و**اعمل نشر تاني**.
     المتغير ده بيدخل في `sitemap.xml` و`robots.txt` وقت البناء، فمن غير نشر
     تاني هيفضلوا على العنوان القديم.
   - ارجع لخطوة 5.1 وحدّث **Site URL** و**Redirect URLs** في سوبابيس.

> الموقع بيبعت رأس `Strict-Transport-Security` بـ `preload`. يعني بعد أول
> زيارة المتصفح هيرفض يفتح الموقع على http خالص. ده مقصود — بس اعرف إنه
> صعب يترجع فيه، فمتربطش دومين إنت مش متأكد منه.

---

## 9. جرّب الموقع بعد ما ينزل (smoke test)

امشي على دول بالترتيب على الدومين الحقيقي:

- [ ] الرئيسية `/` بتفتح، الخط عربي مظبوط، والاتجاه من اليمين.
- [ ] بدّل الوضع (نهاري/ليلي) — مفيش وميض أول ما الصفحة تفتح.
- [ ] `/one` بتجيب سبوتة · `/map` الخريطة ظاهرة والنقط بتنبض.
- [ ] `/game` اللعبة تمشي لآخرها، و`/game/result` بتطلع الكارت
      و**زرار التنزيل/المشاركة شغال** (ده بيستخدم `data:` — لو وقع يبقى CSP).
- [ ] الدخول برقم موبايل حقيقي: الرمز بيوصل على واتساب والدخول بينجح.
- [ ] الحجز لحد صفحة الدفع، و**رقم فودافون الظاهر هو رقمك** مش الوهمي.
- [ ] الشات: افتح محادثة من جهازين وابعت رسالة — لازم تظهر عند التاني
      **من غير Refresh**. لو مظهرتش غير بعد تحديث، الريل-تايم مقفول (شوف تحت).
- [ ] `/admin` بتطلب دخول، ومش بتفتح من غير جلسة.
- [ ] افتح `https://your-domain/robots.txt` — لازم تلاقي `Disallow: /admin`
      وسطر `Sitemap:` بالدومين الصح (مش localhost).
- [ ] افتح `https://your-domain/sitemap.xml` — الروابط بالدومين الصح.
- [ ] افتح **F12 ← Console** وإنت بتلف في الموقع: لازم يكون **فاضي من أخطاء
      CSP**. أي سطر فيه `Refused to ...` معناه إن فيه حاجة اتمنعت.
- [ ] **F12 ← Network** ← اختار أي طلب ← Headers، وشوف الرؤوس دي موجودة:
      `content-security-policy` · `strict-transport-security` ·
      `x-frame-options: DENY` · `x-content-type-options: nosniff`.
- [ ] على `/admin` تحديدًا: لازم يكون فيه رأس `x-robots-tag: noindex, nofollow`.

---

## 10. لو حاجة وقعت

### البناء فشل على Vercel
اقرا آخر 20 سطر في اللوج. الأغلب:
- متغير بيئة ناقص ← ضيفه واعمل **Redeploy**.
- خطأ TypeScript ← شغّل `npm run verify` محليًا وصلّحه، وادفع تاني.
- لو مستعجل وعايز ترجع لآخر نسخة كانت شغالة: **Deployments ← النسخة القديمة ←
  ⋯ ← Promote to Production**.

### الشات مش بيحدّث لوحده / الريل-تايم ميت
1. F12 ← Console. لو لقيت `Refused to connect to 'wss://...'` — دي CSP.
   الحل في `next.config.mjs` في توجيه `connect-src`، لازم يكون فيه
   `wss://*.supabase.co` جنب `https://*.supabase.co`. (المفروض موجود.)
2. لو مفيش خطأ CSP: Supabase ← **Database ← Replication** واتأكد إن جدول
   `messages` مضاف لـ `supabase_realtime`.

### الصفحة طلعت بيضا والـ Console مليان `Refused to ...`
ده CSP بيمنع حاجة جديدة (سكريبت خارجي، خط خارجي، أي دومين تاني).
**متشيلش الـ CSP كلها.** افتح `next.config.mjs` وضيف الدومين ده في التوجيه
اللي الخطأ بيسمّيه بالظبط (`script-src` / `img-src` / `connect-src` …) وبس.

### الصور مش ظاهرة
غالبًا نطاق سوبابيس مش مسموح لـ `next/image`. شوف `images.remotePatterns` في
`next.config.mjs` — لازم يشمل نطاق مشروعك. وكمان اتأكد إن
`NEXT_PUBLIC_SUPABASE_URL` متحطط على Vercel، لأن النطاق بيتقري منه وقت البناء.

### الدخول بيرجّعني لصفحة غلط بعد الرمز
Redirect URLs في سوبابيس (خطوة 5.1) ناقصة أو فيها الدومين القديم.

### المهام واقفة
```sql
select jobname, active from cron.job where jobname like 'nasbot-%';
```
لو مهمة `active = false`، رجّعها:
```sql
select cron.alter_job(
  (select jobid from cron.job where jobname = 'nasbot-expire'),
  active := true
);
```
لو الجدول فاضي خالص، يبقى الهجرة `0027_weekly_metrics_and_cron.sql` مترجعتش —
شغّلها تاني.

### حد قال إن مفتاح الخدمة اتسرب
1. Supabase ← Settings ← API ← **Reset service_role**.
2. حدّث `SUPABASE_SERVICE_ROLE_KEY` في Vercel وفي `.env.local`.
3. **Redeploy**.
4. راجع `audit_log` على أي فعل غريب.

---

## 11. حاجات صغيرة متأجّلة (مش بتوقف النشر)

- **أيقونات التطبيق:** `public/manifest.webmanifest` موجود بالاسم والألوان
  الصح، بس **من غير أيقونات** لأن مفيش ملفات أيقونات في `public/`. لما تجهّز
  `icon-192.png` و`icon-512.png` وتحطهم في `public/`، ضيف مصفوفة `icons`.
- **ربط الـ manifest:** لسه محتاج سطر `manifest: '/manifest.webmanifest'` جوه
  `metadata` في `src/app/layout.tsx` علشان المتصفح ياخد باله منه.
- **مسارات `/api/cron/[job]`:** لسه متعملتش. مش محتاجينها دلوقتي — `pg_cron`
  بيعمل الشغل. تتعمل بس لو قررت تنقل لـ Vercel Pro.
