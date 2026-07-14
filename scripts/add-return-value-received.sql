-- إضافة عمود القيمة الفعلية المستلمة من العميل عند المرتجع (يدخلها المندوب يدويًا)
ALTER TABLE shipment_manifest_items
  ADD COLUMN return_value_received DECIMAL(10,2) NULL AFTER return_reason;
