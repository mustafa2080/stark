-- Migration: إضافة أعمدة "القيمة المستلمة فعليًا" لبيان حساب العميل
-- نفس الأعمدة الموجودة أصلًا في shipment_manifest_items، عشان بيان حساب
-- العميل يقدر يسجّل زيادة/نقص المندوب عن الإجمالي الأصلي للأوردر، ويدخل
-- الفرق فعليًا في حساب إجمالي الإيرادات بدل ما يتجاهله.

ALTER TABLE `client_account_manifest_items`
  ADD COLUMN `return_value_received`    DECIMAL(10,2) NULL AFTER `return_reason`,
  ADD COLUMN `delivered_value_received` DECIMAL(10,2) NULL AFTER `return_value_received`;
