-- Migration: إضافة column zone_ids لجدول shipping_companies
-- يدعم ربط المندوب بأكثر من زون شحن واحد
-- التاريخ: 2025-06-17

ALTER TABLE shipping_companies
  ADD COLUMN IF NOT EXISTS zone_ids TEXT NULL COMMENT 'JSON array of zone IDs e.g. [1,3,5]' AFTER zone_id;

-- ملاحظة: zone_id القديم يبقى للتوافق، zone_ids هو المصدر الأساسي الجديد
