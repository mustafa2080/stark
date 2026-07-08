import { mysqlTable, int, varchar, decimal, text, datetime } from "drizzle-orm/mysql-core";
import { clientsTable } from "./clients";
import { saleOrdersTable } from "./sale_orders";

// ─── بيان حساب العميل الخاص بفواتير البيع (Sale Orders) — نفس فكرة client_account_manifests بس على sale orders ───
export const saleOrderManifestsTable = mysqlTable("sale_order_manifests", {
  id:               int("id").primaryKey().autoincrement(),
  tenantId:         int("tenant_id"),
  manifestNumber:   varchar("manifest_number", { length: 100 }).notNull(),
  clientId:         int("client_id").notNull().references(() => clientsTable.id),
  status:           varchar("status", { length: 50 }).notNull().default("open"),
  notes:            text("notes"),
  invoicePrice:     decimal("invoice_price", { precision: 10, scale: 2 }),
  invoiceNotes:     text("invoice_notes"),
  createdAt:        datetime("created_at").notNull(),
  closedAt:         datetime("closed_at"),
});

// ─── فواتير البيع (sale orders) داخل بيان حساب العميل ─────────────────────────
export const saleOrderManifestItemsTable = mysqlTable("sale_order_manifest_items", {
  id:           int("id").primaryKey().autoincrement(),
  manifestId:   int("manifest_id").notNull().references(() => saleOrderManifestsTable.id, { onDelete: "cascade" }),
  saleOrderId:  int("sale_order_id").notNull().references(() => saleOrdersTable.id),
  addedAt:      datetime("added_at").notNull(),
});

export type SaleOrderManifest     = typeof saleOrderManifestsTable.$inferSelect;
export type SaleOrderManifestItem = typeof saleOrderManifestItemsTable.$inferSelect;
