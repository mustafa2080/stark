import { mysqlTable, int, boolean, datetime, text, varchar } from "drizzle-orm/mysql-core";

export const warehousesTable = mysqlTable("warehouses", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id"),  // tenant isolation
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  city: varchar("city", { length: 100 }),          // المدينة (القاهرة / الإسكندرية ...)
  notes: text("notes"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: datetime("created_at").notNull().default(new Date()),
  updatedAt: datetime("updated_at").notNull().default(new Date()),
});

export type Warehouse = typeof warehousesTable.$inferSelect;

// ─── سجل تحويلات الشحنات بين المخازن ────────────────────────────────────────
export const warehouseTransfersTable = mysqlTable("warehouse_transfers", {
  id:              int("id").primaryKey().autoincrement(),
  tenantId:        int("tenant_id"),
  shipmentId:      int("shipment_id").notNull(),
  fromWarehouseId: int("from_warehouse_id"),   // null = خارجي (شركة شحن)
  toWarehouseId:   int("to_warehouse_id"),     // null = خارجي (مندوب/عميل)
  notes:           text("notes"),
  createdByUserId: int("created_by_user_id"),
  createdByName:   varchar("created_by_name", { length: 255 }),
  createdAt:       datetime("created_at").notNull(),
});

export type WarehouseTransfer = typeof warehouseTransfersTable.$inferSelect;
