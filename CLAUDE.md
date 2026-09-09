# CLAUDE.md — قاموس مشروع «نسبوط»

> أي إيجنت أو شخص بيفتح المشروع: **اقرأ الملف ده الأول.** هو خريطة المشروع
> وقواعده وطريقة الشغل فيه. مكتوب بالعربي علشان صاحب المشروع يقراه، والمصطلحات
> التقنية بالإنجليزي. لو غيّرت بنية المشروع، حدّث الملف ده.

---

## ١. إيه هو نسبوط

نادي خروجات مع ناس جُدد في القاهرة. 8 بس في السبوطة، كابتن مع كل مجموعة،
والمجموعة بتتكشف قبل الخروجة بيوم. **مفيش عضوية.** فيه كمان طبقة **«الشغل»**
للفريلانسرز (سبوطات شغل نهارية + كارت مدفوع مقدم + يوم أسبوعي ثابت).

- **منشور على:** Vercel — `https://nasbot.vercel.app`
- **القاعدة:** Supabase (مشروع `nutmgtulrqrfaysrigfi`، منطقة `eu-north-1`)
- **الفرع:** التطوير على `claude/adoring-davinci-xmlaz6`، والنشر من `main`

---

## ٢. المكدّس والأوامر

- **Next.js 15.1.12** (App Router) · **React 19** · **TypeScript strict** · **Tailwind**
- **Supabase** (Postgres 17 + Auth + Storage + RLS + pg_cron + pg_net)
- **الإيميل:** SMTP (Gmail) عبر `nodemailer` — شغّال. الواتساب **مش** متفعّل.

```bash
npm run dev            # تطوير
npm run verify         # check:copy + tsc --noEmit + next build  ← شغّله قبل أي رفع
node scripts/check-copy.mjs   # حارس النصوص العربية
```
البناء على Vercel بيتجاهل `NEXT_DIST_DIR` (شوف `next.config.mjs`). Node مثبّت `22.x`.

---

## ٣. القواعد الحاكمة — ممنوعات مطلقة

1. **ممنوع نص عربي في أي مكوّن** تحت `src/app` أو `src/components` (ما عدا `src/app/admin/**`). كل نص بيمر بـ `const t = useT()` ومفتاحه في `copy_strings`. الحارس `scripts/check-copy.mjs` بيفشل البناء لو خالفت.
2. **كل رقم في `settings`، مش في الكود** — سعر، نسبة، ميعاد، حد. لو رقم في الكود، ده باج (شوف `REVIEW_ADMIN.md` قايمة «المفروض من اللوحة»).
3. **الأمان من RLS مش من إخفاء الأزرار.** أي فعل حساس لازم يترفض على الخادم. مفتاح الخدمة `SUPABASE_SERVICE_ROLE_KEY` ممنوع يوصل المتصفح.
4. **الفلوس بالقروش (piastres)** في القاعدة، وبالجنيه في الواجهة (`toPounds`/`toPiastres` في `map-db.ts`).
5. **الدفع تحويل يدوي** (فودافون كاش / إنستا باي) + اعتماد من اللوحة (`fn_approve_transfer`). مفيش بوابة.
6. **كلمات ممنوعة في النصوص:** تعارف · شريك · إعجاب · فعالية · تذكرة · باقة · منصة · مستخدم · اكتشف. النبرة عامية مصرية.
7. **الهوية:** مش تطبيق تعارف (مفيش صور قبل الكشف، الاختيار سري)، ومش موقع تذاكر (الكابتن والمجموعة هما المنتج). الألوان: `#F4632A` برتقالي · `#14161A` غامق · `#FBF7EF` كريمي · `#2B4CFF` كوبالت · `#EFE3CF` رملي. مفيش ظلال ناعمة ولا تدرجات ولا أبيض ناصع.

---

## ٤. البنية

```
src/
  app/
    (عام)        /  /one  /map  /rules  /captains  /join  /login  /me  /game …
    s/[slug]     صفحة السبوطة + /pay + /done
    my/[id]      حجزي + /chat + /review
    shoghl/      طبقة الشغل: /  /[slug]  /[slug]/pay  /pass  /amaken
    me/shoghl    شغلي (الكارت + اليوم الثابت + شغالين معاك)
    admin/       اللوحة (20 قسم — شوف §7)
    api/         otp · pay(create/transfer/pass) · admin · account/ensure ·
                 copy/revalidate · cron/* · health/mail
  components/    مكوّنات الواجهة + components/work/* لطبقة الشغل + admin-ui.tsx
  data/          نصوص احتياطية + قوايم (⚠ بعضها المفروض في القاعدة — REVIEW)
  lib/           طبقة البيانات والمنطق (§5)
  lib/server/    server-only: admin-auth · mailer · otp · supabase-admin · whatsapp
supabase/migrations/   كل تغييرات القاعدة، بالترتيب الزمني في الاسم
scripts/         check-copy · فاحصات · بذور النصوص
```

### الملفات المفتاحية
| الملف | مسؤول عن |
|---|---|
| `src/lib/api.ts` | **طبقة البيانات الأساسية** — كل قراءة/كتابة للموقع العام. لو `hasSupabase=false` بترجع `api-mock.ts` |
| `src/lib/work.ts` · `collab.ts` | طبقة الشغل والتعاون |
| `src/lib/map-db.ts` | تحويل صفوف القاعدة ↔ أنواع الواجهة، والفلوس |
| `src/lib/copy.ts` | قراءة `copy_strings` بكاش موسوم (`COPY_TAG`) |
| `src/lib/server/admin-auth.ts` | `requirePermission` — الحد الأمني الحقيقي للوحة |
| `src/lib/supabase.ts` | عميل المتصفح (anon). `hasSupabase` بيتأكد إن المتغيرين موجودين |
| `src/middleware.ts` | حارس `/admin/*` على الحافة (طبقة أولى مش الحد الأمني) |

---

## ٥. القاعدة — أهم الجداول والدوال

**الجداول:** `profiles` · `sbotat`(+`sbotat_public`) · `sbota_templates` · `venues` · `bookings` · `payments` · `wallet_ledger` · `coupons` · `pair_affinity` · `matching_runs` · `chat_rooms`/`chat_members` · `notifications`/`notification_templates` · `admin_users`/`admin_roles`/`role_permissions` · `settings`(صف واحد) · `copy_strings` · `audit_log`. **طبقة الشغل:** `professions` · `work_venues` · `work_passes` · `pass_redemptions` · `recurring_bookings` · `work_affinity` · `venue_reports` · `leads` · `work_metrics`.

**دوال مهمة:** `fn_can_book` · `fn_capacity_guard` (قفل السعة) · `fn_booking_paid` · `fn_cancel_booking` · `fn_approve_transfer` · `fn_redeem_pass`/`fn_revert_pass`/`fn_activate_pass` · `fn_build_matching`/`fn_build_work_matching` · `fn_reveal` · `fn_pair_want`/`fn_work_want` (الطريق الصح لكتابة التبادل) · `fn_is_admin`/`fn_has_permission`.

**⚠ الأمان الحرج:** كتابة التبادل **لازم** عبر `fn_pair_want`/`fn_work_want` (كتابة مباشرة على جداول affinity كانت ثغرة — شوف REVIEW S1/S2). وسياسات الفلوس لازم `fn_has_permission` مش `fn_is_admin`.

**المهام المجدولة (pg_cron جوه Supabase، مش Vercel Cron):** الكشف · التذكير · قفل الشات · المقاييس · التنضيف · مهام الشغل الأربعة · إشعارات الشغل. الجدولة في `RUNBOOK.md` و`WORK_CRON.sql`.

---

## ٦. طريقة تطبيق تغييرات القاعدة (مهم)

الإيجنت **ما عندوش وصول مباشر للقاعدة**. فأي تغيير قاعدة:
1. يتكتب ملف هجرة في `supabase/migrations/` (اسمه `<timestamp>_<NNNN>_<وصف>.sql`).
2. يتجمّع في ملف `WORK_MIGRATION_N.sql` في الجذر بترويسة عربي.
3. **صاحب المشروع** بيلزقه في Supabase ← SQL Editor ← Run.

⚠ محرر SQL بيشغّل الملف كـ **معاملة واحدة**، وPostgres ما بيسمحش تستخدم قيمة `enum` جديدة في نفس المعاملة اللي أضافتها → لو في `alter type ... add value`، اعزله في ملف لوحده يتشغّل الأول. (ده اللي خلّى `WORK_MIGRATION` اتقسم لـ 1 و2.)

كل هجرة: `if not exists`/`create or replace`/`on conflict` — آمنة تتكرر. ومعاها دالة اختبار `test_*` بترجّع صفوف «نجح/فشل».

---

## ٧. اللوحة `/admin`

الأقسام: الرئيسية · النصوص · اللعبة · حقول التسجيل · القوالب · السبوطات · الحجوزات · المطابقة · الناس · الكباتن · الفلوس · البلاغات · الرسائل · الخريطة · الإعدادات · **الشغل** · **الفريق** · السجل. الدخول: إيميل + باسورد + تطبيق مصادقة (TOTP). الأدوار: `owner`·`admin`·`ops`·`finance`·`support`.

**نمط الكتابة الصح في اللوحة:** بعد أي `update/insert` اعمل `.select('id')` واعتبر المصفوفة الفاضية = القاعدة رفضت (مش نجاح). الحارس ده موجود في `/admin/shoghl` و`/admin/team`.

---

## ٨. الحالة الحالية (٢٠٢٦-٠٩-٠٩)

- ✅ منشور وشغّال · دخول إيميل+باسورد · لوحة كاملة · طبقة الشغل (المراحل ١-٦) · إيميل بجدولة.
- 🔴 **مراجعة شاملة عاملة `REVIEW.md`** (+ 4 ملفات تفصيلية) لقت 150 نتيجة، 37 حمرا. **التصليح شغّال دلوقتي.** اقرأ `REVIEW.md` قبل ما تكمّل أي حاجة.
- ⚠ **قبل توزيع اللينك:** رقم فودافون كاش/إنستا باي في `settings` لسه وهمي (`/admin/settings`)، ولازم الأحمر يتصلّح.

### ملفات التوثيق
`README.md` · `DB_PLAN.md` · `ADMIN_PLAN.md` · `WORK_PLAN.md` · `DESIGN_TOKENS.md` · `COPY.md` · `ADMIN_GUIDE.md` · `RUNBOOK.md` · `DEPLOY_CHECKLIST.md` · **`REVIEW*.md`** (المراجعة) · ملفات `WORK_MIGRATION_*.sql` و`WORK_CRON.sql` (تتلزق في SQL Editor).

---

## ٩. لو انت إيجنت جديد بتكمّل — ابدأ من هنا

1. اقرأ الملف ده كله + `REVIEW.md`.
2. `npm install` ثم `npm run verify` — لازم يعدّي قبل أي شغل.
3. أي تغيير: اتبعه في **كل الطبقات** (قاعدة → `api.ts` → واجهة → لوحة → نصوص → بذرة → توثيق). ممنوع تصلّح حتة وتسيب حتة.
4. رقم → `settings`. نص → `copy_strings`. مفيش استثناء.
5. تغيير قاعدة → ملف هجرة + `WORK_MIGRATION_N.sql` للمالك يلزقه (§6).
6. قبل الرفع: `npm run verify` + لقطة للصفحة المتأثرة. كل تعديل كوميت لوحده بالعربي.
7. الأمان: متضعّفش سياسة عشان تخلّص، ومتحطش سر في الكود، ومتكتبش على جداول التبادل مباشرة.
