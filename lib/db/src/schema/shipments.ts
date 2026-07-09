import { mysqlTable, int, varchar, decimal, text, datetime } from "drizzle-orm/mysql-core";

// ─── حالات الشحنة ─────────────────────────────────────────────────────────────
export const SHIPMENT_STATUSES = [
  "waiting",           // انتظار
  "confirmed",         // مؤكدة
  "picked_up",         // تم الاستلام
  "in_transit",        // في الطريق
  "out_for_delivery",  // خرجت للتسليم
  "delivered",         // تم التسليم
  "partial_received",  // استلام جزئي
  "delayed",           // متأخرة
  "returned",          // مرتجع
  "cancelled",         // ملغية
] as const;
export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_LABELS: Record<ShipmentStatus, string> = {
  waiting:          "انتظار",
  confirmed:        "مؤكدة",
  picked_up:        "تم الاستلام",
  in_transit:       "في الطريق",
  out_for_delivery: "خرجت للتسليم",
  delivered:        "تم التسليم",
  partial_received: "استلام جزئي",
  delayed:          "متأخرة",
  returned:         "مرتجع",
  cancelled:        "ملغية",
};

// ─── طرق الدفع ────────────────────────────────────────────────────────────────
export const PAYMENT_METHODS = [
  "cod",      // الدفع عند الاستلام
  "prepaid",  // مدفوع مسبقاً
  "deferred", // الدفع لاحق
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cod:      "الدفع عند الاستلام",
  prepaid:  "مدفوع مسبقاً",
  deferred: "الدفع لاحق",
};

// ─── جدول الشحنات الرئيسي ────────────────────────────────────────────────────
export const shipmentsTable = mysqlTable("shipments", {
  id:              int("id").primaryKey().autoincrement(),
  tenantId:        int("tenant_id"),

  // ── رقم الشحنة ─────────────────────────────────────────────────────────
  shipmentNumber:  varchar("shipment_number", { length: 50 }),   // رقم مرجعي تلقائي
  trackingNumber:  varchar("tracking_number", { length: 100 }),  // رقم التتبع من شركة الشحن

  // ── بيانات المرسل / العميل ──────────────────────────────────────────────
  clientId:        int("client_id"),                             // من جدول clients (اختياري)
  senderName:      varchar("sender_name",  { length: 255 }).notNull(),
  senderPhone:     varchar("sender_phone", { length: 50 }),
  senderPhone2:    varchar("sender_phone2", { length: 50 }),
  senderEmail:     varchar("sender_email", { length: 255 }),
  senderAddress:   text("sender_address"),
  senderCity:      varchar("sender_city",  { length: 100 }),

  // ── بيانات المستلم ──────────────────────────────────────────────────────
  receiverName:    varchar("receiver_name",  { length: 255 }).notNull(),
  receiverPhone:   varchar("receiver_phone", { length: 50 }),
  receiverPhone2:  varchar("receiver_phone2", { length: 50 }),
  receiverAddress: text("receiver_address"),
  receiverCity:    varchar("receiver_city",  { length: 100 }),
  zoneId:          int("zone_id"),                               // من جدول shipment_zones
  zonePrice:       decimal("zone_price", { precision: 10, scale: 2 }).default("0"), // سعر المنطقة وقت الإنشاء

  // ── تفاصيل الشحنة ──────────────────────────────────────────────────────
  parcelType:      varchar("parcel_type",  { length: 50 }),      // من PARCEL_TYPES
  parcelTypePrice: decimal("parcel_type_price", { precision: 10, scale: 2 }).default("0"), // سعر النوع وقت الإنشاء
  weight:          decimal("weight", { precision: 8, scale: 2 }), // الوزن (كجم)
  pieces:          int("pieces").default(1),                     // عدد القطع
  description:     text("description"),                          // وصف الشحنة
  productId:       int("product_id"),                             // المنتج المرتبط بالشحنة (اختياري)
  variantId:       int("variant_id"),                             // المتغير (لون/مقاس) المرتبط (اختياري)
  warehouseId:     int("warehouse_id"),                           // المخزن المخصوم منه (اختياري)
  declaredValue:   decimal("declared_value", { precision: 12, scale: 2 }).default("0"), // القيمة المعلنة
  canOpen:         int("can_open").default(1),                     // 1 = مسموح بفتح الشحنة، 0 = غير مسموح بفتح الشحنة
  isDivisible:     int("is_divisible").default(0),                 // 1 = الشحنة قابلة للتجزئة، 0 = غير قابلة للتجزئة

  // ── البيانات المالية ────────────────────────────────────────────────────
  paymentMethod:   varchar("payment_method", { length: 30 }).notNull().default("cod"),
  codAmount:       decimal("cod_amount",   { precision: 12, scale: 2 }).default("0"), // مبلغ التحصيل عند الاستلام
  costPrice:       decimal("cost_price",    { precision: 12, scale: 2 }).default("0"), // تكلفة البضاعة
  shippingFee:     decimal("shipping_fee", { precision: 10, scale: 2 }).default("0"), // رسوم الشحن الإجمالية
  insuranceFee:    decimal("insurance_fee",{ precision: 10, scale: 2 }).default("0"), // رسوم التأمين
  totalAmount:     decimal("total_amount", { precision: 12, scale: 2 }).default("0"), // الإجمالي = codAmount + shippingFee + ...
  collectedAmount: decimal("collected_amount", { precision: 12, scale: 2 }).default("0"), // المبلغ المحصَّل فعلياً

  // ── الحالة والشركة ──────────────────────────────────────────────────────
  status:            varchar("status", { length: 50 }).notNull().default("waiting"),
  shippingCompanyId: int("shipping_company_id"),
  assignedUserId:    int("assigned_user_id"),    // المندوب المسؤول
  createdByUserId:   int("created_by_user_id"),
  createdByName:     varchar("created_by_name", { length: 255 }),

  // ── ميتا ───────────────────────────────────────────────────────────────
  notes:           text("notes"),
  internalNotes:   text("internal_notes"),       // ملاحظات داخلية
  returnReason:    varchar("return_reason", { length: 100 }),  // سبب الإرجاع
  returnReceived:  int("return_received"),                      // 1=تم الاستلام في المخزن، 0/null=ما زال عند شركة الشحن (للـ returned و partial_received)
  returnNote:      text("return_note"),                         // ملاحظة الإرجاع (لو other)
  partialQuantity: int("partial_quantity"),                     // الكمية المستلمة جزئياً
  inventoryDeducted: int("inventory_deducted").default(0),       // 1 = تم خصم المخزون لهذه الشحنة
  inventoryReturned: int("inventory_returned").default(0),       // 1 = تم إرجاع المخزون (مرتجع/جزئي)
  estimatedDelivery: datetime("estimated_delivery"), // تاريخ التسليم المتوقع
  actualDelivery:  datetime("actual_delivery"),  // تاريخ التسليم الفعلي
  deletedAt:       datetime("deleted_at"),
  createdAt:       datetime("created_at").notNull(),
  updatedAt:       datetime("updated_at").notNull(),
});

export type InsertShipment = typeof shipmentsTable.$inferInsert;
export type Shipment       = typeof shipmentsTable.$inferSelect;

// ─── بنود الشحنة (منتجات متعددة لكل شحنة) ────────────────────────────────────
export const shipmentItemsTable = mysqlTable("shipment_items", {
  id:          int("id").primaryKey().autoincrement(),
  shipmentId:  int("shipment_id").notNull(),
  tenantId:    int("tenant_id"),

  productId:   int("product_id"),
  variantId:   int("variant_id"),
  warehouseId: int("warehouse_id"),
  product:     varchar("product", { length: 255 }),
  color:       varchar("color",   { length: 100 }),
  size:        varchar("size",    { length: 100 }),

  quantity:    int("quantity").notNull().default(1),
  unitPrice:   decimal("unit_price",  { precision: 12, scale: 2 }).default("0"),
  costPrice:   decimal("cost_price",  { precision: 12, scale: 2 }).default("0"),
  totalPrice:  decimal("total_price", { precision: 12, scale: 2 }).default("0"),

  inventoryDeducted: int("inventory_deducted").default(0),
  inventoryReturned: int("inventory_returned").default(0),
  receivedQuantity: int("received_quantity"), // الكمية المستلمة فعلياً (تُملأ وقت الاستلام الجزئي)

  notes:       text("notes"),
  createdAt:   datetime("created_at").notNull(),
  updatedAt:   datetime("updated_at").notNull(),
});

export type InsertShipmentItem = typeof shipmentItemsTable.$inferInsert;
export type ShipmentItem       = typeof shipmentItemsTable.$inferSelect;
