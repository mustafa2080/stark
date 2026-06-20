-- إضافة عمود return_received لجدول shipments
-- 1 = تم الاستلام في المخزن، 0/NULL = ما زال عند شركة الشحن
-- يُستخدم مع returned و partial_received لتحديد التاج الفرعي تحت "الحالة" في صفحة الشحنات
ALTER TABLE shipments ADD COLUMN return_received INT NULL AFTER return_reason;
