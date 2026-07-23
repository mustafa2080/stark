import { mysqlTable, int, varchar, decimal, text, datetime, mediumtext } from "drizzle-orm/mysql-core";

// ─── حالة حساب العميل المستلم ────────────────────────────────────────────────
export const RECEIVER_ACCOUNT_STATUSES = ["active", "suspended"] as const;
export type ReceiverAccountStatus = (typeof RECEIVER_ACCOUNT_STATUSES)[number];

export const RECEIVER_ACCOUNT_STATUS_LABELS: Record<ReceiverAccountStatus, string> = {
  active: "نشط",
  suspended: "موقوف",
};

// ─── طريقة الدفع الافتراضية للعميل ───────────────────────────────────────────
export const RECEIVER_PAYMENT_METHODS = ["cod", "prepaid", "deferred"] as const;
export type ReceiverPaymentMethod = (typeof RECEIVER_PAYMENT_METHODS)[number];

// ─── جدول العميل المستلم (حساب العميل) ──────────────────────────────────────
export const receiverClientsTable = mysqlTable("receiver_clients", {
  id:        int("id").primaryKey().autoincrement(),
  tenantId:  int("tenant_id"),

  normalizedPhone: varchar("normalized_phone", { length: 20 }).notNull(),

  name:      varchar("name", { length: 255 }).notNull(),
  phone:     varchar("phone", { length: 50 }),
  email:     varchar("email", { length: 255 }),
  city:      varchar("city", { length: 100 }),
  address:   text("address"),
  avatar:    mediumtext("avatar"), // base64 صورة العميل

  accountNumber:  varchar("account_number", { length: 50 }),
  creditLimit:    decimal("credit_limit", { precision: 14, scale: 2 }).default("0"),
  paymentMethod:  varchar("payment_method", { length: 30 }).default("cod"),
  accountStatus:  varchar("account_status", { length: 20 }).notNull().default("active"),

  internalNotes:  text("internal_notes"),

  // ─── آخر تاريخ اتقفل فيه حساب العميل (Period Lock) — أي شحنة/تحصيل بعد
  // التاريخ ده يدخل في الفترة الجارية، وأي حاجة قبله محمية من التعديل ───────
  lastClosedPeriodTo: datetime("last_closed_period_to"),

  suspendedAt:      datetime("suspended_at"),
  suspendedByUserId: int("suspended_by_user_id"),
  suspendedByName:   varchar("suspended_by_name", { length: 255 }),
  suspendReason:     text("suspend_reason"),

  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
});

export type InsertReceiverClient = typeof receiverClientsTable.$inferInsert;
export type ReceiverClient       = typeof receiverClientsTable.$inferSelect;
