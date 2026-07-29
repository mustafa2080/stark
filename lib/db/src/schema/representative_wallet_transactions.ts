import { mysqlTable, int, varchar, decimal, text, datetime } from "drizzle-orm/mysql-core";

// ─── محفظة المندوب: سجل حركات تصفية الرصيد عند إغلاق كل بيان ─────────────────
// المنطق: رصيد المندوب مش عمود متراكم بيتحدّث — هو مشتق لحظيًا من totalCollected
// (شحنات delivered/partial_received في بيانات لسه مفتوحة). لما المندوب/الأدمن
// يقفل بيان، القيمة المستحقة (netDueToCompany بعد خصم تكلفة الشحن) بتتسجل هنا
// كحركة "تصفية" واحدة، وبيها balanceBefore/balanceAfter للتوثيق فقط — مش عشان
// نراكم عليها لاحقًا، لأن إقفال البيان نفسه هو اللي بيصفّر المتبقي منه.
export const representativeWalletTransactionsTable = mysqlTable("representative_wallet_transactions", {
  id:       int("id").primaryKey().autoincrement(),
  tenantId: int("tenant_id"),

  representativeUserId: int("representative_user_id").notNull(), // المندوب (users.id, role=representative)
  manifestId:            int("manifest_id").notNull(),           // البيان اللي اتقفل (shipment_manifests.id)
  manifestNumber:        varchar("manifest_number", { length: 100 }).notNull(),

  amount: decimal("amount", { precision: 14, scale: 2 }).notNull(), // القيمة المستحقة على المندوب وقت الإغلاق (netDueToCompany)

  balanceBefore: decimal("balance_before", { precision: 14, scale: 2 }).notNull().default("0"),
  balanceAfter:  decimal("balance_after", { precision: 14, scale: 2 }).notNull().default("0"),

  closedByUserId: int("closed_by_user_id"),   // مين اللي قفل البيان (أدمن أو المندوب نفسه)
  closedByName:   varchar("closed_by_name", { length: 255 }),

  createdAt: datetime("created_at").notNull(),
});

export type InsertRepresentativeWalletTransaction = typeof representativeWalletTransactionsTable.$inferInsert;
export type RepresentativeWalletTransaction       = typeof representativeWalletTransactionsTable.$inferSelect;
