-- ============================================================================
-- الجزء ٣ — طبقة «الشغل»: المطابقة + إصلاح «عايز تشوف مين تاني؟»
--
-- الزقه في SQL Editor **مرة واحدة** واضغط Run. مفيش أنواع (enum) جديدة هنا،
-- فمفيش سبب يتقسّم — الملف كله معاملة واحدة وده تمام.
--
-- ⚠ لازم الجزء ١ والجزء ٢ يكونوا اتشغّلوا قبله (الهجرات 0039 → 0046).
-- آمن يتكرر: كله create or replace، ومفيش ولا صف بيتمسح.
--
-- فيه إيه:
--   0047 · fn_pair_want          — إصلاح عطل حقيقي في «عايز تشوف مين تاني؟»
--                                  (الطرف التاني كان مستحيل يسجّل رغبته،
--                                   فـ mutual_at عمره ما اتحط ولا حد اتوصل بحد)
--   0048 · fn_build_work_matching — مطابقة سبوطات الشغل work_v1 (WORK_PLAN §3)
--   0049 · test_pair_want()       — اختبارات بتثبت العطل وبتثبت الإصلاح
--
-- بعد ما يخلص شغّل ده:      select * from test_pair_want();
-- لازم كل الصفوف تطلع «نجح» (ولو حاجة رسبت بترمي استثناء بالسبب).
--
-- ولتجربة المطابقة الجديدة: من لوحة /admin/matching اختار سبوطة is_work
-- ودوس «شغّل المطابقة» — هتلاقي النسخة في جدول التشغيلات مكتوبة work_v1.
-- ============================================================================


-- ############################################################################
-- # 20260909120000_0047_pair_want.sql
-- ############################################################################

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

-- ############################################################################
-- # 20260909120100_0048_work_matching.sql
-- ############################################################################

-- ============================================================================
-- 0048 — fn_build_work_matching: مطابقة سبوطات الشغل (work_v1) · WORK_PLAN §3
--
-- نسخة **منفصلة** عن fn_build_matching (WORK_PLAN §8 #3: لو الأصلية اتغيّرت
-- لازم تتراجع دي بإيدك). نفس شكل المخرجات بالظبط علشان لوحة المطابقة و
-- fn_reveal يقروها من غير أي تعديل:
--     proposal -> 'groups' -> [ { members: [uuid كنص], why: نص, … } ]
-- الفرق الوحيد في الشكل إن algorithm_version = 'work_v1' مش 'v{رقم}'،
-- وإن فيه مفتاح زيادة 'deferred' (fn_reveal بتعدّي على أي مفتاح زيادة).
--
-- القواعد السبعة زي ما القسم 3 بيقول:
--   1) أقصى settings.work_profession_mix_max (2) من نفس المجال في المجموعة — صارم
--   2) تجانس work_style — صارم: الأقلية صفر أو ≥ 2 (ممنوع 5 هادي + 1 كلامي).
--      depends حياد. ومكافأة لما الكل يبقى نفس الأسلوب.
--   3) السن **مش معيار** خالص — مفيش قيد الـ 6 سنين ولا نقاط سن
--   4) بنات بس — فلتر صارم زي fn_build_matching بالحرف
--   5) سنين الخبرة — نقاط تنويع خفيفة، مش قيد
--   6) work_no_show_count >= 2 → ما ياخدش مقعد إلا لو الحجز paid_with_pass
--   7) «ليه المجموعة دي؟» بلغة الشغل — مجالات + أسلوب
--
-- اللي ما ينفعش يتحط (مجاله اتملى، أو أسلوبه هيسيبه لوحده، أو غيابه بيمنعه)
-- بيتحط في proposal->'deferred' من غير مجموعة، وبيظهر في اللوحة تحت
-- «من غير مجموعة» علشان اللي بيراجع يقرر بإيده.
-- ============================================================================

create or replace function public.fn_build_work_matching(p_sbota uuid)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_role     text;
  v_set      settings%rowtype;
  v_s        sbotat%rowtype;
  v_t        sbota_templates%rowtype;

  v_min      int;                -- أقل عدد في المجموعة (من التمبليت)
  v_max      int;                -- أكبر عدد في المجموعة (من التمبليت)
  v_mix      int;                -- أقصى عدد من نفس المجال (قاعدة 1)
  v_blockat  constant int := 2;  -- حد الغياب اللي بيمنع المقعد (قاعدة 6)

  v_n        int;                -- المؤهلين (بعد استبعاد الغياب)
  v_all      int;                -- كل الحاجزين الدافعين
  v_k        int;                -- عدد المجموعات
  v_target   int[];
  v_size     int[];

  v_i        int;
  v_j        int;
  v_pass     int;
  v_base     int;
  v_rem      int;
  v_round    int;

  v_c        record;             -- الشخص اللي بنوزّعه دلوقتي
  v_cstyle   text;
  v_opstyle  text;
  v_best     int;
  v_best_sc  numeric;
  v_score    numeric;
  v_same     int;
  v_opp      int;
  v_profn    int;
  v_expn     int;
  v_aff      int;

  v_lone_id   uuid;
  v_style_min text;
  v_swap_id   uuid;
  v_sil       int;
  v_cha       int;

  v_cnt      int;
  v_dep      int;
  v_profs    int;
  v_explv    int;
  v_gg       int;
  v_homog    boolean;
  v_flags    jsonb;
  v_why      text;
  v_head     text;
  v_groups   jsonb := '[]'::jsonb;
  v_notes    jsonb := '[]'::jsonb;
  v_defer    jsonb := '[]'::jsonb;
  v_members  jsonb;
  v_run      uuid;
  v_by       text;
begin
  -- ------------------------------------------------------------ الصلاحية
  -- نفس شرط fn_build_matching بالحرف — نفس المفتاح ونفس استثناء الخادم.
  v_role := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  );
  if v_role <> 'service_role' and not fn_has_permission('matching.run') then
    raise exception 'مش من صلاحيتك تشغّل المطابقة';
  end if;

  -- ------------------------------------------------------------ المدخلات
  select * into v_set from settings limit 1;
  if not found then
    raise exception 'مفيش صف إعدادات في القاعدة — المطابقة بتقرا منه قواعدها';
  end if;

  select * into v_s from sbotat where id = p_sbota;
  if not found then
    raise exception 'السبوطة دي مش موجودة';
  end if;
  if not coalesce(v_s.is_work, false) then
    raise exception 'دي مش سبوطة شغل — استعمل fn_build_matching';
  end if;
  if exists (select 1 from sbota_groups where sbota_id = p_sbota) then
    raise exception 'السبوطة دي اتكشفت خلاص ومجموعاتها اتعملت — مينفعش نعيد المطابقة';
  end if;

  select * into v_t from sbota_templates where id = v_s.template_id;

  v_max := greatest(coalesce(v_t.max_group, v_s.capacity), 1);
  v_min := greatest(coalesce(v_t.min_group, 1), 1);
  if v_min > v_max then v_min := v_max; end if;
  v_mix := greatest(coalesce(v_set.work_profession_mix_max, 2), 1);

  -- ------------------------------------------------------------ المرشحين
  drop table if exists pg_temp.tmp_wcands;
  create temp table tmp_wcands on commit drop as
  select
    b.profile_id,
    p.gender,
    p.profession_id,
    -- silent/chatty بس هما اللي بيتحسبوا في قاعدة التجانس. depends والفاضي حياد.
    case when p.work_style::text in ('silent', 'chatty') then p.work_style::text end as style,
    p.years_experience::text as exp_lv,
    coalesce(p.work_no_show_count, 0) as wns,
    coalesce(b.paid_with_pass, false) as by_pass,
    -- قاعدة 6: الغياب بيمنع المقعد إلا لو الحجز اتدفع بكارت
    (coalesce(p.work_no_show_count, 0) >= v_blockat and not coalesce(b.paid_with_pass, false)) as blocked
  from bookings b
  join profiles p on p.id = b.profile_id
  where b.sbota_id = p_sbota
    and b.status in ('paid', 'attended');

  select count(*) into v_all from pg_temp.tmp_wcands;
  if v_all = 0 then
    raise exception 'مفيش حد حاجز ودافع في السبوطة دي علشان نقسّمه';
  end if;

  -- قاعدة 4: سبوطة البنات تفضل بنات — نفس رسالة fn_build_matching
  if v_s.girls_only then
    select count(*) into v_i from pg_temp.tmp_wcands
    where gender is distinct from 'female';
    if v_i > 0 then
      raise exception 'السبوطة دي بنات بس، وفيه % حجز مش لبنت — راجع الحجوزات الأول', v_i;
    end if;
  end if;

  -- قاعدة 6: اللي غيابه وصل الحد ومش دافع بكارت — برّه التوزيع من الأول
  select coalesce(jsonb_agg(jsonb_build_object(
           'profile_id', profile_id,
           'code', 'work_no_show',
           'ar', format('غاب %s مرات في سبوطات الشغل والحجز ده مش بكارت', wns))
         order by profile_id), '[]'::jsonb)
  into v_defer
  from pg_temp.tmp_wcands where blocked;

  select count(*) into v_n from pg_temp.tmp_wcands where not blocked;
  if v_n = 0 then
    raise exception 'كل الحاجزين متوقّفين بسبب الغياب — مفيش حد نقسّمه';
  end if;

  -- التاريخ الحلو بتاع الشغل: الأزواج اللي اختاروا بعض في work_affinity
  drop table if exists pg_temp.tmp_waff;
  create temp table tmp_waff on commit drop as
  select wa.a_id as a, wa.b_id as b, greatest(wa.weight, 1) as w
  from work_affinity wa
  where wa.a_wants_b and wa.b_wants_a
    and exists (select 1 from pg_temp.tmp_wcands x where x.profile_id = wa.a_id and not x.blocked)
    and exists (select 1 from pg_temp.tmp_wcands x where x.profile_id = wa.b_id and not x.blocked)
  union all
  select wa.b_id, wa.a_id, greatest(wa.weight, 1)
  from work_affinity wa
  where wa.a_wants_b and wa.b_wants_a
    and exists (select 1 from pg_temp.tmp_wcands x where x.profile_id = wa.a_id and not x.blocked)
    and exists (select 1 from pg_temp.tmp_wcands x where x.profile_id = wa.b_id and not x.blocked);

  -- ------------------------------------------------------- عدد المجموعات
  -- نفس حساب fn_build_matching بالحرف
  v_k := ceil(v_n::numeric / v_max)::int;
  while v_k > 1
    and v_n < v_k * v_min
    and ceil(v_n::numeric / (v_k - 1))::int <= v_max
  loop
    v_k := v_k - 1;
  end loop;

  v_target := array_fill(0, array[v_k]);
  v_base := v_n / v_k;
  v_rem  := v_n % v_k;
  for v_i in 1..v_k loop
    v_target[v_i] := v_base + (case when v_i <= v_rem then 1 else 0 end);
  end loop;
  v_size := array_fill(0, array[v_k]);

  drop table if exists pg_temp.tmp_wplace;
  create temp table tmp_wplace (
    profile_id uuid primary key,
    grp int not null
  ) on commit drop;

  -- ------------------------------------------------------------- التوزيع
  -- الترتيب: الأسلوب الأندر الأول علشان يتلم في مجموعة واحدة بدل ما يتفرّق
  -- واحد واحد (ودي بالظبط الحالة اللي القاعدة 2 بتمنعها)، وبعديه المجالات
  -- الأكتر تكرارًا لأنها أصعب حاجة في التوزيع (سقف المجال)، والـ id في الآخر
  -- علشان النتيجة تبقى ثابتة. **مفيش ترتيب بالسن — القاعدة 3.**
  for v_c in
    with style_n as (
      select style, count(*) as n from pg_temp.tmp_wcands
      where not blocked and style is not null group by style
    ),
    prof_n as (
      select profession_id, count(*) as n from pg_temp.tmp_wcands
      where not blocked and profession_id is not null group by profession_id
    )
    select cd.*
    from pg_temp.tmp_wcands cd
    left join style_n sn on sn.style = cd.style
    left join prof_n  pn on pn.profession_id = cd.profession_id
    where not cd.blocked
    order by
      case when cd.style is null then 1 else 0 end,   -- الحياد في الآخر
      coalesce(sn.n, 0) asc,
      cd.style,
      coalesce(pn.n, 0) desc,
      cd.profile_id
  loop
    v_cstyle  := v_c.style;
    v_opstyle := case v_cstyle when 'silent' then 'chatty' when 'chatty' then 'silent' end;

    v_best := null;
    v_best_sc := null;

    -- جولتين: الأولى بتحترم الحجم المستهدف، والتانية بتقبل لحد الحد الأقصى.
    -- سقف المجال صارم في الاتنين — لو ما فيش مكان، الشخص بيتأجّل.
    for v_pass in 1..2 loop
      for v_i in 1..v_k loop
        if v_pass = 1 then
          continue when v_size[v_i] >= v_target[v_i];
        else
          continue when v_size[v_i] >= v_max;
        end if;

        -- قاعدة 1 (صارمة): سقف المجال
        select count(*) into v_profn
        from pg_temp.tmp_wplace pl
        join pg_temp.tmp_wcands c on c.profile_id = pl.profile_id
        where pl.grp = v_i
          and v_c.profession_id is not null
          and c.profession_id = v_c.profession_id;
        continue when v_c.profession_id is not null and v_profn >= v_mix;

        -- قاعدة 2 (نقاط هنا، والصرامة بتتظبّط في جولة الإصلاح تحت)
        select
          count(*) filter (where c.style = v_cstyle),
          count(*) filter (where c.style = v_opstyle)
        into v_same, v_opp
        from pg_temp.tmp_wplace pl
        join pg_temp.tmp_wcands c on c.profile_id = pl.profile_id
        where pl.grp = v_i;

        v_score := 5 * v_same - 8 * v_opp;

        -- تنويع المجالات (مكافأة خفيفة فوق السقف الصارم)
        v_score := v_score - 3 * v_profn;

        -- قاعدة 5: تنويع سنين الخبرة — مكافأة خفيفة بس
        select count(*) into v_expn
        from pg_temp.tmp_wplace pl
        join pg_temp.tmp_wcands c on c.profile_id = pl.profile_id
        where pl.grp = v_i
          and v_c.exp_lv is not null
          and c.exp_lv = v_c.exp_lv;
        if v_c.exp_lv is not null and v_expn = 0 then
          v_score := v_score + 2;
        end if;

        -- اللي اختاروا بعض في «عايز تشتغل مع مين»
        select coalesce(sum(f.w), 0) into v_aff
        from pg_temp.tmp_waff f
        join pg_temp.tmp_wplace pl on pl.profile_id = f.b and pl.grp = v_i
        where f.a = v_c.profile_id;
        v_score := v_score + v_set.match_mutual_weight * v_aff;

        -- كسر التعادل: الأفضى بياخد
        v_score := v_score + (v_target[v_i] - v_size[v_i]);

        if v_best_sc is null or v_score > v_best_sc then
          v_best_sc := v_score;
          v_best := v_i;
        end if;
      end loop;
      exit when v_best is not null;
    end loop;

    if v_best is null then
      -- مفيش مقعد من غير ما نكسر سقف المجال — بيتأجّل واللوحة بتقرر
      v_defer := v_defer || jsonb_build_object(
        'profile_id', v_c.profile_id,
        'code', 'profession_cap',
        'ar', format('كل المجموعات فيها %s من مجاله خلاص', v_mix));
      continue;
    end if;

    insert into pg_temp.tmp_wplace (profile_id, grp) values (v_c.profile_id, v_best);
    v_size[v_best] := v_size[v_best] + 1;
  end loop;

  -- ------------------------------------------------ إصلاح قاعدة التجانس
  -- القاعدة الصارمة (قاعدة 2): في أي مجموعة، الأقلية بين silent و chatty
  -- لازم تبقى صفر أو 2 فأكتر — يعني ممنوع 5 هادي + 1 كلامي. التوزيع الجشع
  -- ممكن يسيب واحد لوحده، فبنصلّحها هنا بتبديل واحد-بواحد مع مجموعة تانية:
  -- بندوّر على أي تبديل بيخلّي **المجموعتين** مظبوطين وسقف المجال محترم في
  -- الاتنين. لو مفيش تبديل ممكن خالص بنأجّل صاحب الأسلوب الوحيد.
  -- كل لفّة بتقفل مجموعة واحدة على الأقل ومش بتكسر غيرها، فاللفّات محدودة.
  for v_round in 1..(v_k + 1) loop
    select g.grp, g.sil, g.cha
    into v_i, v_sil, v_cha
    from (
      select pl.grp,
             count(*) filter (where c.style = 'silent')::int as sil,
             count(*) filter (where c.style = 'chatty')::int as cha
      from pg_temp.tmp_wplace pl
      join pg_temp.tmp_wcands c on c.profile_id = pl.profile_id
      group by pl.grp
    ) g
    where least(g.sil, g.cha) = 1
    order by g.grp
    limit 1;
    exit when not found;

    -- الأسلوب اللي صاحبه لوحده
    v_style_min := case when v_sil <= v_cha then 'silent' else 'chatty' end;

    -- كل التبديلات الممكنة (واحد من مجموعتنا × واحد من مجموعة تانية)،
    -- ومنها بناخد اللي بيخلّي المجموعتين مظبوطين. الترتيب ثابت علشان
    -- نفس المدخلات تدّي نفس النتيجة كل مرة.
    with mem as (
      select pl.grp, c.profile_id, c.style, c.profession_id
      from pg_temp.tmp_wplace pl
      join pg_temp.tmp_wcands c on c.profile_id = pl.profile_id
    ),
    gc as (
      select grp,
             count(*) filter (where style = 'silent')::int as sil,
             count(*) filter (where style = 'chatty')::int as cha
      from mem group by grp
    ),
    pairs as (
      select
        x.profile_id as x_id, x.profession_id as x_prof,
        y.profile_id as y_id, y.profession_id as y_prof, y.grp as j,
        gi.sil - (case when x.style = 'silent' then 1 else 0 end)
               + (case when y.style = 'silent' then 1 else 0 end) as isil,
        gi.cha - (case when x.style = 'chatty' then 1 else 0 end)
               + (case when y.style = 'chatty' then 1 else 0 end) as icha,
        gj.sil - (case when y.style = 'silent' then 1 else 0 end)
               + (case when x.style = 'silent' then 1 else 0 end) as jsil,
        gj.cha - (case when y.style = 'chatty' then 1 else 0 end)
               + (case when x.style = 'chatty' then 1 else 0 end) as jcha
      from mem x
      join gc  gi on gi.grp = x.grp
      join mem y  on y.grp <> x.grp
      join gc  gj on gj.grp = y.grp
      where x.grp = v_i
    )
    select p.x_id, p.y_id, p.j
    into v_lone_id, v_swap_id, v_j
    from pairs p
    where least(p.isil, p.icha) <> 1
      and least(p.jsil, p.jcha) <> 1
      -- سقف المجال بعد التبديل، في المجموعتين
      and (p.y_prof is null or (
            select count(*) from mem m
            where m.grp = v_i and m.profile_id <> p.x_id and m.profession_id = p.y_prof
          ) < v_mix)
      and (p.x_prof is null or (
            select count(*) from mem m
            where m.grp = p.j and m.profile_id <> p.y_id and m.profession_id = p.x_prof
          ) < v_mix)
    order by least(p.isil, p.icha), least(p.jsil, p.jcha), p.j, p.x_id, p.y_id
    limit 1;

    if found then
      update pg_temp.tmp_wplace set grp = v_j where profile_id = v_lone_id;
      update pg_temp.tmp_wplace set grp = v_i where profile_id = v_swap_id;
    else
      -- مفيش تبديل بيصلّح الحالتين — صاحب الأسلوب الوحيد بيتأجّل
      select c.profile_id into v_lone_id
      from pg_temp.tmp_wplace pl
      join pg_temp.tmp_wcands c on c.profile_id = pl.profile_id
      where pl.grp = v_i and c.style = v_style_min
      order by c.profile_id
      limit 1;

      delete from pg_temp.tmp_wplace where profile_id = v_lone_id;
      v_size[v_i] := v_size[v_i] - 1;
      v_defer := v_defer || jsonb_build_object(
        'profile_id', v_lone_id,
        'code', 'style_alone',
        'ar', 'أسلوبه في الشغل هيسيبه لوحده وسط المجموعة — القاعدة بتمنع واحد بس مختلف');
    end if;
  end loop;

  -- ------------------------------------------------- الاقتراح والملاحظات
  for v_i in 1..v_k loop
    select
      count(*)::int,
      count(*) filter (where c.style = 'silent')::int,
      count(*) filter (where c.style = 'chatty')::int,
      count(*) filter (where c.style is null)::int,
      count(distinct c.profession_id)::int,
      count(distinct c.exp_lv)::int,
      count(*) filter (where c.gender = 'female')::int,
      coalesce(jsonb_agg(pl.profile_id order by pl.profile_id), '[]'::jsonb)
    into v_cnt, v_sil, v_cha, v_dep, v_profs, v_explv, v_gg, v_members
    from pg_temp.tmp_wplace pl
    join pg_temp.tmp_wcands c on c.profile_id = pl.profile_id
    where pl.grp = v_i;

    continue when coalesce(v_cnt, 0) = 0;

    v_homog := (v_sil = 0 or v_cha = 0) and (v_sil + v_cha) > 0;

    -- ------- العلامات: اللي محتاج عين بشرية
    v_flags := '[]'::jsonb;

    if v_cnt < v_min then
      v_flags := v_flags || jsonb_build_object(
        'code', 'size_below_min',
        'ar', format('المجموعة %s واحد بس والتمبليت عايز %s على الأقل', v_cnt, v_min));
    end if;
    if v_cnt > v_max then
      v_flags := v_flags || jsonb_build_object(
        'code', 'size_above_max',
        'ar', format('المجموعة %s واحد والتمبليت أقصاه %s', v_cnt, v_max));
    end if;
    if least(v_sil, v_cha) = 1 then
      -- حزام أمان: مفروض جولة الإصلاح قفلت دي خالص
      v_flags := v_flags || jsonb_build_object(
        'code', 'style_minority_of_one',
        'ar', 'فيها واحد بس أسلوبه مختلف — القاعدة بتمنع كده، راجعها بإيدك');
    end if;
    if v_profs = 0 and v_cnt > 0 then
      v_flags := v_flags || jsonb_build_object(
        'code', 'no_professions',
        'ar', 'محدش فيها كاتب مجاله — قاعدة المجالات ما اشتغلتش عليها');
    end if;
    if v_dep = v_cnt then
      v_flags := v_flags || jsonb_build_object(
        'code', 'all_neutral',
        'ar', 'كلهم «حسب اليوم» — مفيش أسلوب واضح نبني عليه');
    end if;

    -- ------- «ليه المجموعة دي؟» بلغة الشغل (قاعدة 7)
    v_head := case
                when v_profs = 0 then format('%s على ترابيزة واحدة', v_cnt)
                when v_profs = 1 then 'كلكم في نفس المجال'
                when v_profs = 2 then 'مجالين مختلفين'
                else format('%s مجالات مختلفة', v_profs)
              end;

    v_why := v_head || '، ' || case
      when v_sil > 0 and v_cha = 0 then 'وكلكم قلتوا إنكم بتحبوا تشتغلوا في هدوء الصبح.'
      when v_cha > 0 and v_sil = 0 then 'وكلكم قلتوا إن الشغل عندكم بيمشي مع الكلام.'
      when v_sil > 0 and v_cha > 0 then 'وفيكم اللي بيحب الهدوء وفيكم اللي بيحب الكلام — الترابيزة واسعة للاتنين.'
      else 'وكلكم قلتوا إن الجو عندكم بيفرق من يوم للتاني.'
    end;

    if v_explv >= 2 then
      v_why := v_why || ' وخبراتكم مش واحدة، وده بيخلي الكلام أنفع.';
    end if;

    v_groups := v_groups || jsonb_build_array(jsonb_build_object(
      'members', v_members,          -- fn_reveal بتقرا ده
      'why',     v_why,              -- fn_reveal بتحطه في sbota_groups.why_ar
      'index',   v_i,
      'size',    v_cnt,
      'stats',   jsonb_build_object(
        'professions', v_profs, 'silent', v_sil, 'chatty', v_cha,
        'depends', v_dep, 'exp_levels', v_explv, 'style_homogeneous', v_homog,
        'girls', v_gg, 'boys', v_cnt - v_gg),
      'flags',   v_flags
    ));
  end loop;

  -- ------- ملاحظات على مستوى السبوطة
  if v_n < v_min then
    v_notes := v_notes || jsonb_build_object(
      'code', 'too_few_people',
      'ar', format('المؤهلين %s بس والتمبليت عايز %s في المجموعة — مفيش تقسيم صح ممكن',
                   v_n, v_min));
  end if;
  if jsonb_array_length(v_defer) > 0 then
    v_notes := v_notes || jsonb_build_object(
      'code', 'deferred',
      'ar', format('%s واحد اتأجّلوا وما اتحطوش في مجموعة — شوفهم تحت «من غير مجموعة»',
                   jsonb_array_length(v_defer)));
  end if;
  if not exists (select 1 from pg_temp.tmp_wcands where profession_id is not null and not blocked) then
    v_notes := v_notes || jsonb_build_object(
      'code', 'no_professions',
      'ar', 'محدش في السبوطة دي كاتب مجاله، فقاعدة خلط المجالات ما اشتغلتش');
  end if;

  -- ------------------------------------------------------------- التسجيل
  select coalesce(nullif(btrim(pr.first_name), ''), pr.id::text)
  into v_by from profiles pr where pr.id = auth.uid();
  v_by := coalesce(v_by, 'system');

  insert into matching_runs (sbota_id, ran_by, algorithm_version, proposal)
  values (
    p_sbota,
    v_by,
    'work_v1',
    jsonb_build_object(
      'groups',      v_groups,
      'notes',       v_notes,
      'deferred',    v_defer,
      'sbota_id',    p_sbota,
      'is_work',     true,
      'girls_only',  v_s.girls_only,
      'head_count',  v_n,
      'booked_count', v_all,
      'group_count', v_k,
      'size_bounds', jsonb_build_object('min', v_min, 'max', v_max),
      'built_at',    now(),
      'settings',    jsonb_build_object(
        'work_profession_mix_max', v_mix,
        'work_no_show_block',      v_blockat,
        'match_mutual_weight',     v_set.match_mutual_weight,
        'age_is_a_rule',           false,
        'algorithm_version',       'work_v1')
    )
  )
  returning id into v_run;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'matching.build_work', 'matching_runs', v_run,
          jsonb_build_object('sbota_id', p_sbota, 'groups', v_k, 'people', v_n,
                             'deferred', jsonb_array_length(v_defer)));

  return v_run;
end;
$function$;

comment on function public.fn_build_work_matching(uuid) is
  'مطابقة سبوطات الشغل (work_v1 — WORK_PLAN §3): سقف المجال، تجانس الأسلوب، السن مش معيار، بنات بس، تنويع الخبرة، والغياب بيمنع المقعد. بتسجّل اقتراح في matching_runs زي fn_build_matching بالظبط.';

revoke all on function public.fn_build_work_matching(uuid) from public, anon;
grant execute on function public.fn_build_work_matching(uuid) to authenticated, service_role;

-- ############################################################################
-- # 20260909120200_0049_pair_want_tests.sql
-- ############################################################################

-- ============================================================================
-- 0049 — test_pair_want(): إثبات العطل وإثبات الإصلاح
--
-- نفس نمط 0017 / 0046: دالة security invoker بتتشغّل بمفتاح الخدمة أو من
-- SQL Editor، بتجهّز بياناتها وبتنضّفها، وبترمي استثناء لو حاجة رسبت:
--     select * from test_pair_want();
--
-- (ما بتلمسش test_rls() ولا test_work_rls() — التلاتة بيشتغلوا جنب بعض.)
-- ============================================================================

create or replace function test_pair_want()
returns table (test text, result text)
language plpgsql
set search_path = public
as $$
declare
  a   uuid := '33333333-0000-0000-0000-000000000001'; -- مريم
  b   uuid := '33333333-0000-0000-0000-000000000003'; -- نور
  lo  uuid;
  hi  uuid;
  n   int;
  tmp text;
  ok_ boolean;
  failures text := '';
begin
  if not exists (select 1 from profiles where id = a)
  or not exists (select 1 from profiles where id = b) then
    raise exception 'البذرة مش موجودة — الاختبار محتاج مريم ونور';
  end if;

  if a < b then lo := a; hi := b; else lo := b; hi := a; end if;

  -- ===== تجهيز: نبدأ من صفحة بيضا =====
  delete from pair_affinity where a_id = lo and b_id = hi;

  -- ===== كمريم =====
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  -- 1 · اختياري لوحدي ما بيعملش تبادل
  select fn_pair_want(b, null) into tmp;
  test := '1 · fn_pair_want بترجّع none قبل ما التاني يختارني';
  result := case when tmp = 'none' then 'نجح' else 'رسب — ' || coalesce(tmp, 'null') end;
  if tmp is distinct from 'none' then failures := failures || test || ' · '; end if;
  return next;

  -- 2 · العضو ما بيقراش pair_affinity خالص (ده أصل العطل)
  select count(*) into n from pair_affinity;
  test := '2 · العضو ما بيقراش pair_affinity';
  result := case when n = 0 then 'نجح' else 'رسب — قرأ ' || n || ' صف' end;
  if n <> 0 then failures := failures || test || ' · '; end if;
  return next;

  -- ===== كنور — الطرف التاني، وهو اللي كان العطل بيقع عنده =====
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

  -- 3 · الطريقة القديمة (١): update مباشر بيعدّي على صفر صفوف
  --     لأن بوستجريس بتطبّق سياسة الـ select على الصفوف اللي الـ UPDATE بيقراها،
  --     ومفيش سياسة select للأعضاء على الجدول ده.
  begin
    update pair_affinity
    set a_wants_b = case when lo = b then true else a_wants_b end,
        b_wants_a = case when hi = b then true else b_wants_a end
    where a_id = lo and b_id = hi;
    get diagnostics n = row_count;
    result := case when n = 0
                   then 'نجح — اتأكدنا إن العطل حقيقي'
                   else 'رسب — عدّل ' || n || ' صف' end;
  exception when others then
    -- ولا حتى بيوصل للصف — نفس النتيجة العملية
    result := 'نجح — اترفض: ' || left(sqlerrm, 40);
  end;
  test := '3 · الطريقة القديمة: UPDATE المباشر ما بيوصلش للصف';
  if result not like 'نجح%' then failures := failures || test || ' · '; end if;
  return next;

  -- 4 · الطريقة القديمة (٢): الـ insert بيضرب في unique(a_id, b_id)
  begin
    insert into pair_affinity (a_id, b_id, a_wants_b, b_wants_a)
    values (lo, hi, lo = b, hi = b);
    result := 'رسب — الإدراج عدّى، يبقى العطل مش زي ما وصفناه';
  exception when unique_violation then
    result := 'نجح — اترفض بـ unique(a_id, b_id) زي ما متوقع';
  when others then
    result := 'نجح — اترفض: ' || left(sqlerrm, 40);
  end;
  test := '4 · الطريقة القديمة: INSERT بيضرب في القيد الفريد';
  if result not like 'نجح%' then failures := failures || test || ' · '; end if;
  return next;

  -- 5 · الإصلاح: fn_pair_want بتكتب جهة نور وبتفتح التبادل
  select fn_pair_want(a, null) into tmp;
  test := '5 · fn_pair_want من الطرف التاني بترجّع mutual';
  result := case when tmp = 'mutual' then 'نجح' else 'رسب — ' || coalesce(tmp, 'null') end;
  if tmp is distinct from 'mutual' then failures := failures || test || ' · '; end if;
  return next;

  select fn_is_mutual(a) into ok_;
  test := '5ب · fn_is_mutual = true عند نور';
  result := case when ok_ then 'نجح' else 'رسب' end;
  if not coalesce(ok_, false) then failures := failures || test || ' · '; end if;
  return next;

  -- 6 · تكرار النداء ما بيرميش وما بيلغيش التبادل
  select fn_pair_want(a, null) into tmp;
  test := '6 · تكرار النداء آمن';
  result := case when tmp = 'mutual' then 'نجح' else 'رسب — ' || coalesce(tmp, 'null') end;
  if tmp is distinct from 'mutual' then failures := failures || test || ' · '; end if;
  return next;

  -- ===== كمريم تاني: الطرف الأول شايف التبادل هو كمان =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select fn_is_mutual(b) into ok_;
  test := '7 · fn_is_mutual = true عند مريم كمان';
  result := case when ok_ then 'نجح' else 'رسب' end;
  if not coalesce(ok_, false) then failures := failures || test || ' · '; end if;
  return next;

  -- 8 · السحب: fn_pair_want(p_want => false) بتشيل رغبتي أنا بس
  perform fn_pair_want(b, null, false);
  reset role;
  select (a_wants_b and b_wants_a) into ok_ from pair_affinity where a_id = lo and b_id = hi;
  test := '8 · السحب بيشيل جهة اللي بينادي بس';
  result := case when ok_ is not null and not ok_ then 'نجح' else 'رسب' end;
  if ok_ is null or ok_ then failures := failures || test || ' · '; end if;
  return next;

  -- ===== تنضيف =====
  delete from pair_affinity where a_id = lo and b_id = hi;

  if failures <> '' then
    raise exception 'اختبارات fn_pair_want رسبت: %', failures;
  end if;
  raise notice 'ok';
end $$;
comment on function test_pair_want() is 'اختبارات إصلاح «عايز تشوف مين تاني؟» — select * from test_pair_want(); بترمي استثناء لو حاجة رسبت.';

revoke execute on function test_pair_want() from public, anon, authenticated;
