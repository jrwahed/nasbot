-- ============================================================================
-- 0102 — العضو يعرف إنه اتقبل أو اترفض
--
-- ⚠ بوابة `0101` بتقبل وبترفض، بس **العضو ما بيعرفش** — كان لازم يفتح
--    الموقع بنفسه ويلاقي الحالة اتغيّرت. حد بيستنى موافقة ومحدش بيكلمه
--    بيفتكر إنه اترفض.
--
-- القالبين بيمروا من نفس مصرف الإشعارات (`runNotify`)، يعني إيميل بجدولة
-- زي أي قالب تاني.
--
-- ⚠ المتغيّرات لازم تطابق `CORE` في `src/lib/server/notify.ts` بالحرف —
--    لو اتخالفوا **مفيش حاجة بتفشل** والمتغيّر الناقص بيوصل فراغ (درس رابع).
--    الحارس `scripts/check-notify-vars.mjs` جوّه `npm run verify` بيقارنهم.
-- ============================================================================

insert into notification_templates (key, channel, body_ar, provider_template_id, is_active)
values
  ('gate_approved','whatsapp',
'تمام يا {{1}} — انت جوه.
تقدر تشوف السبوطات المفتوحة وتحجز من هنا: {{2}}
وعندك دعوات تجيب بيها ناس تعرفها. الكود في صفحتك.',
   null, true),
  ('gate_rejected','whatsapp',
'يا {{1}}، للأسف مش هنقدر نقبل طلبك دلوقتي.
{{2}}',
   null, true)
on conflict (key) do update set body_ar = excluded.body_ar, is_active = true;

-- ⚠ الإشعار بيتبعت من **جوّه الدالة** مش من الواجهة: القبول والرفض ممكن
--    يحصلوا من أي مكان (لوحة · سكربت · دالة تانية)، ولو الإشعار في الواجهة
--    بس بيفضل فيه طرق بتقبل من غير ما حد يعرف.
create or replace function fn_gate_decide(p_profile uuid, p_ok boolean, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg settings;
  was gate_status_t;
begin
  if not fn_has_permission('people.manage') then
    return 'مش من حقك تقبل أو ترفض';
  end if;

  select * into cfg from settings limit 1;
  select gate_status into was from profiles where id = p_profile;
  if not found then return 'الحساب ده مش موجود'; end if;

  update profiles set
    gate_status     = case when p_ok then 'approved' else 'rejected' end::gate_status_t,
    gate_note       = nullif(btrim(coalesce(p_note, '')), ''),
    gate_decided_at = now(),
    gate_decided_by = auth.uid(),
    invites_left    = case when p_ok then greatest(invites_left, cfg.invites_per_member)
                           else 0 end
  where id = p_profile;

  -- ⚠ مرة واحدة بس: لو ضغطت «اقبله» على حساب مقبول خلاص ما بيتبعتش تاني.
  if was is distinct from (case when p_ok then 'approved' else 'rejected' end)::gate_status_t then
    insert into notifications (profile_id, channel, template_key, payload)
    values (p_profile, 'whatsapp',
            case when p_ok then 'gate_approved' else 'gate_rejected' end,
            jsonb_build_object('note', nullif(btrim(coalesce(p_note,'')), '')));
  end if;

  return null;
end $$;

revoke execute on function fn_gate_decide(uuid, boolean, text) from public, anon;
grant  execute on function fn_gate_decide(uuid, boolean, text) to authenticated;

-- ===== دالة الاختبار =====
create or replace function test_gate_notify()
returns table (test text, result text)
language plpgsql security definer set search_path = public
as $body$
declare n int; body text;
begin
  test := '0102 · القالبين موجودين ونشطين';
  select count(*) into n from notification_templates
   where key in ('gate_approved','gate_rejected') and is_active;
  if n = 2 then result := 'نجح';
  else result := format('فشل — %s من ٢', n); end if;
  return next;

  test := '0102 · قالب القبول فيه الاسم والرابط';
  select body_ar into body from notification_templates where key='gate_approved';
  if body like '%{{1}}%' and body like '%{{2}}%' then result := 'نجح';
  else result := 'فشل — متغيّر ناقص هيوصل فراغ'; end if;
  return next;

  test := '0102 · قالب الرفض فيه السبب';
  select body_ar into body from notification_templates where key='gate_rejected';
  if body like '%{{2}}%' then result := 'نجح';
  else result := 'فشل — العضو هيترفض من غير ما يعرف ليه'; end if;
  return next;

  test := '0102 · fn_gate_decide بتبعت إشعار';
  if (select prosrc from pg_proc where proname='fn_gate_decide')
       like '%insert into notifications%'
    then result := 'نجح';
    else result := 'فشل — 🔴 بيتقبل وبيترفض من غير ما حد يكلمه'; end if;
  return next;

  test := '0102 · وبتبعت مرة واحدة بس';
  if (select prosrc from pg_proc where proname='fn_gate_decide')
       like '%is distinct from%'
    then result := 'نجح';
    else result := 'فشل — كل ضغطة على «اقبله» هتبعت إيميل تاني'; end if;
  return next;
end $body$;

revoke execute on function test_gate_notify() from public, anon, authenticated;
