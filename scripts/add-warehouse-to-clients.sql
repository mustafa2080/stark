-- Add warehouse_id column to clients table
ALTER TABLE clients ADD COLUMN warehouse_id INT NULL AFTER total_paid;
