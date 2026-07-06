import { mysqlTable, int, varchar, decimal, text, datetime } from "drizzle-orm/mysql-core";

// ─── حالات طلب الالتقاط ───────────────────────────────────────────────────
export const PICKUP_REQUEST_STATUSES = [
  "pending",     // بانتظار موافقة الأدمن
  "approved",    // تمت الموافقة، بانتظار تحديد مندوب
  "assigned",    // تم تعيين مندوب
  "picked_up",   // تم الاستلام فعلياً
  "cancelled",   // ملغي
  "rejected",    // مرفوض
] as const;
export type PickupRequestStatus = (typeof PICKUP_REQUEST_STATUSES)[number];

export const PICKUP_REQUEST_STATUS_LABELS: Record<PickupRequestStatus, string> = {
  pending:   "بانتظار الموافقة",
  approved:  "تمت الموافقة",
  assigned:  "تم تعيين مندوب",
  picked_up: "تم الاستلام",
  cancelled: "ملغي",
  rejected:  "مرفوض",
};

// ─── جدول طلبات الالتقاط ──────────────────────────────────────────────────
export const pickupRequestsTable = mysqlTable("pickup_requests", {
  id:               int("id").primaryKey().autoincrement(),
  tenantId:         int("tenant_id"),

  requestNumber:    varchar("request_number", { length: 50 }),

  // ── مصدر الطلب ─────────────────────────────────────────────────────────
  clientId:         int("client_id"),                 // من جدول clients (تاجر أدمن)
  receiverClientId: int("receiver_client_id"),         // من جدول receiver_clients (عميل بوابة الشحن)

  // ── بيانات الالتقاط ────────────────────────────────────────────────────
  pickupContactName:  varchar("pickup_contact_name", { length: 255 }).notNull(),
  pickupPhone:        varchar("pickup_phone", { length: 50 }).notNull(),
  pickupAddress:      text("pickup_address").notNull(),
  pickupCity:         varchar("pickup_city", { length: 100 }),
  piecesCount:        int("pieces_count").default(1),
  estimatedWeight:    decimal("estimated_weight", { precision: 8, scale: 2 }),
  notes:              text("notes"),

  preferredDate:      datetime("preferred_date"),      // التاريخ المفضل للالتقاط
  preferredTimeSlot:  varchar("preferred_time_slot", { length: 50 }), // "morning" | "afternoon" | "evening"

  // ── الحالة والتعيين ─────────────────────────────────────────────────────
  status:             varchar("status", { length: 30 }).notNull().default("pending"),
  assignedUserId:     int("assigned_user_id"),         // المندوب المسؤول عن الالتقاط
  rejectionReason:    text("rejection_reason"),

  // ── الربط بالشحنات الناتجة ─────────────────────────────────────────────
  resultingShipmentId: int("resulting_shipment_id"),   // لو تم إنشاء شحنة فعلية من الطلب

  createdByUserId:    int("created_by_user_id"),
  pickedUpAt:         datetime("picked_up_at"),
  deletedAt:          datetime("deleted_at"),
  createdAt:          datetime("created_at").notNull(),
  updatedAt:          datetime("updated_at").notNull(),
});

export type InsertPickupRequest = typeof pickupRequestsTable.$inferInsert;
export type PickupRequest       = typeof pickupRequestsTable.$inferSelect;
