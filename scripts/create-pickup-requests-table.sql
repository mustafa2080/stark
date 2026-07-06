-- Migration: Create pickup_requests table
-- طلبات الالتقاط (Pickup Requests) — يستخدمها العميل من بوابة client-portal

CREATE TABLE IF NOT EXISTS `pickup_requests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NULL,
  `request_number` VARCHAR(50) NULL,

  `client_id` INT NULL,
  `receiver_client_id` INT NULL,

  `pickup_contact_name` VARCHAR(255) NOT NULL,
  `pickup_phone` VARCHAR(50) NOT NULL,
  `pickup_address` TEXT NOT NULL,
  `pickup_city` VARCHAR(100) NULL,
  `pieces_count` INT DEFAULT 1,
  `estimated_weight` DECIMAL(8,2) NULL,
  `notes` TEXT NULL,

  `preferred_date` DATETIME NULL,
  `preferred_time_slot` VARCHAR(50) NULL,

  `status` VARCHAR(30) NOT NULL DEFAULT 'pending',
  `assigned_user_id` INT NULL,
  `rejection_reason` TEXT NULL,

  `resulting_shipment_id` INT NULL,

  `created_by_user_id` INT NULL,
  `picked_up_at` DATETIME NULL,
  `deleted_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL,
  `updated_at` DATETIME NOT NULL,

  INDEX `idx_pickup_tenant` (`tenant_id`),
  INDEX `idx_pickup_receiver_client` (`receiver_client_id`),
  INDEX `idx_pickup_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
