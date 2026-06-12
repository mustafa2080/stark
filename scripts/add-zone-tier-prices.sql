-- ─── إضافة أسعار التيرز لجدول مناطق الشحن ──────────────────────────────────
-- normal = 1–200 شحنة/شهر | commercial = 201–500 | vip = 501–1000

ALTER TABLE shipment_zones
  ADD COLUMN IF NOT EXISTS price_normal     DECIMAL(10,2) DEFAULT 0 AFTER price,
  ADD COLUMN IF NOT EXISTS price_commercial DECIMAL(10,2) DEFAULT 0 AFTER price_normal,
  ADD COLUMN IF NOT EXISTS price_vip        DECIMAL(10,2) DEFAULT 0 AFTER price_commercial;

-- نسخ السعر الحالي كـ fallback للعميل العادي
UPDATE shipment_zones
SET price_normal = price
WHERE price_normal = 0 AND price > 0;
