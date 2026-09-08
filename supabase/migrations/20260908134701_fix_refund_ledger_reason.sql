-- غلطة في fn_issue_refund: كنت بكتب سبب 'refund' في wallet_ledger
-- والقيمة دي مش موجودة في ledger_reason_t — الصح 'refund_credit'.
-- كده أي استرداد على المحفظة كان هيقع وقت التنفيذ.
--
-- وكمان بنزوّد سبب للتعديل اليدوي من الإدارة، لأن مكانش فيه واحد مناسب
-- وكنا هنضطر نستعمل سبب تاني في غير محله.

alter type ledger_reason_t add value if not exists 'admin_adjust';;
