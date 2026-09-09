-- ============================================================================
-- 0047 — fn_pair_want: إصلاح «عايز تشوف مين تاني؟»
--
-- العطل (موجود في الإنتاج من أول يوم):
--   src/lib/api.ts → submitReview كانت بتعمل كده لكل واحد متختار:
--     select … from pair_affinity where a_id = … and b_id = …   ← RLS بترجّع صفر
--     لو مفيش صف  → insert                                       ← بيضرب في unique(a_id,b_id)
--     لو فيه صف    → update                                      ← بيعدّي على صفر صفوف
--
--   سياسات 0009 على pair_affinity هي:
--     pair_insert_own  · insert
--     pair_update_own  · update
--     pair_admin_read  · select (للإدارة بس)
--   يعني العضو مالوش سياسة select خالص. وبوستجريس بتطبّق سياسة الـ select
--   على الصفوف اللي الـ UPDATE بيدوّر عليها، فالـ update بيلاقي صفر صفوف،
--   والـ select الأول بيرجّع فاضي فالكود بيروح على الـ insert وبيضرب في
--   القيد الفريد. النتيجة: **تاني واحد في أي زوج مش بيقدر يسجّل رغبته أبدًا**،
--   فـ mutual_at عمره ما اتحط ولا حد اتوصل بحد.
--
-- الحل: نفس حل طبقة الشغل بالحرف (fn_work_want في 0042) — دالة
-- security definer بتكتب جهة اللي بينادي بس، من غير ما يقرا الصف.
--
-- ملاحظة: مفيش fn_pair_collab_state هنا لأن الموجود من 0007 هو
-- fn_is_mutual(other_id) boolean — ده نظير fn_work_collab_state بالظبط،
-- ومفيش داعي لدالة تانية بنفس المعنى.
-- ============================================================================

create or replace function fn_pair_want(p_other uuid, p_booking_id uuid default null, p_want boolean default true)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me     uuid := auth.uid();
  v_a    uuid;
  v_b    uuid;
  mutual boolean;
begin
  if me is null then raise exception 'لازم تسجل دخول'; end if;
  if p_other is null or p_other = me then raise exception 'اختار حد تاني'; end if;

  -- الجدول بيطلب a_id < b_id (قيد pair_affinity_ordered)
  if me < p_other then v_a := me; v_b := p_other; else v_a := p_other; v_b := me; end if;

  insert into pair_affinity (a_id, b_id, a_wants_b, b_wants_a, met_in_booking_id)
  values (v_a, v_b, (v_a = me and p_want), (v_b = me and p_want), p_booking_id)
  on conflict (a_id, b_id) do update
    set a_wants_b = case when v_a = me then p_want else pair_affinity.a_wants_b end,
        b_wants_a = case when v_b = me then p_want else pair_affinity.b_wants_a end,
        met_in_booking_id = coalesce(pair_affinity.met_in_booking_id, excluded.met_in_booking_id);

  select mutual_at is not null into mutual from pair_affinity where a_id = v_a and b_id = v_b;
  return case when mutual then 'mutual' else 'none' end;
end;
$$;
comment on function fn_pair_want(uuid, uuid, boolean) is
  'بيسجّل رغبتي أنا بس في «أشوف الشخص ده تاني» — وبيرجّع mutual/none. ما بيكشفش اختيار الطرف التاني. دي طريقة الكتابة الوحيدة اللي بتشتغل (RLS بتمنع القراءة فالـ upsert المباشر بيضرب).';

revoke execute on function fn_pair_want(uuid, uuid, boolean) from public, anon;
grant  execute on function fn_pair_want(uuid, uuid, boolean) to authenticated, service_role;
