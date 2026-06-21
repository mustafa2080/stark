ALTER TABLE parcel_type_pricing
  ADD COLUMN IF NOT EXISTS image_url TEXT NULL AFTER is_active;
