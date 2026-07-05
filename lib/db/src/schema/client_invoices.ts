import { mysqlTable, int, varchar, decimal, text, datetime, json } from "drizzle-orm/mysql-core";

export const CLIENT_INVOICE_STATUSES = ["unpaid", "partial", "paid"] as const;
export type ClientInvoiceStatus = (typeof CLIENT_INVOICE_STATUSES)[number];

export const CLIENT_INVOICE_STATUS_LABELS: Record<ClientInvoiceStatus, string> = {
  unpaid: "غير مدفوعة",
  partial: "مدفوعة جزئياً",
  paid: "مدفوعة",
};

export const clientInvoicesTable = mysqlTable("client_invoices", {
  id:        int("id").primaryKey().autoincrement(),
  tenantId:  int("tenant_id"),

  invoiceNumber: varchar("invoice_number", { length: 100 }).notNull(),
  clientPhone:     varchar("client_phone", { length: 50 }).notNull(),
  normalizedPhone: varchar("normalized_phone", { length: 20 }).notNull(),

  periodFrom: datetime("period_from"),
  periodTo:   datetime("period_to"),

  shipmentIds: json("shipment_ids").notNull().$type<number[]>(),

  totalAmount:     decimal("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  paidAmount:      decimal("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  status:          varchar("status", { length: 20 }).notNull().default("unpaid"),

  notes: text("notes"),

  createdByUserId: int("created_by_user_id"),
  createdByName:   varchar("created_by_name", { length: 255 }),

  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
});

export type InsertClientInvoice = typeof clientInvoicesTable.$inferInsert;
export type ClientInvoice       = typeof clientInvoicesTable.$inferSelect;
