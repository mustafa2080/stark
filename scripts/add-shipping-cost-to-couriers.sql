-- Migration: إضافة column shipping_cost لجدول shipping_companies
-- تكلفة الشحن الثابتة التي يأخذها المندوب عن كل طلب/شحنة
-- التاريخ: 2025-06-17

ALTER TABLE shipping_companies
  ADD COLUMN IF NOT EXISTS shipping_cost DECIMAL(10,2) NULL COMMENT 'تكلفة الشحن لكل طلب بالجنيه' AFTER zone_ids;
