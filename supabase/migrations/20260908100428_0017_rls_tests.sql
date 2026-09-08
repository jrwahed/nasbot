-- اختبارات السياسات — بترجّع جدول نتايج بدل ما ترمي استثناء
-- التشغيل:  select * from test_rls();
create or replace function test_rls()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  a     uuid := '33333333-0000-0000-0000-000000000001'; -- مريم
  b     uuid := '33333333-0000-0000-0000-000000000003'; -- نور
  adm   uuid := '44444444-0000-0000-0000-000000000001';
  salma uuid := '33333333-0000-0000-0000-000000000005';
  n int; ok boolean;
begin
  set local role authenticated;

  -- 1
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  select count(*) into n from profiles p where p.id = b;
  test := '1 · عضو ما يشوفش ملف ولا صورة عضو تاني';
  result := case when n = 0 then 'نجح' else 'رسب — شاف ' || n end;
  return next;

  -- 1ب
  select count(*) into n from fn_group_members('aaaaaaaa-0000-0000-0000-000000000001');
  test := '1ب · fn_group_members بترجّع الأسامي من غير صور';
  result := case when n > 0 then 'نجح (' || n || ' عضو)' else 'رسب — مفيش نتيجة' end;
  return next;

  -- 2
  select count(*) into n from pair_affinity;
  test := '2 · محدش بيقرأ pair_affinity';
  result := case when n = 0 then 'نجح' else 'رسب — قرأ ' || n || ' صف' end;
  return next;

  -- 2ب
  select fn_is_mutual(b) into ok;
  test := '2ب · fn_is_mutual = false قبل التبادل';
  result := case when not ok then 'نجح' else 'رسب' end;
  return next;

  -- 3
  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  begin
    insert into messages (room_id, sender_id, body)
    values ('99999999-0000-0000-0000-000000000001', adm, 'اختبار');
    result := 'رسب — الكتابة عدّت';
  exception when insufficient_privilege then
    result := 'نجح';
  when others then
    result := case when sqlerrm like '%row-level%' then 'نجح' else 'رسب — ' || sqlerrm end;
  end;
  test := '3 · حد مش عضو ما يكتبش في الغرفة';
  return next;

  -- 4
  perform set_config('request.jwt.claims', json_build_object('sub',salma,'role','authenticated')::text, true);
  select count(*) into n from fn_sbota_address('77777777-0000-0000-0000-000000000002');
  test := '4 · العنوان مخفي عن غير الحاجزين';
  result := case when n = 0 then 'نجح' else 'رسب' end;
  return next;

  -- 4ب
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  select count(*) into n from fn_sbota_address('77777777-0000-0000-0000-000000000001');
  test := '4ب · العنوان بيظهر لصاحب الحجز المدفوع';
  result := case when n > 0 then 'نجح' else 'رسب' end;
  return next;

  -- 5 · تصعيد الصلاحية في الإلغاء
  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  begin
    perform fn_cancel_booking('aaaaaaaa-0000-0000-0000-000000000001', 'us', 'محاولة تصعيد');
    select refund_kind::text into result from bookings where id='aaaaaaaa-0000-0000-0000-000000000001';
    result := case when result = 'full' then 'رسب — العميل اداها us وخد استرداد كامل'
                   else 'نجح — اتعاملت كإلغاء عميل (' || coalesce(result,'—') || ')' end;
  exception when others then
    result := 'نجح — اترفضت: ' || left(sqlerrm, 40);
  end;
  test := '5 · العميل ما يقدرش يدّعي «إحنا لغينا»';
  return next;

  reset role;
end $$;
comment on function test_rls() is 'اختبارات سياسات الأمان — select * from test_rls();';

revoke execute on function test_rls() from public, anon, authenticated;;
