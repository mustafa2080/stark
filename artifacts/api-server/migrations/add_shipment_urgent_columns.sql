-- إضافة عمودي isUrgent و urgentNote لجدول shipments
-- عشان زرار "استعجال" يشتغل على مستوى الشحنة نفسها بدون الحاجة لوجودها في بيان
ALTER TABLE shipments
  ADD COLUMN is_urgent INT DEFAULT 0,
  ADD COLUMN urgent_note TEXT;
