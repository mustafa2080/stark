import { mysqlTable, text, int, datetime, decimal, varchar, index } from "drizzle-orm/mysql-core";
import { shippingCompaniesTable } from "./shipping_companies";
import { ordersTable } from "./orders";

export const shippingManifestsTable = mysqlTable("shipping_manifests", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id"),
  manifestNumber: varchar("manifest_number", { length: 100 }).notNull(),
  shippingCompanyId: int("shipping_company_id").notNull().references(() => shippingCompaniesTable.id),
  status: varchar("status", { length: 50 }).notNull().default("open"),
  notes: text("notes"),
  invoicePrice: decimal("invoice_price", { precision: 10, scale: 2 }),
  invoiceNotes: text("invoice_notes"),
  manualShippingCost: decimal("manual_shipping_cost", { precision: 10, scale: 2 }),
  createdAt: datetime("created_at").notNull(),
  closedAt: datetime("closed_at"),
},
(t) => [
  index("idx_shipping_manifests_tenant_id").on(t.tenantId),
  index("idx_shipping_manifests_status").on(t.status),
  index("idx_shipping_manifests_shipping_company_id").on(t.shippingCompanyId),
]);

export const shippingManifestOrdersTable = mysqlTable("shipping_manifest_orders", {
  id: int("id").primaryKey().autoincrement(),
  manifestId: int("manifest_id").notNull().references(() => shippingManifestsTable.id, { onDelete: "cascade" }),
  orderId: int("order_id").notNull().references(() => ordersTable.id),
  deliveryStatus: varchar("delivery_status", { length: 50 }).notNull().default("pending"),
  deliveryNote: text("delivery_note"),
  partialQuantity: int("partial_quantity"),
  deliveredAt: datetime("delivered_at"),
  addedAt: datetime("added_at").notNull(),
  // حالة استلام المرتجع: null = لم يُحدَّد بعد، true = تم استلامه، false = لم يُستلم بعد (مازال في شركة الشحن)
  returnReceived: int("return_received"), // 1 = تم الاستلام، 0 = لم يُستلم (null = مرتجع جديد لم يُحدد)
},
(t) => [
  index("idx_smo_manifest_id").on(t.manifestId),
  index("idx_smo_order_id").on(t.orderId),
]);

export type ShippingManifest = typeof shippingManifestsTable.$inferSelect;
export type ShippingManifestOrder = typeof shippingManifestOrdersTable.$inferSelect;
