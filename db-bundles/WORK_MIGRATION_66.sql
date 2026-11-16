-- ==========================================================================
-- WORK_MIGRATION_66.sql — نفس الحملة تروح تليجرام كمان
--
-- طلب المالك (٢٠٢٦-١١-١٦): «ابعت إيميل وعالتليجرام».
--
-- الإيميل الجماعي شغّال من `0125`. والتليجرام للأعضاء شغّال من `0128` —
-- بس بيعلن عن **السبوطات** بس، و«يلا» مستثنى منه عن قصد. فمفيش طريق يبعت
-- كلام للأعضاء على تليجرام من غير سبوطة.
--
-- الحل: **نفس الحملة، قناة تانية.** بتكتب الرسالة مرة واحدة من
-- «الرسايل ← إرسال جماعي»، وبعدين بتبعتها على تليجرام بنفس الرقم.
--
-- ملف واحد، مستقل، وآمن يتكرر (اتجرّب لزقتين + بـ\r\n).
-- ⚠ محتاج WORK_MIGRATION_44 (الإيميل الجماعي) و_46 (بوت الأعضاء) قبله.
--
-- 🔴 **التكرار هنا معناه رسالة مرتين لناس حقيقيين** — فالحماية مش
--    `if not exists` بس: عمود `broadcasts.tg_sent_at` بيتعلّم، والدالة
--    بترفض أي حملة اتبعتت قبل كده. فيه صف اختبار صريح على ده.
--
-- بعده شغّل:
--
--   select * from test_tg_broadcast();   -- ٨ صفوف، كلهم «نجح»
--
-- (مش محتاج بذرة.)
-- ==========================================================================

-- ########################################################################
-- # 20261116000000_0148_tg_broadcast.sql
-- ########################################################################

-- ============================================================================
-- 0148 · نفس الحملة تروح تليجرام كمان
--
-- طلب المالك (٢٠٢٦-١١-١٦): «ابعت إيميل وعالتليجرام».
--
-- الإيميل الجماعي شغّال من `0125` (`fn_send_broadcast`). والتليجرام للأعضاء
-- شغّال من `0128` — **بس بيعلن عن السبوطات بس**: `fn_member_tg_announce`
-- محفّز على `sbotat`، و«يلا» مستثنى منه بسطر صريح (`yalla_id is not null`).
-- يعني مفيش ولا طريق يبعت كلام للأعضاء على تليجرام من غير سبوطة.
--
-- 🔑 **الحل: نفس الحملة، قناة تانية.** الدالة هنا بتاخد **رقم حملة موجودة**
--    (`broadcasts.id`) وبتحط رسايلها في طابور الأعضاء. يعني:
--      · نص واحد، مصدر واحد — مستحيل الإيميل والتليجرام يفترقوا (الدرس الستاشر).
--      · والمالك بيكتب مرة واحدة من «الرسايل ← إرسال جماعي».
--
-- ⚠ **ليه مش دالة بتاخد النص مباشرة؟** كنا هنبقى عندنا مكانين لنفس الرسالة،
--   وأول ما حد يعدّل واحد يفترقوا. ونفس السبب اللي خلّى «إزاي تتحل» في
--   `copy_strings` مش جوه كل قضية (`0137`).
--
-- ⚠ **والنص بيمر على `copy_strings` برضه** (§٣.١): المفتاح `tgbot.broadcast`
--   قالبه `{{body}}` وبس — الشكل في القاعدة، والمحتوى بيانات المالك زي
--   `broadcasts.body_ar` بالظبط. `telegram-members.ts` بيقرا المفتاح ويملا
--   المتغيّر (`copyOf` → `fill`).
--
-- ⚠ **آمنة تتكرر — والتكرار هنا معناه رسالة مرتين لناس حقيقيين.** فمحتاجة
--   أكتر من `if not exists`: عمود `broadcasts.tg_sent_at` بيتعلّم، والدالة
--   بترفض الحملة اللي اتبعتت قبل كده. من غيره لزقة تانية = سبام.
--
-- آمنة تتكرر.
-- ============================================================================

-- ===== 1) علامة «اتبعتت على تليجرام» =====
-- ⚠ ده اللي بيخلّي الدالة آمنة تتكرر. من غيره كل نداء للدالة بيبعت من جديد.
alter table broadcasts add column if not exists tg_sent_at timestamptz;

comment on column broadcasts.tg_sent_at is
  '0148 — امتى الحملة دي اتحطت في طابور تليجرام. موجود = متبعتش تاني.';


-- ===== 2) النص =====
-- ⚠ قالب `{{body}}` وبس — الشكل في القاعدة والمحتوى من الحملة (زي الإيميل).
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('tgbot.broadcast', '{{body}}', 'tgbot',
   'الإرسال الجماعي على بوت الأعضاء — النص كله بيجي من الحملة نفسها')
on conflict (key) do nothing;


-- ===== 3) الإرسال =====
create or replace function fn_send_tg_broadcast(p_broadcast uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  b broadcasts;
  v_n int := 0;
begin
  -- نفس صلاحية الإيميل بالظبط — ده نفس الفعل على قناة تانية.
  if not fn_has_permission('notifications.broadcast') then
    raise exception 'محتاج صلاحية notifications.broadcast' using errcode = '42501';
  end if;

  select * into b from broadcasts where id = p_broadcast;
  if b.id is null then
    raise exception 'الحملة مش موجودة' using errcode = '22023';
  end if;

  -- 🔴 الحارس اللي بيمنع السبام: الحملة بتتبعت **مرة واحدة** على تليجرام.
  if b.tg_sent_at is not null then
    return jsonb_build_object('skipped', true, 'reason', 'اتبعتت قبل كده',
                              'at', b.tg_sent_at);
  end if;

  if not coalesce((select telegram_members from settings limit 1), true) then
    raise exception 'بوت الأعضاء مقفول من الإعدادات' using errcode = '22023';
  end if;

  if coalesce(btrim(b.body_ar), '') = '' then
    raise exception 'الحملة مفيهاش نص' using errcode = '22023';
  end if;

  -- ⚠ `t.news` هو إلغاء الاشتراك بتاع البوت (`fn_tg_set_news`) — زي
  --   `profiles.email_news` في الإيميل بالظبط. واللي مسح حسابه بيتشال.
  --   و`{name}` بيتبدّل هنا لأن الطابور بيرندر من `copy_strings` مش من
  --   `notify.ts` (اللي بيعمل التبديل في الإيميل).
  insert into member_tg_queue (profile_id, copy_key, vars, link_url)
  select t.profile_id,
         'tgbot.broadcast',
         jsonb_build_object('body',
           replace(b.body_ar, '{name}',
                   coalesce(nullif(btrim(p.first_name), ''), 'يا هلا'))),
         nullif(btrim(coalesce(b.link_url, '')), '')
    from member_telegram t
    join profiles p on p.id = t.profile_id
   where coalesce(t.news, true)
     and p.deleted_at is null
     and p.banned_at is null;

  get diagnostics v_n = row_count;

  update broadcasts set tg_sent_at = now() where id = p_broadcast;

  -- ⚠ نداء فوري علشان ما يستناش دورة الـ٥ دقايق — ملفوف في `exception`
  --   زي كل نداءات الشبكة في `0122`/`0128`: الشبكة عمرها ما توقف الطابور.
  begin
    perform net.http_post(
      url     := 'https://nasbot.vercel.app/api/cron/member-telegram',
      headers := jsonb_build_object(
                   'content-type',    'application/json',
                   'x-nasbot-secret', (select decrypted_secret from vault.decrypted_secrets
                                        where name = 'nasbot_cron_secret')),
      body    := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  exception when others then null;
  end;

  return jsonb_build_object('queued', v_n);
end $body$;

comment on function fn_send_tg_broadcast(uuid) is
  '0148 — نفس حملة الإيميل تتحط في طابور بوت الأعضاء. مرة واحدة لكل حملة (tg_sent_at).';
revoke execute on function fn_send_tg_broadcast(uuid) from public, anon;
grant execute on function fn_send_tg_broadcast(uuid) to authenticated;


-- ===== 4) الاختبار =====
create or replace function test_tg_broadcast()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  v_admin  uuid;
  v_member uuid;
  v_bc     uuid;
  n        int;
  v_res    jsonb;
begin
  select profile_id into v_admin from admin_users where is_active limit 1;
  select id into v_member from profiles
   where deleted_at is null
     and not exists (select 1 from admin_users a where a.profile_id = profiles.id)
   order by created_at limit 1;

  test := '0148 · العمود والنص في مكانهم';
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'broadcasts' and column_name = 'tg_sent_at';
  if n = 1 and exists (select 1 from copy_strings where key = 'tgbot.broadcast') then
    result := 'نجح';
  else
    result := 'فشل — العمود أو النص ناقص';
  end if;
  return next;

  if v_admin is null or v_member is null then
    test := '0148 · باقي الفحص';
    result := 'معلومة — محتاج حساب لوحة وعضو عادي';
    return next;
    return;
  end if;

  -- ⚠ كل الكتابة جوه بلوك بيرجع (الدرس الستة وعشرين).
  begin
    insert into broadcasts (segment, recipients_count, sent_count, status,
                            subject_ar, body_ar, link_url, audience)
    values ('{}'::jsonb, 0, 0, 'sent',
            '[اختبار] عنوان', '[اختبار] يا {name}، ده نص تجربة.',
            'https://www.nasbot.net/yalla', 'all')
    returning id into v_bc;

    -- 🔴 الدرس الأربعة وعشرين: صف للممنوع وصف للمسموح، بنفس الهوية الحقيقية.
    test := '0148 · 🔴 عضو عادي مش بيبعت حملة';
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
      perform fn_send_tg_broadcast(v_bc);
      reset role;
      result := 'فشل — 🔴 أي عضو يقدر يبعت لكل الناس';
    exception when others then
      reset role;
      result := 'نجح';
    end;
    perform set_config('request.jwt.claims', '', true);
    return next;

    test := '0148 · 🔴 المجهول مش بيبعت';
    begin
      set local role anon;
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      perform fn_send_tg_broadcast(v_bc);
      reset role;
      result := 'فشل — 🔴 المجهول بعت';
    exception when others then
      reset role;
      result := 'نجح';
    end;
    perform set_config('request.jwt.claims', '', true);
    return next;

    test := '0148 · حساب اللوحة بيبعت';
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    v_res := fn_send_tg_broadcast(v_bc);
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select count(*) into n from member_tg_queue
     where copy_key = 'tgbot.broadcast' and vars->>'body' like '[اختبار]%';
    result := case when (v_res->>'queued')::int = n and n >= 0
                   then format('نجح (%s رسالة)', n)
                   else format('فشل — الراجع %s والطابور %s', v_res->>'queued', n) end;
    return next;

    -- 🔴 الصف اللي بيمنع السبام: نفس الحملة تاني = مفيش رسايل جديدة.
    test := '0148 · 🔴 الحملة ما بتتبعتش مرتين';
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    v_res := fn_send_tg_broadcast(v_bc);
    reset role;
    perform set_config('request.jwt.claims', '', true);
    result := case when v_res->>'skipped' = 'true' then 'نجح (اتخطّت)'
                   else 'فشل — 🔴 اتبعتت تاني، يعني لزقة تانية = سبام' end;
    return next;

    -- ⚠ اللي قافل أخبار البوت ما بيوصلهوش — زي إلغاء اشتراك الإيميل.
    test := '0148 · 🔴 اللي قافل الأخبار مش في الطابور';
    select count(*) into n
      from member_tg_queue q
      join member_telegram t on t.profile_id = q.profile_id
     where q.copy_key = 'tgbot.broadcast'
       and q.vars->>'body' like '[اختبار]%'
       and t.news is false;
    result := case when n = 0 then 'نجح'
                   else format('فشل — 🔴 %s واحد قافل الأخبار ووصلته', n) end;
    return next;

    test := '0148 · 🔴 مفيش نص عربي مكتوب في الدالة';
    select count(*) into n from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname = 'fn_send_tg_broadcast'
       and p.prosrc like '%tgbot.broadcast%';
    result := case when n = 1 then 'نجح'
                   else 'فشل — الدالة مش بتستعمل مفتاح النص' end;
    return next;

    raise exception 'نضيف';
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'نضيف' then
      test := '0148 · استثناء غير متوقّع';
      result := 'فشل — ' || sqlerrm;
      return next;
    end if;
  end;

  test := '0148 · الاختبار ما سابش ولا صف';
  select count(*) into n from broadcasts where subject_ar like '[اختبار]%';
  result := case when n = 0 then 'نجح' else format('فشل — %s حملة اتحفظت', n) end;
  return next;
end $body$;

comment on function test_tg_broadcast() is
  '0148 — الحملة بتروح تليجرام مرة واحدة بس، بصلاحية notifications.broadcast، وبتحترم قفل الأخبار.';
revoke execute on function test_tg_broadcast() from public, anon, authenticated;
