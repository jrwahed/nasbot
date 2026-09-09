-- ============================================================================
-- جدولة إشعارات الشغل — pg_cron بينده /api/cron/work-notify كل ساعة
--
-- من غير الملف ده الإشعارات بتتسجّل في notifications وتفضل واقفة للأبد،
-- يعني «اليوم الثابت» بيحجز للناس من غير ما يقولّهم.
--
-- ⚠ قبل ما تشغّل: بدّل <CRON_SECRET> تحت بنفس القيمة اللي في Vercel
--    (Settings ← Environment Variables ← CRON_SECRET). بتبدأ بـ a93f…
--    وسيب علامات التنصيص حواليها.
--
-- آمن يتكرر: بيمسح الجدولة القديمة والسر القديم قبل ما يعمل الجديد.
-- ============================================================================


/* ==================================================== 1) السر في الخزنة */

-- بنخزّن السر في Vault مش في نص المهمة، علشان ما يبانش في cron.job لأي حد
-- يقدر يقرا الجدول. لو موجود من قبل بنمسحه ونعمله من الأول.
do $$
declare
  v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'nasbot_cron_secret';
  if v_id is not null then
    perform vault.update_secret(v_id, '<CRON_SECRET>', 'nasbot_cron_secret');
  else
    perform vault.create_secret('<CRON_SECRET>', 'nasbot_cron_secret');
  end if;
end $$;


/* ==================================================== 2) المهمة */

-- كل ساعة عند الدقيقة 5. المسار بياخد 20 صف بالكتير في النداء الواحد،
-- فلو اتكدّس أكتر من كده بيخلّصهم على مدار الساعات اللي بعدها.
select cron.unschedule('nasbot-work-notify')
where exists (select 1 from cron.job where jobname = 'nasbot-work-notify');

select cron.schedule(
  'nasbot-work-notify',
  '5 * * * *',
  $job$
  select net.http_post(
    url     := 'https://nasbot.vercel.app/api/cron/work-notify',
    headers := jsonb_build_object(
                 'content-type',    'application/json',
                 'x-nasbot-secret', (select decrypted_secret
                                     from vault.decrypted_secrets
                                     where name = 'nasbot_cron_secret')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $job$
);


/* ==================================================== 3) نداء فوري للتجربة */

-- بينده المسار دلوقتي علشان ما تستناش لحد الساعة الجاية.
-- شوف النتيجة في القسم 4 بعد ثواني.
select net.http_post(
  url     := 'https://nasbot.vercel.app/api/cron/work-notify',
  headers := jsonb_build_object(
               'content-type',    'application/json',
               'x-nasbot-secret', (select decrypted_secret
                                   from vault.decrypted_secrets
                                   where name = 'nasbot_cron_secret')
             ),
  body    := '{}'::jsonb,
  timeout_milliseconds := 30000
) as request_id;


/* ==================================================== 4) التأكيد */

-- ⚠ net.http_post **غير متزامنة**: بترجّع رقم الطلب على طول، فـ cron بتقول
--   «نجحت» حتى لو المسار رجّع 401. الفحص الحقيقي هنا — شغّله بعد نص دقيقة:
--
--   select status_code, content::text
--   from net._http_response
--   order by created desc limit 3;
--
--   المتوقع: 200 و {"ok":true,"picked":N,"sent":N,...}
--   لو 401 → السر اللي في الخزنة مش زي اللي في Vercel.
--   لو 404 → الدومين اتغيّر، عدّل الـ url فوق.
--
-- والمهمة نفسها:
--   select jobname, schedule, active from cron.job where jobname like 'nasbot-work%';
--
-- واللي لسه واقف في الطابور:
--   select template_key, status, count(*) from notifications
--   where template_key like 'work\_%' group by 1, 2 order by 1;
