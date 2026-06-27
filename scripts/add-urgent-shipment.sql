-- إضافة نظام الاستعجال للشحنات في البيان
ALTER TABLE shipment_manifest_items
  ADD COLUMN IF NOT EXISTS is_urgent    INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS urgent_note  VARCHAR(255),
  ADD COLUMN IF NOT EXISTS urgent_at    DATETIME;
