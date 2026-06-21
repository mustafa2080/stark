-- Migration: إضافة عمود courier_cost_manual لجدول shipment_manifests
-- تكلفة الشحنة للمندوب (تُدخل يدوياً على مستوى البيان) لاستخدامها في حسابات بيان التسوية

ALTER TABLE `shipment_manifests`
  ADD COLUMN `courier_cost_manual` DECIMAL(10,2) NULL;
