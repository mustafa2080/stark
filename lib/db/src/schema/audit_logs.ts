import { mysqlTable, text, int, datetime, json, varchar } from "drizzle-orm/mysql-core";

export const AUDIT_ACTIONS = ["create", "update", "delete", "status_change", "add_stock", "login", "register", "restore", "archive"] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditLogsTable = mysqlTable("audit_logs", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id"),
  action: varchar("action", { length: 50 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: int("entity_id"),
  entityName: varchar("entity_name", { length: 255 }),
  changesBefore: json("changes_before"),
  changesAfter: json("changes_after"),
  userId: int("user_id"),
  userName: varchar("user_name", { length: 255 }),
  createdAt: datetime("created_at").notNull().default(new Date()),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
