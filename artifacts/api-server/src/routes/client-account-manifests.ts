import { Router, type IRouter } from "express";
import { eq, desc, and, inArray, count, isNull, or, ne, lt, gt } from "drizzle-orm";
import {
  db,
  clientAccountManifestsTable,
  clientAccountManifestItemsTable,
  shipmentsTable,
  shipmentZonesTable,
  zoneCostsTable,
  shippingCompaniesTable,
  shipmentManifestsTable,
  clientsTable,
  usersTable,
  warehousesTable,
  clientAccountPaymentsTable,
  shipmentManifestItemsTable,
  parcelTypePricingTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getTenantId } from "../middlewares/requireTenant.js";
import { syncManifestItemToShipment, SHIPMENT_STATUS_TO_DELIVERY } from "../lib/manifestSync.js";
import { syncShipmentInventory } from "./shipments.js";
import { syncShipmentItemsInventory } from "../lib/inventory.js";
import { computeClosedManifestsForClient } from "../lib/clientAccountBalance.js";
import { computeClientManifestNetDue } from "../lib/manifestFinance.js";
import { autoAddClientToTripSettlement } from "../lib/tripSettlementSync.js";

const router: IRouter = Router();
router.use(requireAuth);

// ─── حساب أقرب موعد إغلاق متوقع (أحد أو أربعاء) من تاريخ إنشاء البيان ─────────
// الأحد = 0, الأربعاء = 3 في getDay(). لو اليوم نفسه يوم إغلاق، الموعد بيبقى
// نفس اليوم (يعني "خلال ساعات" في عرض الفرونت).
function computeNextClosingDate(from: Date): Date {
  const day = from.getDay();
  const daysUntil = (target: number) => (target - day + 7) % 7;
  const untilSunday = daysUntil(0);
  const untilWednesday = daysUntil(3);
  const nearest = Math.min(untilSunday, untilWednesday);
  const result = new Date(from);
  result.setDate(from.getDate() + nearest);
  result.setHours(23, 59, 59, 0);
  return result;
}

// ─── توليد رقم البيان ────────────────────────────────────────────────────────
async function generateManifestNumber(clientId: number): Promise<string> {
  const [row] = await db
    .select({ cnt: count() })
    .from(clientAccountManifestsTable)
    .where(eq(clientAccountManifestsTable.clientId, clientId));
  const seq = (Number(row?.cnt ?? 0) + 1).toString().padStart(3, "0");
  return `CAM-${clientId}-${seq}`;
}

// ─── إضافة تلقائية للبيان لما الشحنة توصل warehouse_ready (أو تتعمل بيه) ─────
// ⚠️ بالتصميم (تحديث 2026-08-30 بطلب صريح من مصطفى — نسخة نهائية): تفرقة
// واضحة بين حالتين:
//   • الشحنة لسه "قيد الانتظار" (pending/waiting) أو "مؤكدة" (confirmed) —
//     يعني لسه معندهاش وصلت "قيد الشحن في المخزن" (warehouse_ready) — دي
//     أصلًا **مالهاش علاقة بالبيان خالص**: متتحسبش كعدد، ومتدخلش أي بيان لا
//     مفتوح ولا مقفول. النداء ده بيتجاهلها تمامًا (no-op).
//   • الشحنة وصلت warehouse_ready أو أبعد → القرار هنا على وجود بيان مفتوح:
//       - فيه بيان مفتوح للعميل بالفعل → تفضل "معلّقة" (orphan) وتستنى قفل
//         البيان، فتتلقط تلقائيًا مع فتح البيان الجديد
//         (rolloverPendingItemsToNewManifest).
//       - مفيش بيان مفتوح خالص → يتفتح بيان جديد وتتضاف له فورًا.
// (تاريخ التعديلات: 2026-08-29 كانت الإضافة فورية بغض النظر عن الحالة حتى مع
// بيان مفتوح؛ 2026-08-30 الصبح رجعنا شرط warehouse_ready بس مع "لو فيه بيان
// مفتوح سيبها"؛ ثم جربنا إلغاء شرط الـ status خالص فحسبنا pending كـ orphan
// غلط؛ النسخة دي هي الصح: pending/waiting/confirmed تتجاهل بالكامل، ومن
// warehouse_ready فأعلى بس هي اللي تدخل في حساب البيان.)
//
// idempotent: بتتأكد الأول إن الشحنة مالهاش صف بالفعل في clientAccountManifestItemsTable
// (بأي بيان، مفتوح أو مقفول) قبل ما تضيف — فمينفعش تتكرر لو اتنادت أكتر من مرة
// لنفس الشحنة (زي إعادة المزامنة sync-warehouse-ready).
const STATUSES_BEFORE_WAREHOUSE = new Set(["pending", "waiting", "confirmed"]);

export async function autoAddShipmentToClientAccountManifest(
  shipmentId: number,
  clientId: number | null | undefined,
  tenantId: number | null,
  shipmentStatus?: string | null,
): Promise<void> {
  if (!clientId) return;
  // لسه ما وصلتش warehouse_ready → متتحسبش ولا تتضاف خالص (no-op).
  if (shipmentStatus && STATUSES_BEFORE_WAREHOUSE.has(shipmentStatus)) return;

  // الشحنة مضافة بالفعل لبيان (أي بيان) → متتضافش تاني.
  const [existingItem] = await db
    .select({ id: clientAccountManifestItemsTable.id })
    .from(clientAccountManifestItemsTable)
    .where(eq(clientAccountManifestItemsTable.shipmentId, shipmentId))
    .limit(1);
  if (existingItem) return;

  const tenantCondition = tenantId !== null
    ? or(eq(clientAccountManifestsTable.tenantId, tenantId), isNull(clientAccountManifestsTable.tenantId))
    : undefined;

  // فيه بيان مفتوح بالفعل لنفس العميل؟ الشحنة تفضل معلّقة (orphan) وتستنى
  // لحد ما البيان ده يتقفل ويتفتح بيان جديد يلمّها.
  const [openManifest] = await db
    .select({ id: clientAccountManifestsTable.id })
    .from(clientAccountManifestsTable)
    .where(and(
      eq(clientAccountManifestsTable.clientId, clientId),
      eq(clientAccountManifestsTable.status, "open"),
      tenantCondition,
    ))
    .limit(1);
  if (openManifest) return;

  // مفيش بيان مفتوح → نفتح واحد جديد للعميل ده (نفس منطق POST /client-account-manifests)
  // ونضيف الشحنة له فورًا.
  const now = new Date();
  const manifestNumber = await generateManifestNumber(clientId);
  const [result] = await db.insert(clientAccountManifestsTable).values({
    tenantId: tenantId ?? null,
    manifestNumber,
    clientId,
    status: "open",
    notes: null,
    createdAt: now,
    scheduledCloseAt: computeNextClosingDate(now),
  });
  const manifestId = (result as any).insertId as number;

  await db.insert(clientAccountManifestItemsTable).values({
    manifestId,
    shipmentId,
    deliveryStatus: "pending",
    addedAt: now,
  });
}

// ─── GET /client-account-manifests?clientId=X ────────────────────────────────
router.get("/client-account-manifests", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;

    const tenantCondition = tenantId !== null
      ? or(eq(clientAccountManifestsTable.tenantId, tenantId), isNull(clientAccountManifestsTable.tenantId))
      : undefined;

    const where = and(
      tenantCondition,
      clientId ? eq(clientAccountManifestsTable.clientId, clientId) : undefined,
    );

    const manifests = await db
      .select()
      .from(clientAccountManifestsTable)
      .where(where)
      .orderBy(desc(clientAccountManifestsTable.createdAt));

    const ids = manifests.map(m => m.id);
    let countMap: Record<number, number> = {};
    let statusCountMap: Record<number, { pending: number; delayed: number; returned: number; delivered: number; partial: number }> = {};
    if (ids.length) {
      // ⚠️ كل الشحنات اللي جوة البيان بتتحسب هنا (بما فيها "قيد الانتظار" =
      // pending)، عشان shipmentCount + مجموع statusCounts يطابقوا بالظبط عدد
      // الشحنات الفعلي جوة البيان (زي تاب "الشحنات").
      //
      // 🔑 بنحسب "الحالة الفعلية" (effective status) بنفس اشتقاق صفحة تفاصيل
      // البيان (client-account-manifest-detail.tsx سطر ~3982): لو البند لسه
      // deliveryStatus="pending" بس الشحنة نفسها اتغيّرت لحالة نهائية
      // (returned/delivered/received/partial_received) → بنحسبها بحالة الشحنة
      // مش pending. من غير ده الشحنة المرتجعة اللي اتسجّلت على مستوى الشحنة بس
      // (مش على بند بيان حساب العميل) بتتحسب غلط "قيد العمل" في كروت الملخّص
      // بدل "مرتجع" — فيظهر مثلاً 4 قيد العمل بدل 3 قيد العمل + 1 مرتجع.
      const itemRows = await db
        .select({
          manifestId: clientAccountManifestItemsTable.manifestId,
          shipmentId: clientAccountManifestItemsTable.shipmentId,
          deliveryStatus: clientAccountManifestItemsTable.deliveryStatus,
        })
        .from(clientAccountManifestItemsTable)
        .where(inArray(clientAccountManifestItemsTable.manifestId, ids));

      const itemShipmentIds = [...new Set(itemRows.map(r => r.shipmentId))];
      const shipmentStatusById: Record<number, string> = {};
      if (itemShipmentIds.length) {
        // نستبعد الشحنات المحذوفة (soft delete) — بندها في البيان بيتخطّى تمامًا في
        // العدّ تحت (زي ما بتختفي من جدول الشحنات جوه تفاصيل البيان).
        const shRows = await db
          .select({ id: shipmentsTable.id, status: shipmentsTable.status })
          .from(shipmentsTable)
          .where(and(inArray(shipmentsTable.id, itemShipmentIds), isNull(shipmentsTable.deletedAt)));
        shRows.forEach(s => { shipmentStatusById[s.id] = s.status; });
      }
      // نفس statusMap بتاع الفرونت بالظبط — بس الحالات النهائية بتعمل override
      // على البند اللي لسه pending. أي حالة شحنة تانية (in_shipping/warehouse_ready
      // /confirmed...) بتفضل "قيد العمل".
      const SHIPMENT_TO_DELIVERY: Record<string, string> = {
        returned: "returned",
        partial_received: "partial_delivered",
        delivered: "delivered",
        received: "delivered",
      };

      itemRows.forEach(r => {
        // شحنة محذوفة (deletedAt) أو مش موجودة → مش في shipmentStatusById →
        // تتخطّى من العدّ بالكامل عشان shipmentCount + مجموع statusCounts يفضلوا
        // مطابقين لعدد الشحنات الظاهرة فعليًا في تفاصيل البيان.
        if (!(r.shipmentId in shipmentStatusById)) return;
        const mid = r.manifestId;
        countMap[mid] = (countMap[mid] ?? 0) + 1;
        if (!statusCountMap[mid]) statusCountMap[mid] = { pending: 0, delayed: 0, returned: 0, delivered: 0, partial: 0 };
        let st = r.deliveryStatus ?? "pending";
        if (st === "pending") {
          const shStatus = shipmentStatusById[r.shipmentId];
          if (shStatus && SHIPMENT_TO_DELIVERY[shStatus]) st = SHIPMENT_TO_DELIVERY[shStatus];
        }
        if (st === "delayed") statusCountMap[mid].delayed += 1;
        else if (st === "returned") statusCountMap[mid].returned += 1;
        else if (st === "delivered") statusCountMap[mid].delivered += 1;
        else if (st === "partial_delivered") statusCountMap[mid].partial += 1;
        // pending + أي حالة تانية غير متوقعة بتتحسب "قيد العمل" (قيد الانتظار
        // فعليًا)، عشان مجموع كل الحقول يطابق shipmentCount دايمًا.
        else statusCountMap[mid].pending += 1;
      });
    }

    const clientIds = [...new Set(manifests.map(m => m.clientId))];
    const clientsRows = clientIds.length
      ? await db.select({ id: clientsTable.id, name: clientsTable.name, avatar: clientsTable.avatar })
          .from(clientsTable).where(inArray(clientsTable.id, clientIds))
      : [];
    const clientMap: Record<number, { name: string; avatar: string | null }> = {};
    clientsRows.forEach(c => { clientMap[c.id] = { name: c.name, avatar: c.avatar }; });

    // ─── الأوردرات الجديدة لكل عميل ظاهر في القائمة = أي شحنة للعميل لسه
    // مفيهاش أي صف خالص في جدول بنود بيانات حساب العميل (مش في أي بيان، مفتوح
    // أو مقفول)، ووصلت فعليًا "قيد الشحن في المخزن" (warehouse_ready) أو أبعد.
    // شحنة لسه "قيد الانتظار" (pending/waiting) أو "مؤكدة" (confirmed) مالهاش
    // علاقة بالبيان خالص ومتتحسبش هنا خالص — نفس منطق NOT_COUNTED_STATUSES في
    // finance-clients.ts ونفس شرط autoAddShipmentToClientAccountManifest، عشان
    // الحاوية دي متعرضش رقم لشحنة لسه ماوصلتش المخزن أصلًا.
    const NOT_COUNTED_STATUSES = ["pending", "waiting", "confirmed", "cancelled"];
    const pendingCountByClient: Record<number, number> = {};
    if (clientIds.length) {
      const clientShipmentRows = await db
        .select({ id: shipmentsTable.id, clientId: shipmentsTable.clientId, status: shipmentsTable.status })
        .from(shipmentsTable)
        .where(and(inArray(shipmentsTable.clientId, clientIds), isNull(shipmentsTable.deletedAt)));
      const eligible = clientShipmentRows.filter(s => !NOT_COUNTED_STATUSES.includes(s.status));
      const eligibleIds = eligible.map(s => s.id);
      let alreadyInManifest = new Set<number>();
      if (eligibleIds.length) {
        const existingItemRows = await db
          .select({ shipmentId: clientAccountManifestItemsTable.shipmentId })
          .from(clientAccountManifestItemsTable)
          .where(inArray(clientAccountManifestItemsTable.shipmentId, eligibleIds));
        alreadyInManifest = new Set(existingItemRows.map(r => r.shipmentId));
      }
      eligible.forEach(s => {
        if (s.clientId == null) return;
        if (!alreadyInManifest.has(s.id)) {
          pendingCountByClient[s.clientId] = (pendingCountByClient[s.clientId] ?? 0) + 1;
        }
      });
    }

    // ⚠️ ملحوظة: البيان المفتوح والمغلق بيتحسبوا بنفس المنطق بالظبط — من
    // client_account_manifest_items مباشرة (مش من جدول shipments). قديمًا كان
    // البيان المفتوح بيحسب "كل شحنات العميل" من shipments، وده كان بيخلي أي
    // شحنة waiting/pending للعميل (حتى لو مش مرتبطة بالبيان أصلاً، أو اتشالت من
    // items بعد ما كانت مضافة) تظهر غلط كـ "قيد عمل" في كارت البيان. الإضافة
    // للبيان بتتم فقط عبر autoAddShipmentToClientAccountManifest لما الشحنة
    // توصل warehouse_ready فعليًا، فالاعتماد على items هو المصدر الصحيح الوحيد.
    const result = manifests.map(m => ({
      ...m,
      shipmentCount: countMap[m.id] ?? 0,
      statusCounts: statusCountMap[m.id] ?? { pending: 0, delayed: 0, returned: 0, delivered: 0, partial: 0 },
      clientName: clientMap[m.clientId]?.name ?? "",
      clientAvatar: clientMap[m.clientId]?.avatar ?? null,
      // "الأوردرات الجديدة" = الأوردرات المعلّقة اللي بره أي بيان (orphan) — أي
      // شحنة للعميل لسه مش مضافة لأي بيان (بما فيها اللي لسه "قيد الانتظار")،
      // فبتستنى في الحاوية دي لحد ما تتضاف للبيان. البند اللي جوة البيان نفسه
      // مش بيتحسب هنا — الكارت ده مخصوص للأوردرات الجديدة الجاية بره البيان فقط.
      pendingShipmentsCount: m.status === "open"
        ? (pendingCountByClient[m.clientId] ?? 0)
        : 0,
    }));

    res.json(result);
  } catch (e) {
    console.error("[GET /client-account-manifests]", e);
    res.status(500).json({ error: "خطأ في جلب البيانات" });
  }
});

// ─── GET /client-account-manifests/clients-with-balance ──────────────────────
// قائمة كل العملاء التجاريين (اللي عندهم بيانات حساب عميل) مع رصيد كل واحد محسوب
// تُستخدم في القائمة المنسدلة لصفحة "سداد حساب عميل" بالمصروفات
router.get("/client-account-manifests/clients-with-balance", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);

    // كل العملاء اللي عندهم بيان حساب عميل واحد على الأقل
    const manifestConds: any[] = [];
    if (tenantId !== null) manifestConds.push(eq(clientAccountManifestsTable.tenantId, tenantId));
    const allManifests = await db
      .select({ id: clientAccountManifestsTable.id, clientId: clientAccountManifestsTable.clientId, status: clientAccountManifestsTable.status })
      .from(clientAccountManifestsTable)
      .where(manifestConds.length ? and(...manifestConds) : undefined);

    const clientIds = Array.from(new Set(allManifests.map(m => m.clientId).filter(Boolean)));
    if (!clientIds.length) { res.json({ clients: [] }); return; }

    const clients = await db
      .select({ id: clientsTable.id, name: clientsTable.name, phone: clientsTable.phone })
      .from(clientsTable)
      .where(inArray(clientsTable.id, clientIds));

    const allManifestIds = allManifests.map(m => m.id);

    const itemsByManifest = allManifestIds.length
      ? await db.select().from(clientAccountManifestItemsTable).where(inArray(clientAccountManifestItemsTable.manifestId, allManifestIds))
      : [];
    const shipmentIds = Array.from(new Set(itemsByManifest.map(i => i.shipmentId)));
    const shipments = shipmentIds.length
      ? await db.select().from(shipmentsTable).where(and(inArray(shipmentsTable.id, shipmentIds), isNull(shipmentsTable.deletedAt)))
      : [];
    const shipmentMap: Record<number, any> = {};
    shipments.forEach(s => { shipmentMap[s.id] = s; });

    const manifestClientMap: Record<number, number> = {};
    allManifests.forEach(m => { manifestClientMap[m.id] = m.clientId; });

    // تجميع صافي المستحق لكل عميل من كل الـ items بتاعة كل بيانات العميل (كل الحالات)
    const balanceByClient: Record<number, number> = {};
    for (const item of itemsByManifest) {
      const cId = manifestClientMap[item.manifestId];
      if (!cId) continue;
      const shipment = shipmentMap[item.shipmentId];
      if (!shipment) continue;
      const cod      = Number(shipment.codAmount ?? shipment.totalAmount ?? 0);
      const shipping = Number(shipment.shippingFee ?? 0);
      let delta = 0;

      if (item.deliveryStatus === "delivered") {
        const dvr = (item as any).deliveredValueReceived;
        const actualCod = dvr != null ? Number(dvr) : cod;
        delta = actualCod - shipping;
      } else if (
        (item.deliveryStatus === "partial_delivered" || item.deliveryStatus === "partial_received") &&
        item.partialQuantity != null
      ) {
        // ⚠️ partial_received كانت متفوّتة هنا قبل كده — نفس الفرق اللي كان بيظهر
        // بين رصيد العميل الإجمالي وصفحة بيان العميل التفصيلية.
        const pq = item.deliveryStatus === "partial_received"
          ? Math.round(Number(item.partialQuantity))
          : Number(item.partialQuantity);
        delta = pq - shipping;
      }
      balanceByClient[cId] = (balanceByClient[cId] ?? 0) + delta;
    }

    // خصم السدادات السابقة (سداد حساب عميل) من رصيد كل عميل
    const paymentConds: any[] = [inArray(clientAccountPaymentsTable.clientId, clientIds)];
    const payments = await db
      .select({ clientId: clientAccountPaymentsTable.clientId, amount: clientAccountPaymentsTable.amount })
      .from(clientAccountPaymentsTable)
      .where(and(...paymentConds));
    for (const p of payments) {
      balanceByClient[p.clientId] = (balanceByClient[p.clientId] ?? 0) - Number(p.amount ?? 0);
    }

    const result = clients
      .map(c => ({ id: c.id, name: c.name, phone: c.phone, balance: balanceByClient[c.id] ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"));

    res.json({ clients: result });
  } catch (e) {
    console.error("[GET /client-account-manifests/clients-with-balance]", e);
    res.status(500).json({ error: "خطأ في جلب قائمة العملاء بالأرصدة" });
  }
});

// ─── GET /client-account-manifests/balance/:clientId ─────────────────────────
// إجمالي رصيد العميل = مجموع "الرصيد المستحق" لكل بيانات العميل (كل الحالات) —
// نفس منطق getCollectedAmount + displayedShippingCost في client-account-manifest-detail.tsx
// (كارت "الرصيد المستحق" الثابت أعلى صفحة تفاصيل البيان): لكل شحنة، المبلغ
// المُحصَّل فعليًا (مسلَّم/جزئي/مرتجع بسبب مالي) ناقص سعر الشحن (مصفَّر للمؤجل/
// المعلَّق/قيد الانتظار أو المرتجع بسبب غير مالي).
router.get("/client-account-manifests/balance/:clientId", async (req, res): Promise<void> => {
  try {
    // منع أي كاش (ETag/304) على هذا الـ endpoint — الرصيد لازم يتحسب Fresh من
    // السيرفر في كل مرة، لأنه بيعتمد على بيانات بتتغيّر باستمرار (حالة الشحنات،
    // القيم المستلمة، السدادات). كاش الـ 304 كان بيرجّع للمتصفح رقم قديم مخزّن
    // حتى بعد تعديل الكود، لأن الـ handler ماكانش بيتنفذ من الأساس.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    const clientId = Number(req.params.clientId);
    if (!clientId) { res.status(400).json({ error: "معرّف العميل غير صالح" }); return; }

    // إجمالي رصيد العميل بيحسب بس من البيانات المقفولة (status = closed) — البيان
    // المفتوح لسه قيد التحرير ومش نهائي، فرصيده ميظهرش في الإجمالي لحد ما يتقفل.
    // منطق الحساب مستخرج في computeClosedManifestsForClient (lib/clientAccountBalance.ts)
    // عشان يتشارك بين الـ endpoint ده وبين كشف الحساب /finance/clients/:id/statement —
    // لازم يفضلوا متطابقين تمامًا، ده الرقم المرجعي الوحيد الصحيح.
    const { balance, manifests } = await computeClosedManifestsForClient(clientId);

    res.json({ clientId, balance, manifestsCount: manifests.length });
  } catch (e) {
    console.error("[GET /client-account-manifests/balance/:clientId]", e);
    res.status(500).json({ error: "خطأ في حساب رصيد العميل" });
  }
});

// ─── GET /client-account-manifests/:id ───────────────────────────────────────
router.get("/client-account-manifests/:id", async (req, res): Promise<void> => {
  try {
    // منع أي كاش (ETag/304) على هذا الـ endpoint — نفس السبب المطبّق على
    // /client-account-manifests/summary/:clientId فوق: البيانات (حالة الشحنات،
    // القيم المستلمة، rolledOver) بتتغيّر باستمرار، وكاش الـ 304 كان بيخلي
    // المتصفح يرجّع نسخة قديمة (مثلاً rolledOver من قبل إصلاح شرط lt/gt) حتى
    // بعد أي تعديل لاحق في الكود، لأن الـ handler ماكانش بيتنفذ من الأساس.
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    const id = Number(req.params.id);
    const [manifest] = await db.select().from(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, id));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }

    const items = await db
      .select()
      .from(clientAccountManifestItemsTable)
      .where(eq(clientAccountManifestItemsTable.manifestId, id));

    const shipmentIds = items.map(i => i.shipmentId);
    let shipments: any[] = [];
    if (shipmentIds.length) {
      // 🔑 نستبعد الشحنات المحذوفة (soft delete: deletedAt != null) — الشحنة اللي
      // اتمسحت من قسم الشحنات مالهاش تظهر في البيان. صف البند نفسه بيفضل موجود في
      // client_account_manifest_items (عشان لو الشحنة اترجعت بـ /restore تظهر تاني
      // تلقائيًا)، بس بيتفلتر بره العرض وكل الحسابات عبر visibleItems تحت.
      shipments = await db.select().from(shipmentsTable).where(and(inArray(shipmentsTable.id, shipmentIds), isNull(shipmentsTable.deletedAt)));
    }
    const shipmentMap: Record<number, any> = {};
    shipments.forEach(s => { shipmentMap[s.id] = s; });

    // ─── استبعاد الشحنات اللي حالتها الحالية "قيد الانتظار" (waiting/pending) من
    // عرض تفاصيل البيان — ممكن تكون اتضافت للبيان لما كانت "قيد الشحن في المخزن"
    // وبعدين حالتها اترجعت لقيد الانتظار (مثلاً اتلغى تجهيزها)، فمينفعش تفضل
    // ظاهرة كأنها جزء فعلي من البيان رغم إن الحماية المركزية بتمنع إضافتها من الأساس.
    // العنصر (row) بيفضل موجود في الجدول للتاريخ، بس بيتفلتر بره العرض والحسابات هنا.
    //
    // ملحوظة: مبنستبعدش العنصر بناءً على item.deliveryStatus === "pending"،
    // لأن "pending" هي القيمة الافتراضية لأي شحنة بتتضاف حديثًا للبيان (لسه محدش
    // سجّل نتيجة تسليمها) — مش معناها إن الشحنة نفسها لسه منتظرة في المخزن.
    // المعيار الوحيد لإخفاء الشحنة من عرض البيان هو حالتها الفعلية (shipment.status).
    const EXCLUDED_SHIPMENT_STATUSES = new Set(["waiting", "pending"]);
    const visibleItems = items.filter(item => {
      const sh = shipmentMap[item.shipmentId];
      // الشحنة اتحذفت (deletedAt) أو مش موجودة خالص (اتشالت من shipmentMap فوق)
      // → البند بيختفي من عرض البيان وكل الحسابات المالية المبنية على visibleItems.
      if (!sh) return false;
      if (EXCLUDED_SHIPMENT_STATUSES.has(sh.status)) return false;
      return true;
    });

    // ── returnValueReceived للمرتجع بالأسباب المالية (رفض بعد المعاينة / تهرب) ──
    // القيمة دي بتتسجل في جدول بيان الشحن (shipment_manifest_items) مش في جدول
    // بيان حساب العميل نفسه، فبنجيبها هنا كـ fallback زي partialQuantity بالضبط.
    let shipmentReturnValueMap: Record<number, number> = {};
    if (shipmentIds.length) {
      const smItems = await db
        .select({
          shipmentId: shipmentManifestItemsTable.shipmentId,
          returnValueReceived: shipmentManifestItemsTable.returnValueReceived,
          addedAt: shipmentManifestItemsTable.addedAt,
        })
        .from(shipmentManifestItemsTable)
        .where(and(
          inArray(shipmentManifestItemsTable.shipmentId, shipmentIds),
          eq(shipmentManifestItemsTable.deliveryStatus, "returned"),
        ));
      // نرتب تصاعديًا بالـ addedAt، وبعدين overwrite في اللوب — فآخر كتابة (الأحدث) هي اللي تفضل
      smItems
        .filter(r => r.returnValueReceived != null)
        .sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime())
        .forEach(row => {
          shipmentReturnValueMap[row.shipmentId] = Number(row.returnValueReceived);
        });
    }

    // ── deliveredValueReceived للمسلَّم بقيمة أقل/أكتر من الإجمالي (زي فاتن: 1085
    // بدل 1585) — القيمة دي كمان بتتسجل في جدول بيان الشحن (shipment_manifest_items)
    // مش بيان حساب العميل، فبنجيبها هنا fallback بنفس منطق returnValueReceived فوق —
    // عشان لو الـ sync التلقائي فات شحنة (تحديثات قديمة قبل إصلاح المزامنة) يفضل
    // في مصدر بديل ياخد منه الفرونت إند القيمة الصح.
    let shipmentDeliveredValueMap: Record<number, number> = {};
    if (shipmentIds.length) {
      const smDeliveredItems = await db
        .select({
          shipmentId: shipmentManifestItemsTable.shipmentId,
          deliveredValueReceived: shipmentManifestItemsTable.deliveredValueReceived,
          addedAt: shipmentManifestItemsTable.addedAt,
        })
        .from(shipmentManifestItemsTable)
        .where(and(
          inArray(shipmentManifestItemsTable.shipmentId, shipmentIds),
          eq(shipmentManifestItemsTable.deliveryStatus, "delivered"),
        ));
      smDeliveredItems
        .filter(r => r.deliveredValueReceived != null)
        .sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime())
        .forEach(row => {
          shipmentDeliveredValueMap[row.shipmentId] = Number(row.deliveredValueReceived);
        });
    }

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, manifest.clientId));
    const clientType = client?.clientType ?? "normal";

    const zoneIds = [...new Set(shipments.map(s => s.zoneId).filter((v): v is number => !!v))];
    let zoneShippingMap: Record<number, number> = {};
    if (zoneIds.length) {
      const zones = await db.select().from(shipmentZonesTable).where(inArray(shipmentZonesTable.id, zoneIds));
      zoneShippingMap = Object.fromEntries(zones.map(z => {
        const priceByType =
          clientType === "vip"        ? z.priceVip :
          clientType === "commercial" ? z.priceCommercial :
          z.priceNormal;
        const resolved = priceByType != null && Number(priceByType) > 0 ? priceByType : z.price;
        return [z.id, Number(resolved) || 0];
      }));
    }
    const getZoneShipping = (shipment: any) =>
      shipment?.zoneId ? (zoneShippingMap[shipment.zoneId] ?? Number(shipment.shippingFee ?? 0)) : Number(shipment?.shippingFee ?? 0);

    // ── تكلفة المندوب — من بيان المندوب نفسه، مش من منطقة الشحنة الجغرافية ──
    // نفس منطق computeManifestNetDue (lib/manifestFinance.ts) بالظبط، لكن مصدر
    // شركة الشحن هنا مختلف: shipment.shippingCompanyId بيتسجل بس وقت ما الشحنة
    // تنضم لبيان شحن (shipment_manifests) — فمعظم الشحنات (اللي دخلت بيان عميل
    // من غير ما تدخل بيان مندوب) بتفضل shippingCompanyId فاضي على جدول shipments
    // نفسه، حتى لو فعليًا سلّمها مندوب معيّن. المصدر الصح هو آخر بيان شحن
    // (shipment_manifests) اتضافت له الشحنة، عن طريق shipment_manifest_items.
    // حسب costMode بتاع الشركة:
    //   "rep"  → سعر ثابت واحد لكل شحنة (company.shippingCost)
    //   "zone" → سعر تكلفة منطقة الشحنة (zone_costs.deliveryCost)
    let shipmentToCompanyId: Record<number, number> = {};
    if (shipmentIds.length) {
      const manifestLinkRows = await db
        .select({
          shipmentId: shipmentManifestItemsTable.shipmentId,
          addedAt: shipmentManifestItemsTable.addedAt,
          companyId: shipmentManifestsTable.shippingCompanyId,
        })
        .from(shipmentManifestItemsTable)
        .innerJoin(shipmentManifestsTable, eq(shipmentManifestItemsTable.manifestId, shipmentManifestsTable.id))
        .where(and(
          inArray(shipmentManifestItemsTable.shipmentId, shipmentIds),
          isNull(shipmentManifestsTable.clientId), // بيانات المناديب بس (مش بيانات عملاء)
        ));
      // آخر بيان مندوب اتضافت له الشحنة (أحدث addedAt) هو المصدر — نفس منطق
      // shipmentReturnValueMap فوق بالظبط.
      manifestLinkRows
        .filter(r => r.companyId != null)
        .sort((a, b) => new Date(a.addedAt).getTime() - new Date(b.addedAt).getTime())
        .forEach(row => {
          shipmentToCompanyId[row.shipmentId] = row.companyId as number;
        });
    }
    const shipmentCompanyIds = [...new Set([
      ...shipments.map(s => s.shippingCompanyId).filter((v): v is number => !!v),
      ...Object.values(shipmentToCompanyId),
    ])];
    let companyCostModeMap: Record<number, { costMode: string; shippingCost: number }> = {};
    if (shipmentCompanyIds.length) {
      const companyRows = await db.select({
        id: shippingCompaniesTable.id,
        costMode: shippingCompaniesTable.costMode,
        shippingCost: shippingCompaniesTable.shippingCost,
      }).from(shippingCompaniesTable).where(inArray(shippingCompaniesTable.id, shipmentCompanyIds));
      companyCostModeMap = Object.fromEntries(companyRows.map(c => [c.id, {
        costMode: c.costMode === "zone" ? "zone" : "rep",
        shippingCost: Math.abs(Number(c.shippingCost ?? 0)),
      }]));
    }
    let zoneCostMap: Record<number, number> = {};
    if (zoneIds.length) {
      const zoneCostRows = await db.select().from(zoneCostsTable).where(inArray(zoneCostsTable.zoneId, zoneIds));
      zoneCostMap = Object.fromEntries(zoneCostRows.map(z => [z.zoneId as number, Number(z.deliveryCost) || 0]));
    }
    const getZoneCost = (shipment: any) => {
      if (!shipment) return 0;
      // shipment.shippingCompanyId (لو موجود فعليًا) له أولوية، وإلا نرجع لآخر
      // بيان مندوب اتضافت له الشحنة (shipmentToCompanyId).
      const companyId = shipment.shippingCompanyId ?? shipmentToCompanyId[shipment.id];
      const company = companyId ? companyCostModeMap[companyId] : null;
      if (company) {
        return company.costMode === "zone"
          ? (shipment.zoneId != null ? (zoneCostMap[shipment.zoneId] ?? 0) : 0)
          : company.shippingCost;
      }
      // fallback: مفيش شركة شحن مرتبطة بالشحنة خالص (لسه في المخزن ومتحطتش
      // على أي مندوب) — تكلفة المنطقة الجغرافية القديمة.
      return shipment.zoneId != null ? (zoneCostMap[shipment.zoneId] ?? 0) : 0;
    };

    // ── جلب أسماء المناديب (assignedUserId) دفعة واحدة ──────────────────────
    const repUserIds = [...new Set(shipments.map(s => s.assignedUserId).filter((v): v is number => !!v))];
    let repNameMap: Record<number, string> = {};
    if (repUserIds.length) {
      const repUsers = await db
        .select({ id: usersTable.id, displayName: usersTable.displayName })
        .from(usersTable)
        .where(inArray(usersTable.id, repUserIds));
      repNameMap = Object.fromEntries(repUsers.map(u => [u.id, u.displayName]));
    }

    // ── جلب أسماء المخازن (warehouseId) دفعة واحدة — المخزن اللي المرتجع بيرجع له ──
    const warehouseIds = [...new Set(shipments.map(s => s.warehouseId).filter((v): v is number => !!v))];
    let warehouseNameMap: Record<number, string> = {};
    if (warehouseIds.length) {
      const warehouseRows = await db
        .select({ id: warehousesTable.id, name: warehousesTable.name })
        .from(warehousesTable)
        .where(inArray(warehousesTable.id, warehouseIds));
      warehouseNameMap = Object.fromEntries(warehouseRows.map(w => [w.id, w.name]));
    }

    // ── جلب أسعار "الزيادة على المندوب" حسب نوع الشحنة (parcel type) ───────
    const parcelTypes = [...new Set(shipments.map(s => s.parcelType).filter((v): v is string => !!v))];
    let parcelPricingMap: Record<string, { label: string; repExtraCost: number; basePrice: number }> = {};
    if (parcelTypes.length) {
      const conds: any[] = [inArray(parcelTypePricingTable.parcelType, parcelTypes)];
      if (manifest.tenantId !== null && manifest.tenantId !== undefined) {
        conds.push(or(eq(parcelTypePricingTable.tenantId, manifest.tenantId), isNull(parcelTypePricingTable.tenantId)));
      }
      const pricingRows = await db
        .select({
          tenantId: parcelTypePricingTable.tenantId,
          parcelType: parcelTypePricingTable.parcelType,
          label: parcelTypePricingTable.label,
          repExtraCost: parcelTypePricingTable.repExtraCost,
          basePrice: parcelTypePricingTable.basePrice,
        })
        .from(parcelTypePricingTable)
        .where(and(...conds));
      const currentTenantId = manifest.tenantId ?? null;
      for (const row of pricingRows) {
        const existing = parcelPricingMap[row.parcelType];
        const isTenantRow = row.tenantId !== null && row.tenantId !== undefined && row.tenantId === currentTenantId;
        if (!existing || isTenantRow) {
          parcelPricingMap[row.parcelType] = {
            label: row.label ?? row.parcelType,
            repExtraCost: Number(row.repExtraCost ?? 0),
            basePrice: Number(row.basePrice ?? 0),
          };
        }
      }
    }

    const RETURN_REASONS_WITH_VALUE = new Set(["refused_paid", "refused_unpaid", "quality"]);

    // ─── تحديد البنود "المُرحّلة" (rolledOver) ────────────────────────────────
    // إصلاح (كان بيستخدم lt/بيان أقدم غلط — راجع تحقيق محمد 3/محمد 5):
    // وجود بيان **أقدم** بنفس الشحنة معناه إن السلسلة دي اتُرحّلت قبل كده تاريخيًا،
    // مش إن البند الحالي نفسه اتجاوَزه حد. شحنة ممكن تترحّل أكتر من مرة (بيان يتقفل
    // والشحنة لسه معلّقة → نسخة جديدة في بيان أحدث، وتتكرر)، فمعظم الشحنات المُرحّلة
    // هيكون ليها صفوف في بيانات أقدم كتير — ده لوحده مبيقولش حاجة عن كون البند الحالي
    // لسه فعّال ولا لأ.
    // المعيار الصح: البند بيبقى "مُرحّل" (يعني نسخة قديمة اتجاوزتها نسخة أحدث، ولازم
    // يختفي من جدول «الشحنات في البيان» ويظهر في الحاوية الحمرا بس) لو وبس لو فيه
    // بيان **أحدث** (id أكبر) بنفس الشحنة. لو مفيش بيان أحدث، يبقى البند ده هو آخر
    // حلقة في سلسلة الترحيل — النسخة النشطة الوحيدة دلوقتي — ولازم يظهر في الجدول
    // عادي طالما البيان الحالي مفتوح، بغض النظر عن عدد مرات ترحيله قبل كده.
    // الحذف من البيان (DELETE) بيمسح صف البند القديم، فمفيش false positive من
    // إعادة الإضافة.
    // ⚠️⚠️ إصلاح جوهري: المعيار الصح لـ "مُرحَّل" هو وجود بيان **أقدم** (id أصغر)
    // بنفس الشحنة — يعني البند الحالي (في البيان الحالي اللي بيتفتح) هو النسخة
    // اللي وصلت هنا عن طريق الترحيل من بيان أقدم اتقفل. الشرط القديم (gt: بيان
    // أحدث) كان بيحدد العكس تمامًا — بيعتبر البند في البيان **القديم** نفسه
    // "مُرحَّل" (لأن فيه بيان أحدث منه)، وبيسيب البند في البيان **الجديد** (اللي
    // هو فعليًا النسخة المُرحَّلة) rolledOver=false غلط. ده سبب ظهور المرتجع
    // المُرحَّل في جدول "الشحنات في البيان" بتاع البيان الجديد بدل ما يختفي منه
    // ويفضل بس في حاوية "بضاعة لسه عند مندوب الشحن"، وسبب عدم تصفير كروت
    // الإيرادات/تكلفة الشحن/الرصيد المستحق للبيان الجديد.
    // ⚠️⚠️ إصلاح جوهري تاني (2026-08-27): لازم نتأكد إن البيان الأقدم (manifest_id
    // الأصغر) موجود فعليًا في client_account_manifests، مش بس إن فيه صف قديم في
    // client_account_manifest_items. لو بيان قديم اتمسح (DELETE) من الجدول
    // الأساسي بدون CASCADE على الجدول الفرعي، بتفضل صفوف "يتيمة" (orphaned) في
    // client_account_manifest_items بنفس shipment_id — والاستعلام القديم (lt
    // بدون JOIN) كان بيعتبر أي شحنة ليها صف يتيم بـ manifest_id أصغر "مُرحّلة"
    // غلط، حتى لو البيان الأصلي ده اتمسح تمامًا ومالوش أي وجود، فكانت كل شحنات
    // البيان الحالي بترجع rolledOver=true غلط والكروت/المودال يطلعوا بأرقام
    // ناقصة عن الظاهر فعليًا في الجدول.
    const rolledOverShipmentIds = new Set<number>();
    if (shipmentIds.length) {
      const olderItemRows = await db
        .select({ shipmentId: clientAccountManifestItemsTable.shipmentId })
        .from(clientAccountManifestItemsTable)
        .innerJoin(
          clientAccountManifestsTable,
          eq(clientAccountManifestItemsTable.manifestId, clientAccountManifestsTable.id)
        )
        .where(and(
          inArray(clientAccountManifestItemsTable.shipmentId, shipmentIds),
          lt(clientAccountManifestItemsTable.manifestId, id), // بيان أقدم من الحالي = البند ده اترحّل منه
        ));
      olderItemRows.forEach(r => rolledOverShipmentIds.add(r.shipmentId));
    }

    const enrichedItems = visibleItems.map(item => {
      const sh = shipmentMap[item.shipmentId] ?? null;
      // item.returnReason (جدول client_account_manifest_items) ممكن يفضل null حتى
      // لو السبب الحقيقي مسجّل على مستوى الشحنة نفسها (shipment.returnReason) — فبنعمل
      // fallback هنا بنفس منطق partialQuantity تحت، عشان الفرونت إند والحسابات المالية
      // كلهم ياخدوا السبب الصح بدل ما يفضل يظهر فاضي.
      const effectiveReturnReason = (item as any).returnReason ?? sh?.returnReason ?? null;
      // القيمة المستلمة وسعر الشحن يظهروا بس للمرتجع بواحد من الأسباب المالية
      // الثلاثة تحديدًا (RETURN_REASONS_WITH_VALUE) — مش أي سبب. أي سبب تاني
      // أو مفيش سبب خالص = بدون قيمة مستلمة وبدون سعر شحن.
      const isReturnedWithValue = item.deliveryStatus === "returned"
        && RETURN_REASONS_WITH_VALUE.has(String(effectiveReturnReason ?? ""));
      // سعر الشحن يظهر فقط للمرتجع بالأسباب المالية الثلاثة (رفض بعد المعاينة
      // مدفوع/غير مدفوع، أو تهرّب من الاستلام "quality") — حتى لو القيمة المستلمة صفر
      // (زي refused_unpaid). أي سبب تاني أو مفيش سبب خالص = سعر شحن صفر.
      const zoneShippingForItem = (item.deliveryStatus !== "returned" || isReturnedWithValue)
        ? getZoneShipping(sh)
        : 0;
      // تكلفة المندوب (zone cost) بنفس شرط ظهور سعر الشحن — عشان لا تُحسب تكلفة
      // على شحنة سعر شحنها صفر أصلًا (مؤجل/مرتجع بسبب غير مالي).
      const zoneCostForItem = (item.deliveryStatus !== "returned" || isReturnedWithValue)
        ? getZoneCost(sh)
        : 0;
      if (effectiveReturnReason === "refused_unpaid" || effectiveReturnReason === "refused_paid") {
        console.log("[BACKEND-SHIPPING-DEBUG]", {
          shipmentId: item.shipmentId,
          effectiveReturnReason,
          isReturnedWithValue,
          zoneShippingForItem,
          shZoneId: sh?.zoneId,
          shShippingFee: sh?.shippingFee,
        });
      }
      return {
        ...item,
        // item.returnReason ممكن يفضل null حتى لو السبب الحقيقي مسجّل على مستوى
        // الشحنة (shipment.returnReason) — نفس الـ fallback المحسوب فوق، عشان الفرونت
        // إند اللي بيقرا o.returnReason يعرض السبب الصح بدل ما يفضل فاضي.
        returnReason: effectiveReturnReason,
        // item.partialQuantity (جدول client_account_manifest_items) ممكن يفضل null
        // حتى لو القيمة الحقيقية مسجّلة على مستوى الشحنة نفسها (shipment.partialQuantity)،
        // فبنعمل fallback هنا عشان الفرونت إند اللي بيقرا o.partialQuantity ياخد القيمة الصح.
        partialQuantity: item.partialQuantity != null ? item.partialQuantity : (sh?.partialQuantity ?? null),
        // returnValueReceived للمرتجع بالأسباب المالية الثلاثة فقط (رفض بعد المعاينة
        // مدفوع/غير مدفوع، أو تهرّب من الاستلام "quality") — القيمة مسجّلة أصلاً في بيان
        // الشحن (shipment_manifest_items) مش في بيان حساب العميل، فبناخدها fallback من
        // هناك. مرتجع بلا سبب خالص، أو بسبب غير الأسباب المالية الثلاثة، يفضل null.
        // ⚠️ استثناء مهم: البند المُرحّل (rolledOver) من بيان قديم مقفول لازم يفضل
        // صفر في البيان الجديد لحد ما يحصل فيه حدث مالي من جديد. لو item.returnValueReceived
        // اتسجّل مباشرة على البند في البيان الحالي (حدث جديد بعد الترحيل) يتاخد عادي؛
        // لكن لو القيمة مش موجودة على البند نفسه، بنمنع الـ fallback لبيان المندوب
        // القديم (shipmentReturnValueMap) للبنود المُرحّلة تحديدًا — عشان القيمة القديمة
        // بتاعة الشحنة الأصلية (قبل الترحيل) متفضلش تظهر تاني في البيان الجديد، وده
        // بالظبط اللي rolloverPendingItemsToNewManifest بيصفّره عمدًا وقت الترحيل.
        returnValueReceived: isReturnedWithValue
          ? ((item as any).returnValueReceived != null
              ? (item as any).returnValueReceived
              : (rolledOverShipmentIds.has(item.shipmentId) ? null : (shipmentReturnValueMap[item.shipmentId] ?? null)))
          : null,
        // deliveredValueReceived: نفس منطق returnValueReceived فوق — item.deliveredValueReceived
        // (جدول client_account_manifest_items) ممكن يفضل null حتى لو القيمة الحقيقية
        // مسجّلة في بيان الشحن (shipment_manifest_items)، فبنعمل fallback هنا عشان الفرونت
        // إند اللي بيقرا o.deliveredValueReceived (getCollectedAmount وغيرها) ياخد القيمة الصح
        // بدل ما يرجع للسعر الإجمالي الكامل (سبب مشكلة فاتن: 1585 بدل 1085).
        // نفس استثناء rolledOver فوق — الـ fallback من بيان المندوب القديم ممنوع
        // للبند المُرحّل، لكن لو item.deliveredValueReceived اتسجّل مباشرة على
        // البند في البيان الحالي (حدث جديد بعد الترحيل) يتاخد عادي.
        deliveredValueReceived: (item as any).deliveredValueReceived != null
          ? (item as any).deliveredValueReceived
          : (rolledOverShipmentIds.has(item.shipmentId) ? null : (shipmentDeliveredValueMap[item.shipmentId] ?? null)),
        shipment: sh,
        // حالة الشحنة الفعلية (shipment.status) — لازم تتضاف صراحةً هنا (مش بس
        // جوة shipment: sh) لأن الفرونت إند (orderStatusOpt في
        // client-account-manifest-detail.tsx) بيقرا order.status مباشرة عشان
        // يعرض الحالة الحقيقية (زي "قيد الشحن") بدل "قيد الانتظار" لما
        // deliveryStatus البيان لسه "pending". من غيرها order.status بيفضل
        // undefined دايمًا فيرجع "قيد الانتظار" حتى لو الشحنة فعليًا قيد الشحن.
        status:        sh?.status ?? null,
        customerName:  sh?.receiverName  ?? "",
        phone:         sh?.receiverPhone ?? "",
        city:          sh?.receiverCity  ?? "",
        address:       sh?.receiverAddress ?? "",
        senderName:    sh?.senderName    ?? "",
        quantity:      sh?.pieces        ?? 1,
        zoneId:        sh?.zoneId ?? null,
        // نفس مصدر الحقيقة الموحّد: تكلفة المنطقة (zone_costs) أولاً، وإلا سعر shipment_zones
        // — لكن للمرتجع بلا سبب خالص، سعر الشحن = صفر.
        zonePrice:     zoneShippingForItem,
        // الإجمالي لازم يستخدم نفس سعر المنطقة الفعلي (getZoneShipping) اللي بيتعرض في
        // عمود "سعر المنطقة" — مش shippingFee الخام اللي ممكن يبقى صفر لو محدّش دخلها يدويًا.
        totalPrice:    Number(sh?.codAmount ?? sh?.totalAmount ?? 0) + zoneShippingForItem,
        unitPrice:     Number(sh?.codAmount ?? sh?.totalAmount ?? 0) + zoneShippingForItem,
        shippingCost:  zoneShippingForItem,
        // تكلفة المندوب الحقيقية (zone_costs.deliveryCost) — سعر توصيل واحد لكل منطقة
        // بدون تصنيف عميل، دي المفروض تتطرح من سعر الشحن عشان نطلع صافي الإيراد الفعلي.
        zoneCost:      zoneCostForItem,
        parcelType:    sh?.parcelType ?? null,
        // ملحوظة: بيان العميل بيعرض سعر العميل (basePrice) مش سعر المندوب (repExtraCost)
        repExtraCost:  (zoneShippingForItem > 0 && sh?.parcelType) ? (parcelPricingMap[sh.parcelType]?.basePrice ?? 0) : 0,
        repExtraReason: (zoneShippingForItem > 0 && sh?.parcelType && (parcelPricingMap[sh.parcelType]?.basePrice ?? 0) > 0)
          ? (parcelPricingMap[sh.parcelType]?.label ?? sh.parcelType)
          : null,
        invoiceNumber: sh?.shipmentNumber ?? "",
        representativeName: sh?.assignedUserId ? (repNameMap[sh.assignedUserId] ?? null) : null,
        warehouseName: sh?.warehouseId ? (warehouseNameMap[sh.warehouseId] ?? null) : null,
        // بند مُرحّل من بيان أقدم؟ الفرونت بيستخدمها عشان المرتجع المُرحّل يظهر في
        // الحاوية الحمرا «بس» مش جدول «الشحنات في البيان» (سطر filteredManifestOrders).
        rolledOver: rolledOverShipmentIds.has(item.shipmentId),
      };
    });

    const delivered = visibleItems.filter(i => i.deliveryStatus === "delivered").length;
    const returned  = visibleItems.filter(i => i.deliveryStatus === "returned").length;
    const pending   = visibleItems.filter(i => i.deliveryStatus === "pending").length;
    const delayed   = visibleItems.filter(i => i.deliveryStatus === "delayed").length;
    const partial   = visibleItems.filter(i => i.deliveryStatus === "partial_delivered").length;

    // ─── حسابات مالية — من منظور حساب العميل (بدل شركة الشحن) ────────────────
    // نفس الأسباب المالية الثلاثة المستخدمة فوق (RETURN_REASONS_WITH_VALUE) — لازم تفضل
    // متطابقة، عشان الإجمالي في الكروت يتوافق مع سعر الشحن الظاهر في الجدول التفصيلي.
    const RETURN_REASONS_WITH_SHIPPING = new Set(["refused_paid", "refused_unpaid", "quality"]);
    let totalRevenue = 0, totalCost = 0, totalShippingCost = 0, returnLosses = 0, deliveredGross = 0;
    let deliveredShippingFees = 0;
    for (const item of visibleItems) {
      const shipment = shipmentMap[item.shipmentId];
      if (!shipment) continue;
      const cod      = Number(shipment.codAmount ?? shipment.totalAmount ?? 0);
      const shipping = getZoneShipping(shipment);
      const cost     = Number(shipment.costPrice ?? 0);

      if (item.deliveryStatus === "delivered") {
        // القيمة الفعلية المستلمة لو المندوب دخلها (زيادة أو نقص)، وإلا الإجمالي العادي (cod)
        // نفس fallback عمود الجدول: لو مش مسجلة في بيان حساب العميل نفسه، نجيبها من
        // بيان الشحن (shipmentDeliveredValueMap) — وإلا الكروت الملخصة (الإيراد الإجمالي)
        // كانت هتفضل بتحسب 1585 بدل 1085 حتى لو الجدول التفصيلي بقى صح.
        const dvr = (item as any).deliveredValueReceived ?? shipmentDeliveredValueMap[item.shipmentId];
        const actualCod = dvr != null ? Number(dvr) : cod;
        totalRevenue += actualCod;
        deliveredGross += actualCod;
        totalCost += cost;
        totalShippingCost += shipping;
        deliveredShippingFees += shipping;
      } else if (item.deliveryStatus === "partial_delivered" || item.deliveryStatus === "partial_received") {
        // partialQuantity هنا في بيان الشحن قيمة مالية فعلية أدخلها المندوب (مش عدد قطع) — تُستخدم كما هي
        // رسوم الشحن تُحسب دايمًا طالما فيه جزء اتسلم، بغض النظر عن استلام المرتجع من شركة الشحن
        // ⚠️ partial_received لازم تتحسب هنا زي partial_delivered بالظبط (نفس منطق
        // getCollectedAmount في الفرونت إند) — وإلا صافي الإيرادات هنا هيختلف عن
        // الرقم الظاهر في صفحة العميل (client-manifest-view.tsx) لأي شحنة partial_received.
        totalShippingCost += shipping;
        deliveredShippingFees += shipping;
        const pqSrc = item.partialQuantity != null ? item.partialQuantity : (shipment as any)?.partialQuantity;
        const partialCodRaw = pqSrc != null
          ? Number(pqSrc)
          : Number((shipment as any).collectedAmount ?? 0);
        // getCollectedAmount في الفرونت إند بيعمل Math.round لحالة partial_received
        // تحديدًا (partial_delivered بياخدها من غير تقريب) — بنحافظ على نفس الفرق هنا.
        const partialCod = item.deliveryStatus === "partial_received"
          ? Math.round(partialCodRaw)
          : partialCodRaw;
        totalRevenue += partialCod;
        deliveredGross += partialCod;
        if ((item as any).returnReceived === 1) {
          const qty = Number(shipment.quantity ?? 1);
          const unitCost = qty > 0 ? cost / qty : cost;
          totalCost += unitCost * partialCod;
        }
      } else if (item.deliveryStatus === "returned") {
        // نفس الـ fallback: السبب ممكن يكون مسجّل على مستوى الشحنة نفسها بس مش
        // على مستوى item هنا.
        const returnReasonEff = (item as any).returnReason ?? (shipment as any)?.returnReason ?? null;
        if (RETURN_REASONS_WITH_SHIPPING.has(String(returnReasonEff ?? ""))) {
          totalShippingCost += shipping;
          // القيمة المستلمة فعليًا من العميل في المرتجع (returnValueReceived) لازم
          // تتجمع مع totalRevenue/deliveredGross هنا زي بالظبط getCollectedAmount في
          // الفرونت إند (client-manifest-view.tsx) — وإلا كارت "إجمالي الإيرادات" هنا
          // هيفضل ناقص القيمة دي حتى لو الجدول التفصيلي وصفحة العميل بيعرضوها صح.
          // بنستخدم نفس الـ fallback (شحنة → بيان قديم) المطبّق فوق لحالة delivered.
          const rvr = (item as any).returnValueReceived ?? shipmentReturnValueMap[item.shipmentId];
          const returnCollected = rvr != null ? Number(rvr) : 0;
          totalRevenue += returnCollected;
          deliveredGross += returnCollected;
        }
      }
    }
    // ─── إجمالي المستحق الشامل: لازم يطابق بالظبط dueValue في computeClosedManifestsForClient
    // (clientAccountBalance.ts) — نفس مصدر الحقيقة المستخدم في "إجمالي رصيد العميل"
    // بالداشبورد. تعديل (2026-08-28، طلب المستخدم): إلغاء المنطق المتفائل القديم (COD
    // كامل لكل الحالات) لأنه كان يخلي هذا الرقم يختلف عن رصيد العميل الإجمالي. الآن:
    // مسلَّم كامل/جزئي + مرتجع بسبب مالي (refused_paid/refused_unpaid/quality) فقط، مع
    // استبعاد أي بند مُرحّل (rolledOver) لسه معلّق (اتحسب فعليًا وقت قفل بيانه الأصلي).
    const RETURN_REASONS_DUE = new Set(["refused_paid", "refused_unpaid", "quality"]);
    let netDueFromClientAllStatuses = 0;
    for (const item of visibleItems as any[]) {
      const shipment = shipmentMap[item.shipmentId];
      if (!shipment) continue;
      const st = item.deliveryStatus;
      const reason = item.returnReason ?? shipment.returnReason ?? null;
      const isReturnedWithValue = st === "returned" && RETURN_REASONS_DUE.has(String(reason ?? ""));

      // بند مُرحّل من بيان أقدم لسه معلّق (مرتجع لم يُستلم بعد) — يُستبعد بالكامل،
      // لأنه اتحسب فعليًا في بيانه الأصلي وقت قفله (نفس isRolledOverPending).
      if (item.rolledOver && st === "returned" && item.returnReceived !== 1) continue;
      if (st === "returned" && !isReturnedWithValue) continue; // مرتجع بلا قيمة مالية: مستبعد تمامًا

      let collected = 0;
      if (st === "delivered") {
        collected = item.deliveredValueReceived != null ? Number(item.deliveredValueReceived) : item.totalPrice;
      } else if (st === "partial_delivered") {
        collected = item.partialQuantity != null ? Number(item.partialQuantity) : (shipment.partialQuantity != null ? Number(shipment.partialQuantity) : 0);
      } else if (st === "partial_received") {
        const pq = item.partialQuantity != null ? item.partialQuantity : shipment.partialQuantity;
        collected = pq != null ? Math.round(Number(pq)) : 0;
      } else if (isReturnedWithValue) {
        collected = item.returnValueReceived != null ? Number(item.returnValueReceived) : (shipmentReturnValueMap[item.shipmentId] ?? 0);
      }

      // "رفض ولم يدفع"/"تهرب من الاستلام": تكلفة المندوب الفعلية (zoneCost) بدل سعر
      // الشحن العادي — نفس useRepCost. غير كده: سعر الشحن العادي (zonePrice) + repExtraCost.
      const useRepCostForDue = isReturnedWithValue && (reason === "refused_unpaid" || reason === "quality");
      // ⚠️ فيكس (فرق بين "الرصيد المستحق" هنا و"إجمالي رصيد العميل"/كشف الحساب):
      // computeClosedManifestsForClient (المرجع الصحيح لرصيد العميل) بيصفّر سعر
      // الشحن بالكامل لبند حالته "قيد الشحن في المخزن" (postponed) أو "قيد
      // الانتظار" (pending) — عبر isShippingZeroedRow. هنا item.zonePrice مكنش
      // بيتصفّر لنفس الحالتين، فسعر الشحن الكامل كان بيتخصم غلط من المستحق لأي
      // بند لسه postponed/pending، فيقلل الرقم هنا عن رصيد العميل الفعلي.
      const isShippingZeroedForDue = st === "postponed" || st === "pending";
      const dueShippingBase = isShippingZeroedForDue ? 0 : (useRepCostForDue ? item.zoneCost : item.zonePrice);
      const dueRepExtraCost = isShippingZeroedForDue ? 0 : (item.repExtraCost ?? 0);
      netDueFromClientAllStatuses += collected - (dueShippingBase + dueRepExtraCost);
    }
    const netProfit = totalRevenue - totalCost - totalShippingCost - returnLosses;
    const netDueFromClient = netDueFromClientAllStatuses; // صافي المستحق من/على العميل — شامل كل الحالات

    res.json({
      ...manifest,
      client: client ?? null,
      items: enrichedItems,
      stats: {
        total: visibleItems.length, delivered, returned, pending, delayed, partial,
        totalRevenue, totalCost, totalShippingCost, returnLosses,
        netProfit, deliveredGross,
        deliveredShippingFees,
        netDueFromClient,
      },
    });
  } catch (e) {
    console.error("[GET /client-account-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في جلب البيان" });
  }
});

// ─── POST /client-account-manifests ──────────────────────────────────────────
const CreateSchema = z.object({
  clientId:    z.number().int().positive(),
  shipmentIds: z.array(z.number().int().positive()).min(1),
  notes:       z.string().nullish(),
});

router.post("/client-account-manifests", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const body = CreateSchema.parse(req.body);

    const [existing] = await db
      .select({ id: clientAccountManifestsTable.id })
      .from(clientAccountManifestsTable)
      .where(and(
        eq(clientAccountManifestsTable.clientId, body.clientId),
        eq(clientAccountManifestsTable.status, "open"),
        tenantId !== null
          ? or(eq(clientAccountManifestsTable.tenantId, tenantId), isNull(clientAccountManifestsTable.tenantId))
          : undefined,
      ));
    if (existing) {
      res.status(409).json({ error: "يوجد بيان مفتوح بالفعل لهذا العميل" });
      return;
    }

    const manifestNumber = await generateManifestNumber(body.clientId);
    const now = new Date();

    const [result] = await db.insert(clientAccountManifestsTable).values({
      tenantId: tenantId ?? null,
      manifestNumber,
      clientId: body.clientId,
      status:   "open",
      notes:    body.notes ?? null,
      createdAt: now,
      scheduledCloseAt: computeNextClosingDate(now),
    });
    const manifestId = (result as any).insertId as number;

    await db.insert(clientAccountManifestItemsTable).values(
      body.shipmentIds.map(sid => ({
        manifestId,
        shipmentId:     sid,
        deliveryStatus: "pending",
        addedAt:        now,
      }))
    );

    res.status(201).json({
      id: manifestId,
      manifestNumber,
      shipmentCount: body.shipmentIds.length,
    });
  } catch (e: any) {
    console.error("[POST /client-account-manifests]", e);
    if (e?.name === "ZodError") { res.status(400).json({ error: e.errors[0]?.message }); return; }
    res.status(500).json({ error: "خطأ في إنشاء البيان" });
  }
});

// ─── PATCH /client-account-manifests/:id/items/:shipmentId ───────────────────
const UpdateItemSchema = z.object({
  deliveryStatus: z.enum(["pending", "delivered", "returned", "delayed", "partial_delivered"]),
  deliveryNote:   z.string().nullish(),
  partialQuantity: z.number().int().nullish(),
  returnReceived: z.boolean().nullish(),
  returnReason:   z.string().nullish(),
  returnValueReceived: z.coerce.number().nullish(),
  deliveredValueReceived: z.coerce.number().nullish(),
  itemReceivedQuantities: z.record(z.string(), z.coerce.number().int().min(0)).nullish(),
});

router.patch("/client-account-manifests/:id/items/:shipmentId", async (req, res): Promise<void> => {
  try {
    const manifestId = Number(req.params.id);
    const shipmentId = Number(req.params.shipmentId);
    const body = UpdateItemSchema.parse(req.body);
    const now = new Date();

    const [manifestRow] = await db.select({ status: clientAccountManifestsTable.status })
      .from(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, manifestId)).limit(1);
    if (!manifestRow) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (manifestRow.status === "closed") { res.status(400).json({ error: "البيان مغلق — لا يمكن التعديل" }); return; }

    // ─── منع حفظ حالة "مرتجع" بدون سبب — لازم يبقى فيه سبب دايمًا، إما جاي في
    // الطلب الحالي أو موجود بالفعل من قبل (زي زرار "تم الاستلام" السريع اللي
    // بيحدّث returnReceived بس على مرتجع مسجّل سببه من الأول). ─────────────────
    if (body.deliveryStatus === "returned") {
      const reasonInRequest = body.returnReason !== undefined ? String(body.returnReason ?? "").trim() : null;
      if (body.returnReason !== undefined) {
        if (!reasonInRequest) { res.status(400).json({ error: "يجب اختيار سبب المرتجع" }); return; }
      } else {
        const [existingItem] = await db.select({ returnReason: clientAccountManifestItemsTable.returnReason })
          .from(clientAccountManifestItemsTable)
          .where(and(
            eq(clientAccountManifestItemsTable.manifestId, manifestId),
            eq(clientAccountManifestItemsTable.shipmentId, shipmentId),
          )).limit(1);
        if (!existingItem?.returnReason?.trim()) { res.status(400).json({ error: "يجب اختيار سبب المرتجع" }); return; }
      }
    }

    await db.update(clientAccountManifestItemsTable)
      .set({
        deliveryStatus:  body.deliveryStatus,
        deliveryNote:    body.deliveryNote ?? null,
        partialQuantity: body.partialQuantity ?? null,
        // returnReason و returnValueReceived: لو الطلب مابعتهمش (undefined) — زي زرار
        // "تم الاستلام" السريع اللي بيبعت returnReceived بس — نسيب القيمة القديمة زي
        // ما هي (undefined في drizzle .set = تجاهل العمود)، عشان الحسابات المالية
        // اللي اتسجلت وقت تسجيل المرتجع تفضل زي ما هي ومتتصفرش بمجرد "تم الاستلام".
        ...(body.returnReason !== undefined ? { returnReason: body.returnReason ?? null } : {}),
        returnReceived:  body.returnReceived == null ? null : body.returnReceived ? 1 : 0,
        ...(body.returnValueReceived !== undefined ? { returnValueReceived: body.returnValueReceived == null ? null : String(body.returnValueReceived) } : {}),
        ...(body.deliveredValueReceived !== undefined ? { deliveredValueReceived: body.deliveredValueReceived == null ? null : String(body.deliveredValueReceived) } : {}),
        deliveredAt:     (body.deliveryStatus === "delivered" || body.deliveryStatus === "partial_delivered") ? now : undefined,
      })
      .where(and(
        eq(clientAccountManifestItemsTable.manifestId, manifestId),
        eq(clientAccountManifestItemsTable.shipmentId, shipmentId),
      ));

    // ربط المخزون: لو الحالة "مرتجع" أو "استلام جزئي" → نفس منطق بيان شركة الشحن بالظبط
    // (deliveryStatus بتاع البيان بيستخدم "partial_delivered"، نظام المخزون بيتوقع "partial_received")
    const inventoryStatus =
      body.deliveryStatus === "returned"          ? "returned" :
      body.deliveryStatus === "partial_delivered" ? "partial_received" :
      undefined;

    if (inventoryStatus) {
      const [existingShipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, shipmentId)).limit(1);
      if (existingShipment) {
        const invPatch: Record<string, any> = {
          status: inventoryStatus,
          returnReceived: body.returnReceived == null ? null : body.returnReceived ? 1 : 0,
          partialQuantity: body.partialQuantity ?? undefined,
        };
        // منتج واحد (single product) على الشحنة نفسها
        await syncShipmentInventory(existingShipment, invPatch);
        // منتجات متعددة (shipment_items) على الشحنة
        await syncShipmentItemsInventory(shipmentId, inventoryStatus, body.itemReceivedQuantities ?? undefined, body.returnReceived === true);
      }
    }

    // مزامنة الحالة مع شحنة الأصل (shipmentsTable) عشان تفضل متسقة مع صفحة الشحنات
    await syncManifestItemToShipment(shipmentId, body.deliveryStatus);

    res.json({ success: true });
  } catch (e: any) {
    console.error("[PATCH /client-account-manifests/:id/items/:shipmentId]", e);
    res.status(500).json({ error: "خطأ في تحديث حالة الشحنة" });
  }
});

// ─── DELETE /client-account-manifests/:id/items/:shipmentId ──────────────────
// إلغاء/إزالة شحنة من بيان حساب العميل: بيشيل صف الـ item من البيان ويرجّع
// الشحنة نفسها (shipmentsTable) لحالة "قيد الانتظار" — بنفس فكرة إزالة الطلب
// من بيان شركة الشحن، لكن على جدول الشحنات الصحيح (shipmentsTable) مش ordersTable.
router.delete("/client-account-manifests/:id/items/:shipmentId", async (req, res): Promise<void> => {
  try {
    const manifestId = Number(req.params.id);
    const shipmentId = Number(req.params.shipmentId);
    if (isNaN(manifestId) || isNaN(shipmentId)) { res.status(400).json({ error: "معرّف غير صالح" }); return; }

    const [manifestRow] = await db.select({ status: clientAccountManifestsTable.status })
      .from(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, manifestId)).limit(1);
    if (!manifestRow) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (manifestRow.status === "closed") { res.status(400).json({ error: "البيان مغلق — لا يمكن التعديل" }); return; }

    const [item] = await db.select({ id: clientAccountManifestItemsTable.id })
      .from(clientAccountManifestItemsTable)
      .where(and(
        eq(clientAccountManifestItemsTable.manifestId, manifestId),
        eq(clientAccountManifestItemsTable.shipmentId, shipmentId),
      ))
      .limit(1);
    if (!item) { res.status(404).json({ error: "الشحنة غير موجودة في هذا البيان" }); return; }

    await db.delete(clientAccountManifestItemsTable)
      .where(eq(clientAccountManifestItemsTable.id, item.id));

    // رجّع الشحنة الأصلية لقيد الانتظار — عشان تدخل بيان جديد لما ترجع "قيد الشحن في المخزن" تاني
    await db.update(shipmentsTable)
      .set({ status: "pending", updatedAt: new Date() })
      .where(eq(shipmentsTable.id, shipmentId));

    res.json({ success: true, shipmentId, message: "تم إلغاء الشحنة من البيان وإرجاعها لقيد الانتظار" });
  } catch (e: any) {
    console.error("[DELETE /client-account-manifests/:id/items/:shipmentId]", e);
    res.status(500).json({ error: "خطأ في إلغاء الشحنة من البيان" });
  }
});

// ─── ترحيل الشحنات المعلقة تلقائيًا عند إغلاق بيان ────────────────────────────
// لما بيان حساب عميل يتقفل، بيتفتح بيان جديد تلقائيًا لنفس العميل ويتجمع فيه:
//   (أ) الشحنات "المعلّقة" بتاعة العميل اللي لسه من غير أي بيان خالص — أي شحنة
//       بغض النظر عن حالتها (تحديث 2026-08-29: اتشال شرط استبعاد waiting/pending
//       القديم، عشان أي شحنة orphan تتضاف للبيان الجديد فور القفل بدل ما تفضل
//       معلّقة لحد ما توصل warehouse_ready).
//   (ب) شحنات البيان القديم اللي لسه "قيد الانتظار" (pending) أو "مؤجلة"
//       (delayed) أو "مرتجعة ولسه محدّش استلمها" (returned + returnReceived != 1)
//       — دي بتترحّل كـ"نسخة" (نفس الشحنة بتتضاف كبند جديد deliveryStatus="pending"
//       في البيان الجديد)، والبيان القديم المقفول بيفضل زي ما هو بنفس القيم
//       القديمة كسجل تاريخي/أرشيف — من غير أي تعديل عليه.
// آمنة idempotent: بتتنفذ فقط جوه لحظة الإغلاق نفسها. الشحنات المعلّقة بيتم
// التقاطها بشرط واحد: مفيهاش أي صف في clientAccountManifestItemsTable خالص
// (بغض النظر عن حالة أي بيان قديم)، فمفيش خطر تكرار أو التقاط شحنة اتضافت
// لبيان جديد بالفعل.
async function rolloverPendingItemsToNewManifest(
  closedManifestId: number,
  clientId: number,
  tenantId: number | null,
): Promise<{
  rolledOver: number;
  newManifestId: number | null;
  rolledOverManifest: {
    id: number;
    manifestNumber: string;
    orderCount: number;
    postponedCount: number;
    pendingCount: number;
    returnedInShippingCount: number;
    partialInShippingCount: number;
  } | null;
}> {
  const items = await db
    .select()
    .from(clientAccountManifestItemsTable)
    .where(eq(clientAccountManifestItemsTable.manifestId, closedManifestId));

  const pendingItems = items.filter(item => {
    if (item.deliveryStatus === "pending" || item.deliveryStatus === "delayed") return true;
    // ⚠️ تصحيح (2026-08-28): كان فيه هنا شرط بيرحّل كمان returned غير مؤكد
    // الاستلام. المطلوب فعليًا: عند إغلاق البيان، بس قيد الانتظار (pending)
    // والمؤجل (delayed) هما اللي يترحّلوا للبيان الجديد. المرتجع (وبكل حالاته
    // الجزئية) لازم يفضل في البيان القديم المقفول زي ما كان لحظة القفل بالظبط.
    return false;
  });

  // نستبعد أي بند شحنته اتحذفت (soft delete) من الترحيل — الشحنة المحذوفة مالهاش
  // تترحّل لبيان جديد. بنتحقق من الحذف مباشرةً من جدول الشحنات (مش عبر عضوية
  // clientShipments) عشان منستبعدش بالغلط بند شحنته سليمة وموجودة.
  const pendingShipmentIds = pendingItems.map(i => i.shipmentId);
  let nonDeletedPendingSet = new Set<number>();
  if (pendingShipmentIds.length) {
    const nd = await db
      .select({ id: shipmentsTable.id })
      .from(shipmentsTable)
      .where(and(inArray(shipmentsTable.id, pendingShipmentIds), isNull(shipmentsTable.deletedAt)));
    nonDeletedPendingSet = new Set(nd.map(r => r.id));
  }
  const pendingItemsToRoll = pendingItems.filter(i => nonDeletedPendingSet.has(i.shipmentId));

  // ─── الشحنات "المعلّقة" بتاعة نفس العميل: أي شحنة وصلت warehouse_ready أو
  // أبعد (لسه pending/waiting/confirmed تُستبعد تمامًا — دي مالهاش علاقة
  // بالبيان خالص)، ومفيهاش أي صف خالص في جدول بنود بيانات حساب العميل (بغض
  // النظر عن أي بيان، مفتوح أو مقفول). ─────────────────────────────────────
  const tenantCondition = tenantId !== null
    ? or(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.tenantId))
    : undefined;
  const clientShipments = await db
    .select({ id: shipmentsTable.id, status: shipmentsTable.status })
    .from(shipmentsTable)
    .where(and(
      eq(shipmentsTable.clientId, clientId),
      isNull(shipmentsTable.deletedAt), // الشحنة المحذوفة مالهاش تترحّل كـ orphan
      tenantCondition,
    ));
  const eligibleShipmentIds = clientShipments
    .filter(s => !STATUSES_BEFORE_WAREHOUSE.has(s.status))
    .map(s => s.id);

  let orphanShipmentIds: number[] = [];
  if (eligibleShipmentIds.length) {
    const existingItemRows = await db
      .select({ shipmentId: clientAccountManifestItemsTable.shipmentId })
      .from(clientAccountManifestItemsTable)
      .where(inArray(clientAccountManifestItemsTable.shipmentId, eligibleShipmentIds));
    const alreadyInManifest = new Set(existingItemRows.map(r => r.shipmentId));
    orphanShipmentIds = eligibleShipmentIds.filter(sid => !alreadyInManifest.has(sid));
  }

  if (!pendingItemsToRoll.length && !orphanShipmentIds.length) return { rolledOver: 0, newManifestId: null, rolledOverManifest: null };

  const now = new Date();
  const manifestNumber = await generateManifestNumber(clientId);
  const [result] = await db.insert(clientAccountManifestsTable).values({
    tenantId: tenantId ?? null,
    manifestNumber,
    clientId,
    status:   "open",
    notes:    null,
    createdAt: now,
    scheduledCloseAt: computeNextClosingDate(now),
  });
  const newManifestId = (result as any).insertId as number;

  // ─── وقت الترحيل ────────────────────────────────────────────────────────
  // ⚠️ تصحيح (2026-08-28): كان فيه هنا تفرقة بين "قيد الانتظار/مؤجل" و"مرتجع
  // لسه عند مندوب الشحن" لأن pendingItems كانت بترحّل الاتنين. دلوقتي
  // pendingItems بترحّل بس pending/delayed (المرتجع مبيترحّلش خالص، يفضل في
  // بيانه القديم المقفول)، فـ returnedStillAtShippingToRoll هتفضل فاضية
  // دايمًا — سايبها هنا (no-op آمن) عشان الكونتراكت اللي الفرونت بيقراه
  // (rolledOverManifest.returnedInShippingCount) يفضل شغال من غير تعديل هناك.
  const delayedOrPendingToRoll = pendingItemsToRoll.filter(i => i.deliveryStatus !== "returned");
  const returnedStillAtShippingToRoll = pendingItemsToRoll.filter(i => i.deliveryStatus === "returned");

  const newItems = [
    // ⚠️ deliveryStatus هنا لازم يفضل نفس حالة البند الأصلية (pending أو delayed)
    // مش "pending" ثابتة — البند المؤجل (delayed/"مؤجل") المفروض يترحّل لبيانه
    // الجديد وهو لسه مؤجل، مش يترجع "قيد الانتظار" وكأنه بند جديد لسه محدّش
    // سجّل نتيجة تسليمه. تصفير الحالة كده كان بيضيع علامة "مؤجل" اللي المندوب
    // سجّلها بالفعل، ويخلي الأوردر يبان وكأنه أول مرة يتضاف للبيان.
    ...delayedOrPendingToRoll.map(item => ({
      manifestId:     newManifestId,
      shipmentId:     item.shipmentId,
      deliveryStatus: item.deliveryStatus as "pending" | "delayed",
      deliveryNote:   item.deliveryNote ?? null,
      addedAt:        now,
    })),
    ...returnedStillAtShippingToRoll.map(item => ({
      manifestId:          newManifestId,
      shipmentId:          item.shipmentId,
      deliveryStatus:      "returned" as const,
      returnReason:        item.returnReason,
      returnReceived:      item.returnReceived,
      returnValueReceived: null,
      addedAt:             now,
    })),
    ...orphanShipmentIds.map(sid => ({
      manifestId:     newManifestId,
      shipmentId:     sid,
      deliveryStatus: "pending" as const,
      addedAt:        now,
    })),
  ];

  await db.insert(clientAccountManifestItemsTable).values(newItems);

  // ─── تفصيلة البيان الجديد للفرونت إند (توست + دايالوج "تم إنشاء بيان جديد") ──
  // الفرونت (client-account-manifest-detail / client-account-sheet) بيقرا
  // result.rolledOverManifest بالحقول دي — لو رجعناه null أو بشكل مختلف
  // (زي newManifestId لوحده) الدايالوج مايظهرش والمستخدم يفتكر إن مفيش بيان
  // جديد اتعمل أصلاً. partialInShippingCount = 0 لأن الترحيل هنا مابيرحّلش
  // الجزئي (partial_delivered مش ضمن pendingItems) — بس بنرجّعه عشان الشكل
  // يتطابق مع نفس الكونتراكت بتاع بيانات الشحن/المندوب.
  const rolledOverManifest = {
    id:                      newManifestId,
    manifestNumber,
    orderCount:              newItems.length,
    postponedCount:          delayedOrPendingToRoll.filter(i => i.deliveryStatus === "delayed").length,
    pendingCount:            delayedOrPendingToRoll.filter(i => i.deliveryStatus === "pending").length + orphanShipmentIds.length,
    returnedInShippingCount: returnedStillAtShippingToRoll.length,
    partialInShippingCount:  0,
  };

  return { rolledOver: newItems.length, newManifestId, rolledOverManifest };
}

// ─── PATCH /client-account-manifests/:id  (قفل/فتح البيان) ──────────────────
router.patch("/client-account-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const body = req.body as { status?: "open" | "closed"; notes?: string; invoicePrice?: number | null; manualShippingCost?: number | null };
    const now = new Date();

    // نجيب البيان قبل التحديث عشان نعرف حالته الحالية (لمنع تكرار الترحيل لو
    // اتبعت طلب إغلاق تاني على بيان مقفول بالفعل) وclientId/tenantId بتاعينه.
    const [currentManifest] = await db
      .select({ status: clientAccountManifestsTable.status, clientId: clientAccountManifestsTable.clientId, tenantId: clientAccountManifestsTable.tenantId })
      .from(clientAccountManifestsTable)
      .where(eq(clientAccountManifestsTable.id, id))
      .limit(1);
    if (!currentManifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }

    const isClosingNow = body.status === "closed" && currentManifest.status !== "closed";

    await db.update(clientAccountManifestsTable)
      .set({
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.invoicePrice !== undefined ? { invoicePrice: body.invoicePrice == null ? null : String(body.invoicePrice) } : {}),
        ...(body.manualShippingCost !== undefined ? { manualShippingCost: body.manualShippingCost == null ? null : String(body.manualShippingCost) } : {}),
        ...(body.status === "closed" ? { closedAt: now } : {}),
        ...(body.status === "open"   ? { closedAt: null } : {}),
      })
      .where(eq(clientAccountManifestsTable.id, id));

    // ── ترحيل تلقائي لـ "تسوية الرحلات والتحصيل" عند إغلاق بيان العميل ────────
    // netDueFromClient بيتحسب فقط عند القراءة أصلاً (مش عمود مخزّن) — فبناخد
    // snapshot ليه هنا في لحظة الإغلاق بالظبط، بنفس منطق GET /:id/stats.
    if (isClosingNow) {
      try {
        const netDue = await computeClientManifestNetDue(id);
        if (netDue !== 0) {
          const [clientRow] = await db.select({ name: clientsTable.name })
            .from(clientsTable).where(eq(clientsTable.id, currentManifest.clientId)).limit(1);
          await autoAddClientToTripSettlement({
            tenantId: currentManifest.tenantId ?? null,
            sourceManifestId: id,
            netDue,
            clientId: currentManifest.clientId,
            clientName: clientRow?.name ?? "عميل",
          });
        }
      } catch (syncErr) {
        console.error("[PATCH /client-account-manifests/:id] trip-settlement sync error:", syncErr);
        // لا نوقف الـ response — البيان اتقفل بنجاح حتى لو الترحيل فشل
      }
    }

    let rollover: {
      rolledOver: number;
      newManifestId: number | null;
      rolledOverManifest:
        | { id: number; manifestNumber: string; orderCount: number; postponedCount: number; pendingCount: number; returnedInShippingCount: number; partialInShippingCount: number }
        | null;
    } = { rolledOver: 0, newManifestId: null, rolledOverManifest: null };
    if (isClosingNow) {
      try {
        rollover = await rolloverPendingItemsToNewManifest(id, currentManifest.clientId, currentManifest.tenantId ?? null);
      } catch (rolloverErr) {
        // ما نكسرش عملية الإغلاق نفسها لو الترحيل التلقائي فشل — بس نسجل الخطأ،
        // زي نفس فلسفة autoAddShipmentToClientAccountManifest.
        console.error("[rolloverPendingItemsToNewManifest]", rolloverErr);
      }
    }

    // rolledOverManifest: الفرونت بيقراه عشان يعرض دايالوج "تم إنشاء بيان جديد"
    // وينقل ليه — لازم يترجّع بنفس اسم الحقل. newManifestId/rolledOverCount
    // بنسيبهم كمان للتوافق مع أي مستهلك قديم.
    res.json({
      success: true,
      rolledOverCount: rollover.rolledOver,
      newManifestId: rollover.newManifestId,
      rolledOverManifest: rollover.rolledOverManifest,
    });
  } catch (e) {
    console.error("[PATCH /client-account-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في تحديث البيان" });
  }
});

// ─── POST /client-account-manifests/:id/add-shipments ────────────────────────
router.post("/client-account-manifests/:id/add-shipments", async (req, res): Promise<void> => {
  try {
    const manifestId = Number(req.params.id);
    const { shipmentIds } = req.body as { shipmentIds: number[] };

    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
      res.status(400).json({ error: "يجب إرسال قائمة شحنات" });
      return;
    }

    const [manifest] = await db.select().from(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, manifestId));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (manifest.status === "closed") { res.status(400).json({ error: "البيان مغلق" }); return; }

    const now = new Date();
    const existing = await db.select({ shipmentId: clientAccountManifestItemsTable.shipmentId })
      .from(clientAccountManifestItemsTable)
      .where(eq(clientAccountManifestItemsTable.manifestId, manifestId));
    const existingIds = new Set(existing.map(e => e.shipmentId));
    const newIds = shipmentIds.filter(id => !existingIds.has(id));

    if (newIds.length === 0) {
      res.json({ added: 0, manifestNumber: manifest.manifestNumber });
      return;
    }

    // نجيب الحالة الحالية الفعلية لكل شحنة من جدول shipments بدل ما نحطها
    // "pending" ثابتة — عشان بند البيان يتولد متسق مع حالة الشحنة وقت الإضافة
    // (بيصلح مشكلة إن شحنات مرتجعة/مسلمة اتضافت متأخر وفضلت شكلها "قيد الانتظار").
    // بنستبعد الشحنات المحذوفة (soft-deleted) فمش هتترجّع هنا وبالتالي مش هتتضاف.
    const shipmentRows = await db.select({ id: shipmentsTable.id, status: shipmentsTable.status })
      .from(shipmentsTable)
      .where(and(inArray(shipmentsTable.id, newIds), isNull(shipmentsTable.deletedAt)));
    const statusById = new Map(shipmentRows.map(r => [r.id, r.status]));
    // نضيف بس الشحنات الموجودة فعليًا وغير المحذوفة (اللي رجعت في statusById).
    const insertableIds = newIds.filter(id => statusById.has(id));

    if (insertableIds.length === 0) {
      res.json({ added: 0, manifestNumber: manifest.manifestNumber });
      return;
    }

    // خريطة SHIPMENT_STATUS_TO_DELIVERY بتستخدم "postponed"/"partial_delivered"
    // بينما بند بيان حساب العميل التجاري بيستخدم "postponed" فعلاً لكن
    // "partial_received" (مش partial_delivered) — نطابقها هنا فقط لهذا الجدول.
    const toClientAccountStatus = (shipmentStatus: string | undefined): string => {
      const mapped = shipmentStatus ? SHIPMENT_STATUS_TO_DELIVERY[shipmentStatus] : undefined;
      if (!mapped) return "pending";
      if (mapped === "partial_delivered") return "partial_received";
      if (mapped === "delayed") return "postponed";
      return mapped;
    };

    await db.insert(clientAccountManifestItemsTable).values(
      insertableIds.map(sid => ({
        manifestId,
        shipmentId:     sid,
        deliveryStatus: toClientAccountStatus(statusById.get(sid)),
        addedAt:        now,
      }))
    );

    res.json({ added: insertableIds.length, manifestNumber: manifest.manifestNumber });
  } catch (e) {
    console.error("[POST /client-account-manifests/:id/add-shipments]", e);
    res.status(500).json({ error: "خطأ في إضافة الشحنات" });
  }
});

// ─── DELETE /client-account-manifests/:id ────────────────────────────────────
router.delete("/client-account-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await db.delete(clientAccountManifestsTable).where(eq(clientAccountManifestsTable.id, id));
    res.json({ success: true });
  } catch (e) {
    console.error("[DELETE /client-account-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في حذف البيان" });
  }
});

// ─── GET /clients/:id/account-manifest-stats — لكارت العميل في الشبكة ────────
router.get("/clients/:id/account-manifest-stats", async (req, res): Promise<void> => {
  try {
    const clientId = Number(req.params.id);
    const tenantId = getTenantId(req);

    const manifests = await db.select({ id: clientAccountManifestsTable.id })
      .from(clientAccountManifestsTable)
      .where(and(
        eq(clientAccountManifestsTable.clientId, clientId),
        tenantId !== null
          ? or(eq(clientAccountManifestsTable.tenantId, tenantId), isNull(clientAccountManifestsTable.tenantId))
          : undefined,
      ));

    const manifestIds = manifests.map(m => m.id);
    let items: any[] = [];
    if (manifestIds.length) {
      items = await db.select().from(clientAccountManifestItemsTable)
        .where(inArray(clientAccountManifestItemsTable.manifestId, manifestIds));
    }
    // نستبعد بنود الشحنات المحذوفة (soft-deleted) من إحصائيات كارت العميل عشان
    // ما تتحسبش في الإجمالي/نسبة التسليم بعد ما الشحنة اتمسحت.
    if (items.length) {
      const itemShipmentIds = [...new Set(items.map(i => i.shipmentId))];
      const liveRows = await db.select({ id: shipmentsTable.id })
        .from(shipmentsTable)
        .where(and(inArray(shipmentsTable.id, itemShipmentIds), isNull(shipmentsTable.deletedAt)));
      const liveSet = new Set(liveRows.map(r => r.id));
      items = items.filter(i => liveSet.has(i.shipmentId));
    }

    const delivered = items.filter(i => i.deliveryStatus === "delivered").length;
    const returned  = items.filter(i => i.deliveryStatus === "returned").length;
    const partial   = items.filter(i => i.deliveryStatus === "partial_delivered").length;
    const pending   = items.filter(i => i.deliveryStatus === "pending" || i.deliveryStatus === "delayed").length;
    const total     = items.length;
    const deliveryRate = total > 0 ? Math.round(((delivered + partial) / total) * 100) : 0;

    res.json({ total, delivered, partial, returned, pending, deliveryRate, manifestCount: manifests.length });
  } catch (e) {
    console.error("[GET /clients/:id/account-manifest-stats]", e);
    res.status(500).json({ error: "خطأ في جلب الإحصائيات" });
  }
});

// ─── PATCH /client-account-manifests/:id/items/:shipmentId/urgent ───────────
router.patch("/client-account-manifests/:id/items/:shipmentId/urgent", async (req, res): Promise<void> => {
  try {
    const manifestId = Number(req.params.id);
    const shipmentId = Number(req.params.shipmentId);
    const { isUrgent, urgentNote } = z.object({
      isUrgent:   z.boolean(),
      urgentNote: z.string().max(255).optional().nullable(),
    }).parse(req.body);

    const [item] = await db
      .select({ id: clientAccountManifestItemsTable.id })
      .from(clientAccountManifestItemsTable)
      .where(and(
        eq(clientAccountManifestItemsTable.manifestId, manifestId),
        eq(clientAccountManifestItemsTable.shipmentId, shipmentId),
      ))
      .limit(1);

    if (!item) { res.status(404).json({ error: "الشحنة غير موجودة في هذا البيان" }); return; }

    await db
      .update(clientAccountManifestItemsTable)
      .set({
        isUrgent:   isUrgent ? 1 : 0,
        urgentNote: isUrgent ? (urgentNote ?? null) : null,
        urgentAt:   isUrgent ? new Date() : null,
      })
      .where(eq(clientAccountManifestItemsTable.id, item.id));

    res.json({ success: true, isUrgent });
  } catch (e: any) {
    console.error("[PATCH /client-account-manifests/:id/items/:shipmentId/urgent]", e);
    res.status(500).json({ error: "خطأ في تحديث حالة الاستعجال" });
  }
});

// ─── POST /client-account-manifests/sync-warehouse-ready ─────────────────────
// حل شامل: يمر على كل الشحنات بحالة "قيد الشحن في المخزن" اللي معندهاش بيان
// (مثلاً بسبب حذف بيان قديم، أو استيراد بيانات) ويضيفهم تلقائيًا بنفس منطق
// autoAddShipmentToClientAccountManifest. آمن للتشغيل المتكرر.
router.post("/client-account-manifests/sync-warehouse-ready", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.status, "warehouse_ready"), isNull(shipmentsTable.deletedAt), eq(shipmentsTable.tenantId, tenantId))
      : and(eq(shipmentsTable.status, "warehouse_ready"), isNull(shipmentsTable.deletedAt));

    const candidates = await db
      .select({ id: shipmentsTable.id, clientId: shipmentsTable.clientId, shipmentNumber: shipmentsTable.shipmentNumber })
      .from(shipmentsTable)
      .where(cond);

    let added = 0;
    const skipped: { id: number; shipmentNumber: string | null; reason: string }[] = [];
    for (const s of candidates) {
      if (!s.clientId) { skipped.push({ id: s.id, shipmentNumber: s.shipmentNumber, reason: "no_client_id" }); continue; }
      // ملحوظة: مبنتحققش هنا من وجود item قديم، لأن autoAddShipmentToClientAccountManifest
      // نفسها بتتأكد إن الـ item مرتبط بـ manifest موجود فعليًا (مش يتيم/بيان محذوف)
      // وبتنضف أي item يتيم قبل ما تضيف صح — فهي كافية ومش محتاجة تكرار الشرط هنا.
      const beforeCount = await db
        .select({ id: clientAccountManifestItemsTable.id })
        .from(clientAccountManifestItemsTable)
        .innerJoin(clientAccountManifestsTable, eq(clientAccountManifestItemsTable.manifestId, clientAccountManifestsTable.id))
        .where(eq(clientAccountManifestItemsTable.shipmentId, s.id))
        .limit(1);
      if (beforeCount.length) { skipped.push({ id: s.id, shipmentNumber: s.shipmentNumber, reason: "already_in_manifest" }); continue; }
      try {
        // status هنا دايمًا warehouse_ready بحكم شرط الـ cond فوق — بعتها صراحة
        // للتوثيق فقط، مش شرط فعلي مؤثر.
        await autoAddShipmentToClientAccountManifest(s.id, s.clientId, tenantId, "warehouse_ready");
        added++;
      } catch (err: any) {
        skipped.push({ id: s.id, shipmentNumber: s.shipmentNumber, reason: `error: ${err?.message ?? err}` });
      }
    }

    res.json({ success: true, scanned: candidates.length, added, skipped });
  } catch (e: any) {
    console.error("[POST /client-account-manifests/sync-warehouse-ready]", e);
    res.status(500).json({ error: "خطأ في مزامنة الشحنات مع بيانات العملاء" });
  }
});

// ─── POST /client-account-manifests/sync-orphan-shipments ────────────────────
// حل شامل للبيانات القديمة السابقة على تفعيل الإضافة التلقائية: يمر على *كل*
// الشحنات المرتبطة بعميل (بغض النظر عن الحالة) واللي معندهاش item في أي بيان
// حساب، ويضيفهم لبيان العميل المفتوح لو موجود فقط (من غير ما يفتح بيان جديد
// تلقائيًا، تجنبًا لفتح بيانات جديدة بالجملة على بيانات قديمة مقفولة). آمن
// للتشغيل المتكرر (idempotent) — أي شحنة مضافة بالفعل بتتجاهل.
router.post("/client-account-manifests/sync-orphan-shipments", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt as any))
      : isNull(shipmentsTable.deletedAt as any);

    const candidates = await db
      .select({ id: shipmentsTable.id, clientId: shipmentsTable.clientId, shipmentNumber: shipmentsTable.shipmentNumber, status: shipmentsTable.status })
      .from(shipmentsTable)
      .where(cond ?? and());

    let added = 0;
    let noOpenManifest = 0;
    const skipped: { id: number; shipmentNumber: string | null; reason: string }[] = [];
    for (const s of candidates) {
      if (!s.clientId) { skipped.push({ id: s.id, shipmentNumber: s.shipmentNumber, reason: "no_client_id" }); continue; }

      const alreadyInManifest = await db
        .select({ id: clientAccountManifestItemsTable.id })
        .from(clientAccountManifestItemsTable)
        .innerJoin(clientAccountManifestsTable, eq(clientAccountManifestItemsTable.manifestId, clientAccountManifestsTable.id))
        .where(eq(clientAccountManifestItemsTable.shipmentId, s.id))
        .limit(1);
      if (alreadyInManifest.length) { skipped.push({ id: s.id, shipmentNumber: s.shipmentNumber, reason: "already_in_manifest" }); continue; }

      const openManifest = await db
        .select({ id: clientAccountManifestsTable.id })
        .from(clientAccountManifestsTable)
        .where(and(eq(clientAccountManifestsTable.clientId, s.clientId), eq(clientAccountManifestsTable.status, "open")))
        .limit(1);
      if (!openManifest.length) { noOpenManifest++; skipped.push({ id: s.id, shipmentNumber: s.shipmentNumber, reason: "no_open_manifest_for_client" }); continue; }

      try {
        await autoAddShipmentToClientAccountManifest(s.id, s.clientId, tenantId, s.status);
        added++;
      } catch (err: any) {
        skipped.push({ id: s.id, shipmentNumber: s.shipmentNumber, reason: `error: ${err?.message ?? err}` });
      }
    }

    res.json({ success: true, scanned: candidates.length, added, noOpenManifest, skipped });
  } catch (e: any) {
    console.error("[POST /client-account-manifests/sync-orphan-shipments]", e);
    res.status(500).json({ error: "خطأ في مزامنة الشحنات القديمة اليتيمة مع بيانات العملاء" });
  }
});

// ─── POST /client-account-manifests/backfill-delivery-status ────────────────
// إصلاح لمرة واحدة: قبل إضافة المزامنة لـ PUT /shipments/:id، أي تحديث لحالة
// الشحنة (زي "مرتجع") من صفحة الشحنات مكانش بينعكس على deliveryStatus بتاع
// البند في بيان حساب العميل — فضل قديمًا "pending" حتى لو الشحنة اتسجلت
// مرتجع/مسلَّم فعليًا. الراوت ده بيمشي على كل بنود البيانات ويصحّح deliveryStatus
// ليطابق الحالة الحقيقية بتاعة shipmentsTable.status دلوقتي. آمن نعيد تشغيله
// أكتر من مرة (idempotent).
router.post("/client-account-manifests/backfill-delivery-status", async (req, res): Promise<void> => {
  try {
    const items = await db
      .select({
        id: clientAccountManifestItemsTable.id,
        shipmentId: clientAccountManifestItemsTable.shipmentId,
        deliveryStatus: clientAccountManifestItemsTable.deliveryStatus,
      })
      .from(clientAccountManifestItemsTable);

    const shipmentIds = [...new Set(items.map(i => i.shipmentId))];
    const shipments = shipmentIds.length
      ? await db.select({
          id: shipmentsTable.id,
          status: shipmentsTable.status,
          returnReason: shipmentsTable.returnReason,
          partialQuantity: shipmentsTable.partialQuantity,
        }).from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds))
      : [];
    const shipmentMap: Record<number, typeof shipments[number]> = {};
    shipments.forEach(s => { shipmentMap[s.id] = s; });

    let updated = 0;
    const changes: { itemId: number; shipmentId: number; from: string; to: string }[] = [];

    for (const item of items) {
      const sh = shipmentMap[item.shipmentId];
      if (!sh) continue;
      const mapped = SHIPMENT_STATUS_TO_DELIVERY[sh.status];
      if (!mapped) continue;
      if (mapped === item.deliveryStatus) continue;

      await db.update(clientAccountManifestItemsTable)
        .set({
          deliveryStatus: mapped,
          ...(mapped === "returned" ? { returnReason: sh.returnReason ?? undefined } : {}),
        })
        .where(eq(clientAccountManifestItemsTable.id, item.id));

      changes.push({ itemId: item.id, shipmentId: item.shipmentId, from: item.deliveryStatus, to: mapped });
      updated++;
    }

    res.json({ success: true, scanned: items.length, updated, changes });
  } catch (e: any) {
    console.error("[POST /client-account-manifests/backfill-delivery-status]", e);
    res.status(500).json({ error: "خطأ في إصلاح حالات التسليم القديمة" });
  }
});

// ─── إصلاح طارئ مؤقت: تراجع عن تغيير واحد من backfill-delivery-status ───────
// هيتشال بعد الاستخدام مباشرة.
router.post("/client-account-manifests/rollback-item-status", async (req, res): Promise<void> => {
  try {
    const { itemId, deliveryStatus } = req.body as { itemId: number; deliveryStatus: string };
    if (!itemId || !deliveryStatus) { res.status(400).json({ error: "itemId و deliveryStatus مطلوبين" }); return; }
    await db.update(clientAccountManifestItemsTable)
      .set({ deliveryStatus: deliveryStatus as any })
      .where(eq(clientAccountManifestItemsTable.id, itemId));
    res.json({ success: true, itemId, deliveryStatus });
  } catch (e: any) {
    console.error("[POST /client-account-manifests/rollback-item-status]", e);
    res.status(500).json({ error: "خطأ في التراجع" });
  }
});

export default router;
