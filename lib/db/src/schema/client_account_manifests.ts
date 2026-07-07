import { mysqlTable, int, varchar, decimal, text, datetime } from "drizzle-orm/mysql-core";
import { clientsTable } from "./clients";
import { shipmentsTable } from "./shipments";

// ─── بيان حساب العميل — نفس فكرة بيان شحن شركات الشحن، لكن مربوط بعميل ────────
export const clientAccountManifestsTable = mysqlTable("client_account_manifests", {
  id:               int("id").primaryKey().autoincrement(),
  tenantId:         int("tenant_id"),
  manifestNumber:   varchar("manifest_number", { length: 100 }).notNull(),
  clientId:         int("client_id").notNull().references(() => clientsTable.id),
  status:           varchar("status", { length: 50 }).notNull().default("open"),
  notes:            text("notes"),
  invoicePrice:     decimal("invoice_price", { precision: 10, scale: 2 }),
  invoiceNotes:     text("invoice_notes"),
  manualShippingCost: decimal("manual_shipping_cost", { precision: 10, scale: 2 }),
  createdAt:        datetime("created_at").notNull(),
  closedAt:         datetime("closed_at"),
});

// ─── الشحنات داخل بيان حساب العميل ────────────────────────────────────────────
export const clientAccountManifestItemsTable = mysqlTable("client_account_manifest_items", {
  id:             int("id").primaryKey().autoincrement(),
  manifestId:     int("manifest_id").notNull().references(() => clientAccountManifestsTable.id, { onDelete: "cascade" }),
  shipmentId:     int("shipment_id").notNull().references(() => shipmentsTable.id),
  deliveryStatus: varchar("delivery_status", { length: 50 }).notNull().default("pending"),
  deliveryNote:   text("delivery_note"),
  partialQuantity: int("partial_quantity"),
  deliveredAt:    datetime("delivered_at"),
  returnReceived: int("return_received"),
  returnReason:   varchar("return_reason", { length: 100 }),
  addedAt:        datetime("added_at").notNull(),
  isUrgent:       int("is_urgent").default(0),
  urgentNote:     varchar("urgent_note", { length: 255 }),
  urgentAt:       datetime("urgent_at"),
});

export type ClientAccountManifest     = typeof clientAccountManifestsTable.$inferSelect;
export type ClientAccountManifestItem = typeof clientAccountManifestItemsTable.$inferSelect;
