# WORK_PLAN.md — طبقة «الشغل» للفريلانسرز

> **الحالة:** خطة للمراجعة. مفيش هجرة ولا صفحة اتكتبت بعد.
> اتكتبت بعد فحص الجداول والدوال والمهام **الموجودة فعلًا** في `supabase/migrations/` و`src/`،
> فكل حاجة تحت إما بتمتد على موجود وبتقول على إيه، أو جديدة وبتقول ليه.

---

## 0. قبل ما تقرا — 6 حاجات في البرومبت مختلفة عن واقع المشروع

البرومبت مكتوب على افتراضات عامة. دي النقط اللي **لازم تقرّر فيها** أو تعرف إني غيّرتها:

| # | البرومبت بيقول | الواقع في المشروع | اللي هعمله |
|---|---|---|---|
| 1 | مهام مجدولة على **Vercel Cron** | `ADMIN_PLAN §0.2`: القرار إن المهام على **pg_cron جوه سوبابيس**، لأن Vercel Hobby بتسمح بمهمتين يوميًا بس — و`DEPLOY_CHECKLIST §2` بتقول «متضيفش crons في vercel.json». عندنا 8 مهام شغالة بالنظام ده (`job_reminders`, `job_metrics`…) | **pg_cron** — 4 دوال `job_work_*` بنفس نمط الموجود. لو اتحوّلت Pro بعدين ممكن تتنقل، بس مفيش سبب |
| 2 | «الدفع بنفس مسار الدفع الموجود» | المسار الموجود **تحويل يدوي** (فودافون كاش / إنستا باي) + **اعتماد من اللوحة** (`fn_approve_transfer`). مفيش بوابة | شراء الكارت = تحويل يدوي → الكارت بيتعمل بحالة `pending` → بيبقى `active` لما الإدارة تعتمد. **النص لازم يقول ده صريح**: «هنفعّل كارتك أول ما نتأكد من التحويل — عادةً خلال ساعات» |
| 3 | «كل رقم في `settings`» | `settings` **صف واحد بأعمدة** (مش key/value) | أعمدة جديدة على `settings` بنفس النمط (القسم 1.4) |
| 4 | الهجرات تتطبّق | أنا **ما عنديش وصول للقاعدة** (`nutmgtulrqrfaysrigfi` مش في الحساب المربوط، والشبكة محجوبة) | هكتب الهجرات كملفات في `supabase/migrations/` **+ ملف واحد مجمّع `WORK_MIGRATION.sql`** تلزقه في SQL Editor مرة واحدة. الاختبارات هكتبها SQL تشغّلها بنفسك (زي `0017_rls_tests`) |
| 5 | النصوص في `copy_strings` | صح، وده مفروض بالسكريبت. بس أنا ما أقدرش أكتب في القاعدة | كل مفتاح جديد في `copy-fallback.ts` + `copy-seed.json` (الموقع بيشتغل بيهم فورًا لأن الفولباك بيتدمج)، **+ ملف `WORK_COPY.sql`** يحقنهم في `copy_strings` علشان يتعدّلوا من اللوحة |
| 6 | «الجدول `venues` — عمود `is_work_venue`» | `venues` موجود وفيه `kind venue_kind_t` (padel_club, kayak, cafe, …) و`wholesale_price` عام | بدل عمود منفصل: قيمتين جداد في `venue_kind_t` (`cafe_work`, `coworking`) + جدول `work_venues` للمواصفات. وسعر الجملة **الخاص بالكرسي** في `work_venues.wholesale_seat_price` (مش `venues.wholesale_price` اللي للسبوطات العادية) |

وحاجة سابعة **مش قرار بس تحذير حجم**: البرومبت ده تقريبًا بحجم المشروع الأصلي نصّه (7 جداول جديدة، 5 صفحات، مطابقة تانية، 7 إشعارات، قسم لوحة بـ 8 تبويبات، 4 مهام). هقسّمه 6 مراحل، **كل مرحلة بتترفع لوحدها وبتشتغل لوحدها** من غير ما تكسر اللي قبلها (القسم 6).

---

## 1. قاعدة البيانات

### 1.1 أنواع جديدة (`enum`)

```
work_status_t      freelancer · remote_employee · business_owner · student · employee · other
work_style_t       silent · chatty · depends
experience_t       under_1 · one_to_three · three_to_five · five_plus
outlets_t          few · enough · plenty
noise_t            quiet · medium · lively
pass_kind_t        four · eight
pass_status_t      pending · active · used_up · expired · refunded     ← pending بسبب الدفع اليدوي (§0 #2)
recurring_status_t active · paused · cancelled
lead_status_t      new · contacted · converted · dropped
```
+ إضافة `cafe_work` و`coworking` لـ `venue_kind_t` الموجود (`alter type … add value`).

### 1.2 امتدادات على جداول موجودة (كلها `null`-able — ما تكسرش صف قديم)

**`profiles`**
```
work_status              work_status_t
profession_id            uuid → professions
secondary_profession_id  uuid → professions
work_style               work_style_t
open_to_collab           boolean not null default true
years_experience         experience_t
work_days_pref           text[] not null default '{}'     -- نفس أكواد free_slots (sat…fri)
work_area_pref           area_t
work_no_show_count       int not null default 0           -- غياب سبوطات الشغل بس (§3 قاعدة 6)
```

**`sbota_templates`**
```
is_work      boolean not null default false
work_config  jsonb   -- {start,end,lunch_hour_at,complaint_hour_at,focus_blocks[],desk_type,profession_mix_max}
```

**`sbotat`**
```
is_work  boolean not null default false   -- محفّز بينسخها من القالب عند الإدراج + فهرس جزئي where is_work
```

**`payments`** — عمود واحد: `pass_id uuid → work_passes` (لو التحويل لكارت مش لحجز). و`fn_approve_transfer` تتمدد: لو `pass_id` موجود → الكارت يبقى `active` وتاريخ بدايته الآن.

**`bookings`** — عمود `paid_with_pass boolean not null default false` (علشان الإلغاء يعرف يرجّع جلسة مش فلوس).

**`settings`** — أعمدة (القيم الافتراضية من البرومبت):
```
work_pass4_price        int  default 40000   -- بالقروش زي باقي الأسعار
work_pass4_weeks        int  default 6
work_pass8_price        int  default 72000
work_pass8_weeks        int  default 10
work_single_price       int  default 12000
work_first_time_price   int  default 6000
work_profession_mix_max int  default 2
work_lunch_at           time default '13:00'
work_complaint_at       time default '14:30'
work_recurring_lead_days int default 7
work_pass_refund_days   int  default 3        -- الإلغاء قبلها بيرجّع الجلسة
work_conversion_target_pct int default 25     -- المستهدف لمؤشر الشغل→الترفيه
```

### 1.3 جداول جديدة

| جدول | الأعمدة الأساسية | ملاحظات |
|---|---|---|
| **`professions`** | `id, key unique, name_ar, icon_key, color, sort_order, is_active` | قاموس يتعدّل من اللوحة. 15 صف بذرة |
| **`work_venues`** | `venue_id unique → venues, desks_count, wifi_mbps, wifi_note_ar, power_outlets outlets_t, noise_level noise_t, has_meeting_room, has_parking, has_ac, min_consumption int, open_from time, open_to time, best_days text[], photos text[], wholesale_seat_price int, notes_ar` | واحد-لواحد مع `venues`. **عرض عام `work_venues_public`** من غير `wholesale_seat_price` و`notes_ar` |
| **`work_passes`** | `id, profile_id, kind pass_kind_t, sessions_total, sessions_used default 0, price_paid, payment_id → payments, starts_at, expires_at, status pass_status_t default 'pending', refunded_amount default 0, created_at` | قيد `sessions_used <= sessions_total`. `starts_at/expires_at` بيتحددوا عند الاعتماد مش عند الطلب |
| **`pass_redemptions`** | `id, pass_id, booking_id unique, redeemed_at, reverted_at` | سجل كل خصم ورجوع |
| **`recurring_bookings`** | `id, profile_id, template_id, venue_id, weekday int check 0–6, time_of_day time, active_from date, active_until date, auto_book boolean default true, pause_until date, status recurring_status_t default 'active', last_generated_for date` | صف واحد نشط لكل (profile, weekday) — فهرس فريد جزئي |
| **`work_affinity`** | نفس `pair_affinity` بالحرف: `a_id, b_id check a_id<b_id, a_wants_b, b_wants_a, met_in_booking_id, mutual_at, weight` | **منفصلة تمامًا** عن `pair_affinity`. نفس المحفّز `fn_mutual_affinity` بنسخة `fn_mutual_work_affinity` |
| **`venue_reports`** | `id, venue_id, week_start date, sessions_count, attendees_count, no_shows, avg_rating, amount_due int, paid_at, paid_by, notes` | فريد `(venue_id, week_start)` |
| **`work_metrics`** | **عرض مادي** (materialized view) أسبوعي: سبوطات الشغل، الحضور، نسبة الغياب، الكروت المباعة، الجلسات المستهلكة، **نسبة التحوّل شغل→ترفيه خلال 30 يوم**، نسبة التبادل في «شغالين معاك» | بيتجدد من `job_work_metrics` |
| **`leads`** | `id, company, contact_name, phone, people_count, times_per_month, note, status lead_status_t default 'new', created_at` | إدراج للكل (anon) بحد معدل، قراءة للإدارة |

### 1.4 دوال ومحفّزات

| دالة | بتعمل إيه | بتتنادى من |
|---|---|---|
| `fn_redeem_pass(p_booking_id)` | تخصم جلسة من **أقدم** كارت `active` لصاحب الحجز، تكتب `pass_redemptions`، تعلّم الحجز `paid_with_pass`، وتحوّل الكارت `used_up` لو خلص | مسار `/api/pay/create` لما الاختيار «استخدم كارتي» |
| `fn_revert_pass(p_booking_id)` | لو الإلغاء قبل `work_pass_refund_days` → ترجّع الجلسة (`reverted_at`) وترجّع الكارت `active` لو كان `used_up`. لو متأخر → مفيش رجوع | `fn_cancel_booking` الموجودة — إضافة فرع `if paid_with_pass` |
| `fn_activate_pass(p_payment_id)` | عند اعتماد التحويل: `status=active`, `starts_at=now()`, `expires_at=now()+weeks` | امتداد `fn_approve_transfer` |
| `fn_build_work_matching(p_sbota_id)` | المطابقة `work_v1` (§3) — بتكتب في `matching_runs` بـ `algorithm_version='work_v1'` | لوحة المطابقة لما `sbotat.is_work` |
| `fn_mutual_work_affinity()` | محفّز: عند `a_wants_b and b_wants_a` → `mutual_at=now()` + إشعار `work_collab_match` للطرفين | trigger على `work_affinity` |
| `fn_work_collab_state(p_other uuid)` | `security definer`: بترجّع «في تبادل / لأ» بس — مفيش قراءة لاختيار الطرف التاني | صفحة `/me/shoghl` |
| `fn_group_professions(p_sbota_id)` | بترجّع أسماء المجالات في المجموعة (من غير أسماء ناس) — **بعد `reveal_at` بس**، وقبلها العدد بس | صفحة السبوطة «مين حاجز» |
| `fn_venue_report(p_week_start)` | تبني/تحدّث `venue_reports` لكل مكان شغل | `job_work_venue_reports` |
| `t_sbotat_is_work` | محفّز: ينسخ `is_work` من القالب عند الإدراج | — |

### 1.5 المهام المجدولة — pg_cron (§0 #1)

```sql
select cron.schedule('nasbot-work-recurring', '0 7 * * *',  $$select job_work_recurring()$$);   -- 9 القاهرة
select cron.schedule('nasbot-work-passes',    '0 8 * * *',  $$select job_work_pass_reminders()$$);
select cron.schedule('nasbot-work-venues',    '0 6 * * 1',  $$select job_work_venue_reports()$$); -- الاتنين 8 القاهرة
select cron.schedule('nasbot-work-metrics',   '15 3 * * *', $$select job_work_metrics()$$);       -- بعد job_metrics
```
`job_work_recurring`: لكل `recurring_bookings` نشط غير متوقف، لو الموعد الجاي بعد `work_recurring_lead_days` يوم وما اتولّدش: يدوّر على سبوطة شغل مطابقة (قالب + مكان + يوم) → لو `auto_book` وفيه رصيد كارت → حجز + `fn_redeem_pass` + إشعار `work_recurring_booked` · لو مفيش رصيد → إشعار `work_no_pass_balance` من غير حجز · لو مفيش سبوطة معلنة → إشعار للإدارة.

### 1.6 سياسات الصفوف (RLS)

| جدول | قراءة | كتابة |
|---|---|---|
| `professions` | الكل | `fields.edit` |
| `work_venues` | **عبر `work_venues_public` بس** للأعضاء (من غير سعر الجملة). الجدول نفسه: الإدارة | `sbotat.edit` |
| `work_passes`, `pass_redemptions`, `recurring_bookings` | صاحبها + الإدارة | صاحبها (إدراج/تعديل بتاعه) + الإدارة. **الخصم والرجوع عبر الدوال بس** — مفيش تعديل مباشر على `sessions_used` |
| `work_affinity` | **لا أحد** — القراءة عبر `fn_work_collab_state` | صاحب `a`/`b` يكتب رغبته هو بس (نفس `pair_affinity`) |
| `profiles.profession_id / work_style / years_experience` | نفس سياسة `profiles_mutual_read` الموجودة **+ شرط `is_work` و`reveal_at` عدّى**. قبل الكشف: مخفية حتى عن نفس المجموعة. الكابتن والإدارة دايمًا | صاحبها |
| `venue_reports` | `payments.view` (finance) + owner | `payments.review` |
| `leads` | الإدارة | إدراج للكل بحد معدل (نفس نمط `captain_applications`) |

**اختبارات السياسات** (`0xx_work_rls_tests.sql` بنفس نمط `0017`): عضو لا يقرأ مجال عضو في مجموعته قبل الكشف ✓ بعده ✓ · لا يقرأ صف `work_affinity` لغيره ✓ · لا يشوف `wholesale_seat_price` ✓ · لا يعدّل `sessions_used` مباشرة ✓ · `anon` يدرج في `leads` ولا يقراه ✓.

### 1.7 بذرة
- 15 مجال في `professions` (تصميم · برمجة · كتابة محتوى · تسويق · فيديو ومونتاج · تصوير · ترجمة · محاسبة · قانون · تدريس · استشارات · معماري · صوت · بيانات · غير كده).
- 4 أماكن `venues(kind=cafe_work|coworking)` + صفوفهم في `work_venues` — معلّمة `is_active=false` وبأسماء واضحة إنها تجريبية.
- قالبين: `sbota-shoghl` و`sbota-shoghl-coworking` بـ `is_work=true` و`work_config`.
- 7 قوالب إشعارات (§4) في `notification_templates`.

---

## 2. الصفحات

الوضع النهاري «مقفول» على مسار `/shoghl/*`: غلاف `WorkShell` بيحط `data-theme="day"` على `<html>` **من غير ما يحفظ** في `localStorage` (فباقي الموقع ما يتأثرش)، وبيخفي `ThemeToggle`. الفوتر والهيدر نفسهم.

| المسار | نوع | المحتوى | يعتمد على |
|---|---|---|---|
| **`/shoghl`** | ثابت + بيانات حية | عنوان «الشغل مش لازم يكون لوحدك.» · 4 خطوات بأيقونات · جدول سبوطات الشغل الأسبوع ده (`SbotaCard` بـ variant `work`: المكان، النت، البريز، الصوت، فاضل كام) · الكارتين · «يومك الثابت» · الأماكن · «شغالين معاك» · نموذج الشركات → `leads` | 1.3، `sbotat_public` + `is_work` |
| **`/shoghl/[slug]`** | حي | نفس `/s/[slug]` مع: بطاقة المكان (`work_venues_public`) · جدول اليوم من `work_config` · «مين حاجز» **بالمجال** عبر `fn_group_professions` (<3 → «لسه بدري…») · زر بـ 3 اختيارات: «أنا جاي — 120» / «استخدم كارتي (فاضل N)» / «أول مرة — 60» (يظهر لو مفيش حجز شغل سابق) | 1.4 |
| **`/shoghl/pass`** | حي | الشرح · الكارتين · الأسئلة · الشراء = تحويل يدوي (نفس `/s/[slug]/pay` بس لكارت) → «طلبك وصل — هنفعّل الكارت أول ما نتأكد من التحويل» · بعد التفعيل: «معاك 4 أيام شغل — أول واحد إمتى؟» | `payments.pass_id` |
| **`/shoghl/amaken`** | ثابت (SEO) | بطاقة لكل مكان: صور · النت · البريز · الصوت · تكييف · باركنج · الحد الأدنى · الأيام · «شوف مواعيدنا هنا». **من غير عنوان كامل** لو مفيش سبوطة معلنة | `work_venues_public` |
| **`/me/shoghl`** | خاص | رصيد الكارت بشريط تقدم · يومي الثابت (تشغيل/إيقاف/«أوقف أسبوعين»/إلغاء) · شغالين معاك (اللي في تبادل) + «ابعتله» بنفس شات الواحد-لواحد · مجالي وأسلوبي (تعديل سريع) | 1.3، `fn_work_collab_state` |

**تعديلات على موجود:**
- **الرئيسية (نهاري بس):** شريط «الشغل» + زر «خد يومك» → `/shoghl` فوق البطاقات (`Sections.tsx` مكوّن جديد `WorkStrip`).
- **الهيدر:** رابط «الشغل» نهاري بس.
- **الانضمام (`/join`):** خطوة 4 **اختيارية** تظهر بس لو `?from=shoghl` أو اختار `freelancer/remote_employee` في سؤال جديد صغير «بتشتغل إيه؟» (اختياري): المجال · أسلوب الشغل · سنين الخبرة · أيام الشغل. **ما تظهرش لغير كده**.
- **التقييم (`/my/[id]/review`):** لو الحجز `is_work` → قسم إضافي «عايز تشتغل مع مين؟» بنفس مكوّن «عايز تشوف مين تاني؟» وبيكتب في `work_affinity`. **الاتنين يظهروا**.
- **الخريطة:** أيقونة لابتوب لأماكن `cafe_work|coworking` + فلتر «شغل».
- **لعبة «مين جاي؟»:** سؤال اختياري أخير للي اختار فريلانسر: «بتشتغل في إيه؟» → `profession_id`.
- **`/api/pay/create`:** خيار `payWith: 'pass' | 'single' | 'first_time'` لسبوطات الشغل — `pass` → `fn_redeem_pass` وحجز `paid` فورًا (مفيش تحويل).
- **لوحة المطابقة:** لو `sbotat.is_work` → تنادي `fn_build_work_matching` وتعرض «ليه المجموعة دي؟» بلغة الشغل.

---

## 3. المطابقة `work_v1` — `fn_build_work_matching`

نسخة **منفصلة** عن `fn_build_matching`، نفس شكل المخرجات (`matching_runs.proposal`) علشان لوحة المطابقة تعرضها بنفس المكوّنات.

| # | قاعدة | كيف |
|---|---|---|
| 1 | حد أقصى **`work_profession_mix_max`** (افتراضي 2) من نفس المجال في المجموعة | قيد صارم في التوزيع الجشع |
| 2 | تجانس `work_style` | نقاط: كل الـ 6 نفس الأسلوب = +3 · `depends` بتتعامل كحياد · **ممنوع** 5 `silent` + 1 `chatty` (قيد صارم: الأقلية ≥ 2 أو صفر) |
| 3 | **السن مش معيار** | مفيش قيد الـ 6 سنين. نطاق 24–40 مقبول من غير عقوبة |
| 4 | بنات بس | فلتر صارم زي ما هو |
| 5 | سنين الخبرة | نقاط تنويع خفيفة (+1 لو ≥ 2 مستويات) — مش قيد |
| 6 | الغياب | `work_no_show_count >= 2` → ما ياخدش مقعد **إلا** لو الحجز `paid_with_pass` |
| 7 | «ليه المجموعة دي؟» | قالب: «{n} مجالات مختلفة، و{وصف الأسلوب}» — مثال: «4 مجالات مختلفة، وكلكم قلتوا إنكم بتحبوا تشتغلوا في هدوء الصبح.» |

**اختبار** (`check-work-matching.ts` بنفس نمط `scripts/check-matching.ts`): 6 ناس من 3 مجالات (2+2+2) وأسلوبين (4 silent + 2 chatty) → مجموعة واحدة تحترم 1 و2، والجملة مظبوطة. + حالة 3 من مجال واحد → واحد يتأخر.

---

## 4. الإشعارات — `notification_templates` (قناة واتساب، نفس اللهجة)

| المفتاح | النص | بيتبعت من |
|---|---|---|
| `work_recurring_booked` | «حجزناك يوم {day} زي كل أسبوع — {venue}، 10 الصبح. لو مش هتعرف، ألغِ من هنا: {link}» | `job_work_recurring` |
| `work_no_pass_balance` | «معادك {day} جه، بس كارتك خلص. تحب تدفع الجلسة دي لوحدها؟ {link}» | `job_work_recurring` |
| `work_pass_low` | «فاضل في كارتك يوم واحد. تحب تجدده؟ {link}» | `job_work_pass_reminders` |
| `work_pass_expiring` | «كارتك بينتهي بعد {days} أيام وفاضل فيه {n} — استخدمهم. {link}» | `job_work_pass_reminders` |
| `work_collab_match` | «أنت و{name} عايزين تشتغلوا سوا. تحبوا تتكلموا؟ {link}» | محفّز `fn_mutual_work_affinity` |
| `work_venue_changed` | «مكان سبوطة الشغل يوم {day} اتغيّر لـ {venue}. نفس الوقت.» | لوحة السبوطات عند تغيير المكان |
| `work_first_time_offer` | «عارف إن فيه سبوطة شغل التلات؟ أول مرة بـ 60. {link}» | `job_after_sbota` الموجودة — فرع: أول سبوطة ترفيهية + `work_status in (freelancer, remote_employee)` |

> ملاحظة صريحة: قناة الواتساب لسه مش متفعّلة (مفيش مفاتيح Meta). الإشعارات هتتسجّل في `notifications` بحالة `pending` زي باقي إشعارات الموقع، وهتتبعت أول ما القناة تتفعّل. الإيميل متاح لو حبيت تخليه قناة بديلة للإشعارات دي — قرار منفصل.

---

## 5. لوحة الأدمن — قسم «الشغل» (`/admin/shoghl`)

صفحة واحدة بتبويبات (نفس نمط `/admin/payments`):

| تبويب | المحتوى | صلاحية |
|---|---|---|
| المجالات | إضافة/تعديل/ترتيب/تفعيل + أيقونة ولون | `fields.edit` |
| أماكن الشغل | كل مواصفات `work_venues` + الصور + التفعيل + تنبيه لو `rating_avg` نزل تحت 4 | `sbotat.edit` |
| الكروت | النشطة/المعلّقة/المنتهية · الرصيد · مبيعات شهرية · **اعتماد كارت معلّق** (نفس تدفق اعتماد التحويل) · إضافة كارت يدوي بسبب (تعويض) | `payments.review` |
| الحجوزات المتكررة | مين عنده يوم ثابت · المتوقف · «ولّد دلوقتي» يدويًا | `bookings.edit` |
| تقارير الأماكن | الأسبوع لكل مكان · «اتدفع» · تصدير CSV | `payments.view` / `payments.review` |
| المؤشرات | `work_metrics` — وعلى رأسها **التحوّل شغل→ترفيه خلال 30 يوم** مقابل `work_conversion_target_pct` بلون أخضر/أحمر | `settings.view` |
| الإعدادات | كل أعمدة `settings.work_*` | `settings.edit` |
| الشركات | `leads` بالحالة والملاحظات | `people.view` |

+ لينك «الشغل» في `AdminShell`. + `ADMIN_GUIDE.md` قسم جديد.

---

## 6. المراحل — كل مرحلة بتترفع وتشتغل لوحدها

| # | المرحلة | بتشمل | بتطلع للناس؟ | اختبار القبول |
|---|---|---|---|---|
| **1** | **الأساس** | الهجرات (1.1–1.3 + RLS + بذرة) · `WORK_MIGRATION.sql` · `WORK_COPY.sql` · اختبارات RLS · `is_work` على القوالب والسبوطات · تبويب **المجالات + أماكن الشغل + الإعدادات** في اللوحة | لأ — بنية بس | اختبارات RLS تعدّي · `npm run verify` · اللوحة تعرض وتعدّل |
| **2** | **الواجهة العامة** | `/shoghl` · `/shoghl/[slug]` (حجز مفرد وأول مرة) · `/shoghl/amaken` · شريط الرئيسية والهيدر · الخريطة | **أيوه** — أول قيمة ظاهرة | أحجز سبوطة شغل بـ 120 أو 60 · «مين حاجز» بالمجال بعد الكشف بس |
| **3** | **الكارت** | `work_passes` تدفق كامل: شراء (يدوي) → اعتماد من اللوحة → خصم عند الحجز → رجوع عند الإلغاء المبكر · `/shoghl/pass` · `/me/shoghl` (الرصيد) · تبويب الكروت · تذكيرات الكارت | أيوه | السيناريوهات الـ 5 في قائمة القبول |
| **4** | **اليوم الثابت** | `recurring_bookings` · `job_work_recurring` · واجهة الإيقاف/الإلغاء في `/me/shoghl` · تبويب اللوحة | أيوه | التوليد قبل 7 أيام · الإيقاف أسبوعين · حالة «مفيش رصيد» |
| **5** | **المطابقة والتعاون** | `fn_build_work_matching` + اختبار · لوحة المطابقة · `work_affinity` + سؤال التقييم · «شغالين معاك» في `/me/shoghl` · خطوة الشغل في التسجيل واللعبة | أيوه | 6 ناس/3 مجالات/أسلوبين · التبادل بيفتح التواصل بس · الاختيار مخفي |
| **6** | **الشراكات والمؤشرات** | `venue_reports` + مهمة الاتنين · `work_metrics` + مهمة · تبويبات التقارير والمؤشرات والشركات · `leads` · `work_first_time_offer` · لقطات 390/768/1440 · `ADMIN_GUIDE` و`README` | إدارة | المؤشر بيتحسب ويتعرض بالمستهدف |

**ترتيب التنفيذ داخل كل مرحلة:** هجرة → اختبار SQL → واجهة → `npm run verify` → رفع على `main` → **انت تشغّل الـ SQL** → تجربة على الموقع. (أنا ما أقدرش أطبّق الهجرة — القسم 0 #4.)

---

## 7. ملفات هتتضاف/تتغيّر (تقدير)

```
supabase/migrations/2026090910xxxx_0040_work_enums_and_columns.sql
supabase/migrations/..._0041_work_tables.sql
supabase/migrations/..._0042_work_functions.sql
supabase/migrations/..._0043_work_rls.sql
supabase/migrations/..._0044_work_seed.sql
supabase/migrations/..._0045_work_jobs.sql
supabase/migrations/..._0046_work_rls_tests.sql
WORK_MIGRATION.sql · WORK_COPY.sql            ← مجمّعين للزق في SQL Editor

src/app/shoghl/{page,[slug]/page,pass/page,amaken/page}.tsx
src/app/me/shoghl/page.tsx
src/app/admin/shoghl/page.tsx
src/components/work/{WorkShell,WorkSbotaCard,VenueSpecs,PassCard,DaySchedule,ProfessionChips}.tsx
src/components/home/Sections.tsx        (+WorkStrip)
src/components/{Header,CairoMap,MiniMap,SbotaCard,AdminShell}.tsx   (تعديلات صغيرة)
src/app/{join,game,my/[bookingId]/review,admin/matching}/page.tsx  (تعديلات محدودة)
src/app/api/pay/create/route.ts        (+payWith)
src/app/api/leads/route.ts             (جديد — حد معدل)
src/lib/{api,map-db,admin}.ts · src/types/index.ts
src/data/{copy-fallback.ts,lists.ts} · scripts/copy-seed.json
scripts/check-work-matching.ts · tests/work.spec.ts
ADMIN_GUIDE.md · README.md · DB_PLAN.md
```

---

## 8. مخاطر أقولها من دلوقتي

1. **الدفع اليدوي بيخلّي الكارت غير فوري.** واحد يشتري كارت الساعة 11 بالليل علشان يحجز الصبح — مش هيلحق لو محدش اعتمد. حل مؤقت: خيار «أنا جاي — 120» متاح دايمًا جنب الكارت، والنص بيقولها. الحل الحقيقي بوابة دفع (`RUNBOOK §11`).
2. **الواتساب مش متفعّل** → إشعارات اليوم الثابت (قلب المنتج) هتتسجّل ومش هتوصل. لازم يتقفل قبل المرحلة 4، أو نخلي الإيميل قناة لها.
3. **مطابقة تانية = ضعف الصيانة.** لو `fn_build_matching` اتغيّرت بعدين، `work_v1` ما هتتغيرش لوحدها. مقصود (البرومبت طلب الفصل) بس لازم يتكتب في `DB_PLAN`.
4. **الحجم.** 6 مراحل ≈ 6 جلسات شغل كاملة زي بتاعة النهاردة. لو عايز تطلع بحاجة بسرعة: المرحلة 1+2 لوحدهم بيطلعوا «سبوطات شغل بحجز مفرد» — منتج حقيقي — والباقي بعدها.

---

## 9. محتاج قرارك في 4 حاجات قبل ما أبدأ المرحلة 1

1. **pg_cron بدل Vercel Cron** (§0 #1) — موافق؟
2. **الكارت يبقى `pending` لحد اعتماد التحويل** (§0 #2) — موافق، أو عايز الكارت يتفعّل فورًا على مسؤولية المراجعة بعدين؟
3. **الإشعارات:** نسيبها واتساب (مش هتوصل لحد ما تفعّل Meta) أو نخلي إشعارات الشغل تروح **إيميل** كمان (شغال دلوقتي)؟
4. **ترتيب الأولوية:** المراحل بالترتيب 1→6، أو 1+2 الأول وتشوف ردّ الناس قبل الكارت واليوم الثابت؟

جاوب على الأربعة (أو قول «كله زي ما هو») وأبدأ المرحلة 1 فورًا.
