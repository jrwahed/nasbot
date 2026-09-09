-- ============================================================================
-- 0058 — إصلاح job_purge علشان المسح فعلًا يحصل (D4 / D19)
--
-- المشكلة:
--   D4) job_purge كان بيحط phone = 'deleted-' || id::text، وده بيكسر
--       profiles_phone_check (phone ~ '^\+201[0125][0-9]{8}$'). أول حساب مستحق
--       للمسح كان بيرمي check violation ويوقّع الدالة كلها → المسح بعد 30 يوم
--       عمره ما بيحصل، و delete from otp_codes بيترجع معاه.
--   D19) referral_code = 'DEL' || left(id::text,3) — و referral_code فريد.
--        3 حروف hex = 4096 احتمال بس → تصادم شبه مؤكد → duplicate key.
--
-- الحل (زي ما المراجعة اقترحت): نخلّي phone و referral_code يقبلوا null (تعديل
-- آمن — مش بيمسح أي بيانات موجودة)، و job_purge بيحطهم null للمحذوفين. null
-- ما بيكسرش لا فحص الصيغة (CHECK بيعدّي على null) ولا قيد الفرادة (null-distinct).
-- والحارس بيبقى «phone is not null» علشان ما يعيدش معالجة المتمسوحين (idempotent).
-- ============================================================================

-- ===== 1) نخلّي الأعمدة تقبل null (بيانات الأحياء ما بتتلمسش) =====
alter table profiles alter column phone         drop not null;
alter table profiles alter column referral_code drop not null;

-- ===== 2) نعيد كتابة job_purge بصيغة بتعدّي القيود =====
create or replace function job_purge()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0;
begin
  delete from otp_codes where created_at < now() - interval '1 day';

  -- البيانات الشخصية بتتمسح، وسجلات الدفع بتفضل للضريبة من غير هوية.
  -- phone/referral_code بيبقوا null (بيعدّوا الصيغة والفرادة)، والحارس
  -- «phone is not null» بيمنع إعادة المعالجة فالدالة idempotent.
  update profiles
  set phone = null,
      email = null,
      first_name = null,
      avatar_path = null,
      wish_text = null,
      type_scores = null,
      referral_code = null
  where deleted_at is not null
    and deleted_at < now() - interval '30 days'
    and phone is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function job_purge() is 'بيمسح رموز التحقق القديمة، وبيجهّل بيانات المحذوفين بعد 30 يوم (phone/referral_code = null) مع الاحتفاظ بسجلات الدفع. idempotent.';
