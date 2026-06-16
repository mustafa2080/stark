import { mysqlTable, text, int, datetime, varchar, timestamp } from "drizzle-orm/mysql-core";

export const MOVEMENT_TYPES = ["IN", "OUT"] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export const MOVEMENT_REASONS = [
  "sale",
  "partial_sale",
  "return",
  "damaged",
  "manual_in",
  "manual_out",
  "adjustment",
  "to_shipping",
  "from_shipping",
  "transfer",
] as const;
export type MovementReason = (typeof MOVEMENT_REASONS)[number];

export const inventoryMovementsTable = mysqlTable("inventory_movements", {
  id: int("id").primaryKey().autoincrement(),
  productId: int("product_id"),
  variantId: int("variant_id"),
  warehouseId: int("warehouse_id"),
  product: varchar("product", { length: 255 }).notNull(),
  color: varchar("color", { length: 100 }),
  size: varchar("size", { length: 100 }),
  quantity: int("quantity").notNull(),
  type: varchar("type", { length: 10 }).notNull(),
  reason: varchar("reason", { length: 50 }).notNull(),
  orderId: int("order_id"),
  shipmentId: int("shipment_id"),
  fromLocation: varchar("from_location", { length: 255 }),
  toLocation: varchar("to_location", { length: 255 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type InventoryMovement = typeof inventoryMovementsTable.$inferSelect;
