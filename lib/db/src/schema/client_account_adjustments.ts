import { mysqlTable, int, varchar, decimal, text, datetime } from "drizzle-orm/mysql-core";

// ─── أنواع التسويات ───────────────────────────────────────────────────────────
export const ADJUSTMENT_TYPES = [
  "damage_deduction",
  "return_deduction",
  "discount",
  "penalty",
  "manual_credit",
  "manual_debit",
  "correction",
  "shipping_fee",
] as const;
export type AdjustmentType = (typeof ADJUSTMENT_TYPES)[number];

export const ADJUSTMENT_TYPE_LABELS: Record<AdjustmentType, string> = {
  damage_deduction: "خصم تالف",
  return_deduction: "خصم بضاعة مرتجعة",
  discount: "خصم تجاري",
  penalty: "غرامة / خصم تأخير",
  manual_credit: "إضافة لصالح العميل",
  manual_debit: "إضافة على العميل",
  correction: "تصحيح محاسبي",
  shipping_fee: "أجرة شحن",
};

export const ADJUSTMENT_DIRECTIONS = ["credit", "debit"] as const;
export type AdjustmentDirection = (typeof ADJUSTMENT_DIRECTIONS)[number];

export const clientAccountAdjustmentsTable = mysqlTable("client_account_adjustments", {
  id:        int("id").primaryKey().autoincrement(),
  tenantId:  int("tenant_id"),

  clientPhone:     varchar("client_phone", { length: 50 }).notNull(),
  normalizedPhone: varchar("normalized_phone", { length: 20 }).notNull(),

  type:      varchar("type", { length: 30 }).notNull(),
  direction: varchar("direction", { length: 10 }).notNull(),
  amount:    decimal("amount", { precision: 14, scale: 2 }).notNull(),

  linkedShipmentId: int("linked_shipment_id"),
  reason:    text("reason").notNull(),

  createdByUserId: int("created_by_user_id"),
  createdByName:   varchar("created_by_name", { length: 255 }),

  voidedAt:       datetime("voided_at"),
  voidedByUserId: int("voided_by_user_id"),
  voidedByName:   varchar("voided_by_name", { length: 255 }),
  voidReason:     text("void_reason"),

  adjustedAt: datetime("adjusted_at").notNull(),
  createdAt:  datetime("created_at").notNull(),
});

export type InsertClientAccountAdjustment = typeof clientAccountAdjustmentsTable.$inferInsert;
export type ClientAccountAdjustment       = typeof clientAccountAdjustmentsTable.$inferSelect;
