# RUNBOOK.md — تشغيل نسبوط

دليل التشغيل اليومي. كل الأوامر مكتوبة كاملة، وكل إجراء فيه خطواته بالترتيب.

---

## 0. المشروع

| | |
|---|---|
| Supabase | `nasbot-prod` · `nutmgtulrqrfaysrigfi` |
| المنطقة | `eu-central-1` (فرانكفورت) |
| الرابط | `https://nutmgtulrqrfaysrigfi.supabase.co` |
| Postgres | 17 |

> ⚠ في مشروع تاني على نفس الحساب (`rhvskbkyzlfdpxjrgyju`) فيه **نظام موارد بشرية شغّال**.
> **ما تلمسوش.** كل شغل نسبوط على `nutmgtulrqrfaysrigfi` بس.

---

## 1. تشغيل محلي

```bash
npm install
cp .env.example .env.local
```

املا في `.env.local`:
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — من لوحة Supabase ← Project Settings ← API
- `SUPABASE_SERVICE_ROLE_KEY` — نفس المكان (**الخادم بس**)

```bash
npm run dev
```

### من غير مفاتيح؟

الموقع بيشتغل عادي على **بيانات وهمية** (`src/lib/api-mock.ts`). ده مقصود:
أي حد يقدر يشغّل الواجهات من غير وصول للقاعدة.

---

## 2. الهجرات

الهجرات في `supabase/migrations/` مرقّمة. لتصديرها من القاعدة للمستودع:

```bash
npx tsx scripts/dump-migrations.ts
```

لتطبيق هجرة جديدة: اكتبها كملف مرقّم، وطبّقها من لوحة Supabase (SQL Editor)
أو بـ `supabase db push` لو الـ CLI متربوط.

> **Docker مش متسطب على الجهاز ده**، فـ `supabase start` (البيئة المحلية) مش هيشتغل.
> الشغل كله على المشروع البعيد. لو عايز بيئة محلية: سطّب Docker Desktop الأول.

---

## 3. الاختبارات

```bash
npx playwright install chromium   # أول مرة بس
npm test
```

- **اختبارات الواجهة** بتشتغل على منفذ 3100 **من غير مفاتيح** — ثابتة ومستقلة.
- **اختبارات القاعدة** (`tests/db.spec.ts`) بتشتغل بس لو المفاتيح موجودة، وبتتخطى نفسها لو لأ.

### اختبارات السياسات (SQL)

```sql
select * from test_rls();
```

لازم كل الصفوف تقول «نجح». بتغطي:
1. عضو ما يشوفش ملف/صورة عضو تاني
2. محدش بيقرأ `pair_affinity`
3. حد مش عضو ما يكتبش في غرفة
4. العنوان مخفي عن غير الحاجزين
5. العميل ما يقدرش يدّعي «إحنا لغينا»
6. العضو ما يقدرش يأكد تحويله بنفسه

> الاختبار بيلغي حجز مريم كجزء منه. لإرجاعه:
> ```sql
> update bookings set status='paid', cancelled_at=null, cancel_reason=null, refund_kind=null
> where id='aaaaaaaa-0000-0000-0000-000000000001';
> delete from wallet_ledger where profile_id='33333333-0000-0000-0000-000000000001' and reason='refund_credit';
> delete from behavior_flags where profile_id='33333333-0000-0000-0000-000000000001' and kind='late_cancel';
> update sbotat set status='full' where id='77777777-0000-0000-0000-000000000001';
> ```

---

## 4. إضافة سبوطة

```sql
insert into sbotat (template_id, venue_id, captain_id, starts_at, ends_at,
                    price, org_fee, capacity, status)
values (
  (select id from sbota_templates where slug = 'ehna-el-rabe3'),
  (select id from venues where name like 'ملاعب النادي%'),
  (select id from captains c join profiles p on p.id = c.profile_id where p.first_name = 'يوسف'),
  next_cairo(4, 20),                       -- الخميس 8 بالليل
  next_cairo(4, 20) + interval '2 hours',
  30000,   -- 300 جنيه بالقروش
  4000,    -- 40 جنيه رسوم تنظيم
  8,
  'open'
);
```

**التوقيتات الأربعة بتتحسب لوحدها** (`booking_closes_at` · `reveal_at` · `chat_opens_at`
· `chat_closes_at`) — ما تكتبهاش بإيدك.

`next_cairo(dow, hour)`: 0 = الحد … 4 = الخميس · 5 = الجمعة.

---

## 5. مراجعة تحويل يدوي

**الدفع كله يدوي دلوقتي.** مفيش بوابة ومفيش رقم بطاقة بيعدي علينا خالص.

### إزاي بيمشي

```
العضو يختار فودافون كاش أو إنستا باي
   ↓  /api/pay/create        → حجز pending_payment (مهلة ساعة) + الرقم بيظهرله
العضو يحوّل ويرفع صورة التحويل
   ↓  /api/pay/transfer      → الدفعة pending_review (المهلة بتبقى 24 ساعة)
الإدارة تراجع من /admin
   ↓  fn_approve_transfer    → الحجز paid + رسالة تأكيد على واتساب
```

> **الحجز ما بيبقاش `paid` من المتصفح أبدًا.** `fn_approve_transfer` للإدارة بس،
> وفي اختبار في `test_rls()` بيتأكد إن العضو ما يقدرش يأكد تحويله بنفسه.

### الخطوات

1. `/admin` ← تبويب **المدفوعات** ← دوّر على `pending_review`.
2. اضغط **«شوف الإيصال»** — بيفتح رابط موقّع صالح 5 دقايق.
3. طابق المبلغ والتاريخ.
4. **أكّد** → الحجز بيبقى `paid` والرسالة بتتبعت لوحدها.
   **ارفض** → الحجز بيتلغي والعضو بياخد رسالة إن مفيش حاجة اتخصمت.

### من SQL

```sql
-- التحويلات المستنية
select p.id, p.provider, p.amount/100 as جنيه, p.receipt_path,
       pr.first_name, pr.phone, t.name_ar
from payments p
join bookings b on b.id = p.booking_id
join profiles pr on pr.id = b.profile_id
join sbotat s on s.id = b.sbota_id
join sbota_templates t on t.id = s.template_id
where p.status = 'pending_review'
order by p.created_at;

-- تأكيد
select fn_approve_transfer('<payment_id>', true);

-- رفض
select fn_approve_transfer('<payment_id>', false, 'المبلغ ناقص');
```

### تغيير أرقام التحويل

```sql
update settings
set vodafone_number = '010 1234 5678',
    instapay_handle = 'nasbot@instapay',
    manual_review_hours = 2;
```

بيتغيّر على الموقع فورًا من غير نشر.

---

## 6. استرداد

### إلغاء من عندنا (سبوطة اتلغت)

```sql
select fn_cancel_booking('<booking_id>', 'us', 'الطقس');
```

بيدي **استرداد كامل + رصيد اعتذار 10%**.

> `'us'` بتشتغل بس من الإدارة أو من الخادم. لو العميل بعتها، النظام بيتجاهلها
> وبيعاملها كإلغاء عميل عادي.

### إلغاء من العميل

بيحصل لوحده من الموقع. النسب من `settings`:

```sql
select refund_full_days, refund_half_days, refund_credit_hours from settings;
```

**الحالي:** 3 أيام = استرداد كامل · أقل من 48 ساعة = رصيد لأول مرة.
لتغيير السياسة:

```sql
update settings set refund_full_days = 5, refund_half_days = 3;
```

> ⚠ لو غيّرت النسب، **غيّر نص الضمان في `COPY.md` وفي الصفحات** علشان يطابق.
> النص المنشور دلوقتي: «لو أنت لغيت قبل 3 أيام، فلوسك كاملة.»

### إلغاء سبوطة كاملة

```sql
update sbotat set status = 'cancelled', cancel_reason = 'السبب' where id = '<sbota_id>';

do $$ declare r record; begin
  for r in select id from bookings where sbota_id = '<sbota_id>' and status = 'paid'
  loop perform fn_cancel_booking(r.id, 'us', 'السبوطة اتلغت'); end loop;
end $$;
```

---

## 7. حظر مستخدم

```sql
update profiles set banned_at = now(), ban_reason = 'السبب' where id = '<profile_id>';
```

بعدها `fn_can_book` بترفض أي حجز جديد. لشيله من غرفة:

```sql
update chat_members set removed_at = now(), removed_by = '<admin_id>'
where profile_id = '<profile_id>' and room_id = '<room_id>';
```

---

## 8. طلبات قانون حماية البيانات (151/2020)

### تصدير بيانات مستخدم

```sql
select
  (select to_jsonb(p) from profiles p where p.id = '<id>')                        as profile,
  (select jsonb_agg(to_jsonb(b)) from bookings b where b.profile_id = '<id>')     as bookings,
  (select jsonb_agg(to_jsonb(r)) from reviews r where r.profile_id = '<id>')      as reviews,
  (select jsonb_agg(to_jsonb(m)) from messages m where m.sender_id = '<id>')      as messages,
  (select jsonb_agg(to_jsonb(w)) from wallet_ledger w where w.profile_id = '<id>') as wallet;
```

### حذف حساب

المستخدم بيحذف من `/me` ← الدالة `fn_soft_delete_profile()`:
- بتخفي الاسم والإيميل والصورة **فورًا**
- بتحط `deleted_at`
- المسح النهائي بعد **30 يوم** عبر `job_purge()`

للحذف الفوري (طلب رسمي):

```sql
update profiles set deleted_at = now() - interval '31 days' where id = '<id>';
select job_purge();
```

> سجلات الدفع بتفضل **بدون بيانات شخصية** — مطلوبة ضريبيًا.

### النقل عبر الحدود

الاستضافة في فرانكفورت = نقل بيانات خارج مصر. **لازم ترخيص من مركز حماية
البيانات الشخصية قبل الإطلاق التجاري.** الهجرات كلها Postgres قياسي، فالانتقال
لاستضافة داخل مصر = نفس الملفات + بديل لـ `auth` و`storage`.

---

## 9. المهام المجدولة

```sql
select jobname, schedule, active from cron.job order by jobname;
```

| المهمة | كل | بتعمل إيه |
|---|---|---|
| `nasbot-reveal` | 10 د | كشف المجموعات اللي وصلت `reveal_at` |
| `nasbot-chats` | 10 د | قفل الغرف اللي عدى ميعادها |
| `nasbot-expire` | 5 د | إلغاء الحجوزات اللي مدفعتش في 15 دقيقة |
| `nasbot-reminders` | 15 د | تذكير 24 ساعة و3 ساعات |
| `nasbot-after` | 30 د | تسجيل الحضور · طلب التقييم · نشر الصور |
| `nasbot-winback` | يوميًا 18:00 | «الناس سألت عليك» لمن غاب 45 يوم |
| `nasbot-metrics` | يوميًا 03:00 | تحديث `weekly_metrics` |
| `nasbot-purge` | يوميًا 04:00 | مسح رموز التحقق والمحذوفين |

### تشغيل يدوي

```sql
select job_reveal_due();
select job_close_chats();
select job_reminders();
```

### إيقاف مهمة

```sql
select cron.unschedule('nasbot-winback');
```

### دوال الحافة

| الدالة | الرابط |
|---|---|
| `match` | `POST /functions/v1/match` — جسم فاضي = كل اللي قرب، أو `{"sbota_id":"…"}` |
| `notify` | `POST /functions/v1/notify` — بيفضّي طابور الإشعارات |

الاتنين `verify_jwt: false` لأنهم بيتنادوا من الجدولة. **لو فتحتهم للنت،
حطّ `CRON_SECRET` وتحقق منه جواهم.**

---

## 10. الإشعارات وواتساب

من غير `WHATSAPP_TOKEN` النظام بيشتغل **وضع محاكاة**: بيطبع في السجل
وبيعلّم الإشعار `sent`. المسار كله يتجرب من غير حساب أعمال.

### للتشغيل الحقيقي

1. حساب واتساب أعمال + رقم متحقق.
2. اعتماد **12 قالب** — الأسماء في `notification_templates.provider_template_id`.
3. `WHATSAPP_TOKEN` و`WHATSAPP_PHONE_ID` في متغيرات البيئة **وفي أسرار دوال الحافة**:
   لوحة Supabase ← Edge Functions ← Secrets.

### الإشعارات الفاشلة

```sql
select template_key, error, attempts, count(*)
from notifications where status = 'failed'
group by 1,2,3 order by count desc;
```

إعادة المحاولة:

```sql
update notifications set status='queued', attempts=0, scheduled_for=now()
where status='failed' and template_key='<key>';
```

---

## 11. الدفع

**يدوي بس دلوقتي** — راجع §5 للتشغيل اليومي.

### ليه مفيش بوابة

القرار إن المشروع لسه مش تجاري. والفايدة الجانبية إننا **بره نطاق PCI-DSS
تمامًا**: مفيش رقم بطاقة بيعدي على خوادمنا ولا بيتخزن عندنا، فمفيش استبيان
امتثال ولا تدقيق.

في اختبار Playwright اسمه **«الدفع يدوي بس»** بيفشل لو أي حد ضاف حقل بطاقة.

### الحجوزات العالقة

```sql
select b.id, b.created_at, b.expires_at, p.status
from bookings b left join payments p on p.booking_id = b.id
where b.status = 'pending_payment' order by b.created_at desc;
```

- **حوّل ورفع الإيصال** → `pending_review`، ومهلته 24 ساعة.
- **محوّلش** → `nasbot-expire` بيلغيه لوحده بعد ساعة.

### لما تحوّلها تجاري لاحقًا

الكود اتشال بالكامل (مفيش بوابة ولا ويبهوك). للرجوع:

1. أضف مزود في `src/lib/server/` بواجهة واحدة: `createIntent()` بترجّع رابط
   الصفحة المستضافة + `verifyHmac()` للتوقيع.
2. `/api/pay/create` يرجّع `redirectUrl` بدل `payTo`.
3. **مسار ويبهوك جديد هو الوحيد اللي يخلي الحجز `paid`** — بتوقيع HMAC
   و`idempotency_key` فريد علشان إعادة الإرسال ما تتحسبش مرتين.
4. `update settings set payment_provider = 'paymob';`
5. **ما ترجّعش حقول البطاقة** — التحويل للصفحة المستضافة يخلينا في SAQ-A.

---

## 12. النسخ الاحتياطي والاستعادة

Supabase بياخد نسخة يومية تلقائيًا (Project Settings ← Database ← Backups).

### نسخة يدوية

```bash
pg_dump "$SUPABASE_DB_URL" --no-owner --no-acl -Fc -f nasbot-$(date +%F).dump
```

### استعادة

```bash
pg_restore --no-owner --no-acl -d "$SUPABASE_DB_URL" nasbot-2026-09-08.dump
```

> استعادة كاملة بتمسح البيانات الحالية. **اعمل نسخة قبلها**، وجرّبها على
> فرع (Supabase Branch) الأول.

---

## 13. المراقبة السريعة

```sql
-- الأرقام الثمانية
select * from weekly_metrics order by week desc limit 4;

-- إشعارات عالقة
select count(*) from notifications where status = 'queued' and scheduled_for < now() - interval '10 minutes';

-- شكاوى مفتوحة
select count(*) from reports where status = 'open';

-- سبوطات قرب كشفها ولسه ما اتطابقتش
select id, starts_at from sbotat
where status in ('open','full') and reveal_at < now() + interval '2 hours'
  and not exists (select 1 from matching_runs m where m.sbota_id = sbotat.id);
```

### فحص الأمان الدوري

من لوحة Supabase ← Advisors، أو عبر MCP. **لازم يفضل صفر تحذيرات أمنية.**

---

## 14. لسه محتاج مفاتيح

| الحاجة | بيوقّف إيه | من غيرها بيحصل إيه |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | الدخول · الدفع · إنستا باي | مسارات `/api` بترجّع خطأ واضح |
| واتساب أعمال + 12 قالب | إرسال حقيقي | وضع محاكاة — بيطبع في السجل |
| ~~حساب بايموب/كاشير~~ | — | **مش مطلوب** — الدفع يدوي |
| ترخيص نقل البيانات | الإطلاق التجاري | — |

---

## 15. إشعارات الشغل بالإيميل — `/api/cron/work-notify`

مهام الشغل ومحفّز التبادل بيكتبوا في `notifications` بقناة `whatsapp` وحالة `queued`.
واتساب لسه مقفول (مفيش مفاتيح Meta)، فالصفوف دي كانت بتقف للأبد.
المسار ده بياخد **لحد 20 صف** مفتاحهم بيبدأ بـ `work_`، يركّب نص
`notification_templates.body_ar` بالـ `payload`، ويبعته إيميل، ويقفل الصف
(`status='sent'` + `sent_at`). الفشل بيتسجّل في `error` وبيتحاول 3 مرات بالكتير
وبعدها `status='failed'`. باقي الإشعارات (غير `work_`) ما بتتلمسش.

**الفحص اليدوي:**

```bash
curl -s -H "x-nasbot-secret: $CRON_SECRET" https://nasbot.app/api/cron/work-notify | jq
# {"ok":true,"picked":3,"sent":3,"failed":0,"left":0,"errors":[]}
```

```sql
-- إيه اللي لسه واقف
select template_key, count(*) from notifications
where status = 'queued' and template_key like 'work\_%' group by 1;

-- اللي فشل وليه
select id, template_key, attempts, error from notifications
where status = 'failed' and template_key like 'work\_%' order by created_at desc limit 20;
```

### الجدولة — pg_cron + `net.http_post` (المسار المعتمد)

الامتدادين مفعّلين من هجرة 0026 (`pg_cron` و`pg_net`)، وباقي المهام كلها هنا
(§9). الفرق الوحيد إن المهمة دي بتنده مسار على Vercel مش دالة في القاعدة.
السر بيتحط في Vault مرة واحدة علشان ما يتكتبش في `cron.job` بالنص الصريح:

```sql
-- مرة واحدة: خزّن السر
select vault.create_secret('<CRON_SECRET نفسه اللي في Vercel>', 'nasbot_cron_secret');

-- المهمة: كل ساعة عند الدقيقة 5
select cron.schedule(
  'nasbot-work-notify',
  '5 * * * *',
  $$
  select net.http_post(
    url     := 'https://nasbot.app/api/cron/work-notify',
    headers := jsonb_build_object(
                 'content-type',    'application/json',
                 'x-nasbot-secret', (select decrypted_secret from vault.decrypted_secrets
                                      where name = 'nasbot_cron_secret')
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
```

`net.http_post` **غير متزامنة**: بترجّع `request_id` على طول، والرد بيتسجّل في
`net._http_response`. يعني لو المسار رجّع 401 المهمة تفضل «ناجحة» في
`cron.job_run_details` — الفحص الصح:

```sql
select r.status_code, r.error_msg, r.created
from net._http_response r order by r.created desc limit 10;
```

للإلغاء: `select cron.unschedule('nasbot-work-notify');`

### البديل — Vercel Cron

`DEPLOY_CHECKLIST §2` بتقول «متضيفش crons في vercel.json»، والسبب إن Hobby
بتسمح بمهمتين يوميًا بس (يعني مرة كل 24 ساعة — الإشعار ممكن يوصل متأخر يوم).
لو المشروع بقى Pro أو حبيت تستهلك واحدة من المهمتين، **أنا ما لمستش
`vercel.json`** — ده اللي يتزوّد فيه:

```json
{
  "crons": [{ "path": "/api/cron/work-notify", "schedule": "5 * * * *" }]
}
```

Vercel Cron بيبعت `Authorization: Bearer $CRON_SECRET` من متغيّر البيئة
`CRON_SECRET` نفسه، وما بيعرفش يبعت هيدر باسم من عندنا — عشان كده المسار
بيقبل الشكلين (`x-nasbot-secret` أو `Authorization: Bearer`)، بنفس السر.

### البديل التالت — نداء من بره

أي خدمة بتنده رابط بجدول (cron-job.org مثلًا) وبتسمح بهيدر مخصص:
`GET https://nasbot.app/api/cron/work-notify` بهيدر `x-nasbot-secret`.
عيبه إنه طرف تالت زيادة، وميزته إنه بيديك سجل بالردود الحقيقية (بعكس
`net.http_post` غير المتزامنة).

| الاختيار | التكرار | بيشوف رد المسار؟ | ملاحظة |
|---|---|---|---|
| pg_cron + `net.http_post` | أي تكرار | لأ — من `net._http_response` بس | نفس نمط باقي المهام، صفر خدمات زيادة |
| Vercel Cron | مرتين يوميًا على Hobby | أيوه في سجل Vercel | بيكسر قاعدة `DEPLOY_CHECKLIST §2` |
| نداء من بره | أي تكرار | أيوه | طرف تالت |
