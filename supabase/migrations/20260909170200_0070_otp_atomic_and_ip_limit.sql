-- ============================================================================
-- 0070 — تخمين رمز الدخول بالتوازي (S7)
--
-- المشكلة: /api/otp/verify كان بيقرا العدّاد وبعدين يكتبه في خطوتين:
--
--     const { data: row } = await db.from('otp_codes').select('attempts')…
--     if (r.attempts >= 5) → ارفض
--     await db.from('otp_codes').update({ attempts: r.attempts + 1 })
--
-- ٥٠ طلب متوازي بيقروا كلهم `attempts = 0`، فحد الـ٥ عمره ما بيمسك، وكلهم
-- بيكتبوا `1`. يعني تخمين رمز من ٦ أرقام من غير أي سقف حقيقي.
--
-- ⚠ خطورته أعلى من اللي المراجعة قدّرته: /api/admin/login بينده نفس المسار،
-- فده طريق دخول **اللوحة** مش تسجيل الأعضاء بس.
--
-- وكمان مفيش أي حد على الـIP — رقم واحد محدود بـ٣ إرسالات في الساعة، بس
-- مهاجم معاه ألف رقم عنده ٣٠٠٠ إرسالة من نفس الجهاز.
--
-- الحل:
--   1) fn_otp_try — التحقق كله (الصلاحية · السقف · المطابقة · الزيادة ·
--      الاستهلاك) جوه دالة واحدة بـ `for update` على الصف، فالطلبات المتوازية
--      بتتصف ورا بعض بدل ما تتسابق.
--   2) fn_rate_hit — عدّاد نوافذ ذرّي (upsert واحد) لأي مفتاح، بنستخدمه
--      للـIP في الإرسال والتحقق.
--   3) الأرقام كلها في settings مش في الكود.
--
-- الـIP بيتخزّن **مهشوش** مش خام — مش محتاجينه، ومحدش يقدر يرجّعه.
-- ============================================================================

-- ===== 1) الأرقام في settings =====
alter table settings
  add column if not exists otp_max_attempts        int not null default 5,
  add column if not exists otp_sends_per_hour      int not null default 3,
  add column if not exists otp_ip_sends_per_hour   int not null default 20,
  add column if not exists otp_ip_verifies_per_hour int not null default 40;

comment on column settings.otp_max_attempts is 'أقصى محاولات غلط على الرمز الواحد قبل ما يتقفل.';
comment on column settings.otp_sends_per_hour is 'أقصى إرسالات رمز في الساعة للرقم الواحد.';
comment on column settings.otp_ip_sends_per_hour is 'أقصى إرسالات رمز في الساعة من نفس الجهاز (IP) — مهما اتغيّرت الأرقام.';
comment on column settings.otp_ip_verifies_per_hour is 'أقصى محاولات تحقق في الساعة من نفس الجهاز (IP).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settings_otp_limits_sane') then
    alter table settings add constraint settings_otp_limits_sane check (
      otp_max_attempts between 1 and 20
      and otp_sends_per_hour between 1 and 100
      and otp_ip_sends_per_hour between 1 and 1000
      and otp_ip_verifies_per_hour between 1 and 1000
    );
  end if;
end $$;

-- ===== 2) عدّاد نوافذ ذرّي عام =====
create table if not exists rate_hits (
  bucket       text primary key,
  window_start timestamptz not null default now(),
  hits         int not null default 0
);
comment on table rate_hits is 'عدّادات حد المعدل بنوافذ زمنية. المفتاح مهشوش (مثلاً otp_send:<هاش الـIP>) — مفيش IP خام هنا.';

alter table rate_hits enable row level security;
-- مفيش سياسة خالص: الوصول بمفتاح الخدمة والدوال definer بس
revoke all on rate_hits from anon, authenticated;

/**
 * بيسجّل ضربة على `p_bucket` ويرجّع true لو لسه تحت الحد.
 * upsert واحد = ذرّي، فالطلبات المتوازية ما بتتسابقش.
 */
create or replace function fn_rate_hit(p_bucket text, p_limit int, p_window_secs int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cur rate_hits;
begin
  insert into rate_hits (bucket, window_start, hits)
       values (p_bucket, now(), 1)
  on conflict (bucket) do update
     set hits = case
                  when rate_hits.window_start < now() - make_interval(secs => p_window_secs)
                  then 1
                  else rate_hits.hits + 1
                end,
         window_start = case
                  when rate_hits.window_start < now() - make_interval(secs => p_window_secs)
                  then now()
                  else rate_hits.window_start
                end
  returning * into cur;

  return cur.hits <= p_limit;
end;
$$;
comment on function fn_rate_hit(text, int, int) is 'عدّاد نافذة ذرّي — بيرجّع true لو لسه تحت الحد. مفتاح الخدمة بس.';
revoke execute on function fn_rate_hit(text, int, int) from public, anon, authenticated;

/** تنضيف العدّادات القديمة — يتجدول يوميًا (RUNBOOK) */
create or replace function job_purge_rate_hits()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  delete from rate_hits where window_start < now() - interval '2 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function job_purge_rate_hits() from public, anon, authenticated;

-- ===== 3) التحقق الذرّي من الرمز =====
/**
 * بيرجّع سبب واحد من: ok · none · expired · locked · wrong
 *
 * `for update` بيقفل الصف، فطلبين متوازيين على نفس الرمز بيتصفّوا ورا بعض
 * وكل واحد بيشوف العدّاد بعد اللي قبله. ده بيت القصيد في S7.
 *
 * الهاش بيتحسب على الخادم (codeHash في src/lib/server/otp.ts) وبيتبعت هنا
 * جاهز — القاعدة عمرها ما بتشوف الرمز نفسه.
 */
create or replace function fn_otp_try(p_phone text, p_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r         otp_codes;
  max_tries int;
begin
  select coalesce(otp_max_attempts, 5) into max_tries from settings limit 1;
  max_tries := coalesce(max_tries, 5);

  select * into r
    from otp_codes
   where phone = p_phone and consumed_at is null
   order by created_at desc
   limit 1
     for update;

  if not found        then return 'none';    end if;
  if r.expires_at < now() then return 'expired'; end if;
  if r.attempts >= max_tries then return 'locked'; end if;

  if r.code_hash = p_hash then
    update otp_codes set consumed_at = now() where id = r.id;
    return 'ok';
  end if;

  update otp_codes set attempts = attempts + 1 where id = r.id;
  return 'wrong';
end;
$$;
comment on function fn_otp_try(text, text) is 'تحقق ذرّي من رمز الدخول — بيقفل الصف فالمحاولات المتوازية ما بتتخطاش السقف (S7). مفتاح الخدمة بس.';
revoke execute on function fn_otp_try(text, text) from public, anon, authenticated;

-- ===== اختبار =====
create or replace function test_otp_hardening()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  ok1 boolean;
  ok2 boolean;
  n   int;
  b   text := 'test:' || gen_random_uuid()::text;
begin
  test := '0070 · fn_otp_try موجودة ومقفولة على العضو';
  if not exists (select 1 from pg_proc where proname = 'fn_otp_try') then
    result := 'فشل — الدالة مش موجودة';
  elsif has_function_privilege('authenticated', 'fn_otp_try(text, text)', 'execute')
     or has_function_privilege('anon', 'fn_otp_try(text, text)', 'execute') then
    result := 'فشل — العضو يقدر ينفّذها';
  else
    result := 'نجح';
  end if;
  return next;

  test := '0070 · fn_otp_try بتقفل الصف (for update)';
  if (select prosrc from pg_proc where proname = 'fn_otp_try') like '%for update%' then
    result := 'نجح';
  else
    result := 'فشل — من غير قفل، المتوازي هيعدّي';
  end if;
  return next;

  test := '0070 · fn_rate_hit بتعدّ وبتوقف عند الحد';
  select fn_rate_hit(b, 2, 3600) into ok1;   -- 1 من 2
  perform fn_rate_hit(b, 2, 3600);            -- 2 من 2
  select fn_rate_hit(b, 2, 3600) into ok2;   -- 3 → المفروض false
  if ok1 and not ok2 then
    result := 'نجح';
  else
    result := format('فشل — الأولى=%s والتالتة=%s', ok1, ok2);
  end if;
  delete from rate_hits where bucket = b;
  return next;

  test := '0070 · حدود الـOTP في settings';
  select otp_max_attempts into n from settings limit 1;
  if n is null then
    result := 'فشل — الأعمدة مش موجودة';
  else
    result := format('نجح — %s محاولات', n);
  end if;
  return next;

  test := '0070 · rate_hits مقفول على العضو';
  if has_table_privilege('anon', 'rate_hits', 'select')
  or has_table_privilege('authenticated', 'rate_hits', 'select') then
    result := 'فشل — العضو يقدر يقراه';
  else
    result := 'نجح';
  end if;
  return next;
end;
$$;

comment on function test_otp_hardening() is 'بتتأكد إن تخمين الرمز بالتوازي اتقفل. select * from test_otp_hardening();';
revoke execute on function test_otp_hardening() from public, anon, authenticated;
