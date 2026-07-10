-- Migration: add is_replacement_requested to orders and shipments tables
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS is_replacement_requested INT DEFAULT 0;

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS is_replacement_requested INT DEFAULT 0;
