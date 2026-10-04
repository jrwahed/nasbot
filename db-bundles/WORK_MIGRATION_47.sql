-- ============================================================================
-- WORK_MIGRATION_47.sql — «عضو وصّل تليجرام» يوصل لبوت المالك + نصوص الخطوة التانية
--
-- بعد التسجيل على طول العضو بيشوف صفحة «خليك أول واحد يعرف» (/join/telegram)،
-- ولما يوصّل بوت الأعضاء بتوصلك رسالة 📲 على بوت اللوحة.
--
-- ⚠ محتاج WORK_MIGRATION_46 قبله.
--
-- بعده شغّل (لزقة واحدة):
--   do $$ begin perform fn_test_seed_up(); end $$;
--   create temp table _r as select * from test_member_tg_alert();
--   do $$ begin perform fn_test_seed_down(); end $$;
--   select * from _r;                       -- ٣ صفوف «نجح»
-- ============================================================================

-- ##########################################################################
-- # 20261004140000_0129_member_tg_alert.sql
-- ##########################################################################

-- ============================================================================
-- 0129 · «عضو وصّل تليجرام» — رسالة للمالك على بوت اللوحة
--
-- طلب المالك (٢٠٢٦-١٠-٠٤): ربط بوت الأعضاء بقى **الخطوة التانية** بعد
-- التسجيل على طول (`/join/telegram`)، وعايز يعرف على بوته مين وصّل.
--
-- محفّز على `member_telegram`: أول ما `chat_id` يتحط (أو يتغيّر لمحادثة تانية)
-- ← `fn_admin_alert('member_tg', …)`. ملفوف في `exception` — الإشعار عمره ما
-- يوقف الربط. وبيانات الاختبار ما بتبعتش (`fn_alert_is_fixture`).
--
-- ⚠ محتاج 0122 (`fn_admin_alert`) و0128 (`member_telegram`).
-- ⚠ الملف مفيهوش `drop` ولا `delete` عن قصد (`create or replace trigger`) —
--   أداة Supabase MCP بتعلّق على الجمل دي (شوف CLAUDE.md §٨ بوت الأعضاء).
-- آمن يتكرر.
-- ============================================================================

create or replace function fn_alert_member_tg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  begin
    if new.chat_id is null then return null; end if;
    if tg_op = 'UPDATE' and old.chat_id is not distinct from new.chat_id then return null; end if;
    if fn_alert_is_fixture(new.profile_id, null) then return null; end if;
    select count(*) into n from member_telegram where chat_id is not null;
    perform fn_admin_alert('member_tg',
      '📲 ' || fn_alert_who(new.profile_id) || ' وصّل بوت الأعضاء على تليجرام'
      || coalesce(' (@' || nullif(btrim(new.tg_username), '') || ')', '')
      || chr(10) || 'متوصّلين دلوقتي: ' || n,
      '/admin/people');
  exception when others then null;
  end;
  return null;
end;
$$;
revoke execute on function fn_alert_member_tg() from public, anon, authenticated;

create or replace trigger t_alert_member_tg
  after insert or update of chat_id on member_telegram
  for each row execute function fn_alert_member_tg();


-- ===== نصوص الخطوة التانية بعد التسجيل (`/join/telegram`) =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('tg.step.kicker', 'خطوة أخيرة', 'التسجيل', 'فوق العنوان في /join/telegram'),
  ('tg.step.title',  'خليك أول واحد يعرف', 'التسجيل', 'عنوان خطوة تليجرام بعد التسجيل'),
  ('tg.step.body',   'الخروجات بتنزل والأماكن بتخلص بسرعة. وصّل حسابك ببوت نسبوط على تليجرام، وهتوصلك رسالة أول ما خروجة جديدة تنزل.', 'التسجيل', 'نص الخطوة'),
  ('tg.step.how',    'هيفتحلك تليجرام — دوس «Start» وارجع هنا.', 'التسجيل', 'تحت الزرار'),
  ('tg.step.skip',   'مش دلوقتي', 'التسجيل', 'زرار التخطي — تقدر توصّله بعدين من صفحتك'),
  ('tg.step.later',  'تقدر توصّله بعدين من صفحتك.', 'التسجيل', 'تحت زرار التخطي'),
  ('tg.step.done',   'اتوصّلت ✓ — هتوصلك رسالة أول ما خروجة تنزل.', 'التسجيل', 'بعد ما الربط يتم'),
  ('tg.step.next',   'كمّل', 'التسجيل', 'زرار بعد الربط')
on conflict (key) do nothing;

-- ===== الاختبار =====
-- ⚠ محتاج `fn_test_seed_up()` قبله. كل الكتابة بترجع باستثناء متعمّد.
create or replace function test_member_tg_alert()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  f1  uuid := '33333333-0000-0000-0000-000000000001';
  f3  uuid := '33333333-0000-0000-0000-000000000003';
  names text[] := array[
    '0129 · عضو وصّل البوت ← رسالة للمالك',
    '0129 · نفس المحادثة تاني ← مفيش رسالة تانية',
    '0129 · 🔴 بيانات الاختبار ما بتبعتش للمالك'];
  r    text[] := '{}';
  v0   bigint;
  n    int;
  i    int;
begin
  if not exists (select 1 from profiles where id = f3) then
    test := '0129 · رسالة الربط';
    result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next;
    return;
  end if;

  begin
    update settings set telegram_alerts = true;
    select coalesce(max(id), 0) into v0 from admin_alerts;

    -- (١) بنفتح بيانات الاختبار للحظة (زي test_admin_alerts)
    perform set_config('nasbot.alerts_test', 'on', true);
    insert into member_telegram (profile_id, link_token, chat_id, tg_username)
    values (f3, 'test0129aaaaaaaaaaaaaaaa', 999000129, 'tester')
    on conflict (profile_id) do update set chat_id = excluded.chat_id, tg_username = excluded.tg_username;
    select count(*) into n from admin_alerts where id > v0 and kind = 'member_tg';
    r := r || case when n = 1 and exists (select 1 from admin_alerts
                                           where id > v0 and kind = 'member_tg' and body like '%@tester%')
                   then 'نجح' else format('فشل — %s رسالة بدل 1', n) end;

    -- (٢) نفس المحادثة + تحديث خانة تانية
    update member_telegram set chat_id = 999000129, news = false where profile_id = f3;
    select count(*) into n from admin_alerts where id > v0 and kind = 'member_tg';
    r := r || case when n = 1 then 'نجح' else format('فشل — %s رسالة بعد التحديث', n) end;

    -- (٣) من غير علم الاختبار: عضو البذرة ما يبعتش
    perform set_config('nasbot.alerts_test', '', true);
    insert into member_telegram (profile_id, link_token, chat_id)
    values (f1, 'test0129bbbbbbbbbbbbbbbb', 999000130)
    on conflict (profile_id) do update set chat_id = excluded.chat_id;
    select count(*) into n from admin_alerts where id > v0 and kind = 'member_tg';
    r := r || case when n = 1 then 'نجح' else 'فشل — 🔴 عضو اختبار بعت للمالك' end;

    raise exception 'test_member_tg_alert_rollback';
  exception when others then
    if sqlerrm <> 'test_member_tg_alert_rollback' then
      r := r || ('فشل — استثناء: ' || sqlerrm);
    end if;
  end;
  perform set_config('nasbot.alerts_test', '', true);

  for i in 1 .. array_length(r, 1) loop
    test := coalesce(names[i], '0129 · الاختبار');
    result := r[i];
    return next;
  end loop;
end $body$;

comment on function test_member_tg_alert() is
  '0129 — عضو وصّل بوت الأعضاء ← رسالة واحدة للمالك، ومفيش رسايل لبيانات الاختبار.';
revoke execute on function test_member_tg_alert() from public, anon, authenticated;
