import { mysqlTable, int, varchar, decimal, text, datetime } from "drizzle-orm/mysql-core";
import { clientsTable } from "./clients";
import { shipmentsTable } from "./shipments";

// ─── بيان مرتجعات العميل — بيان مفتوح دائمًا، منفصل عن بيان حساب العميل ───────
// بيتفتح تلقائيًا أول ما مرتجع يتأكد تسليمه للعميل، ويفضل مفتوح يستقبل مرتجعات
// جديدة لحد ما الموظف يقفله (ساعتها يتفتح بيان جديد فارغ تلقائيًا).
export const clientReturnManifestsTable = mysqlTable("client_return_manifests", {
  id:             int("id").primaryKey().autoincrement(),
  tenantId:       int("tenant_id"),
  manifestNumber: varchar("manifest_number", { length: 100 }).notNull(),
  clientId:       int("client_id").notNull().references(() => clientsTable.id),
  status:         varchar("status", { length: 50 }).notNull().default("open"),
  notes:          text("notes"),
  createdAt:      datetime("created_at").notNull(),
  closedAt:       datetime("closed_at"),
});

// ─── بنود بيان المرتجعات — بيانات محفوظة (snapshot) وقت التسليم للعميل، مش
// لينك حي بالأوردر — عشان البيان يفضل زي ما كان حتى لو الشحنة اتعدلت بعدين.
export const clientReturnManifestItemsTable = mysqlTable("client_return_manifest_items", {
  id:             int("id").primaryKey().autoincrement(),
  manifestId:     int("manifest_id").notNull().references(() => clientReturnManifestsTable.id, { onDelete: "cascade" }),
  shipmentId:     int("shipment_id").notNull().references(() => shipmentsTable.id),
  shipmentNumber: varchar("shipment_number", { length: 100 }).notNull(),
  receiverName:   varchar("receiver_name", { length: 255 }),
  receiverPhone:  varchar("receiver_phone", { length: 50 }),
  receiverCity:   varchar("receiver_city", { length: 100 }),
  codAmount:      decimal("cod_amount", { precision: 10, scale: 2 }),
  returnReason:   varchar("return_reason", { length: 100 }),
  addedAt:        datetime("added_at").notNull(),
});

export type ClientReturnManifest     = typeof clientReturnManifestsTable.$inferSelect;
export type ClientReturnManifestItem = typeof clientReturnManifestItemsTable.$inferSelect;
