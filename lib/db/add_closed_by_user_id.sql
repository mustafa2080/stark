-- Migration: أضف عمود closed_by_user_id لجدول shipment_manifests
-- بيسجّل آيدي اليوزر (مندوب/أدمن) اللي قفل البيان فعليًا، عشان نعرف نعرض اسمه
ALTER TABLE shipment_manifests
  ADD COLUMN closed_by_user_id INT NULL AFTER closed_by_role;
