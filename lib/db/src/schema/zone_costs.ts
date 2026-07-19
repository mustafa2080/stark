import { mysqlTable, int, varchar, decimal, text, datetime, boolean } from "drizzle-orm/mysql-core";

// ─── جدول تكاليف المناطق (سعر توصيل واحد لكل منطقة — بدون تصنيف عميل) ────────
// يُستخدم لتحديد سعر التوصيل الأساسي لأي منطقة، ويُستخدم كقيمة افتراضية
// عند اختيار "منطقة التكلفة" في فورم إضافة عميل جديد.
export const zoneCostsTable = mysqlTable("zone_costs", {
  id:              int("id").primaryKey().autoincrement(),
  tenantId:        int("tenant_id"),

  name:            varchar("name", { length: 255 }).notNull(),        // اسم المنطقة
  fromGovernorate: varchar("from_governorate", { length: 100 }),       // من محافظة
  toGovernorate:   varchar("to_governorate",   { length: 100 }),       // إلى محافظة

  deliveryCost:    decimal("delivery_cost", { precision: 10, scale: 2 }).notNull().default("0"), // تكلفة التوصيل

  isActive:        boolean("is_active").default(true),
  notes:           text("notes"),
  createdAt:       datetime("created_at").notNull(),
  updatedAt:       datetime("updated_at").notNull(),
});

export type InsertZoneCost = typeof zoneCostsTable.$inferInsert;
export type ZoneCost       = typeof zoneCostsTable.$inferSelect;
