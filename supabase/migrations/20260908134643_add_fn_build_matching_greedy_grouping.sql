-- ============================================================================
-- fn_build_matching — بتقسّم الحاجزين في سبوطة على مجموعات صغيّرة
--
-- الفكرة باختصار: بناخد الناس اللي دافعة، نقرر عدد المجموعات، نرتّب الناس
-- بالأصعب في التوزيع الأول (البنات وبعدين اللي بيبدأوا الكلام)، وبعدين كل
-- واحد بنحطه في المجموعة اللي «مكسبها» منه أكبر من غير ما نكسر قاعدة صارمة.
--
-- النتيجة صف واحد في matching_runs فيه الاقتراح بشكل jsonb. الدالة دي
-- **ما بتعملش** مجموعات ولا غرف شات ولا رسايل — ده شغل fn_reveal لوحدها،
-- وهي بتقرا نفس الـ jsonb ده: groups[].members (مصفوفة uuid كنصوص)
-- و groups[].why (السطر اللي بيتكتب في sbota_groups.why_ar وبيشوفه الأعضاء).
-- أي مفاتيح زيادة (flags/stats/settings) fn_reveal بتعدّي عليها من غير ما تلمسها.
-- ============================================================================

create or replace function public.fn_build_matching(p_sbota uuid)
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

  v_year     int := extract(year from now())::int;
  v_min      int;              -- أقل عدد في المجموعة (من التمبليت)
  v_max      int;              -- أكبر عدد في المجموعة (من التمبليت)
  v_n        int;              -- عدد الحاجزين المؤهلين
  v_k        int;              -- عدد المجموعات
  v_girls    int;              -- عدد البنات في السبوطة كلها
  v_girls_first boolean;       -- نبدأ بالبنات؟ (بس لما يكون فيه حد أدنى لنسبتهم)

  -- حالة كل مجموعة أثناء التوزيع (مصفوفات بطول v_k)
  v_target   int[];            -- الحجم المستهدف
  v_quota    int[];            -- كام بنت المفروض تقعد فيها
  v_size     int[];
  v_ggirls   int[];
  v_gstart   int[];
  v_grisky   int[];
  v_gamin    int[];
  v_gamax    int[];

  v_i        int;
  v_pass     int;
  v_base     int;
  v_rem      int;
  v_floor    int;
  v_cap      int;
  v_left     int;
  v_moved    boolean;
  v_open     boolean;

  v_c        record;           -- الشخص اللي بنوزّعه دلوقتي
  v_best     int;
  v_best_sc  numeric;
  v_score    numeric;
  v_aff      int;
  v_gap      int;
  v_amin     int;
  v_amax     int;

  v_cnt      int;
  v_gg       int;
  v_gs       int;
  v_gr       int;
  v_pct      int;
  v_flags    jsonb;
  v_why      text;
  v_groups   jsonb := '[]'::jsonb;
  v_notes    jsonb := '[]'::jsonb;
  v_members  jsonb;
  v_run      uuid;
begin
  -- ------------------------------------------------------------ الصلاحية
  -- زي fn_issue_refund بالظبط: مين ما معهوش المفتاح ما يشغّلش حاجة.
  -- الاستثناء الوحيد هو النداء الداخلي (service_role — السكربتات والكرون)،
  -- لأنه أصلاً مالوش auth.uid() يتشاف في admin_users، و EXECUTE مسحوبة من
  -- public و anon فمحدش من برّه يقدر يوصل للدالة أصلاً.
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

  -- بعد الكشف المجموعات بقت حقيقية والناس في غرف شات — اقتراح جديد وقتها
  -- بيضلّل اللي بيراجع، فبنقف هنا.
  if exists (select 1 from sbota_groups where sbota_id = p_sbota) then
    raise exception 'السبوطة دي اتكشفت خلاص ومجموعاتها اتعملت — مينفعش نعيد المطابقة';
  end if;

  select * into v_t from sbota_templates where id = v_s.template_id;

  -- حدود حجم المجموعة من التمبليت، ولو مفيش تمبليت بنرجع لسعة السبوطة نفسها
  v_max := greatest(coalesce(v_t.max_group, v_s.capacity), 1);
  v_min := greatest(coalesce(v_t.min_group, 1), 1);
  if v_min > v_max then v_min := v_max; end if;

  -- ------------------------------------------------------------ المرشحين
  -- المؤهل = دافع (paid) أو حضر خلاص (attended). أي حاجة تانية مش بتتوزّع.
  drop table if exists pg_temp.tmp_cands;
  create temp table tmp_cands on commit drop as
  select
    b.profile_id,
    p.gender,
    case when p.birth_year is not null then v_year - p.birth_year end as age,
    -- «بيبدأ الكلام» = اللي مسجّل كده في الطاقة الاجتماعية، أو شخصيته
    -- اجتماعية/طاقة. المجموعة اللي كلها ساكتة ما بتتكلمش، وده سبب القاعدة.
    (coalesce(p.social_energy = 'starter', false)
     or coalesce(p.type in ('social_captain', 'energy'), false)) as is_starter,
    -- «بيغيب كتير» = وصل لحد الغياب أو عدّاه. مش بنشيله من التوزيع، بس
    -- بنفرّقهم على المجموعات بدل ما يتلموا في مجموعة واحدة تروح فاضية.
    (v_set.match_no_show_limit > 0
     and p.no_show_count >= v_set.match_no_show_limit) as risky,
    p.no_show_count
  from bookings b
  join profiles p on p.id = b.profile_id
  where b.sbota_id = p_sbota
    and b.status in ('paid', 'attended');

  select count(*) into v_n from pg_temp.tmp_cands;
  if v_n = 0 then
    raise exception 'مفيش حد حاجز ودافع في السبوطة دي علشان نقسّمه';
  end if;

  -- قيد صارم: سبوطة البنات تفضل بنات. لو فيه حجز لحد مش بنت ده غلط في
  -- البيانات، وما ينفعش نداريه بإننا نسيبه برّه التوزيع من غير ما حد ياخد باله.
  if v_s.girls_only then
    select count(*) into v_i from pg_temp.tmp_cands
    where gender is distinct from 'female';
    if v_i > 0 then
      raise exception 'السبوطة دي بنات بس، وفيه % حجز مش لبنت — راجع الحجوزات الأول', v_i;
    end if;
  end if;

  select count(*) filter (where gender = 'female') into v_girls from pg_temp.tmp_cands;

  -- التاريخ الحلو: بس الأزواج اللي اختاروا بعض من الطرفين، وبس اللي الاتنين
  -- منهم في السبوطة دي. بنخزّنه في الاتجاهين علشان البحث يبقى سطر واحد.
  drop table if exists pg_temp.tmp_aff;
  create temp table tmp_aff on commit drop as
  select pa.a_id as a, pa.b_id as b, greatest(pa.weight, 1) as w
  from pair_affinity pa
  where pa.a_wants_b and pa.b_wants_a
    and exists (select 1 from pg_temp.tmp_cands x where x.profile_id = pa.a_id)
    and exists (select 1 from pg_temp.tmp_cands x where x.profile_id = pa.b_id)
  union all
  select pa.b_id, pa.a_id, greatest(pa.weight, 1)
  from pair_affinity pa
  where pa.a_wants_b and pa.b_wants_a
    and exists (select 1 from pg_temp.tmp_cands x where x.profile_id = pa.a_id)
    and exists (select 1 from pg_temp.tmp_cands x where x.profile_id = pa.b_id);

  -- ------------------------------------------------------- عدد المجموعات
  -- أقل عدد مجموعات ما يخليش حد يقعد في مجموعة أكبر من الحد الأقصى.
  v_k := ceil(v_n::numeric / v_max)::int;

  -- ولو التقسيم ده هيطلّع مجموعات أصغر من الحد الأدنى، بنقلّل عدد المجموعات
  -- طول ما ده مش هيخلّي أي مجموعة تعدّي الحد الأقصى. الأقصى بيكسب على الأدنى
  -- لأن الترابيزة اللي مش واسعاهم مشكلة حقيقية، والمجموعة الصغيّرة مجرد ملاحظة.
  while v_k > 1
    and v_n < v_k * v_min
    and ceil(v_n::numeric / (v_k - 1))::int <= v_max
  loop
    v_k := v_k - 1;
  end loop;

  -- الأحجام المستهدفة: بالتساوي، والزيادة بتروح للمجموعات الأولى
  v_target := array_fill(0, array[v_k]);
  v_base := v_n / v_k;
  v_rem  := v_n % v_k;
  for v_i in 1..v_k loop
    v_target[v_i] := v_base + (case when v_i <= v_rem then 1 else 0 end);
  end loop;

  -- ---------------------------------------------------------- خطة البنات
  -- بنقرر كل مجموعة تاخد كام بنت **قبل** ما نوزّع أي حد. ده أهم من أي وزن،
  -- لأن الحكاية كلها إننا ما نسيبش بنت واحدة وسط سبع ولاد. فالأحسن مجموعة
  -- تاخد نصيبها كامل من الحد الأدنى، ولو البنات مش مكفّيين كل المجموعات
  -- يبقى فيه مجموعة تقعد من غير بنات خالص — ودي أهون من بنت لوحدها.
  v_quota := array_fill(0, array[v_k]);
  if v_s.girls_only then
    for v_i in 1..v_k loop
      v_quota[v_i] := v_target[v_i];
    end loop;
  else
    v_left := v_girls;

    -- جولة أولى: كل مجموعة تاخد الحد الأدنى بالكامل أو ما تاخدش حاجة
    for v_i in 1..v_k loop
      v_floor := ceil(v_set.match_girls_ratio_min * v_target[v_i] / 100.0)::int;
      if v_left >= v_floor and v_floor > 0 then
        v_quota[v_i] := v_floor;
        v_left := v_left - v_floor;
      end if;
    end loop;

    -- جولة تانية: الباقي بالتساوي على المجموعات اللي أخدت نصيب، من غير ما
    -- نعدّي الحد الأقصى للنسبة
    loop
      exit when v_left <= 0;
      v_moved := false;
      for v_i in 1..v_k loop
        exit when v_left <= 0;
        v_cap := floor(v_set.match_girls_ratio_max * v_target[v_i] / 100.0)::int;
        if v_quota[v_i] > 0 and v_quota[v_i] < v_cap and v_quota[v_i] < v_target[v_i] then
          v_quota[v_i] := v_quota[v_i] + 1;
          v_left := v_left - 1;
          v_moved := true;
        end if;
      end loop;
      exit when not v_moved;
    end loop;

    -- لسه فاضل بنات؟ يبقى العدد ما بيركبش على الحدود (أو الحد الأدنى صفر).
    -- بنوزّعهم بالتساوي وبنسجّل الملاحظة، ولا واحدة بتفضل برّه التوزيع.
    loop
      exit when v_left <= 0;
      v_moved := false;
      for v_i in 1..v_k loop
        exit when v_left <= 0;
        if v_quota[v_i] < v_target[v_i] then
          v_quota[v_i] := v_quota[v_i] + 1;
          v_left := v_left - 1;
          v_moved := true;
        end if;
      end loop;
      exit when not v_moved;
    end loop;
  end if;

  -- ------------------------------------------------------------- التوزيع
  v_size   := array_fill(0, array[v_k]);
  v_ggirls := array_fill(0, array[v_k]);
  v_gstart := array_fill(0, array[v_k]);
  v_grisky := array_fill(0, array[v_k]);
  v_gamin  := array_fill(null::int, array[v_k]);
  v_gamax  := array_fill(null::int, array[v_k]);

  drop table if exists pg_temp.tmp_place;
  create temp table tmp_place (
    profile_id uuid primary key,   -- المفتاح ده هو اللي بيضمن إن محدش يتكرر
    grp int not null
  ) on commit drop;

  -- البنات الأول لما يكون فيه حد أدنى لنسبتهم (أصعب حد في التوزيع)، وبعدين
  -- اللي بيبدأوا الكلام، وبعدين اللي بيغيبوا كتير — دول لازم يتوزّعوا وكل
  -- المجموعات لسه فاضية علشان ما يتلموش في واحدة. الباقي بالسن علشان
  -- المتقاربين يقعدوا مع بعض، والـ id في الآخر علشان النتيجة تبقى ثابتة.
  v_girls_first := (not v_s.girls_only) and v_set.match_girls_ratio_min > 0;

  for v_c in
    select cd.*
    from pg_temp.tmp_cands cd
    order by
      case when v_girls_first and cd.gender = 'female' then 0 else 1 end,
      case when cd.is_starter then 0 else 1 end,
      case when cd.risky then 0 else 1 end,
      cd.age nulls last,
      cd.profile_id
  loop
    v_best := null;
    v_best_sc := null;

    -- ٣ جولات: الأولى بتحترم خطة الحجم وخطة البنات، والتانية والتالتة
    -- صمّامات أمان مفروض ما توصلهاش أبدًا (مجموع الخطة = عدد الناس).
    for v_pass in 1..3 loop
      for v_i in 1..v_k loop
        if v_pass = 1 then
          v_open := v_size[v_i] < v_target[v_i]
                    and case when v_c.gender = 'female'
                             -- اللي جنسه مش مسجّل بيتحسب في خانة الولاد
                             then v_ggirls[v_i] < v_quota[v_i]
                             else (v_size[v_i] - v_ggirls[v_i])
                                  < (v_target[v_i] - v_quota[v_i]) end;
        elsif v_pass = 2 then
          v_open := v_size[v_i] < v_target[v_i];
        else
          v_open := v_size[v_i] < v_max;   -- قيد صارم: مش بنعدّي الحد الأقصى
        end if;
        if not v_open then
          continue;
        end if;

        v_score := 0;

        -- فرق السن: الناس اللي في سن قريب بيلاقوا كلام مشترك بسرعة
        if v_c.age is null then
          v_gap := coalesce(v_gamax[v_i] - v_gamin[v_i], 0);
        else
          v_amin := least(coalesce(v_gamin[v_i], v_c.age), v_c.age);
          v_amax := greatest(coalesce(v_gamax[v_i], v_c.age), v_c.age);
          v_gap  := v_amax - v_amin;
        end if;
        if v_gap > v_set.match_max_age_gap then
          v_score := v_score - 60 - 3 * (v_gap - v_set.match_max_age_gap);
        else
          v_score := v_score + (v_set.match_max_age_gap - v_gap);
        end if;

        -- بادئين الكلام: كل ما المجموعة ناقصة أكتر، كل ما تستاهل الواحد ده أكتر
        if v_c.is_starter then
          v_score := v_score
                   + 20 * greatest(v_set.match_min_starters - v_gstart[v_i], 0);
        elsif v_set.match_min_starters > 0 and v_gstart[v_i] = 0 then
          -- سيب مكان في المجموعة اللي لسه مالهاش أي بادئ كلام
          v_score := v_score - 2;
        end if;

        -- التاريخ الحلو: مجموع أوزان اللي اختاروه واختارهم وقاعدين هنا خلاص
        select coalesce(sum(f.w), 0) into v_aff
        from pg_temp.tmp_aff f
        join pg_temp.tmp_place pl on pl.profile_id = f.b and pl.grp = v_i
        where f.a = v_c.profile_id;
        v_score := v_score + v_set.match_mutual_weight * v_aff;

        -- الغياب: ما نكوّمش اللي بيغيبوا مع بعض
        if v_c.risky then
          v_score := v_score - 15 * v_grisky[v_i];
        end if;

        -- كسر التعادل: الأقل عددًا بياخد
        v_score := v_score + (v_target[v_i] - v_size[v_i]);

        if v_best_sc is null or v_score > v_best_sc then
          v_best_sc := v_score;
          v_best := v_i;
        end if;
      end loop;
      exit when v_best is not null;
    end loop;

    if v_best is null then
      raise exception 'مفيش مكان لـ % في أي مجموعة — ده مفروض ما يحصلش', v_c.profile_id;
    end if;

    insert into pg_temp.tmp_place (profile_id, grp) values (v_c.profile_id, v_best);

    v_size[v_best]   := v_size[v_best] + 1;
    v_ggirls[v_best] := v_ggirls[v_best] + (case when v_c.gender = 'female' then 1 else 0 end);
    v_gstart[v_best] := v_gstart[v_best] + (case when v_c.is_starter then 1 else 0 end);
    v_grisky[v_best] := v_grisky[v_best] + (case when v_c.risky then 1 else 0 end);
    if v_c.age is not null then
      v_gamin[v_best] := least(coalesce(v_gamin[v_best], v_c.age), v_c.age);
      v_gamax[v_best] := greatest(coalesce(v_gamax[v_best], v_c.age), v_c.age);
    end if;
  end loop;

  -- حزام أمان: محدش يقع من التوزيع
  select count(*) into v_i
  from pg_temp.tmp_cands cd
  where not exists (select 1 from pg_temp.tmp_place pl where pl.profile_id = cd.profile_id);
  if v_i > 0 then
    raise exception 'حصل خلل: فيه % واحد ما اتحطش في أي مجموعة', v_i;
  end if;

  -- ------------------------------------------------- الاقتراح والملاحظات
  for v_i in 1..v_k loop
    select
      count(*),
      count(*) filter (where cd.gender = 'female'),
      count(*) filter (where cd.is_starter),
      count(*) filter (where cd.risky),
      min(cd.age),
      max(cd.age),
      coalesce(jsonb_agg(pl.profile_id order by cd.age nulls last, pl.profile_id), '[]'::jsonb)
    into v_cnt, v_gg, v_gs, v_gr, v_amin, v_amax, v_members
    from pg_temp.tmp_place pl
    join pg_temp.tmp_cands cd on cd.profile_id = pl.profile_id
    where pl.grp = v_i;

    v_gap := coalesce(v_amax - v_amin, 0);
    v_pct := case when v_cnt > 0 then round(v_gg * 100.0 / v_cnt)::int else 0 end;

    -- العلامات: اللي اتكسر من القواعد المرنة، بالعربي علشان اللي بيراجع يفهم
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
    if v_gap > v_set.match_max_age_gap then
      v_flags := v_flags || jsonb_build_object(
        'code', 'age_gap',
        'ar', format('فرق السن جواها %s سنة والمسموح %s', v_gap, v_set.match_max_age_gap));
    end if;
    if v_gs < v_set.match_min_starters then
      v_flags := v_flags || jsonb_build_object(
        'code', 'few_starters',
        'ar', format('فيها %s بيبدأ الكلام والمطلوب %s', v_gs, v_set.match_min_starters));
    end if;
    if not v_s.girls_only and v_gg > 0
       and (v_pct < v_set.match_girls_ratio_min or v_pct > v_set.match_girls_ratio_max) then
      v_flags := v_flags || jsonb_build_object(
        'code', 'girls_ratio',
        'ar', format('نسبة البنات %s%% وهي برّه حدود %s%%–%s%%',
                     v_pct, v_set.match_girls_ratio_min, v_set.match_girls_ratio_max));
    end if;
    if not v_s.girls_only and v_gg = 1 and v_cnt > 2 then
      v_flags := v_flags || jsonb_build_object(
        'code', 'lone_girl',
        'ar', format('بنت واحدة وسط %s ولاد — راجعها بإيدك', v_cnt - 1));
    end if;
    if v_gr > 1 then
      v_flags := v_flags || jsonb_build_object(
        'code', 'no_shows',
        'ar', format('فيها %s ناس عندهم غياب %s مرة أو أكتر',
                     v_gr, v_set.match_no_show_limit));
    end if;

    -- السطر ده بيتكتب في sbota_groups.why_ar والأعضاء بيقروه، فبيتكتب ليهم
    v_why := format('اخترناكم مع بعض: %s ناس', v_cnt);
    if v_amin is not null and v_amax is not null then
      v_why := v_why || (case when v_amin = v_amax
                              then format(' · كلكم في %s سنة', v_amin)
                              else format(' · أعماركم من %s لـ %s', v_amin, v_amax) end);
    end if;
    if not v_s.girls_only and v_gg > 0 and v_gg < v_cnt then
      v_why := v_why || format(' · %s بنات و %s ولاد', v_gg, v_cnt - v_gg);
    end if;
    if v_gs > 0 then
      v_why := v_why || format(' · فيكم %s بيبدأ الكلام', v_gs);
      v_why := v_why || ' — يعني القعدة مش هتسكت.';
    else
      v_why := v_why || ' — اكسروا التلج بسؤال، وهي ماشية.';
    end if;

    v_groups := v_groups || jsonb_build_array(jsonb_build_object(
      'members', v_members,          -- fn_reveal بتقرا ده: مصفوفة uuid كنصوص
      'why',     v_why,              -- fn_reveal بتحطه في sbota_groups.why_ar
      'index',   v_i,
      'size',    v_cnt,
      'stats',   jsonb_build_object(
        'girls', v_gg, 'boys', v_cnt - v_gg, 'girls_pct', v_pct,
        'starters', v_gs, 'no_show_risk', v_gr,
        'age_min', v_amin, 'age_max', v_amax, 'age_gap', v_gap),
      'flags',   v_flags
    ));
  end loop;

  if v_n < v_min then
    v_notes := v_notes || jsonb_build_object(
      'code', 'too_few_people',
      'ar', format('الحاجزين %s بس والتمبليت عايز %s في المجموعة — مفيش تقسيم صح ممكن',
                   v_n, v_min));
  end if;
  if not v_s.girls_only and v_girls = 0 then
    v_notes := v_notes || jsonb_build_object(
      'code', 'no_girls',
      'ar', 'مفيش بنات في السبوطة دي خالص، فقاعدة النسبة ما اشتغلتش');
  end if;

  -- ------------------------------------------------------------- التسجيل
  insert into matching_runs (sbota_id, ran_by, algorithm_version, proposal)
  values (
    p_sbota,
    coalesce(auth.uid()::text, 'system'),
    'v' || v_set.algorithm_version::text,
    jsonb_build_object(
      'groups',      v_groups,
      'notes',       v_notes,
      'sbota_id',    p_sbota,
      'girls_only',  v_s.girls_only,
      'head_count',  v_n,
      'group_count', v_k,
      'size_bounds', jsonb_build_object('min', v_min, 'max', v_max),
      'built_at',    now(),
      'settings',    jsonb_build_object(
        'match_max_age_gap',     v_set.match_max_age_gap,
        'match_min_starters',    v_set.match_min_starters,
        'match_girls_ratio_min', v_set.match_girls_ratio_min,
        'match_girls_ratio_max', v_set.match_girls_ratio_max,
        'match_mutual_weight',   v_set.match_mutual_weight,
        'match_no_show_limit',   v_set.match_no_show_limit,
        'algorithm_version',     v_set.algorithm_version)
    )
  )
  returning id into v_run;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'matching.build', 'matching_runs', v_run,
          jsonb_build_object('sbota_id', p_sbota, 'groups', v_k, 'people', v_n));

  return v_run;
end;
$function$;

comment on function public.fn_build_matching(uuid) is
  'بتبني اقتراح تقسيم مجموعات لسبوطة وبتسجّله في matching_runs. fn_reveal هي اللي بتنفّذه.';

revoke all on function public.fn_build_matching(uuid) from public, anon;
grant execute on function public.fn_build_matching(uuid) to authenticated, service_role;;
