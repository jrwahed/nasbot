-- ============================================================================
-- 0053 — تضييق قراية المتبادلين على profiles (S3)
--
-- المشكلة: سياسة profiles_mutual_read كانت بتفتح **الصف كامل** لأي متبادل —
-- و RLS مالهاش أعمدة، فاللي اتبادل معاك كان بيقرا phone و email و birth_year
-- و wallet_balance و referral_code و no_show_count و banned_at ... إلخ.
-- ده تسريب بالتصميم، والمشروع كله قايم على إن دي مخفية (fn_group_members).
--
-- الحل: نمسح السياسة خالص. المتبادلون بيشوفوا بعض عن طريق fn_met_before()
-- (0015/0028) — دالة security definer بترجّع الأعمدة الآمنة بس:
--   (profile_id, first_name, persona/type, avatar_path)
-- وهي أصلًا اللي getMetBefore بينادي عليها (src/lib/api.ts). قراية الصورة نفسها
-- من التخزين لسه شغالة عن طريق avatars_mutual_read (fn_is_mutual — بقى سليم بعد 0052).
--
-- مفيش أي قراية مباشرة في src للـ profiles بتاعت طرف تاني بتعتمد على السياسة دي
-- (كل قراية إما .eq('id', uid) لنفسك، أو عن طريق دوال definer) فالمسح آمن.
-- ============================================================================

drop policy if exists profiles_mutual_read on profiles;

-- fn_met_before موجودة وممنوحة لـ authenticated من 0028 — مفيش تغيير محتاجينه فيها.
