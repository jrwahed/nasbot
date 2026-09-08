# ADMIN_PLAN.md — لوحة تحكم «نسبوط» والتجهيز للنشر

خطة كاملة قبل أي كود. مبنية على الحالة الفعلية للمشروع دلوقتي:
**37 جدول · 42 دالة · 62 سياسة · 8 مهام مجدولة · 14 قالب رسالة.**

---

## 0. ثلاث حاجات لازم نتفق عليها الأول

### 0.1 الدفع — البرومبت بيناقض آخر قرار منك ⚠

البرومبت (§5.4) بيقول أعمل **ويبهوك بايموب**. بس آخر تعليمة منك كانت:

> «غلوز الدفع يبقى على مانوال عادي على فودافون كاش أو إنستا باي، لسه مش هحوّلها تجاري دلوقتي»

ونفّذتها بالفعل: البوابة والويبهوك **اتشالوا خالص**.

**هكمّل على قرارك الأحدث — يدوي بس.** واللوحة هتكون فيها كل أدوات المراجعة
اليدوية (§3.9). ولو غيّرت رأيك، الرجوع لبوابة موصوف في `RUNBOOK.md §11`.

### 0.2 المهام المجدولة — pg_cron ولا Vercel Crons؟

البرومبت (§5.3) بيقول **اختار واحد وثبّته**. الاختيار مش متكافئ:

| | pg_cron (شغّال دلوقتي) | Vercel Crons |
|---|---|---|
| أقل تكرار | **كل دقيقة** | Hobby: **مرة واحدة يوميًا بس** · Pro: كل دقيقة |
| عدد المهام | مفتوح | Hobby: **2 بس** · Pro: 40 |
| التكلفة | مجاني (جوه سوبابيس) | محتاج **Pro بـ $20/شهر** |
| بيشتغل لو الموقع نايم؟ | ✅ في القاعدة | ✅ |
| الحالة | **8 مهام شغالة ومتجرّبة** | لسه |

البرومبت طالب مهام كل 5 و10 دقايق — **ده مستحيل على Vercel Hobby**.

**التوصية: نفضل على pg_cron.** وهعمل مسارات `app/api/cron/[job]` محمية بـ
`CRON_SECRET` **كمان**، علشان لو حبيت تنقل لـ Vercel Pro يبقى الطريق جاهز —
بس المفعّل هيفضل pg_cron.

### 0.3 «مفيش نص عربي في أي مكوّن» — الحجم الحقيقي

قِست المشروع:

| | العدد |
|---|---|
| نصوص عربية في **الواجهات والمكونات** (ده اللي هيتنقل) | **339 نص في 41 ملف** |
| نصوص في `src/data/*` | موجودة في القاعدة أصلًا — دي بيانات احتياطية |
| نصوص في `src/types/index.ts` | **قيم أنواع** (`'بنت' \| 'شاب'`) — جزء من نظام الأنواع، ما تتنقلش |
| نصوص في `src/lib/map-db.ts` | جداول ترجمة إنجليزي↔عربي — بنية مش محتوى |

**يعني الرقم الحقيقي 339 نص.** سكريبت الترحيل هيمشي عليهم، وسكريبت الفحص
هيفشل البناء لو لقى نص عربي معروض في مكوّن — **مع استثناءات مكتوبة صراحة**
للأنواع وجداول الترجمة، وإلا هنكسر TypeScript.

---

## 1. اللي هيفضل في الكود — وده مقصود

مكتوب في `ADMIN_GUIDE.md` كمان علشان يبقى واضح لأي حد:

| بيفضل في الكود | ليه |
|---|---|
| **تخطيط الصفحات** (ترتيب الأقسام وشكلها) | لو خليناه قابل للتعديل بنبني منشئ مواقع — والهوية البصرية هتضيع |
| **منطق الدفع والأمان** | RLS والتحقق من الأدوار — مش محتوى |
| **خوارزمية المطابقة نفسها** | الكود ثابت، بس **أوزانها وقواعدها تتعدل من اللوحة** |
| **مكتبة الأيقونات** | مرسومة SVG — اللوحة بتختار منها بس |
| **الألوان والخطوط والمسافات** | من ملف التصميم — تغييرها بيكسر المطابقة |

---

## 2. الجداول الجديدة

### 2.1 الأدوار والصلاحيات

```
admin_roles        key(owner|admin|ops|finance|support) · name_ar · description_ar · rank
admin_permissions  key(content.edit · payments.refund · …) · name_ar · group_ar
role_permissions   role_key → permission_key
admin_users        profile_id · role_key · totp_secret(مشفّر) · totp_enabled_at
                   · last_login_at · last_ip · is_active
admin_sessions     id · admin_user_id · created_at · last_seen_at · expires_at · ip · ua
```

**الأدوار الخمسة** بصلاحياتها زي ما البرومبت حدد بالظبط.
`captain` مش دور لوحة — هو موجود في `profiles.role` وله لوحته المنفصلة.

### 2.2 المحتوى

```
copy_strings       key(فريد) · value_ar · context_ar · screen · max_length
                   · is_html · updated_by · updated_at
copy_history       copy_key · value_ar · changed_by · changed_at   (للرجوع بضغطة)
banned_words       word · added_by            (قائمة الممنوعات تتعدل)
```

**المفتاح** بالشكل `screen.section.element` — مثال `home.hero.button`.

### 2.3 اللعبة

```
game_questions      order · question_ar · kind(single|multi|text) · is_active
                    · required · help_ar · progress_label_ar
game_options        question_id · order · label_ar · icon_key · value · is_active
game_option_scores  option_id · type_key · points        (شبكة النقاط)
personality_types   key · name_ar · name_ar_f · line_ar · sticker_bg · sticker_fg
                    · recommended_template_ids[] · is_active · order
game_sessions       (تحليلات) profile_id · answers · result_type · completed_at
                    · abandoned_at_question
```

> `name_ar_f` = صيغة المؤنث — موجودة أصلًا في الكود ولازم تفضل.

### 2.4 حقول الحساب

```
profile_fields      key · label_ar · help_ar · is_required · is_active · step
                    · order · validation(jsonb) · error_ar
field_options       field_key · value · label_ar · order · is_active
                    (بتغطي: interests · areas · budgets · free_slots · skill_levels)
skill_activities    key · label_ar · order · is_active
consents            key · text_ar · version · requires_reconsent · published_at
consent_accepts     profile_id · consent_key · version · accepted_at
```

`interests` موجود أصلًا — هيتوسّع بـ `order` و`is_active`.

### 2.5 المزايا والصيانة

```
feature_flags      key(game|map|mystery|work_sbota|chat|referral|booking)
                   · is_on · off_message_ar · updated_by
maintenance        is_on · message_ar · allow_roles[]   (صف واحد)
```

### 2.6 توسعة `settings`

الجدول فيه **18 عمود** دلوقتي. هيتزود عليه:

```
min_to_run_default · reveal_hour · chat_open_hours · chat_close_hours
weather_rules(jsonb لكل نشاط) · first_time_work_discount
max_interests · min_age · min_age_overnight
metric_thresholds(jsonb: قتل/تحويل/استمرار للأرقام الثمانية)
day_mode_start_hour · day_mode_end_hour
match_max_age_gap · match_min_starters · match_girls_ratio_min/max
match_mutual_weight · match_no_show_limit · algorithm_version
daily_broadcast_limit
```

### 2.7 التشغيل

```
admin_tasks        (المهام الحية في الرئيسية — عرض محسوب مش جدول)
broadcasts         segment(jsonb) · template_key · recipients_count
                   · sent_count · created_by · status
provider_alerts    venue_id · reason · created_at · resolved_at
```

---

## 3. خريطة صفحات اللوحة

```
/admin                      الرئيسية — الأرقام والمهام
/admin/login                رمز واتساب + TOTP
/admin/content              النصوص (بالشاشة) + معاينة حية
/admin/game                 الأسئلة · الاختيارات · شبكة النقاط · الأنواع · المحاكي
/admin/profile-fields       حقول التسجيل والقوائم والموافقات
/admin/templates            قوالب السبوطات
/admin/sbotat               المواعيد (تقويم + جدول) · متكرر · نسخ · إلغاء
/admin/bookings             الحجوزات · الانتظار · الحضور
/admin/matching             المطابقة بالسحب والإفلات + الأوزان
/admin/people               المستخدمين + صفحة الشخص
/admin/captains             الكباتن · الطلبات · المقدمين والأماكن
/admin/payments             المعاملات · الإيصالات · الاسترداد · المحفظة · الكوبونات · المستحقات
/admin/reports              البلاغات والأمان
/admin/notifications        القوالب · المواعيد · الطابور · الإرسال الجماعي
/admin/map                  المناطق ومواضعها
/admin/settings             كل الأرقام + مفاتيح المزايا + الصيانة
/admin/audit                سجل الحركة
```

---

## 4. إزاي النص هيوصل للموقع

```
مكوّن  →  t('home.hero.button')
             ↓
        getCopy()  →  unstable_cache(tag: 'copy')
             ↓
        copy_strings في القاعدة

الحفظ في اللوحة  →  revalidateTag('copy')  →  التغيير يبان خلال ثواني
```

**الوسوم:** `copy` · `game` · `templates` · `settings` · `flags` · `fields`.

`t()` بترجع المفتاح نفسه لو مالقاش النص (وبيتسجّل تحذير) — يعني نص ناقص
ما بيكسرش الصفحة.

**الاحتياطي:** لو القاعدة مش متاحة، `t()` بترجع من ملف `src/data/copy-fallback.ts`
اللي بيتولّد من سكريبت الترحيل — فالموقع يفضل شغّال بالعربي حتى من غير قاعدة.

---

## 5. الأمان

| الطبقة | إيه |
|---|---|
| Middleware | `/admin/*` بيطلب جلسة لوحة صالحة، وإلا `/admin/login` |
| الخادم | كل Server Action بتبدأ بـ `requirePermission('payments.refund')` — **مش إخفاء الزر** |
| القاعدة | RLS: `fn_has_permission(key)` بتتنادى في السياسات |
| الجلسة | 4 ساعات · خمول 30 دقيقة · TOTP إجباري لكل الأدوار |
| السجل | كل فعل في `audit_log` بالفاعل والقبل والبعد والـ IP |
| حماية المعدل | على `/admin/login` كمان مش الموقع بس |

**اختبارات الصلاحيات:** لكل دور، محاولة فعل مش من حقه لازم **تترفض على الخادم**
حتى لو اتنادت مباشرة.

---

## 6. النشر على Vercel

| البند | القرار |
|---|---|
| المنطقة | `fra1` (الأقرب لمصر) |
| المهام | **pg_cron** (§0.2) + مسارات `/api/cron/[job]` جاهزة كبديل |
| الصور | `next/image` + نطاق سوبابيس في `remotePatterns` |
| الرؤوس | CSP · HSTS · `X-Frame-Options` · `noindex` على `/admin` |
| الحزمة | اللوحة `dynamic import` — ما تتحملش على الزوار |
| البيئات | `main` = إنتاج · `dev` = معاينة على مشروع سوبابيس تاني |
| التحقق | `npm run verify` = typecheck + lint + build + test، وفي GitHub Action |

**ملفات جديدة:** `vercel.json` · `.github/workflows/verify.yml` ·
`public/manifest.webmanifest` · `app/robots.ts` · `app/sitemap.ts` ·
`DEPLOY_CHECKLIST.md` · `ADMIN_GUIDE.md`.

---

## 7. الترتيب

| # | المرحلة | الناتج |
|---|---|---|
| 1 | **الموافقة على الخطة دي** | — |
| 2 | هجرات الجداول الجديدة (§2) | ~10 هجرات |
| 3 | ترحيل الـ339 نص + `t()` + سكريبت الفحص | مفيش نص عربي في مكوّن |
| 4 | الأدوار والدخول و TOTP و Middleware | `/admin/login` |
| 5 | الرئيسية والمهام | `/admin` |
| 6 | النصوص + المعاينة الحية | `/admin/content` |
| 7 | اللعبة + شبكة النقاط + المحاكي | `/admin/game` |
| 8 | حقول الحساب والقوائم | `/admin/profile-fields` |
| 9 | القوالب والمواعيد والمتكرر والإلغاء | `/admin/templates` · `/admin/sbotat` |
| 10 | الحجوزات والحضور | `/admin/bookings` |
| 11 | المطابقة بالسحب والأوزان | `/admin/matching` |
| 12 | الناس · الكباتن · المقدمين | 3 صفحات |
| 13 | المدفوعات والفلوس | `/admin/payments` |
| 14 | البلاغات · الإشعارات · الخريطة | 3 صفحات |
| 15 | الإعدادات ومفاتيح المزايا والصيانة | `/admin/settings` |
| 16 | السجل والتصدير | `/admin/audit` |
| 17 | اختبارات الصلاحيات والأفعال | Playwright |
| 18 | تجهيز Vercel + الوثائق | `DEPLOY_CHECKLIST.md` · `ADMIN_GUIDE.md` |

**بعد كل مرحلة:** لقطة شاشة + اختبار للفعل الأساسي فيها.

---

## 8. حاجات لازم تعرفها قبل ما نبدأ

### 8.1 مفتاح الخدمة لسه ناقص — وده بيوقف حاجات

`SUPABASE_SERVICE_ROLE_KEY` فاضي في `.env.local`. من غيره:

- **الدخول للوحة مش هيشتغل** (بيحتاج إنشاء جلسة على الخادم)
- الدخول العادي بالرمز مش هيشتغل
- سكريبت تصدير الهجرات مش هيشتغل

هكمّل بناء كل حاجة، بس **تجربة الدخول للوحة من الآخر للآخر هتستنى المفتاح**.
تجيبه من: لوحة سوبابيس ← Project Settings ← API ← `service_role`.

### 8.2 النشر الفعلي على Vercel محتاجك

أقدر أجهّز كل الملفات والإعدادات وأتأكد إن `npm run verify` بيعدي. بس:
- **ربط المستودع بـ Vercel** ومتغيرات البيئة — محتاج حسابك
- **الدومين** — محتاج وصول لإعدادات النطاق

هجهّز كل حاجة وأكتبلك الخطوات بالظبط في `DEPLOY_CHECKLIST.md`.

### 8.3 الحجم

ده أكبر جزء في المشروع لحد دلوقتي: **~17 صفحة لوحة · ~20 جدول جديد ·
339 نص هيتنقلوا**. هشتغل بالترتيب في §7 وأوريك النتيجة بعد كل مرحلة، وتقدر
توقفني أو تغيّر الأولويات في أي وقت.

لو عايز تبدأ بجزء معيّن (مثال: اللعبة والنصوص بس — وهما أهم حاجة طلبتها)،
قولّي وأبدأ بيه.

### 8.4 حاجة صغيرة اتلاحظت

`/admin` الحالية (اللي بنيتها في المرحلة اللي فاتت) فيها **51 نص عربي** في
الكود. هتتعاد كتابتها بالكامل في المرحلة 5 وما بعدها — النصوص بتاعة **اللوحة
نفسها** هتفضل في الكود (مش محتاجة تتعدل من اللوحة)، وده مقصود ومكتوب في §1.
