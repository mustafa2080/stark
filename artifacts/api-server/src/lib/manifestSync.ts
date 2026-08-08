import { eq } from "drizzle-orm";
import {
  db,
  clientAccountManifestItemsTable,
  shipmentManifestItemsTable,
} from "@workspace/db";

/**
 * ─── مزامنة حالة الشحنة مع حالة البند داخل البيانات ─────────────────────────
 *
 * فيه نظامين لتتبع حالة تسليم الشحنة:
 *   1) shipmentsTable.status                          → الحالة الأصلية للشحنة
 *   2) clientAccountManifestItemsTable.deliveryStatus  → حالة التسليم في بيان حساب العميل التجاري
 *   3) shipmentManifestItemsTable.deliveryStatus       → حالة التسليم في بيان شركة الشحن
 *
 * الحقلين التانيين بيستخدموا مسميات مختلفة شوية، فمحتاجين mapping في
 * الاتجاهين عشان أي تعديل من أي مكان ينعكس على الباقي تلقائيًا.
 */

export type ManifestDeliveryStatus =
  | "pending" | "delivered" | "returned" | "delayed" | "partial_delivered";

// شحنة → بيان: من status الشحنة الأصلي لحالة التسليم في البيان
const SHIPMENT_STATUS_TO_DELIVERY: Record<string, ManifestDeliveryStatus> = {
  waiting:           "pending",
  confirmed:         "pending",
  picked_up:         "pending",
  in_transit:        "pending",
  out_for_delivery:  "pending",
  warehouse_ready:   "pending",
  in_shipping:       "pending",
  delivered:         "delivered",
  received:          "delivered",
  partial_received:  "partial_delivered",
  delayed:           "delayed",
  postponed:         "delayed",
  returned:          "returned",
  cancelled:         "pending",
};

// بيان → شحنة: من حالة التسليم في البيان لـ status الشحنة الأصلي
const DELIVERY_TO_SHIPMENT_STATUS: Record<ManifestDeliveryStatus, string> = {
  pending:            "out_for_delivery",
  delivered:          "delivered",
  partial_delivered:  "partial_received",
  delayed:            "delayed",
  returned:           "returned",
};

/**
 * تتنادى بعد أي تحديث على shipmentsTable.status (فردي أو bulk).
 * بتحدّث deliveryStatus بتاع نفس الشحنة في أي بيان (حساب عميل / شركة شحن)
 * مرتبطة بيها — لو مفيش، بتتجاهل بهدوء من غير أخطاء.
 */
export async function syncShipmentStatusToManifests(
  shipmentId: number,
  newShipmentStatus: string,
  options?: { skipShipmentManifestItems?: boolean; returnReason?: string | null },
): Promise<void> {
  const mapped = SHIPMENT_STATUS_TO_DELIVERY[newShipmentStatus];
  if (!mapped) return; // حالة مش معروفة → متلمسش البيانات

  const now = new Date();
  const deliveredAt = (mapped === "delivered" || mapped === "partial_delivered") ? now : undefined;
  // نمرر السبب لجدول البيان بس لو الحالة الجديدة فعلاً مرتجعة، عشان منمسحش
  // أي سبب اتسجل قبل كده لو التحديث ده مالوش علاقة بالإرجاع.
  const returnReasonPatch = (mapped === "returned" && options?.returnReason !== undefined)
    ? { returnReason: options.returnReason }
    : {};

  try {
    await db.update(clientAccountManifestItemsTable)
      .set({
        deliveryStatus: mapped,
        ...(deliveredAt ? { deliveredAt } : {}),
        ...returnReasonPatch,
      })
      .where(eq(clientAccountManifestItemsTable.shipmentId, shipmentId));
  } catch (e) {
    console.error("[syncShipmentStatusToManifests] client-account-manifests error:", e);
  }

  // بيان شركة الشحن (shipmentManifestItemsTable) عنده منطق تحديث خاص به بالفعل
  // جوه شيبمنت-مانيفستس (PATCH /items/:shipmentId)، واللي بيحفظ القيمة الدقيقة
  // اللي المستخدم اختارها (زي "postponed" لـ "قيد الشحن"). الـ statusMap هنا عام
  // ومبيفرقش بين "pending" و"postponed" (الاثنين بيترجموا لنفس shipmentsTable.status)،
  // فلو سبناه يحدّث هنا كمان كان بيرجّع "postponed" لـ "pending" فورًا بعد الحفظ
  // ويمسح اختيار المستخدم. عشان كده بنتجاهله من هنا لما بييجي مستدعى من نفس الراوت.
  if (options?.skipShipmentManifestItems) return;

  try {
    await db.update(shipmentManifestItemsTable)
      .set({
        deliveryStatus: mapped,
        ...(deliveredAt ? { deliveredAt } : {}),
        ...returnReasonPatch,
      })
      .where(eq(shipmentManifestItemsTable.shipmentId, shipmentId));
  } catch (e) {
    console.error("[syncShipmentStatusToManifests] shipment-manifests error:", e);
  }
}

/**
 * تتنادى بعد أي تحديث على deliveryStatus بتاع بند داخل بيان حساب العميل
 * التجاري تحديدًا. بتحدّث shipmentsTable.status لنفس الشحنة عشان يفضل
 * متسق مع صفحة الشحنات.
 * (بيان شركة الشحن عنده منطق sync خاص به بالفعل داخل shipment-manifests.ts).
 */
export async function syncManifestItemToShipment(
  shipmentId: number,
  deliveryStatus: ManifestDeliveryStatus,
): Promise<void> {
  const mappedStatus = DELIVERY_TO_SHIPMENT_STATUS[deliveryStatus];
  if (!mappedStatus) return;

  try {
    const { shipmentsTable } = await import("@workspace/db");
    await db.update(shipmentsTable)
      .set({ status: mappedStatus, updatedAt: new Date() })
      .where(eq(shipmentsTable.id, shipmentId));
  } catch (e) {
    console.error("[syncManifestItemToShipment] error:", e);
  }
}

