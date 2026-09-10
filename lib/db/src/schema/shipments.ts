import { mysqlTable, int, varchar, decimal, text, datetime, index } from "drizzle-orm/mysql-core";

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
  canOpen:         int("can_open"),                                // 1 = مسموح بفتح الشحنة، 0 = غير مسموح، null = لم يُحدد بعد
  isDivisible:     int("is_divisible"),                             // 1 = الشحنة قابلة للتجزئة، 0 = غير قابلة، null = لم يُحدد بعد
  rejectionPolicy: varchar("rejection_policy", { length: 20 }),      // "full_fee" = دفع مبلغ الشحن كاملا عند الرفض، "free" = الشحن مجانا، null = لم يُحدد

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
  courierName:       varchar("courier_name", { length: 255 }),   // اسم مندوب شركة الشحن الخارجية
  courierPhone:      varchar("courier_phone", { length: 50 }),   // رقم مندوب شركة الشحن الخارجية

  // ── ميتا ───────────────────────────────────────────────────────────────
  notes:           text("notes"),
  internalNotes:   text("internal_notes"),       // ملاحظات داخلية
  returnReason:    varchar("return_reason", { length: 100 }),  // سبب الإرجاع
  returnReceived:  int("return_received"),                      // 1=تم الاستلام، 0/null=ما زال عند شركة الشحن/المندوب (للـ returned و partial_received)
  // مين استلم المرتجع فعليًا (بيتحدد بس لما returnReceived = 1):
  // "warehouse" = رجع لمخزن (warehouseId بيحدد الفرع)، "sender" = تم تسليمه للراسل نفسه.
  // null مع returnReceived=1 = بيانات قديمة قبل إضافة العمود ده (نعرضها كـ"استُلم" بدون تفصيل).
  returnReceivedBy: varchar("return_received_by", { length: 20 }),
  returnNote:      text("return_note"),                         // ملاحظة الإرجاع (لو other)
  partialQuantity: int("partial_quantity"),                     // الكمية المستلمة جزئياً
  isReplacementRequested: int("is_replacement_requested").default(0), // 1 = العميل طلب استبدال الشحنة
  inventoryDeducted: int("inventory_deducted").default(0),       // 1 = تم خصم المخزون لهذه الشحنة
  inventoryReturned: int("inventory_returned").default(0),       // 1 = تم إرجاع المخزون (مرتجع/جزئي)
  isUrgent:        int("is_urgent").default(0),                  // 1 = تم استعجال الشحنة (بدون الحاجة لوجودها في بيان)
  urgentNote:      text("urgent_note"),                          // ملاحظة الاستعجال
  // وقت آخر فتح لرسالة واتساب من قائمة الشحنات. وجود القيمة يعني أن الأيقونة
  // تظهر مطفأة حتى لا يكرر الموظف التواصل مع العميل بالخطأ.
  whatsappSentAt:  datetime("whatsapp_sent_at"),
  estimatedDelivery: datetime("estimated_delivery"), // تاريخ التسليم المتوقع
  actualDelivery:  datetime("actual_delivery"),  // تاريخ التسليم الفعلي
  deletedAt:       datetime("deleted_at"),
  createdAt:       datetime("created_at").notNull(),
  updatedAt:       datetime("updated_at").notNull(),
},
(t) => [
  // ── indexes لتسريع أكتر الاستعلامات تكراراً (analytics, dashboard, operations-center) ──
  index("idx_shipments_tenant_id").on(t.tenantId),
  index("idx_shipments_status").on(t.status),
  index("idx_shipments_created_at").on(t.createdAt),
  index("idx_shipments_deleted_at").on(t.deletedAt),
  index("idx_shipments_client_id").on(t.clientId),
  index("idx_shipments_tracking_number").on(t.trackingNumber),
  index("idx_shipments_shipment_number").on(t.shipmentNumber),
  index("idx_shipments_assigned_user_id").on(t.assignedUserId),
  index("idx_shipments_shipping_company_id").on(t.shippingCompanyId),
  index("idx_shipments_warehouse_id").on(t.warehouseId),
  // composite index — بيغطي أشهر pattern فلترة: tenant + status + non-deleted
  index("idx_shipments_tenant_status_deleted").on(t.tenantId, t.status, t.deletedAt),
]);

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
},
(t) => [
  index("idx_shipment_items_shipment_id").on(t.shipmentId),
  index("idx_shipment_items_tenant_id").on(t.tenantId),
]);

export type InsertShipmentItem = typeof shipmentItemsTable.$inferInsert;
export type ShipmentItem       = typeof shipmentItemsTable.$inferSelect;

// ─── مين استلم المرتجع (returnReceivedBy) ────────────────────────────────────
export const RETURN_RECEIVED_BY_VALUES = ["warehouse", "sender"] as const;
export type ReturnReceivedBy = (typeof RETURN_RECEIVED_BY_VALUES)[number];

// ─── ملحوظة موقع الشحنة (تُعرض تحت الحالة في أي مكان بتظهر فيه الشحنة) ───────
// المدخل: بيانات الشحنة الخام + أسماء المخزن/المندوب الحاليين (بعد أي join
// يعملها الـ caller). دالة pure بدون DB access عشان تصلح في الـ backend
// والفرونت مع بعض.
//
// ⚠️ ملحوظة عن حالات الشحنة: shipmentsTable.status عمود varchar حر (مش enum
// حقيقي في MySQL)، وبمرور الوقت اتراكم فيه مسميات قديمة وجديدة مع بعض
// (waiting/confirmed/picked_up القديمة، جنب pending/warehouse_ready/in_shipping
// الجديدة، وdelayed/postponed كمترادفين). مصدر الحقيقة الموحّد لتصنيفها هو
// SHIPMENT_STATUS_TO_DELIVERY في artifacts/api-server/src/lib/manifestSync.ts.
// الدالة هنا بتتعامل مع أي قيمة status جاية بمرونة (بدل الاعتماد على
// SHIPMENT_STATUSES الأقدم والأقصر فوق في الملف ده) عشان تغطي كل الحالات
// الفعلية الموجودة في قاعدة البيانات دلوقتي.
export interface ShipmentLocationNoteInput {
  status: string | null | undefined;
  warehouseName?: string | null;      // اسم المخزن الحالي (من warehousesTable.name عبر warehouseId)
  assignedUserName?: string | null;   // اسم المندوب الحالي (من usersTable.displayName عبر assignedUserId)
  returnReason?: string | null;
  returnReceived?: number | null;     // 1 = استُلم، 0/null = لسه عند شركة الشحن/المندوب
  returnReceivedBy?: string | null;   // "warehouse" | "sender" | null
}

const WAREHOUSE_STATUSES = new Set(["warehouse_ready", "picked_up"]);
const WITH_REP_STATUSES = new Set(["in_shipping", "in_transit", "out_for_delivery"]);
const DELAYED_STATUSES = new Set(["delayed", "postponed"]);

export function getShipmentLocationNote(input: ShipmentLocationNoteInput): string | null {
  const status = input.status ?? "";
  const warehouseName = input.warehouseName?.trim() || null;
  const repName = input.assignedUserName?.trim() || null;

  // ── مرتجع: 3 احتمالات حسب returnReceived/returnReceivedBy ──────────────────
  if (status === "returned") {
    const received = input.returnReceived === 1;
    if (!received) {
      return repName ? `مرتجع - ما زال مع المندوب ${repName}` : "مرتجع - ما زال مع المندوب";
    }
    if (input.returnReceivedBy === "sender") {
      return "مرتجع - تم تسليمه للراسل";
    }
    // "warehouse" أو null (بيانات قديمة قبل إضافة returnReceivedBy)
    return warehouseName ? `مرتجع - في مخزن ${warehouseName}` : "مرتجع - تم استلامه في المخزن";
  }

  // ── مؤجل: سبب التأجيل + اسم المندوب ─────────────────────────────────────────
  if (DELAYED_STATUSES.has(status)) {
    const parts: string[] = [];
    if (input.returnReason?.trim()) parts.push(input.returnReason.trim());
    if (repName) parts.push(`مع المندوب ${repName}`);
    return parts.length ? parts.join(" - ") : null;
  }

  // ── مع المندوب / في الطريق ──────────────────────────────────────────────────
  if (WITH_REP_STATUSES.has(status)) {
    return repName ? `مع المندوب ${repName}` : null;
  }

  // ── في المخزن ────────────────────────────────────────────────────────────
  if (WAREHOUSE_STATUSES.has(status)) {
    return warehouseName ? `ما زال في مخزن ${warehouseName}` : null;
  }

  return null;
}
