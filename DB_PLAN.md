# DB_PLAN.md — قاعدة بيانات «نسبوط»

خطة الخلفية الكاملة قبل أي هجرة. مكتوبة على أساس العقود الموجودة في
`src/lib/api.ts` و`src/types/index.ts` — الواجهات مش هتتلمس إلا في الحالات
المذكورة في §10.

> **تحديث:** الدفع بقى **يدوي بس** (فودافون كاش / إنستا باي) — راجع §10 بند 1.

---

## 0. قرار لازم يتاخد قبل أي حاجة — مشروع Supabase

**المشروع المربوط دلوقتي مش فاضي، وده مش مشروع نسبوط.**

| | |
|---|---|
| المعرّف | `rhvskbkyzlfdpxjrgyju` |
| المنطقة | `eu-north-1` (ستوكهولم) — **مش فرانكفورت** |
| المحتوى | نظام موارد بشرية وعمليات وكالة **شغّال وفيه بيانات حقيقية** |
| الحجم | 90+ جدول · 21,638 صف في `job_runs` · 3,113 في `audit_logs` · 4,224 في `performance_metrics` |

**تصادمات مباشرة في الأسماء لو حطينا نسبوط في نفس `public`:**

| الجدول | في المشروع الحالي | نسبوط محتاجه |
|---|---|---|
| `settings` | 38 صف (أوزان الأداء) | إعدادات الاسترداد والعمولة |
| `notifications` | 339 صف | طابور الإشعارات |
| `audit_logs` / `audit_log` | 3,113 صف | سجل التدقيق |
| `surveys` · `reports` · `payments` | قريبة من أسماء نسبوط | ارتباك مؤكد |

**وأخطر من التصادم:** `auth.users` واحدة لكل مشروع. لو حطينا نسبوط هنا،
**موظفي الوكالة وأعضاء نسبوط هيبقوا في نفس جدول المستخدمين** — ده خطر
خصوصية حقيقي ومخالف لمبدأ فصل الأغراض في قانون 151/2020.

### الاقتراح: مشروع جديد منفصل

مشروع `nasbot-prod` في **`eu-central-1` (فرانكفورت)** زي ما البرومبت طالب،
بـ `auth.users` خاصة بيه، ونسخ احتياطي وسياسات مستقلة.

**مش هعمل أي حاجة على المشروع الحالي ولا هنشئ مشروع جديد قبل ما توافق.**

### ملاحظة إقامة البيانات (إلزامية)

الاستضافة في فرانكفورت = **نقل بيانات شخصية خارج مصر**. قانون حماية البيانات
الشخصية **151/2020** بيطلب **ترخيص نقل عابر للحدود** من مركز حماية البيانات
الشخصية. المركز اتأسس فعليًا واللائحة التنفيذية صدرت، ومهلة التوفيق بتنتهي
**بعد نوفمبر 2026** — يعني لازم الترخيص يتقدّم قبل الإطلاق التجاري.

**البديل المخطط له:** كل الهجرات في `supabase/migrations/` **Postgres قياسي**،
ومفيش أي اعتماد على امتدادات مقفولة على Supabase. يعني الانتقال لاستضافة
Postgres داخل مصر = نفس الهجرات + استبدال `auth` و`storage` بمكافئ. مكتوب في
`RUNBOOK.md`.

---

## 1. مخطط العلاقات (ERD نصي)

```
auth.users ─1:1─ profiles ─┬─< profile_interests >─ interests
                           ├─< skill_levels
                           ├─1:1─ captains
                           ├─< bookings
                           ├─< wallet_ledger
                           ├─< behavior_flags
                           ├─< notifications
                           └─< referrals (referrer / referred)

venues ──< sbotat >── sbota_templates
                │
                ├──< sbota_groups ──1:1── chat_rooms ──< chat_members >── profiles
                │                              └──< messages
                ├──< bookings ──1:1── payments ──< refunds
                │        ├──< waitlist
                │        └──1:1── reviews
                ├──< mystery_clues
                ├──< matching_runs ──< matching_outcomes
                ├──< sbota_photos
                └──1:1── captain_reports

pair_affinity (a_id, b_id)  ← من reviews.seeAgain، والتبادل بيفتح chat_rooms(one_on_one)
reports ── messages / profiles / bookings
audit_log · settings · coupons · notification_templates · otp_codes · events
weekly_metrics (عرض مادي) ← marketing_spend
```

---

## 2. الأنواع المعدودة (Postgres enums)

```
gender_t            female | male
area_t              tagamoa | maadi | zayed_october | heliopolis_nasr | downtown_zamalek | other
girls_pref_t        always | sometimes | no
activity_t          padel | running | swimming
skill_t             first_time | beginner | intermediate | good
social_energy_t     starter | responder | listener | one_on_one
group_pref_t        calm | lively | depends
persona_t           explorer | social_captain | quiet_observer | first_timer | energy | storyteller
role_t              member | captain | admin
venue_kind_t        padel_club | kayak | cafe | restaurant | board_games | wadi | escape_room | paintball | workshop | tour_operator
template_kind_t     sport | nile | nature | food | games | work | workshop | mystery | trip
sbota_status_t      draft | open | full | locked | running | done | cancelled
booking_status_t    pending_payment | paid | waitlist | cancelled_by_user | cancelled_by_us | no_show | attended | refunded
refund_kind_t       full | half | credit | none
payment_provider_t  vodafone_cash | instapay | wallet   (paymob/kashier محجوزين لو رجعنا لبوابة)
payment_status_t    initiated | pending_review | succeeded | failed | refunded | partially_refunded
refund_type_t       gateway | wallet_credit
ledger_reason_t     referral_reward | refund_credit | cancel_credit | coupon | spend | captain_free_sbota
coupon_kind_t       percent | fixed
room_kind_t         sbota_group | one_on_one
member_role_t       member | captain
message_kind_t      text | system | game
report_reason_t     harassment | spam | unsafe | other
report_status_t     open | reviewing | actioned | dismissed
report_action_t     none | warn | remove_from_room | ban
clue_kind_t         image | audio | word
flag_kind_t         no_show | late_cancel | low_conduct | report_received | verified_id
notify_channel_t    whatsapp | sms | email | inapp
notify_status_t     queued | sent | failed | read
```

> **ملاحظة تعريب:** الواجهة بتستخدم قيم عربية (`'بنت' | 'شاب'` و`'أول مرة'`…).
> الترجمة بين الاثنين بتحصل في `src/lib/api.ts` بس — القاعدة بالإنجليزي.

---

## 3. الجداول

كل جدول: `id uuid pk default gen_random_uuid()` · `created_at timestamptz default now()`
· `updated_at timestamptz` بمحفّز `set_updated_at()` · `comment on table` بالعربي.
**الفلوس كلها `integer` بالقروش** (300 جنيه = 30000).

### 3.1 الناس

| الجدول | الأعمدة المميزة | فهارس |
|---|---|---|
| `profiles` | `id → auth.users`, `phone` (فريد, E.164), `email`, `first_name`, `birth_year` (قيد ≥18), `gender`, `area`, `girls_only_pref`, `avatar_path`, `social_energy`, `group_pref`, `budget_max`, `free_slots text[]`, `type persona_t`, `type_scores jsonb`, `wish_text`, `role`, `phone_verified_at`, `rules_accepted_at`, `data_consent_at`, `referral_code` (فريد 6), `referred_by`, `wallet_balance` (محسوب), `sbota_count` (محسوب), `no_show_count`, `banned_at`, `ban_reason`, `deleted_at` | `phone`, `referral_code`, `role`, `deleted_at` |
| `interests` | `slug`, `label_ar` — الـ20 من `src/data/lists.ts` | |
| `profile_interests` | `profile_id`, `interest_id` · فريد (الاتنين) | `profile_id` |
| `skill_levels` | `profile_id`, `activity`, `level` · فريد (الاتنين) | |
| `captains` | `profile_id` (فريد), `bio_line`, `activities text[]`, `is_active`, `payout_method jsonb`, `rating_avg`, `sbota_count` | `is_active` |

**قيد العمر:** `birth_year` بيدي ≥ 18. شرط الـ21 للرحلات بمبيت (`overnight`)
بيتحقق في `fn_can_book()` مش كقيد عمود.

**«اختار 5 بالظبط»:** مش قيد جدول (الملف بيتبني على مراحل) — بيتحقق في
`completeProfile` وفي `fn_profile_is_complete()`.

### 3.2 العرض

| الجدول | الأعمدة المميزة |
|---|---|
| `venues` | `name`, `kind`, `area`, `address`, `map_lat`, `map_lng`, `contact_phone`, `contract_notes`, `wholesale_price`, `verified_at`, `verified_by`, `last_inspection_at`, `rating_avg`, `is_active`, `tourism_license_no` — **قيد: مطلوب لو `kind = tour_operator`** |
| `sbota_templates` | `slug` (فريد), `name_ar`, `story_ar`, `kind`, `default_price`, `org_fee`, `duration_min`, `min_group`, `max_group`, `mood_ar`, `includes_ar text[]`, `excludes_ar text[]`, `requirements jsonb`, `is_day`, `girls_only`, `overnight`, `hero_photos text[]` |
| `sbotat` | `template_id`, `venue_id`, `captain_id`, `starts_at`, `ends_at`, `price`, `org_fee`, `capacity`, `min_to_run`, `status`, `girls_only`, `is_day`, `is_mystery`, `mystery_reveal_at`, `address_hidden`, `booking_closes_at`, `reveal_at`, `chat_opens_at`, `chat_closes_at`, `weather_cancel_rule jsonb`, `cancel_reason` |
| `sbota_groups` | `sbota_id`, `index`, `captain_id`, `why_ar`, `chat_room_id` |
| `mystery_clues` | `sbota_id`, `day_index` (1–7), `kind`, `path_or_text`, `unlocks_at` |

**التوقيتات محسوبة تلقائيًا** بمحفّز `fn_sbota_timings()` بتوقيت `Africa/Cairo`:

```
booking_closes_at = starts_at − 36h
reveal_at         = least(starts_at − 24h, نفس اليوم 20:00 بتوقيت القاهرة)
chat_opens_at     = reveal_at
chat_closes_at    = ends_at + 48h
```

فهارس: `sbotat(starts_at)`, `sbotat(status)`, `sbotat(template_id)`,
`sbotat(reveal_at) where status in ('open','full','locked')`.

### 3.3 الطلب

| الجدول | الأعمدة المميزة |
|---|---|
| `bookings` | `sbota_id`, `profile_id`, `group_id`, `status`, `price_paid`, `discount`, `referral_code_used`, `wallet_used`, `payment_id`, `checked_in_at`, `checked_in_by`, `cancelled_at`, `cancel_reason`, `refund_kind`, `is_first_booking`, `plus_one_booking_id` · **فريد (`sbota_id`,`profile_id`)** |
| `waitlist` | `sbota_id`, `profile_id`, `position`, `notified_at` · فريد (الاتنين) |
| `payments` | `booking_id`, `provider`, `provider_ref`, `amount`, `fee_amount`, `status`, `receipt_path`, `reviewed_by`, `raw_webhook jsonb`, **`idempotency_key` فريد** |
| `refunds` | `payment_id`, `amount`, `kind`, `reason`, `status`, `provider_ref` |
| `wallet_ledger` | `profile_id`, `delta`, `reason`, `ref_id` — **المصدر الوحيد للرصيد** |
| `coupons` | `code` (فريد), `kind`, `value`, `max_uses`, `used_count`, `expires_at`, `first_booking_only` |
| `referrals` | `referrer_id`, `referred_id`, `booking_id`, `reward_paid_at` · فريد (`referred_id`) |

**حارس السعة** (`fn_capacity_guard`): قبل أي `insert/update` بيخلي الحجز `paid`،
بيعمل `select ... from sbotat where id = ... for update` وبيعدّ الحجوزات `paid`.
لو عدّى السعة → `raise exception`. ده اللي بيخلي اختبار الـ20 طلب المتوازي يعدّي.

### 3.4 المطابقة

`matching_runs` · `matching_outcomes` · `pair_affinity` · `behavior_flags` — زي البرومبت.

`pair_affinity` بقيد `check (a_id < b_id)` علشان الزوج ما يتكررش، ومحفّز
`fn_mutual_affinity()` بيملأ `mutual_at` لما الاتنين `true`.

### 3.5 الشات · 3.6 التقييم · 3.7 التشغيل

`chat_rooms` · `chat_members` · `messages` · `reports` · `reviews` · `sbota_photos`
· `captain_reports` · `notifications` · `notification_templates` · `otp_codes`
· `audit_log` · `settings` · `events` · `marketing_spend` · `weekly_metrics`.

كلها زي ما البرومبت حددها. زيادات مقترحة:
- `messages.body` قيد `length ≤ 2000`.
- `events` (لـ `track`): `name`, `props jsonb`, `profile_id` (اختياري), `at` — **بدون IP ولا user-agent**.
- `weekly_metrics` عرض مادي بيتحدث يوميًا بـ `refresh materialized view concurrently`.

---

## 4. الدوال والمحفّزات

| الاسم | النوع | الدور |
|---|---|---|
| `set_updated_at()` | trigger | على كل الجداول |
| `fn_sbota_timings()` | trigger | يحسب التوقيتات الأربعة |
| `fn_capacity_guard()` | trigger | يمنع تجاوز السعة تحت التزامن |
| `fn_booking_paid()` | trigger | يقفل السبوطة · يسجل الإحالة · يخصم الرصيد · يجدول إشعار التأكيد |
| `fn_wallet_balance()` | trigger | يحدّث `profiles.wallet_balance` من `wallet_ledger` |
| `fn_sbota_count()` | trigger | يحدّث `profiles.sbota_count` عند `attended` |
| `fn_mutual_affinity()` | trigger | يضبط `mutual_at` ويجدول إشعار للاتنين |
| `fn_ratings_rollup()` | trigger | متوسطات `captains` و`venues` |
| `fn_cancel_booking(booking_id, by)` | rpc | سياسة الاسترداد (§5) + ترقية قائمة الانتظار |
| `fn_can_book(profile_id, sbota_id)` | rpc | السن · الغامضة (≥2) · الحظر · التكرار |
| `fn_can_book_mystery(profile_id)` | rpc | `sbota_count ≥ 2` |
| `fn_is_mutual(a, b)` | **security definer** | الاستعلام **الوحيد** المسموح على `pair_affinity` |
| `fn_open_one_on_one(other_id)` | **security definer** | ينشئ غرفة خاصة بعد التحقق من التبادل |
| `fn_who_booked(sbota_id)` | **security definer** | يرجّع المجمّع بدون أي معرّف |
| `fn_soft_delete_profile()` | rpc | إخفاء فوري + جدولة المسح بعد 30 يوم |
| `fn_profile_is_complete(profile_id)` | helper | 5 اهتمامات + الموافقتين |

### سياسة الإلغاء (§`fn_cancel_booking`)

| الحالة | المرتجع |
|---|---|
| المستخدم يلغي ≥ 5 أيام | 100% على البوابة |
| 3–5 أيام | 50% |
| < 48 ساعة · أول مرة | رصيد كامل في المحفظة |
| < 48 ساعة · مش أول مرة | صفر + `behavior_flags(late_cancel)` |
| إحنا لغينا | 100% + رصيد 10% اعتذار |

> النسب دي في `settings` مش في الكود، علشان تتغير من لوحة الإدارة.
> ⚠ **مختلفة عن نص الضمان الحالي** في `COPY.md` («لو أنت لغيت قبل 3 أيام،
> فلوسك كاملة») — راجع §10 بند 4.

---

## 5. سياسات أمان الصفوف (RLS)

**RLS مفعّل على كل جدول بدون استثناء**، والافتراضي: مفيش سياسة = مفيش وصول.

| الجدول | قراءة | كتابة |
|---|---|---|
| `profiles` | صاحبه · الإدارة · الكابتن (بعد `reveal_at`، أعمدة محدودة) · المتبادلون | صاحبه فقط |
| `avatar_path` | **صاحبه · الكابتن المعيّن بعد الكشف · الإدارة · المتبادلون** | صاحبه |
| `sbotat_public` (عرض) | الكل — **بدون `address` و`venue.map_*` لو `address_hidden`** | — |
| `sbotat` (الجدول) | الإدارة والكابتن المعيّن | الإدارة |
| العنوان الكامل | صاحب حجز `paid` فقط (عرض `sbota_address`) | — |
| `who_booked` | الكل عبر `fn_who_booked` — عدد ونسب بس | — |
| `bookings` | صاحبه · الكابتن المعيّن · الإدارة | صاحبه (إنشاء) · الدوال |
| `messages` | عضو الغرفة غير المحذوف **وبين `opens_at` و`closes_at`** | نفس الشرط + `sender_id = auth.uid()` |
| `chat_members` | أعضاء الغرفة | الدوال فقط |
| `pair_affinity` | **محدش** — الوصول عبر `fn_is_mutual` بس | صاحب التقييم (insert) |
| `reviews` | صاحبه · الإدارة | صاحبه مرة واحدة |
| `sbota_photos` | أعضاء المجموعة بعد `published_to_members_at` · الكابتن · الإدارة | الكابتن |
| `payments` · `refunds` · `wallet_ledger` | صاحبه · الإدارة | **الخادم فقط** (service role) |
| `otp_codes` | **محدش** | الخادم فقط |
| `audit_log` | الإدارة | محفّزات فقط |
| `settings` | الكل (قراءة) | الإدارة |

**قواعد ثابتة:**
- مفتاح الخدمة (`service_role`) في `app/api/*` و Edge Functions **بس** — ممنوع في أي ملف تحت `src/components` أو `src/app/**/page.tsx`.
- الويبهوك: تحقق HMAC + `idempotency_key` فريد → إعادة الإرسال ما بتتحسبش مرتين.
- حدود معدل: `send-otp` 3/ساعة/رقم و5 محاولات تحقق · `messages` 20/دقيقة · `book` 10/ساعة.

### اختبارات السياسات (pgTAP) — الأربعة الإلزامية

1. مستخدم A ما يشوفش `avatar_path` بتاع B قبل `reveal_at`.
2. A ما يقدرش يقرأ صف `pair_affinity` بتاع B بأي استعلام.
3. A ما يقدرش يكتب `message` في غرفة مش عضو فيها (ولا بعد `closes_at`).
4. A ما يشوفش `address` لسبوطة مش حاجزها.

---

## 6. Edge Functions والمهام المجدولة

| الدالة | الجدولة |
|---|---|
| `send-otp` · `verify-otp` | عند الطلب |
| `create-payment` · `payment-webhook` · `instapay-submit` | عند الطلب |
| `match` | `*/10 * * * *` للسبوطات اللي `reveal_at` جاي خلال ساعتين |
| `reveal` | `*/10 * * * *` |
| `notify` | `* * * * *` (طابور بإعادة محاولة أُسّية) |
| `remind` | `*/15 * * * *` (24 ساعة و3 ساعات) |
| `after-sbota` | `*/30 * * * *` (تقييم +2h · صور +24h) |
| `win-back` | يوميًا 18:00 |
| `mystery-clues` | يوميًا 10:00 |
| `payouts` | أسبوعيًا الأحد 09:00 |
| `metrics` | يوميًا 03:00 |
| `purge` | يوميًا 04:00 |

**قوالب واتساب** (12) في `notification_templates` بالنصوص من `COPY.md`:
`auth_code` · `booking_confirmed` · `group_reveal` · `reminder_24h` · `reminder_3h`
· `cancelled_by_us` · `waitlist_promoted` · `review_request` · `photos_ready`
· `win_back` · `mutual_match` · `weekly_schedule`.

---

## 7. ربط `src/lib/api.ts` — جدول التطابق

**الأسماء الحالية بتتحافظ عليها بالحرف** (البرومبت §0 بيقول كده، و§6 فيه أسماء
مختلفة شوية — الأسماء الحالية هي اللي تمشي علشان الواجهات ما تتلمسش).

| دالة موجودة | مصدر البيانات الجديد | ملاحظة |
|---|---|---|
| `getSbotat(opts)` | `sbotat_public` + `fn_who_booked` | نفس الشكل |
| `getSbota(slug)` | + `sbota_address` لو عنده حجز `paid` | |
| `getRandomSbota(tod, exclude)` | استعلام عشوائي مفلتر | = `getOne` في البرومبت |
| `getCaptains` · `getCaptain` | `captains ⋈ profiles` | |
| `applyAsCaptain` | `captain_applications` (جدول صغير جديد) | |
| `sendOtp` · `verifyOtp` | Edge Functions | **`hint` بيتشال** — §10 |
| `createAccount(profile)` | `completeProfile` منطقيًا | نفس الاسم |
| `getMe()` | `profiles` + رصيد + كود + متبادلين | |
| `book(slug)` | `create-payment` | بيرجّع `redirectUrl` كمان |
| `redeemReferral(code)` | تحقق `coupons`/`referral_code` | |
| `pay(input)` | **بيتغيّر جذريًا** — §10 بند 1 | |
| `getBookings` · `getBooking` | `bookings ⋈ sbotat` | |
| `getGroup(bookingId)` | `sbota_groups` + `chat_rooms` | نفس شكل `Group` |
| `requestGirlsOnly` | يفتح `reports`-lite / طلب نقل | |
| `getChat(bookingId)` | يحل الغرفة من الحجز داخليًا | + اشتراك Realtime |
| `sendMessage` · `reportMessage` · `removeFromRoom` | `messages` / `reports` / `chat_members` | + معرّفات اختيارية |
| `submitReview(payload)` | `reviews` + `pair_affinity` | + `seeAgainIds?` اختياري |
| `getMetBefore()` | عبر `fn_is_mutual` | |
| `getClues` · `getCompletedCount` | `mystery_clues` · `profiles.sbota_count` | |
| `getCaptainBoard` · `markArrived` · `uploadGroupPhotos` · `saveCaptainReport` | جداول الكابتن | + معرّفات اختيارية |
| `finishGame(answers)` | يكتب `type` و`type_scores` | نفس قواعد `src/lib/type.ts` |
| `subscribeSchedule(phone)` | `weekly_schedule_subs` | |
| `track(event, props)` | `events` | |

**دوال جديدة تتضاف:** `submitInstapay(bookingId, file)` · `openOneOnOne(profileId)`
· `getMap()` · `getMystery()`.

**حقول اختيارية تتضاف للأنواع** (مسموح بالبرومبت §0):
`Person.id?` · `Sbota.id?` · `Booking.roomId?` · `Me.id?`.
كلها اختيارية فما بتكسرش أي واجهة.

---

## 8. متغيرات البيئة (`.env.example`)

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # الخادم بس
SUPABASE_DB_URL=

WHATSAPP_PROVIDER=                  # meta | local
WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
WHATSAPP_TEMPLATE_AUTH=
SMS_PROVIDER_KEY=                   # البديل

# مفيش مفاتيح دفع — الدفع يدوي.
# أرقام التحويل في جدول settings مش في البيئة:
#   vodafone_number · instapay_handle · manual_review_hours

RESEND_API_KEY=                     # الإيصالات
SENTRY_DSN=
CRON_SECRET=
APP_URL=
TEST_PHONE_ALLOWLIST=               # أرقام الاختبار — غير الإنتاج بس
```

---

## 9. ترتيب التنفيذ

| # | المرحلة |
|---|---|
| 1 | **الموافقة على المشروع الجديد** (§0) |
| 2 | `supabase init` + الهجرات 0001–00xx + `seed.sql` بنفس بيانات `src/data/` |
| 3 | السياسات + اختبارات pgTAP الأربعة |
| 4 | `send-otp` / `verify-otp` + مسار الاختبار |
| 5 | `create-payment` + `payment-webhook` + اختبار التكرار والتزامن |
| 6 | `instapay-submit` + مراجعة الإدارة |
| 7 | `fn_cancel_booking` + قائمة الانتظار |
| 8 | `match` + `reveal` + الغرف |
| 9 | الشات اللحظي + الإبلاغ |
| 10 | التقييم + `pair_affinity` + الشات الخاص |
| 11 | الصور والتخزين والروابط الموقّعة |
| 12 | الإشعارات و12 قالب |
| 13 | المهام المجدولة + اختبار بتزييف الوقت |
| 14 | `/admin` |
| 15 | `weekly_metrics` |
| 16 | مراجعة أمان + `db lint` + `get_advisors` |
| 17 | `RUNBOOK.md` |

---

## 10. تعارضات لازم قرار — قبل ما أبدأ

### 1. الدفع — اتحسم: يدوي بس ✅

**القرار: مفيش بوابة دلوقتي.** المشروع لسه مش تجاري، فالدفع تحويل يدوي على
**فودافون كاش** أو **إنستا باي**، والإدارة بتأكد من `/admin`.

اتشال بالكامل: بايموب · كاشير · مسار الويبهوك · `src/lib/server/payments.ts`.

**الفايدة:** إحنا بره نطاق PCI-DSS تمامًا — مفيش رقم بطاقة بيعدي علينا ولا
بيتخزن عندنا، فمفيش استبيان امتثال ولا تدقيق.

صفحة `/s/[slug]/pay` اتغيّرت: حقول البطاقة اتشالت، وبقت خطوتين —
«احجزلي وورّيني الرقم» ثم رفع صورة التحويل. و`fn_approve_transfer` هي
**الوحيدة** اللي بتخلي الحجز `paid`، وهي للإدارة بس.

الرجوع لبوابة لاحقًا موصوف في `RUNBOOK.md §11`.

### 2. رمز التحقق ظاهر في الواجهة

`sendOtp` بترجّع `hint: '1234'` وصفحة الحساب بتكتب «(في التجربة دي: 1234)».
مع رمز حقيقي ده **تسريب مباشر**. هشيل الاثنين.

### 3. اختبارات Playwright والرمز الحقيقي

الاختبار بيكتب `1234`. مع واتساب حقيقي مش هيعرف الرمز.
**الحل المقترح:** قائمة `TEST_PHONE_ALLOWLIST` — أرقام محددة بتقبل `1234`
**في بيئة غير الإنتاج بس**. الاختبارات تعدّي من غير ما نضعّف الإنتاج.

### 4. نص الضمان مختلف عن سياسة الاسترداد

`COPY.md` بيقول: «لو أنت لغيت **قبل 3 أيام**، فلوسك كاملة.»
البرومبت ده بيقول: **≥ 5 أيام** 100% و**3 أيام** 50%.
**تعارض مباشر.** محتاج أعرف الصح — النص المعروض للناس ولا السياسة الجديدة؟
(هحط النسب في `settings` على أي حال، بس النص لازم يطابقها.)

### 5. `Person` من غير معرّف

`submitReview` بياخد `seeAgain: string[]` **أسماء**، و`removeFromRoom` و
`markArrived` كمان بالأسماء. الأسماء مش فريدة (ممكن مريم اتنين في مجموعة).
**الحل:** أضيف `id?` اختياري وأستخدمه لما يكون موجود، وأرجع للاسم لو مش موجود.

### 6. المنطقة

البرومبت طالب فرانكفورت؛ المشروع الحالي ستوكهولم. المشروع الجديد هيبقى
`eu-central-1` زي المطلوب.

---

## 11. اللي مش هعمله من غير إذن صريح

- أي كتابة أو هجرة على المشروع `rhvskbkyzlfdpxjrgyju` (نظام الوكالة الشغّال).
- إنشاء مشروع Supabase جديد (بيترتب عليه فاتورة).
- الاشتراك في بايموب/كاشير أو تقديم قوالب واتساب (محتاج بيانات الشركة).

---

## 12. طبقة الشغل (WORK_PLAN.md — المرحلة 1)

الهجرات `0039`–`0046` (`supabase/migrations/20260909*`)، مجمّعة في `WORK_MIGRATION.sql`.
كل كائن فيها idempotent، ومفيش حاجة موجودة اتشالت ولا اتغيّر اسمها.
مطابقة `work_v1` (`fn_build_work_matching`) مؤجّلة للمرحلة 5 — وهي **منفصلة عن قصد**
عن `fn_build_matching`: لو الأصلية اتغيّرت بعدين لازم تتراجع دي يدويًا (WORK_PLAN §8 #3).

### 12.1 أنواع جديدة

```
work_status_t      freelancer | remote_employee | business_owner | student | employee | other
work_style_t       silent | chatty | depends
experience_t       under_1 | one_to_three | three_to_five | five_plus
outlets_t          few | enough | plenty
noise_t            quiet | medium | lively
pass_kind_t        four | eight
pass_status_t      pending | active | used_up | expired | refunded | cancelled   ← cancelled: التحويل اترفض قبل التفعيل
recurring_status_t active | paused | cancelled
lead_status_t      new | contacted | converted | dropped
venue_kind_t       + cafe_work | coworking
```

### 12.2 امتدادات على جداول موجودة

| الجدول | الأعمدة |
|---|---|
| `profiles` | `work_status`, `profession_id → professions`, `secondary_profession_id`, `work_style`, `open_to_collab` (true), `years_experience`, `work_days_pref text[]`, `work_area_pref`, `work_no_show_count` (0) |
| `sbota_templates` | `is_work` (false), `work_config jsonb` |
| `sbotat` | `is_work` — بيتنسخ من القالب بمحفّز `t_sbotat_is_work` + فهرس جزئي `where is_work` |
| `payments` | `pass_id → work_passes` · **`booking_id` بقى nullable** · قيد `payments_target_ck` (واحد من الاتنين لازم) |
| `bookings` | `paid_with_pass` (false) |
| `settings` | `work_pass4_price` 40000 · `work_pass4_weeks` 6 · `work_pass8_price` 72000 · `work_pass8_weeks` 10 · `work_single_price` 12000 · `work_first_time_price` 6000 · `work_profession_mix_max` 2 · `work_lunch_at` 13:00 · `work_complaint_at` 14:30 · `work_recurring_lead_days` 7 · `work_pass_refund_days` 3 · `work_conversion_target_pct` 25 |
| `sbotat_public` | + `is_work`, `work_config` في الآخر |

### 12.3 جداول جديدة

| الجدول | الدور | ملاحظات |
|---|---|---|
| `professions` | قاموس المجالات (15 بذرة) | `key` فريد، `sort_order`, `is_active` |
| `work_venues` | مواصفات مكان الشغل — 1:1 مع `venues` | `wholesale_seat_price` و`notes_ar` للإدارة بس |
| `work_passes` | الكروت | `pending` → `active` عند الاعتماد · قيد `sessions_used <= sessions_total` · حارس `t_guard_pass_columns` |
| `pass_redemptions` | كل خصم ورجوع | `booking_id` فريد |
| `recurring_bookings` | اليوم الثابت | فهرس فريد جزئي `(profile_id, weekday) where status <> 'cancelled'` |
| `work_affinity` | «عايز تشتغل مع مين» | نسخة `pair_affinity` بالحرف — محفّز `t_mutual_work_affinity` |
| `venue_reports` | حساب الأسبوع لكل مكان | فريد `(venue_id, week_start)` |
| `leads` | نموذج الشركات | الإدراج عبر `fn_submit_lead` بس (3/يوم/رقم) |
| `work_metrics` | عرض مادي أسبوعي | `conversion_30d_pct` = نسبة اللي أول حجز شغل ليهم اتبعه حجز ترفيهي مدفوع خلال 30 يوم |

**عروض:** `work_venues_public` (security invoker فوق `fn_work_venues_public()` — من غير سعر الجملة؛
العنوان بيظهر بس لو فيه سبوطة شغل معلنة مش مخفية العنوان) · `work_group_members`
(security invoker فوق `fn_work_group_members()` — الاسم الأول والمجال والأسلوب والخبرة لزمايل
مجموعتي في سبوطات الشغل **بعد الكشف بس**). مفيش سياسة على `profiles` لزمايل المجموعة عن قصد:
RLS على مستوى الصف كانت هتكشف التليفون والإيميل — نفس قرار `fn_group_members`.

### 12.4 دوال

| الدالة | بتعمل إيه | مين يناديها |
|---|---|---|
| `fn_redeem_pass(p_booking_id) → jsonb` | خصم جلسة من أقدم كارت نشط · `paid_with_pass` · الحجز `paid` لو كان مستني | صاحب الحجز / الخادم |
| `fn_revert_pass(p_booking_id, p_force=false) → jsonb` | رجوع الجلسة لو قبل `work_pass_refund_days` (أو `p_force`) | الخادم (من `fn_cancel_booking`) |
| `fn_activate_pass(p_payment_id) → jsonb` | `active` + `starts_at/expires_at` + إشعار `work_pass_activated` | الإدارة / `fn_approve_transfer` |
| `fn_pass_balance(p_profile)` · `fn_my_pass_balance()` | الجلسات الباقية | الخادم · العميل |
| `fn_group_professions(p_sbota_id) → jsonb` | `{revealed, count, professions[]}` — قبل الكشف العدد بس | الكل (anon) |
| `fn_work_collab_state(p_other) → 'mutual' \| 'none'` | الوصول الوحيد لـ `work_affinity` | العميل |
| `fn_work_want(p_other, p_booking_id=null, p_want=true) → 'mutual' \| 'none'` | بتكتب جهتي بس في `work_affinity` (مفيش قراءة) — **دي طريقة الكتابة الوحيدة اللي بتشتغل** لأن update/upsert مباشر ما بيوصلش للصف من غير سياسة select | العميل |
| `fn_work_group_members()` · `fn_work_venues_public()` | خلف العرضين | العميل · الكل |
| `fn_venue_report(p_week_start date) → int` | تبني/تحدّث `venue_reports` | `job_work_venue_reports` / الإدارة |
| `fn_work_metrics(p_weeks=12)` | قراءة `work_metrics` بصلاحية `settings.view` | اللوحة |
| `fn_submit_lead(company, contact_name, phone, people_count, times_per_month, note) → uuid` | نموذج الشركات بحد معدل | الكل (anon) |
| `fn_cancel_booking` (امتداد) | لو `paid_with_pass` → `fn_revert_pass` بدل الفلوس، `refund_kind` = `full` لو رجعت / `none` لو لأ | زي ما هو |
| `fn_approve_transfer` (امتداد) | لو `payments.pass_id` → `fn_activate_pass` ولا بيلمس `bookings` | زي ما هو |
| `test_work_rls()` | 12 اختبار سياسات — بترمي استثناء لو حاجة رسبت | SQL Editor |

### 12.5 مهام pg_cron

| المهمة | الجدولة (UTC) | بتعمل إيه |
|---|---|---|
| `job_work_recurring` | `0 7 * * *` | اليوم الثابت: حجز بالكارت + `work_recurring_booked` · مفيش رصيد → `work_no_pass_balance` · مفيش سبوطة → `provider_alerts` |
| `job_work_pass_reminders` | `0 8 * * *` | `expired` · `work_pass_low` · `work_pass_expiring` |
| `job_work_venue_reports` | `0 6 * * 1` | `fn_venue_report` للأسبوع اللي فات |
| `job_work_metrics` | `15 3 * * *` | تجديد `work_metrics` |

### 12.6 سياسات الصفوف

| الجدول | قراءة | كتابة |
|---|---|---|
| `professions` | الكل | `fields.edit` |
| `work_venues` | الإدارة (الأعضاء عبر `work_venues_public`) | `sbotat.edit` |
| `work_passes` | صاحبها + الإدارة | صاحبها إدراج `pending` بس · `payments.review` · الرصيد من الدوال بس |
| `pass_redemptions` | صاحب الكارت + الإدارة | الدوال |
| `recurring_bookings` | صاحبها + الإدارة | صاحبها · `bookings.edit` |
| `work_affinity` | محدش (الإدارة select) | سياسات insert/update لصاحب `a`/`b` زي `pair_affinity` — بس عمليًا الكتابة عبر `fn_work_want` (شوف 12.4) |
| `venue_reports` | `payments.view` | `payments.review` |
| `leads` | `people.view` | `fn_submit_lead` بس · تعديل `people.view` |
| `payments` | + صاحب الكارت يشوف دفعة كارته | — |

### 12.7 قوالب إشعارات جديدة

`work_recurring_booked` · `work_no_pass_balance` · `work_pass_low` · `work_pass_expiring`
· `work_collab_match` · `work_venue_changed` · `work_first_time_offer` · `work_pass_activated` (زيادة).

---

## 13. المطابقة والتعاون (المرحلة 5 — الهجرات 0047–0049)

مجمّعة في `WORK_MIGRATION_3.sql` — ملف واحد يتلزق في SQL Editor **مرة واحدة**
(مفيش أنواع `enum` جديدة فمفيش داعي يتقسّم). كله `create or replace` وآمن يتكرر.

### 13.1 `fn_pair_want` — إصلاح عطل حقيقي في «عايز تشوف مين تاني؟»

`submitReview` كانت بتعمل `select` على `pair_affinity` وبعدين `insert` أو `update`.
سياسات 0009 مدّياش الأعضاء **أي** سياسة `select` على الجدول (`pair_admin_read` للإدارة بس)،
وبوستجريس بتطبّق سياسة الـ `select` على الصفوف اللي الـ `UPDATE` بيقراها. النتيجة:

* الـ `select` بيرجّع فاضي دايمًا → الكود بيروح على الـ `insert`
* الـ `insert` بيضرب في `unique(a_id, b_id)` لو الطرف الأول سجّل قبله
* الـ `update` (لو اتنادى) بيعدّي على **صفر صفوف**

يعني **تاني واحد في أي زوج ما كانش بيقدر يسجّل رغبته أبدًا** — `mutual_at` عمره ما اتحط،
ومحدش اتوصل بحد من أول يوم. `fn_pair_want(p_other, p_booking_id, p_want)` نسخة طبق الأصل
من `fn_work_want` (0042): `security definer`، بترتّب الزوج `a_id < b_id`، بتكتب جهة اللي
بينادي بس، وبترجّع `'mutual' | 'none'`. `execute` مسحوبة من `public`/`anon` وممنوحة لـ
`authenticated`.

> نظير `fn_work_collab_state` للأزواج العاديين موجود من 0007 وهو `fn_is_mutual(other_id) boolean`
> — فما اتعملش `fn_pair_collab_state`، كانت هتبقى نفس الدالة باسم تاني.

### 13.2 `fn_build_work_matching(p_sbota)` — `work_v1`

نفس شكل مخرجات `fn_build_matching` بالحرف (`matching_runs.proposal` بـ `groups[].members`
و`groups[].why`) علشان لوحة `/admin/matching` و`fn_reveal` يقروها من غير أي تعديل، بس
`algorithm_version = 'work_v1'` ومفتاح زيادة `proposal->'deferred'`.

| # | القاعدة (WORK_PLAN §3) | التنفيذ |
|---|---|---|
| 1 | أقصى `settings.work_profession_mix_max` (2) من نفس المجال | قيد صارم في التوزيع — اللي مالوش مكان بيتأجّل بـ `profession_cap` |
| 2 | تجانس `work_style` | صارم: الأقلية بين `silent` و`chatty` صفر أو ≥ 2. `depends` حياد. التوزيع الجشع بياخد نقاط تجانس، وبعده **جولة إصلاح** بتبدّل واحد بواحد بين مجموعتين لحد ما مفيش مجموعة فيها واحد بس مختلف — ولو مفيش تبديل ممكن بيتأجّل بـ `style_alone` |
| 3 | السن **مش معيار** | الدالة ما بتقراش `birth_year` خالص — مفيش قيد ولا نقاط ولا ترتيب بالسن |
| 4 | بنات بس | نفس الفلتر الصارم ونفس رسالة الرفض بتاعة `fn_build_matching` |
| 5 | سنين الخبرة | `+2` لو المستوى جديد على المجموعة — مكافأة بس |
| 6 | الغياب | `work_no_show_count >= 2` بيمنع المقعد **إلا** لو `bookings.paid_with_pass` — بيتأجّل بـ `work_no_show` |
| 7 | «ليه المجموعة دي؟» | بلغة الشغل: «{n} مجالات مختلفة، وكلكم قلتوا إنكم بتحبوا تشتغلوا في هدوء الصبح.» — مجالات وأسلوب، مفيش أعمار |

اللي بيتأجّل ما بيتحطش في أي مجموعة، فبيظهر في تبويب «المجموعات» تحت **«من غير مجموعة»**
واللي بيراجع بينقّله بإيده. `fn_reveal` ما بتلمسهوش (بيفضل `group_id = null`).

**تحذير الصيانة (WORK_PLAN §8 #3):** الدالتين منفصلتين عن قصد. أي تعديل على
`fn_build_matching` **مش** بيوصل لـ `fn_build_work_matching` — لازم يتنقل بإيدك.

### 13.3 `test_pair_want()`

`select * from test_pair_want();` — 8 اختبارات بتثبت العطل (الـ `update` بصفر صفوف والـ `insert`
اللي بيضرب في القيد الفريد) وبتثبت الإصلاح (التبادل بيفتح، والسحب بيشيل جهة واحدة بس).
بترمي استثناء لو حاجة رسبت. مستقلة تمامًا عن `test_rls()` و`test_work_rls()`.

### 13.4 الواجهة

| الملف | اللي اتعمل |
|---|---|
| `src/lib/collab.ts` (جديد) | المنفذ الوحيد للجدولين من العميل: `pairWant` · `workWant` · `workCollabState` · `getBookingCollab` · `getProfessions` · `getMyWorkProfile` · `saveWorkProfile`. كل قراءة بتعدّي على `safeCollab` بمهلة 8 ثواني (نفس `safeWork` في `api.ts`) |
| `/my/[id]/review` | قسم «عايز تشتغل مع مين؟» بيظهر مع «عايز تشوف مين تاني؟» لما السبوطة `is_work` — نفس المكوّن ونفس السرية |
| `/join` | خطوة الشغل الاختيارية — بتظهر بس مع `?from=shoghl` أو لما يقول فريلانسر/موظف من البيت |
| `/game` | سؤال أخير اختياري للفريلانسرز → `profession_id` |
| `/admin/matching` | لو `sbotat.is_work` بتنادي `fn_build_work_matching` بدل `fn_build_matching` — الباقي زي ما هو |
| `scripts/check-work-matching.ts` | محاكاة TS لقواعد `work_v1` من غير قاعدة + خطة اختبار SQL مطبوعة (بعكس `check-matching.ts` اللي محتاج قاعدة) |
