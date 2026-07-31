import { mysqlTable, text, int, datetime, varchar, decimal } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const EXPENSE_CATEGORIES = [
  "shipping_fees",      // مصاريف شحن
  "warehouse_rent",     // إيجار مخزن
  "salary",             // مرتبات
  "marketing",          // تسويق وإعلانات
  "packaging",          // تغليف
  "utilities",          // كهرباء / مياه / إنترنت
  "maintenance",        // صيانة
  "returns_loss",       // خسائر مرتجعات
  "client_payment",     // سداد حساب عميل
  "other",              // أخرى
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

// ─── جدول المصروفات التشغيلية ────────────────────────────────────────────────
export const expensesTable = mysqlTable("expenses", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id"),  // tenant isolation
  title: varchar("title", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }).notNull().default("other"),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  referenceId: varchar("reference_id", { length: 100 }), // رقم الفاتورة / أمر الشراء ...
  supplierId: int("supplier_id"),                          // مورد مرتبط (اختياري)
  shippingCompanyId: int("shipping_company_id"),           // شركة شحن (اختياري)
  clientId: int("client_id"),                              // عميل مرتبط — لتصنيف "سداد حساب عميل"
  cashRegisterId: int("cash_register_id"),   // خزنة الدفع المرتبطة (اختياري)
  notes: text("notes"),
  expenseDate: datetime("expense_date").notNull(),
  createdByUserId: int("created_by_user_id"),
  createdByName: varchar("created_by_name", { length: 255 }),
  createdAt: datetime("created_at").notNull(),
});

export const insertExpenseSchema = createInsertSchema(expensesTable).omit({ id: true, createdAt: true });
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expensesTable.$inferSelect;

// ─── سدادات حساب العميل — تُخصم من رصيد العميل المحسوب (computeClientBalance) ──
// كل صف هنا = مبلغ اتصرف كمصروف "سداد حساب عميل"، فبيتطرح من رصيد العميل وقت الحساب.
export const clientAccountPaymentsTable = mysqlTable("client_account_payments", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id"),
  clientId: int("client_id").notNull(),
  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
  expenseId: int("expense_id"),   // ربط بسجل المصروف المقابل
  notes: text("notes"),
  createdByUserId: int("created_by_user_id"),
  createdByName: varchar("created_by_name", { length: 255 }),
  createdAt: datetime("created_at").notNull(),
});

export const insertClientAccountPaymentSchema = createInsertSchema(clientAccountPaymentsTable).omit({ id: true, createdAt: true });
export type InsertClientAccountPayment = z.infer<typeof insertClientAccountPaymentSchema>;
export type ClientAccountPayment = typeof clientAccountPaymentsTable.$inferSelect;
