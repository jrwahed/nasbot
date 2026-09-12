-- ============================================================================
-- 0084 — محتوى الصفحات والرسايل (من CONTENT_BRIEF.md)
--
-- المحتوى اتكتب على البريف واترجع، والملف ده بيحطّه في القاعدة.
--
-- ⚠⚠ **أهم حاجة في الملف ده: متغيّرات قوالب الرسايل اتصلّحت.**
--    الكاتب بنى الأرقام على توقّع منطقي ونبّه إنها محتاجة مطابقة. طابقناها
--    مع `CORE` في `src/lib/server/notify.ts` (هي اللي بتبعت القيم فعلًا)
--    ولقينا **٩ من ١١ قالب** الأرقام فيهم كانت هتبقى غلط:
--      · reminder_24h  — {{1}} هي **اسم السبوطة** مش اسم العضو.
--      · reminder_3h   — القالب بياخد قيمتين بس، مش تلاتة.
--      · cancelled_by_us — قيمة واحدة بس.
--      · photos_ready / weekly_schedule — {{1}} هي **الرابط**.
--      · win_back      — {{1}} هو الكابتن.
--      · group_reveal / waitlist_promoted / review_request / mutual_match
--        — الرابط كان هيضيع.
--    ولقينا كمان **باجين قدام المحتوى ده**:
--      · `transfer_received` فيه {{1}} وهو مش في CORE خالص — الإيميل كان
--        بيوصل «وصلنا تحويلك لـ .» بفراغ. بقى بيستعمل {name}.
--      · `mutual_match` كان بياخد رابط ومش مستعمله — العضو بيعرف إن الشات
--        اتفتح ومش لاقي لينك. اتصلّح.
--    وفيه دلوقتي حارس دايم: `scripts/check-notify-vars.mjs` جوه
--    `npm run verify` بيقارن القوالب بـCORE ويفشل البناء لو اختلفوا.
--
-- ⚠ صفحة الشروط **مقفولة عن الناس** عن قصد: لسه فيها خانتين محتاجينك
--    (مدة صلاحية الرصيد · وسيلة التواصل) وفقرة محتاجة محامي مصري. افتحها
--    من /admin/content لما تخلص.
--
-- آمن يتكرر.
-- ============================================================================


-- ===== فقرات faq =====
delete from content_blocks where page_slug = 'faq' and ref is null;
insert into content_blocks (page_slug, kind, heading_ar, body_ar, sort, is_active) values
  ('faq', 'qa', 'نسبوط بيشتغل إزاي بالظبط؟', 'بتختار خروجة من اللي نازل، وتحجز، وتدفع.
قبل الخروجة بيوم الساعة ٨ بالليل، مجموعتك بتتكشف.
تروح في ميعادها، وتلاقي ناس متقاربين معاك.', 1, true),
  ('faq', 'qa', 'هروح لوحدي؟ مش هتكسف؟', 'كل اللي في المجموعة زيك بالظبط — كلهم جايين لوحدهم.
محدش جاي مع صحابه وانت الغريب الوحيد.
النشاط نفسه بيكسر الجليد، مش هتلاقي نفسك بتدوّر على كلام.', 2, true),
  ('faq', 'qa', 'مين اللي هيكون معايا؟', 'مجموعة صغيرة، متظبطة عشان تبقوا متقاربين — مش ناس مرصوصين مع بعض عشوائي.
بنبص على السن والاهتمامات.
هدفنا تلاقي ناس تقعد معاهم مرتاح.', 3, true),
  ('faq', 'qa', 'إمتى بعرف مجموعتي؟', 'قبل الخروجة بيوم، الساعة ٨ بالليل.
ساعتها بتشوف مين معاك.
قبل كده مفيش حد ظاهر.', 4, true),
  ('faq', 'qa', 'ليه مش بشوفهم قبل كده؟', 'ده مقصود.
نسبوط مش تطبيق تقعد فيه تتفرج على الناس وتحكم عليهم من صورهم.
تيجي وانت مرتاح، وتتعرف عليهم وانتوا بتعملوا حاجة مع بعض.', 5, true),
  ('faq', 'qa', 'فيه عضوية ولا اشتراك شهري؟', 'لأ.
بتدفع للخروجة اللي نازلها وبس.
مفيش أي حاجة بتتخصم منك في الشهر.', 6, true),
  ('faq', 'qa', 'السعر شامل إيه؟', 'السعر شامل النشاط ورسوم الموقع.
الأكل والشرب غالبًا مش شاملين — دول عليك في المكان.
لو خروجة الأكل نفسه هو التجربة، بيبقى شامل، وهنقولك ده في وصفها.', 7, true),
  ('faq', 'qa', 'بدفع إزاي؟', 'تحويل يدوي — فودافون كاش أو إنستاباي.
بترفع صورة التحويل، واحنا نراجعه ونأكدلك الحجز.
مفيش دفع بالكارت لسه.', 8, true),
  ('faq', 'qa', 'الفلوس بترجع إمتى؟', 'لو إحنا لغينا الخروجة، فلوسك بترجع كاملة.
لو إنت لغيت قبلها بـ ٣ أيام أو أكتر، بترجع كاملة برضه.
لو لغيت قبلها بأقل من ٣ أيام، بتتحسبلك رصيد تستخدمه في خروجة تانية.', 9, true),
  ('faq', 'qa', 'أنا بنت — فيه خروجات بنات بس؟', 'أيوه، فيه خروجات بنات بس بشكل ثابت.
وتقدري تفتحي واحدة بنفسك لو حابة.', 10, true),
  ('faq', 'qa', 'لو حد ضايقني؟', 'اللي يضايق حد بيتشال في نفس اللحظة وحسابه بيتقفل.
وفيه رقم طوارئ تكلمنا عليه وقت الخروجة.
راحتك وأمانك قبل أي حاجة.', 11, true),
  ('faq', 'qa', 'فيه تصوير في الخروجات؟', 'التصوير بإذن بس.
والصور ما بتتنشرش غير لما اللي فيها يوافقوا.', 12, true),
  ('faq', 'qa', 'إزاي حد ياخد رقمي؟', 'محدش بياخد رقمك من غير ما توافق.
بعد الخروجة كل واحد بيقول عايز يشوف مين تاني.
الشات بيتفتح بس لو الاتنين اختاروا بعض — ومحدش بيعرف اختياراتك.', 13, true),
  ('faq', 'qa', 'أقدر أفتح خروجة بنفسي؟', 'أيوه.
تختار نوعها وميعادها ومكانها، واحنا نجيبلك الناس.
اللي بيفتح الخروجة اسمه «صاحب الخروجة»، وهو عضو عادي زيك.', 14, true),
  ('faq', 'qa', 'لو فتحت خروجة، هشوف مين حاجز؟', 'هتشوف الأعداد بس.
الأسامي بتظهرلك وقت الكشف زي أي حد تاني.
السرية شغّالة عليك انت كمان.', 15, true),
  ('faq', 'qa', 'لو محدش حجز في خروجتي؟', 'تقدر تلغيها في أي وقت طول ما محدش دفع.
مفيش أي التزام عليك.', 16, true),
  ('faq', 'qa', 'الخروجة اللي من نسبوط والخروجة اللي من عضو، فيه فرق؟', 'الاتنين في نفس القايمة، وكل واحدة مكتوب عليها مين فتحها.
اللي من نسبوط فيها حد مننا بيستقبلكم.
اللي من عضو، صاحب الخروجة هو اللي ماسكها — وبرضه ليها نفس القواعد ونفس الضمان.', 17, true);

-- ===== فقرات about =====
delete from content_blocks where page_slug = 'about' and ref is null;
insert into content_blocks (page_slug, kind, heading_ar, body_ar, sort, is_active) values
  ('about', 'section', 'المشكلة', 'القاهرة كبيرة، وفيها كل حاجة ممكن تعملها.
بس بعد سن معيّن، تعرف حد جديد بقى صعب.
عندك أصحاب، بس مش دايمًا فاضيين، والخروجة الحلوة بتقف على سؤال واحد: «مع مين؟».', 1, true),
  ('about', 'section', 'اللي بنعمله', 'نسبوط نادي خروجات مع ناس جدد.
كل أسبوع فيه خروجات نازلة — بتختار اللي يعجبك، وتحجز، وتلاقي نفسك مع مجموعة صغيرة متقاربة.
مش بار زحمة، ومش جروب واتساب فيه ٢٠٠ واحد. خروجة محددة، بميعاد محدد، بناس محددين.', 2, true),
  ('about', 'section', 'ليه المجموعة بتتكشف قبلها بيوم بس', 'عشان تيجي وانت مرتاح.
مش عايزينك تقعد قبلها بأسبوع تتفرج على صور الناس وتحكم عليهم.
تشوف مجموعتك قبلها بيوم، وتيجي، وتتعرف عليهم على الأرض.', 3, true),
  ('about', 'section', 'ليه أي حد يقدر يفتح خروجة', 'احنا مش عايزين ننظّم كل حاجة للناس.
اللي عارف مكان حلو، أو نفسه يعمل حاجة ومش لاقي مين يعملها معاه، يفتح خروجة بنفسه.
هو يختار، واحنا نجيبله الناس.', 4, true),
  ('about', 'section', 'حاجة مهمة نقولها بصراحة', 'نسبوط مش تطبيق تقابل فيه ناس عشان أي حاجة تانية.
مفيش صور قبل الكشف، ومحدش بياخد رقم حد إلا لو الاتنين عايزين.
الحكاية كلها إنك تخرج مرتاح مع ناس شبهك.', 5, true),
  ('about', 'section', 'احنا مين', 'اكتب هنا مين إنتوا بصوتك انت — من غير ما تخترع فريق ولا تاريخ.
الفقرة دي مقفولة عن الناس لحد ما تكتبها وتفتحها من اللوحة.', 6, false);

-- ===== فقرات terms =====
delete from content_blocks where page_slug = 'terms' and ref is null;
insert into content_blocks (page_slug, kind, heading_ar, body_ar, sort, is_active) values
  ('terms', 'section', 'احنا بنقدّم إيه', 'نسبوط بيساعدك تحجز مكان في خروجة مع ناس تانيين.
احنا مش شركة رحلات ومش بننظّم رحلات سياحية.
الخروجة ممكن تكون من نسبوط، وممكن تكون من عضو فتحها بنفسه.', 1, true),
  ('terms', 'section', 'السن والتسجيل', 'عشان تسجّل وتحجز، لازم يكون سنك ١٨ سنة أو أكتر.
بتسجّل ببياناتك الصح، وانت مسؤول عن اللي بيتعمل من حسابك.', 2, true),
  ('terms', 'section', 'بياناتك', 'بنجمع بياناتك اللي محتاجينها عشان تحجز وتوصلك الخروجة (زي اسمك ووسيلة تواصلك).
بنستخدمها في تشغيل الخدمة بس.
مش بنبيع بياناتك لأي حد.', 3, true),
  ('terms', 'section', 'قواعد السلوك', 'احترام الناس شرط أساسي.
اللي يضايق حد، أو يتصرف تصرف غلط، بيتشال من الخروجة على طول وحسابه بيتقفل.
القرار ده مننا، ومش بنرجع فيه في الحالات دي.', 4, true),
  ('terms', 'section', 'الدفع وتأكيد الحجز', 'الدفع بتحويل يدوي، وبترفع صورة التحويل.
بنراجع التحويل، والحجز بيبقى مؤكد لما نأكده لك.
قبل التأكيد، مكانك مش محجوز بشكل نهائي.', 5, true),
  ('terms', 'section', 'الإلغاء والاسترداد', 'لو لغيت قبل الخروجة بـ ٣ أيام أو أكتر، فلوسك بترجع كاملة.
لو لغيت قبلها بأقل من ٣ أيام، بيتحسبلك رصيد تستخدمه بعدين.
الرصيد صالح [مدة صلاحية الرصيد — من صاحب الموقع] من تاريخ الإلغاء.', 6, true),
  ('terms', 'section', 'لو نسبوط لغى', 'ساعات بنضطر نلغي خروجة (طقس، أو ظرف في المكان، أو عدد أقل من اللازم).
في الحالة دي فلوسك بترجع كاملة.
أو تقدر تحوّلها لخروجة تانية لو حبيت.', 7, true),
  ('terms', 'section', 'الصور والخصوصية', 'التصوير في الخروجات بإذن بس.
الصور ما بتتنشرش غير لما اللي فيها يوافقوا.
لو مش عايز تظهر في أي صورة، قولنا واحنا نلتزم.', 8, true),
  ('terms', 'section', 'خروجات الأعضاء', 'لما عضو يفتح خروجة، هو «صاحب الخروجة» ومسؤول عن اللي بيقوله عنها (الميعاد والمكان والوصف).
نسبوط بيوفّر الحجز والقواعد والضمان.
لو حصل أي مخالفة للقواعد في خروجة عضو، بنطبّق نفس الإجراءات.', 9, true),
  ('terms', 'section', 'حدود المسؤولية', 'احنا بنعمل اللي علينا عشان الخروجة تعدي كويس وآمنة.
بس فيه حاجات برّه إيدنا (تصرفات الناس، ظروف المكان، الطقس).
[الفقرة دي محتاجة صياغة محامي مصري — حدود المسؤولية القانونية.]', 10, true),
  ('terms', 'section', 'تغيير الشروط', 'ممكن نعدّل الشروط دي من وقت للتاني.
لو فيه تغيير مهم، هنعلمك.
استمرارك في استخدام نسبوط بعد التغيير معناه إنك موافق على النسخة الجديدة.', 11, true),
  ('terms', 'section', 'تواصل معانا', 'أي سؤال عن الشروط دي، كلمنا على [وسيلة التواصل — من صاحب الموقع].
احنا موجودين.', 12, true);

-- المقدمات والعناوين
update content_pages set title_ar = 'أسئلة قبل ما تحجز',
       intro_ar = 'أي حاجة في دماغك قبل ما تحجز، غالبًا لقيتها هنا. لو لسه فيه حاجة، كلمنا.'
 where slug = 'faq';

update content_pages set intro_ar = null where slug = 'about';

update content_pages set
       intro_ar = 'دي شروط استخدام نسبوط. لو استخدمت الموقع أو حجزت خروجة، يبقى انت موافق عليها.',
       is_active = false
 where slug = 'terms';

-- ===== القاعدة رقم ١ — الصياغة النهائية =====
update content_blocks
   set heading_ar = 'كل خروجة ليها حد ماسكها',
       body_ar = 'كل خروجة ليها صاحب — يا إما عضو فتحها، يا إما حد من نسبوط.
هو اللي بيستقبل المجموعة وبيتأكد إن كل حاجة ماشية.
لو عندك أي سؤال قبل الخروجة، هو أول حد تكلمه.'
 where page_slug = 'rules' and kind = 'numbered' and sort = 1;


-- ===== قوالب الرسايل — المتغيّرات مطابقة لـ CORE =====
update notification_templates set body_ar = 'تمام يا {{1}}، مكانك محجوز.
{{2}} — {{3}}.
هتعرف مجموعتك قبلها بيوم الساعة 8 بالليل.
لو حصل أي تغيير من ناحيتنا، فلوسك بترجع كاملة.' where key = 'booking_confirmed';
update notification_templates set body_ar = 'يا {{1}}، مجموعتك بقت جاهزة.
{{2}} — بكرة {{3}}.
افتح الشات وشوف مين معاك: {{4}}
نشوفك هناك.' where key = 'group_reveal';
update notification_templates set body_ar = 'بكرة خروجتك.
{{1}} — الساعة {{2}}.
المكان: {{3}}.
مجموعتك ظهرت — لو لسه مشوفتهاش، افتح الموقع.' where key = 'reminder_24h';
update notification_templates set body_ar = 'فاضل 3 ساعات.
{{1}} هيكون مستنيك عند {{2}}.
اتطمن على وقتك، ونشوفك.' where key = 'reminder_3h';
update notification_templates set body_ar = 'للأسف لغينا {{1}}.
فلوسك كاملة رجعت، وزودنالك رصيد اعتذار.
آسفين على ده.' where key = 'cancelled_by_us';
update notification_templates set body_ar = 'خبر حلو — بقى فيه مكان في {{1}}.
المكان محجوزلك لفترة قصيرة، احجز قبل ما يروح لحد تاني: {{2}}' where key = 'waitlist_promoted';
update notification_templates set body_ar = 'وصلت؟ قولنا رأيك في {{1}} — دقيقة واحدة بس.
وآخر سؤال أهم واحد: عايز تشوف مين تاني؟ محدش هيعرف إجابتك إلا لو هو كمان قال نفس الكلام.
{{2}}' where key = 'review_request';
update notification_templates set body_ar = 'الصور بقت جاهزة: {{1}}
ومعاها كوبون 10% لسبوطتك الجاية.
الصور اللي انت فيها مش هتتنشر لبرّه من غير إذنك.' where key = 'photos_ready';
update notification_templates set body_ar = 'وحشتنا.
{{1}} بيسأل عليك، وفيه {{2}} الأسبوع ده لو نفسك تيجي.
تعالى شوف اللي فايتك.' where key = 'win_back';
update notification_templates set body_ar = 'انت و{{1}} اخترتوا بعض.
الشات بينكم بقى مفتوح — ابدأ الكلام: {{2}}' where key = 'mutual_match';
update notification_templates set body_ar = 'خروجات الأسبوع بقت نازلة.
فيه حاجات جديدة — من نسبوط ومن أعضاء زيك.
شوف اللي يعجبك واحجز مكانك: {{1}}' where key = 'weekly_schedule';
update notification_templates set body_ar = 'استلمنا تحويلك يا {name}.
بنراجعه دلوقتي ونأكدلك مكانك في وقت قصير.
هيوصلك إيميل تاني بالتأكيد.' where key = 'transfer_received';
update notification_templates set body_ar = 'يا {name}، التحويل مظبطش معانا.
ممكن المبلغ غلط، أو الصورة مش واضحة.
ابعتلنا صورة التحويل تاني أو حوّل من جديد وارفعها — ومكانك متحجوزلك لحد ما نراجع.' where key = 'transfer_rejected';
update notification_templates set body_ar = 'تمام يا {name}، كارت الشغل بتاعك اتفعّل.
معاك {n} أيام شغل.
أول واحد إمتى؟ {link}' where key = 'work_pass_activated';
update notification_templates set body_ar = 'يا {name}، كارتك بينتهي بعد {days} أيام وفاضل فيه {n}.
استخدمهم قبل ما يروحوا: {link}' where key = 'work_pass_expiring';
update notification_templates set body_ar = 'يا {name}، فاضل في كارتك يوم واحد.
تحب تجدده وتفضل محجوز من غير ما تقطع؟ {link}' where key = 'work_pass_low';
update notification_templates set body_ar = 'يا {name}، معادك {day} جه بس كارتك خلص.
تحب تدفع الجلسة دي لوحدها؟ {link}' where key = 'work_no_pass_balance';
update notification_templates set body_ar = 'تمام يا {name}، حجزناك يوم {day} زي كل أسبوع.
{venue} — 10 الصبح.
لو مش هتعرف، ألغِ من هنا: {link}' where key = 'work_recurring_booked';
update notification_templates set body_ar = 'خد بالك يا {name} — مكان سبوطة الشغل يوم {day} اتغيّر.
المكان الجديد: {venue}.
نفس الوقت. نشوفك هناك.' where key = 'work_venue_changed';
update notification_templates set body_ar = 'عارف إن فيه سبوطة شغل التلات؟
أول مرة بـ 60.
جرّب يوم شغل جنب ناس بتشتغل واحكم بنفسك: {link}' where key = 'work_first_time_offer';
update notification_templates set body_ar = 'انت و{name} عايزين تشتغلوا سوا.
تحبوا تتكلموا؟ {link}' where key = 'work_collab_match';

-- ⚠ `auth_code` مسيبينه: الإيميل بتاع رمز الدخول **مش** بيتقرا من الجدول
--   ده — نصه متحطوط في `src/lib/server/mailer.ts` وبيتبعت من مسار OTP
--   مباشرة. تعديل الصف ده ما بيغيّرش حاجة يشوفها العضو.

-- ===== رسايل «القسم مقفول» =====
update feature_flags set off_message_ar = 'الحجز مقفول دلوقتي — بنجهّز خروجات الأسبوع الجاي، ارجعلنا قريب.' where key = 'booking';
update feature_flags set off_message_ar = 'اللعبة مقفولة دلوقتي — هترجع تشتغل قريب.' where key = 'game';
update feature_flags set off_message_ar = 'الخريطة مقفولة دلوقتي — بنحدّثها وترجع قريب.' where key = 'map';
update feature_flags set off_message_ar = 'الغامضة مقفولة دلوقتي — استنانا، جايالك حاجة حلوة قريب.' where key = 'mystery';
update feature_flags set off_message_ar = 'الشات مقفول دلوقتي — هيرجع يشتغل قريب.' where key = 'chat';
update feature_flags set off_message_ar = 'دعوة أصحابك موقوفة دلوقتي — هترجع قريب.' where key = 'referral';
update feature_flags set off_message_ar = 'سبوطات الشغل مقفولة دلوقتي — راجعة قريب.' where key = 'work_sbota';
update feature_flags set off_message_ar = 'فتح الخروجات مقفول دلوقتي — هيفتح تاني قريب.' where key = 'member_sbota';


-- ===== اختبار =====
create or replace function test_brief_content()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  test := '0084 · الأسئلة فيها 17 سؤال';
  select count(*) into n from content_blocks where page_slug='faq' and kind='qa' and is_active;
  if n = 17 then result := 'نجح'; else result := format('فشل — %s', n); end if;
  return next;

  test := '0084 · «مين إحنا» فيها 5 فقرات ظاهرة + واحدة مقفولة للمالك';
  select count(*) into n from content_blocks where page_slug='about' and is_active;
  if n = 5 then result := 'نجح'; else result := format('فشل — %s ظاهرة', n); end if;
  return next;

  test := '0084 · الشروط مقفولة عن الناس (لسه فيها خانات فاضية)';
  if exists (select 1 from content_pages where slug='terms' and not is_active) then
    result := 'نجح — مقفولة، والرابط مش بيظهر في الذيل';
  else result := 'فشل — 🔴 الشروط منشورة وفيها [خانات] فاضية'; end if;
  return next;

  test := '0084 · مفيش خانة فاضية في صفحة منشورة';
  select count(*) into n from content_blocks b
    join content_pages p on p.slug = b.page_slug
   where b.is_active and p.is_active and b.body_ar like '%[%—%من صاحب الموقع]%';
  if n = 0 then result := 'نجح'; else result := format('فشل — 🔴 %s فقرة فيها خانة فاضية ومنشورة', n); end if;
  return next;

  test := '0084 · القاعدة رقم ١ ما بقتش تقول «كابتن في كل سبوطة»';
  select count(*) into n from content_blocks
   where page_slug='rules' and body_ar like '%مفيش خروجة من غير كابتن%';
  if n = 0 then result := 'نجح'; else result := 'فشل'; end if;
  return next;

  test := '0084 · مفيش قالب رسايل فيه {{2}} وهو مش في CORE';
  select count(*) into n from notification_templates
   where key in ('transfer_received','transfer_rejected') and body_ar like '%{{%';
  if n = 0 then result := 'نجح — بيستعملوا {name}';
  else result := format('فشل — 🔴 %s قالب هيوصل فيه فراغ', n); end if;
  return next;

  test := '0084 · mutual_match بيستعمل الرابط';
  if (select body_ar from notification_templates where key='mutual_match') like '%{{2}}%' then
    result := 'نجح';
  else result := 'فشل — 🔴 الشات بيتفتح والعضو مش لاقي لينك'; end if;
  return next;

  test := '0084 · رسايل القفل الـ8 اتحدّثت';
  select count(*) into n from feature_flags where off_message_ar like '%—%';
  if n >= 8 then result := format('نجح — %s', n); else result := format('فشل — %s', n); end if;
  return next;
end;
$$;

comment on function test_brief_content() is
  'بتتأكد إن محتوى البريف وصل صح ومفيش خانة فاضية منشورة. select * from test_brief_content();';

revoke execute on function test_brief_content() from public, anon, authenticated;

