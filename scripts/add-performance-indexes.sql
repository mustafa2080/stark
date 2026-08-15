-- ══════════════════════════════════════════════════════════════════════════
-- تحسين أداء الداتابيز — إضافة indexes على الجداول الحرجة
-- تاريخ: 2026-08-15
-- ملحوظة: عملية إضافة index آمنة ولا تلمس البيانات، لكنها ممكن تاخد وقت
-- (ثواني لدقائق حسب حجم الجدول) وتعمل قفل خفيف وقت الإنشاء.
-- الأفضل تشغيلها في وقت حمل منخفض على الموقع.
-- ══════════════════════════════════════════════════════════════════════════

-- تأكد إنك على الداتابيز الصح قبل التشغيل:
-- USE starkvector;

-- ─── جدول shipments (الأهم — كان بدون أي index غير الـ primary key) ────────

CREATE INDEX idx_shipments_tenant_id             ON shipments (tenant_id);
CREATE INDEX idx_shipments_status                ON shipments (status);
CREATE INDEX idx_shipments_created_at            ON shipments (created_at);
CREATE INDEX idx_shipments_deleted_at            ON shipments (deleted_at);
CREATE INDEX idx_shipments_client_id             ON shipments (client_id);
CREATE INDEX idx_shipments_tracking_number       ON shipments (tracking_number);
CREATE INDEX idx_shipments_shipment_number       ON shipments (shipment_number);
CREATE INDEX idx_shipments_assigned_user_id      ON shipments (assigned_user_id);
CREATE INDEX idx_shipments_shipping_company_id   ON shipments (shipping_company_id);
CREATE INDEX idx_shipments_warehouse_id          ON shipments (warehouse_id);

-- composite index — بيغطي أشهر نمط فلترة في كل الـ analytics: tenant + status + غير محذوف
CREATE INDEX idx_shipments_tenant_status_deleted ON shipments (tenant_id, status, deleted_at);

-- ─── جدول orders (كانت ناقصة index على tenant_id بس) ────────────────────────

CREATE INDEX idx_orders_tenant_id                ON orders (tenant_id);
CREATE INDEX idx_orders_tenant_status_deleted    ON orders (tenant_id, status, deleted_at);

-- ─── جدول clients ────────────────────────────────────────────────────────────

CREATE INDEX idx_clients_tenant_id               ON clients (tenant_id);
CREATE INDEX idx_clients_normalized_phone        ON clients (normalized_phone);
CREATE INDEX idx_clients_client_type             ON clients (client_type);

-- ══════════════════════════════════════════════════════════════════════════
-- بعد التنفيذ، للتأكد إن الـ indexes اتضافت صح:
-- SHOW INDEX FROM shipments;
-- SHOW INDEX FROM orders;
-- SHOW INDEX FROM clients;
-- ══════════════════════════════════════════════════════════════════════════
