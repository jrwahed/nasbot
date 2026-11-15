-- ==========================================================================
-- WORK_MIGRATION_63.sql — «كل الخروجات»: كاتالوج القوالب في الرئيسية
--
-- طلب المالك (٢٠٢٦-١١-١٥): «عاوز يلا الصفحة الافتراضية وتحتها القوالب».
-- الترتيب في الرئيسية بقى: **يلا → سبوطات الأسبوع ده → كل الخروجات**.
--
-- ملف واحد، مستقل، وآمن يتكرر (اتجرّب تلات لزقات + بـ\r\n على قاعدة نضيفة).
-- مش محتاج أي حزمة قبله.
--
-- ⚠ الكود آمن يتنشر **قبل** اللزق: من غير `fn_templates_all` القسم بيختفي بس.
--
-- بعده شغّل:
--
--   select * from test_templates_all();   -- ١٠ صفوف، كلهم «نجح»
--
-- (مش محتاج بذرة — بيشتغل على البيانات الحقيقية.)
-- ==========================================================================

-- ########################################################################
-- # 20261115160000_0145_templates_catalogue.sql
-- ########################################################################

-- ============================================================================
-- 0145 · «كل الخروجات» — كاتالوج القوالب في الرئيسية
--
-- طلب المالك (٢٠٢٦-١١-١٥): «عاوز يلا الصفحة الافتراضية وتحتها القوالب».
-- وبعد سؤالين اتحدد الشكل:
--   · الترتيب: «يلا» → «سبوطات الأسبوع ده» → «كل الخروجات».
--   · القوالب: الـ٩٤ كلهم، و**اللي مالوش صورة يبقى كارت كلام** — مفيش
--     مربع رملي مكتوب فيه [صورة] ولا صورة مخترعة (§٨ «مفيش بيانات وهمية»).
--
-- ⚠ **ليه دالة جديدة مش قراية مباشرة؟** جدول `sbota_templates` مقروء
--   للمجهول أصلًا، فالكاتالوج نفسه مش سر. بس الكارت محتاج يعرف **«أنا
--   قلت جاي ولا لأ»**، ودي في `template_interest` — واللي **مقفول على
--   الإدارة** (`0117`، §٥ قاعدة ٤). من غير الدالة الزرار كان هيبقى من غير
--   حالة: العضو يدوس، يعمل تحديث، ويلاقيه رجع زي ما كان. يعني زرار بيكدب.
--
-- ⚠ **منسوخة من `fn_coming_soon` بالحرف** (الدرس السادس: التعديل اللي
--   بيلمس منطق موجود يـنسخ الأصل ويضيف عليه، مش يعيد كتابته). الفروق
--   **تلاتة بس**، وكل واحد مكتوب جنبه:
--     1. `not t.coming_soon` بدل `t.coming_soon` — اللي معلّم «قريب»
--        بيبان في قسمه فوق، فما يتكررش هنا.
--     2. `not t.is_work` — الشغل منتج لوحده وله صفحته (`/shoghl`).
--     3. استثناءين جداد: القالب العام «خروجة من عضو» وبذرة الاختبار
--        (مش نشاطات — §٥)، و«السبوطة الغامضة» (ليها صفحتها ورا مفتاح
--        `mystery`، فظهورها هنا بيلفّ حوالين القفل).
--     4. `proposed` اتضافت لحالات السبوطة — `fn_coming_soon` اتكتبت قبل
--        `0126`، والمقترحة بتبان في «سبوطات الأسبوع ده» فوق. من غير
--        السطر ده «بادل» كان هيظهر **مرتين** في نفس الصفحة.
--
-- ⚠ **مفيش سعر ولا ميعاد** — زي `fn_coming_soon` بالظبط. الكاتالوج
--   متعمّد إنه مفيهوش أرقام (§٨ «دليل السبوطات»)، و٨٧ من الـ٩٤ سعرهم صفر
--   أصلًا، فعرض السعر كان هيقول «٠ جنيه» لمعظمهم.
--
-- آمنة تتكرر.
-- ============================================================================

-- ===== 1) الدالة =====
create or replace function fn_templates_all()
returns table (
  template_id  uuid,
  slug         text,
  name_ar      text,
  mood_ar      text,
  photo        text,
  photo_alt_ar text,
  i_want       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.slug, t.name_ar, t.mood_ar,
         t.hero_photos[1], t.photo_alt_ar,
         exists (select 1 from template_interest i
                  where i.template_id = t.id
                    and i.profile_id = auth.uid()
                    and i.notified_at is null)
    from sbota_templates t
   where not coalesce(t.coming_soon, false)   -- (1) اللي «قريب» بيبان فوق
     and not coalesce(t.is_work, false)       -- (2) الشغل له صفحته
     and not exists (select 1 from sbotat s
                      where s.template_id = t.id
                        and s.status in ('open', 'full', 'proposed'))  -- (3)
     -- (4) قوالب مش نشاطات: القالب العام اللي خروجات الأعضاء بتتعلّق بيه
     --     (§٥ «ليه قالب عام بدل template_id nullable») وبذرة الاختبار.
     --     نفس الاستثناء المكتوب في `0089` بالحرف.
     and t.slug not in ('khroga-men-3odw', 'test-fixture')
     -- (5) «السبوطة الغامضة» ليها صفحتها `/s/mystery` ورا مفتاح `mystery`.
     --     لو بانت هنا، الزرار بيشتغل والمفتاح مقفول = لفّة حوالين القفل.
     and t.kind <> 'mystery'
   order by t.name_ar;
$$;

comment on function fn_templates_all() is
  '0145 — كاتالوج القوالب للرئيسية: كل خروجة مالهاش سبوطة شغّالة ومش «قريب» ومش شغل. مفيش سعر ولا ميعاد.';

-- ⚠ مفتوحة للمجهول عن قصد — دي قايمة «إيه اللي ممكن نعمله»، والزائر
--   لازم يشوفها قبل ما يسجّل. و`i_want` بترجّع false للمجهول لوحدها
--   (`auth.uid()` فاضية) من غير ما نكتب شرط زيادة.
revoke execute on function fn_templates_all() from public;
grant execute on function fn_templates_all() to anon, authenticated;


-- ===== 2) النصوص =====
-- ⚠ العمود اسمه `context_ar` مش `note_ar` — اتأكدت من
--   `information_schema` قبل ما أكتب (الدرس الخمستاشر).
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('tpl.home.title', 'كل الخروجات',                                   'home', 'عنوان كاتالوج القوالب في الرئيسية'),
  ('tpl.home.sub',   'الجو اللي ممكن نعمله. دوس على اللي يعجبك وهنقولك أول ما يفتح.', 'home', 'سطر تحت العنوان')
on conflict (key) do nothing;


-- ===== 3) الاختبار =====
create or replace function test_templates_all()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  n     int;
  n_all int;
begin
  test := '0145 · الدالة موجودة';
  result := case when to_regprocedure('fn_templates_all()') is not null
                 then 'نجح' else 'فشل — fn_templates_all مش موجودة' end;
  return next;

  -- ⚠ سلوكي: المجهول لازم يقراها فعلًا. الدرس التلاتة وتلاتين — الدالة
  --   اللي الواجهة بتناديها من غير منح بترجّع فاضي بالصمت.
  test := '0145 · المجهول بيقرا الكاتالوج';
  begin
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    select count(*) into n from fn_templates_all();
    reset role;
    result := case when n > 0 then format('نجح (%s خروجة)', n)
                   else 'فشل — 🔴 المجهول شاف صفر، القسم هيختفي من الرئيسية' end;
  exception when others then
    reset role;
    result := 'فشل — 🔴 المجهول اترفض: ' || sqlerrm;
  end;
  return next;

  -- ⚠ الفرق (3): من غيره الخروجة اللي ليها سبوطة شغّالة بتبان **مرتين**
  --   في نفس الصفحة — مرة ككارت حجز فوق ومرة ككارت كاتالوج تحت.
  test := '0145 · 🔴 اللي ليها سبوطة شغّالة مش في الكاتالوج';
  select count(*) into n
    from fn_templates_all() f
   where exists (select 1 from sbotat s
                  where s.template_id = f.template_id
                    and s.status in ('open', 'full', 'proposed'));
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 %s خروجة بتتعرض مرتين', n) end;
  return next;

  test := '0145 · اللي معلّم «قريب» مش متكرر في الكاتالوج';
  select count(*) into n
    from fn_templates_all() f
    join sbota_templates t on t.id = f.template_id
   where coalesce(t.coming_soon, false);
  result := case when n = 0 then 'نجح'
                 else format('فشل — %s قالب «قريب» بيبان مرتين', n) end;
  return next;

  -- ⚠ الصفّين دول اتكتبوا بعد ما **اتشافوا في الصفحة بالعين**: أول نسخة
  --   كانت بتعرض «خروجة من عضو» (قالب داخلي) و«السبوطة الغامضة» (ورا
  --   مفتاح) في الكاتالوج. الدرس الخمستاشر — «الكود اتكتب» مش «الصفحة صح».
  test := '0145 · 🔴 القالب العام وبذرة الاختبار بره الكاتالوج';
  select count(*) into n
    from fn_templates_all() f
   where f.slug in ('khroga-men-3odw', 'test-fixture');
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 %s قالب داخلي بيتعرض للزوار', n) end;
  return next;

  test := '0145 · 🔴 الغامضة بره الكاتالوج (ليها مفتاحها)';
  select count(*) into n
    from fn_templates_all() f
    join sbota_templates t on t.id = f.template_id
   where t.kind = 'mystery';
  result := case when n = 0 then 'نجح'
                 else 'فشل — 🔴 الغامضة بتتعرض من غير ما تعدّي على مفتاح mystery' end;
  return next;

  test := '0145 · قوالب الشغل بره الكاتالوج';
  select count(*) into n
    from fn_templates_all() f
    join sbota_templates t on t.id = f.template_id
   where coalesce(t.is_work, false);
  result := case when n = 0 then 'نجح'
                 else format('فشل — %s قالب شغل في كاتالوج الخروجات', n) end;
  return next;

  -- ⚠ الدرس العاشر: بنتأكد إن اللي حطيناه **لسه موجود وكامل**، مش إنه
  --   رقم ثابت. المالك بيعلّم «قريب» وبيفتح سبوطات، فالعدد بيتحرّك —
  --   اللي ما ينفعش هو إن الكاتالوج يفضى.
  test := '0145 · الكاتالوج مش فاضي';
  select count(*) into n from fn_templates_all();
  select count(*) into n_all from sbota_templates where not coalesce(is_work, false);
  result := case when n > 0 then format('نجح (%s من %s خروجة)', n, n_all)
                 else 'فشل — الكاتالوج فاضي، والقسم هيختفي' end;
  return next;

  -- ⚠ مفيش سعر ولا ميعاد في اللي بيخرج — §٨ «الدليل متعمّد إنه مفيهوش أرقام».
  -- أسامي الأعمدة الراجعة من `returns table` بتتخزّن في `proargnames`.
  test := '0145 · 🔴 مفيش سعر ولا ميعاد في الراجع';
  select count(*) into n
    from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
    cross join lateral unnest(coalesce(p.proargnames, '{}')) as col
   where ns.nspname = 'public' and p.proname = 'fn_templates_all'
     and col in ('price', 'default_price', 'org_fee', 'starts_at', 'reveal_at');
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 %s عمود فلوس/ميعاد بيترجّع للعامة', n) end;
  return next;

  test := '0145 · النصين موجودين';
  select count(*) into n from copy_strings
   where key in ('tpl.home.title', 'tpl.home.sub');
  result := case when n = 2 then 'نجح'
                 else format('فشل — %s من ٢ بس', n) end;
  return next;
end $body$;

comment on function test_templates_all() is
  '0145 — كاتالوج القوالب: المجهول بيقراه، ومفيش تكرار مع السبوطات الشغّالة ولا «قريب»، ومفيش أرقام.';
revoke execute on function test_templates_all() from public, anon, authenticated;
