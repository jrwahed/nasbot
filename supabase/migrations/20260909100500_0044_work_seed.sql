-- طبقة «الشغل» — 5: البذرة (WORK_PLAN §1.7). كلها on conflict do nothing.

-- ===== 15 مجال =====
insert into professions (key, name_ar, icon_key, color, sort_order) values
  ('design',          'تصميم',          'pen-tool',   '#F4632A', 1),
  ('programming',     'برمجة',          'code',       '#2F80ED', 2),
  ('content_writing', 'كتابة محتوى',    'pencil',     '#9B51E0', 3),
  ('marketing',       'تسويق',          'megaphone',  '#EB5757', 4),
  ('video_editing',   'فيديو ومونتاج',  'film',       '#F2994A', 5),
  ('photography',     'تصوير',          'camera',     '#27AE60', 6),
  ('translation',     'ترجمة',          'languages',  '#2D9CDB', 7),
  ('accounting',      'محاسبة',         'calculator', '#219653', 8),
  ('law',             'قانون',          'scale',      '#4F4F4F', 9),
  ('teaching',        'تدريس',          'book-open',  '#BB6BD9', 10),
  ('consulting',      'استشارات',       'briefcase',  '#56CCF2', 11),
  ('architecture',    'معماري',         'ruler',      '#6FCF97', 12),
  ('audio',           'صوت',            'mic',        '#F2C94C', 13),
  ('data',            'بيانات',         'bar-chart',  '#828282', 14),
  ('other',           'غير كده',        'sparkles',   '#BDBDBD', 15)
on conflict (key) do nothing;

-- ===== 4 أماكن تجريبية (is_active = false لحد ما يتعمل معاهم اتفاق) =====
insert into venues (id, name, kind, area, area_label_ar, address, map_lat, map_lng, is_active) values
  ('55555555-0000-0000-0000-000000000101', '[تجريبي] كافيه شغل — التجمع الخامس', 'cafe_work', 'tagamoa',
   'التجمع', 'شارع التسعين الشمالي، الدور الأول فوق البنك', 30.0210, 31.4390, false),
  ('55555555-0000-0000-0000-000000000102', '[تجريبي] كافيه شغل — المعادي', 'cafe_work', 'maadi',
   'المعادي', 'شارع 9، جنب المترو، الدور الأرضي', 29.9600, 31.2580, false),
  ('55555555-0000-0000-0000-000000000103', '[تجريبي] مساحة عمل مشتركة — الشيخ زايد', 'coworking', 'zayed_october',
   'زايد وأكتوبر', 'محور 26 يوليو، مول أركان، الدور التاني', 30.0390, 30.9950, false),
  ('55555555-0000-0000-0000-000000000104', '[تجريبي] كافيه شغل — مصر الجديدة', 'cafe_work', 'heliopolis_nasr',
   'مصر الجديدة ومدينة نصر', 'شارع بغداد، الكوربة، الدور الأول', 30.0880, 31.3250, false)
on conflict (id) do nothing;

-- ===== مواصفاتهم — الأسعار بالقروش =====
insert into work_venues (venue_id, desks_count, wifi_mbps, wifi_note_ar, power_outlets, noise_level,
                         has_meeting_room, has_parking, has_ac, min_consumption, open_from, open_to,
                         best_days, photos, wholesale_seat_price, notes_ar) values
  ('55555555-0000-0000-0000-000000000101', 12, 80, 'فايبر — ثابت حتى لو الكافيه مليان', 'plenty', 'medium',
   false, true, true, 8000, '09:00', '23:00', array['sat','sun','mon','tue','wed'],
   array['[صورة — الترابيزة الطويلة جنب الشباك]'], 5000, 'ترابيزة الـ12 محجوزة لينا الصبح. الأوردر بيتحاسب كل واحد لوحده.'),
  ('55555555-0000-0000-0000-000000000102', 8, 40, 'كويس الصبح — بيتقل بعد 3 العصر', 'enough', 'quiet',
   false, false, true, 6000, '10:00', '22:00', array['sun','mon','tue','wed','thu'],
   array['[صورة — الركن الهادي في الدور الأرضي]'], 4000, 'المكان صغير — أقصى 8. مفيش باركنج، المترو أقرب.'),
  ('55555555-0000-0000-0000-000000000103', 20, 200, 'خط مخصص + باك أب', 'plenty', 'quiet',
   true, true, true, null, '08:00', '20:00', array['sat','sun','mon','tue','wed','thu'],
   array['[صورة — القاعة الكبيرة]', '[صورة — غرفة الاجتماعات]'], 9000, 'الكرسي باليوم شامل قهوة ومية. غرفة الاجتماعات بحجز قبلها بيوم.'),
  ('55555555-0000-0000-0000-000000000104', 10, 60, 'مستقر', 'enough', 'lively',
   false, false, true, 7000, '09:00', '23:00', array['sat','sun','mon','tue'],
   array['[صورة — الترابيزة الكبيرة جنب الباب]'], 4500, 'صوته عالي بعد 2 — نخلص قبلها.')
on conflict (venue_id) do nothing;

-- ===== قالبين — الأسعار بالقروش =====
insert into sbota_templates (id, slug, name_ar, story_ar, kind, default_price, org_fee, duration_min,
                             min_group, max_group, mood_ar, includes_ar, excludes_ar, is_day, girls_only,
                             hero_photos, meta_prefix_ar, level_ar, is_work, work_config) values
  ('66666666-0000-0000-0000-000000000101', 'sbota-shoghl', 'سبوطة شغل',
   'ستة بيشتغلوا جنب بعض من 10 لـ 3. ساعة غدا واحدة، وربع ساعة شكوى في الآخر. الباقي صمت وشغل.',
   'work', 12000, 2000, 300, 3, 6, 'هادي وشغال',
   array['ترابيزة وكرسي', 'واي فاي', 'الكابتن'], array['الأكل والقهوة (بتحاسب لوحدك)'],
   true, false, array['[صورة — ترابيزة طويلة ولابتوبات]'], 'شغل جنب بعض', 'أي حد', true,
   '{"start":"10:00","end":"15:00","lunch_hour_at":"13:00","complaint_hour_at":"14:30","focus_blocks":[["10:00","11:30"],["11:45","13:00"],["14:00","14:30"]],"desk_type":"shared_table","profession_mix_max":2}'::jsonb),
  ('66666666-0000-0000-0000-000000000102', 'sbota-shoghl-coworking', 'سبوطة شغل — مساحة مشتركة',
   'مكتب لكل واحد، نت مخصوص، وغرفة اجتماعات لو محتاج مكالمة. نفس الجدول: غدا 1، وشكوى 2 ونص.',
   'work', 15000, 2000, 300, 3, 6, 'هادي ومركّز',
   array['مكتب وكرسي', 'نت مخصص', 'قهوة ومية', 'الكابتن'], array['الأكل'],
   true, false, array['[صورة — المكاتب والقاعة]'], 'شغل في مساحة مشتركة', 'أي حد', true,
   '{"start":"10:00","end":"15:00","lunch_hour_at":"13:00","complaint_hour_at":"14:30","focus_blocks":[["10:00","11:30"],["11:45","13:00"],["14:00","14:30"]],"desk_type":"desk","profession_mix_max":2}'::jsonb)
on conflict (slug) do nothing;

-- القالب القديم work-cafe-tagamo3 (kind = work) بقى سبوطة شغل هو كمان،
-- وسبوطاته الموجودة بتاخد is_work (المحفّز بيشتغل على الإدراج بس).
update sbota_templates set is_work = true
where slug = 'work-cafe-tagamo3' and kind = 'work' and not is_work;

update sbotat s set is_work = true
from sbota_templates t
where t.id = s.template_id and t.is_work and not s.is_work;

-- ===== قوالب الإشعارات (§4) — واتساب، نفس اللهجة =====
insert into notification_templates (key, channel, body_ar, provider_template_id, is_active) values
  ('work_recurring_booked',  'whatsapp', 'حجزناك يوم {day} زي كل أسبوع — {venue}، 10 الصبح. لو مش هتعرف، ألغِ من هنا: {link}', 'nasbot_work_recurring_booked', true),
  ('work_no_pass_balance',   'whatsapp', 'معادك {day} جه، بس كارتك خلص. تحب تدفع الجلسة دي لوحدها؟ {link}', 'nasbot_work_no_pass_balance', true),
  ('work_pass_low',          'whatsapp', 'فاضل في كارتك يوم واحد. تحب تجدده؟ {link}', 'nasbot_work_pass_low', true),
  ('work_pass_expiring',     'whatsapp', 'كارتك بينتهي بعد {days} أيام وفاضل فيه {n} — استخدمهم. {link}', 'nasbot_work_pass_expiring', true),
  ('work_collab_match',      'whatsapp', 'أنت و{name} عايزين تشتغلوا سوا. تحبوا تتكلموا؟ {link}', 'nasbot_work_collab_match', true),
  ('work_venue_changed',     'whatsapp', 'مكان سبوطة الشغل يوم {day} اتغيّر لـ {venue}. نفس الوقت.', 'nasbot_work_venue_changed', true),
  ('work_first_time_offer',  'whatsapp', 'عارف إن فيه سبوطة شغل التلات؟ أول مرة بـ 60. {link}', 'nasbot_work_first_time_offer', true),
  -- زيادة عن الخطة: بيتبعت من fn_activate_pass لما الإدارة تعتمد التحويل (نص §2 /shoghl/pass)
  ('work_pass_activated',    'whatsapp', 'كارتك اتفعّل — معاك {n} أيام شغل. أول واحد إمتى؟ {link}', 'nasbot_work_pass_activated', true)
on conflict (key) do nothing;
