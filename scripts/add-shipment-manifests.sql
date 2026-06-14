-- Migration: إنشاء جداول بيانات الشحنات
-- بيانات مستقلة عن بيانات الطلبات (shipping_manifests)

CREATE TABLE IF NOT EXISTS `shipment_manifests` (
  `id`                  INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `tenant_id`           INT,
  `manifest_number`     VARCHAR(100) NOT NULL,
  `shipping_company_id` INT          NOT NULL,
  `status`              VARCHAR(50)  NOT NULL DEFAULT 'open',
  `notes`               TEXT,
  `invoice_price`       DECIMAL(10,2),
  `invoice_notes`       TEXT,
  `manual_shipping_cost` DECIMAL(10,2),
  `created_at`          DATETIME     NOT NULL,
  `closed_at`           DATETIME,
  CONSTRAINT `fk_sm_company` FOREIGN KEY (`shipping_company_id`)
    REFERENCES `shipping_companies` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `shipment_manifest_items` (
  `id`              INT         NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `manifest_id`     INT         NOT NULL,
  `shipment_id`     INT         NOT NULL,
  `delivery_status` VARCHAR(50) NOT NULL DEFAULT 'pending',
  `delivery_note`   TEXT,
  `delivered_at`    DATETIME,
  `return_received` INT,
  `added_at`        DATETIME    NOT NULL,
  CONSTRAINT `fk_smi_manifest`  FOREIGN KEY (`manifest_id`)  REFERENCES `shipment_manifests` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_smi_shipment`  FOREIGN KEY (`shipment_id`)  REFERENCES `shipments` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
