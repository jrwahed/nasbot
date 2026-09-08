-- الاهتمامات العشرين — نفس القايمة والترتيب اللي في ملف التصميم
insert into interests (slug, label_ar, sort) values
  ('photo','تصوير',1), ('food','أكل',2), ('padel','بادل',3), ('running','جري',4),
  ('sea','بحر',5), ('nature','طبيعة',6), ('travel','سفر',7), ('cinema','سينما',8),
  ('music','موسيقى',9), ('reading','قراءة',10), ('games','ألعاب',11), ('cooking','طبخ',12),
  ('art','فن',13), ('history','تاريخ',14), ('tech','تكنولوجيا',15), ('animals','حيوانات',16),
  ('anime','أنيمي',17), ('football','كرة',18), ('business','أعمال',19), ('yoga','يوجا',20)
on conflict (slug) do nothing;

-- قوالب الإشعارات — النصوص بنفس اللهجة من COPY.md
insert into notification_templates (key, channel, body_ar, provider_template_id) values
  ('auth_code','whatsapp','رمزك في نسبوط: {{1}}. ما تديهوش لحد.','nasbot_auth_code'),
  ('booking_confirmed','whatsapp','تمام يا {{1}}، مكانك محجوز. {{2}} — {{3}}. هتعرف مجموعتك قبلها بيوم الساعة 8 بالليل.','nasbot_booking_confirmed'),
  ('group_reveal','whatsapp','مجموعتك جاهزة يا {{1}}. {{2}} بكرة {{3}}. افتح الشات من هنا: {{4}}','nasbot_group_reveal'),
  ('reminder_24h','whatsapp','فاضل يوم على {{1}}. الميعاد {{2}} والمكان {{3}}.','nasbot_reminder_24h'),
  ('reminder_3h','whatsapp','فاضل 3 ساعات. الكابتن {{1}} هيكون مستنيك عند {{2}}.','nasbot_reminder_3h'),
  ('cancelled_by_us','whatsapp','للأسف لغينا {{1}}. فلوسك كاملة رجعت، وزودنالك رصيد اعتذار.','nasbot_cancelled_by_us'),
  ('waitlist_promoted','whatsapp','فضي مكان في {{1}}. لو لسه عايز، احجز من هنا: {{2}}','nasbot_waitlist_promoted'),
  ('review_request','whatsapp','وصلت؟ قولنا رأيك في {{1}} — دقيقة واحدة بس: {{2}}','nasbot_review_request'),
  ('photos_ready','whatsapp','شكرًا. الصور جاهزة: {{1}} — ومعاها كوبون 10% لسبوطتك الجاية.','nasbot_photos_ready'),
  ('win_back','whatsapp','الكابتن {{1}} بيسأل عليك. في سبوطة {{2}} الأسبوع ده لو نفسك تيجي.','nasbot_win_back'),
  ('mutual_match','whatsapp','أنت و{{1}} اخترتوا بعض. الشات بينكم مفتوح دلوقتي.','nasbot_mutual_match'),
  ('weekly_schedule','whatsapp','جدول الأسبوع الجاي في نسبوط: {{1}}','nasbot_weekly_schedule')
on conflict (key) do nothing;

-- الكوبونات الثابتة
insert into coupons (code, kind, value, first_booking_only) values
  ('AWELMARRA', 'fixed', 6000, true),
  ('SHOKRAN10', 'percent', 10, false)
on conflict (code) do nothing;;
