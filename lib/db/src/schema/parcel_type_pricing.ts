import { mysqlTable, int, varchar, decimal, text, datetime, boolean } from "drizzle-orm/mysql-core";

// ─── أنواع الشحنات وأسعارها ──────────────────────────────────────────────────
export const PARCEL_TYPES = [
  "document", "normal", "fragile", "heavy", "electronics", "clothing", "food", "other",
] as const;
export type ParcelType = (typeof PARCEL_TYPES)[number];

export const PARCEL_TYPE_LABELS: Record<ParcelType, string> = {
  document: "مستندات", normal: "طرد عادي", fragile: "قابل للكسر",
  heavy: "ثقيل", electronics: "إلكترونيات", clothing: "ملابس",
  food: "طعام", other: "أخري",
};

// ─── جدول أسعار أنواع الشحنات ────────────────────────────────────────────────
export const parcelTypePricingTable = mysqlTable("parcel_type_pricing", {
  id:         int("id").primaryKey().autoincrement(),
  tenantId:   int("tenant_id"),
  parcelType: varchar("parcel_type", { length: 50 }).notNull(),
  label:      varchar("label", { length: 100 }),
  basePrice:  decimal("base_price", { precision: 10, scale: 2 }).notNull().default("0"),
  isActive:   boolean("is_active").default(true),
  imageUrl:   text("image_url"),
  notes:      text("notes"),
  createdAt:  datetime("created_at").notNull(),
  updatedAt:  datetime("updated_at").notNull(),
});

export type InsertParcelTypePricing = typeof parcelTypePricingTable.$inferInsert;
export type ParcelTypePricing       = typeof parcelTypePricingTable.$inferSelect;
