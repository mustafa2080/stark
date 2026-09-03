import { mysqlTable, int, varchar, decimal, text, datetime, index } from "drizzle-orm/mysql-core";
import { shippingCompaniesTable } from "./shipping_companies";
import { shipmentsTable } from "./shipments";
import { clientsTable } from "./clients";

// ─── بيان شحن الشحنات (مختلف عن بيان الطلبات) ────────────────────────────────
// ملحوظة: البيان إما بيتبع شركة شحن (shippingCompanyId) وإما بيتبع عميل تجاري
// (clientId) — الاتنين nullable، وبيتفرضوا mutually exclusive على مستوى الـ
// application logic في الراوت (مش DB constraint). القديم (بيانات المناديب)
// شغّال زي ما هو بدون أي تغيير — clientId هتفضل null ليه دايمًا.
export const shipmentManifestsTable = mysqlTable("shipment_manifests", {
  id:               int("id").primaryKey().autoincrement(),
  tenantId:         int("tenant_id"),
  manifestNumber:   varchar("manifest_number", { length: 100 }).notNull(),
  shippingCompanyId: int("shipping_company_id").references(() => shippingCompaniesTable.id),
  clientId:         int("client_id").references(() => clientsTable.id),
  // المندوب صاحب البيان الفعلي — بيتسجل وقت الإنشاء (مش وقت القفل). ده مصدر
  // الحقيقة الصحيح لاسم المندوب في "تسوية الرحلات والتحصيل"، بدل الاعتماد على
  // اليوزر اللي قفل البيان (اللي ممكن يكون أدمن قفل نيابة عن المندوب).
  representativeUserId: int("representative_user_id"),
  status:           varchar("status", { length: 50 }).notNull().default("open"),
  // closedByRole: "representative" = قفل مؤقت من المندوب (الأدمن يقدر يفتحه تاني أو يأكد القفل النهائي)
  //               "admin" = قفل نهائي فعلي (ترحيل مالي + ترحيل شحنات معلّقة)
  closedByRole:     varchar("closed_by_role", { length: 20 }),
  closedByUserId:   int("closed_by_user_id"), // آيدي اليوزر (مندوب/أدمن) اللي قفل البيان فعليًا
  notes:            text("notes"),
  invoicePrice:     decimal("invoice_price", { precision: 10, scale: 2 }),
  invoiceNotes:     text("invoice_notes"),
  manualShippingCost: decimal("manual_shipping_cost", { precision: 10, scale: 2 }),
  courierCostManual: decimal("courier_cost_manual", { precision: 10, scale: 2 }),
  createdAt:        datetime("created_at").notNull(),
  closedAt:         datetime("closed_at"),
},
(t) => [
  index("idx_shipment_manifests_tenant_id").on(t.tenantId),
  index("idx_shipment_manifests_status").on(t.status),
  index("idx_shipment_manifests_shipping_company_id").on(t.shippingCompanyId),
  index("idx_shipment_manifests_client_id").on(t.clientId),
]);

// ─── الشحنات داخل البيان ──────────────────────────────────────────────────────
export const shipmentManifestItemsTable = mysqlTable("shipment_manifest_items", {
  id:             int("id").primaryKey().autoincrement(),
  manifestId:     int("manifest_id").notNull().references(() => shipmentManifestsTable.id, { onDelete: "cascade" }),
  shipmentId:     int("shipment_id").notNull().references(() => shipmentsTable.id),
  deliveryStatus: varchar("delivery_status", { length: 50 }).notNull().default("pending"),
  // pending | delivered | returned | partial_delivered | delayed
  deliveryNote:   text("delivery_note"),
  // 1 = بند مُرحَّل من بيان مقفول (مرتجع/جزئي لسه عند الشحن). ده **مصدر الحقيقة**
  // المالي: البند "لا شيء مالي" (لا إيراد ولا تكلفة شحن) في أي بيان جديد، لأن قيمته
  // اتحسبت وترحّلت للخزنة/محفظة المندوب وقت قفل البيان القديم. عمود مستقل عن
  // deliveryNote عشان أي تعديل على نص الملاحظة مايقدرش يفسد الحالة المالية —
  // بيحل محل بادئة [ROLLED_OVER] النصية (اللي فضلت كـ hint للعرض وللتوافق الخلفي).
  isRolledOver:   int("is_rolled_over").notNull().default(0),
  partialQuantity: int("partial_quantity"), // الكمية المستلمة فعليًا (لو deliveryStatus = partial_delivered)
  deliveredAt:    datetime("delivered_at"),
  returnReceived: int("return_received"), // 1=تم الاستلام، 0=مازال في شركة الشحن
  returnReason:   varchar("return_reason", { length: 100 }), // سبب الإرجاع (لو deliveryStatus = returned)
  returnValueReceived: decimal("return_value_received", { precision: 10, scale: 2 }), // القيمة الفعلية المستلمة من العميل عند المرتجع (يدخلها المندوب)
  deliveredValueReceived: decimal("delivered_value_received", { precision: 10, scale: 2 }), // القيمة الفعلية المستلمة من العميل عند التسليم العادي (يدخلها المندوب — لمقارنتها بإجمالي الطلب وكشف أي فرق زيادة/نقص)
  addedAt:        datetime("added_at").notNull(),
  isUrgent:       int("is_urgent").default(0),        // 1 = مستعجل
  urgentNote:     varchar("urgent_note", { length: 255 }), // سبب الاستعجال (اختياري)
  urgentAt:       datetime("urgent_at"),               // وقت وضع الاستعجال
},
(t) => [
  index("idx_smi_manifest_id").on(t.manifestId),
  index("idx_smi_shipment_id").on(t.shipmentId),
]);

export type ShipmentManifest     = typeof shipmentManifestsTable.$inferSelect;
export type ShipmentManifestItem = typeof shipmentManifestItemsTable.$inferSelect;
