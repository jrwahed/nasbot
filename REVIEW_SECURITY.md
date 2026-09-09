# مراجعة أمنية عدائية — نسبوط

> **مراجعة بس. مفيش سطر واحد اتغيّر في الكود ولا في الهجرات.**
> الملف ده هو التعديل الوحيد اللي اتعمل.
>
> **مفيش وصول للقاعدة** وإحنا بنراجع — كل ادّعاء هنا متثبت من قراية الـ SQL
> والكود. أي حاجة محتاجة قاعدة حية مكتوب جنبها SQL تشغّله بنفسك (تحت، قسم
> «محتاج تأكيد من القاعدة»).
>
> نموذج المهاجم المفترض: **عضو عادي مسجّل دخول** ومعاه `NEXT_PUBLIC_SUPABASE_ANON_KEY`
> (اللي هو في كود الصفحة أصلًا) وتوكن جلسته — بينادي `PostgREST` و`rpc` مباشرة من
> `curl`، مش من الواجهة.

---

| # | الخطورة | المجال | المشكلة | فين بالظبط | الأثر | الإصلاح المقترح | من اللوحة ولا كود؟ | الوقت |
|---|---------|--------|---------|------------|-------|-----------------|--------------------|-------|
| S1 | 🔴 | RLS · خصوصية | العضو يقدر **يزوّر التبادل**. سياسة `pair_insert_own` بتقبل أي صف طول ما `a_id` أو `b_id` = أنا، من غير ما تلزمني إن الجهة التانية تبقى `false`. المحفّز `fn_mutual_affinity` بيشوف الجهتين `true` فبيحط `mutual_at` على طول. الاستغلال بالحرف: `insert into pair_affinity (a_id,b_id,a_wants_b,b_wants_a) values (least(me,victim), greatest(me,victim), true, true)` | `supabase/migrations/20260908095553_0009_rls.sql:157` + المحفّز في `20260908095129_0005_matching_and_chat.sql:42-56` | تبادل مزيّف مع **أي عضو** من غير علمه ولا موافقته. وده بيفتح فورًا: `profiles_mutual_read` (الملف كامل)، `fn_met_before()` (`avatar_path`)، سياسة التخزين `avatars_mutual_read` (الصورة نفسها)، و`fn_open_one_on_one()` (شات خاص). يعني تحرّش مباشر + كشف بيانات | `with check (a_id = auth.uid() and b_wants_a = false or b_id = auth.uid() and a_wants_b = false)` — أو الأنضف: **اسحب سياستَي `insert`/`update` خالص** وسيب `fn_pair_want` (0047) هي الطريق الوحيد، هي أصلًا `security definer` وبتكتب جهة اللي بينادي بس | كود (هجرة جديدة) | ساعة |
| S2 | 🔴 | RLS · خصوصية | نفس الثغرة بالحرف في طبقة الشغل — `work_pair_insert_own` بنفس الشكل، والمحفّز `fn_mutual_work_affinity` كمان بيبعت إشعار `work_collab_match` للضحية | `supabase/migrations/20260909100400_0043_work_rls.sql:60` + المحفّز في `20260909100300_0042_work_functions.sql:361` | تبادل شغل مزيّف → `fn_work_collab_state` بترجّع `mutual` → `fn_open_one_on_one` (0051) بتفتح شات خاص + `fn_my_work_collabs()` بترجّع بيانات الضحية. وكمان الضحية بتوصلها رسالة «فيه حد عايز يشتغل معاك» كذب | نفس حل S1: اسحب `work_pair_insert_own`/`work_pair_update_own` وسيب `fn_work_want` بس | كود (هجرة جديدة) | نص ساعة |
| S3 | 🔴 | خصوصية أعمدة | `profiles_mutual_read` بتفتح **صف `profiles` كامل** لأي متبادل — RLS مالهاش أعمدة. يعني اللي اتبادل معاك بيقرا `phone` و`email` و`birth_year` و`wallet_balance` و`referral_code` و`no_show_count` و`banned_at` و`ban_reason`. حتى من غير تزوير S1 ده تسريب بالتصميم | `20260908095553_0009_rls.sql:83-85` → `profiles.phone`, `profiles.email`, `profiles.wallet_balance` | رقم موبايل وإيميل كل واحد اتبادلت معاه — والمشروع كله قايم على إن دي مخفية (`fn_group_members` في 0015 معمولة مخصوص علشان ما تكشفهاش) | امسح `profiles_mutual_read` خالص، وحط بدالها دالة `security definer` زي `fn_met_before()` بترجّع `first_name` و`type` و`avatar_path` بس. هي أصلًا موجودة وشغالة | كود (هجرة جديدة) | ساعة |
| S4 | 🔴 | فلوس · RLS | `bookings_own_insert` بتتحقق من `profile_id` **بس** — مفيش شرط على `status` ولا `price_paid`. المحفّز الوحيد على الإدراج هو `fn_capacity_guard` وهو بيعدّ السعة بس. الاستغلال: `insert into bookings (sbota_id, profile_id, status, price_paid) values ('<any open sbota>', auth.uid(), 'paid', 0)` | `20260908095553_0009_rls.sql:129-130` مقابل `20260908095052_0004_demand.sql:68` | **حجز مجاني مؤكد** في أي سبوطة فيها مكان، من غير ما يعدّي على `/api/pay/create` خالص. وبيفتح كمان `fn_sbota_address` (العنوان الكامل) و`fn_group_members` و`sbota_photos` بعد الكشف | ضيّق الـ `with check` لـ `profile_id = auth.uid() and status = 'pending_payment' and price_paid = 0 and wallet_used = 0 and paid_with_pass = false`، وحط محفّز `fn_guard_booking_columns` على نمط `fn_guard_pass_columns` (0042:40) يمنع `authenticated` من لمس `status`/`price_paid` | كود (هجرة جديدة) | ساعة |
| S5 | 🔴 | تسريب بيانات | `captains_read on captains for select using (is_active or fn_is_admin())` — الجدول كله مفتوح لأي **زائر** مش مسجّل حتى. وفيه عمود `payout_method jsonb` (طريقة استلام فلوس الكابتن: محفظة/حساب) و`profile_id` | `20260908095553_0009_rls.sql:99` → `captains.payout_method`, `captains.profile_id` | `curl "$SUPABASE_URL/rest/v1/captains?select=payout_method,profile_id" -H "apikey: $ANON"` بيرجّع بيانات الدفع لكل الكباتن. ده تسريب بيانات مالية لطرف تالت | انقل `payout_method` لجدول `captain_payouts` عليه سياسة `payments.view`، أو اعمل عرض `captains_public` بالأعمدة الآمنة (`display_name`, `craft_ar`, `bio_line`, `photo_path`, `rating_avg`) وارفع القراية عن الجدول نفسه لـ `fn_is_admin()` | كود (هجرة جديدة) | ساعة |
| S6 | 🔴 | حماية البيانات | زرار **«حذف الحساب»** في `/me` بيعمل `signOut()` وبيوديك على الرئيسية — **وخلاص**. مفيش أي مسح. الدالة `fn_soft_delete_profile()` موجودة في القاعدة وممنوحة لـ `authenticated` من 0011 لكن **مفيش سطر واحد في `src` بينادي عليها**. ومفيش مسار تصدير بيانات أصلًا | `src/app/me/page.tsx:278-286` (نفس الـ handler بتاع زرار الخروج فوقه بالحرف) مقابل `20260908095401_0007_functions.sql:169` | العضو فاكر إنه مسح حسابه وبياناته لسه كلها موجودة. ده كذب صريح على المستخدم، ومخالفة لحق المحو في قانون حماية البيانات ١٥١/٢٠٢٠ | اربط الزرار بـ `supabase().rpc('fn_soft_delete_profile')` مع تأكيد، وضيف `GET /api/me/export` بيرجّع JSON بكل صفوف العضو (profiles · bookings · payments · reviews · messages) | كود | نص يوم |
| S7 | 🔴 | جلسة · OTP | عدّاد المحاولات في `/api/otp/verify` **بيتقرا ويتكتب في خطوتين منفصلتين** (`r.attempts >= 5` … بعدين `update … attempts: r.attempts + 1`). مفيش قفل ولا `attempts = attempts + 1` ذرّي. ولا فيه أي حد معدل على المسار ده بالـ IP. يعني ١٠٠٠ طلب متوازي كلهم بيقروا `attempts = 0` وبيكتبوا `1` | `src/app/api/otp/verify/route.ts:52-60` | تخمين الرمز بالجملة: المجال ١٠⁶ ومفيش سقف فعلي على التوازي → الدخول بحساب أي عضو برقمه. حد الـ ٣ إرسالات/ساعة ما بيحميش لأن الكسر في **التحقق** مش في الإرسال | استعمل RPC `security definer` بتعمل `update otp_codes set attempts = attempts + 1 where id = … returning attempts` ذرّي وترفض فوق الخمسة، وضيف حد معدل بالـ IP على المسار (نفس نمط `checkLoginRate`) | كود | ساعة |
| S8 | 🔴 | فلوس · صلاحيات | دوال الفلوس بتتحقق بـ `fn_is_admin()` مش بالصلاحية. و`fn_is_admin()` بعد هجرة 0035 بقت `exists (select 1 from admin_users where profile_id = auth.uid() and is_active)` — **أي دور**. يعني حساب دور `support` (اللي مالوش ولا صلاحية فلوس واحدة) ينادي: `select fn_approve_transfer('<payment_id>', true)` | `20260909100300_0042_work_functions.sql:593` (approve_transfer) · `:217` (activate_pass) · `:481` (cancel_booking بـ `p_by='us'`) مقابل `20260908115654_0035_admin_roles_permissions.sql:155` | حساب دعم يعتمد أي تحويل (حجز أو كارت شغل) = فلوس وهمية تدخل، ويعمل «إحنا لغينا» = استرداد كامل + رصيد اعتذار لأي حجز. تجاوز كامل لفصل الأدوار في الفلوس | بدّل `fn_is_admin()` بـ `fn_has_permission('payments.review')` في approve/activate، وبـ `fn_has_permission('bookings.edit')` في فرع `p_by='us'` | كود (هجرة جديدة) | ساعة |
| S9 | 🟠 | صلاحيات اللوحة | كل سياسات الكتابة القديمة (قبل 0035) لسه بـ `fn_is_admin()`، وهي دلوقتي «أي صف في `admin_users`». فصل الأدوار في `role_permissions` **شكلي على الجداول دي**: `settings` · `sbotat` · `bookings` · `coupons` · `captains` · `venues` · `mystery_clues` · `sbota_groups` · `matching_runs` · `matching_outcomes` · `behavior_flags` · `reports` · `chat_members` · `sbota_photos` · `marketing_spend` · `audit_log` (قراية) | `20260908095553_0009_rls.sql:90,100,102,112,121,124,131,147,152,153,154,174,200,217,228,231` | حساب `support` (صلاحياته: بلاغات + حجوزات + حظر) يقدر من المتصفح: يغيّر `settings.work_pass8_price` و`refund_full_days` و`vodafone_number`، يعمل كوبون `fixed` بأي قيمة، يعدّل سعر أي سبوطة، ويقرا `audit_log` كله (اللي فيه IP وهاش أرقام الفريق). الواجهة بتخبّي الأزرار بس — `AdminShell` نفسه مكتوب فيه «ده إخفاء واجهة بس» | استبدل `fn_is_admin()` بـ `fn_has_permission('<key>')` في السياسات دي واحدة واحدة (الجدول التفصيلي «صلاحية الصفحة مقابل سياسة القاعدة» تحت). ولو محتاج تخفّف: خلّي `fn_is_admin()` ترجّع `true` للدورين `owner`/`admin` بس | كود (هجرة جديدة) | نص يوم |
| S10 | 🟠 | جلسة · هوية | `/api/account/ensure` بياخد `phone` من جسم الطلب وبيربطه بالحساب من غير **أي** تحقق إن الرقم بتاع اللي بيطلب. أي حد يعمل حساب بإيميل+باسورد عند Supabase وبعدين يبعت رقم غيره | `src/app/api/account/ensure/route.ts:55-79` (و`phone_verified_at: null` في السطر 78) | حجز أرقام: المهاجم يحجز رقم ضحية → الضحية تحاول تسجّل تلاقي «الرقم ده مسجّل بحساب تاني». وأخطر: `resolveEmail` في `otp.ts:63` بتربط الرمز بإيميل **الملف**، فلو الضحية دخلت بالرقم ده الرمز بيروح على إيميل المهاجم | لازم OTP على الرقم نفسه قبل ما يترسّخ في `profiles.phone`؛ أو خلّي المسار ده يقبل بس رقم عدّى `/api/otp/verify` في نفس الجلسة (خزّن الإثبات) | كود | نص يوم |
| S11 | 🟠 | تعداد حسابات | `/api/otp/send` بيفرّق: رقم مسجّل بإيميل حقيقي → `200 {ok:true, to:"a***@gmail.com"}` · رقم مسجّل من غير إيميل → `400 "الحساب ده ما عليهوش إيميل…"` · رقم مش موجود → `400 "اكتب إيميلك…"`. كله من غير تسجيل دخول | `src/lib/server/otp.ts:63-73` + `src/app/api/otp/send/route.ts:68` | أي حد يمشّي قايمة أرقام ويعرف مين عضو في النادي (والنادي ده اجتماعي/خروجات — العضوية نفسها معلومة حساسة)، وياخد كمان أول حرف ونطاق إيميل كل عضو. وبيبعت للضحية إيميل رمز فعلي (إزعاج) | رد واحد لكل الحالات: `200 {ok:true}` من غير `to`، والرسالة العامة «لو الرقم عندنا هيوصلك رمز». وحد معدل بالـ IP كمان مش بالرقم بس | كود | ساعة |
| S12 | 🟠 | فلوس | `/api/pay/transfer` بياخد `receiptPath` **نص من العميل** وبيكتبه في `payments.receipt_path` بمفتاح الخدمة، من غير ما يتأكد إن المسار بيبدأ بـ `<bookingId>/` ولا إنه موجود أصلًا في دلو `receipts` | `src/app/api/pay/transfer/route.ts:18` و`:33` | عضو عنده حجزين: يحوّل مرة واحدة على الحجز الأول، وبعدين يبعت لـ `/api/pay/transfer` للحجز التاني نفس الـ `receiptPath` بتاع الأول. الإدارة بتشوف صورة تحويل سليمة وبتعتمد الاتنين → **حجز مدفوع مرة وواحد ببلاش**. وكمان أي مسار عشوائي بيقلب الدفعة `pending_review` من غير تحويل خالص | تحقق `receiptPath.startsWith(bookingId + '/')`، وارفع الملف من الخادم زي ما `pay/pass` PUT بيعمل بالظبط (`route.ts:193`) بدل ما تستنى مسار من العميل. وضيف قيد فريد على `payments.receipt_path` | كود | ساعة |
| S13 | 🟠 | فلوس | `walletUsed = Math.min(balance, amount)` بيتحسب وقت إنشاء الحجز، والخصم الفعلي بيحصل بعدين في المحفّز `fn_booking_paid` وقت الاعتماد. مفيش حجز للرصيد بينهم، ومفيش قيد `>= 0` على مجموع `wallet_ledger` | `src/app/api/pay/create/route.ts:129-132` + `20260908095052_0004_demand.sql:126` (الجدول) و`20260908095500_0008_booking_lifecycle.sql:24-27` (الخصم) | برصيد ٥٠٠ جنيه: اعمل ٤ حجوزات كلها `useWallet=true` قبل ما الإدارة تعتمد أي واحد → كل واحد اتحسب على أساس الـ٥٠٠ كاملة. بعد الاعتماد `wallet_balance` بيبقى **سالب ٢٠٠٠** و٤ حجوزات اتخصمت من رصيد واحد | اخصم من `wallet_ledger` وقت إنشاء الحجز نفسه (`reason='hold'`) وارجّعه لو الحجز اتلغى، أو حط `check` على مستوى القاعدة يمنع الرصيد السالب (نفس الفحص اللي في `fn_wallet_adjust` بالفعل — `20260908132858_refund_and_wallet_rpcs.sql:112`) | كود | نص يوم |
| S14 | 🟠 | فلوس | الكوبونات: (أ) `used_count` **عمره ما بيتزوّد** في أي مكان في الكود، فـ `max_uses` مالهاش أي معنى. (ب) `first_booking_only` مش متفحوص خالص. (ج) `coupons_read on coupons for select using (true)` — أي حد يقرا كل الأكواد | `src/app/api/pay/create/route.ts:110-125` (الفحص) — مفيش `update coupons` في المشروع كله · `20260908095553_0009_rls.sql:146` (القراية) | `curl ".../rest/v1/coupons?select=code,kind,value"` بيطلّع كل الأكواد، وكل كود بيتستخدم عدد لا نهائي من المرات من أي حد. كوبون `fixed` بقيمة عالية = حجوزات ببلاش | زوّد `used_count` بعد الاعتماد (أو في RPC `fn_redeem_coupon` بقفل صف)، افحص `first_booking_only`، وغيّر سياسة القراية لـ `fn_is_admin()` وخلّي التحقق من الكود على الخادم بس (هو أصلًا كده في `pay/create`) | كود (+هجرة) | ساعة |
| S15 | 🟠 | نزاهة بيانات | `reviews_insert with check (profile_id = auth.uid())` بس. `sbota_id` عمود منفصل عن `booking_id` ومحدش بيتأكد إنهم لنفس السبوطة، والمحفّز `t_ratings_rollup` بيحسب متوسط الكابتن والمكان من `reviews.sbota_id` | `20260908095553_0009_rls.sql:204` + المحفّز في `20260908095210_0006_reviews_photos_ops.sql:50` | بحجز واحد بتاعي أنا، أعمل `insert into reviews (booking_id, profile_id, sbota_id, score_captain, score_venue) values ('<حجزي>', auth.uid(), '<سبوطة كابتن تاني>', 1, 1)` → أنزّل تقييم أي كابتن وأي مكان من غير ما أحضر. وكمان أقدر أحط `photo_consent=true` على سبوطة مش بتاعتي | ضيف للسياسة `and exists (select 1 from bookings b where b.id = booking_id and b.profile_id = auth.uid() and b.sbota_id = reviews.sbota_id and b.status = 'attended')` | كود (هجرة جديدة) | نص ساعة |
| S16 | 🟠 | جلسة · كوكيز | كوكي `nasbot_session` فيه **رقم موبايل العضو** واسمه ونوعه ودوره، متوقّع بدالة `sign()` اللي هي هاش جافا القديم (`h<<5 - h`) — بيتزوّر في سطر واحد. الكوكي مش `HttpOnly` (بيتكتب بـ `document.cookie`)، مفيهوش `Secure`، ومدته ٩٠ يوم. التعليق نفسه في الملف مكتوب فيه «مش للإنتاج» | `src/lib/session.ts:17-27` (التوقيع) و`:50` (`samesite=lax`، من غير `secure`، `max-age` ٩٠ يوم) | رقم موبايل العضو محفوظ ٩٠ يوم في كوكي أي سكربت على الصفحة يقراه، وعلى جهاز مشترك بيفضل بعد ما يقفل المتصفح. والتوقيع بيتزوّر فـ `role: 'captain'` بيغيّر الواجهة (مش خطر لأن القاعدة بتتحقق، بس بيوري صفحات مش المفروض تبان) | شيل الرقم من الكوكي خالص — سيب `firstName` و`gender` بس، أو اقراهم من `profiles` عند اللزوم. وضيف `secure` و`samesite=strict` وقصّر المدة | كود | ساعة |
| S17 | 🟠 | تسريب معلومات | `GET /api/health/mail` من غير أي مفتاح بيرجّع: مزوّد الإيميل، **عنوان المرسِل الحقيقي** (`MAIL_FROM` أو `SMTP_USER`)، هل واتساب متظبط، البيئة، و`VERCEL_GIT_COMMIT_SHA`. الحماية بالمفتاح على فرع `send=1` بس | `src/app/api/health/mail/route.ts:22-32` (الرد بيتبني قبل فحص المفتاح في `:34`) | `curl https://nasbot.vercel.app/api/health/mail` بيدي للمهاجم إيميل التشغيل بتاعك (هدف تصيّد/حشو بيانات مباشر) وأنهي كوميت شغال بالظبط. الكوميت + المستودع = خريطة الكود اللي هو بيهاجمه | حط فحص `CRON_SECRET` **قبل** ما تبني `status`، وارجّع `404` للي مالوش مفتاح | كود | ٥ دقايق |
| S18 | 🟠 | تسريب معلومات | `settings_read on settings for select using (true)` — والجدول بقى فيه ٣٠+ عمود بعد الهجرات: `commission_pct` · `gateway_fee_pct` · كل أسعار الشغل (`work_pass4_price`…) · `our_cancel_bonus_pct` · `emergency_phone` · `mystery_min_sbotat` | `20260908095553_0009_rls.sql:89` → `settings.commission_pct`, `settings.gateway_fee_pct` (`20260908095210_0006_reviews_photos_ops.sql:145-147`) | أي زائر بيقرا هامش الربح ونسبة العمولة ورسوم البوابة وكل قواعد الاسترداد. ده مش سرّ تقني — ده معلومة تجارية وتفاوضية مع الأماكن والكباتن | اعمل عرض `settings_public` بالأعمدة اللي الواجهة محتاجاها فعلًا (`vodafone_number` · `instapay_handle` · `manual_review_hours` · أسعار العرض) وارفع القراية عن الجدول لـ `fn_has_permission('settings.view')` | كود (هجرة جديدة) | ساعة |
| S19 | 🟠 | حماية البيانات | الموافقتين بيتسجّلوا بتوقيت في `profiles.rules_accepted_at`/`data_consent_at` ✅ — **بس** الحفظ بيكتب `null` لما الخانة مش متعلّمة، فسحب الموافقة بيمسح الأثر ومفيش سجل إنها كانت موجودة. وجدول `consent_accepts` (بنسخة الموافقة) اتعمل في 131351 و**محدش بيكتب فيه ولا مرة** في `src` | `src/lib/api.ts:496-497` مقابل `20260908131351_admin_remaining_tables.sql:42-49` (الجدول) و`:115-116` (سياساته) | مفيش دليل تدقيقي على **إيه** اللي العضو وافق عليه ولا **إمتى** — الجداول اللي اللوحة بتنشر فيها نسخ الموافقات (`consents`) مالهاش أي ربط بالأعضاء. ولو نص الموافقة اتغيّر، مفيش إعادة موافقة | اكتب صف في `consent_accepts` (بـ `consent_id` و`version`) مع كل موافقة، وما تمسحش التواريخ — سجّل السحب كصف جديد | كود | نص يوم |
| S20 | 🟠 | حماية البيانات | مفيش صفحة خصوصية ولا أي نص بيقول للعضو **فين بياناته**. كل النص الموجود سطر واحد: «موافق إن بياناتي تتخزن علشان المطابقة والحجز». والوثائق نفسها بتتناقض على المنطقة | `src/data/copy-fallback.ts:47` (النص الوحيد) · `DB_PLAN.md:18` بيقول `eu-north-1` (ستوكهولم) بينما `DB_PLAN.md:37` و`RUNBOOK.md:12` بيقولوا `eu-central-1` (فرانكفورت) | الاستضافة برّه مصر = نقل بيانات شخصية للخارج، وده محتاج ترخيص من مركز حماية البيانات (١٥١/٢٠٢٠) — والـ `RUNBOOK.md:269` نفسه معترف بده. ومفيش إفصاح للمستخدم أصلًا. وإحنا مش عارفين المنطقة الحقيقية من الوثائق | ١) اتأكد من المنطقة الفعلية من لوحة Supabase وصلّح الوثيقتين. ٢) اكتب صفحة `/khososeya` بالمصري: بناخد إيه · ليه · فين متخزن · بنحتفظ بيه قد إيه · إزاي تصدّره أو تمسحه · مين بنشاركه معاه | لوحة (نصوص) + كود (صفحة) | نص يوم |
| S21 | 🟡 | أسرار | ملف متتبّع في git فيه **أول ٤ حروف من `CRON_SECRET` الحقيقي**: «بتبدأ بـ a93f…». و`CRON_SECRET` هو نفسه الاحتياطي لبهار هاش الـ OTP (`otp.ts:37`) ولبهار هاش توكن جلسة اللوحة (`admin-auth.ts:64`) | `WORK_CRON.sql:11` | تقليل عشوائية سر واحد بيحمي: `/api/cron/work-notify` و`/api/copy/revalidate` وفرع الإرسال في `/api/health/mail` — وبهار الـ OTP وجلسات اللوحة لو المتغيرات التانية فاضية | دوّر `CRON_SECRET`، وشيل السطر من `WORK_CRON.sql` (وسيب مكانه `<CRON_SECRET>` بس). لاحظ إن السر القديم هيفضل في تاريخ git — التدوير هو الحل مش المسح | كود | ١٥ دقيقة |
| S22 | 🟡 | أسرار | بهار ضعيف احتياطي في مكانين: `process.env.ADMIN_AUTH_PEPPER ?? process.env.CRON_SECRET ?? 'nasbot'` و`process.env.CRON_SECRET ?? 'nasbot'`. لو المتغيرين مش متظبطين في Vercel، البهار بيبقى كلمة معروفة موجودة في المستودع | `src/lib/server/admin-auth.ts:64-65` · `src/lib/server/otp.ts:37` | مين يقدر يقرا `otp_codes`؟ حد معاه `service_role` أو نسخة من القاعدة. ساعتها الهاشات بتترجع بالتخمين في ثواني (المجال ١٠⁶ × بهار معروف) | ارمي استثناء وقت الإقلاع لو المتغير مش موجود في الإنتاج بدل الرجوع لكلمة ثابتة | كود | ١٥ دقيقة |
| S23 | 🟡 | RLS | `waitlist_own on waitlist for all … with check (profile_id = auth.uid())` — العضو بيحدد `position` بنفسه. و`fn_cancel_booking` بترقّي `order by position asc limit 1` | `20260908095553_0009_rls.sql:133-134` + `20260909100300_0042_work_functions.sql:545` | `insert into waitlist (sbota_id, profile_id, position) values (…, -999)` = أول واحد في كل قايمة انتظار دايمًا | خلّي `position` يتحسب بمحفّز `before insert` من `max(position)+1`، وامنع `authenticated` من كتابته | كود (هجرة جديدة) | نص ساعة |
| S24 | 🟡 | RLS | `gs_insert on game_sessions for insert with check (true)` و`gs_update … using (profile_id = auth.uid() or profile_id is null)` من غير `with check` | `20260908115742_0036_copy_and_game_tables.sql:181,183` | أي زائر بيدخل جلسات لعبة باسم أي `profile_id`، وبيعدّل أي جلسة مجهولة ويحوّلها لأي حد. تلويث بيانات اللعبة والمؤشرات المبنية عليها | `with check (profile_id = auth.uid() or profile_id is null)` على الاتنين | كود (هجرة جديدة) | ١٥ دقيقة |
| S25 | 🟡 | RLS | `events_insert on events for insert with check (true)` وجدول `events` مفيهوش أي حد معدل | `20260908095553_0009_rls.sql:229` | أي زائر بيحقن ملايين صفوف في `events` بأي `name` و`props` وأي `profile_id` — تلويث تحليلات + تضخيم فاتورة القاعدة | خلّي الإدخال عبر RPC `security definer` بقايمة أسماء أحداث مسموحة و`profile_id = auth.uid()`، وحد معدل بسيط | كود (هجرة جديدة) | ساعة |
| S26 | 🟡 | صلاحيات | `/api/admin/revalidate` بيتحقق إن اللي بينده **مجرد صف نشط في `admin_users`** بس، ما بيستعملش `requirePermission` اللي الملف `admin-auth.ts` كاتب في عقده إن كل مسار إداري لازم يبدأ بيه | `src/app/api/admin/revalidate/route.ts:24-31` مقابل `src/lib/server/admin-auth.ts:498` | أي دور (finance مثلًا) بيبطّل كاش النصوص. أثره خفيف، بس ده كسر للعقد المكتوب — والمسارات اللي بتتكتب بعده هتتقلّد منه | `const me = await requirePermission(req, 'content.edit')` + `adminAuthResponse(e)` | كود | ١٥ دقيقة |
| S27 | 🟡 | تسريب معلومات | `/api/account/ensure` بيرجّع نص خطأ Supabase الخام للعميل: `` `لازم تسجل دخول (${authErr?.message})` `` | `src/app/api/account/ensure/route.ts:25` | بيقول للمهاجم بالظبط ليه التوكن مرفوض (منتهي · توقيع غلط · مستخدم متمسوح) — بيسهّل مهاجمة الجلسات | رسالة واحدة عامة، والتفصيل في `console.error` بس | كود | ٥ دقايق |
| S28 | 🟡 | إشراف | `messages` عليها سياستين بس: `messages_read` و`messages_write`. **مفيش سياسة `update` ولا `delete` لا للعضو ولا للإدارة**، والعمود `messages.deleted_at` موجود ومفيش أي طريق يوصله | `20260908095553_0009_rls.sql:177-196` مقابل العمود في `20260908095129_0005_matching_and_chat.sql:112` · وصفحة البلاغات `src/app/admin/reports/page.tsx:206` بتقفل البلاغ بس | بلاغ على رسالة مسيئة بيتقفل من غير ما الرسالة تتشال — الرسالة بتفضل في الشات قدام كل المجموعة | `create policy messages_moderate on messages for update using (fn_has_permission('reports.action')) with check (…)` وضيف زرار «اشطب الرسالة» في صفحة البلاغات | كود (هجرة) + لوحة | ساعتين |
| S29 | 🟡 | إساءة استخدام | `capps_insert … with check (true)` و`wss_insert … with check (true)` — إدخال من غير تسجيل دخول ومن غير أي حد معدل (على عكس `fn_submit_lead` اللي عاملة ٣/يوم للرقم صح) | `20260908095553_0009_rls.sql:103` و`:105` | حشو `captain_applications` و`weekly_schedule_subs` بآلاف الصفوف بأرقام موبايل عشوائية → صفحة الكباتن في اللوحة بتبقى مش قابلة للاستعمال، وقايمة الواتساب بتتلوّث | حوّل الاتنين لـ RPC على نمط `fn_submit_lead` (`20260909100400_0043_work_rls.sql:84`) بحد ٣ في اليوم للرقم، واسحب سياسة الـ `insert` المباشرة | كود (هجرة جديدة) | ساعة |
| S30 | 🔵 | CSRF | `originOk()` بترجّع `true` لما ترويسة `Origin` مش موجودة خالص | `src/lib/server/admin-auth.ts:274-276` | الكوكي `SameSite=Strict` بيغطّي المتصفحات، فده مش مسار استغلال من صفحة ويب. بس أي عميل مش متصفح (أو بروكسي بيشيل الترويسة) بيعدّي الفحص | لما `Origin` مش موجودة، ارجع لـ `Sec-Fetch-Site` أو `Referer`؛ ولو مفيش الاتنين ارفض على الطلبات اللي بتغيّر حاجة | كود | نص ساعة |
| S31 | 🔵 | CSP | `script-src 'self' 'unsafe-inline'` في الإنتاج — والتعليق شارح ليه (سكربت الوضع في `layout.tsx` + حمولة RSC) | `next.config.mjs:57` | لو حصلت ثغرة XSS في أي مكان، الـ CSP مش هيوقفها. مع S16 (كوكي فيه رقم موبايل ومش HttpOnly) الأثر بيكبر | استعمل `nonce` من الميدل وير (هو موجود أصلًا وشغال على `/admin`، وسّعه) | كود | نص يوم |
| S32 | 🔵 | حد المعدل | `clientIp()` بتثق في `x-forwarded-for` لو `x-vercel-forwarded-for` مش موجودة — والتعليق نفسه معترف بده | `src/lib/server/admin-auth.ts:238-249` | حد المعدل بالـ IP على دخول اللوحة (`RL_MAX_PER_IP = 20`) بيتلف بترويسة مزوّرة. حد الرقم (`RL_MAX_PER_PHONE = 5`) لسه صامد لأن الرقم بييجي من الملف | على Vercel اعتمد على `x-vercel-forwarded-for` **بس** وتجاهل الباقي في الإنتاج | كود | ١٥ دقيقة |

**العدد: ٣٢ ملاحظة** — ٨ 🔴 · ١٢ 🟠 · ٩ 🟡 · ٣ 🔵.

---

## (أ) مصفوفة RLS — كل جدول اتعمل في الـ٧١ هجرة

٦٧ جدول. **مفيش ولا جدول واحد من غير `enable row level security`** — ده اتحقق سطر بسطر من `0009_rls.sql` و`0035` و`0036` و`admin_remaining_tables` و`0043`.

الرموز: `S`=select · `I`=insert · `U`=update · `D`=delete · `ALL`=`for all`

| # | الجدول | RLS مفعّل؟ | عدد السياسات | القراية | الكتابة | ملاحظة |
|---|--------|-----------|--------------|---------|---------|---------|
| 1 | `profiles` | ✅ 0009:2 | 5 | صاحبه · admin · كابتن بعد الكشف · **أي متبادل (صف كامل)** | صاحبه (U/I) · `people.edit` + محفّز `t_guard_ban` | **S3** — `profiles_mutual_read` بتفتح الصف كله |
| 2 | `interests` | ✅ | 1 | `true` | **مفيش** | قاموس — الإدارة ما تقدرش تضيف اهتمام من اللوحة |
| 3 | `profile_interests` | ✅ | 1 (ALL) | صاحبه · admin | صاحبه | سليم |
| 4 | `skill_levels` | ✅ | 1 (ALL) | صاحبه · admin | صاحبه | سليم |
| 5 | `captains` | ✅ | 2 | **`is_active` — الكل بما فيهم `anon`** | `fn_is_admin()` | **S5** `payout_method` مكشوف · **S9** |
| 6 | `captain_applications` | ✅ | 3 | admin | `insert (true)` · U بـ `captains.edit` | **S29** |
| 7 | `weekly_schedule_subs` | ✅ | 2 | admin | `insert (true)` بس | **S29** · مفيش U فالـ `upsert` في `api.ts:1336` بيفشل على التصادم |
| 8 | `venues` | ✅ | 2 | `fn_is_admin()` | `fn_is_admin()` | `wholesale_price` محمي من الأعضاء ✅ · **S9** للأدوار |
| 9 | `sbota_templates` | ✅ | 2 | `true` | `sbotat.edit` ✅ | سليم |
| 10 | `sbotat` | ✅ | 2 | حالات معلنة · admin · الكابتن | `fn_is_admin()` | **S9** — `support` يعدّل السعر |
| 11 | `sbota_groups` | ✅ | 2 | admin · الكابتن · صاحب حجز | `fn_is_admin()` | **S9** |
| 12 | `mystery_clues` | ✅ | 2 | بعد `unlocks_at` | `fn_is_admin()` | **S9** |
| 13 | `bookings` | ✅ | 3 | صاحبه · admin · الكابتن بعد الكشف | **`insert` بأي `status`** · `fn_is_admin()` | **S4** 🔴 · **S9** |
| 14 | `waitlist` | ✅ | 1 (ALL) | صاحبه · admin | صاحبه — **`position` حر** | **S23** |
| 15 | `payments` | ✅ | 2 (S بس) | صاحب الحجز · صاحب الكارت · admin | **مفيش** — الدوال بس ✅ | تصميم سليم |
| 16 | `refunds` | ✅ | 1 (S بس) | صاحب الدفعة · admin | **مفيش** — `fn_issue_refund` بس ✅ | سليم |
| 17 | `wallet_ledger` | ✅ | 1 (S بس) | صاحبه · admin | **مفيش** ✅ | سليم — بس **S13** (مفيش قيد رصيد سالب) |
| 18 | `coupons` | ✅ | 2 | **`true`** | `fn_is_admin()` | **S14** 🟠 |
| 19 | `referrals` | ✅ | 1 (S بس) | الطرفين · admin | **مفيش** — محفّز `fn_booking_paid` ✅ | سليم |
| 20 | `matching_runs` | ✅ | 1 (ALL) | `fn_is_admin()` | `fn_is_admin()` | **S9** — البناء نفسه محمي بـ `matching.run` ✅ لكن الاعتماد لأ |
| 21 | `matching_outcomes` | ✅ | 1 (ALL) | `fn_is_admin()` | `fn_is_admin()` | **S9** |
| 22 | `pair_affinity` | ✅ | 3 | admin بس | **`insert`/`update` من العضو** | **S1** 🔴 |
| 23 | `behavior_flags` | ✅ | 1 (ALL) | `fn_is_admin()` | `fn_is_admin()` | **S9** |
| 24 | `chat_rooms` | ✅ | 1 (S بس) | عضو الغرفة · admin | **مفيش** — `fn_open_one_on_one` بس ✅ | سليم |
| 25 | `chat_members` | ✅ | 2 | عضو نفس الغرفة | `fn_is_admin()` | **S9** |
| 26 | `messages` | ✅ | 2 | عضو غير مشال + الغرفة مفتوحة ✅ | `insert` لصاحبها ✅ — **مفيش U/D** | **S28** |
| 27 | `reports` | ✅ | 3 | المبلّغ · admin | `insert` للمبلّغ ✅ · `fn_is_admin()` | **S9** |
| 28 | `reviews` | ✅ | 2 | صاحبه · admin | `insert` — **`sbota_id` غير متحقق** | **S15** 🟠 |
| 29 | `sbota_photos` | ✅ | 3 | admin · الرافع · عضو دافع بعد النشر ✅ | الكابتن · `fn_is_admin()` | **S9** |
| 30 | `captain_reports` | ✅ | 1 (ALL) | الكابتن · admin | الكابتن ✅ | سليم |
| 31 | `notification_templates` | ✅ | 2 | `fn_is_admin()` | `notifications.edit` ✅ | القراية بس هي اللي بـ `fn_is_admin()` |
| 32 | `notifications` | ✅ | 3 | صاحبها · admin ✅ | صاحبها (U) · `notifications.edit` ✅ | سليم |
| 33 | `otp_codes` | ✅ 0009:34 | **صفر — عن قصد** | مفيش | مفيش | ✅ صح: `service_role` بس + `revoke all` صريحة في `0010:152` |
| 34 | `audit_log` | ✅ | 2 | `fn_is_admin()` — **المفروض `audit.view`** | `insert` بـ `fn_is_admin()` | **S9** |
| 35 | `settings` | ✅ | 2 | **`true`** | `fn_is_admin()` | **S18** + **S9** |
| 36 | `events` | ✅ | 2 | `fn_is_admin()` | **`insert (true)`** | **S25** |
| 37 | `marketing_spend` | ✅ | 1 (ALL) | `fn_is_admin()` | `fn_is_admin()` | **S9** |
| 38 | `admin_roles` | ✅ 0035:161 | 1 (S بس) | أي دور لوحة | **مفيش** | owner ما يقدرش يضيف دور من اللوحة |
| 39 | `admin_permissions` | ✅ | 1 (S بس) | أي دور لوحة | **مفيش** | كتالوج ثابت — مقبول |
| 40 | `role_permissions` | ✅ | 2 | أي دور لوحة | `admins.manage` ✅ | سليم |
| 41 | `admin_users` | ✅ | 2 | نفسه · `admins.manage` ✅ | `admins.manage` ✅ | سليم — `totp_secret` بيتقرا لصاحبه بس |
| 42 | `admin_sessions` | ✅ 0035:165 | **صفر — عن قصد** | مفيش | مفيش | ✅ صح: الخادم بمفتاح الخدمة بس |
| 43 | `copy_strings` | ✅ | 2 | `true` (نصوص عامة) ✅ | `content.edit` ✅ | سليم |
| 44 | `copy_history` | ✅ | 1 (S بس) | `content.view` ✅ | محفّز `fn_copy_history` ✅ | سليم |
| 45 | `banned_words` | ✅ | 2 | `content.view` ✅ | `settings.edit` ✅ | سليم |
| 46 | `game_questions` | ✅ | 2 | `is_active` أو `game.view` ✅ | `game.edit` ✅ | سليم |
| 47 | `game_options` | ✅ | 2 | `is_active` أو `game.view` ✅ | `game.edit` ✅ | سليم |
| 48 | `personality_types` | ✅ | 2 | `true` ✅ | `game.edit` ✅ | سليم |
| 49 | `game_option_scores` | ✅ | 2 | `true` — **ده مفتاح إجابات اللعبة** | `game.edit` ✅ | مش خطر أمني، بس اللعبة بتبقى محلولة |
| 50 | `game_sessions` | ✅ | 3 | صاحبها · `game.view` ✅ | **`insert (true)` · U من غير `with check`** | **S24** |
| 51 | `feature_flags` | ✅ | 2 | `true` ✅ | `settings.edit` ✅ | سليم |
| 52 | `maintenance` | ✅ | 2 | `true` ✅ | `settings.danger` ✅ | سليم |
| 53 | `profile_fields` | ✅ | 2 | `is_active` أو `fields.edit` ✅ | `fields.edit` ✅ | سياسات الكتابة من غير `with check` (الـ `using` بيغطّي) |
| 54 | `field_options` | ✅ | 2 | `is_active` أو `fields.edit` ✅ | `fields.edit` ✅ | نفس الملاحظة |
| 55 | `skill_activities` | ✅ | 2 | `is_active` أو `fields.edit` ✅ | `fields.edit` ✅ | نفس الملاحظة |
| 56 | `consents` | ✅ | 2 | منشور أو `fields.edit` ✅ | `fields.edit` ✅ | سليم |
| 57 | `consent_accepts` | ✅ | 2 | صاحبه · `people.view` ✅ | `insert` لصاحبه ✅ | **S19** — الجدول شغّال ومحدش بيكتب فيه |
| 58 | `broadcasts` | ✅ | 1 (ALL) | `notifications.broadcast` ✅ | نفسها ✅ | من غير `with check` |
| 59 | `provider_alerts` | ✅ | 1 (ALL) | `sbotat.edit` أو `captains.edit` ✅ | نفسها ✅ | من غير `with check` |
| 60 | `professions` | ✅ 0043:5 | 2 | `true` ✅ | `fields.edit` ✅ | سليم |
| 61 | `work_venues` | ✅ | 2 | `fn_is_admin()` | `sbotat.edit` ✅ | `wholesale_seat_price` محمي ✅ · **S9** للقراية |
| 62 | `work_passes` | ✅ | 3 | صاحبه · admin ✅ | `insert` مقيّد بـ `pending`+`used=0` ✅ · `payments.review` ✅ + محفّز `t_guard_pass_columns` ✅ | **أنضف جدول في المشروع** |
| 63 | `pass_redemptions` | ✅ | 1 (S بس) | صاحب الكارت · admin ✅ | **مفيش** — الدوال بس ✅ | سليم |
| 64 | `recurring_bookings` | ✅ | 2 (ALL) | صاحبه ✅ | صاحبه · `bookings.edit` ✅ | سليم |
| 65 | `work_affinity` | ✅ | 3 | admin بس | **`insert`/`update` من العضو** | **S2** 🔴 |
| 66 | `venue_reports` | ✅ | 2 | `payments.view` ✅ | `payments.review` ✅ | سليم — و`fn_venue_report` اتقفلت في 0050 ✅ |
| 67 | `leads` | ✅ | 2 | `people.view` ✅ | U بـ `people.view` · **مفيش `insert`** ✅ عن قصد (`fn_submit_lead`) | سليم |

**عروض ومناظر مادية:**

| الكيان | النوع | الحماية | الحكم |
|--------|------|---------|-------|
| `sbotat_public` | view · `security_invoker = true` | بيحترم RLS · مفيهوش `venues` خالص من 0029 | ✅ العنوان مصدره `fn_sbota_address` بس |
| `work_venues_public` | view فوق `fn_work_venues_public()` (definer) | الأعمدة محدّدة بالاسم — من غير `wholesale_seat_price` ولا `notes_ar` | ✅ |
| `work_group_members` | view فوق `fn_work_group_members()` (definer) | ٤ أعمدة بس · `revoke select from anon` | ✅ |
| `weekly_metrics` | materialized view | `revoke all from anon, authenticated` (0028) — القراية عبر `fn_weekly_metrics` | ✅ |
| `work_metrics` | materialized view | `revoke all from anon, authenticated` (0041:421) — القراية عبر `fn_work_metrics` بـ `settings.view` | ✅ |

**سياسات التخزين (`storage.objects`, هجرة 0025):**

| الدلو | عام؟ | القراية | الكتابة | الحكم |
|-------|------|---------|---------|-------|
| `avatars` | خاص | صاحبها · الكابتن بعد الكشف · **أي متبادل** | صاحبها بس | ⚠ `avatars_mutual_read` (`0025:36`) بتعتمد على `fn_is_mutual` → **مكسورة بـ S1** |
| `sbota-photos` | خاص | عضو دافع بعد النشر · الكابتن ✅ | الكابتن بس ✅ | ✅ |
| `receipts` | خاص | `fn_is_admin()` | صاحب الحجز — والمسار لازم يبدأ برقم حجزه ✅ | ✅ السياسة سليمة · **S12** في مسار الـ API مش في السياسة |
| `public-media` | **عام** | الكل | `fn_is_admin()` | ✅ مقصود |

---

## (ب) جرد دوال `security definer`

٦٩ دالة `security definer`. **كلها من غير استثناء عليها `set search_path = public`** — اتحقق آليًا بفحص كل تعريف قبل `$$`. ده أنضف بند في المراجعة كلها.

### مفتوحة لـ `anon` (٧)

| الدالة | فيها فحص؟ | الحكم |
|--------|-----------|-------|
| `fn_who_booked(uuid)` | مجمّعات بدون هوية | ✅ |
| `fn_group_professions(uuid)` | بترجّع العدد بس قبل `reveal_at` (0042:280) | ✅ |
| `fn_submit_lead(...)` | حد ٣/يوم للرقم + تنضيف مدخلات (0043:84) | ✅ نموذج يُحتذى |
| `fn_work_venues_public()` | أعمدة محدّدة · العنوان بشرط | ✅ |
| `fn_is_admin()` · `fn_admin_role()` · `fn_has_permission(text)` | بترجّع `false`/`null` للزائر — لازمة لسياسات RLS نفسها | ✅ (والمنح رجع صح في `135336`) |
| `fn_my_captain_id()` · `fn_is_my_sbota_revealed(uuid)` · `fn_is_room_member(uuid)` · `fn_is_mutual(uuid)` | نفس السبب — مساعدات سياسات | ✅ منطقيًا · ⚠ `fn_is_mutual` مسمومة بـ **S1** |

### مفتوحة لـ `authenticated` — **مع** فحص داخلي (١٩)

| الدالة | الفحص | الحكم |
|--------|-------|-------|
| `fn_can_i_book(uuid)` · `fn_can_i_book_mystery()` · `fn_is_my_profile_complete()` · `fn_my_pass_balance()` | بتلف على `auth.uid()` — مستحيل تسأل عن حد تاني | ✅ نمط صح |
| `fn_sbota_address(uuid)` | `exists booking where profile_id = auth.uid() and status in ('paid','attended')` | ✅ — بس **S4** بيخلّي الحجز المدفوع مجاني |
| `fn_group_members(uuid)` | الحجز بتاعي + بعد الكشف + **من غير `avatar_path`** | ✅ ممتاز |
| `fn_work_group_members()` | نفس المنطق + ٤ أعمدة بس | ✅ |
| `fn_met_before()` | `mutual_at is not null` | ⚠ مكسورة بـ **S1** (بترجّع `avatar_path`) |
| `fn_my_work_collabs()` | `mutual_at is not null` | ⚠ مكسورة بـ **S2** |
| `fn_open_one_on_one(uuid)` | `fn_is_mutual` أو `fn_work_collab_state = 'mutual'` | ⚠ مكسورة بـ **S1/S2** |
| `fn_work_collab_state(uuid)` | بترجّع `mutual`/`none` بس — ما بتكشفش الطرف الواحد | ✅ التصميم صح |
| `fn_pair_want(...)` · `fn_work_want(...)` | بتكتب جهة اللي بينادي **بس** | ✅ الدالتين سليمتين — المشكلة إن السياسات القديمة سايبة الباب المباشر مفتوح جنبهم |
| `fn_soft_delete_profile()` | `auth.uid()` بس | ✅ — بس محدش بينادي عليها (**S6**) |
| `fn_redeem_pass(uuid)` | `b.profile_id <> auth.uid() and not fn_is_admin()` → رفض | ✅ |
| `fn_build_matching(uuid)` · `fn_build_work_matching(uuid)` | `v_role <> 'service_role' and not fn_has_permission('matching.run')` → استثناء | ✅ نموذج يُحتذى |
| `fn_issue_refund(...)` | `fn_has_permission('payments.refund')` + سقف المبلغ | ✅ |
| `fn_wallet_adjust(...)` | `fn_has_permission('wallet.credit')` + منع الرصيد السالب | ✅ |
| `fn_weekly_metrics(int)` · `fn_work_metrics(int)` | `fn_has_permission('settings.view')` جوّه الاستعلام | ✅ |
| `fn_admin_run_work_recurring()` · `fn_admin_build_venue_report(date)` · `fn_admin_refresh_work_metrics()` | `bookings.edit` · `payments.review` · `settings.view` | ✅ (0050) |

### مفتوحة لـ `authenticated` — الفحص **بـ `fn_is_admin()` وهي واسعة أوي** (٣) → **S8**

| الدالة | السطر | اللي المفروض |
|--------|-------|--------------|
| `fn_approve_transfer(uuid, boolean, text)` | `0042:593` `if not fn_is_admin()` | `fn_has_permission('payments.review')` |
| `fn_activate_pass(uuid)` | `0042:217` `if auth.uid() is not null and not fn_is_admin()` | `fn_has_permission('payments.review')` |
| `fn_cancel_booking(uuid, text, text)` | `0042:481` `if auth.uid() is null or fn_is_admin()` → بيصدّق `p_by='us'` | `fn_has_permission('bookings.edit')` — لاحظ إن أصل الثغرة (تصديق `p_by` من العميل) **اتقفل صح** في `0010:36-41`، الباقي هو اتساع `fn_is_admin` بس |

### مقفولة على `service_role` أو محدش (٤٠) ✅

`fn_pass_balance` · `fn_revert_pass` · `fn_venue_report` (اتسحبت من `authenticated` في **0050:120** — كانت ثغرة حقيقية واتقفلت) · `fn_reveal` · `job_reveal_due` · `job_close_chats` · `job_expire_bookings` · `job_reminders` · `job_after_sbota` · `job_win_back` · `job_purge` · `job_metrics` · `job_work_recurring` · `job_work_pass_reminders` · `job_work_venue_reports` · `job_work_metrics` · `dump_migrations` · `check_permission_refs` · `test_rls` · `test_work_rls` · `test_pair_want` · `test_work_collabs` · `test_work_admin_rpcs` · وكل دوال المحفّزات (`set_updated_at` · `fn_sbota_timings` · `fn_capacity_guard` · `fn_wallet_balance` · `fn_mutual_affinity` · `fn_mutual_work_affinity` · `fn_ratings_rollup` · `fn_booking_paid` · `fn_referral_reward` · `fn_sbota_count` · `fn_sync_sbota_area` · `fn_sync_captain_name` · `fn_sbota_is_work` · `fn_guard_ban_columns` · `fn_guard_pass_columns` · `fn_copy_history`).

`seed_person(...)` اتمسحت في `0028:33` ✅.

---

## صلاحية الصفحة (`needs=`) مقابل سياسة القاعدة

| الصفحة | `needs=` | الجداول اللي بتكتب فيها من المتصفح | سياسة القاعدة | متطابقة؟ |
|--------|----------|-------------------------------------|----------------|----------|
| `/admin/content` | `content.edit` | `copy_strings` | `content.edit` | ✅ |
| `/admin/game` | `game.edit` | `game_questions`, `game_options`, `personality_types`, `game_option_scores` | `game.edit` | ✅ |
| `/admin/profile-fields` | `fields.edit` | `profile_fields`, `field_options`, `skill_activities`, `consents` | `fields.edit` | ✅ |
| `/admin/templates` | `sbotat.edit` | `sbota_templates` | `sbotat.edit` | ✅ |
| `/admin/sbotat` | `sbotat.view` | **`sbotat`** (insert/update) | `fn_is_admin()` | ❌ **S9** — أي دور |
| `/admin/bookings` | `bookings.view` | **`bookings`** (insert/update), `waitlist` | `fn_is_admin()` | ❌ **S9** |
| `/admin/matching` | `matching.view` | `matching_runs` (اعتماد) | `fn_is_admin()` | ❌ **S9** (البناء نفسه ✅) |
| `/admin/people` | `people.view` | `profiles` ✅ · **`behavior_flags`** | `people.edit`+محفّز `people.ban` ✅ / `fn_is_admin()` | جزئي ❌ |
| `/admin/captains` | `captains.edit` | `captains`, `captain_applications`, `provider_alerts` | `fn_is_admin()` / `captains.edit` ✅ / ✅ | جزئي ❌ |
| `/admin/payments` | `payments.view` | **`coupons`** · `refunds`+`wallet_ledger` عبر RPC | `fn_is_admin()` / RPC بصلاحية ✅ | جزئي ❌ (الكوبونات) |
| `/admin/reports` | `reports.view` | **`reports`**, **`behavior_flags`** | `fn_is_admin()` | ❌ **S9** |
| `/admin/notifications` | `notifications.view` | `notification_templates`, `notifications` | `notifications.edit` | ✅ |
| `/admin/map` | `map.edit` | **`venues`** | `fn_is_admin()` | ❌ **S9** |
| `/admin/settings` | `settings.view` | **`settings`** · `feature_flags` ✅ · `maintenance` ✅ · `banned_words` ✅ | `fn_is_admin()` / `settings.edit` / `settings.danger` / `settings.edit` | جزئي ❌ (جدول `settings` نفسه) |
| `/admin/shoghl` | `sbotat.view` | RPCs بس (0050) | `bookings.edit` · `payments.review` · `settings.view` | ✅ |
| `/admin/team` | `admins.manage` | `admin_users`, `role_permissions` | `admins.manage` | ✅ |
| `/admin/audit` | `audit.view` | قراية بس من `audit_log` | `fn_is_admin()` | ❌ **S9** |

---

## محتاج تأكيد من القاعدة (مفيش وصول من هنا)

شغّل ده في محرر SQL في Supabase بحساب `owner`:

```sql
-- 1) جدول مفعّل RLS ومن غير ولا سياسة (لازم يرجّع otp_codes و admin_sessions بس)
select c.relname, c.relrowsecurity, count(p.polname) as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r'
group by 1,2
having c.relrowsecurity = false or count(p.polname) = 0
order by 1;

-- 2) دالة security definer من غير search_path (لازم ترجّع صفر صفوف)
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and not exists (select 1 from unnest(coalesce(p.proconfig,'{}')) c where c like 'search_path=%');

-- 3) الدوال اللي anon أو authenticated يقدر ينفّذها فعلًا (راجع القايمة سطر سطر)
select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fn,
       has_function_privilege('anon',          p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as auth_
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (has_function_privilege('anon', p.oid, 'execute')
    or has_function_privilege('authenticated', p.oid, 'execute'))
order by 1;

-- 4) الجداول اللي anon معاه عليها select على مستوى الـ GRANT (تحت RLS برضه، بس شوفها)
select table_name, privilege_type, grantee
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon','authenticated')
  and privilege_type in ('INSERT','UPDATE','DELETE')
order by table_name, grantee;

-- 5) تأكيد S1 عمليًا (شغّلها بحساب عضو تجريبي، مش بـ service_role)
--    لو رجّعت صف فيه mutual_at مش فاضي → الثغرة حقيقية في الإنتاج
-- insert into pair_affinity (a_id, b_id, a_wants_b, b_wants_a)
-- values (least('<me>'::uuid,'<other>'::uuid), greatest('<me>'::uuid,'<other>'::uuid), true, true)
-- returning mutual_at;

-- 6) تأكيد S4 عمليًا (بحساب عضو تجريبي)
-- insert into bookings (sbota_id, profile_id, status, price_paid)
-- values ('<sbota مفتوحة>', auth.uid(), 'paid', 0) returning id, status;

-- 7) المنطقة الحقيقية (S20) — من لوحة Supabase: Settings ← General ← Region
```

---

## «شغال تمام» — اللي اتأكدنا إنه سليم فعلًا

1. **`enable row level security` على ٦٧ جدول من ٦٧** — مفيش جدول واحد مفتوح. والجدولين اللي من غير سياسات (`otp_codes` · `admin_sessions`) مقصودين وموثّقين، و`otp_codes` عليها `revoke all on otp_codes from anon, authenticated` صريحة في `0010:152` كمان.
2. **`set search_path = public` على كل الـ٦٩ دالة `security definer`** بلا استثناء واحد. ده اللي بيقفل حقن `search_path` نهائيًا.
3. **`revoke execute on all functions … from public`** اتعمل ٣ مرات (0011 · 0028 · 130745) + `alter default privileges … revoke execute … from public` — وده الفخ اللي بيقع فيه ٩٠٪ من مشاريع Supabase (بوستجرس بيدي `EXECUTE` لـ `PUBLIC` تلقائيًا). الهجرات الجديدة كلها بتكتب `revoke`/`grant` بالاسم.
4. **`venues.wholesale_price` و`work_venues.wholesale_seat_price` غير قابلين للوصول من أي مسار عضو** — اتتبّعنا كل عرض و RPC: `sbotat_public` (0029) شال `venues` خالص، `work_venues_public` بيعدّ الأعمدة بالاسم، `fn_sbota_address` بترجّع ٤ أعمدة بس، و`fn_venue_report` اتسحبت من `authenticated` في 0050. **ثبت.**
5. **العنوان الكامل مقفول على الحاجزين الدافعين** — `fn_sbota_address` (`0007:211`) هي المصدر الوحيد وبتتحقق من `bookings.status in ('paid','attended')` لصاحب الطلب.
6. **`fn_group_members` و`fn_work_group_members` مصمّمين صح** — بيطلّعوا الاسم الأول والمجال والأسلوب بس، **من غير `avatar_path` ولا `phone` ولا `email`**، وبيرجّعوا فاضي قبل `reveal_at`. التعليقات في `0043` بتشرح ليه ما اتعملتش سياسة RLS بدالهم — القرار ده صح ١٠٠٪.
7. **`fn_cancel_booking` — ثغرة تصعيد `p_by='us'` اتقفلت فعلًا** في `0010:36-41`. الكود المكتوب في `0008` كان مصاب، والإصلاح موجود في النسخة اللي شغالة (`0042:481`).
8. **`fn_venue_report` — الثغرة اتلقطت واتقفلت** في `0050:120` مع اختبار (`test_work_admin_rpcs` بند ٢) بيتأكد إنها ما ترجعش تتفتح.
9. **دخول اللوحة بعاملين حقيقيين**: OTP على الرقم (جلسة موقّعة من Supabase مش ادّعاء) + TOTP RFC 6238 مكتوب بـ `node:crypto` بس، بمقارنة `timingSafeEqual`، ونافذة ±خطوة واحدة، **ومنع إعادة استعمال نفس الكود** (`totpStepUsed`). وتفعيل TOTP ما ينفعش يتصفّر من المسار (`totp/route.ts:74`) — ده بالظبط اللي بيمنع «اللي ماسك موبايل المدير» يرجّع الحساب لعامل واحد.
10. **`requireAdminSession` بيربط الكوكيين**: `admin_sessions.admin_user_id → admin_users.profile_id` لازم يساوي صاحب جلسة Supabase. كوكي لوحة مسروق لوحده = صفر. وكل فشل استعلام بيقفل مش بيفتح (`if (sErr) throw`) — «مقفول عند الشك» متطبّق بجد.
11. **كوكي اللوحة**: `HttpOnly` · `SameSite=Strict` · `Secure` في الإنتاج · ٤ ساعات عمر · ٣٠ دقيقة خمول **بيلغي الصف فعليًا** مش بس يرفض · وفتح جلسة جديدة بيلغي القديمة (`revokeAdminSessions`).
12. **`server-only` على `supabase-admin.ts`** — لو أي مكوّن عميل استورده البناء نفسه بيقع. ومفيش ولا `process.env` غير `NEXT_PUBLIC_*` في أي ملف بيوصل للمتصفح (اتحقق بجرد كامل: `middleware.ts` · `lib/copy.ts` · `lib/supabase.ts` كلهم `NEXT_PUBLIC_` بس؛ `app/sitemap.ts` بيقرا `APP_URL`/`VERCEL_*` بس هو Route Handler على الخادم).
13. **مفيش أي سر في المستودع**: مفيش JWT ولا `service_role` key ولا مفتاح خاص في أي ملف متتبّع. `.gitignore` بيقفل `.env*` و`.next` و`public/dev-session*.json`. و`git log -p --all -S 'eyJhbGciOi'` رجّع **صفر**. (الاستثناء الوحيد بادئة `a93f` في `WORK_CRON.sql` — **S21**.)
14. **الأسعار كلها بتتحسب على الخادم**: `/api/pay/create` بياخد `slug` بس وبيقرا السعر من `sbotat_public`/`settings`، و`/api/pay/pass` بيقرا `work_pass4_price`/`work_pass8_price` من `settings` ويرمي أي رقم من العميل. المستخدم بيتحدد من `getUser(token)` مش من أي `id` في الجسم — في **كل** مسار من غير استثناء.
15. **مفيش بوابة دفع ومفيش بيانات بطاقة بتعدّي على السيرفر خالص** — دفع يدوي بمراجعة بشرية. ده بيشيل فئة كاملة من المخاطر.
16. **`work_passes` مقفول صح**: العضو يقدر يعمل صف `pending` بـ `sessions_used = 0` بس، مفيش سياسة `update` ليه أصلًا، وفوق ده محفّز `fn_guard_pass_columns` بيقارن الأعمدة القديمة بالجديدة ويرفض. **مفيش طريق من المتصفح يخلّي كارت `active`.** ده النمط اللي المفروض يتنسخ على `bookings` (S4).
17. **`fn_build_matching` و`fn_build_work_matching`** بيتحققوا من `matching.run` جوّه الدالة ومعاهم استثناء صريح لـ `service_role` بس — نمط صح لدالة definer قوية.
18. **الهيدرز الأمنية كاملة** في `next.config.mjs`: HSTS بـ preload · `frame-ancestors 'none'` · `X-Content-Type-Options` · `Referrer-Policy` · `Permissions-Policy` مقفولة على الكاميرا والميكروفون والموقع · و`X-Robots-Tag: noindex` على `/admin` و`/me` و`/my`.
19. **الميدل وير محدود على `/admin` بس** بـ `matcher` واضح + حزام تاني جوّه الدالة، وبيستعمل `getUser()` (تحقق على سيرفر Supabase) مش `getSession()`. ومش بيلمس القاعدة ولا مفتاح الخدمة.
20. **`fn_submit_lead`** — أنضف مدخل عام في المشروع: حد معدل ٣/يوم للرقم، تنضيف وقصّ كل المدخلات، وسياسة `insert` مسحوبة عن قصد علشان تبقى هي الطريق الوحيد. **خد النمط ده وطبّقه على `captain_applications` و`weekly_schedule_subs`** (S29).
21. **`fn_work_collab_state` و`fn_pair_want` و`fn_work_want`** — تصميم الخصوصية فيهم صح تمامًا: بيرجّعوا `mutual`/`none` بس وما بيكشفوش اختيار الطرف الواحد أبدًا. المشكلة (S1/S2) مش فيهم — هي إن سياسات 0009/0043 سايبة باب مباشر مفتوح جنبهم.
22. **الموافقتان بيتسجّلوا بتوقيت فعلي** (`rules_accepted_at` · `data_consent_at` في `api.ts:496-497`) — الأساس موجود، الناقص هو السجل التاريخي (S19).
