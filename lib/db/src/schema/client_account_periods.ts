import { mysqlTable, int, varchar, decimal, text, datetime, date } from "drizzle-orm/mysql-core";

// ─── فترات إقفال حساب العميل (Period Lock حقيقي) ─────────────────────────────
// أي فترة اتقفلت هنا بيبقى ممنوع تعديل/حذف شحنات أو تحصيلات تقع تاريخها
// داخل الفترة دي، وبيبقى فيها رصيد افتتاحي ورصيد ختامي محفوظين وقت القفل.
export const clientAccountPeriodsTable = mysqlTable("client_account_periods", {
  id:        int("id").primaryKey().autoincrement(),
  tenantId:  int("tenant_id"),

  clientPhone:     varchar("client_phone", { length: 50 }).notNull(),
  normalizedPhone: varchar("normalized_phone", { length: 20 }).notNull(),

  periodFrom: date("period_from").notNull(),
  periodTo:   date("period_to").notNull(),

  openingBalance: decimal("opening_balance", { precision: 14, scale: 2 }).notNull().default("0"),
  totalDebit:     decimal("total_debit", { precision: 14, scale: 2 }).notNull().default("0"),
  totalCredit:    decimal("total_credit", { precision: 14, scale: 2 }).notNull().default("0"),
  totalAdjustments: decimal("total_adjustments", { precision: 14, scale: 2 }).notNull().default("0"),
  closingBalance: decimal("closing_balance", { precision: 14, scale: 2 }).notNull().default("0"),

  ordersCount: int("orders_count").notNull().default(0),
  orderIds:    text("order_ids"),

  notes: text("notes"),

  closedByUserId: int("closed_by_user_id"),
  closedByName:   varchar("closed_by_name", { length: 255 }),

  reopenedAt:       datetime("reopened_at"),
  reopenedByUserId: int("reopened_by_user_id"),
  reopenedByName:   varchar("reopened_by_name", { length: 255 }),

  status: varchar("status", { length: 20 }).notNull().default("closed"),

  createdAt: datetime("created_at").notNull(),
});

export type InsertClientAccountPeriod = typeof clientAccountPeriodsTable.$inferInsert;
export type ClientAccountPeriod       = typeof clientAccountPeriodsTable.$inferSelect;
