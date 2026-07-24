-- ─── دعم بيانات الشحن الخاصة بالعملاء التجاريين ────────────────────────────
-- Migration: shipping_company_id يصبح NULL-able، وإضافة عمود client_id
-- الجدول القديم (بيانات المناديب) يفضل شغّال بدون أي تأثير — clientId هتفضل
-- NULL للسجلات القديمة، وshipping_company_id هيفضل NULL للبيانات الجديدة
-- الخاصة بالعملاء.

ALTER TABLE `shipment_manifests`
  MODIFY COLUMN `shipping_company_id` INT NULL;

ALTER TABLE `shipment_manifests`
  ADD COLUMN IF NOT EXISTS `client_id` INT NULL;

CREATE INDEX IF NOT EXISTS idx_shipment_manifests_client_id ON `shipment_manifests` (`client_id`);

-- تأكيد النتيجة
SELECT 'shipment_manifests.client_id column' AS check_name, COUNT(*) AS result
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_manifests' AND COLUMN_NAME = 'client_id'
UNION ALL
SELECT 'shipping_company_id is nullable', COUNT(*)
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shipment_manifests' AND COLUMN_NAME = 'shipping_company_id' AND IS_NULLABLE = 'YES';
