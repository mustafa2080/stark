-- Migration: client account periods (real period lock) + adjustments + last_closed_period_to

ALTER TABLE receiver_clients
  ADD COLUMN IF NOT EXISTS last_closed_period_to DATETIME DEFAULT NULL;

CREATE TABLE IF NOT EXISTS client_account_periods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT DEFAULT NULL,

  client_phone VARCHAR(50) NOT NULL,
  normalized_phone VARCHAR(20) NOT NULL,

  period_from DATE NOT NULL,
  period_to DATE NOT NULL,

  opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_debit DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_credit DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_adjustments DECIMAL(14,2) NOT NULL DEFAULT 0,
  closing_balance DECIMAL(14,2) NOT NULL DEFAULT 0,

  orders_count INT NOT NULL DEFAULT 0,
  order_ids TEXT DEFAULT NULL,

  notes TEXT DEFAULT NULL,

  closed_by_user_id INT DEFAULT NULL,
  closed_by_name VARCHAR(255) DEFAULT NULL,

  reopened_at DATETIME DEFAULT NULL,
  reopened_by_user_id INT DEFAULT NULL,
  reopened_by_name VARCHAR(255) DEFAULT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'closed',

  created_at DATETIME NOT NULL,

  INDEX idx_cap_phone (normalized_phone),
  INDEX idx_cap_tenant (tenant_id),
  INDEX idx_cap_period (period_from, period_to)
);

CREATE TABLE IF NOT EXISTS client_account_adjustments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT DEFAULT NULL,

  client_phone VARCHAR(50) NOT NULL,
  normalized_phone VARCHAR(20) NOT NULL,

  type VARCHAR(30) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,

  linked_shipment_id INT DEFAULT NULL,
  reason TEXT NOT NULL,

  created_by_user_id INT DEFAULT NULL,
  created_by_name VARCHAR(255) DEFAULT NULL,

  voided_at DATETIME DEFAULT NULL,
  voided_by_user_id INT DEFAULT NULL,
  voided_by_name VARCHAR(255) DEFAULT NULL,
  void_reason TEXT DEFAULT NULL,

  adjusted_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL,

  INDEX idx_caa_phone (normalized_phone),
  INDEX idx_caa_tenant (tenant_id)
);
