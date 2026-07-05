import { mysqlTable, int, varchar, decimal, text, datetime } from "drizzle-orm/mysql-core";

export const CLIENT_PAYMENT_METHODS = ["cash", "bank_transfer", "wallet", "instapay", "other"] as const;
export type ClientPaymentMethod = (typeof CLIENT_PAYMENT_METHODS)[number];

export const CLIENT_PAYMENT_METHOD_LABELS: Record<ClientPaymentMethod, string> = {
  cash: "نقدي",
  bank_transfer: "تحويل بنكي",
  wallet: "محفظة إلكترونية",
  instapay: "انستاباي",
  other: "أخرى",
};

export const clientPaymentsTable = mysqlTable("client_payments", {
  id:        int("id").primaryKey().autoincrement(),
  tenantId:  int("tenant_id"),

  clientPhone:     varchar("client_phone", { length: 50 }).notNull(),
  normalizedPhone: varchar("normalized_phone", { length: 20 }).notNull(),

  amount:         decimal("amount", { precision: 14, scale: 2 }).notNull(),
  paymentMethod:  varchar("payment_method", { length: 30 }).notNull().default("cash"),
  receiptNumber:  varchar("receipt_number", { length: 100 }),

  linkedShipmentId: int("linked_shipment_id"),

  receivedByUserId: int("received_by_user_id"),
  receivedByName:   varchar("received_by_name", { length: 255 }),

  notes:     text("notes"),
  paidAt:    datetime("paid_at").notNull(),
  createdAt: datetime("created_at").notNull(),
});

export type InsertClientPayment = typeof clientPaymentsTable.$inferInsert;
export type ClientPayment       = typeof clientPaymentsTable.$inferSelect;
