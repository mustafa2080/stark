import { mysqlTable, int, varchar, decimal, text, datetime, boolean } from "drizzle-orm/mysql-core";

// ─── جدول مناطق الشحن (المدن / المحافظات + سعرها) ───────────────────────────
export const shipmentZonesTable = mysqlTable("shipment_zones", {
  id:          int("id").primaryKey().autoincrement(),
  tenantId:    int("tenant_id"),
  name:        varchar("name",    { length: 255 }).notNull(),
  governorate: varchar("governorate", { length: 100 }),
  price:       decimal("price", { precision: 10, scale: 2 }).notNull().default("0"),
  isActive:    boolean("is_active").default(true),
  notes:       text("notes"),
  createdAt:   datetime("created_at").notNull(),
  updatedAt:   datetime("updated_at").notNull(),
});

export type InsertShipmentZone = typeof shipmentZonesTable.$inferInsert;
export type ShipmentZone       = typeof shipmentZonesTable.$inferSelect;
