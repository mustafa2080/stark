import { mysqlTable, text, int, datetime, json, varchar, boolean } from "drizzle-orm/mysql-core";

export const NOTIFICATION_TYPES = [
  "shipment_new",
  "shipment_delayed",
  "shipment_returned",
  "shipment_delivered",
  "client_followup",
  "inventory_low",
  "invoice_created",
  "invoice_overdue",
  "manifest_closed",
  "system",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_SEVERITIES = ["info", "success", "warning", "critical"] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export const notificationsTable = mysqlTable("notifications", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id"),
  type: varchar("type", { length: 50 }).notNull(),
  severity: varchar("severity", { length: 20 }).notNull().default("info"),
  title: varchar("title", { length: 255 }).notNull(),
  message: text("message"),
  entityType: varchar("entity_type", { length: 100 }),
  entityId: int("entity_id"),
  link: varchar("link", { length: 255 }),
  isRead: boolean("is_read").notNull().default(false),
  readBy: json("read_by").$type<number[]>().default([]),
  createdAt: datetime("created_at").notNull().default(new Date()),
});

export type Notification = typeof notificationsTable.$inferSelect;
export type NewNotification = typeof notificationsTable.$inferInsert;
