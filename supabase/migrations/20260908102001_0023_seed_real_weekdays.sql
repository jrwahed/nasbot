-- المواعيد كانت نسبية (now() + ساعات) فطلعت أيام غلط في البطاقات.
-- دلوقتي كل سبوطة بتاخد يومها وساعتها الحقيقيين بتوقيت القاهرة زي ملف التصميم.
create or replace function next_cairo(p_dow int, p_hour int)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select case
    when base <= now() then base + interval '7 days'
    else base
  end
  from (
    select (
      date_trunc('day', now() at time zone 'Africa/Cairo')
      + make_interval(days => ((p_dow - extract(dow from now() at time zone 'Africa/Cairo')::int + 7) % 7))
      + make_interval(hours => p_hour)
    ) at time zone 'Africa/Cairo' as base
  ) t;
$$;
comment on function next_cairo(int,int) is 'أقرب يوم/ساعة جايين بتوقيت القاهرة (0=الحد … 4=الخميس، 5=الجمعة).';

-- الخميس 8 بالليل
update sbotat set starts_at = next_cairo(4,20), ends_at = next_cairo(4,20) + interval '2 hours'
where id = '77777777-0000-0000-0000-000000000001';
-- الجمعة 7 الصبح
update sbotat set starts_at = next_cairo(5,7),  ends_at = next_cairo(5,7)  + interval '3 hours'
where id = '77777777-0000-0000-0000-000000000002';
-- الجمعة 6 المغرب
update sbotat set starts_at = next_cairo(5,18), ends_at = next_cairo(5,18) + interval '4 hours'
where id = '77777777-0000-0000-0000-000000000003';
-- الاتنين 8 بالليل
update sbotat set starts_at = next_cairo(1,20), ends_at = next_cairo(1,20) + interval '2 hours 30 minutes'
where id = '77777777-0000-0000-0000-000000000004';
-- التلات 7 بالليل
update sbotat set starts_at = next_cairo(2,19), ends_at = next_cairo(2,19) + interval '2 hours'
where id = '77777777-0000-0000-0000-000000000005';
-- التلات 10 الصبح لـ 3
update sbotat set starts_at = next_cairo(2,10), ends_at = next_cairo(2,10) + interval '5 hours'
where id = '77777777-0000-0000-0000-000000000006';
-- الجمعة 5 الصبح
update sbotat set starts_at = next_cairo(5,5),  ends_at = next_cairo(5,5)  + interval '3 hours'
where id = '77777777-0000-0000-0000-000000000007';
-- الغامضة — آخر جمعة في الشهر
update sbotat set starts_at = next_cairo(5,19) + interval '21 days',
                  ends_at   = next_cairo(5,19) + interval '21 days' + interval '4 hours'
where id = '77777777-0000-0000-0000-000000000008';

-- بيانات العرض: خلّي مجموعة «إحنا الرابع» مكشوفة علشان شاشة كشف المجموعة
-- تشتغل في أي وقت (المحفّز بيحسب reveal_at، فبنكتبه بعده مباشرة).
update sbotat
set reveal_at = now() - interval '2 hours',
    chat_opens_at = now() - interval '2 hours'
where id = '77777777-0000-0000-0000-000000000001';

update chat_rooms
set opens_at = now() - interval '2 hours',
    closes_at = (select ends_at + interval '48 hours' from sbotat where id = '77777777-0000-0000-0000-000000000001')
where id = '99999999-0000-0000-0000-000000000001';

select t.name_ar, to_char(s.starts_at at time zone 'Africa/Cairo','Dy HH24:MI') as cairo
from sbotat s join sbota_templates t on t.id = s.template_id order by s.starts_at;;
