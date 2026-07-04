import { mysqlTable, int, varchar, decimal, text, datetime, json } from "drizzle-orm/mysql-core";

// ─── سجلات إقفال حساب العميل ────────────────────────────────────────────────
// كل مرة يقفل فيها المستخدم حساب عميل (زبون نهائي)، بيتسجل هنا كـ snapshot
// مع قائمة الأوردرات اللي اتقفلت، عشان يفضل موجود في الطباعة/الأرشيف حتى لو
// حالة الأوردرات اتغيرت بعدين.
export const clientAccountClosuresTable = mysqlTable("client_account_closures", {
  id:            int("id").primaryKey().autoincrement(),
  tenantId:      int("tenant_id"),

  clientName:    varchar("client_name", { length: 255 }).notNull(),
  clientPhone:   varchar("client_phone", { length: 50 }),

  // قائمة IDs الأوردرات اللي اتقفلت فى هذا الإقفال
  orderIds:      json("order_ids").notNull().$type<number[]>(),

  ordersCount:      int("orders_count").notNull().default(0),
  totalShippingValue: decimal("total_shipping_value", { precision: 12, scale: 2 }).default("0"),
  totalCollected:   decimal("total_collected", { precision: 12, scale: 2 }).default("0"),
  totalShippingFee: decimal("total_shipping_fee", { precision: 10, scale: 2 }).default("0"),

  notes:         text("notes"),
  closedByUserId:  int("closed_by_user_id"),
  closedByName:    varchar("closed_by_name", { length: 255 }),

  createdAt:     datetime("created_at").notNull(),
});

export type InsertClientAccountClosure = typeof clientAccountClosuresTable.$inferInsert;
export type ClientAccountClosure       = typeof clientAccountClosuresTable.$inferSelect;
