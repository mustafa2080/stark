import { mysqlTable, text, int, real, datetime, index, varchar } from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ORDER_STATUSES = ["pending", "warehouse_ready", "in_shipping", "received", "delayed", "returned", "partial_received"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const AD_SOURCES = ["facebook", "tiktok", "instagram", "organic", "whatsapp", "other"] as const;
export type AdSource = (typeof AD_SOURCES)[number];

export const ordersTable = mysqlTable("orders", {
  id: int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id"),  // null = super_admin أو بيانات قديمة قبل migration
  customerName: varchar("customer_name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }),
  city: varchar("city", { length: 255 }),
  address: text("address"),
  product: varchar("product", { length: 255 }).notNull(),
  color: varchar("color", { length: 100 }),
  size: varchar("size", { length: 100 }),
  quantity: int("quantity").notNull(),
  unitPrice: real("unit_price").notNull(),
  totalPrice: real("total_price").notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  partialQuantity: int("partial_quantity"),
  shippingCompanyId: int("shipping_company_id"),
  productId: int("product_id"),
  variantId: int("variant_id"),
  warehouseId: int("warehouse_id"),
  assignedUserId: int("assigned_user_id"),
  createdByUserId: int("created_by_user_id"),
  createdByName: varchar("created_by_name", { length: 255 }),
  adSource: varchar("ad_source", { length: 100 }),
  adCampaign: varchar("ad_campaign", { length: 255 }),
  costPrice: real("cost_price"),
  shippingCost: real("shipping_cost").default(0),
  collectedAmount: real("collected_amount"), // المبلغ الفعلي اللي استلمه المندوب (null = لسه ماتحصلش)
  notes: text("notes"),
  returnReason: text("return_reason"),
  returnNote: text("return_note"),
  returnReceived: int("return_received"), // null = لم يُحدد، 0 = عند شركة الشحن، 1 = تم الاستلام
  isDamaged: int("is_damaged").default(0), // 1 = منتج تالف/غير صالح للبيع → خسارة كاملة
  trackingNumber: varchar("tracking_number", { length: 255 }),
  invoiceNumber: varchar("invoice_number", { length: 50 }),
  deletedAt: datetime("deleted_at"),
  createdAt: datetime("created_at").notNull(),
  updatedAt: datetime("updated_at").notNull(),
},
(t) => [
  index("idx_orders_status").on(t.status),
  index("idx_orders_deleted_at").on(t.deletedAt),
  index("idx_orders_created_at").on(t.createdAt),
  index("idx_orders_product_id").on(t.productId),
  index("idx_orders_shipping_company_id").on(t.shippingCompanyId),
  index("idx_orders_assigned_user_id").on(t.assignedUserId),
  index("idx_orders_invoice_number").on(t.invoiceNumber),
]);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true, totalPrice: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
