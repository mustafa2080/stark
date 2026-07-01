import { mysqlTable, int, text, datetime, varchar } from "drizzle-orm/mysql-core";
import { shipmentsTable } from "./shipments";

// ─── تقييمات العملاء للشحنات ─────────────────────────────────────────────────
// يُنشأ تقييم واحد لكل شحنة بعد التسليم (عبر رابط تتبع/واتساب أو إدخال يدوي من الموظف)
export const shipmentRatingsTable = mysqlTable("shipment_ratings", {
  id:          int("id").primaryKey().autoincrement(),
  tenantId:    int("tenant_id"),
  shipmentId:  int("shipment_id").notNull().references(() => shipmentsTable.id, { onDelete: "cascade" }),

  rating:      int("rating").notNull(),                 // 1-5
  comment:     text("comment"),                          // ملاحظة اختيارية من العميل
  source:      varchar("source", { length: 30 }).notNull().default("manual"), // manual | tracking_link | whatsapp

  createdAt:   datetime("created_at").notNull(),
});

export type InsertShipmentRating = typeof shipmentRatingsTable.$inferInsert;
export type ShipmentRating       = typeof shipmentRatingsTable.$inferSelect;
