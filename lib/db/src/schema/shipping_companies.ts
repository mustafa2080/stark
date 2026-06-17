import { mysqlTable, text, int, boolean, datetime, varchar, longtext } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const shippingCompaniesTable = mysqlTable("shipping_companies", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id"),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  website: varchar("website", { length: 255 }),
  zoneId: int("zone_id"),
  notes: text("notes"),
  logo: longtext("logo"), // base64 data URL للوجو الشركة
  isActive: boolean("is_active").notNull().default(true),
  createdAt: datetime("created_at").notNull(),
});

export const insertShippingCompanySchema = createInsertSchema(shippingCompaniesTable).omit({ id: true, createdAt: true });
export type InsertShippingCompany = z.infer<typeof insertShippingCompanySchema>;
export type ShippingCompany = typeof shippingCompaniesTable.$inferSelect;
