-- الدفع بقى يدوي بس: تحويل على فودافون كاش أو إنستا باي، والإدارة بتأكد.
-- (إضافة قيمة للنوع المعدود لازم تبقى لوحدها قبل ما تتستخدم)
alter type payment_provider_t add value if not exists 'vodafone_cash';;
