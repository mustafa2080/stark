import { mysqlTable, int, varchar, decimal, text, datetime } from "drizzle-orm/mysql-core";
import { shippingCompaniesTable } from "./shipping_companies";
import { shipmentsTable } from "./shipments";

// ─── بيان شحن الشحنات (مختلف عن بيان الطلبات) ────────────────────────────────
export const shipmentManifestsTable = mysqlTable("shipment_manifests", {
  id:               int("id").primaryKey().autoincrement(),
  tenantId:         int("tenant_id"),
  manifestNumber:   varchar("manifest_number", { length: 100 }).notNull(),
  shippingCompanyId: int("shipping_company_id").notNull().references(() => shippingCompaniesTable.id),
  status:           varchar("status", { length: 50 }).notNull().default("open"),
  notes:            text("notes"),
  invoicePrice:     decimal("invoice_price", { precision: 10, scale: 2 }),
  invoiceNotes:     text("invoice_notes"),
  manualShippingCost: decimal("manual_shipping_cost", { precision: 10, scale: 2 }),
  createdAt:        datetime("created_at").notNull(),
  closedAt:         datetime("closed_at"),
});

// ─── الشحنات داخل البيان ──────────────────────────────────────────────────────
export const shipmentManifestItemsTable = mysqlTable("shipment_manifest_items", {
  id:             int("id").primaryKey().autoincrement(),
  manifestId:     int("manifest_id").notNull().references(() => shipmentManifestsTable.id, { onDelete: "cascade" }),
  shipmentId:     int("shipment_id").notNull().references(() => shipmentsTable.id),
  deliveryStatus: varchar("delivery_status", { length: 50 }).notNull().default("pending"),
  // pending | delivered | returned | partial_delivered | delayed
  deliveryNote:   text("delivery_note"),
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
});

export type ShipmentManifest     = typeof shipmentManifestsTable.$inferSelect;
export type ShipmentManifestItem = typeof shipmentManifestItemsTable.$inferSelect;
