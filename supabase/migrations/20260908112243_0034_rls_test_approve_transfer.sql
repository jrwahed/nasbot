-- اختبار إضافي: عضو عادي ما يقدرش يأكد تحويله بنفسه
create or replace function test_rls()
returns table (test text, result text)
language plpgsql
set search_path = public
as $$
declare
  a     uuid := '33333333-0000-0000-0000-000000000001';
  b     uuid := '33333333-0000-0000-0000-000000000003';
  adm   uuid := '44444444-0000-0000-0000-000000000001';
  salma uuid := '33333333-0000-0000-0000-000000000005';
  n int; ok boolean; tmp text;
  bid uuid; pid uuid;
begin
  -- تجهيز: حجز ودفعة يدوية لمريم
  insert into bookings (sbota_id, profile_id, status, price_paid, expires_at)
  values ('77777777-0000-0000-0000-000000000004', a, 'pending_payment', 15000, now() + interval '1 hour')
  on conflict (sbota_id, profile_id) do update set status = 'pending_payment'
  returning id into bid;

  insert into payments (booking_id, provider, amount, status, idempotency_key)
  values (bid, 'vodafone_cash', 15000, 'pending_review', 'test:' || bid::text)
  on conflict (idempotency_key) do update set status = 'pending_review'
  returning id into pid;

  set local role authenticated;

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  select count(*) into n from profiles p where p.id = b;
  test := '1 · عضو ما يشوفش ملف ولا صورة عضو تاني';
  result := case when n = 0 then 'نجح' else 'رسب — شاف ' || n end;
  return next;

  select count(*) into n from fn_group_members('aaaaaaaa-0000-0000-0000-000000000001');
  test := '1ب · fn_group_members بترجّع الأسامي من غير صور';
  result := case when n > 0 then 'نجح (' || n || ' عضو)' else 'رسب — مفيش نتيجة' end;
  return next;

  select count(*) into n from pair_affinity;
  test := '2 · محدش بيقرأ pair_affinity';
  result := case when n = 0 then 'نجح' else 'رسب — قرأ ' || n || ' صف' end;
  return next;

  select fn_is_mutual(b) into ok;
  test := '2ب · fn_is_mutual = false قبل التبادل';
  result := case when not ok then 'نجح' else 'رسب' end;
  return next;

  perform set_config('request.jwt.claims', json_build_object('sub',adm,'role','authenticated')::text, true);
  begin
    insert into messages (room_id, sender_id, body)
    values ('99999999-0000-0000-0000-000000000001', adm, 'اختبار');
    result := 'رسب — الكتابة عدّت';
  exception when others then
    result := case when sqlerrm like '%row-level%' or sqlerrm like '%policy%'
                   then 'نجح' else 'رسب — ' || left(sqlerrm,40) end;
  end;
  test := '3 · حد مش عضو ما يكتبش في الغرفة';
  return next;

  perform set_config('request.jwt.claims', json_build_object('sub',salma,'role','authenticated')::text, true);
  select count(*) into n from fn_sbota_address('77777777-0000-0000-0000-000000000002');
  test := '4 · العنوان مخفي عن غير الحاجزين';
  result := case when n = 0 then 'نجح' else 'رسب' end;
  return next;

  perform set_config('request.jwt.claims', json_build_object('sub',a,'role','authenticated')::text, true);
  select count(*) into n from fn_sbota_address('77777777-0000-0000-0000-000000000001');
  test := '4ب · العنوان بيظهر لصاحب الحجز المدفوع';
  result := case when n > 0 then 'نجح' else 'رسب' end;
  return next;

  -- 5 · تصعيد صلاحية في الإلغاء
  begin
    perform fn_cancel_booking('aaaaaaaa-0000-0000-0000-000000000001', 'us', 'محاولة تصعيد');
    select refund_kind::text into tmp from bookings where id='aaaaaaaa-0000-0000-0000-000000000001';
    result := case when tmp = 'full' then 'رسب — العميل اداها us وخد استرداد كامل'
                   else 'نجح — اتعاملت كإلغاء عميل (' || coalesce(tmp,'—') || ')' end;
  exception when others then
    result := 'نجح — اترفضت: ' || left(sqlerrm, 40);
  end;
  test := '5 · العميل ما يقدرش يدّعي «إحنا لغينا»';
  return next;

  -- 6 · العميل ما يقدرش يأكد تحويله بنفسه
  begin
    perform fn_approve_transfer(pid, true, null);
    select status::text into tmp from bookings where id = bid;
    result := case when tmp = 'paid' then 'رسب — العضو أكّد تحويله بنفسه!'
                   else 'نجح — الحجز فضل ' || tmp end;
  exception when others then
    result := 'نجح — اترفضت: ' || left(sqlerrm, 30);
  end;
  test := '6 · العضو ما يقدرش يأكد تحويله بنفسه';
  return next;

  reset role;

  -- تنضيف
  delete from payments where id = pid;
  delete from bookings where id = bid;
end $$;

revoke execute on function test_rls() from public, anon, authenticated;;
