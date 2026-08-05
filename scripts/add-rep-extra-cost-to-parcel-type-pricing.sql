ALTER TABLE parcel_type_pricing
  ADD COLUMN rep_extra_cost DECIMAL(10, 2) NOT NULL DEFAULT 0 AFTER base_price;
