import { mysqlTable, int, varchar, decimal, text, datetime, tinyint } from "drizzle-orm/mysql-core";

// ─── تسوية الرحلات والتحصيل ────────────────────────────────────────────────
// كل "حاوية" = رحلة/بيان تحصيل واحد فيه جدولين: مناديب (يسار) وعملاء (يمين).
// عند الإغلاق: البيان بيتأرشف، وبيتفتح بيان جديد تلقائياً، والعملاء اللي
// لسه عليهم/ليهم رصيد بيترحلوا للبيان الجديد. المناديب مبيترحلوش (كل رحلة
// مناديبها خاصين بيها فقط).

export const TRIP_SETTLEMENT_PAYMENT_METHODS = [
  "cash",           // كاش
  "vodafone_cash",  // فودافون كاش
  "alix_branch",    // فرع ALIX
  "instapay",       // انستا / انستاباي
  "other",          // أخرى
] as const;
export type TripSettlementPaymentMethod = (typeof TRIP_SETTLEMENT_PAYMENT_METHODS)[number];

// ─── الحاوية (الرحلة / البيان) ────────────────────────────────────────────────
export const tripSettlementsTable = mysqlTable("trip_settlements", {
  id:                    int("id").primaryKey().autoincrement(),
  tenantId:              int("tenant_id"),
  settlementNumber:      varchar("settlement_number", { length: 100 }).notNull(),
  title:                 varchar("title", { length: 255 }),        // اسم اختياري للرحلة
  status:                varchar("status", { length: 20 }).notNull().default("open"), // open | closed
  notes:                 text("notes"),
  previousSettlementId:  int("previous_settlement_id"), // البيان اللي اتقفل وطلع منه ده
  totalRepsBalance:      decimal("total_reps_balance", { precision: 14, scale: 2 }),
  totalClientsBalance:   decimal("total_clients_balance", { precision: 14, scale: 2 }),
  netBalance:            decimal("net_balance", { precision: 14, scale: 2 }), // حقل "السالب"
  createdByUserId:       int("created_by_user_id"),
  createdByName:         varchar("created_by_name", { length: 255 }),
  closedByUserId:        int("closed_by_user_id"),
  closedByName:          varchar("closed_by_name", { length: 255 }),
  createdAt:             datetime("created_at").notNull(),
  closedAt:              datetime("closed_at"),
});

// ─── صفوف المناديب (الجانب الأيسر) ────────────────────────────────────────────
export const tripSettlementRepsTable = mysqlTable("trip_settlement_reps", {
  id:            int("id").primaryKey().autoincrement(),
  settlementId:  int("settlement_id").notNull().references(() => tripSettlementsTable.id, { onDelete: "cascade" }),
  userId:        int("user_id"), // لو المندوب مربوط بيوزر حقيقي في النظام (اختياري)
  repName:       varchar("rep_name", { length: 255 }).notNull(),
  status:        varchar("status", { length: 20 }).notNull().default("active"), // active | closed
  balance:       decimal("balance", { precision: 14, scale: 2 }).notNull().default("0"), // إجمالي وسائل الدفع
  notes:         text("notes"), // مصروفات فرع/سيارات...إلخ
  // ── ترحيل تلقائي ──────────────────────────────────────────────────────────
  // آيدي بيان شحن الشحنات (shipment_manifests) اللي اترحّل منه الصف ده تلقائيًا
  // عند إغلاق الأدمن النهائي له. nullable — فاضي للصفوف المُدخلة يدويًا زي ما هي.
  // بيُستخدم كمنع تكرار (لو حصل retry/سباق على نفس القفل).
  sourceManifestId: int("source_manifest_id"),
  sortOrder:     int("sort_order").notNull().default(0),
  createdAt:     datetime("created_at").notNull(),
});

// ─── وسائل الدفع المتعددة لكل مندوب ───────────────────────────────────────────
export const tripSettlementRepPaymentsTable = mysqlTable("trip_settlement_rep_payments", {
  id:         int("id").primaryKey().autoincrement(),
  repRowId:   int("rep_row_id").notNull().references(() => tripSettlementRepsTable.id, { onDelete: "cascade" }),
  method:     varchar("method", { length: 30 }).notNull(), // TRIP_SETTLEMENT_PAYMENT_METHODS
  amount:     decimal("amount", { precision: 14, scale: 2 }).notNull(),
  note:       varchar("note", { length: 255 }),
  createdAt:  datetime("created_at").notNull(),
});

// ─── صفوف العملاء (الجانب الأيمن) ─────────────────────────────────────────────
export const tripSettlementClientsTable = mysqlTable("trip_settlement_clients", {
  id:              int("id").primaryKey().autoincrement(),
  settlementId:    int("settlement_id").notNull().references(() => tripSettlementsTable.id, { onDelete: "cascade" }),
  clientId:        int("client_id"), // ربط اختياري بجدول العملاء الحقيقي
  clientName:      varchar("client_name", { length: 255 }).notNull(),
  alixAmount:      decimal("alix_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  vcashAmount:     decimal("vcash_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  cashAmount:      decimal("cash_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  balance:         decimal("balance", { precision: 14, scale: 2 }).notNull().default("0"), // الرصيد المستحق (سالب/موجب)
  status:          varchar("status", { length: 20 }).notNull().default("pending"), // pending | paid ("خالص")
  paidAmount:      decimal("paid_amount", { precision: 14, scale: 2 }),
  paidAt:          datetime("paid_at"),
  expenseId:       int("expense_id"),                 // ربط بسجل المصروف اللي اتخصم بيه (سداد الرصيد)
  clientPaymentId: int("client_payment_id"),           // ربط بسجل client_account_payments
  notes:           text("notes"),
  rolledFromId:    int("rolled_from_id"),  // الصف الأصلي في البيان السابق (لو ده صف مُرحّل)
  isRolledOver:    tinyint("is_rolled_over").notNull().default(0), // اتم ترحيله لبيان جديد؟
  // ── ترحيل تلقائي ──────────────────────────────────────────────────────────
  // آيدي بيان حساب العميل (client_account_manifests) اللي اترحّل منه الصف ده
  // تلقائيًا عند إغلاقه. nullable — فاضي للصفوف المُدخلة يدويًا. بيُستخدم كمنع
  // تكرار (لو حصل retry/سباق على نفس القفل).
  sourceManifestId: int("source_manifest_id"),
  sortOrder:       int("sort_order").notNull().default(0),
  createdAt:       datetime("created_at").notNull(),
});

export type TripSettlement            = typeof tripSettlementsTable.$inferSelect;
export type TripSettlementRep         = typeof tripSettlementRepsTable.$inferSelect;
export type TripSettlementRepPayment  = typeof tripSettlementRepPaymentsTable.$inferSelect;
export type TripSettlementClient      = typeof tripSettlementClientsTable.$inferSelect;
