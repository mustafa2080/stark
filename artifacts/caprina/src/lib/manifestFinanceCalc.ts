// ─── مصدر الحقيقة الوحيد لحسابات بيان حساب العميل التجاري ────────────────────
// (القيمة المستلمة، قيمة الشحن، الصافي المستحق). كان نفس المنطق ده مكرر
// ومكتوب بـ 4-5 نسخ مختلفة (جدول الإكسيل، ملخص الإكسيل، جدول الـ PDF، جدول
// تقفيل الرحلة في الـ PDF، الشاشة) وكل نسخة فيها اختلافات دقيقة أدت لتضارب في
// الأرقام. من دلوقتي أي تعديل في المنطق المالي بيحصل هنا وبس، وكل الأماكن
// الخمسة بتستورد من هنا.
//
// ⚠️ قاعدة أساسية اتفق عليها مصطفى (2026-08-31): الصافي المستحق = دايمًا
// القيمة المستلمة (المحصَّل) ناقص رسوم الشحن المستحقة. بدون استثناء.

import type { ManifestOrder } from "@/lib/api";

// أسباب الإرجاع اللي بتتحمّل رسوم شحن (العميل أو المندوب مسؤول عنها ماليًا،
// حتى لو مفيش تحصيل فعلي من الزبون) — نفس التصنيف مستخدم في كل الصفحة.
const RETURN_REASONS_FINANCIAL = ["refused_paid", "refused_unpaid", "quality"] as const;
// من الأسباب المالية دول، الحالتين اللي بنستخدم فيهم تكلفة المندوب الفعلية
// (zoneCost) بدل سعر شحن العميل (shippingCost) — لأن العميل مش هيتحمّل شحن عادي.
const RETURN_REASONS_USE_REP_COST = ["refused_unpaid", "quality"] as const;

const isFinancialReturnReason = (o: ManifestOrder): boolean =>
  o.deliveryStatus === "returned" &&
  RETURN_REASONS_FINANCIAL.includes(String((o as any)?.returnReason ?? "") as any);

const usesRepCostForShipping = (o: ManifestOrder): boolean =>
  o.deliveryStatus === "returned" &&
  RETURN_REASONS_USE_REP_COST.includes(String((o as any)?.returnReason ?? "") as any);

// ─── القيمة المستلمة فعليًا من العميل/الزبون لطلب واحد ───────────────────────
// ملحوظة مهمة: partialQuantity في كل حالات "جزئي" (partial_delivered
// و partial_received) هو **مبلغ فلوس فعلي** (المبلغ المُحصَّل)، مش عدد قطع —
// لازم يتحسب مباشرة كقيمة، من غير ضرب في سعر الوحدة تاني (كان في نسخة قديمة
// من الإكسيل بتضربه في unitPrice غلط، وده كان بيضاعف الرقم).
export function getCollectedAmount(o: ManifestOrder): number {
  // بند مُرحَّل (rolledOver) من بيان أقدم اتقفل بالفعل — قيمته المالية اتحسبت
  // هناك، فهنا دايمًا صفر طالما لسه ظاهر (حالته النهائية لسه مؤجل/انتظار).
  if ((o as any).rolledOver === true) return 0;

  if (o.deliveryStatus === "delivered") {
    const dvr = (o as any).deliveredValueReceived;
    return dvr != null ? Number(dvr) : Number(o.totalPrice ?? 0);
  }
  if (o.deliveryStatus === "partial_delivered" || o.deliveryStatus === "partial_received") {
    return o.partialQuantity == null ? 0 : Math.round(Number(o.partialQuantity));
  }
  if (isFinancialReturnReason(o)) {
    // القيمة المستلمة بتظهر لمجرد إن فيه تحصيل فعلي مسجّل (returnValueReceived)،
    // بغض النظر عن تأكيد رجوع البضاعة نفسها للمخزن.
    const rvr = (o as any).returnValueReceived;
    return rvr != null ? Number(rvr) : 0;
  }
  return 0;
}

// ─── إجمالي سعر الشحنة (قيمة الفاتورة الأصلية) — ثابت دايمًا بغض النظر عن الحالة ───
export function getShipmentAmount(o: ManifestOrder): number {
  return Number(o.totalPrice ?? (o as any).total ?? 0);
}

// ─── هل رسوم الشحن على الطلب ده = صفر (مؤجل/قيد الانتظار/مرتجع بسبب غير مالي)؟ ───
export function isShippingZeroed(o: ManifestOrder): boolean {
  if ((o as any).rolledOver === true) return true;
  const st = o.deliveryStatus;
  if (st === "postponed" || st === "delayed" || st === "pending") return true;
  if (st === "returned" && !isFinancialReturnReason(o)) return true;
  return false;
}

// ─── رسوم الشحن المستحقة فعليًا على طلب واحد (شامل أي تكلفة إضافية للمندوب) ───
export function getChargeableShipping(o: ManifestOrder): number {
  if (isShippingZeroed(o)) return 0;
  const base = usesRepCostForShipping(o)
    ? Number((o as any)?.zoneCost ?? 0)
    : Number((o as any).shippingCost ?? 0);
  return base + Number((o as any).repExtraCost ?? 0);
}

// ─── فلترة الطلبات "المؤهلة للحساب" — استبعاد اللي لسه عند شركة الشحن (pending/waiting) ───
export function ordersEligibleForFinance(orders: ManifestOrder[] | undefined | null): ManifestOrder[] {
  return (orders ?? []).filter((o) => {
    const shipmentStatus = (o as any).status;
    return shipmentStatus !== "pending" && shipmentStatus !== "waiting";
  });
}

export interface ManifestFinanceTotals {
  totalCollected: number;
  effectiveShipping: number;
  netDue: number;
}

// ─── إجماليات البيان الكاملة — نفس الدالة تُستخدم في الإكسيل والـ PDF والشاشة ───
export function computeManifestFinanceTotals(orders: ManifestOrder[] | undefined | null): ManifestFinanceTotals {
  const eligible = ordersEligibleForFinance(orders);
  const totalCollected = eligible.reduce((sum, o) => sum + getCollectedAmount(o), 0);
  const effectiveShipping = eligible.reduce((sum, o) => sum + getChargeableShipping(o), 0);
  return {
    totalCollected,
    effectiveShipping,
    netDue: totalCollected - effectiveShipping,
  };
}

// ─── نفس المنطق لكن على مستوى مجموعة طلبات (صف واحد في الجدول ممكن يمثّل أكتر
// من "order" لو اتلموا كوحدة واحدة — نفس فكرة groupManifestOrders الموجودة). ───
export interface ManifestRowFinance {
  shipmentTotal: number; // إجمالي سعر الشحنة (COD + رسوم الشحن)
  cod: number;           // قيمة الطلب الأصلية (بدون رسوم شحن)
  fee: number;           // رسوم الشحن المستحقة
  extraFee: number;      // تكلفة إضافية للمندوب (repExtraCost)
  receivedValue: number; // القيمة المستلمة فعليًا
}

export function computeRowFinance(group: ManifestOrder[]): ManifestRowFinance {
  const cod = group.reduce((sum, o) => sum + getShipmentAmount(o), 0);
  const fee = group.reduce((sum, o) => sum + getChargeableShipping(o), 0);
  const extraFee = group.reduce((sum, o) => sum + Number((o as any).repExtraCost ?? 0), 0);
  const receivedValue = group.reduce((sum, o) => sum + getCollectedAmount(o), 0);
  return {
    shipmentTotal: cod + fee,
    cod,
    fee,
    extraFee,
    receivedValue,
  };
}
