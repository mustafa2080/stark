import { eq, and, desc } from "drizzle-orm";
import {
  db,
  clientAccountManifestItemsTable,
  clientAccountManifestsTable,
  shipmentsTable,
  shipmentManifestItemsTable,
  shipmentManifestsTable,
} from "@workspace/db";
import { pushNotification } from "./notifications.js";

// نوع مبسّط لأي شيء عنده .update() بنفس واجهة drizzle — يقبل db العادي أو tx
// جوه db.transaction(). بنستخدم Pick بس على .update عشان تفرق النوع الحقيقي
// بين db (عنده $client إضافي) و tx (مالوش) ما تمنعش تمرير أي منهم هنا.
type DbOrTx = Pick<typeof db, "update">;

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

// ─── معيار موحّد: هل الشحنة لسه "قبل المخزن" وبالتالي مالهاش وجود فعلي في بيان حساب العميل؟ ──
// ⚠️ مصدر الحقيقة الوحيد لهذا المعيار — لازم يتطابق تمامًا مع STATUSES_BEFORE_WAREHOUSE
// في client-account-manifests.ts (نفس القائمة بالظبط: pending/waiting/confirmed، بالتصميم
// المعتمد بتاريخ 2026-08-30). كان في السابق 4 نسخ مكررة ومتضاربة من هذا المعيار
// (بعضها ناقص "confirmed") في: client-account-manifests.ts، manifestFinance.ts،
// و clientAccountBalance.ts (مرتين) — ده كان بيسبب تضارب بين "عدد الأوردرات" في
// كارت العميل (اللي معندوش أي فلترة على shipment.status) وعدد الأوردرات الفعلي
// داخل البيان (اللي بيستبعد الشحنات دي). الحل: نسخة واحدة هنا تُستخدم في كل
// الأماكن الخمسة (الأربعة دول + كارت العميل نفسه).
export const EXCLUDED_SHIPMENT_STATUSES = new Set(["pending", "waiting", "confirmed"]);

export function isShipmentVisibleInManifest(shipmentStatus: string | null | undefined): boolean {
  if (!shipmentStatus) return false;
  return !EXCLUDED_SHIPMENT_STATUSES.has(shipmentStatus);
}

// شحنة → بيان: من status الشحنة الأصلي لحالة التسليم في البيان
export const SHIPMENT_STATUS_TO_DELIVERY: Record<string, ManifestDeliveryStatus> = {
  waiting:           "pending",
  confirmed:         "pending",
  picked_up:         "pending",
  in_transit:        "pending",
  out_for_delivery:  "pending",
  warehouse_ready:   "pending",
  in_shipping:       "pending",
  delivered:         "delivered",
  received:          "delivered",
  // ⚠️ الاستبدال وإحضار الطرد بيتماب‍وا على "delivered" عن قصد: الطلب اتنفّذ
  // فعلاً والفلوس اتحصّلت، فلازم كل حسابات البيان/الفاتورة/رصيد العميل
  // تعامله معاملة المسلَّم بالظبط. الفرق بينهم بيفضل محفوظ في
  // shipmentsTable.status نفسه + shipmentKind، وده اللي بيتعرض للمستخدم.
  replaced:          "delivered",
  parcel_picked:     "delivered",
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
  options?: {
    skipShipmentManifestItems?: boolean;
    returnReason?: string | null;
    deliveredValueReceived?: number | null;
    partialQuantity?: number | null;
    returnValueReceived?: number | null;
    // ⚠️ الملاحظة (سبب التأجيل/الإرجاع/إلخ) اللي المندوب بيكتبها من "مهامي"
    // (PATCH /shipments/:id مع notes) كانت بتتحفظ في shipmentsTable.notes بس،
    // من غير ما تتنقل لعمود deliveryNote في جدولي البيانات (شركة الشحن/حساب
    // العميل) — فبيان المندوب (representative-manifest-detail) كان بيعرض
    // "لم يحدد السبب" دايمًا لحالة "مؤجل" رغم إن المندوب كتب ملاحظة فعلاً،
    // لأن الصفحة بتقرا order.deliveryNote مش shipment.notes.
    deliveryNote?: string | null;
  },
  dbOrTx: DbOrTx = db,
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
  // نفس فكرة returnReasonPatch لكن للملاحظة (سبب التأجيل بالذات، أو أي ملاحظة
  // عامة تانية) — بتتحدث مع أي تغيير حالة عنده ملاحظة مُرسَلة، بغض النظر عن
  // "مُعيَّنة" (mapped) تحديدًا، عشان تفضل متزامنة مع shipmentsTable.notes.
  const deliveryNotePatch = options?.deliveryNote !== undefined
    ? { deliveryNote: options.deliveryNote }
    : {};
  // القيمة الفعلية المستلمة (تقفيل من مهامي المندوب) — بتتنقل لعمود "مستلم" في البيان
  // بس لو الحالة النهائية مسلَّم بالكامل. عمود decimal في القاعدة فبنحوّلها string
  // زي باقي حقول decimal التانية في الراوت (لو null بتفضل null عادي).
  const deliveredValuePatch = (mapped === "delivered" && options?.deliveredValueReceived !== undefined)
    ? { deliveredValueReceived: options.deliveredValueReceived === null ? null : String(options.deliveredValueReceived) }
    : {};
  // نفس الفكرة للاستلام الجزئي — partialQuantity هنا قيمة مالية مش عدد قطع (عمود int).
  const partialQuantityPatch = (mapped === "partial_delivered" && options?.partialQuantity !== undefined)
    ? { partialQuantity: options.partialQuantity }
    : {};
  // نفس الفكرة للمرتجع (سبب يستلزم قيمة: refused_paid / refused_unpaid / quality). عمود decimal.
  const returnValuePatch = (mapped === "returned" && options?.returnValueReceived !== undefined)
    ? { returnValueReceived: options.returnValueReceived === null ? null : String(options.returnValueReceived) }
    : {};

  try {
    // ⚠️⚠️ إصلاح جوهري (2026-09-13، طلب مصطفى — العميل مؤسسة نور للتجارة
    // shipment_id=248، والعميل مكتب بركة للتوزيع shipment_id=249): الشرط
    // القديم هنا كان بيحدّث deliveryStatus لأي صف بنفس shipmentId في *كل*
    // البيانات (client_account_manifest_items) دفعة واحدة — بما فيها البيانات
    // المقفولة القديمة اللي المفروض تفضل كسجل تاريخي/أرشيف من غير أي تعديل
    // (نفس نص التعليق في rolloverPendingItemsToNewManifest). شحنة اتأجلت
    // واترحّلت لعدة بيانات، بمجرد ما تتسجّل "مسلَّم" لاحقًا، كانت كل نسخها في
    // كل البيانات (المقفولة والمفتوحة) بتتحدّث لـ"مسلَّم" مرة واحدة — تضخيم
    // نفس القيمة في أكتر من بيان، وتزييف الأرشيف التاريخي للبيانات المقفولة.
    // الإصلاح: نحدّث بس البند اللي في *آخر* بيان لنفس الشحنة (مفيش بيان
    // أحدث منه) — هو ده مكان الحدث المالي الحقيقي دايمًا (بيان جديد بيتفتح
    // تلقائيًا عند القفل ولسه فيه بند pending/delayed لنفس الشحنة). البيانات
    // الأقدم تفضل بحالتها القديمة زي ما كانت وقت الترحيل، بدون أي تعديل.
    const [latestItem] = await db
      .select({ manifestId: clientAccountManifestItemsTable.manifestId })
      .from(clientAccountManifestItemsTable)
      .where(eq(clientAccountManifestItemsTable.shipmentId, shipmentId))
      .orderBy(desc(clientAccountManifestItemsTable.manifestId))
      .limit(1);

    if (latestItem) {
      await dbOrTx.update(clientAccountManifestItemsTable)
        .set({
          deliveryStatus: mapped,
          ...(deliveredAt ? { deliveredAt } : {}),
          ...returnReasonPatch,
          ...deliveryNotePatch,
          ...deliveredValuePatch,
          ...partialQuantityPatch,
          ...returnValuePatch,
        })
        .where(and(
          eq(clientAccountManifestItemsTable.shipmentId, shipmentId),
          eq(clientAccountManifestItemsTable.manifestId, latestItem.manifestId),
        ));
    }
  } catch (e) {
    console.error("[syncShipmentStatusToManifests] client-account-manifests error:", e);
  }

  // ─── الشحنة رجعت "قبل المخزن" وهي لسه item في بيان حساب عميل مفتوح ──────────
  // ⚠️ تحديث (بطلب مصطفى 2026-09-07): قبل كده كان بيتبعت تنبيه بس والبند
  // يفضل موجود "شبح" في clientAccountManifestItemsTable — ده كان بيسبب نفس
  // مشكلة تضارب عدد الأوردرات (كارت العميل يقول 1، البيان الفعلي يقول 0)
  // تتكرر تاني على كل شحنة جديدة ترجع لحالة قبل المخزن، لأن isShipmentVisibleInManifest
  // بتخفيه بصريًا بس مش بتشيله فعليًا. الحل الحاسم: نشيل البند فعليًا من الجدول
  // (زي DELETE /client-account-manifests/:id/items/:shipmentId اليدوي بالظبط،
  // لكن هنا تلقائي) بمجرد ما حالة الشحنة الأصلية ترجع pending/waiting/confirmed
  // وهي لسه item في بيان مفتوح — كده الكارت والبيان بيتطابقوا دايمًا من غير
  // أي بند مخفي، وبعد الحذف بنبعت تنبيه إعلامي (مش تحذير "راجع الموقف") يوضّح
  // إن الشحنة اتشالت تلقائيًا وهتدخل بيان جديد تاني لما ترجع تجهيزها.
  if (EXCLUDED_SHIPMENT_STATUSES.has(newShipmentStatus)) {
    try {
      const openItems = await db
        .select({
          itemId: clientAccountManifestItemsTable.id,
          manifestId: clientAccountManifestItemsTable.manifestId,
          manifestNumber: clientAccountManifestsTable.manifestNumber,
          tenantId: clientAccountManifestsTable.tenantId,
          clientId: clientAccountManifestsTable.clientId,
        })
        .from(clientAccountManifestItemsTable)
        .innerJoin(clientAccountManifestsTable, eq(clientAccountManifestItemsTable.manifestId, clientAccountManifestsTable.id))
        .where(and(
          eq(clientAccountManifestItemsTable.shipmentId, shipmentId),
          eq(clientAccountManifestsTable.status, "open"),
        ));

      if (openItems.length > 0) {
        const [shipment] = await db
          .select({ shipmentNumber: shipmentsTable.shipmentNumber, receiverName: shipmentsTable.receiverName })
          .from(shipmentsTable)
          .where(eq(shipmentsTable.id, shipmentId));

        for (const item of openItems) {
          // الحذف الفعلي — مش مجرد إخفاء بالفلتر
          await db.delete(clientAccountManifestItemsTable)
            .where(eq(clientAccountManifestItemsTable.id, item.itemId));

          await pushNotification({
            tenantId: item.tenantId,
            type: "shipment_updated",
            severity: "info",
            title: `شحنة اتشالت تلقائيًا من بيان مفتوح`,
            message: `الشحنة ${shipment?.shipmentNumber ?? `#${shipmentId}`}${shipment?.receiverName ? ` (${shipment.receiverName})` : ""} رجعت لحالة "${newShipmentStatus}" فاتشالت تلقائيًا من البيان ${item.manifestNumber} المفتوح — هتدخل بيان جديد تلقائي لما ترجع "قيد الشحن في المخزن" تاني.`,
            entityType: "client_account_manifest",
            entityId: item.manifestId,
            link: `/finance/client-account-sheet/manifest/${item.manifestId}`,
          });
        }
      }
    } catch (e) {
      console.error("[syncShipmentStatusToManifests] remove-shipment-returned-to-warehouse error:", e);
    }
  }

  // ─── الشحنة رجعت "قبل المخزن" وهي لسه item في بيان شركة شحن (مندوب) مفتوح ──
  // ⚠️ نفس فكرة الحذف التلقائي من بيان حساب العميل فوق، لكن هنا لبيان المندوب
  // (shipmentManifestItemsTable). طلب مصطفى: لما شحنة ترجع "قيد الشحن" (in_shipping)
  // لـ"قيد الانتظار" (waiting) — يعني رجعت المخزن قبل ما تتسلّم فعليًا للعميل —
  // لازم تتشال من بيان المندوب الحالي تلقائيًا، مش تفضل معلّقة فيه وهي في المخزن.
  // بنفحص "open" و"closedByRole" الاتنين (زي فحص الصلاحيات في DELETE اليدوي)
  // عشان منلمسش بيانات مقفولة نهائيًا (أرشيف تاريخي).
  if (EXCLUDED_SHIPMENT_STATUSES.has(newShipmentStatus) && !options?.skipShipmentManifestItems) {
    try {
      const openRepItems = await db
        .select({
          itemId: shipmentManifestItemsTable.id,
          manifestId: shipmentManifestItemsTable.manifestId,
          manifestNumber: shipmentManifestsTable.manifestNumber,
          tenantId: shipmentManifestsTable.tenantId,
        })
        .from(shipmentManifestItemsTable)
        .innerJoin(shipmentManifestsTable, eq(shipmentManifestItemsTable.manifestId, shipmentManifestsTable.id))
        .where(and(
          eq(shipmentManifestItemsTable.shipmentId, shipmentId),
          eq(shipmentManifestsTable.status, "open"),
        ));

      if (openRepItems.length > 0) {
        const [shipment] = await db
          .select({ shipmentNumber: shipmentsTable.shipmentNumber, receiverName: shipmentsTable.receiverName })
          .from(shipmentsTable)
          .where(eq(shipmentsTable.id, shipmentId));

        for (const item of openRepItems) {
          await db.delete(shipmentManifestItemsTable)
            .where(eq(shipmentManifestItemsTable.id, item.itemId));

          if (item.tenantId) {
            await pushNotification({
              tenantId: item.tenantId,
              type: "shipment_updated",
              severity: "info",
              title: `شحنة اتشالت تلقائيًا من بيان مندوب مفتوح`,
              message: `الشحنة ${shipment?.shipmentNumber ?? `#${shipmentId}`}${shipment?.receiverName ? ` (${shipment.receiverName})` : ""} رجعت لحالة "${newShipmentStatus}" فاتشالت تلقائيًا من بيان المندوب ${item.manifestNumber} المفتوح — هتدخل بيان جديد لما تتسند تاني.`,
              entityType: "shipment_manifest",
              entityId: item.manifestId,
              link: `/shipping-companies/manifests/${item.manifestId}`,
            });
          }
        }
      }
    } catch (e) {
      console.error("[syncShipmentStatusToManifests] remove-shipment-from-rep-manifest error:", e);
    }
  }

  // بيان شركة الشحن (shipmentManifestItemsTable) عنده منطق تحديث خاص به بالفعل
  // جوه شيبمنت-مانيفستس (PATCH /items/:shipmentId)، واللي بيحفظ القيمة الدقيقة
  // اللي المستخدم اختارها (زي "postponed" لـ "قيد الشحن"). الـ statusMap هنا عام
  // ومبيفرقش بين "pending" و"postponed" (الاثنين بيترجموا لنفس shipmentsTable.status)،
  // فلو سبناه يحدّث هنا كمان كان بيرجّع "postponed" لـ "pending" فورًا بعد الحفظ
  // ويمسح اختيار المستخدم. عشان كده بنتجاهله من هنا لما بييجي مستدعى من نفس الراوت.
  if (options?.skipShipmentManifestItems) return;

  try {
    await dbOrTx.update(shipmentManifestItemsTable)
      .set({
        deliveryStatus: mapped,
        ...(deliveredAt ? { deliveredAt } : {}),
        ...returnReasonPatch,
        ...deliveryNotePatch,
        ...deliveredValuePatch,
        ...partialQuantityPatch,
        ...returnValuePatch,
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
 *
 * ⚠️ بتحدّث كمان بند بيان شركة الشحن (shipmentManifestItemsTable) بنفس الحالة —
 * من غيرها بيحصل عدم تزامن: الأوردر يبان "مُسلَّم" في بيان العميل لكن "قيد
 * الشحن" عند المندوب. الاستثناء الوحيد: منمسحش اختيار "postponed" اللي المندوب
 * دخّله يدويًا لو الحالة الجديدة بتترجم لـ "pending" (نفس حماية
 * skipShipmentManifestItems اللي فوق).
 */
export async function syncManifestItemToShipment(
  shipmentId: number,
  deliveryStatus: ManifestDeliveryStatus,
): Promise<void> {
  const mappedStatus = DELIVERY_TO_SHIPMENT_STATUS[deliveryStatus];
  if (!mappedStatus) return;

  try {
    const { shipmentsTable, getCompletionStatusForKind } = await import("@workspace/db");
    // ⚠️ "delivered" الجاية من البيان حالة عامة — لو الشحنة دي أصلاً طلب
    // استبدال أو إحضار طرد، لازم نحافظ على الحالة النوعية بتاعتها
    // (replaced / parcel_picked) بدل ما ندوس عليها بـ "delivered" ونضيّع
    // التفرقة في التتبع والإيصال والفاتورة. باقي الحالات (مرتجع/مؤجل/جزئي)
    // مالهاش نسخة نوعية فبتتطبق زي ما هي.
    let finalStatus = mappedStatus;
    if (mappedStatus === "delivered") {
      const [row] = await db.select({ kind: shipmentsTable.shipmentKind })
        .from(shipmentsTable)
        .where(eq(shipmentsTable.id, shipmentId))
        .limit(1);
      finalStatus = getCompletionStatusForKind(row?.kind);
    }
    await db.update(shipmentsTable)
      .set({ status: finalStatus, updatedAt: new Date() })
      .where(eq(shipmentsTable.id, shipmentId));
  } catch (e) {
    console.error("[syncManifestItemToShipment] error:", e);
  }

  // مزامنة بند بيان شركة الشحن — بس لو مش هنمسح "postponed" اللي المندوب اختارها
  const mappedDelivery = SHIPMENT_STATUS_TO_DELIVERY[mappedStatus];
  if (mappedDelivery && mappedDelivery !== "pending") {
    try {
      const now = new Date();
      await db.update(shipmentManifestItemsTable)
        .set({
          deliveryStatus: mappedDelivery,
          ...((mappedDelivery === "delivered" || mappedDelivery === "partial_delivered") ? { deliveredAt: now } : {}),
        })
        .where(eq(shipmentManifestItemsTable.shipmentId, shipmentId));
    } catch (e) {
      console.error("[syncManifestItemToShipment] shipment-manifests error:", e);
    }
  }
}

