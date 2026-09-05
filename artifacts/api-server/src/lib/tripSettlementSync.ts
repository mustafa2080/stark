// ─── ترحيل تلقائي إلى "تسوية الرحلات والتحصيل" ───────────────────────────────
// عند إغلاق بيان مندوب (نهائي من الأدمن) أو بيان حساب عميل، الرصيد بيترحّل
// تلقائيًا كصف جديد في البيان المفتوح حاليًا لتسوية الرحلات (trip_settlements)،
// من غير ما يأثر على أي تعديل يدوي موجود في نفس الصفحة. راجع المحادثة مع
// مصطفى (طلب الميزة) للتفاصيل الكاملة.
//
// منع التكرار: كل صف مُرحَّل بيحمل sourceManifestId (بيان المصدر). لو اتبعت
// نفس عملية القفل مرتين (retry/سباق) هنمنع إضافة صف تاني لنفس البيان.

import { eq } from "drizzle-orm";
import {
  db,
  tripSettlementRepsTable,
  tripSettlementRepPaymentsTable,
  tripSettlementClientsTable,
} from "@workspace/db";
import {
  getOrCreateOpenSettlement,
  recomputeSettlementTotals,
  recomputeRepBalance,
} from "../routes/trip-settlements.js";

// ─── مندوب: بيُستدعى من createTreasuryEntryOnClose (shipment-manifests.ts)
// بعد نجاح ترحيل الخزنة مباشرة — نفس netDue بالظبط اللي ترحّل للخزنة.
export async function autoAddRepToTripSettlement(params: {
  tenantId: number | null;
  sourceManifestId: number;
  netDue: number;
  repUserId: number | null;
  repName: string;
  // ── وسائل الدفع (اختياري) ────────────────────────────────────────────────
  // لو الأدمن اختار وقت إغلاق البيان يوزّع صافي المستحق على أكتر من وسيلة دفع
  // (فودافون كاش / انستاباي / فرع ALIX / أخرى...) بنسجّلها كصفوف منفصلة في
  // trip_settlement_rep_payments بدل صف "كاش" واحد بكل المبلغ. المجموع لازم
  // يبقى مطابق لـ netDue — لو مش متطابق أو الباراميتر مش متبعوت، نرجع
  // للسلوك القديم (صف "كاش" واحد بكل المبلغ) كـ fallback آمن.
  payments?: { method: string; amount: number; note?: string | null }[];
}): Promise<void> {
  const { tenantId, sourceManifestId, netDue, repUserId, repName, payments } = params;
  if (netDue <= 0) return;

  const [existing] = await db.select({ id: tripSettlementRepsTable.id, repName: tripSettlementRepsTable.repName })
    .from(tripSettlementRepsTable)
    .where(eq(tripSettlementRepsTable.sourceManifestId, sourceManifestId))
    .limit(1);
  // ── تحديث صف قديم بـ"غير محدد" لو دلوقتي عندنا اسم حقيقي ──────────────────
  // ده بيحصل لما البيان اتقفل قبل كده (زمان، قبل تصحيحات أولوية تحديد المندوب)
  // وسجّل صف بـ"غير محدد" — أي إغلاق تاني لنفس البيان (retry/إعادة فتح وإغلاق)
  // كان بيتوقف هنا بسبب منع التكرار، فالاسم يفضل غلط للأبد حتى لو اتصلح منطق
  // تحديد المندوب بعد كده. لو الاسم الجديد حقيقي (مش "غير محدد") والقديم كان
  // "غير محدد"، بنحدّث الصف القديم بدل ما نتجاهله.
  if (existing) {
    if (existing.repName === "غير محدد" && repName && repName !== "غير محدد") {
      await db.update(tripSettlementRepsTable)
        .set({ repName, userId: repUserId })
        .where(eq(tripSettlementRepsTable.id, existing.id));
    }
    return;
  }

  const settlement = await getOrCreateOpenSettlement(tenantId, null, "ترحيل تلقائي");
  const now = new Date();

  const [created] = await db.insert(tripSettlementRepsTable).values({
    settlementId: settlement.id,
    userId: repUserId,
    repName,
    status: "active",
    balance: "0",
    sourceManifestId,
    notes: "تمت الإضافة تلقائيًا عند إغلاق بيان الشحنات",
    createdAt: now,
  });
  const repRowId = (created as any).insertId as number;

  const validPayments = (payments ?? []).filter(p => p.amount > 0);
  const paymentsTotal = validPayments.reduce((sum, p) => sum + p.amount, 0);
  const useCustomPayments = validPayments.length > 0 && Math.abs(paymentsTotal - netDue) < 0.01;

  if (useCustomPayments) {
    await db.insert(tripSettlementRepPaymentsTable).values(
      validPayments.map(p => ({
        repRowId,
        method: p.method,
        amount: String(p.amount),
        note: p.note?.trim() || "ترحيل تلقائي من إغلاق البيان",
        createdAt: now,
      }))
    );
  } else {
    await db.insert(tripSettlementRepPaymentsTable).values({
      repRowId,
      method: "cash",
      amount: String(netDue),
      note: "ترحيل تلقائي من إغلاق البيان",
      createdAt: now,
    });
  }

  await recomputeRepBalance(repRowId);
  await recomputeSettlementTotals(settlement.id);
}

// ─── عميل: بيُستدعى من PATCH /client-account-manifests/:id عند الإغلاق —
// netDue = computeClientManifestNetDue(manifestId) محسوبة وقت الإغلاق بالظبط
// (snapshot، مش قيمة حية بتتغيّر بعد كده).
export async function autoAddClientToTripSettlement(params: {
  tenantId: number | null;
  sourceManifestId: number;
  netDue: number;
  clientId: number | null;
  clientName: string;
}): Promise<void> {
  const { tenantId, sourceManifestId, netDue, clientId, clientName } = params;
  if (netDue === 0) return;

  const [existing] = await db.select({ id: tripSettlementClientsTable.id })
    .from(tripSettlementClientsTable)
    .where(eq(tripSettlementClientsTable.sourceManifestId, sourceManifestId))
    .limit(1);
  if (existing) return;

  const settlement = await getOrCreateOpenSettlement(tenantId, null, "ترحيل تلقائي");
  const now = new Date();

  await db.insert(tripSettlementClientsTable).values({
    settlementId: settlement.id,
    clientId,
    clientName,
    alixAmount: "0",
    vcashAmount: "0",
    cashAmount: "0",
    balance: String(netDue),
    status: "pending",
    sourceManifestId,
    notes: "تمت الإضافة تلقائيًا عند إغلاق بيان حساب العميل",
    createdAt: now,
  });

  await recomputeSettlementTotals(settlement.id);
}
