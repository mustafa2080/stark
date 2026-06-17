import { mysqlTable, text, int, boolean, datetime, varchar, longtext, decimal } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shippingCompaniesTable = mysqlTable("shipping_companies", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id"),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  website: varchar("website", { length: 255 }),
  zoneId: int("zone_id"),
  zoneIds: text("zone_ids"),
  shippingCost: decimal("shipping_cost", { precision: 10, scale: 2 }), // تكلفة الشحن لكل شحنة/طلب
  notes: text("notes"),
  logo: longtext("logo"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: datetime("created_at").notNull(),
});

export const insertShippingCompanySchema = createInsertSchema(shippingCompaniesTable).omit({ id: true, createdAt: true });
export type InsertShippingCompany = z.infer<typeof insertShippingCompanySchema>;
export type ShippingCompany = typeof shippingCompaniesTable.$inferSelect;
