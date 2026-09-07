import { mysqlTable, text, int, varchar, datetime } from "drizzle-orm/mysql-core";

// ─── اشتراكات Web Push — إشعارات النظام تنزل على شريط إشعارات التليفون ────────
// كل صف = جهاز واحد مسجّل لمستخدم (نفس المستخدم ممكن يكون عنده أكتر من جهاز)
export const pushSubscriptionsTable = mysqlTable("push_subscriptions", {
  id: int("id").primaryKey().autoincrement(),
  userId: int("user_id").notNull(),
  endpoint: text("endpoint").notNull(),          // عنوان الـ push service الخاص بالجهاز (فريد لكل جهاز)
  p256dh: varchar("p256dh", { length: 255 }).notNull(), // مفتاح تشفير الجهاز
  auth: varchar("auth", { length: 255 }).notNull(),     // سر تشفير الجهاز
  userAgent: varchar("user_agent", { length: 255 }),    // لعرض "آيفون / أندرويد" في قائمة الأجهزة
  createdAt: datetime("created_at").notNull().default(new Date()),
});

export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptionsTable.$inferInsert;
