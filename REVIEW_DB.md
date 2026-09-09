# REVIEW_DB.md — مراجعة قاعدة البيانات والمدفوعات

مراجعة **قراءة وتوثيق بس** — مفيش أي ملف اتعدّل غير الملف ده.

**الطريقة:** اتعمل cluster محلي Postgres 16.13، واتعمل stub لكل حاجة خاصة بـ Supabase
(`auth.users` · `auth.identities` · `auth.uid()` · `storage.objects` · `storage.buckets`
· `storage.foldername()` · `cron.schedule/cron.job` · `net.http_post` · أدوار
`anon`/`authenticated`/`service_role`)، وبعدين **الـ71 هجرة اتشغّلوا بالترتيب كلهم
بنجاح**. كل رقم في التقرير ده مقيس فعليًا بـ SQL على الـ cluster ده إلا لما يتكتب
صراحةً «قراءة بس».

---

## الجدول

| # | الخطورة | المجال | المشكلة | فين بالظبط | الأثر | الإصلاح المقترح | من اللوحة ولا كود؟ | الوقت |
|---|---|---|---|---|---|---|---|---|
| D1 | 🔴 | فلوس | **الرصيد بيترد كاش.** حجز اتدفع 100% من المحفظة (`wallet_used = 30000`, كاش واصل = **صفر**) — لما العضو يلغي قبل 3 أيام، `fn_cancel_booking` بياخد `refund_amt := b.price_paid` (= 30000، السعر قبل خصم المحفظة) وبيعمل صف `refunds` نوعه `gateway` بـ 30000، **والمحفظة ما بترجعش** (فضلت 0). يعني العضو حوّل رصيد المتجر لفلوس حقيقية. مقيس كمان بحجز جزئي: كاش واصل 20000، الاسترداد الموعود 30000 → **زيادة 10000** | `20260908095500_0008_booking_lifecycle.sql` → `fn_cancel_booking` (سطر 131–160، وآخر نسخة في `0019_fix_cancel_status_cast.sql`) + `src/app/api/pay/create/route.ts:142` (`price_paid: basePrice - discount` من غير طرح `wallet_used`) | خسارة فلوس مباشرة تساوي `wallet_used` في كل إلغاء مبكر. قابل للاستغلال المتكرر: اشحن رصيد من استرداد → احجز → الغي → خد كاش | في `fn_cancel_booking` خلّي المبلغ الراجع كاش = `b.price_paid - b.wallet_used`، والجزء بتاع `wallet_used` يرجع صف `wallet_ledger` بـ `refund_credit`. الأفضل: خزّن `cash_paid` كعمود مستقل على `bookings` بدل ما تعيد اشتقاقه | كود (هجرة) | 3 س |
| D2 | 🔴 | فلوس | **`coupons.used_count` عمره ما بيتزوّد.** لا في كود ولا في محفّز ولا في دالة. `/api/pay/create` بيقراه بس (`cp.used_count < cp.max_uses`) وبعد كده مفيش أي كتابة. مثبت: بعد حجز مدفوع كامل بكوبون `max_uses=1`، `used_count` فضل **0** | العمود: `20260908095052_0004_demand.sql:163` · القراية: `src/app/api/pay/create/route.ts:112,121` · مفيش كاتب في أي مكان | **`max_uses` مالهاش أي معنى.** كوبون «مرة واحدة» ينفع يتستخدم من عدد لا نهائي من الناس وعدد لا نهائي من المرات. كوبون 100% يتسرّب = خسارة مفتوحة | محفّز `after update of status on bookings when (new.status='paid')` يزوّد `used_count` بشرط `referral_code_used` يطابق كوبون، مع `update coupons set used_count = used_count + 1 where code = ... and (max_uses is null or used_count < max_uses)` وبيرمي exception لو مالحقش. الأمان الحقيقي = جدول `coupon_uses(coupon_id, booking_id)` بمفتاح فريد | كود (هجرة) | 2 س |
| D3 | 🔴 | فلوس | **`first_booking_only` عمره ما اتفحص.** `/api/pay/create` أصلًا مش بيختاره في الـ `select` (بيجيب `kind, value, expires_at, max_uses, used_count` بس) | العمود: `20260908095052_0004_demand.sql:165` · `src/app/api/pay/create/route.ts:112` | كوبون الترحيب «لأول حجز بس» شغّال لأي حد في أي حجز. لوحة الإدارة بتوريه checkbox شغّال (`src/app/admin/payments/page.tsx:1526`) فالإدارة فاكرة إنه بيتنفّذ | ضيف `first_booking_only` للـ select، ولو `true` اتأكد إن `count(bookings where profile_id=uid and status in ('paid','attended')) = 0`. الأنضف: انقل حساب الخصم كله لدالة `fn_price_quote(profile, sbota, code)` علشان المنطق يبقى في مكان واحد | كود | 1 س |
| D4 | 🔴 | خصوصية / امتثال | **`job_purge` مستحيل ينجح.** بيحط في `phone` كلمة `deleted-` ملزوقة بـ `id::text`، وده بيكسر `profiles_phone_check CHECK (phone ~ '^\+201[0125][0-9]{8}$')`. مثبت: أول حساب مستحق للمسح بيرمي `check constraint violation` وبيوقّع الدالة كلها | `20260908103005_0026_scheduled_functions.sql:279-283` → `job_purge()` | **مسح البيانات بعد 30 يوم ما بيحصلش أبدًا.** وكمان `delete from otp_codes` اللي فوقه بيترجع مع الـ transaction، يعني أكواد OTP بتتكوّم للأبد. ده خرق مباشر لوعد المسح وللمادة الخاصة بالمحو في قانون 151/2020 | استعمل قيمة بتعدّي القيد (`'+201000000000'` مش مقبولة كمان لأنها فريدة) — الحل الصح: خلّي `phone` nullable وحطه `null`، وشيل الرقم من `auth.users` كمان. وافصل `delete from otp_codes` في دالة لوحدها علشان ما توقعش مع الباقي | كود (هجرة) | 2 س |
| D5 | 🔴 | تشغيل | **إشعارات غير الشغل عمرها ما بتتبعت.** المصرف الوحيد الموجود هو `runWorkNotify()` وبيسحب `template_key like 'work%'` بس. مفيش أي cron job اسمه `notify` (اتفحص `cron.job` — 12 مهمة، مفيش فيهم واحدة للإشعارات العامة) | `src/lib/server/notify.ts:257` + `:319` · `src/app/api/cron/work-notify/route.ts` · جدول `cron.job` بعد إعادة تشغيل الهجرات | `booking_confirmed` · `group_reveal` · `reminder_24h` · `reminder_3h` · `waitlist_promoted` · `review_request` · `photos_ready` · `win_back` · `cancelled_by_us` · `transfer_received` · `transfer_rejected` كلهم بيتكتبوا في `notifications` وبيفضلوا `queued` للأبد. العضو بيدفع وما بيوصلوش تأكيد، والمجموعة بتتكشف وما حدش بيعرف. والجدول بيكبر بلا حد ومفيش تنظيف ليه في `job_purge` | إما توسّع `runWorkNotify` لكل القوالب مع قناة لكل واحد، أو أضف `job_notify()` + `cron.schedule('nasbot-notify','* * * * *', ...)`. وضيف تنظيف للإشعارات المرسلة الأقدم من 90 يوم في `job_purge` | كود (هجرة + كود) | 6 س |
| D6 | 🔴 | فلوس | **`job_expire_bookings` بيلغي حجز صورة تحويله تحت المراجعة.** بيلغي أي `pending_payment` عدّى `expires_at` من غير ما يبص على حالة الدفعة. مثبت: حجز دفعته `pending_review` + `expires_at` عدّى → اتلغى `cancelled_by_us`، والدفعة فضلت `pending_review` | `20260908103005_0026_scheduled_functions.sql:147` → `job_expire_bookings()` · مسار الرفع: `src/app/api/pay/transfer/route.ts:42` بيحط 24 ساعة بس، و`settings.manual_review_hours = 2` | لو الإدارة اتأخرت فوق 24 ساعة (إجازة/ويكند)، العضو اللي حوّل فعلًا بيتلغي حجزه، فلوسه واصلة، ومفيش استرداد تلقائي ولا حتى تنبيه. المكان بيروح لحد تاني | ضيف للـ `where` شرط `and not exists (select 1 from payments p where p.booking_id = bookings.id and p.status in ('pending_review','succeeded'))`، وضيف تنبيه للإدارة على أي دفعة `pending_review` عدّى عليها `manual_review_hours` | كود (هجرة) | 1 س |
| D7 | 🔴 | سلامة المخطط | **مفيش أي قيد يمنع الفلوس السالبة.** مثبت بـ INSERT: `payments.amount = -500000` ✅ اتقبل · `bookings(price_paid=-99999, discount=-500, wallet_used=-1000)` ✅ اتقبل · `sbotat.price = -100000` و`org_fee = -5000` ✅ اتقبل · `coupons.value = -9999` ✅ اتقبل. و`refunds.amount` كمان بلا قيد | `20260908095052_0004_demand.sql` (`payments`, `bookings`, `refunds`, `coupons`) · `20260908095007_0003_supply.sql` (`sbotat.price`, `org_fee`) | غلطة صفر واحد في لوحة الإدارة أو bug في الحساب بيقلب علامة المبلغ من غير ما القاعدة تزعّق. مطابقة الفلوس بتتلغبط ومفيش أي حاجز أخير | ضيف `check (amount >= 0)` على `payments` و`refunds`، `check (price_paid >= 0 and discount >= 0 and wallet_used >= 0 and wallet_used <= price_paid)` على `bookings`، `check (price >= 0 and org_fee >= 0 and org_fee <= price)` على `sbotat`، و`check (value > 0)` على `coupons`. (`wallet_ledger.delta` يفضل باتجاهين — ده مقصود) | كود (هجرة) | 1 س |
| D8 | 🟠 | محفّزات | **`fn_booking_paid` ما بيشتغلش على INSERT.** المحفّز `after update of status` بس. مثبت: `insert into bookings(... status='paid', wallet_used=20000, referral_code_used='SARA01')` → صفر خصم من المحفظة (الرصيد فضل 20000)، صفر صف في `referrals`، صفر إشعار `booking_confirmed`، والسبوطة ما بقتش `full`. نفس السيناريو بـ UPDATE بيشتغل صح (رصيد 0، إحالة 1، إشعار 1) | المحفّز: `20260908095500_0008_booking_lifecycle.sql:52` · المستهلك المكسور: `20260909100600_0045_work_jobs.sql:103-105` → `job_work_recurring` بيعمل `insert into bookings (...) values (..., 'paid', 0, true)` | حجوزات «اليوم الثابت» بتتعمل من غير ما السبوطة تتقفل على السعة، ومن غير إشعار للعضو. `fn_capacity_guard` بيشتغل على الـ INSERT (اتأكدنا) فالسعة محمية، بس باقي التبعات لأ | إما خلّي المحفّز `after insert or update of status ... when (new.status = 'paid')`، أو خلّي `job_work_recurring` يعمل `insert` بـ `pending_payment` وبعدين `update ... set status='paid'` زي كل المسارات التانية | كود (هجرة) | 1 س |
| D9 | 🟠 | مفاتيح أجنبية | **حذف حجز بيمسح سجله المالي كله.** `payments.booking_id → bookings ON DELETE CASCADE` و`refunds.payment_id → payments ON DELETE CASCADE`. يعني `delete from bookings where id=…` واحد بيمسح الدفعة والاسترداد معاه | `20260908095052_0004_demand.sql` — قيود `payments_booking_id_fkey` و`refunds_payment_id_fkey` (مثبت من `pg_constraint.confdeltype='c'`) | ضياع دفتر مالي مطلوب ضريبيًا. صف واحد بالغلط في لوحة الإدارة أو سكريبت تنظيف = سجل الدفع اختفى ومفيش أثر. كمان `pass_redemptions.booking_id CASCADE` بيمسح إثبات استهلاك الجلسة | حوّل الاتنين لـ `on delete restrict`، والحذف يبقى soft-delete (`bookings.deleted_at`) زي `profiles`. الفلوس ما تتمسحش أبدًا | كود (هجرة) | 1 س |
| D10 | 🟠 | مفاتيح أجنبية | **حذف بروفايل بيمسح دفتر محفظته.** `wallet_ledger.profile_id → profiles ON DELETE CASCADE`، وكمان `bookings.profile_id`, `work_passes.profile_id`, `referrals.*`, `behavior_flags.profile_id` كلهم CASCADE | مثبت من `pg_constraint`: 44 قيد بـ `confdeltype='c'`. الـ DDL في `20260908094915_0002_people.sql` و`0004_demand.sql` | التصميم كله معتمد على soft-delete (`profiles.deleted_at`)، بس أول `delete` حقيقي — سواء من الإدارة أو من `auth.users` (اللي `profiles.id` معلّق عليه CASCADE برضه) — بيمسح تاريخ الفلوس والمخالفات. حذف مستخدم من لوحة Supabase Auth كفاية | `wallet_ledger` · `payments` · `refunds` · `referrals` → `on delete restrict`. البروفايل يتخفي بـ `deleted_at` و`job_purge` (بعد إصلاح D4) يمسح البيانات الشخصية بس | كود (هجرة) | 2 س |
| D11 | 🟠 | حذف ناعم | **الحساب المحذوف لسه موجود قدام الناس.** مثبت: عضو عمل `deleted_at` وبعدها `fn_who_booked` لسه بيعدّه (`booked: 4`)، و`fn_build_matching` حطه في الاقتراح (`true`)، و`fn_reveal` ضافه في `chat_members` (`true`) | الدوال اللي **مش** بتفلتر `deleted_at`: `fn_who_booked` · `fn_build_matching` · `fn_build_work_matching` · `fn_reveal` · `fn_is_mutual` · `fn_open_one_on_one` · `fn_group_professions` (مقيس بـ `prosrc not ilike '%deleted_at%'`). في `src/` كلها مكان واحد بس بيفلتر: `src/lib/api.ts:893` | حساب متمسوح بيدخل جروب شات مع غرباء، وبيتحسب في العداد المعروض على صفحة السبوطة، وينفع تفتح معاه شات خاص. ده عكس اللي الحذف بيوعد بيه بالظبط | ضيف `and p.deleted_at is null` في الدوال السبعة. الأحسن: عرض `profiles_live` (= `profiles where deleted_at is null`) وكل الدوال تقرا منه بدل الجدول | كود (هجرة) | 2 س |
| D12 | 🟠 | قيود | **قيد الـ18 سنة بيتعدّى بـ `birth_year = null`.** `profiles.birth_year` nullable، والقيد `CHECK (birth_year between 1940 and year(now())-18)` ما بيشتغلش على NULL. وأسوأ: `fn_can_book` بيعمل `age := extract(year from now()) - coalesce(p.birth_year, 0)` = **2026** → بيعدّي حتى شرط الـ21 للرحلات بمبيت. مثبت: بروفايل بـ `birth_year=null` اتقبل، و`fn_can_book` رجّع NULL (= مسموح) | القيد: `20260908094915_0002_people.sql` → `profiles_birth_year_check` · `20260908095401_0007_functions.sql` → `fn_can_book` | حد تحت 18 (أو تحت 21 لرحلة بمبيت) يعدّي بمجرد إنه يسيب سنة الميلاد فاضية. ده خطر قانوني حقيقي مش مجرد bug | `alter table profiles alter column birth_year set not null` (بعد ملء الموجود)، وفي `fn_can_book` بدّل `coalesce(p.birth_year, 0)` بـ `if p.birth_year is null then return 'محتاجين سنة ميلادك'; end if;` | كود (هجرة) | 1 س |
| D13 | 🟠 | فلوس | **الرصيد ينفع يبقى سالب، ومفيش قفل عليه وقت الحجز.** مثبت: `insert into wallet_ledger(delta = -999999)` → `profiles.wallet_balance = -999999` من غير أي اعتراض. وفي `/api/pay/create` الرصيد بيتقرا (سطر 129) من غير `for update` وبعدين بيتخصم في محفّز منفصل | `20260908095052_0004_demand.sql` → `wallet_ledger` (مفيش قيد) · `fn_wallet_balance` (بيجمع وخلاص) · `src/app/api/pay/create/route.ts:129-132` | حجزين متوازيين لنفس العضو كل واحد بيشوف نفس الرصيد وبياخده كله → المحفظة تروح سالب، ونسبوط بيدي خصم مرتين على فلوس مرة واحدة. مفيش أي حاجة بتوقف ده | اقفل البروفايل: `select wallet_balance from profiles where id = uid for update` جوه دالة SQL واحدة بتحسب السعر وتعمل الحجز مع بعض. وضيف محفّز `after insert on wallet_ledger` بيرمي exception لو المجموع بقى `< 0` | كود (هجرة + كود) | 3 س |
| D14 | 🟠 | إعدادات | **خمس مفاتيح في لوحة الإعدادات مش موصّلة بأي حاجة.** `refund_credit_hours` · `commission_pct` · `gateway_fee_pct` · `review_coupon_pct` · `first_time_work_discount_pct` — مقيس: مفيش ولا دالة SQL واحدة بتقراهم (`prosrc like '%…%'` رجّع صفر لكلهم)، وموجودين في `src/app/admin/settings/page.tsx` بس | `20260908095210_0006_reviews_photos_ops.sql:138-160` · `src/app/admin/settings/page.tsx:113` | الإدارة بتغيّر «نافذة الرصيد 48 ساعة» وما بيحصلش حاجة — نافذة الرصيد الفعلية في `fn_cancel_booking` هي **72 ساعة** (كل اللي تحت `refund_full_days * 24` وفوق الصفر). فرق حقيقي في السياسة بين اللي اللوحة بتقوله واللي بيحصل | إما توصّل `refund_credit_hours` في `fn_cancel_booking` (`elsif hours_left >= 0 and hours_left <= cfg.refund_credit_hours and is_first`)، أو تشيل المفاتيح دي من اللوحة. سيبها ظاهرة وهي مش شغالة = أسوأ الاتنين | كود (هجرة + لوحة) | 2 س |
| D15 | 🟠 | فهارس | **55 مفتاح أجنبي من غير فهرس بيبدأ بيه.** مقيس بـ EXPLAIN ANALYZE على 10k صف: `notifications.template_key` → Seq Scan على 10001 صف · `pair_affinity.b_id` → Seq Scan · `work_affinity.b_id` → Seq Scan · `reviews.profile_id` → Seq Scan · `waitlist.profile_id` → Seq Scan · `messages.sender_id` → Seq Scan | الجدول الكامل تحت قسم «الفهارس الناقصة» | كل حذف بروفايل بيعمل Seq Scan على كل الجداول دي علشان يتحقق من الـ FK. `fn_is_mutual` بيدوّر بالاتجاهين وواحد منهم مش مفهرس. عند 10k صف ده محسوس، وعند 100k بيبقى مؤلم | القايمة الكاملة بالـ `create index` تحت | كود (هجرة) | 1 س |
| D16 | 🟠 | مهام مجدولة | **كل الـ12 مهمة بتوقيت UTC مش القاهرة، والفرق بيتغيّر مع التوقيت الصيفي.** مقيس على نفس الـ cluster: القاهرة = **UTC+3 في يوليو** و**UTC+2 في يناير**. يعني `nasbot-winback '0 18 * * *'` بيشتغل **21:00 صيفًا و20:00 شتاءً بتوقيت القاهرة** — و`DB_PLAN §6` طالبها 18:00. و`nasbot-metrics '0 3'` → 05:00/06:00 (المطلوب 03:00)، و`nasbot-purge '0 4'` → 06:00/07:00 (المطلوب 04:00)، و`nasbot-work-recurring '0 7'` → 09:00/10:00، و`nasbot-work-passes '0 8'` → 10:00/11:00، و`nasbot-work-venues 'Mon 06:00'` → الاتنين 08:00/09:00 | `20260908103033_0027_weekly_metrics_and_cron.sql:48-55` · `20260909100600_0045_work_jobs.sql:213-222` | رسايل win-back واتساب بتوصل الساعة 9 بالليل. وكل المواعيد بتتزحزح ساعة مرتين في السنة من غير ما حد يلاحظ. لاحظ إن `next_cairo()` (المستعملة في اليوم الثابت) **عاملة الصح** وبتستخدم `Africa/Cairo` — التناقض جوه المشروع نفسه | اطرح الفرق يدويًا واكتبه في تعليق (`'0 15 * * *'` = 18:00 القاهرة صيفًا)، أو الأنضف: خلّي المهام تشتغل كل ساعة وكل دالة تتحقق بنفسها من `extract(hour from now() at time zone 'Africa/Cairo')` — كده الصيفي مش هيفرق | كود (هجرة) | 2 س |
| D17 | 🟠 | مهام مجدولة | **تلات مهام موعودة في `DB_PLAN §6` مش موجودة أصلًا.** `notify` (`* * * * *`) · `mystery-clues` (يوميًا 10:00) · `payouts` (أسبوعيًا الأحد 09:00). مقيس: `cron.job` فيه 12 صف بس، ومفيش دالة اسمها `job_mystery_clues` ولا `job_payouts` في `pg_proc` | `DB_PLAN.md §6` مقابل `cron.job` بعد إعادة تشغيل الهجرات | `mystery_clues.unlocks_at` موجود ومحدش بيقدّمه — السبوطة الغامضة ما بتكشفش تلميحاتها. `captains.payout_method` موجود ومحدش بيصرف — الكباتن مش بياخدوا فلوسهم أوتوماتيك. و`notify` = D5 | لو المزايا دي مؤجلة، شيلها من `DB_PLAN §6` وسيب تعليق. لو لأ، اكتب `job_mystery_clues()` و`job_payouts()` وجدولهم | كود (هجرة) + توثيق | 4 س |
| D18 | 🟠 | محفّزات | **إشعار `mutual_match` معرّف وعمره ما اتبعت.** القالب متبذور في `notification_templates`، بس `fn_mutual_affinity` بيحط `mutual_at` وبس — مفيش `insert into notifications`. مثبت: بعد ما الطرفين اختاروا بعض، `mutual_at` اتحط لكن عدد إشعارات `mutual_match` = **0**. المقابل في الشغل (`fn_mutual_work_affinity`) **عامل الصح** وبيبعت `work_collab_match` للاتنين | `20260908095129_0005_matching_and_chat.sql` → `fn_mutual_affinity` · القالب: `20260908095913_0012_seed_dictionaries.sql:22` · المقابل الشغّال: `20260909120100_0048_work_matching.sql` → `fn_mutual_work_affinity` | التبادل بيحصل والشات الخاص بيفتح ومحدش من الاتنين بيعرف. الميزة موجودة وغير مرئية. و`DB_PLAN §4` بيقول صراحةً إن الدالة دي «تضبط `mutual_at` **وتجدول إشعار للاتنين**» — فالتنفيذ مخالف للتوثيق | انسخ الـ `insert into notifications` من `fn_mutual_work_affinity` وحطه في `fn_mutual_affinity` بقالب `mutual_match` | كود (هجرة) | 30 د |
| D19 | 🟠 | مهام مجدولة | **`job_purge` بيقع تاني على تصادم `referral_code`.** حتى بعد إصلاح قيد التليفون (D4): بيحط في `referral_code` كلمة `DEL` ملزوقة بأول 3 حروف من `id`، و`referral_code` فريد. مثبت: بعد ما شلت قيد التليفون، اتنين بروفايل بـ uuid بيبدأ بـ `abc` → `duplicate key value violates unique constraint "profiles_referral_code_key"` | `20260908103005_0026_scheduled_functions.sql:281` | 3 حروف hex = 4096 احتمال بس. عند بضع مئات من الحسابات المحذوفة التصادم شبه مؤكد، والمهمة بتقع تاني ومفيش مسح | استخدم `left(id::text, 8)` أو أحسن: `referral_code = null` وخلّي العمود nullable (كود الإحالة مالوش معنى لحساب متمسوح) | كود (هجرة) | 30 د |
| D20 | 🟠 | فلوس | **رفع صورة تانية بيرجّع دفعة ناجحة لـ «تحت المراجعة».** `/api/pay/transfer` بيعمل `update payments set status='pending_review'` بـ `.eq('booking_id', …)` من غير أي شرط على الحالة الحالية، وبيمدد `expires_at` 24 ساعة على أي حجز | `src/app/api/pay/transfer/route.ts:31-43` | العضو بيرفع صورة تاني بعد ما الإدارة وافقت → الدفعة ترجع `pending_review` وهي متأكدة، ولوحة الإدارة تفضل توري الطلب في الطابور. مع D6 السيناريو أوحش: الحجز `paid` وفجأة `expires_at` اترجّع | ضيف `.in('status', ['initiated','pending_review','failed'])` على الـ update، وما تلمسش `expires_at` إلا لو الحجز لسه `pending_payment` | كود | 30 د |
| D21 | 🟠 | فلوس | **الاسترداد الكاش بيتسجّل ومحدش بينفّذه.** `fn_cancel_booking` بيعمل صف `refunds` بـ `status = 'initiated'` لما `r_type = 'gateway'` (مثبت في اختباري A و B و E). مفيش أي مهمة ولا شاشة ولا دالة بتنقل الصف ده لـ `succeeded` — والدفع يدوي أصلًا يعني محدش هيحوّل فودافون كاش أوتوماتيك | `20260908095500_0008_booking_lifecycle.sql` → `fn_cancel_booking` (بلوك `insert into refunds`) · مفيش مستهلك في `cron.job` ولا في `src/app/admin` | فلوس مستحقة للأعضاء قاعدة في جدول محدش بيبص عليه. العضو بيلغي، بيتقاله «فلوسك راجعة»، وما ترجعش. و`fn_cancel_booking` كمان بيتجاهل الاسترداد خالص لو مفيش دفعة `succeeded` (`if found then insert into refunds`) — يعني حجز اتعمل paid يدوي من غير دفعة بيتلغي من غير أي أثر مالي | ضيف تبويب «استردادات مستحقة» في `/admin/payments` بيعرض `refunds where status='initiated'` مع زرار «حوّلت» بيكتب `provider_ref` و`succeeded`. وضيف تنبيه على أي استرداد عدّى عليه 48 ساعة | لوحة + كود | 3 س |
| D22 | 🟡 | أعمدة ميتة | **19 عمود متعرّف ومحدش بيكتب فيه ولا بيقراه** (مقيس: مش موجود في `src/` ولا في أي هجرة غير سطر تعريفه): `bookings.is_first_booking` · `bookings.plus_one_booking_id` · `payments.raw_webhook` · `work_passes.refunded_amount` · `sbotat.weather_cancel_rule` · `captains.payout_method` · `venues.last_inspection_at` · `sbota_templates.requirements` · `sbota_photos.marketing_ok` · `weekly_schedule_subs.unsubscribed_at` · `profiles.open_to_collab` · `profiles.work_area_pref` · `chat_members.joined_at` · `copy_strings.max_length` · `copy_strings.is_html` · `banned_words.added_by` · `personality_types.recommended_template_ids` · `captain_applications.reject_reason` · `profiles.secondary_profession_id` | كل واحد في هجرة تعريفه | أخطرهم اتنين: **`sbota_photos.marketing_ok`** — موافقة العضو على استخدام صورته في التسويق، متخزّنة ومحدش بيفحصها. و**`weekly_schedule_subs.unsubscribed_at`** — إلغاء الاشتراك متسجّل ومحدش بيحترمه. الباقي وزن زيادة بيخلي المخطط يكدب على اللي بيقراه | الاتنين بتوع الموافقة: وصّلهم دلوقتي (أي كود بيقرا صور للتسويق يفلتر `marketing_ok`، وأي إرسال للجدول الأسبوعي يفلتر `unsubscribed_at is null`). الباقي: امسحهم أو اكتب `comment on column … is 'محجوز — المرحلة كذا'` | كود (هجرة) | 2 س |
| D23 | 🟡 | أنواع معدودة | **قيم متعرّفة ومحدش بيكتبها.** `booking_status_t.waitlist` — الانتظار في جدول `waitlist` المستقل، والقيمة دي عمرها ما اتكتبت في `bookings.status` (لوحة الإدارة بتعرضها كفلتر في `src/app/admin/bookings/page.tsx:99` وهترجّع صفر دايمًا) · `refund_kind_t.half` — فرع الـ50% متعطّل بـ `refund_half_days = 0` فالقيمة ميتة · `ledger_reason_t.captain_free_sbota` و`admin_adjust` — في خرايط الترجمة بس · `activity_t.cycling` — اتضافت وما اتستخدمتش · `payment_provider_t.paymob` و`kashier` — محجوزين عمدًا (`DB_PLAN §2`) | `20260908094813_0001_extensions_and_enums.sql` + الإضافات اللاحقة | مش خطر، بس بيخلي أي حد يقرا المخطط يفتكر إن في مسار حجز `waitlist` أو استرداد 50% وهما مش موجودين. وفلتر ميت في لوحة الإدارة | شيل فلتر `waitlist` من `src/app/admin/bookings/page.tsx:99`. سيب `paymob`/`kashier` (محجوزين بقرار) واكتب تعليق على الباقي. حذف قيمة enum في Postgres مكلّف — التوثيق أرخص | لوحة + توثيق | 1 س |
| D24 | 🟡 | فهارس | **فهرس مكرر بالظبط.** `profiles_phone_idx` هو نسخة طبق الأصل من `profiles_phone_key` (قيد الفرادة). مقيس: استعلام على `pg_index` بنفس `indkey` رجّع الزوج ده وهو الوحيد في القاعدة كلها | `20260908094915_0002_people.sql` — `create index … on profiles(phone)` جنب `phone text unique` | مساحة وكلفة كتابة زيادة على كل insert/update لبروفايل، بلا أي فايدة | `drop index profiles_phone_idx;` — قيد الفرادة بيخدم كل الاستعلامات | كود (هجرة) | 10 د |
| D25 | 🟡 | دوال | **`fn_can_book` بيسمح بحجز سبوطة `draft`.** الشرط `if s.status not in ('open','draft')` بيعدّي المسودّات. مثبت: سبوطة `draft` → `fn_can_book` رجّع NULL (مسموح)؛ `cancelled` رجّعت رفض صح | `20260908095401_0007_functions.sql` → `fn_can_book` | مخفّف: `/api/pay/create` بيدوّر على السبوطة في `sbotat_public` اللي بيفلتر `status in ('open','full','locked','running')` — فالمسودّة مش موصولة من مسار التطبيق. بس `fn_can_book` هي الحارس الموثّق، وأي مسار جديد (لوحة الإدارة، دالة تانية) هيثق فيها غلط | شيل `'draft'` من القايمة. لو الإدارة محتاجة تحجز في مسودّة للاختبار، خلّيها استثناء صريح بـ `fn_is_admin()` | كود (هجرة) | 20 د |
| D26 | 🟡 | صلاحيات | **`fn_is_admin` و`fn_has_permission` مش متفقين.** `fn_is_admin` بيقبل `profiles.role = 'admin'` **أو** صف في `admin_users`. `fn_has_permission` بيشوف `admin_users` بس. مثبت: بحساب `profiles.role='admin'` من غير صف في `admin_users`، `fn_approve_transfer` (بتستعمل `fn_is_admin`) اشتغلت، و`fn_build_matching` (بتستعمل `fn_has_permission('matching.run')`) رفضت بـ «مش من صلاحيتك تشغّل المطابقة» | `20260908095401_0007_functions.sql` → `fn_is_admin` · `20260908115654_0035_admin_roles_permissions.sql` → `fn_has_permission` | حساب إدارة «نص شغّال»: يقدر يعتمد تحويلات ويلغي حجوزات (أخطر حاجتين) ومش قادر يشغّل المطابقة. مربك وقت التشخيص، وبيخلي `admin_users` مش هي المصدر الوحيد للصلاحية | وحّدهم: `fn_is_admin` تبقى `fn_has_permission('*')` أو تشوف `admin_users` بس، و`profiles.role` يبقى وصف مش صلاحية. مع سطر bootstrap واضح في `ADMIN_GUIDE.md:81` (موجود بالفعل ✓) | كود (هجرة) | 1 س |
| D27 | 🟡 | فلوس | **«أول مرة» محسوبة غلط في سياسة الإلغاء.** `fn_cancel_booking` بيحسب `is_first` = `count(bookings where profile_id=… and status='attended') = 0` — يعني «عمره ما حضر»، مش «ده أول حجز». والعمود المخصص `bookings.is_first_booking` موجود ومحدش بيكتبه (D22) | `20260908095500_0008_booking_lifecycle.sql` → `fn_cancel_booking` (`select count(*) = 0 into is_first`) | حد حجز 10 مرات وغاب 10 مرات (`no_show`) لسه «أول مرة» وبياخد رصيد كامل في كل إلغاء متأخر. ده بالظبط السلوك اللي السياسة عاملة علشان تمنعه | إما اكتب `is_first_booking` وقت إنشاء الحجز واقراه هنا، أو غيّر الشرط لـ `count(bookings where profile_id=… and status in ('attended','no_show','cancelled_by_user')) = 0` | كود (هجرة) | 1 س |
| D28 | 🟡 | محفّزات | **تلات جداول عندها `updated_at` ومحدش بيحدّثه.** `copy_strings` · `feature_flags` · `maintenance` — مقيس: عندهم العمود ومفيش محفّز `set_updated_at` عليهم (باقي الـ34 جدول عندهم) | `20260908115742_0036_copy_and_game_tables.sql` · `20260908131351_admin_remaining_tables.sql` | `updated_at` بيفضل على وقت الإنشاء للأبد. `copy_strings` هي اللي الإدارة بتعدّل فيها النصوص — فمفيش طريقة تعرف آخر تعديل امتى (فيه `copy_history` بديل، بس الحقل بيكدب) | `create trigger t_x_updated before update on <table> for each row execute function set_updated_at();` لكل واحد | كود (هجرة) | 20 د |
| D29 | 🟡 | قيود | **`profiles_birth_year_check` بيستخدم `now()`.** `CHECK (birth_year >= 1940 and birth_year <= extract(year from now())::int - 18)` — قيد غير ثابت (non-IMMUTABLE). Postgres قبله، بس بيتقيّم وقت الكتابة بس | `20260908094915_0002_people.sql` → `profiles_birth_year_check` | صف اتقبل سنة 2026 يفضل موجود سنة 2027 من غير إعادة فحص (ده مقبول منطقيًا هنا — السن بيكبر). المشكلة الحقيقية: `pg_restore` أو `alter table … validate constraint` في سنة مختلفة ممكن يفشل على صفوف كانت سليمة، وده بيكسر الاستعادة من نسخة احتياطية | استبدله بقيد ثابت `check (birth_year between 1940 and 2100)` وسيب فحص الـ18 لـ `fn_can_book` و`completeProfile` (زي ما `DB_PLAN §3.1` عامل مع شرط الـ21) | كود (هجرة) | 30 د |
| D30 | 🟡 | فلوس | **قسمة صحيحة في الاسترداد النصفي.** `refund_amt := b.price_paid / 2` — قسمة integer بتقطع. سعر فردي بالقروش (مثلاً 30001) بيرجع 15000 مش 15000.5 | `20260908095500_0008_booking_lifecycle.sql` → `fn_cancel_booking` | قرش واحد لكل استرداد نصفي. تافه ماديًا، بس بيخلي المطابقة ما تقفلش بالظبط. ومعطّل حاليًا أصلًا بـ `refund_half_days = 0` (D14) | `(b.price_paid + 1) / 2` (تقريب لصالح العضو) أو `round(b.price_paid / 2.0)::int` | كود (هجرة) | 10 د |
| D31 | 🟡 | تشغيل | **الطابور ينفع يتقفل بصف واحد.** `runWorkNotify` بيسحب `.like('template_key','work%')` (من غير escape للـ `_`) وبعدين بيرمي أي مفتاح مش بادئ بـ `work_` بـ `continue` — **من غير ما يزوّد `attempts`**. يعني قالب زي `workshop_reminder` هيتسحب كل مرة، يتترمى، ويفضل `queued` للأبد | `src/lib/server/notify.ts:257` و`:319` | حجم الدفعة 20. عشرين صف `workshop_*` كفاية يقفلوا مصرف إشعارات الشغل نهائيًا ومن غير أي خطأ في اللوج. `template_kind_t` فيه `workshop` فعلًا فالسيناريو مش نظري | غيّر الفلتر لـ `.like('template_key','work\\_%')`، أو بدل `continue` زوّد `attempts` علشان الصف يخرج من الطابور بعد `MAX_ATTEMPTS` | كود | 30 د |
| D32 | 🟡 | نسخ احتياطي | **الخطة موجودة بس ناقصة.** `RUNBOOK.md §12` فيه `pg_dump`/`pg_restore` وبيقول «Supabase بياخد نسخة يومية تلقائيًا». **مفيش ذكر لـ:** إن النسخ اليومي مش موجود على الباقة المجانية (بيبدأ من Pro)، ولا مدة الاحتفاظ، ولا PITR، ولا تجربة استعادة، ولا — الأهم — إن **`pg_dump` ما بياخدش Storage** | `RUNBOOK.md:386-400` | **إيصالات التحويل عايشة في دلو `receipts` بره الـ dump.** الدفع يدوي، يعني الإيصال ده هو الإثبات الوحيد إن العضو دفع. نسخة احتياطية من غيرها = مفيش دليل على أي دفعة | اتأكد من **Project Settings → Database → Backups** (لازم Pro أو أعلى، وإلا مفيش نسخ تلقائي خالص)، و**Project Settings → Add-ons → Point-in-Time Recovery** لو الـ RPO المطلوب أقل من 24 ساعة. وضيف لـ §12 خطوة نسخ الدلاو (`supabase storage cp -r`) وتاريخ آخر استعادة تجريبية | لوحة Supabase + توثيق | 2 س |
| D33 | 🔵 | فهارس | **فهرسان مالهمش أي مستهلك في `src/lib/**` ولا في دوال SQL.** `payments_provider_ref_idx` — `provider_ref` عمره ما اتقرا في استعلام (كان لمسار البوابة اللي اتشال في `0033_manual_payments_only`) · `venues_area_idx` — `venues.area` مش مفلتر في أي استعلام (الفلترة بتحصل على `sbotat.area` المتزامن) | `20260908095052_0004_demand.sql` · `20260908095007_0003_supply.sql` | كلفة كتابة صغيرة بلا فايدة. مش مستعجل | سيبهم لحد ما تتأكد من `pg_stat_user_indexes.idx_scan = 0` على الإنتاج بعد شهر، وبعدين `drop index` | كود (هجرة) | 20 د |
| D34 | 🔵 | أداء | **`getSbota(slug)` بيقرا الجدول كله لما مفيش سبوطة جاية للقالب ده.** مقيس بـ EXPLAIN ANALYZE على 10k سبوطة: slug له سبوطة قريبة → 18 صف بس (الـ `LIMIT 1` مع فهرس `starts_at` بيقصّر الطريق ✓). slug **مالوش** سبوطة في `sbotat_public` → **6009 صف** + `Materialize` + `Seq Scan on sbota_templates`. فهرس `sbotat(template_id, starts_at)` **ما حلّش المشكلة** (جرّبته — المخطِّط فضل على `sbotat_starts_at_idx` علشان الـ ORDER BY) | `src/lib/api.ts:140-143` · العرض في `20260908110504_0031_area_display_label.sql` → `sbotat_public` | رابط قديم أو صفحة مفهرسة في جوجل لقالب اتوقف = قراية كاملة للجدول على كل زيارة. عند 10k سبوطة ده ملحوظ، وهو مسار الصفحة الأكتر زيارة في الموقع | إصلاح كود مش فهرس: حل `template_id` من `sbota_templates where slug = ?` الأول (الفهرس موجود)، وبعدين `sbotat where template_id = ? and status in (…) and starts_at >= now() order by starts_at limit 1`. ساعتها فهرس `sbotat(template_id, starts_at) where status in ('open','full','locked','running')` هيشتغل | كود | 1 س |

---

## (أ) اللي اتنفّذ بالظبط — ونتيجته

### البنية التحتية

| | |
|---|---|
| الـ cluster | Postgres **16.13** محلي، port 5488، socket `/var/tmp/nasbotpg` |
| الـ stubs | `auth.users` (بكل أعمدة GoTrue اللي الهجرات بتلمسها) · `auth.identities` · `auth.uid()`/`auth.role()`/`auth.jwt()` (بتقرا من `request.jwt.claim.sub`) · `storage.buckets` · `storage.objects` + RLS · `storage.foldername()` · `cron.job` + `cron.schedule()`/`cron.unschedule()` · `net.http_post`/`net.http_get` · `supabase_migrations.schema_migrations` · أدوار `anon`/`authenticated`/`service_role`/`authenticator` |
| السطرين المتشالين | `create extension pg_cron` و`pg_net` بس (متبدّلين بالـ stubs فوق). **مفيش أي سطر تاني اتغيّر في أي هجرة** |

### إعادة تشغيل الهجرات

**71/71 نجحت.** 69 من أول مرة؛ اتنين (`0020_dump_migrations_helper` و`20260908132301_dump_migrations_helper`) وقعوا على `supabase_migrations.schema_migrations` المفقود ونجحوا بعد ما اتعمل stub. مفيش أي فشل حقيقي — **المخطط سليم ومتّسق من أوله لآخره**، وده مش أمر بديهي مع 71 هجرة بتعدّل على بعض.

### الاختبارات — النتيجة

| # | الاختبار | الطريقة | النتيجة |
|---|---|---|---|
| T1.1 | `payments.amount = -500000` | INSERT | ❌ **اتقبل** → D7 |
| T1.2 | `bookings` بـ `price_paid=-99999, discount=-500, wallet_used=-1000` | INSERT | ❌ **اتقبل** → D7 |
| T1.4 | `sbotat.price = -100000`, `coupons.value = -9999` | UPDATE/INSERT | ❌ **اتقبلوا** → D7 |
| T1.5 | `birth_year = 2015` (طفل) | INSERT | ✅ **اترفض** — `profiles_birth_year_check` |
| T1.5b | `birth_year = null` | INSERT | ❌ **اتقبل** → D12 |
| T1.6 | `pair_affinity(a_id > b_id)` | INSERT | ✅ **اترفض** — `pair_affinity_ordered` |
| T1.6b | `work_affinity(a_id > b_id)` | INSERT | ✅ **اترفض** — `work_affinity_ordered` |
| T1.6c | نفس الزوج مرتين في `pair_affinity` | INSERT ×2 | ✅ **اترفض** — `pair_affinity_a_id_b_id_key` |
| T1.7 | `sessions_used = 9 > sessions_total = 4` | INSERT | ✅ **اترفض** — `work_passes_sessions_ck` |
| T1.8 | حجزين لنفس العضو في نفس السبوطة | INSERT ×2 | ✅ **اترفض** — `bookings_sbota_id_profile_id_key` |
| T1.9 | `wallet_ledger.delta = -999999` | INSERT | ❌ **الرصيد بقى `-999999`** → D13 |
| **T2.1** | **حارس السعة على INSERT** — سبوطة سعتها 2، خمس محاولات `insert … status='paid'` | INSERT ×5 | ✅ **اتنين عدّوا وتلاتة اترفضوا** بـ «السبوطة كملت» |
| **T2.2** | `fn_booking_paid` على INSERT | INSERT بـ `status='paid'` | ❌ **ما اشتغلش**: رصيد ما اتخصمش (فضل 20000)، إحالة 0، إشعار 0 → D8 |
| T2.3 | نفس الحاجة بـ UPDATE | UPDATE | ✅ رصيد 0، إحالة 1، إشعار 1 |
| **T3.A** | إلغاء قبل 10 أيام | `fn_cancel_booking` | ✅ `kind=full, refund=30000` · صف `refunds` نوعه `gateway` حالته `initiated` (→ D21) |
| **T3.B** | إلغاء قبل 4 أيام | `fn_cancel_booking` | ⚠️ **`kind=full` مش `half`** — `refund_half_days = 0` بيعطّل نافذة الـ50% بالكامل. ده **مقصود** حسب تعليق الهجرة («0 = متعطّل، السياسة الحالية») ومتّفق مع `COPY.md`، **بس `DB_PLAN §5` لسه بيوثّق سياسة الـ5 أيام/50%** — تعارض توثيق |
| **T3.C** | إلغاء قبل 24 ساعة، أول مرة | `fn_cancel_booking` | ✅ `kind=credit, refund=30000` · `refunds` نوعه `wallet_credit` حالته `succeeded` · `wallet_ledger: +30000 / refund_credit` — **ده الفرع الوحيد اللي بيوصل `wallet_ledger` فعلًا** |
| **T3.D** | إلغاء قبل 24 ساعة، مش أول مرة | `fn_cancel_booking` | ✅ `refund=0` · `behavior_flags: late_cancel` |
| **T3.E** | إحنا لغينا | `fn_cancel_booking(by='us')` | ✅ `refund=30000` + `wallet_ledger: +3000 / cancel_credit` (10% اعتذار — مضبوط) |
| **T4.A** | **حجز مغطّى 100% بالمحفظة ثم إلغاء مبكر** | كامل المسار | 🔴 **كاش واصل = 0 · استرداد موعود = 30000 gateway · المحفظة فضلت 0** → D1 |
| **T4.B** | محفظة جزئية (كاش 20000 + رصيد 10000) ثم إلغاء مبكر | كامل المسار | 🔴 **كاش واصل 20000 · استرداد موعود 30000 · زيادة 10000** → D1 |
| **T4.C** | كوبون 20% بـ `max_uses=1` على حجز مدفوع | كامل المسار | 🔴 **`used_count` فضل 0** → D2 · ✅ الحساب نفسه مضبوط: `30000 − 6000 = 24000 = payments.amount` |
| **T4.D** | توقيت مكافأة الإحالة | UPDATE → paid → attended | ✅ **بعد الحضور مش بعد الدفع** — محفظة المُحيل: 0 بعد `paid`، **10000** بعد `attended`، و`reward_paid_at` اتحط. مطابق لـ `DB_PLAN §4` |
| **T5** | دورة الكارت الكاملة | `fn_activate_pass` → `fn_redeem_pass` → `fn_revert_pass` | ✅ **كلها سليمة**: الرصيد 0 وهو `pending` → 4 بعد التفعيل · تفعيل تاني = `already:true` بلا مضاعفة · خصم = 3 · خصم تاني = `already:true` والرصيد فضل 3 · إرجاع مبكر = 4 |
| **T5b** | إلغاء متأخر لحجز بالكارت (24 ساعة، `work_pass_refund_days=3`) | `fn_cancel_booking` | ✅ `pass_reverted=false` — الجلسة اتحرقت + `behavior_flags` اتسجّل. صح |
| **T5c** | إحنا لغينا حجز بالكارت | `fn_cancel_booking(by='us')` | ✅ `pass_reverted=true` — الرصيد رجع 4 بالإجبار |
| **T6** | كل الـ12 `job_*` | تنفيذ مباشر | ✅ كلهم اشتغلوا من غير خطأ (`job_work_venue_reports` رجّع 4، الباقي 0 لعدم وجود بيانات مطابقة) |
| **T7.1** | `job_purge` على حساب متمسوح من 40 يوم | تنفيذ | 🔴 **وقع**: `profiles_phone_check violation` → D4 |
| **T7.2** | نفس الحاجة بعد شيل قيد التليفون، ببروفايلين uuid بيبدأ بـ `abc` | تنفيذ | 🔴 **وقع**: `duplicate key … (referral_code)=(DELabc)` → D19 |
| **T8c** | التبادل الاجتماعي | `fn_pair_want` ×2 → `fn_is_mutual` | ✅ `mutual_at` اتحط · `fn_open_one_on_one` فتح غرفة · ❌ **إشعارات `mutual_match` = 0** → D18 |
| **T9** | مطابقة كاملة + كشف (8 حاجزين) | `fn_build_matching` → `fn_reveal` | ✅ **كلها سليمة**: اقتراح بـ `why` عربي منطقي + `stats` (4 بنات/4 ولاد، فجوة سن 7، 3 «بيبدأوا الكلام») · الكشف عمل 1 مجموعة + 1 غرفة + 8 عضو + 8 إشعار `group_reveal` · السبوطة بقت `locked` · **كشف تاني رجّع 0** (idempotent ✓) · `fn_who_booked` رجّع أرقام مجمّعة بدون أي معرّف ✓ |
| **T9b** | مطابقة الشغل (8 حاجزين بمهن مختلفة) | `fn_build_work_matching` | ✅ مجموعتين × 4، بيحترم `work_profession_mix_max`، ومعاه `flags` تشخيصية (`all_neutral`) |
| **T10.1** | عضو عمل `deleted_at` بعد ما حجز | `fn_who_booked` + مطابقة + كشف | 🟠 **لسه محسوب في العداد · لسه في اقتراح المطابقة · لسه اتضاف لـ `chat_members`** → D11 |
| **T10.2** | حجز سبوطة `draft` | `fn_can_book` | 🟡 **رجّع NULL (مسموح)** → D25 · `cancelled` اترفضت صح |
| **T10.3** | `fn_can_book` بـ `birth_year = null` | `fn_can_book` | 🟠 **مسموح** (السن اتحسب 2026) → D12 |
| **T10.4** | `job_expire_bookings` على حجز دفعته `pending_review` | تنفيذ | 🔴 **اتلغى** والدفعة فضلت `pending_review` → D6 |
| **T10.5** | الإدارة توافق على تحويل بعد ما الحجز اتلغى بالمهلة | `fn_approve_transfer` | ⚠️ الحجز رجع `paid` (تعافي كويس) بس من غير أي تنبيه إن السعة ممكن تكون اتوزّعت |
| **T10.6** | **موافقة مرتين على نفس الدفعة (إرسال مزدوج)** | `fn_approve_transfer` ×2 | ✅ **مفيش أي مضاعفة**: التانية رجّعت `already:true` · صفين بس في `wallet_ledger` (+10000 ثم −10000) · إشعار `booking_confirmed` واحد |
| **T1.10** | نفس `idempotency_key` مرتين | INSERT ×2 | ✅ **اترفض** — `payments_idempotency_key_key` |

### 🥇 اختبار التزامن — 20 محاولة حجز متوازية على آخر كرسي

**اتعمل بالجد، مش بالتنظير.** سبوطة سعتها 3، اتنين `paid` خلاص، و20 عضو مختلف عندهم حجز `pending_payment`. اتفتحت **20 عملية `psql` منفصلة** (20 اتصال حقيقي، 20 transaction)، كل واحدة بتلف على spin-loop على ملف barrier، وبعدين `touch GO` بيطلقهم كلهم في نفس اللحظة، وكل واحدة بتعمل:

```sql
begin;
update bookings set status='paid' where sbota_id=$SB and profile_id=$P;
commit;
```

**النتيجة:**

```
rejected (capacity): 19
succeeded:            1
other errors:         (مفيش)

 status          | count            capacity | paid_now | status
-----------------+-------          ----------+----------+--------
 pending_payment |    19                   3 |        3 | full
 paid            |     3
```

**واحد بالظبط عدّى. 19 اترفضوا بـ «السبوطة كملت». السعة قفلت على 3/3 والسبوطة بقت `full` أوتوماتيك.**
`fn_capacity_guard` بيعمل `select capacity from sbotat where id = … for update` — قفل صف على السبوطة نفسها بيسلسل كل الطلبات المتنافسة. **ده أهم قيد في المشروع كله وهو شغّال 100%.** ✅

---

## (ب) الفهارس الناقصة

مرتّبة بالأولوية. الأرقام من `EXPLAIN ANALYZE` على 10k سبوطة / 10k حجز / 10k بروفايل / 10k دفعة / 10k إشعار.

### أولوية عالية — مقيسة كـ Seq Scan فعلي

```sql
-- طابور الإشعارات بيربط على template_key: Seq Scan على 10001 صف (مقيس)
create index notifications_template_key_idx on notifications(template_key);

-- fn_is_mutual بيدوّر بالاتجاهين؛ (a_id,b_id) ما بيخدمش b_id لوحده: Seq Scan (مقيس)
create index pair_affinity_b_id_idx on pair_affinity(b_id);
create index work_affinity_b_id_idx on work_affinity(b_id);

-- Seq Scan (مقيس) — وبيتنده عليهم في كل حذف بروفايل للتحقق من الـ FK
create index reviews_profile_id_idx  on reviews(profile_id);
create index waitlist_profile_id_idx on waitlist(profile_id);
create index messages_sender_id_idx  on messages(sender_id);
```

### أولوية متوسطة — مفاتيح أجنبية بتتفحص على كل حذف بروفايل

```sql
create index events_profile_id_idx          on events(profile_id);
create index game_sessions_profile_id_idx   on game_sessions(profile_id);
create index reports_reporter_id_idx        on reports(reporter_id);
create index reports_target_profile_id_idx  on reports(target_profile_id);
create index audit_log_actor_id_idx         on audit_log(actor_id);
create index sbota_photos_uploaded_by_idx   on sbota_photos(uploaded_by);
create index weekly_schedule_subs_profile_id_idx on weekly_schedule_subs(profile_id);
```

### أولوية متوسطة — مفاتيح أجنبية على جداول بتكبر

```sql
create index bookings_payment_id_idx         on bookings(payment_id);
create index behavior_flags_booking_id_idx   on behavior_flags(booking_id);
create index referrals_booking_id_idx        on referrals(booking_id);
create index reports_booking_id_idx          on reports(booking_id);
create index reports_message_id_idx          on reports(message_id);
create index pair_affinity_met_in_booking_id_idx on pair_affinity(met_in_booking_id);
create index work_affinity_met_in_booking_id_idx on work_affinity(met_in_booking_id);
create index matching_outcomes_group_id_idx  on matching_outcomes(group_id);
create index sbota_photos_group_id_idx       on sbota_photos(group_id);
create index sbota_groups_captain_id_idx     on sbota_groups(captain_id);
create index sbotat_captain_id_idx           on sbotat(captain_id);
create index sbotat_venue_id_idx             on sbotat(venue_id);
create index work_passes_payment_id_idx      on work_passes(payment_id);
create index payments_reviewed_by_idx        on payments(reviewed_by);
create index provider_alerts_venue_id_idx    on provider_alerts(venue_id);
create index recurring_bookings_venue_id_idx on recurring_bookings(venue_id);
```

### للمطابقة والمراجعة المالية

```sql
create index refunds_status_idx        on refunds(status) where status <> 'succeeded';
create index wallet_ledger_profile_created_idx on wallet_ledger(profile_id, created_at desc);
create index payments_status_reviewed_idx on payments(status, created_at)
  where status in ('initiated','pending_review');
```

### يتشال

```sql
drop index profiles_phone_idx;   -- نسخة طبق الأصل من profiles_phone_key (مقيس، الوحيد في القاعدة)
```

### مرشّحان للحذف بعد التأكد على الإنتاج

`payments_provider_ref_idx` (مسار البوابة اتشال في `0033`) و`venues_area_idx` (الفلترة على `sbotat.area` مش `venues.area`). اتأكد بـ:

```sql
select relname, indexrelname, idx_scan
from pg_stat_user_indexes
where schemaname='public' and idx_scan = 0
order by pg_relation_size(indexrelid) desc;
```

### ملاحظة على المؤجّل

`sbotat_public where slug = ?` (D34) **مش بيتصلح بفهرس** — جرّبت `sbotat(template_id, starts_at)` والمخطِّط فضل على `sbotat_starts_at_idx` علشان الـ `ORDER BY`. لازم الاستعلام يتعاد كتابته الأول (حل `template_id` من `sbota_templates.slug`)، وساعتها:

```sql
create index sbotat_template_upcoming_idx on sbotat(template_id, starts_at)
  where status in ('open','full','locked','running');
```

---

## (ج) استعلام المطابقة المالية

بيقارن الفلوس الواصلة بالفلوس المفروض تكون واصلة، وبيطلع الصفوف اليتيمة في الاتجاهين. اتشغّل فعليًا على الـ cluster ✅.

```sql
-- ============ مطابقة الفلوس: المدفوعات الناجحة ضد الحجوزات المدفوعة ============
with pay as (
  select coalesce(sum(p.amount), 0)::bigint as cash_in
  from payments p
  where p.status = 'succeeded'
),
bk as (
  -- الكاش المفروض يكون وصل = السعر بعد الخصم ناقص اللي اتغطى من المحفظة
  select coalesce(sum(b.price_paid - b.wallet_used), 0)::bigint as expected_cash,
         coalesce(sum(b.wallet_used), 0)::bigint                as wallet_spent,
         coalesce(sum(b.discount), 0)::bigint                   as discounts
  from bookings b
  where b.status in ('paid','attended','no_show') and not b.paid_with_pass
),
passes as (
  select coalesce(sum(wp.price_paid), 0)::bigint as pass_cash
  from work_passes wp where wp.status in ('active','used_up','expired')
),
ref as (
  select coalesce(sum(r.amount), 0)::bigint as refunded_settled,
         coalesce(sum(r.amount) filter (where r.status <> 'succeeded'), 0)::bigint as refunds_owed
  from refunds r
),
led as (
  select coalesce(sum(delta), 0)::bigint as outstanding_liability from wallet_ledger
),
orphan as (
  -- حجز مدفوع ومحتاج كاش ومفيش دفعة ناجحة تخصه
  select count(*) as n from bookings b
  where b.status in ('paid','attended') and not b.paid_with_pass
    and b.wallet_used < b.price_paid
    and not exists (select 1 from payments p
                    where p.booking_id = b.id and p.status = 'succeeded')
),
ghost as (
  -- دفعة ناجحة على حجز مش مدفوع
  select count(*) as n from payments p join bookings b on b.id = p.booking_id
  where p.status = 'succeeded' and b.status not in ('paid','attended','no_show')
)
select 'كاش واصل (payments succeeded)'            as line, pay.cash_in       as piastres from pay
union all select 'كاش مفروض يوصل (bookings)',            bk.expected_cash        from bk
union all select '>> الفرق (واصل − مفروض − كروت)',        pay.cash_in - bk.expected_cash - passes.pass_cash from pay, bk, passes
union all select 'كاش الكروت المفعّلة',                    passes.pass_cash        from passes
union all select 'اتغطى من المحفظة',                      bk.wallet_spent         from bk
union all select 'خصومات وكوبونات',                       bk.discounts            from bk
union all select 'استردادات اتصرفت',                      ref.refunded_settled    from ref
union all select '!! استردادات مستحقة لسه ما اتصرفتش',     ref.refunds_owed        from ref
union all select '>> التزام المحفظة القايم',               led.outstanding_liability from led
union all select '!! حجوزات مدفوعة من غير دفعة ناجحة',     orphan.n                from orphan
union all select '!! دفعات ناجحة على حجوزات مش مدفوعة',    ghost.n                 from ghost;
```

### اللي الاستعلام ده هيكشفه على الإنتاج

| السطر | لو مش صفر يبقى | مربوط بـ |
|---|---|---|
| **`>> الفرق`** | لو **سالب**: فلوس مستحقة وما وصلتش — حجوزات اتعملت `paid` من غير دفعة (D21) أو مسار الكارت. لو **موجب**: فلوس واصلة زيادة عن اللي مسجّل، وأغلب الظن ده **D1** — استرداد نقدي عن حجز اتدفع بالمحفظة | D1 · D21 |
| **`!! استردادات مستحقة`** | فلوس موعود بيها الأعضاء وقاعدة في `refunds` بحالة `initiated`. المفروض تبقى **صفر** في نهاية كل يوم. عمليًا هتكبر باستمرار لأن مفيش حد بيقفلها | **D21** |
| **`!! حجوزات مدفوعة من غير دفعة ناجحة`** | كل صف = حد داخل السبوطة من غير سجل دفع. هيتلقّط منه: `job_work_recurring` (D8) وأي `paid` يدوي من اللوحة | D8 |
| **`!! دفعات ناجحة على حجوزات مش مدفوعة`** | حد حوّل والحجز اتلغى بعدها — الشكل الأساسي لـ **D6** (`job_expire_bookings` بيلغي حجز صورته تحت المراجعة). كل صف هنا = عضو دفع ومحدش خدمه | **D6** · D20 |
| **`>> التزام المحفظة القايم`** | مجموع رصيد كل الأعضاء = **دين على نسبوط بالقروش**. المفروض يساوي `sum(profiles.wallet_balance)` بالظبط؛ أي فرق يعني `fn_wallet_balance` فاته صف. ولو طلع **سالب** يبقى D13 حصل | D13 |

> **ملاحظة على الأرقام اللي طلعت عندي:** شغّلته على بيانات صناعية bulk (اتحمّلت بـ `session_replication_role = replica` علشان السرعة، يعني المحفّزات ما اشتغلتش) — فالأرقام نفسها مالهاش معنى. اللي مثبت هو **إن الاستعلام بيشتغل وبيرجّع الـ12 سطر**، وإن عدّادَي السلامة الاتنين اشتغلوا فعلًا (2516 و5).

---

## (د) شغال تمام

الحاجات دي **اتجرّبت بالتنفيذ** وطلعت سليمة — تستاهل تتقال:

1. **حارس السعة تحت التزامن الحقيقي** — 20 عملية متوازية على آخر كرسي، **واحد بالظبط عدّى**. القفل بـ `for update` على صف `sbotat` مظبوط، وبيشتغل على INSERT و UPDATE الاتنين. ده أصعب جزء في النظام وهو متعمول صح.
2. **`idempotency_key` فريد على `payments`** — إرسال مكرر بنفس المفتاح **اترفض** على مستوى القاعدة.
3. **الموافقة المزدوجة على تحويل** — `fn_approve_transfer` مرتين: التانية `already:true`، الرصيد اتخصم **مرة واحدة**، وإشعار تأكيد **واحد**. مفيش أي مضاعفة.
4. **دورة كارت الشغل كاملة** — `fn_activate_pass` / `fn_redeem_pass` / `fn_revert_pass` كلهم idempotent وبيتصرفوا صح: تفعيل مكرر ما بيضاعفش، خصم مكرر ما بيخصمش تاني، إرجاع مبكر بيرجّع الجلسة، إرجاع متأخر بيحرقها ويسجّل `behavior_flags`، وإلغاء «من عندنا» بيرجّعها بالإجبار.
5. **`work_passes_sessions_ck`** — `sessions_used <= sessions_total` مفروض على مستوى القاعدة، مش بس في TypeScript.
6. **`a_id < b_id`** على `pair_affinity` **و** `work_affinity` — الاتنين مفروضين بقيد حقيقي، والزوج المكرر مرفوض بـ unique.
7. **حجز واحد للشخص في السبوطة** — `bookings_sbota_id_profile_id_key` بيرفض على مستوى القاعدة.
8. **قيد الـ18 سنة** — بيرفض `birth_year = 2015` فعلًا (عيبه الوحيد إنه مش بيغطي NULL — D12).
9. **توقيت مكافأة الإحالة** — بعد `attended` مش بعد `paid`، بالظبط زي `DB_PLAN §4`. ومقفولة بـ `reward_paid_at` فما بتتصرفش مرتين.
10. **`fn_build_matching` و`fn_build_work_matching` و`fn_reveal`** — اشتغلوا على بيانات حقيقية وطلّعوا مجموعات متوازنة مع `why_ar` عربي مفهوم و`stats` و`flags` تشخيصية. `fn_reveal` **idempotent** (النداء التاني بيرجّع 0)، وبيقفل السبوطة، وبيعمل الغرف والأعضاء والإشعارات صح.
11. **`fn_who_booked`** — بيرجّع أرقام مجمّعة بس (عدد، بنات/ولاد، مدى السن) **من غير أي معرّف** — حدود الخصوصية محترمة.
12. **RLS مفعّل على كل جدول بلا استثناء** (67/67). `otp_codes` و`admin_sessions` مفعّل عليهم RLS **بدون أي سياسة** = منع كامل، وده المقصود بالظبط لجداول الخادم.
13. **كل جدول عنده primary key** — 67/67، مفيش ولا واحد ناقص.
14. **`next_cairo()`** بتستخدم `Africa/Cairo` صح — منطق اليوم الثابت بيحسب المواعيد بتوقيت مصر مش UTC (بعكس جدولة الـ cron نفسها — D16).
15. **الـ71 هجرة بتتشغّل بالترتيب على Postgres قياسي** من غير أي امتداد مقفول على Supabase غير `pg_cron`/`pg_net` — يعني وعد `DB_PLAN §0` بإمكانية الانتقال لاستضافة داخل مصر **حقيقي ومتحقَّق منه**.
16. **`fn_capacity_guard` و`fn_booking_paid` منفصلين** — الحارس على INSERT و UPDATE، والتبعات على UPDATE. الفصل ده صح معماريًا؛ المشكلة الوحيدة إن التبعات ناقصة INSERT (D8).
17. **معادلة السعر** — `price − discount = price_paid = payments.amount` مثبتة رقميًا بكوبون 20%: `30000 − 6000 = 24000` في الجدولين. (`org_fee` **جوه** السعر مش زيادة عليه، زي ما تعليق العمود في `0003_supply.sql:54` بيقول — فمعادلة `DB_PLAN §5` اللي بتقول `price + org_fee` **غلط في التوثيق مش في الكود**.)

---

## ملاحظة أخيرة على المنهج

كل ما هو مكتوب «مثبت» أو «مقيس» فوق اتنفّذ فعليًا بـ SQL على cluster فيه الـ71 هجرة كاملة. اللي اتحدد **قراءة بس** هو:

- **D5** (مفيش مصرف إشعارات عام) — استُنتج من قراية `notify.ts:257` + جرد `cron.job`، مش من تشغيل مصرف حقيقي.
- **D16** (مواعيد الـ cron) — الفروق الزمنية مقيسة بالجد (`Africa/Cairo` = UTC+2/+3)، بس مفيش تشغيل فعلي لـ `pg_cron` (متعمله stub).
- **D22 / D23** (أعمدة وقيم ميتة) — من grep على `src/` و`supabase/migrations/` وعلى `pg_proc.prosrc`، مش من تتبّع تشغيل.
- **D32** (النسخ الاحتياطي) — قراية `RUNBOOK.md §12` بس؛ مفيش وصول لإعدادات مشروع Supabase.
- **D34** — الأرقام مقيسة بـ `EXPLAIN ANALYZE`، بس على توزيع بيانات صناعي (10k سبوطة موزّعين على 10 قوالب) اللي ممكن يبقى أكثف من الإنتاج.

