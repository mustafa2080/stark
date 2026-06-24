import { mysqlTable, text, longtext, int, datetime, varchar, decimal, boolean } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── جدول العملاء التجاريين ─────────────────────────────────────────────────
export const clientsTable = mysqlTable("clients", {
  id:             int("id").primaryKey().autoincrement(),
  tenantId:       int("tenant_id"),

  // ── بيانات أساسية ─────────────────────────────────────────────────────
  name:           varchar("name",    { length: 255 }).notNull(),       // اسم العميل / الشركة
  phone:          varchar("phone",   { length: 100 }),
  phone2:         varchar("phone2",  { length: 100 }),
  email:          varchar("email",   { length: 255 }),
  address:        text("address"),
  city:           varchar("city",    { length: 100 }),
  region:         varchar("region",  { length: 100 }),

  // ── تجاري ─────────────────────────────────────────────────────────────
  taxNumber:      varchar("tax_number",    { length: 100 }),           // الرقم الضريبي
  commercialReg:  varchar("commercial_reg", { length: 100 }),          // السجل التجاري
  paymentTerms:   varchar("payment_terms", { length: 100 }),           // شروط الدفع (مثلاً: آجل 30 يوم)
  creditLimit:    decimal("credit_limit", { precision: 14, scale: 2 }).default("0"), // حد الائتمان

  // ── تصنيف العميل (tier) ───────────────────────────────────────────────
  // normal = 1–200 شحنة/شهر | commercial = 201–500 | vip = 501–1000
  clientType:         varchar("client_type", { length: 20 }).default("normal"), // normal | commercial | vip
  monthlyShipmentTarget: int("monthly_shipment_target").default(0),             // الهدف الشهري من الشحنات (يُحدَّد يدوياً)

  // ── إحصائيات محسوبة (تُحدَّث عند كل أمر بيع) ─────────────────────────
  totalOrders:    int("total_orders").default(0),
  totalSales:     decimal("total_sales", { precision: 14, scale: 2 }).default("0"),
  totalPaid:      decimal("total_paid",  { precision: 14, scale: 2 }).default("0"),

  // ── مخزن مرتبط ────────────────────────────────────────────────────────
  warehouseId:    int("warehouse_id"),                                      // المخزن المرتبط بالعميل (اختياري)

  // ── ميتا ──────────────────────────────────────────────────────────────
  notes:          text("notes"),
  isActive:       boolean("is_active").default(true),
  avatar:         longtext("avatar"),   // LONGTEXT عشان base64 الصور الكبيرة
  createdAt:      datetime("created_at").notNull(),
  updatedAt:      datetime("updated_at").notNull(),
});

export const insertClientSchema = createInsertSchema(clientsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client       = typeof clientsTable.$inferSelect;
