import { mysqlTable, text, int, boolean, datetime, json, varchar, mediumtext, decimal } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const USER_ROLES = ["super_admin", "admin", "employee", "warehouse", "custom", "representative", "client"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  super_admin: ["*"],
  admin: ["*"],
  employee: ["orders", "dashboard"],
  warehouse: ["inventory", "movements", "dashboard"],
  custom: [],
  representative: ["representative.view"],
  client: ["client.view"],
};

export const usersTable = mysqlTable("users", {
  id: int("id").primaryKey().autoincrement(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull().default("employee"),
  tenantId: int("tenant_id"),   // null = super_admin بيدخل على كل tenant
  permissions: json("permissions").$type<string[]>().default([]),
  isActive: boolean("is_active").notNull().default(true),
  shippingCompanyId: int("shipping_company_id"),  // للـ representative فقط
  receiverClientId: int("receiver_client_id"),    // للـ client فقط — رابط حساب العميل في receiver_clients
  phone: varchar("phone", { length: 50 }),        // رقم هاتف العميل (يُستخدم في التسجيل)
  email: varchar("email", { length: 255 }),
  defaultAdSource: varchar("default_ad_source", { length: 50 }), // مصدر الإعلان الافتراضي للموظف (يتعبأ تلقائياً عند اختياره في شحنة جديدة)
  avatar: mediumtext("avatar"),  // base64 صورة المستخدم
  showProfileLink: boolean("show_profile_link").notNull().default(true),
  // ─── موقع المندوب الحالي (لخريطة السير) ─────────────────────────────────
  lastLat: decimal("last_lat", { precision: 10, scale: 7 }),
  lastLng: decimal("last_lng", { precision: 10, scale: 7 }),
  lastLocationAt: datetime("last_location_at"),
  createdAt: datetime("created_at").notNull().default(new Date()),
  updatedAt: datetime("updated_at").notNull().default(new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true, passwordHash: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type SafeUser = Omit<User, "passwordHash">;
