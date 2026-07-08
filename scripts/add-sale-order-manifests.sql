-- بيان حساب العميل الخاص بفواتير البيع (Sale Order Manifests)
CREATE TABLE IF NOT EXISTS `sale_order_manifests` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `tenant_id` INT NULL,
  `manifest_number` VARCHAR(100) NOT NULL,
  `client_id` INT NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'open',
  `notes` TEXT NULL,
  `invoice_price` DECIMAL(10,2) NULL,
  `invoice_notes` TEXT NULL,
  `created_at` DATETIME NOT NULL,
  `closed_at` DATETIME NULL,
  INDEX `idx_som_client` (`client_id`),
  INDEX `idx_som_status` (`status`),
  INDEX `idx_som_tenant` (`tenant_id`),
  CONSTRAINT `fk_som_client` FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `sale_order_manifest_items` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `manifest_id` INT NOT NULL,
  `sale_order_id` INT NOT NULL,
  `added_at` DATETIME NOT NULL,
  INDEX `idx_somi_manifest` (`manifest_id`),
  INDEX `idx_somi_order` (`sale_order_id`),
  CONSTRAINT `fk_somi_manifest` FOREIGN KEY (`manifest_id`) REFERENCES `sale_order_manifests`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_somi_order` FOREIGN KEY (`sale_order_id`) REFERENCES `sale_orders`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
