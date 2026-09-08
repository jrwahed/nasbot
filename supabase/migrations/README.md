# الهجرات

الهجرات الـ 27 كلها **مطبّقة على المشروع البعيد** (`nutmgtulrqrfaysrigfi`)
ومسجّلة في `supabase_migrations.schema_migrations`.

## تصديرها لملفات هنا

```bash
npx tsx scripts/dump-migrations.ts
```

محتاج `SUPABASE_SERVICE_ROLE_KEY` في `.env.local`.
السكريبت بيكتب ملف لكل هجرة باسمها ورقمها.

## عرضها من غير تصدير

```sql
select version, name from supabase_migrations.schema_migrations order by version;
```

## ترتيب الهجرات

| # | الاسم | بتعمل إيه |
|---|---|---|
| 0001 | extensions_and_enums | الامتدادات و30 نوع معدود |
| 0002 | people | profiles · interests · skill_levels · captains |
| 0003 | supply | venues · sbota_templates · sbotat · groups · clues |
| 0004 | demand | bookings · payments · refunds · wallet · coupons · referrals |
| 0005 | matching_and_chat | matching_runs · pair_affinity · rooms · messages · reports |
| 0006 | reviews_photos_ops | reviews · photos · notifications · otp · audit · settings |
| 0007 | functions | دوال العرض والتحقق والمجمّعات |
| 0008 | booking_lifecycle | fn_booking_paid · fn_cancel_booking · مكافأة الإحالة |
| 0009 | rls | تفعيل RLS وكل السياسات |
| 0010 | harden_functions | تثبيت search_path + إصلاح ثغرة تصعيد في الإلغاء |
| 0011 | lock_function_execute | سحب EXECUTE من PUBLIC ومنح انتقائي |
| 0012 | seed_dictionaries | الاهتمامات · قوالب الإشعارات · الكوبونات |
| 0013 | seed_people_and_supply | الكباتن · الأشخاص · الأماكن · القوالب |
| 0014 | seed_sbotat_and_demo | المواعيد · المجموعة · الشات · الأدلة |
| 0015 | group_members_view | fn_group_members · fn_met_before |
| 0016 | fix_chat_members_recursion | إصلاح تكرار لا نهائي في سياسة chat_members |
| 0017–0018 | rls_tests | دالة test_rls() |
| 0019 | fix_cancel_status_cast | إصلاح cast في fn_cancel_booking |
| 0020 | dump_migrations_helper | أداة التصدير |
| 0021 | template_meta_prefix | سطر الميتا والمستوى |
| 0022 | grant_policy_helpers_to_anon | دوال السياسات للزائر |
| 0023 | seed_real_weekdays | المواعيد بأيامها الحقيقية |
| 0024 | public_view_is_boundary | العرض العام هو حدّ الأمان |
| 0025 | storage_buckets | الدلاء الأربعة وسياساتها |
| 0026 | scheduled_functions | fn_reveal ومهام الجدولة |
| 0027 | weekly_metrics_and_cron | الأرقام الثمانية + 8 مهام pg_cron |
