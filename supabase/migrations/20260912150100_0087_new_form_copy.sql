-- ============================================================================
-- 0087 — نصوص فورم «اكتب خروجتك»
--
-- الفورم بقى كتابة بدل اختيار (0086)، فالخانات اتغيّرت. الملف ده بيحط
-- نصوص الخانات الجديدة وبيشيل نصوص القوايم اللي بطّل لها لزمة.
--
-- آمن يتكرر.
-- ============================================================================

insert into copy_strings (key, value_ar, screen, context_ar) values
  ('host.new.name', 'اسم الخروجة', 'خروجات الأعضاء', 'عنوان خانة الاسم — العضو بيكتبه بنفسه'),
  ('host.new.namePh', 'قهوة وطاولة في المعادي', 'خروجات الأعضاء', 'مثال جوه الخانة'),
  ('host.new.details', 'إيه اللي هتعملوه؟', 'خروجات الأعضاء', 'عنوان خانة التفاصيل'),
  ('host.new.detailsPh', 'هنقعد نشرب قهوة ونلعب طاولة. الجو هادي والكلام كتير. مفيش حاجة رسمية — تعالى بس.', 'خروجات الأعضاء', 'مثال جوه الخانة'),
  ('host.new.venuePh', 'كافيه البوسطة', 'خروجات الأعضاء', 'مثال جوه خانة المكان'),
  ('host.new.address', 'العنوان بالتفاصيل', 'خروجات الأعضاء', 'عنوان خانة العنوان'),
  ('host.new.addressPh', 'شارع 9، المعادي — جنب محطة المترو، الدور الأول فوق الصيدلية', 'خروجات الأعضاء', 'مثال جوه الخانة'),
  ('host.new.addressHint', 'العنوان ده ما بيظهرش لحد غير اللي حاجز، ووقت كشف المجموعة بس. اكتبه كامل عشان محدش يتوه.', 'خروجات الأعضاء', 'سطر تحت خانة العنوان — بيطمّن صاحب الخروجة'),
  ('host.new.area', 'المنطقة', 'خروجات الأعضاء', 'عنوان خانة المنطقة'),
  ('host.new.pickArea', 'اختار المنطقة', 'خروجات الأعضاء', 'الخانة وهي فاضية'),
  ('host.new.duration', 'هتقعدوا قد إيه؟', 'خروجات الأعضاء', 'عنوان خانة المدة'),
  ('host.new.durationValue', '{{h}} ساعة', 'خروجات الأعضاء', 'شكل كل اختيار في قايمة المدة'),
  ('host.new.cost', 'التكلفة التقريبية', 'خروجات الأعضاء', 'عنوان خانة التكلفة'),
  ('host.new.costPh', 'حوالي 120 جنيه في المكان', 'خروجات الأعضاء', 'مثال جوه الخانة'),
  ('host.new.costHint', 'معلومة للناس بس — نسبوط مش بياخد منهم فلوس. كل واحد بيدفع لنفسه في المكان.', 'خروجات الأعضاء', 'سطر تحت خانة التكلفة'),
  ('host.new.reviewNote', 'خروجتك بتتراجع من نسبوط الأول، وبعدين تظهر للناس. مش بتاخد وقت.', 'خروجات الأعضاء', 'سطر بيوضّح إن فيه مراجعة'),
  ('host.sbota.free', 'ببلاش', 'خروجات الأعضاء', 'بدل السعر في صفحة خروجة العضو'),
  ('host.sbota.costLine', '{{cost}} — بتدفعها في المكان، نسبوط مش بياخد منك حاجة.', 'خروجات الأعضاء', 'سطر التكلفة اللي صاحب الخروجة كتبها'),
  ('host.sbota.freeNote', 'الحجز ببلاش. لو في تكلفة في المكان، بتدفعها هناك.', 'خروجات الأعضاء', 'لو صاحب الخروجة ما كتبش تكلفة'),
  ('host.sbota.bookCta', 'أنا جاي', 'خروجات الأعضاء', 'زرار الحجز في خروجة العضو'),
  ('host.sbota.booking', 'بنحجزلك…', 'خروجات الأعضاء', 'الزرار وهو شغّال'),
  ('host.sbota.bookErr', 'مقدرناش نحجزلك. جرّب تاني.', 'خروجات الأعضاء', 'خطأ عام — القاعدة بترجّع سبب أوضح')
on conflict (key) do update
  set value_ar   = excluded.value_ar,
      screen     = excluded.screen,
      context_ar = coalesce(excluded.context_ar, copy_strings.context_ar);

-- نصوص القوايم القديمة — الفورم مابقاش فيه اختيار قالب ولا مكان
delete from copy_strings where key in ('host.new.type', 'host.new.pickType', 'host.new.pickVenue', 'host.new.priceNote', 'host.new.priceFrom', 'host.new.notePlaceholder');


-- ===== اختبار =====
create or replace function test_new_form_copy()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  test := '0087 · كل خانات فورم الكتابة وصفحة الخروجة ليها نص';
  -- بنعد بالبادئة مش بقايمة مكتوبة بالإيد — القايمة اليدوية بتتأخر عن
  -- الملف أول ما حد يضيف مفتاح، والاختبار يقول «فشل» وهو سليم.
  select count(*) into n from copy_strings
   where key like 'host.new.%' or key like 'host.sbota.%';
  if n >= 30 then result := format('نجح — %s نص', n);
  else result := format('فشل — %s بس، في خانة هتطلع بمفتاحها', n); end if;
  return next;

  test := '0087 · نصوص القوايم القديمة اتشالت';
  select count(*) into n from copy_strings where key in ('host.new.type', 'host.new.pickType', 'host.new.pickVenue', 'host.new.priceNote', 'host.new.priceFrom', 'host.new.notePlaceholder');
  if n = 0 then result := 'نجح'; else result := format('فشل — %s لسه موجود', n); end if;
  return next;
end;
$$;

revoke execute on function test_new_form_copy() from public, anon, authenticated;
