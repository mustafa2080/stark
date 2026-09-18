import { mysqlTable, text, int, datetime, varchar, decimal, boolean } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── أنواع مصادر / مسببات الحركة ─────────────────────────────────────────────
export const CASH_TRANSACTION_TYPES = [
  "deposit",           // إيداع يدوي
  "withdrawal",        // سحب يدوي
  "order_collected",   // تحصيل طلب
  "shipping_transfer", // تحويل من شركة شحن
  "cash_sale",         // مبيعات نقدية
  "client_collection", // تحصيل حساب عميل
  "expense_paid",      // دفع مصروف
  "purchase_paid",     // دفع مورد (أمر شراء)
  "transfer_in",       // تحويل وارد من خزنة أخرى
  "transfer_out",      // تحويل صادر لخزنة أخرى
] as const;
export type CashTransactionType = (typeof CASH_TRANSACTION_TYPES)[number];

// ─── تصنيف الحركات (دخل / خرج) ───────────────────────────────────────────────
export const CREDIT_TYPES = [
  "deposit", "order_collected", "shipping_transfer", "cash_sale", "client_collection", "transfer_in",
] as const;

export const DEBIT_TYPES = [
  "withdrawal", "expense_paid", "purchase_paid", "transfer_out",
] as const;

// ─── جدول الخزن ──────────────────────────────────────────────────────────────
export const cashRegistersTable = mysqlTable("cash_registers", {
  id:             int("id").primaryKey().autoincrement(),
  tenantId:       int("tenant_id"),  // tenant isolation
  name:           varchar("name", { length: 255 }).notNull(),
  type:           varchar("type", { length: 50 }).notNull().default("branch"),
  balance:        decimal("balance", { precision: 14, scale: 2 }).notNull().default("0"),
  description:    text("description"),
  isActive:       boolean("is_active").notNull().default(true),
  isDefault:      boolean("is_default").notNull().default(false),                      // الخزنة الافتراضية
  lowBalanceThreshold: decimal("low_balance_threshold", { precision: 14, scale: 2 }), // حد التنبيه
  createdByUserId: int("created_by_user_id"),
  createdByName:  varchar("created_by_name", { length: 255 }),
  archivedAt:     datetime("archived_at"),   // تاريخ الأرشفة (null = نشطة)
  createdAt:      datetime("created_at").notNull(),
  updatedAt:      datetime("updated_at").notNull(),
});

// ─── جدول حركات الخزنة ───────────────────────────────────────────────────────
export const cashTransactionsTable = mysqlTable("cash_transactions", {
  id:              int("id").primaryKey().autoincrement(),
  registerId:      int("register_id").notNull().references(() => cashRegistersTable.id),
  type:            varchar("type", { length: 50 }).notNull(),
  amount:          decimal("amount", { precision: 14, scale: 2 }).notNull(),
  balanceBefore:   decimal("balance_before", { precision: 14, scale: 2 }).notNull(),
  balanceAfter:    decimal("balance_after", { precision: 14, scale: 2 }).notNull(),
  orderId:         int("order_id"),
  expenseId:       int("expense_id"),
  purchaseOrderId: int("purchase_order_id"),
  shippingInvoiceId: int("shipping_invoice_id"),
  transferToRegisterId: int("transfer_to_register_id"),
  description:     text("description"),
  referenceNumber: varchar("reference_number", { length: 100 }),
  transactionDate: datetime("transaction_date").notNull(),
  createdByUserId: int("created_by_user_id"),
  createdByName:   varchar("created_by_name", { length: 255 }),
  createdAt:       datetime("created_at").notNull(),
});

export const insertCashRegisterSchema = createInsertSchema(cashRegistersTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCashTransactionSchema = createInsertSchema(cashTransactionsTable).omit({ id: true, createdAt: true });

export type CashRegister     = typeof cashRegistersTable.$inferSelect;
export type CashTransaction  = typeof cashTransactionsTable.$inferSelect;
export type InsertCashRegister    = z.infer<typeof insertCashRegisterSchema>;
export type InsertCashTransaction = z.infer<typeof insertCashTransactionSchema>;
