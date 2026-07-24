-- إضافة عمود portal_client_id لجدول pickup_requests — يربط بجدول clients الجديد (بوابة العميل بعد التوحيد)
ALTER TABLE `pickup_requests`
  ADD COLUMN IF NOT EXISTS `portal_client_id` INT NULL;

CREATE INDEX IF NOT EXISTS idx_pickup_requests_portal_client_id ON `pickup_requests` (`portal_client_id`);

-- ترحيل: لكل طلب التقاط قديم مربوط بـ receiver_client_id، لاقي نفس العميل في clients عن طريق normalized_phone
UPDATE `pickup_requests` pr
JOIN `receiver_clients` rc ON rc.id = pr.receiver_client_id
JOIN `clients` c ON c.normalized_phone = rc.normalized_phone AND c.normalized_phone IS NOT NULL
SET pr.portal_client_id = c.id
WHERE pr.receiver_client_id IS NOT NULL;

SELECT 'portal_client_id column' AS check_name, COUNT(*) AS result
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pickup_requests' AND COLUMN_NAME = 'portal_client_id'
UNION ALL
SELECT 'pickup requests linked', COUNT(*) FROM `pickup_requests` WHERE portal_client_id IS NOT NULL;
