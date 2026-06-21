-- Migration: warehouse courier fields + transfers table
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS courier_name  VARCHAR(255) NULL AFTER assigned_user_id,
  ADD COLUMN IF NOT EXISTS courier_phone VARCHAR(50)  NULL AFTER courier_name;

ALTER TABLE warehouses
  ADD COLUMN IF NOT EXISTS city VARCHAR(100) NULL AFTER address;

CREATE TABLE IF NOT EXISTS warehouse_transfers (
  id                  INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  tenant_id           INT          NULL,
  shipment_id         INT          NOT NULL,
  from_warehouse_id   INT          NULL,
  to_warehouse_id     INT          NULL,
  notes               TEXT         NULL,
  created_by_user_id  INT          NULL,
  created_by_name     VARCHAR(255) NULL,
  created_at          DATETIME     NOT NULL
);
