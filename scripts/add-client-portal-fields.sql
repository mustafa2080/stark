-- ─── ترحيل بوابة العميل من receiver_clients إلى clients (التجاري) ──────────
-- Migration: إضافة حقول بوابة العميل لجدول clients + عمود client_id لجدول users
-- ثم ترحيل البيانات من receiver_clients (لو موجودة) إلى clients

-- 1) أعمدة جديدة في جدول clients
ALTER TABLE `clients`
  ADD COLUMN IF NOT EXISTS `normalized_phone`      VARCHAR(20)  NULL,
  ADD COLUMN IF NOT EXISTS `account_number`         VARCHAR(50)  NULL,
  ADD COLUMN IF NOT EXISTS `payment_method`         VARCHAR(30)  DEFAULT 'cod',
  ADD COLUMN IF NOT EXISTS `account_status`         VARCHAR(20)  NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS `last_closed_period_to`  DATETIME     NULL,
  ADD COLUMN IF NOT EXISTS `suspended_at`           DATETIME     NULL,
  ADD COLUMN IF NOT EXISTS `suspended_by_user_id`   INT          NULL,
  ADD COLUMN IF NOT EXISTS `suspended_by_name`      VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS `suspend_reason`         TEXT         NULL;

CREATE INDEX IF NOT EXISTS idx_clients_normalized_phone ON `clients` (`normalized_phone`);

-- 2) عمود client_id في جدول users (رابط بحساب العميل التجاري)
ALTER TABLE `users`
  ADD COLUMN IF NOT EXISTS `client_id` INT NULL;

CREATE INDEX IF NOT EXISTS idx_users_client_id ON `users` (`client_id`);

-- 3) ترحيل البيانات من receiver_clients إلى clients (لو الجدول موجود وفيه صفوف)
-- ملحوظة: شغّل ده مرة واحدة بس. لو receiver_clients فاضي أو مش موجود، الاستعلام مش هيأثر على حاجة.

INSERT INTO `clients`
  (tenant_id, name, phone, normalized_phone, email, address, city, avatar,
   account_number, credit_limit, payment_method, account_status, notes,
   last_closed_period_to, suspended_at, suspended_by_user_id, suspended_by_name, suspend_reason,
   client_type, is_active, created_at, updated_at)
SELECT
  rc.tenant_id, rc.name, rc.phone, rc.normalized_phone, rc.email, rc.address, rc.city, rc.avatar,
  rc.account_number, COALESCE(rc.credit_limit, 0), COALESCE(rc.payment_method, 'cod'), COALESCE(rc.account_status, 'active'), rc.internal_notes,
  rc.last_closed_period_to, rc.suspended_at, rc.suspended_by_user_id, rc.suspended_by_name, rc.suspend_reason,
  'normal', 1, rc.created_at, rc.updated_at
FROM `receiver_clients` rc
WHERE NOT EXISTS (
  SELECT 1 FROM `clients` c WHERE c.normalized_phone = rc.normalized_phone AND c.normalized_phone IS NOT NULL
);

-- 4) تحديث users.client_id لكل يوزر كان مربوط بـ receiver_clients، عن طريق مطابقة رقم التليفون
UPDATE `users` u
JOIN `receiver_clients` rc ON rc.id = u.receiver_client_id
JOIN `clients` c ON c.normalized_phone = rc.normalized_phone AND c.normalized_phone IS NOT NULL
SET u.client_id = c.id
WHERE u.receiver_client_id IS NOT NULL;

-- 5) تأكيد النتيجة
SELECT 'clients columns' AS check_name, COUNT(*) AS result
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'clients' AND COLUMN_NAME = 'normalized_phone'
UNION ALL
SELECT 'users.client_id column', COUNT(*)
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'client_id'
UNION ALL
SELECT 'migrated clients count', COUNT(*) FROM `clients` WHERE account_number IS NOT NULL
UNION ALL
SELECT 'users linked to client_id', COUNT(*) FROM `users` WHERE client_id IS NOT NULL;
