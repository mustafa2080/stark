CREATE TABLE IF NOT EXISTS `notifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NULL,
  `type` VARCHAR(50) NOT NULL,
  `severity` VARCHAR(20) NOT NULL DEFAULT 'info',
  `title` VARCHAR(255) NOT NULL,
  `message` TEXT NULL,
  `entity_type` VARCHAR(100) NULL,
  `entity_id` INT NULL,
  `link` VARCHAR(255) NULL,
  `is_read` BOOLEAN NOT NULL DEFAULT FALSE,
  `read_by` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_notifications_tenant_created` (`tenant_id`, `created_at`),
  INDEX `idx_notifications_type` (`type`)
);
