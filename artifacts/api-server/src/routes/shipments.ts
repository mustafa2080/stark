import { Router, type IRouter } from "express";
import { eq, desc, and, like, or, inArray, sql, isNull, isNotNull, gte, getTableColumns } from "drizzle-orm";
import { alias } from "drizzle-orm/mysql-core";
import { db, shipmentsTable, shipmentItemsTable, shipmentZonesTable, zoneCostsTable, parcelTypePricingTable, clientsTable, shippingCompaniesTable, usersTable, warehousesTable, shipmentManifestsTable, shipmentManifestItemsTable, shipmentRatingsTable, clientAccountManifestItemsTable } from "@workspace/db";
import { z } from "zod";
import { getTenantId } from "../middlewares/requireTenant.js";
import { processToShipping, reverseShipping, processReturn, syncShipmentItemsInventory } from "../lib/inventory.js";
import { pushNotification } from "../lib/notifications.js";
import { autoAddShipmentToClientAccountManifest } from "./client-account-manifests.js";
import { syncShipmentStatusToManifests } from "../lib/manifestSync.js";
import { invalidateSmartCache, invalidateChartsCache } from "./analytics.js";

const router: IRouter = Router();

// alias لجدول المناطق عشان نطابق محافظة مدينة الراسل (senderCity) بشكل مستقل عن منطقة المستلم
const senderZoneTable = alias(shipmentZonesTable, "sender_zone");
const manifestShippingCompanyTable = alias(shippingCompaniesTable, "manifest_shipping_company");

// alias لجدول المخازن عشان نجيب مخزن العميل التجاري كـ fallback لو الشحنة مالهاش مخزن
const clientWarehouseTable = alias(warehousesTable, "client_warehouse");

// subquery خام: يرجّع أقصى (أحدث) id في shipment_manifest_items لكل shipmentId.
// بيتستخدم كشرط إضافي في الـ LEFT JOIN عشان الشحنة تتربط بأحدث سجل بيان بس،
// لأن الـ JOIN المباشر (بدون الشرط ده) كان بيرجع صف منفصل لكل مرة اتضافت
// فيها نفس الشحنة لأي بيان عبر الوقت، فتظهر مكررة في القائمة.
const latestManifestItemIdSql = sql`(
  SELECT MAX(smi2.id) FROM shipment_manifest_items smi2
  WHERE smi2.shipment_id = ${shipmentsTable.id}
)`;

// نفس الفكرة، لكن لأحدث بند في بيان حساب العميل التجاري (client_account_manifest_items) —
// ده جدول منفصل عن بيان شركة الشحن، وبيتحدّث "القيمة المستلمة" فيه لما المندوب/الأدمن
// يقفل تسليم الشحنة من صفحة بيان حساب العميل مباشرة (مش من بيان شركة الشحن).
const latestClientAccountManifestItemIdSql = sql`(
  SELECT MAX(cami2.id) FROM client_account_manifest_items cami2
  WHERE cami2.shipment_id = ${shipmentsTable.id}
)`;

// ملاحظة: shippingCompaniesTable في هذا النظام تحمل اسم المندوب نفسه
// (كل "شركة شحن" في الواقع هي مندوب مستقل). فاسم المندوب = manifestShippingCompanyTable.name
// أو shippingCompaniesTable.name مباشرة — مفيش داعي لجلبه من usersTable.

// ─── Public router (no auth) ──────────────────────────────────────────────────
export const publicShipmentsRouter: IRouter = Router();

publicShipmentsRouter.get("/shipments/track/:number", async (req, res): Promise<void> => {
  try {
    const { number } = req.params;
    const rows = await db
      .select({
        shipment:        shipmentsTable,
        warehouseName:   warehousesTable.name,
        warehouseCity:   warehousesTable.city,
        courierName:     sql<string>`COALESCE(${shippingCompaniesTable.name}, ${manifestShippingCompanyTable.name})`,
        courierPhone:    sql<string>`COALESCE(${shippingCompaniesTable.phone}, ${manifestShippingCompanyTable.phone})`,
        courierLogo:     sql<string>`COALESCE(${shippingCompaniesTable.logo}, ${manifestShippingCompanyTable.logo})`,
      })
      .from(shipmentsTable)
      .leftJoin(warehousesTable,        eq(shipmentsTable.warehouseId,        warehousesTable.id))
      .leftJoin(shippingCompaniesTable, eq(shipmentsTable.shippingCompanyId,  shippingCompaniesTable.id))
      .leftJoin(shipmentManifestItemsTable, eq(shipmentManifestItemsTable.shipmentId, shipmentsTable.id))
      .leftJoin(shipmentManifestsTable, eq(shipmentManifestsTable.id, shipmentManifestItemsTable.manifestId))
      .leftJoin(manifestShippingCompanyTable, eq(manifestShippingCompanyTable.id, shipmentManifestsTable.shippingCompanyId))
      .where(
        and(
          isNull(shipmentsTable.deletedAt),
          or(
            eq(shipmentsTable.trackingNumber, number),
            eq(shipmentsTable.shipmentNumber,  number),
          )
        )
      )
      .limit(1);

    if (!rows.length) {
      res.status(404).json({ error: "لم يتم العثور على الشحنة" });
      return;
    }
    const { shipment, warehouseName, warehouseCity, courierName, courierPhone, courierLogo } = rows[0];
    res.json({ ...shipment, warehouseName, warehouseCity, courierName, courierPhone, courierLogo });
  } catch (e) {
    console.error("[GET /shipments/track]", e);
    res.status(500).json({ error: "خطأ في البحث عن الشحنة" });
  }
});

// ─── Public: البحث بالاسم التجاري + رقم الفون ────────────────────────────────
publicShipmentsRouter.get("/shipments/track-by-client", async (req, res): Promise<void> => {
  try {
    const name  = (req.query.name  as string | undefined)?.trim();
    const phone = (req.query.phone as string | undefined)?.trim();

    if (!name || !phone) {
      res.status(400).json({ error: "يرجى إدخال اسم العميل ورقم الهاتف" });
      return;
    }

    // اسم الراسل (senderName) + رقم المستلم (receiverPhone) — مطابقة تامة
    const conditions = [
      isNull(shipmentsTable.deletedAt),
      eq(shipmentsTable.senderName, name),
      or(
        eq(shipmentsTable.receiverPhone,  phone),
        eq(shipmentsTable.receiverPhone2, phone),
      ) as any,
    ];

    const rows = await db
      .select({
        shipment:        shipmentsTable,
        warehouseName:   warehousesTable.name,
        warehouseCity:   warehousesTable.city,
        courierName:     sql<string>`COALESCE(${shippingCompaniesTable.name}, ${manifestShippingCompanyTable.name})`,
        courierPhone:    sql<string>`COALESCE(${shippingCompaniesTable.phone}, ${manifestShippingCompanyTable.phone})`,
        courierLogo:     sql<string>`COALESCE(${shippingCompaniesTable.logo}, ${manifestShippingCompanyTable.logo})`,
      })
      .from(shipmentsTable)
      .leftJoin(warehousesTable,        eq(shipmentsTable.warehouseId,        warehousesTable.id))
      .leftJoin(shippingCompaniesTable, eq(shipmentsTable.shippingCompanyId,  shippingCompaniesTable.id))
      .leftJoin(shipmentManifestItemsTable, eq(shipmentManifestItemsTable.shipmentId, shipmentsTable.id))
      .leftJoin(shipmentManifestsTable, eq(shipmentManifestsTable.id, shipmentManifestItemsTable.manifestId))
      .leftJoin(manifestShippingCompanyTable, eq(manifestShippingCompanyTable.id, shipmentManifestsTable.shippingCompanyId))
      .where(and(...conditions))
      .orderBy(desc(shipmentsTable.id))
      .limit(20);

    if (!rows.length) {
      res.status(404).json({ error: "لم يتم العثور على شحنات لهذا العميل" });
      return;
    }
    const result = rows.map(r => ({ ...r.shipment, warehouseName: r.warehouseName, warehouseCity: r.warehouseCity, courierName: r.courierName, courierPhone: r.courierPhone, courierLogo: r.courierLogo }));
    res.set("Cache-Control", "no-store");
    res.json(result);
  } catch (e) {
    console.error("[GET /shipments/track-by-client]", e);
    res.status(500).json({ error: "خطأ في البحث" });
  }
});

// ─── Zod schemas ──────────────────────────────────────────────────────────────
const CreateShipmentSchema = z.object({
  clientId:        z.number().int().positive().nullish(),
  senderName:      z.string().min(1),
  senderPhone:     z.string().nullish(),
  senderPhone2:    z.string().nullish(),
  senderEmail:     z.string().nullish(),
  senderAddress:   z.string().nullish(),
  senderCity:      z.string().nullish(),
  receiverName:    z.string().min(1),
  receiverPhone:   z.string().nullish(),
  receiverPhone2:  z.string().nullish(),
  receiverAddress: z.string().nullish(),
  receiverCity:    z.string().nullish(),
  zoneId:          z.number().int().positive().nullish(),
  zonePrice:       z.coerce.number().default(0),
  parcelType:      z.string().nullish(),
  parcelTypePrice: z.coerce.number().default(0),
  weight:          z.coerce.number().nullish(),
  pieces:          z.coerce.number().int().default(1),
  description:     z.string().nullish(),
  declaredValue:   z.coerce.number().default(0),
  canOpen:         z.union([z.boolean(), z.literal(0), z.literal(1)]).nullish(),
  isDivisible:     z.union([z.boolean(), z.literal(0), z.literal(1)]).nullish(),
  rejectionPolicy: z.enum(["full_fee", "free"]).nullish(),
  paymentMethod:   z.enum(["cod", "prepaid", "deferred"]).default("cod"),
  codAmount:       z.coerce.number().default(0),
  costPrice:       z.coerce.number().default(0),
  shippingFee:     z.coerce.number().default(0),
  insuranceFee:    z.coerce.number().default(0),
  totalAmount:     z.coerce.number().default(0),
  shippingCompanyId: z.number().int().positive().nullish(),
  notes:           z.string().nullish(),
  internalNotes:   z.string().nullish(),
  returnReason:    z.string().nullish(),
  returnReceived:  z.union([z.boolean(), z.literal(0), z.literal(1)]).nullish(),
  returnNote:      z.string().nullish(),
  partialQuantity: z.coerce.number().int().nullish(),
  productId:       z.number().int().positive().nullish(),
  variantId:       z.number().int().positive().nullish(),
  warehouseId:     z.number().int().positive().nullish(),
  status:          z.string().default("waiting"),
  items: z.array(z.object({
    productId:   z.number().int().positive().nullish(),
    variantId:   z.number().int().positive().nullish(),
    warehouseId: z.number().int().positive().nullish(),
    product:     z.string().nullish(),
    color:       z.string().nullish(),
    size:        z.string().nullish(),
    quantity:    z.coerce.number().int().min(1).default(1),
    unitPrice:   z.coerce.number().min(0).default(0),
    costPrice:   z.coerce.number().min(0).default(0),
  })).nullish(),
});

const UpdateShipmentSchema = CreateShipmentSchema.partial().extend({
  status: z.string().nullish(),
  trackingNumber: z.string().nullish(),
  collectedAmount: z.coerce.number().nullish(),
  assignedUserId: z.number().int().positive().nullish(),
  itemReceivedQuantities: z.record(z.string(), z.coerce.number().int().min(0)).nullish(),
  isReplacementRequested: z.union([z.boolean(), z.number()]).nullish(),
  canOpen: z.union([z.boolean(), z.literal(0), z.literal(1)]).nullish(),
  isDivisible: z.union([z.boolean(), z.literal(0), z.literal(1)]).nullish(),
  rejectionPolicy: z.enum(["full_fee", "free"]).nullish(),
});

// ─── توليد رقم شحنة تلقائي ────────────────────────────────────────────────────
export async function generateShipmentNumber(tenantId: number | null): Promise<string> {
  const now = new Date();
  const yy  = String(now.getFullYear()).slice(-2);
  const mm  = String(now.getMonth() + 1).padStart(2, "0");
  const prefix = `SHP${yy}${mm}`;
  const rows = await db
    .select({ n: shipmentsTable.shipmentNumber })
    .from(shipmentsTable)
    .where(
      tenantId !== null
        ? and(eq(shipmentsTable.tenantId, tenantId), like(shipmentsTable.shipmentNumber, `${prefix}%`))
        : like(shipmentsTable.shipmentNumber, `${prefix}%`)
    )
    .orderBy(desc(shipmentsTable.id))
    .limit(1);
  const last = rows[0]?.n;
  const seq  = last ? (parseInt(last.slice(-4)) + 1) : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

// ─── ربط الشحنة بالمخزون: خصم/إرجاع تلقائي حسب الحالة ────────────────────────
export type ShipmentRow = typeof shipmentsTable.$inferSelect;

export async function syncShipmentInventory(
  before: ShipmentRow,
  afterPatch: Record<string, any>,
): Promise<void> {
  // الشحنة الناتجة بعد التحديث (لمعرفة الحالة/الكمية النهائية)
  const after: ShipmentRow = { ...before, ...afterPatch };

  const hasInventoryLink = !!(after.productId || after.variantId);
  if (!hasInventoryLink) return; // الشحنة غير مرتبطة بمنتج → لا شيء يخص المخزون

  const totalPieces = Number(after.pieces ?? 1);
  const orderShape = {
    productId:   after.productId ?? null,
    variantId:   after.variantId ?? null,
    product:     after.description ?? null,
    color:       null,
    size:        null,
    warehouseId: after.warehouseId ?? null,
  };

  const newStatus = afterPatch.status as string | undefined;
  const wasDeducted = !!before.inventoryDeducted;

  // 1) اخصم المخزون أول مرة عند تحول الحالة لـ in_shipping (خرجت من المخزن مع المندوب)
  //    أو لو اتربط منتج بالشحنة لأول مرة بغض النظر عن الحالة
  const isMovingToShipping = newStatus === "in_shipping" && before.status !== "in_shipping";
  if (!wasDeducted && (isMovingToShipping || !newStatus)) {
    await processToShipping(orderShape, totalPieces, null, before.id);
    afterPatch.inventoryDeducted = 1;
  }

  // 2) تحول لحالة "مرتجع" → رجّع كل القطع للمخزن — فقط لما يتم تأكيد "تم الاستلام" فعليًا (returnReceived === 1)
  //    لأن المرتجع لسه عند شركة الشحن لحد ما يتأكد استلامه
  const wasReturned = !!before.inventoryReturned;

  if (newStatus === "returned") {
    const wasReturnReceived = before.returnReceived === 1;
    const isReturnReceivedNow = afterPatch.returnReceived === 1;
    if (isReturnReceivedNow && !wasReturnReceived && !wasReturned) {
      await reverseShipping(orderShape, totalPieces, null, before.id);
      afterPatch.inventoryReturned = 1;
    }
  }

  // 3) استلام جزئي → الباقي (الفرق بين القطع الكلية والمستلمة) يرجع للمخزن
  //    فقط لما يتم تأكيد "تم الاستلام" فعليًا (returnReceived === 1)، مش بمجرد تسجيل partial_received
  //    لأن الكمية الباقية لسه عند شركة الشحن لحد ما يتأكد استلامها
  if (newStatus === "partial_received") {
    const wasReturnReceived = before.returnReceived === 1;
    const isReturnReceivedNow = afterPatch.returnReceived === 1;
    if (isReturnReceivedNow && !wasReturnReceived) {
      const receivedQty = Number(afterPatch.partialQuantity ?? after.partialQuantity ?? 0);
      const remaining = totalPieces - receivedQty;
      if (remaining > 0 && !wasReturned) {
        await reverseShipping(orderShape, remaining, null, before.id);
        afterPatch.inventoryReturned = 1; // يمنع تكرار الإرجاع لو الحالة اتعدلت تاني لنفس partial
      }
    }
  }
}

// ─── GET /shipments/track/:number (public — no auth) ──────────────────────────
router.get("/shipments/track/:number", async (req, res): Promise<void> => {
  try {
    const { number } = req.params;
    const rows = await db
      .select()
      .from(shipmentsTable)
      .where(
        and(
          isNull(shipmentsTable.deletedAt),
          or(
            eq(shipmentsTable.trackingNumber, number),
            eq(shipmentsTable.shipmentNumber,  number),
          )
        )
      )
      .limit(1);

    if (!rows.length) {
      res.status(404).json({ error: "لم يتم العثور على الشحنة" });
      return;
    }
    res.json(rows[0]);
  } catch (e) {
    console.error("[GET /shipments/track]", e);
    res.status(500).json({ error: "خطأ في البحث عن الشحنة" });
  }
});

// ─── POST /shipments/track/:number/rating (public — no auth) ──────────────────
// يسمح للعميل بتقييم الشحنة من صفحة التتبع بعد التسليم
router.post("/shipments/track/:number/rating", async (req, res): Promise<void> => {
  try {
    const { number } = req.params;
    const { rating, comment } = req.body as { rating?: number; comment?: string };

    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({ error: "التقييم يجب أن يكون رقم من 1 إلى 5" });
      return;
    }

    const [shipment] = await db
      .select({ id: shipmentsTable.id, tenantId: shipmentsTable.tenantId, status: shipmentsTable.status })
      .from(shipmentsTable)
      .where(
        and(
          isNull(shipmentsTable.deletedAt),
          or(eq(shipmentsTable.trackingNumber, number), eq(shipmentsTable.shipmentNumber, number))
        )
      )
      .limit(1);

    if (!shipment) { res.status(404).json({ error: "لم يتم العثور على الشحنة" }); return; }

    // منع التقييم المتكرر لنفس الشحنة
    const [existing] = await db.select({ id: shipmentRatingsTable.id })
      .from(shipmentRatingsTable)
      .where(eq(shipmentRatingsTable.shipmentId, shipment.id))
      .limit(1);
    if (existing) { res.status(409).json({ error: "تم تقييم هذه الشحنة من قبل" }); return; }

    await db.insert(shipmentRatingsTable).values({
      tenantId: shipment.tenantId,
      shipmentId: shipment.id,
      rating: Math.round(rating),
      comment: comment?.trim() || null,
      source: "tracking_link",
      createdAt: new Date(),
    });

    res.json({ success: true });
  } catch (e) {
    console.error("[POST /shipments/track/rating]", e);
    res.status(500).json({ error: "خطأ في حفظ التقييم" });
  }
});

// ─── GET /shipments ───────────────────────────────────────────────────────────
router.get("/shipments", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { status, search, customerName, senderNames, limit = "50", offset = "0", shippingCompanyId, clientId } = req.query as Record<string, string>;

    const conditions: any[] = [];
    if (tenantId !== null) conditions.push(eq(shipmentsTable.tenantId, tenantId));
    conditions.push(isNull(shipmentsTable.deletedAt));
    // حالات مترادفة — الداتابيز قد تحتوي أسماء قديمة وجديدة للنفس الحالة
    // كل مجموعة = حالة واحدة منطقياً، الأول في المصفوفة هو الاسم الجديد المعتمد
    const STATUS_GROUPS: Record<string, string[]> = {
      pending:          ["pending", "waiting"],
      waiting:          ["waiting", "pending"],
      confirmed:        ["confirmed"],
      warehouse_ready:  ["warehouse_ready", "picked_up"],
      picked_up:        ["picked_up", "warehouse_ready"],
      in_transit:       ["in_transit", "in_shipping"],
      in_shipping:      ["in_shipping", "in_transit"],
      out_for_delivery: ["out_for_delivery"],
      delivered:        ["delivered", "received"],
      received:         ["received", "delivered"],
      partial_received: ["partial_received"],
      delayed:          ["delayed"],
      returned:         ["returned"],
      cancelled:        ["cancelled"],
    };
    if (status && status !== "all") {
      const group = STATUS_GROUPS[status];
      if (group && group.length > 1) {
        conditions.push(inArray(shipmentsTable.status, group));
      } else {
        conditions.push(eq(shipmentsTable.status, status));
      }
    }
    if (shippingCompanyId) {
      conditions.push(eq(shipmentsTable.shippingCompanyId, parseInt(shippingCompanyId)));
    }
    if (clientId) {
      conditions.push(eq(shipmentsTable.clientId, parseInt(clientId)));
    }
    if (customerName) {
      // مربع "ابحث باسم العميل" المنفصل — بيدور على اسم المستلم بس (العميل النهائي)
      // بحث بكل الشحنات في السيرفر مش بس الصفحة الحالية المحمّلة في الفرونت
      const nameWords = customerName.trim().split(/\s+/).filter(Boolean);
      if (nameWords.length) {
        conditions.push(and(...nameWords.map((w: string) => like(shipmentsTable.receiverName, `%${w}%`))));
      }
    }
    if (senderNames) {
      // فلتر عمود "الراسل" (Excel-style checkboxes) — قيم مطابقة بالظبط (مش بحث جزئي)
      // بيتفلتر من السيرفر عشان يشمل كل الشحنات المطابقة مش بس الصفحة المحمّلة حاليًا
      const names = senderNames.split("||").map(s => s.trim()).filter(Boolean);
      if (names.length) {
        conditions.push(inArray(shipmentsTable.senderName, names));
      }
    }
    if (search) {
      // مربع البحث بيدور برقم الهاتف (المستلم أو الراسل) وكمان بالاسم (المستلم أو الراسل)
      // تقسيم النص لكلمات عشان البحث يشتغل حتى لو المستخدم كتب الاسم كامل (اسم أول + عائلة)
      // مهم: كل الكلمات لازم تتطابق في نفس الحقل (كله receiverName أو كله senderName)
      // مش تتقاطع بين الاتنين — عشان منجيبش نتيجة غلط لشخصين مختلفين بالغلط
      const words = search.trim().split(/\s+/).filter(Boolean);
      const receiverNameMatch = and(...words.map((w: string) => like(shipmentsTable.receiverName, `%${w}%`)));
      const senderNameMatch   = and(...words.map((w: string) => like(shipmentsTable.senderName,   `%${w}%`)));
      // لو النص المكتوب أرقام بس (بحث برقم تليفون)، نبحث بـ "الرقم بينتهي بيهم بالظبط"
      // مش "بيحتويهم في أي مكان" — عشان آخر 4 أرقام مثلاً تجيب رقم التليفون الصحيح بدقة
      const isPhoneSearch = /^\d+$/.test(search.trim());
      const phonePattern = isPhoneSearch ? `%${search.trim()}` : `%${search}%`;
      conditions.push(
        or(
          like(shipmentsTable.receiverPhone, phonePattern),
          like(shipmentsTable.senderPhone,   phonePattern),
          receiverNameMatch,
          senderNameMatch,
        )
      );
    }

    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, countRows] = await Promise.all([
      db
        .select({
          // ── كل حقول الشحنة ──
          id:               shipmentsTable.id,
          tenantId:         shipmentsTable.tenantId,
          shipmentNumber:   shipmentsTable.shipmentNumber,
          trackingNumber:   shipmentsTable.trackingNumber,
          clientId:         shipmentsTable.clientId,
          senderName:       shipmentsTable.senderName,
          senderPhone:      shipmentsTable.senderPhone,
          senderPhone2:     shipmentsTable.senderPhone2,
          senderCity:       shipmentsTable.senderCity,
          receiverName:     shipmentsTable.receiverName,
          receiverPhone:    shipmentsTable.receiverPhone,
          receiverPhone2:   shipmentsTable.receiverPhone2,
          receiverAddress:  shipmentsTable.receiverAddress,
          receiverCity:     shipmentsTable.receiverCity,
          zoneId:           shipmentsTable.zoneId,
          zonePrice:        shipmentsTable.zonePrice,
          parcelType:       shipmentsTable.parcelType,
          parcelTypePrice:  shipmentsTable.parcelTypePrice,
          weight:           shipmentsTable.weight,
          pieces:           shipmentsTable.pieces,
          description:      shipmentsTable.description,
          declaredValue:    shipmentsTable.declaredValue,
          canOpen:          shipmentsTable.canOpen,
          isDivisible:      shipmentsTable.isDivisible,
          rejectionPolicy:  shipmentsTable.rejectionPolicy,
          isReplacementRequested: shipmentsTable.isReplacementRequested,
          paymentMethod:    shipmentsTable.paymentMethod,
          codAmount:        shipmentsTable.codAmount,
          costPrice:        shipmentsTable.costPrice,
          shippingFee:      shipmentsTable.shippingFee,
          insuranceFee:     shipmentsTable.insuranceFee,
          totalAmount:      shipmentsTable.totalAmount,
          collectedAmount:  shipmentsTable.collectedAmount,
          status:           shipmentsTable.status,
          shippingCompanyId: shipmentsTable.shippingCompanyId,
          assignedUserId:   shipmentsTable.assignedUserId,
          createdByUserId:  shipmentsTable.createdByUserId,
          createdByName:    shipmentsTable.createdByName,
          notes:            shipmentsTable.notes,
          internalNotes:    shipmentsTable.internalNotes,
          returnReason:     shipmentsTable.returnReason,
          returnReceived:   shipmentsTable.returnReceived,
          returnNote:       shipmentsTable.returnNote,
          partialQuantity:  shipmentsTable.partialQuantity,
          productId:        shipmentsTable.productId,
          variantId:        shipmentsTable.variantId,
          warehouseId:      shipmentsTable.warehouseId,
          // ── JOIN: اسم المخزن المرتبط بالشحنة ──
          warehouseName:        warehousesTable.name,
          // ── JOIN: اسم مخزن العميل التجاري (fallback) ──
          clientWarehouseName:  clientWarehouseTable.name,
          inventoryDeducted: shipmentsTable.inventoryDeducted,
          inventoryReturned: shipmentsTable.inventoryReturned,
          estimatedDelivery: shipmentsTable.estimatedDelivery,
          actualDelivery:   shipmentsTable.actualDelivery,
          createdAt:        shipmentsTable.createdAt,
          updatedAt:        shipmentsTable.updatedAt,
          // ── JOIN: اسم شركة الشحن (من الشحنة مباشرة أو من البيان المرتبط) ──
          shippingCompanyName: sql<string>`COALESCE(${shippingCompaniesTable.name}, ${manifestShippingCompanyTable.name})`,
          // ── JOIN: اسم المندوب (موظف داخلي معيّن للشحنة) ──
          assignedUserName: usersTable.displayName,
          // ── JOIN: المنطقة ──
          zoneLabel:       shipmentZonesTable.name,
          zoneGovernorate: shipmentZonesTable.toGovernorate,
          // ── JOIN: محافظة العميل (الراسل) ──
          senderGovernorate: clientsTable.region,
          // ── JOIN: محافظة مدينة الراسل (مطابقة من جدول المناطق) ──
          senderCityGovernorate: senderZoneTable.toGovernorate,
          // ── JOIN: سبب التأجيل (من آخر بيان شحن مرتبط بالشحنة) ──
          delayNote: shipmentManifestItemsTable.deliveryNote,
          // ── JOIN: القيمة الفعلية المستلمة لو تم تسليم الشحنة بقيمة أقل من الإجمالي (من آخر بيان شحن) ──
          deliveredValueReceived: shipmentManifestItemsTable.deliveredValueReceived,
          // ── JOIN: نفس القيمة لكن من آخر بيان حساب عميل تجاري (لو اتقفلت الشحنة من هناك بدل بيان شركة الشحن) ──
          clientAccountDeliveredValueReceived: clientAccountManifestItemsTable.deliveredValueReceived,
        })
        .from(shipmentsTable)
        .leftJoin(shippingCompaniesTable, eq(shipmentsTable.shippingCompanyId, shippingCompaniesTable.id))
        .leftJoin(shipmentManifestItemsTable, and(
          eq(shipmentManifestItemsTable.shipmentId, shipmentsTable.id),
          eq(shipmentManifestItemsTable.id, latestManifestItemIdSql),
        ))
        .leftJoin(shipmentManifestsTable, eq(shipmentManifestsTable.id, shipmentManifestItemsTable.manifestId))
        .leftJoin(manifestShippingCompanyTable, eq(manifestShippingCompanyTable.id, shipmentManifestsTable.shippingCompanyId))
        .leftJoin(clientAccountManifestItemsTable, and(
          eq(clientAccountManifestItemsTable.shipmentId, shipmentsTable.id),
          eq(clientAccountManifestItemsTable.id, latestClientAccountManifestItemIdSql),
        ))
        .leftJoin(usersTable, eq(shipmentsTable.assignedUserId, usersTable.id))
        .leftJoin(shipmentZonesTable, eq(shipmentsTable.zoneId, shipmentZonesTable.id))
        .leftJoin(clientsTable, eq(shipmentsTable.clientId, clientsTable.id))
        .leftJoin(senderZoneTable, eq(shipmentsTable.senderCity, senderZoneTable.name))
        .leftJoin(warehousesTable, eq(shipmentsTable.warehouseId, warehousesTable.id))
        .leftJoin(clientWarehouseTable, eq(clientsTable.warehouseId, clientWarehouseTable.id))
        .where(where)
        .orderBy(desc(shipmentsTable.createdAt))
        .limit(parseInt(limit))
        .offset(parseInt(offset)),
      db.select({ count: sql<number>`count(*)` }).from(shipmentsTable).where(where),
    ]);

    // normalize: لو receiverCity فاضية خد من zoneGovernorate
    const normalized = rows.map(r => {
      const city = (r as any).receiverCity || (r as any).receiver_city || r.zoneGovernorate || (r as any).zone_governorate || null;
      // محافظة الراسل: أولاً محافظة العميل التجاري المسجل، ثم محافظة المدينة (من جدول المناطق)، وإلا تبقى المدينة كما هي
      const senderGov = (r as any).senderGovernorate || (r as any).senderCityGovernorate || (r as any).sender_governorate || (r as any).sender_city_governorate || null;
      // اسم المخزن: أولاً مخزن الشحنة نفسها، ثم مخزن العميل التجاري كـ fallback
      const warehouseName = (r as any).warehouseName || (r as any).clientWarehouseName || null;
      return {
        ...r,
        receiverCity: city,
        zoneGovernorate: r.zoneGovernorate || (r as any).zone_governorate || null,
        senderGovernorate: senderGov,
        warehouseName,
      };
    });

    res.json({ data: normalized, total: Number(countRows[0]?.count ?? 0) });
  } catch (e) {
    console.error("[GET /shipments]", e);
    res.status(500).json({ error: "خطأ في استرجاع الشحنات" });
  }
});

// ─── GET /shipments/zones (alias for /shipment-zones) ───────────────────────
// كل زون بيرجع معاه costPrice = تكلفة الشحن الحقيقية من جدول "تكاليف المناطق"
// (zone_costs.delivery_cost عن طريق zone_costs.zone_id) — ده مصدر مختلف عن price
// اللي هو سعر البيع للعميل. costPrice هو اللي المفروض يُستخدم في عمود "شحن" بتفاصيل
// بيان المندوب لما costMode = "zone"، عشان يعكس التكلفة الحقيقية مش سعر البيع.
router.get("/shipments/zones", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    // لو المنطقة tenant_id فاضي (NULL) → دي منطقة عامة مشتركة تظهر لكل الـ tenants
    const cond = tenantId !== null
      ? or(eq(shipmentZonesTable.tenantId, tenantId), isNull(shipmentZonesTable.tenantId))
      : undefined;
    const rows = await db
      .select({
        ...getTableColumns(shipmentZonesTable),
        costPrice: zoneCostsTable.deliveryCost,
      })
      .from(shipmentZonesTable)
      .leftJoin(zoneCostsTable, eq(zoneCostsTable.zoneId, shipmentZonesTable.id))
      .where(cond)
      .orderBy(shipmentZonesTable.name);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: "خطأ في استرجاع المناطق" }); }
});

// ─── GET /shipments/parcel-pricing (alias for /parcel-type-pricing) ──────────
router.get("/shipments/parcel-pricing", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cond = tenantId !== null
      ? or(eq(parcelTypePricingTable.tenantId, tenantId), isNull(parcelTypePricingTable.tenantId))
      : undefined;
    const rows = await db.select().from(parcelTypePricingTable).where(cond).orderBy(parcelTypePricingTable.parcelType);
    const seen = new Set<string>();
    const result = rows.filter(r => {
      if (r.tenantId !== null && r.tenantId !== undefined) { seen.add(r.parcelType); return true; }
      return !seen.has(r.parcelType);
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: "خطأ في استرجاع أسعار الطرود" }); }
});

// ─── GET /shipments/daily-stats?days=7 ──────────────────────────────────────
router.get("/shipments/daily-stats", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const days = Math.min(parseInt((req.query.days as string) ?? "7"), 30);
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const conditions: any[] = [isNull(shipmentsTable.deletedAt), gte(shipmentsTable.createdAt, since)];
    if (tenantId !== null) conditions.push(eq(shipmentsTable.tenantId, tenantId));

    const rows = await db
      .select({
        day: sql<string>`DATE(${shipmentsTable.createdAt})`,
        count: sql<number>`count(*)`,
      })
      .from(shipmentsTable)
      .where(and(...conditions))
      .groupBy(sql`DATE(${shipmentsTable.createdAt})`)
      .orderBy(sql`DATE(${shipmentsTable.createdAt})`);

    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: "خطأ في إحصائيات الشحنات اليومية" });
  }
});

router.get("/shipments/stats", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cond = tenantId !== null
      ? and(eq(shipmentsTable.tenantId, tenantId), isNull(shipmentsTable.deletedAt))
      : isNull(shipmentsTable.deletedAt);

    const rows = await db
      .select({ status: shipmentsTable.status, count: sql<number>`count(*)` })
      .from(shipmentsTable).where(cond)
      .groupBy(shipmentsTable.status);

    const totals = await db
      .select({
        totalShippingFee: sql<number>`coalesce(sum(shipping_fee),0)`,
        totalCod:         sql<number>`coalesce(sum(cod_amount),0)`,
        totalCollected:   sql<number>`coalesce(sum(collected_amount),0)`,
      })
      .from(shipmentsTable).where(cond);

    res.json({ statuses: rows, ...totals[0] });
  } catch (e) {
    res.status(500).json({ error: "خطأ في إحصائيات الشحنات" });
  }
});

// ─── GET /shipments/archived (الشحنات المحذوفة — تظهر في نفس صفحة الأرشيف) ────
// ملحوظة: لازم يتعرّف قبل GET /shipments/:id، وإلا Express هيفسّر "archived" كـ :id
// (parseInt("archived") = NaN) والراوت الديناميكي هياخد الطلب بدل الراوت الصح.
router.get("/shipments/archived", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const conditions: any[] = [isNotNull(shipmentsTable.deletedAt)];
    if (tenantId !== null) conditions.push(eq(shipmentsTable.tenantId, tenantId));
    const rows = await db.select().from(shipmentsTable)
      .where(and(...conditions))
      .orderBy(desc(shipmentsTable.deletedAt));
    res.json(rows);
  } catch (e) {
    console.error("[GET /shipments/archived]", e);
    res.status(500).json({ error: "خطأ في جلب الشحنات المؤرشفة" });
  }
});

// ─── GET /shipments/:id ───────────────────────────────────────────────────────
router.get("/shipments/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const cond = tenantId !== null
      ? and(eq(shipmentsTable.id, id), eq(shipmentsTable.tenantId, tenantId))
      : eq(shipmentsTable.id, id);
    const rows = await db
      .select({
        ...getTableColumns(shipmentsTable),
        assignedUserName: usersTable.displayName,
        shippingCompanyName: sql<string>`COALESCE(${shippingCompaniesTable.name}, ${manifestShippingCompanyTable.name})`,
        // ── تكلفة شركة الشحن الفعلية: من الشحنة مباشرة، أو من المندوب المرتبط ببيان الشحن (fallback) ──
        // بيان الشحن هو المصدر الحقيقي غالبًا لأن shipping_company_id بيفضل فاضي على مستوى الشحنة نفسها
        // لحد ما تتقفل، والربط الفعلي بيحصل عن طريق shipment_manifest_items → shipment_manifests
        resolvedShippingCompanyId: sql<number | null>`COALESCE(${shipmentsTable.shippingCompanyId}, ${shipmentManifestsTable.shippingCompanyId})`,
        resolvedShippingCompanyCost: sql<number | null>`COALESCE(${shippingCompaniesTable.shippingCost}, ${manifestShippingCompanyTable.shippingCost})`,
        zoneLabel: shipmentZonesTable.name,
        zoneGovernorate: shipmentZonesTable.toGovernorate,
      })
      .from(shipmentsTable)
      .leftJoin(usersTable, eq(shipmentsTable.assignedUserId, usersTable.id))
      .leftJoin(shippingCompaniesTable, eq(shipmentsTable.shippingCompanyId, shippingCompaniesTable.id))
      .leftJoin(shipmentManifestItemsTable, eq(shipmentManifestItemsTable.shipmentId, shipmentsTable.id))
      .leftJoin(shipmentManifestsTable, eq(shipmentManifestsTable.id, shipmentManifestItemsTable.manifestId))
      .leftJoin(manifestShippingCompanyTable, eq(manifestShippingCompanyTable.id, shipmentManifestsTable.shippingCompanyId))
      .leftJoin(shipmentZonesTable, eq(shipmentsTable.zoneId, shipmentZonesTable.id))
      .where(cond).limit(1);
    if (!rows.length) { res.status(404).json({ error: "الشحنة غير موجودة" }); return; }
    const row = rows[0];
    // إذا receiverCity فاضية، خد من المحافظة الخاصة بالمنطقة
    if (!row.receiverCity && row.zoneGovernorate) {
      (row as any).receiverCity = row.zoneGovernorate;
    }
    // جيب manifestId من subquery مستقل عشان تجنب تعارض الأسماء
    // isUrgent/urgentNote أصبحوا على مستوى الشحنة نفسها (لا يتطلبون وجود بيان) —
    // مع fallback على بيان قديم (لو كان الاستعجال اتسجل قبل التحديث في shipment_manifest_items)
    const [manifestItem] = await db
      .select({
        manifestId: shipmentManifestItemsTable.manifestId,
        isUrgent:   shipmentManifestItemsTable.isUrgent,
        urgentNote: shipmentManifestItemsTable.urgentNote,
      })
      .from(shipmentManifestItemsTable)
      .where(eq(shipmentManifestItemsTable.shipmentId, id))
      .orderBy(desc(shipmentManifestItemsTable.id))
      .limit(1);
    (row as any).manifestId = manifestItem?.manifestId != null ? Number(manifestItem.manifestId) : null;
    (row as any).isUrgent   = row.isUrgent === 1 ? 1 : (manifestItem?.isUrgent != null ? Number(manifestItem.isUrgent) : 0);
    (row as any).urgentNote = row.urgentNote ?? manifestItem?.urgentNote ?? null;
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: "خطأ" });
  }
});

// ─── POST /shipments/:id/rating — إدخال تقييم يدوي (موظف) ────────────────────
router.post("/shipments/:id/rating", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const { rating, comment } = req.body as { rating?: number; comment?: string };

    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({ error: "التقييم يجب أن يكون رقم من 1 إلى 5" });
      return;
    }

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.id, id), eq(shipmentsTable.tenantId, tenantId))
      : eq(shipmentsTable.id, id);
    const [shipment] = await db.select({ id: shipmentsTable.id, tenantId: shipmentsTable.tenantId })
      .from(shipmentsTable).where(cond).limit(1);
    if (!shipment) { res.status(404).json({ error: "الشحنة غير موجودة" }); return; }

    const [existing] = await db.select({ id: shipmentRatingsTable.id })
      .from(shipmentRatingsTable)
      .where(eq(shipmentRatingsTable.shipmentId, shipment.id))
      .limit(1);
    if (existing) { res.status(409).json({ error: "تم تقييم هذه الشحنة من قبل" }); return; }

    await db.insert(shipmentRatingsTable).values({
      tenantId: shipment.tenantId,
      shipmentId: shipment.id,
      rating: Math.round(rating),
      comment: comment?.trim() || null,
      source: "manual",
      createdAt: new Date(),
    });

    res.json({ success: true });
  } catch (e) {
    console.error("[POST /shipments/:id/rating]", e);
    res.status(500).json({ error: "خطأ في حفظ التقييم" });
  }
});

// ─── POST /shipments ──────────────────────────────────────────────────────────
router.post("/shipments", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const user     = (req as any).user;
    const parsed   = CreateShipmentSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const d = parsed.data;
    const shipmentNumber = await generateShipmentNumber(tenantId);
    const now = new Date();

    // لو receiverCity فاضي وعنده zoneId، خد toGovernorate من الـ zone
    let resolvedReceiverCity = d.receiverCity ?? undefined;
    if (!resolvedReceiverCity && d.zoneId) {
      const zone = await db.select({ toGovernorate: shipmentZonesTable.toGovernorate })
        .from(shipmentZonesTable)
        .where(eq(shipmentZonesTable.id, d.zoneId))
        .limit(1);
      resolvedReceiverCity = zone[0]?.toGovernorate ?? undefined;
    }

    const result = await db.insert(shipmentsTable).values({
      ...(tenantId !== null ? { tenantId } : {}),
      shipmentNumber,
      clientId:        d.clientId    ?? undefined,
      senderName:      d.senderName,
      senderPhone:     d.senderPhone ?? undefined,
      senderPhone2:    d.senderPhone2 ?? undefined,
      senderCity:      d.senderCity  ?? undefined,
      receiverName:    d.receiverName,
      receiverPhone:   d.receiverPhone  ?? undefined,
      receiverPhone2:  d.receiverPhone2 ?? undefined,
      receiverAddress: d.receiverAddress ?? undefined,
      receiverCity:    resolvedReceiverCity,
      zoneId:          d.zoneId      ?? undefined,
      zonePrice:       String(d.zonePrice),
      parcelType:      d.parcelType  ?? undefined,
      parcelTypePrice: String(d.parcelTypePrice),
      weight:          d.weight      ? String(d.weight) : undefined,
      pieces:          d.pieces,
      description:     d.description ?? undefined,
      productId:       d.productId   ?? undefined,
      variantId:       d.variantId   ?? undefined,
      warehouseId:     d.warehouseId ?? undefined,
      declaredValue:   String(d.declaredValue),
      canOpen:         d.canOpen === undefined || d.canOpen === null ? null : Number(d.canOpen),
      isDivisible:     d.isDivisible === undefined || d.isDivisible === null ? null : Number(d.isDivisible),
      rejectionPolicy: d.rejectionPolicy ?? null,
      paymentMethod:   d.paymentMethod,
      codAmount:       String(d.codAmount),
      shippingFee:     String(d.shippingFee),
      insuranceFee:    String(d.insuranceFee),
      totalAmount:     String(d.totalAmount),
      collectedAmount: "0",
      status:          d.status ?? "waiting",
      notes:           d.notes ?? undefined,
      shippingCompanyId: d.shippingCompanyId ?? undefined,
      createdByUserId: user?.id,
      createdByName:   user?.displayName ?? user?.username,
      createdAt:       now,
      updatedAt:       now,
    });

    const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
    let newShipment = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, insertId)).limit(1);

    // لو فيه منتجات متعددة (items) → أضفهم لجدول shipment_items
    if (d.items && d.items.length > 0) {
      await db.insert(shipmentItemsTable).values(
        d.items.map((it) => ({
          shipmentId:  insertId,
          tenantId:    tenantId ?? null,
          productId:   it.productId ?? null,
          variantId:   it.variantId ?? null,
          warehouseId: it.warehouseId ?? d.warehouseId ?? null,
          product:     it.product ?? null,
          color:       it.color ?? null,
          size:        it.size ?? null,
          quantity:    it.quantity,
          unitPrice:   String(it.unitPrice),
          costPrice:   String(it.costPrice),
          totalPrice:  String(it.quantity * it.unitPrice),
          createdAt:   now,
          updatedAt:   now,
        }))
      );
    }

    // لو الشحنة اتعملت مرتبطة بمنتج من البداية (single product أو items) → اخصم من المخزون فوراً
    if (newShipment[0]) {
      const invPatch: any = {};
      await syncShipmentInventory(newShipment[0], invPatch);
      if (Object.keys(invPatch).length) {
        await db.update(shipmentsTable).set(invPatch).where(eq(shipmentsTable.id, insertId));
      }
      // خصم بنود المنتجات المتعددة (items)
      await syncShipmentItemsInventory(insertId, newShipment[0].status);
      newShipment = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, insertId)).limit(1);
    }

    res.status(201).json(newShipment[0]);

    // إضافة تلقائية لبيان حساب العميل المفتوح فور إنشاء الشحنة — بغض النظر عن
    // حالتها. الشحنة تدخل للبيان المفتوح (أو تفتح بيان جديد لو مفيش بيان مفتوح)
    // فور إنشائها مباشرة، من غير أي شرط على status (بطلب صريح من مصطفى بتاريخ
    // 2026-08-29 — إلغاء شرط الـ whitelist القديم اللي كان بيقصر الإضافة على
    // warehouse_ready فقط).
    if (newShipment[0] && newShipment[0].clientId) {
      autoAddShipmentToClientAccountManifest(
        insertId,
        newShipment[0].clientId,
        tenantId,
      ).catch((e) => console.error("[POST /shipments] auto-add manifest error", e));
    }

    // إشعار فوري بشحنة جديدة (بعد الرد — ما يأخرش الاستجابة)
    if (newShipment[0]) {
      pushNotification({
        tenantId: tenantId,
        excludeUserId: user?.id,
        type: "shipment_new",
        severity: "info",
        title: "شحنة جديدة",
        message: `${d.receiverName} — ${resolvedReceiverCity ?? "بدون محافظة"}`,
        entityType: "shipment",
        entityId: insertId,
        link: `/shipments/${insertId}`,
      });
    }
  } catch (e) {
    console.error("[POST /shipments]", e);
    res.status(500).json({ error: "خطأ في إنشاء الشحنة" });
  }
});

// ─── PUT /shipments/:id ───────────────────────────────────────────────────────
router.put("/shipments/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const parsed = UpdateShipmentSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [existingShipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!existingShipment) { res.status(404).json({ error: "الشحنة غير موجودة" }); return; }

    const d = parsed.data;
    const updateData: any = { updatedAt: new Date() };

    if (d.status           !== undefined) updateData.status           = d.status;
    if (d.trackingNumber   !== undefined) updateData.trackingNumber   = d.trackingNumber;
    if (d.collectedAmount  !== undefined) updateData.collectedAmount  = String(d.collectedAmount);
    if (d.clientId         !== undefined) updateData.clientId         = d.clientId;
    if (d.senderName       !== undefined) updateData.senderName       = d.senderName;
    if (d.senderPhone      !== undefined) updateData.senderPhone      = d.senderPhone;
    if (d.senderPhone2     !== undefined) updateData.senderPhone2     = d.senderPhone2;
    if (d.receiverName     !== undefined) updateData.receiverName     = d.receiverName;
    if (d.receiverPhone    !== undefined) updateData.receiverPhone    = d.receiverPhone;
    if (d.receiverPhone2   !== undefined) updateData.receiverPhone2   = d.receiverPhone2;
    if (d.receiverAddress  !== undefined) updateData.receiverAddress  = d.receiverAddress;
    if (d.receiverCity     !== undefined) updateData.receiverCity     = d.receiverCity;
    if (d.zoneId           !== undefined) {
      updateData.zoneId = d.zoneId;
      // لو مفيش receiverCity جديد، خد toGovernorate من الـ zone
      if (d.receiverCity === undefined && d.zoneId) {
        const zone = await db.select({ toGovernorate: shipmentZonesTable.toGovernorate })
          .from(shipmentZonesTable).where(eq(shipmentZonesTable.id, d.zoneId)).limit(1);
        if (zone[0]?.toGovernorate) updateData.receiverCity = zone[0].toGovernorate;
      }
    }
    if (d.zonePrice        !== undefined) updateData.zonePrice        = String(d.zonePrice);
    if (d.parcelType       !== undefined) updateData.parcelType       = d.parcelType;
    if (d.parcelTypePrice  !== undefined) updateData.parcelTypePrice  = String(d.parcelTypePrice);
    if (d.weight           !== undefined) updateData.weight           = d.weight ? String(d.weight) : null;
    if (d.pieces           !== undefined) updateData.pieces           = d.pieces;
    if (d.description      !== undefined) updateData.description      = d.description;
    if (d.productId        !== undefined) updateData.productId        = d.productId;
    if (d.variantId        !== undefined) updateData.variantId        = d.variantId;
    if (d.warehouseId      !== undefined) updateData.warehouseId      = d.warehouseId;
    if (d.paymentMethod    !== undefined) updateData.paymentMethod    = d.paymentMethod;
    if (d.codAmount        !== undefined) updateData.codAmount        = String(d.codAmount);
    if (d.costPrice        !== undefined) updateData.costPrice        = String(d.costPrice);
    if (d.shippingFee      !== undefined) updateData.shippingFee      = String(d.shippingFee);
    if (d.insuranceFee     !== undefined) updateData.insuranceFee     = String(d.insuranceFee);
    if (d.totalAmount      !== undefined) updateData.totalAmount      = String(d.totalAmount);
    if (d.notes            !== undefined) updateData.notes            = d.notes;
    if (d.internalNotes    !== undefined) updateData.internalNotes    = d.internalNotes;
    if (d.returnReason     !== undefined) updateData.returnReason     = d.returnReason;
    if (d.returnReceived   !== undefined) updateData.returnReceived   = d.returnReceived === true || d.returnReceived === 1 ? 1 : (d.returnReceived === false || d.returnReceived === 0 ? 0 : null);
    if (d.returnNote       !== undefined) updateData.returnNote       = d.returnNote;
    if (d.partialQuantity  !== undefined) updateData.partialQuantity  = d.partialQuantity;
    if (d.shippingCompanyId !== undefined) updateData.shippingCompanyId = d.shippingCompanyId;
    if (d.assignedUserId   !== undefined) updateData.assignedUserId   = d.assignedUserId;
    if (d.canOpen           !== undefined) updateData.canOpen          = d.canOpen === null ? null : Number(d.canOpen);
    if (d.isDivisible       !== undefined) updateData.isDivisible      = d.isDivisible === null ? null : Number(d.isDivisible);
    if (d.rejectionPolicy   !== undefined) updateData.rejectionPolicy  = d.rejectionPolicy;

    // ربط المخزون: خصم/إرجاع تلقائي حسب التغييرات (منتج جديد / مرتجع / استلام جزئي)
    await syncShipmentInventory(existingShipment, updateData);
    // ربط مخزون بنود الشحنة المتعددة (items) — لو الحالة اتغيرت لمرتجع/استلام جزئي
    await syncShipmentItemsInventory(
      id,
      updateData.status ?? existingShipment.status,
      d.itemReceivedQuantities ?? undefined,
      updateData.returnReceived === 1,
    );

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.id, id), eq(shipmentsTable.tenantId, tenantId))
      : eq(shipmentsTable.id, id);

    await db.update(shipmentsTable).set(updateData).where(cond);

    // مزامنة حالة الشحنة مع أي بيان (حساب عميل / شركة شحن) مرتبطة بيها — لازم
    // تتنفذ هنا في PUT بالظبط زي PATCH، وإلا أي تحديث حالة (زي "مرتجع") جاي من
    // صفحة الشحنات (اللي بتستخدم PUT) هيفضل مش منعكس على كارت البيان.
    if (updateData.status !== undefined) {
      // ⚠️ فيكس: شاشة "استلام جزئي" في مهامي المندوب (ShipmentStatusEditor) بتبعت
      // partialQuantity (قيمة مالية) مش collectedAmount للحالة دي تحديدًا — قبل
      // الفيكس ده كنا بنعتمد على d.collectedAmount بس هنا، فكانت partialQuantity
      // في جدولي البيان (حساب العميل / شركة الشحن) بتفضل زي ما هي (صفر) رغم إن
      // المندوب كتب القيمة فعلاً وحفظها صح في shipmentsTable.partialQuantity.
      // ⚠️ فيكس تاني: في حالة "استلام جزئي" الفرونت بيبعت partialQuantity (القيمة
      // الصح) + collectedAmount=0 مع بعض (متبقّية من تهيئة حقل مش ظاهر أصلاً في
      // الحالة دي) — فلو اعتمدنا على collectedAmount!==undefined، الصفر ده كان
      // بيكسب على partialQuantity الصح. في partial_received بنديله الأولوية دايمًا.
      const manifestFinancialValue = updateData.status === "partial_received" && d.partialQuantity !== undefined
        ? d.partialQuantity
        : d.collectedAmount !== undefined
          ? d.collectedAmount
          : d.partialQuantity;
      await syncShipmentStatusToManifests(id, updateData.status, {
        returnReason: updateData.returnReason,
        // ⚠️ ملاحظة "مهامي" (سبب التأجيل/الإرجاع اللي المندوب بيكتبه) — كانت
        // بتتحفظ في shipmentsTable.notes بس من غير ما تتزامن مع deliveryNote في
        // جدولي البيانات، فبيان المندوب كان بيعرض "لم يحدد السبب" دايمًا لحالة
        // "مؤجل" رغم كتابة الملاحظة فعليًا. بنمررها هنا بس لو الفرونت بعتها
        // فعلاً (d.notes !== undefined) عشان منمسحش ملاحظة قديمة بالغلط لو
        // التحديث ده مالوش علاقة بالملاحظة أصلاً.
        deliveryNote: d.notes !== undefined ? d.notes : undefined,
        deliveredValueReceived: manifestFinancialValue !== undefined ? manifestFinancialValue : undefined,
        partialQuantity: manifestFinancialValue !== undefined && manifestFinancialValue !== null
          ? Math.round(manifestFinancialValue)
          : manifestFinancialValue,
        returnValueReceived: manifestFinancialValue !== undefined ? manifestFinancialValue : undefined,
      });
      invalidateSmartCache(tenantId);
      invalidateChartsCache(tenantId);
    }

    // إضافة تلقائية لبيان حساب العميل عند دخول الشحنة "قيد الشحن في المخزن"
    // ملحوظة: بتتنفذ طالما الحالة النهائية warehouse_ready، سواء كانت متغيرة دلوقتي
    // أو كانت أصلاً كذلك (مثلاً لو اتمسح البيان بتاعها قبل كده) — الدالة idempotent
    // وبتتجاهل لو فيه بيان مضاف بالفعل، فمفيش خطر تكرار.
    if (updateData.status === "warehouse_ready") {
      await autoAddShipmentToClientAccountManifest(
        id,
        existingShipment.clientId,
        tenantId,
      );
    }

    const updated = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    res.json(updated[0]);
  } catch (e) {
    console.error("[PUT /shipments/:id]", e);
    res.status(500).json({ error: "خطأ في تحديث الشحنة" });
  }
});

// ─── PATCH /shipments/bulk-status — تغيير حالة شحنات متعددة (MUST be before /:id) ──
router.patch("/shipments/bulk-status", async (req, res): Promise<void> => {
  try {
    const { ids, status, shippingCompanyId } = req.body as { ids: any[]; status: string; shippingCompanyId?: number };
    if (!Array.isArray(ids) || ids.length === 0 || !status) {
      res.status(400).json({ error: "ids و status مطلوبة" });
      return;
    }
    const numericIds = ids.map(id => parseInt(String(id))).filter(id => !isNaN(id));
    if (numericIds.length === 0) {
      res.status(400).json({ error: "ids غير صالحة" });
      return;
    }
    const tenantId = getTenantId(req);
    const now = new Date();

    const updateData: any = { status: status as any, updatedAt: now };
    if (shippingCompanyId !== undefined && shippingCompanyId !== null) {
      updateData.shippingCompanyId = shippingCompanyId;
    }

    const cond = tenantId !== null
      ? and(inArray(shipmentsTable.id, numericIds), eq(shipmentsTable.tenantId, tenantId))
      : inArray(shipmentsTable.id, numericIds);

    // نجيب بيانات الشحنات قبل التحديث عشان نتأكد من إضافتهم تلقائيًا لبيان العميل
    // ملحوظة: بناخد كل الشحنات المستهدفة (مش بس اللي بتتغير حالتها فعليًا) لأن
    // الدالة idempotent وبتتجاهل لو فيه بيان مضاف بالفعل — ده بيمنع فوات الحالات
    // اللي كانت أصلاً warehouse_ready (زي لو اتمسح البيان بتاعها قبل كده).
    let toAutoAdd: { id: number; clientId: number | null }[] = [];
    if (status === "warehouse_ready") {
      const beforeRows = await db
        .select({ id: shipmentsTable.id, clientId: shipmentsTable.clientId, status: shipmentsTable.status })
        .from(shipmentsTable)
        .where(cond);
      toAutoAdd = beforeRows.map(r => ({ id: r.id, clientId: r.clientId }));
    }

    await db.update(shipmentsTable).set(updateData).where(cond);

    // مزامنة حالة كل الشحنات المُحدَّثة مع أي بيان مرتبطة بيها
    for (const shId of numericIds) {
      await syncShipmentStatusToManifests(shId, status);
    }
    invalidateSmartCache(tenantId);
    invalidateChartsCache(tenantId);

    if (toAutoAdd.length > 0) {
      for (const r of toAutoAdd) {
        await autoAddShipmentToClientAccountManifest(r.id, r.clientId, tenantId);
      }
    }

    res.json({ updated: numericIds.length });
  } catch (e: any) {
    console.error("bulk-status error:", e);
    res.status(500).json({ error: "خطأ في تحديث الحالة", detail: e?.message });
  }
});

// ─── PATCH /shipments/:id — alias for PUT (partial update) ───────────────────
router.patch("/shipments/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const parsed = UpdateShipmentSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const [existingShipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    if (!existingShipment) { res.status(404).json({ error: "الشحنة غير موجودة" }); return; }

    const d = parsed.data;
    const updateData: any = { updatedAt: new Date() };
    if (d.status            !== undefined) updateData.status            = d.status;
    if (d.trackingNumber    !== undefined) updateData.trackingNumber    = d.trackingNumber;
    if (d.collectedAmount   !== undefined) updateData.collectedAmount   = String(d.collectedAmount);
    if (d.clientId          !== undefined) updateData.clientId          = d.clientId;
    if (d.senderName        !== undefined) updateData.senderName        = d.senderName;
    if (d.senderPhone       !== undefined) updateData.senderPhone       = d.senderPhone;
    if (d.receiverName      !== undefined) updateData.receiverName      = d.receiverName;
    if (d.receiverPhone     !== undefined) updateData.receiverPhone     = d.receiverPhone;
    if (d.receiverAddress   !== undefined) updateData.receiverAddress   = d.receiverAddress;
    if (d.receiverCity      !== undefined) updateData.receiverCity      = d.receiverCity;
    if (d.zoneId            !== undefined) updateData.zoneId            = d.zoneId;
    if (d.zonePrice         !== undefined) updateData.zonePrice         = String(d.zonePrice);
    if (d.parcelType        !== undefined) updateData.parcelType        = d.parcelType;
    if (d.parcelTypePrice   !== undefined) updateData.parcelTypePrice   = String(d.parcelTypePrice);
    if (d.weight            !== undefined) updateData.weight            = d.weight ? String(d.weight) : null;
    if (d.pieces            !== undefined) updateData.pieces            = d.pieces;
    if (d.description       !== undefined) updateData.description       = d.description;
    if (d.productId         !== undefined) updateData.productId         = d.productId;
    if (d.variantId         !== undefined) updateData.variantId         = d.variantId;
    if (d.warehouseId       !== undefined) updateData.warehouseId       = d.warehouseId;
    if (d.paymentMethod     !== undefined) updateData.paymentMethod     = d.paymentMethod;
    if (d.codAmount         !== undefined) updateData.codAmount         = String(d.codAmount);
    if (d.costPrice         !== undefined) updateData.costPrice         = String(d.costPrice);
    if (d.shippingFee       !== undefined) updateData.shippingFee       = String(d.shippingFee);
    if (d.insuranceFee      !== undefined) updateData.insuranceFee      = String(d.insuranceFee);
    if (d.totalAmount       !== undefined) updateData.totalAmount       = String(d.totalAmount);
    if (d.notes             !== undefined) updateData.notes             = d.notes;
    if (d.internalNotes     !== undefined) updateData.internalNotes     = d.internalNotes;
    if (d.returnReason      !== undefined) updateData.returnReason      = d.returnReason;
    if (d.returnReceived    !== undefined) updateData.returnReceived    = d.returnReceived === true || d.returnReceived === 1 ? 1 : (d.returnReceived === false || d.returnReceived === 0 ? 0 : null);
    if (d.returnNote        !== undefined) updateData.returnNote        = d.returnNote;
    if (d.partialQuantity   !== undefined) updateData.partialQuantity   = d.partialQuantity;
    if (d.shippingCompanyId !== undefined) updateData.shippingCompanyId = d.shippingCompanyId;
    if (d.assignedUserId    !== undefined) updateData.assignedUserId    = d.assignedUserId;
    if (d.isReplacementRequested !== undefined) updateData.isReplacementRequested = d.isReplacementRequested ? 1 : 0;
    if (d.canOpen            !== undefined) updateData.canOpen           = d.canOpen === null ? null : Number(d.canOpen);
    if (d.isDivisible        !== undefined) updateData.isDivisible       = d.isDivisible === null ? null : Number(d.isDivisible);
    if (d.rejectionPolicy    !== undefined) updateData.rejectionPolicy   = d.rejectionPolicy;

    // لو الحالة الجديدة مش returned ولا partial_received ولم يُرسَل returnReceived صريحًا
    // → نصفّره عشان ميفضلش متعلق بقيمة قديمة من حالة سابقة
    const effectiveStatus = updateData.status ?? existingShipment.status;
    if (d.returnReceived === undefined && effectiveStatus !== "returned" && effectiveStatus !== "partial_received") {
      updateData.returnReceived = null;
    }

    // ربط المخزون: خصم/إرجاع تلقائي حسب التغييرات (منتج جديد / مرتجع / استلام جزئي)
    await syncShipmentInventory(existingShipment, updateData);
    // ربط مخزون بنود الشحنة المتعددة (items) — لو الحالة اتغيرت لمرتجع/استلام جزئي
    await syncShipmentItemsInventory(
      id,
      updateData.status ?? existingShipment.status,
      d.itemReceivedQuantities ?? undefined,
      updateData.returnReceived === 1,
    );

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.id, id), eq(shipmentsTable.tenantId, tenantId))
      : eq(shipmentsTable.id, id);
    await db.update(shipmentsTable).set(updateData).where(cond);

    // مزامنة حالة الشحنة مع أي بيان (حساب عميل / شركة شحن) مرتبطة بيها
    // بنمرر returnReason كمان عشان لو القفل تم من مسار المندوب (representative-dashboard)
    // اللي بيعدي من هنا، السبب ينزل صح في جدول الـ manifest items مش يفضل فاضي.
    if (updateData.status !== undefined) {
      // ملحوظة: من "مهامي" المندوب، collectedAmount هو المصدر الموحّد للقيمة
      // المالية في الحالات الثلاث (مسلَّم / استلام جزئي / مرتجع). بنمررها
      // للدالة تحت كل الأسماء المحتملة، والدالة بتختار الـ patch الصح حسب
      // الحالة النهائية (mapped) فمفيش تعارض ولا كتابة فوق حقل غلط.
      // partialQuantity في جدول البيان عمود int بيمثّل قيمة مالية (مش عدد قطع
      // زي partialQty بتاع "مهامي")، فبنقرّبها لأقرب رقم صحيح قبل التمرير.
      // ⚠️ فيكس: شاشة "استلام جزئي" في مهامي المندوب (ShipmentStatusEditor) بتبعت
      // partialQuantity (قيمة مالية) مش collectedAmount للحالة دي تحديدًا — قبل
      // الفيكس ده كنا بنعتمد على d.collectedAmount بس هنا، فكانت partialQuantity
      // في جدولي البيان (حساب العميل / شركة الشحن) بتفضل زي ما هي (صفر) رغم إن
      // المندوب كتب القيمة فعلاً وحفظها صح في shipmentsTable.partialQuantity.
      // ⚠️ فيكس تاني: في حالة "استلام جزئي" تحديدًا، الفرونت (ShipmentStatusEditor)
      // بيبعت partialQuantity (القيمة اللي المندوب كتبها فعليًا في الحقل الظاهر)
      // + collectedAmount = 0 في نفس الوقت (متبقّية من تهيئة الحقل بقيمة
      // shipment.collectedAmount القديمة اللي مش ظاهرة أصلاً كحقل في حالة
      // partial_received) — فلو اعتمدنا على collectedAmount!==undefined هنا،
      // الصفر ده كان بيكسب على partialQuantity الصح. عشان كده في الحالة دي
      // تحديدًا نديله الأولوية دايمًا.
      const manifestFinancialValue = updateData.status === "partial_received" && d.partialQuantity !== undefined
        ? d.partialQuantity
        : d.collectedAmount !== undefined
          ? d.collectedAmount
          : d.partialQuantity;
      await syncShipmentStatusToManifests(id, updateData.status, {
        returnReason: updateData.returnReason,
        // ⚠️ ملاحظة "مهامي" (سبب التأجيل/الإرجاع اللي المندوب بيكتبه) — كانت
        // بتتحفظ في shipmentsTable.notes بس من غير ما تتزامن مع deliveryNote في
        // جدولي البيانات، فبيان المندوب كان بيعرض "لم يحدد السبب" دايمًا لحالة
        // "مؤجل" رغم كتابة الملاحظة فعليًا. بنمررها هنا بس لو الفرونت بعتها
        // فعلاً (d.notes !== undefined) عشان منمسحش ملاحظة قديمة بالغلط لو
        // التحديث ده مالوش علاقة بالملاحظة أصلاً.
        deliveryNote: d.notes !== undefined ? d.notes : undefined,
        deliveredValueReceived: manifestFinancialValue !== undefined ? manifestFinancialValue : undefined,
        partialQuantity: manifestFinancialValue !== undefined && manifestFinancialValue !== null
          ? Math.round(manifestFinancialValue)
          : manifestFinancialValue,
        returnValueReceived: manifestFinancialValue !== undefined ? manifestFinancialValue : undefined,
      });
      invalidateSmartCache(tenantId);
      invalidateChartsCache(tenantId);
    }

    // إضافة تلقائية لبيان حساب العميل عند دخول الشحنة "قيد الشحن في المخزن"
    // ملحوظة: بتتنفذ طالما الحالة النهائية warehouse_ready، سواء كانت متغيرة دلوقتي
    // أو كانت أصلاً كذلك — الدالة idempotent ومتحميش من التكرار.
    if (updateData.status === "warehouse_ready") {
      await autoAddShipmentToClientAccountManifest(
        id,
        existingShipment.clientId,
        tenantId,
      );
    }

    const updated = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id)).limit(1);
    res.json(updated[0]);

    // إشعار فوري عند تغيير الحالة لحالة حرجة (بعد الرد — ما يأخرش الاستجابة)
    const newStatus = updateData.status;
    if (newStatus && newStatus !== existingShipment.status && updated[0]) {
      const s = updated[0];
      const statusNotifMap: Record<string, { title: string; severity: "warning" | "critical" | "success" }> = {
        delayed:          { title: "شحنة متأخرة", severity: "warning" },
        returned:         { title: "شحنة مرتجعة",  severity: "critical" },
        partial_received: { title: "استلام جزئي لشحنة مرتجعة", severity: "warning" },
        received:         { title: "تم تسليم الشحنة", severity: "success" },
      };
      const meta = statusNotifMap[newStatus];
      if (meta) {
        pushNotification({
          tenantId,
          type: newStatus === "returned" || newStatus === "partial_received" ? "shipment_returned"
              : newStatus === "received" ? "shipment_delivered" : "shipment_delayed",
          severity: meta.severity,
          title: meta.title,
          message: `${s.trackingNumber ?? `#${s.id}`} — ${s.receiverName} — ${s.receiverCity ?? "—"}`,
          entityType: "shipment",
          entityId: s.id,
          link: `/shipments/${s.id}`,
        });
      }
    }

    // إشعار موجّه للعميل نفسه — أول مرة يتحدد فيها المخزن (يعني الأدمن استلم شحنته)
    // بيتفعّل بس لو الشحنة أصلها من عميل (client-portal) وكانت من غير مخزن قبل كده
    if (
      d.warehouseId !== undefined &&
      d.warehouseId !== null &&
      existingShipment.warehouseId == null &&
      existingShipment.createdByUserId != null &&
      updated[0]
    ) {
      pushNotification({
        tenantId,
        targetUserId: existingShipment.createdByUserId,
        type: "shipment_received",
        severity: "success",
        title: "تم استلام شحنتك",
        message: `تم استلام شحنتك ${updated[0].trackingNumber ?? `#${updated[0].id}`} في المخزن`,
        entityType: "shipment",
        entityId: updated[0].id,
        link: `/client-shipment-detail/${updated[0].id}`,
      });
    }

    // إشعار موجّه للعميل نفسه — أول مرة يتحدد فيها العميل التجاري (الأدمن كمّل البيانات الناقصة)
    // بيتفعّل بس لو الشحنة أصلها من عميل (client-portal) وكانت من غير عميل تجاري قبل كده
    if (
      d.clientId !== undefined &&
      d.clientId !== null &&
      existingShipment.clientId == null &&
      existingShipment.createdByUserId != null &&
      updated[0]
    ) {
      pushNotification({
        tenantId,
        targetUserId: existingShipment.createdByUserId,
        type: "shipment_updated",
        severity: "success",
        title: "تم استكمال بيانات شحنتك",
        message: `تم ربط شحنتك ${updated[0].trackingNumber ?? `#${updated[0].id}`} ببيانات العميل التجاري`,
        entityType: "shipment",
        entityId: updated[0].id,
        link: `/client-shipment-detail/${updated[0].id}`,
      });
    }
  } catch (e) {
    console.error("[PATCH /shipments/:id]", e);
    res.status(500).json({ error: "خطأ في تحديث الشحنة" });
  }
});

// ─── PATCH /shipments/:id/urgent — استعجال الشحنة (لا يتطلب وجودها في بيان) ──
const UrgentSchema = z.object({
  isUrgent: z.boolean(),
  urgentNote: z.string().nullish(),
});
router.patch("/shipments/:id/urgent", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const parsed = UrgentSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    // المندوب لا يملك صلاحية استعجال نفسه (نفس منطق بيان الشحن)
    const reqUser = (req as any).user;
    if (reqUser?.role === "representative") {
      res.status(403).json({ error: "المندوب لا يملك صلاحية هذا الإجراء" });
      return;
    }

    const cond = tenantId !== null
      ? and(eq(shipmentsTable.id, id), eq(shipmentsTable.tenantId, tenantId))
      : eq(shipmentsTable.id, id);
    const [existingShipment] = await db.select().from(shipmentsTable).where(cond).limit(1);
    if (!existingShipment) { res.status(404).json({ error: "الشحنة غير موجودة" }); return; }

    await db.update(shipmentsTable)
      .set({
        isUrgent: parsed.data.isUrgent ? 1 : 0,
        urgentNote: parsed.data.urgentNote ?? null,
        updatedAt: new Date(),
      })
      .where(cond);

    // إشعار فوري للمندوب المسؤول عن الشحنة
    if (parsed.data.isUrgent && existingShipment.shippingCompanyId) {
      pushNotification({
        tenantId,
        type: "shipment_updated",
        severity: "warning",
        title: "استعجال شحنة",
        message: `${existingShipment.trackingNumber ?? `#${existingShipment.id}`} — ${existingShipment.receiverName} — ${existingShipment.receiverCity ?? "—"}`,
        entityType: "shipment",
        entityId: existingShipment.id,
        link: `/shipments/${existingShipment.id}`,
      });
    }

    res.json({ success: true, isUrgent: parsed.data.isUrgent, urgentNote: parsed.data.urgentNote ?? null });
  } catch (e) {
    console.error("[PATCH /shipments/:id/urgent]", e);
    res.status(500).json({ error: "خطأ في تحديث حالة الاستعجال" });
  }
});

// ─── DELETE /shipments/bulk — حذف شحنات متعددة (MUST be before /:id) ──────────
router.delete("/shipments/bulk", async (req, res): Promise<void> => {
  try {
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids مطلوبة" });
      return;
    }
    const now = new Date();

    const existing = await db
      .select()
      .from(shipmentsTable)
      .where(and(inArray(shipmentsTable.id, ids), isNull(shipmentsTable.deletedAt)));

    let deleted = 0;
    let skipped = 0;

    for (const sh of existing) {
      if (sh.status === "received") {
        skipped++;
        continue;
      }
      if (sh.inventoryDeducted && !sh.inventoryReturned) {
        try {
          await reverseShipping(
            { productId: null, variantId: null, product: "", color: null, size: null, warehouseId: null },
            0, null, sh.id
          );
        } catch (_) {}
      }
      await db.update(shipmentsTable)
        .set({ deletedAt: now } as any)
        .where(eq(shipmentsTable.id, sh.id));
      deleted++;
    }

    res.json({ deleted, skipped });
  } catch (e: any) {
    res.status(500).json({ error: "خطأ في الحذف الجماعي" });
  }
});

// ─── POST /shipments/:id/restore (استرجاع شحنة من الأرشيف) ────────────────────
router.post("/shipments/:id/restore", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
    const [existing] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id));
    if (!existing) { res.status(404).json({ error: "الشحنة غير موجودة" }); return; }
    if (!existing.deletedAt) { res.status(400).json({ error: "الشحنة غير مؤرشفة" }); return; }
    await db.update(shipmentsTable).set({ deletedAt: null, updatedAt: new Date() } as any).where(eq(shipmentsTable.id, id));
    const [restored] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, id));
    res.json(restored);
  } catch (e) {
    console.error("[POST /shipments/:id/restore]", e);
    res.status(500).json({ error: "خطأ في استرجاع الشحنة" });
  }
});

// ─── DELETE /shipments/archived/purge (حذف نهائي — أدمن فقط) ──────────────────
router.delete("/shipments/archived/purge", async (req, res): Promise<void> => {
  try {
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: "ids مطلوبة" });
      return;
    }
    const numericIds = ids.map(Number).filter(n => !isNaN(n));
    // حذف نهائي — بس للطلبات المؤرشفة (deletedAt IS NOT NULL)، نفس منطق /orders/archived/purge بالظبط
    await db.delete(shipmentsTable).where(
      and(inArray(shipmentsTable.id, numericIds), isNotNull(shipmentsTable.deletedAt))
    );
    res.json({ success: true, deleted: numericIds.length });
  } catch (e) {
    console.error("[DELETE /shipments/archived/purge]", e);
    res.status(500).json({ error: "خطأ في الحذف النهائي" });
  }
});

// ─── DELETE /shipments/:id (soft delete) ──────────────────────────────────────
router.delete("/shipments/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const cond = tenantId !== null
      ? and(eq(shipmentsTable.id, id), eq(shipmentsTable.tenantId, tenantId))
      : eq(shipmentsTable.id, id);
    await db.update(shipmentsTable).set({ deletedAt: new Date(), updatedAt: new Date() }).where(cond);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "خطأ في حذف الشحنة" });
  }
});

// ─── GET /shipment-zones ──────────────────────────────────────────────────────
router.get("/shipment-zones", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    // لو المنطقة tenant_id فاضي (NULL) → دي منطقة عامة مشتركة تظهر لكل الـ tenants
    const cond = tenantId !== null
      ? or(eq(shipmentZonesTable.tenantId, tenantId), isNull(shipmentZonesTable.tenantId))
      : undefined;
    const rows = await db.select().from(shipmentZonesTable).where(cond).orderBy(shipmentZonesTable.name);
    // لو نفس المنطقة (بالاسم + المحافظتين) موجودة نسخة خاصة بالـ tenant ونسخة عامة مع بعض،
    // بنفضّل نسخة الـ tenant ونشيل النسخة العامة المكررة عشان متتعرضش مرتين في القوائم
    const seen = new Map<string, typeof rows[number]>();
    for (const r of rows) {
      const key = `${r.name}|${r.fromGovernorate ?? ""}|${r.toGovernorate ?? ""}`;
      const existing = seen.get(key);
      if (!existing || (existing.tenantId == null && r.tenantId != null)) seen.set(key, r);
    }
    res.json([...seen.values()].sort((a, b) => a.name.localeCompare(b.name, "ar")));
  } catch (e) { res.status(500).json({ error: "خطأ" }); }
});

router.post("/shipment-zones", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { name, fromGovernorate, toGovernorate, price, priceNormal, priceCommercial, priceVip, isActive = true } = req.body;
    if (!name) { res.status(400).json({ error: "اسم المنطقة مطلوب" }); return; }
    const fromCond = fromGovernorate ? eq(shipmentZonesTable.fromGovernorate, fromGovernorate) : isNull(shipmentZonesTable.fromGovernorate);
    const toCond   = toGovernorate   ? eq(shipmentZonesTable.toGovernorate, toGovernorate)     : isNull(shipmentZonesTable.toGovernorate);
    const dupCond = tenantId !== null
      ? and(eq(shipmentZonesTable.name, name), fromCond, toCond,
             or(eq(shipmentZonesTable.tenantId, tenantId), isNull(shipmentZonesTable.tenantId)))
      : and(eq(shipmentZonesTable.name, name), fromCond, toCond);
    const [dup] = await db.select().from(shipmentZonesTable).where(dupCond).limit(1);
    if (dup) { res.status(400).json({ error: `منطقة "${name}" (${fromGovernorate ?? "—"} → ${toGovernorate ?? "—"}) مضافة بالفعل` }); return; }
    const normalPrice = priceNormal ?? price ?? 0;
    const result = await db.insert(shipmentZonesTable).values({
      ...(tenantId !== null ? { tenantId } : {}),
      name, fromGovernorate: fromGovernorate ?? null, toGovernorate: toGovernorate ?? null,
      price:           String(normalPrice),
      priceNormal:     String(normalPrice),
      priceCommercial: String(priceCommercial ?? 0),
      priceVip:        String(priceVip        ?? 0),
      isActive,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const id = (result as any)[0]?.insertId ?? (result as any).insertId;
    const rows = await db.select().from(shipmentZonesTable).where(eq(shipmentZonesTable.id, id)).limit(1);
    res.status(201).json(rows[0]);
  } catch (e) { console.error("[POST /shipment-zones]", e); res.status(500).json({ error: "خطأ في إضافة المنطقة" }); }
});

router.put("/shipment-zones/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { name, fromGovernorate, toGovernorate, price, priceNormal, priceCommercial, priceVip, isActive } = req.body;
    const upd: any = { updatedAt: new Date() };
    if (name            !== undefined) upd.name            = name;
    if (fromGovernorate !== undefined) upd.fromGovernorate = fromGovernorate;
    if (toGovernorate   !== undefined) upd.toGovernorate   = toGovernorate;
    if (priceNormal     !== undefined) { upd.priceNormal   = String(priceNormal);     upd.price = String(priceNormal); }
    else if (price      !== undefined) { upd.price         = String(price);           upd.priceNormal = String(price); }
    if (priceCommercial !== undefined) upd.priceCommercial = String(priceCommercial);
    if (priceVip        !== undefined) upd.priceVip        = String(priceVip);
    if (isActive        !== undefined) upd.isActive        = isActive;
    await db.update(shipmentZonesTable).set(upd).where(eq(shipmentZonesTable.id, id));
    const rows = await db.select().from(shipmentZonesTable).where(eq(shipmentZonesTable.id, id)).limit(1);
    res.json(rows[0]);
  } catch (e) { console.error("[PUT /shipment-zones/:id]", e); res.status(500).json({ error: "خطأ" }); }
});

router.delete("/shipment-zones/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(shipmentZonesTable).where(eq(shipmentZonesTable.id, id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "خطأ" }); }
});

// ═══════════════════════════════════════════════════════════════════════════
// ─── تكاليف المناطق (Zone Costs) — سعر توصيل واحد لكل منطقة، بدون تصنيف عميل ──
// ═══════════════════════════════════════════════════════════════════════════

// ─── GET /zone-costs ──────────────────────────────────────────────────────────
router.get("/zone-costs", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const cond = tenantId !== null ? eq(zoneCostsTable.tenantId, tenantId) : undefined;
    const rows = await db.select().from(zoneCostsTable).where(cond).orderBy(zoneCostsTable.name);
    // نجيب أحدث بيانات المنطقة (الاسم/المحافظات) من shipment_zones لو zoneId موجود ولسه مرتبط بمنطقة حية
    const zoneIds = [...new Set(rows.map(r => r.zoneId).filter((v): v is number => v != null))];
    const zonesById = new Map<number, { name: string; fromGovernorate: string | null; toGovernorate: string | null }>();
    if (zoneIds.length > 0) {
      const zoneRows = await db.select().from(shipmentZonesTable).where(inArray(shipmentZonesTable.id, zoneIds));
      for (const z of zoneRows) zonesById.set(z.id, { name: z.name, fromGovernorate: z.fromGovernorate ?? null, toGovernorate: z.toGovernorate ?? null });
    }
    const enriched = rows.map(r => {
      const live = r.zoneId != null ? zonesById.get(r.zoneId) : undefined;
      return live ? { ...r, name: live.name, fromGovernorate: live.fromGovernorate, toGovernorate: live.toGovernorate } : r;
    });
    res.json(enriched);
  } catch (e) { console.error("[GET /zone-costs]", e); res.status(500).json({ error: "خطأ في استرجاع تكاليف المناطق" }); }
});

// ─── POST /zone-costs ─────────────────────────────────────────────────────────
router.post("/zone-costs", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { zoneId, deliveryCost, isActive = true, notes } = req.body;
    if (!zoneId) { res.status(400).json({ error: "اختر منطقة من تاب المناطق" }); return; }
    const [zone] = await db.select().from(shipmentZonesTable).where(eq(shipmentZonesTable.id, Number(zoneId))).limit(1);
    if (!zone) { res.status(400).json({ error: "المنطقة المختارة غير موجودة" }); return; }
    const dupCond = tenantId !== null
      ? and(eq(zoneCostsTable.zoneId, zone.id), eq(zoneCostsTable.tenantId, tenantId))
      : eq(zoneCostsTable.zoneId, zone.id);
    const [existing] = await db.select().from(zoneCostsTable).where(dupCond).limit(1);
    if (existing) { res.status(400).json({ error: `منطقة "${zone.name}" مضافة بالفعل في تكاليف المناطق` }); return; }
    const result = await db.insert(zoneCostsTable).values({
      ...(tenantId !== null ? { tenantId } : {}),
      zoneId: zone.id,
      name: zone.name,
      fromGovernorate: zone.fromGovernorate ?? null,
      toGovernorate:   zone.toGovernorate ?? null,
      deliveryCost:    String(deliveryCost ?? 0),
      isActive,
      notes: notes ?? null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const id = (result as any)[0]?.insertId ?? (result as any).insertId;
    const rows = await db.select().from(zoneCostsTable).where(eq(zoneCostsTable.id, id)).limit(1);
    res.status(201).json(rows[0]);
  } catch (e) { console.error("[POST /zone-costs]", e); res.status(500).json({ error: "خطأ في إضافة منطقة التكلفة" }); }
});

// ─── PUT /zone-costs/:id ──────────────────────────────────────────────────────
router.put("/zone-costs/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { zoneId, deliveryCost, isActive, notes } = req.body;
    const upd: any = { updatedAt: new Date() };
    if (zoneId !== undefined) {
      const [zone] = await db.select().from(shipmentZonesTable).where(eq(shipmentZonesTable.id, Number(zoneId))).limit(1);
      if (!zone) { res.status(400).json({ error: "المنطقة المختارة غير موجودة" }); return; }
      upd.zoneId = zone.id;
      upd.name = zone.name;
      upd.fromGovernorate = zone.fromGovernorate ?? null;
      upd.toGovernorate   = zone.toGovernorate ?? null;
    }
    if (deliveryCost    !== undefined) upd.deliveryCost    = String(deliveryCost);
    if (isActive        !== undefined) upd.isActive        = isActive;
    if (notes           !== undefined) upd.notes           = notes;
    await db.update(zoneCostsTable).set(upd).where(eq(zoneCostsTable.id, id));
    const rows = await db.select().from(zoneCostsTable).where(eq(zoneCostsTable.id, id)).limit(1);
    res.json(rows[0]);
  } catch (e) { console.error("[PUT /zone-costs/:id]", e); res.status(500).json({ error: "خطأ" }); }
});

// ─── DELETE /zone-costs/:id ───────────────────────────────────────────────────
router.delete("/zone-costs/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(zoneCostsTable).where(eq(zoneCostsTable.id, id));
    res.json({ success: true });
  } catch (e) { console.error("[DELETE /zone-costs/:id]", e); res.status(500).json({ error: "خطأ" }); }
});

// ─── GET /parcel-type-pricing ─────────────────────────────────────────────────
router.get("/parcel-type-pricing", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    // يرجع أسعار الـ tenant الحالي أو الأسعار الـ global (tenantId = null) — أيهما موجود
    const cond = tenantId !== null
      ? or(eq(parcelTypePricingTable.tenantId, tenantId), isNull(parcelTypePricingTable.tenantId))
      : undefined;
    const rows = await db.select().from(parcelTypePricingTable).where(cond).orderBy(parcelTypePricingTable.parcelType);
    // لو في أسعار خاصة بالـ tenant، تطغى على الـ global
    const seen = new Set<string>();
    const result = rows.filter(r => {
      if (r.tenantId !== null && r.tenantId !== undefined) { seen.add(r.parcelType); return true; }
      return !seen.has(r.parcelType);
    });
    res.json(result);
  } catch (e) { res.status(500).json({ error: "خطأ" }); }
});

router.put("/parcel-type-pricing/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const { basePrice, repExtraCost, isActive, imageUrl } = req.body;
    const upd: any = { updatedAt: new Date() };
    if (basePrice    !== undefined) upd.basePrice    = String(basePrice);
    if (repExtraCost !== undefined) upd.repExtraCost = String(repExtraCost);
    if (isActive     !== undefined) upd.isActive     = isActive;
    if (imageUrl     !== undefined) upd.imageUrl     = imageUrl;
    await db.update(parcelTypePricingTable).set(upd).where(eq(parcelTypePricingTable.id, id));
    const rows = await db.select().from(parcelTypePricingTable).where(eq(parcelTypePricingTable.id, id)).limit(1);
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: "خطأ" }); }
});

router.post("/parcel-type-pricing", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { parcelType, label, basePrice, repExtraCost = 0, isActive = true, imageUrl } = req.body;
    if (!parcelType || basePrice === undefined) { res.status(400).json({ error: "parcelType والسعر مطلوبان" }); return; }
    const now = new Date();
    const result = await db.insert(parcelTypePricingTable).values({
      ...(tenantId !== null ? { tenantId } : {}),
      parcelType, label: label ?? parcelType,
      basePrice: String(basePrice), repExtraCost: String(repExtraCost), isActive,
      imageUrl: imageUrl ?? null,
      createdAt: now, updatedAt: now,
    });
    const id = (result as any)[0]?.insertId ?? (result as any).insertId;
    const rows = await db.select().from(parcelTypePricingTable).where(eq(parcelTypePricingTable.id, id)).limit(1);
    res.status(201).json(rows[0]);
  } catch (e) { res.status(500).json({ error: "خطأ في إضافة النوع" }); }
});

router.delete("/parcel-type-pricing/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(parcelTypePricingTable).where(eq(parcelTypePricingTable.id, id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "خطأ في الحذف" }); }
});

router.post("/parcel-type-pricing/init", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const DEFAULTS = [
      { parcelType: "document",    label: "مستندات",     basePrice: "0",  repExtraCost: "0" },
      { parcelType: "normal",      label: "طرد عادي",    basePrice: "0",  repExtraCost: "0" },
      { parcelType: "fragile",     label: "قابل للكسر",  basePrice: "5",  repExtraCost: "0" },
      { parcelType: "heavy",       label: "ثقيل",        basePrice: "10", repExtraCost: "0" },
      { parcelType: "electronics", label: "إلكترونيات",  basePrice: "10", repExtraCost: "0" },
      { parcelType: "clothing",    label: "ملابس",       basePrice: "0",  repExtraCost: "0" },
      { parcelType: "food",        label: "طعام",        basePrice: "5",  repExtraCost: "0" },
      { parcelType: "other",       label: "أخري",        basePrice: "0",  repExtraCost: "0" },
    ];
    const now = new Date();
    for (const d of DEFAULTS) {
      const existing = tenantId !== null
        ? await db.select({ id: parcelTypePricingTable.id }).from(parcelTypePricingTable)
            .where(and(eq(parcelTypePricingTable.tenantId, tenantId), eq(parcelTypePricingTable.parcelType, d.parcelType))).limit(1)
        : await db.select({ id: parcelTypePricingTable.id }).from(parcelTypePricingTable)
            .where(eq(parcelTypePricingTable.parcelType, d.parcelType)).limit(1);
      if (!existing.length) {
        await db.insert(parcelTypePricingTable).values({
          ...(tenantId !== null ? { tenantId } : {}),
          parcelType: d.parcelType, label: d.label, basePrice: d.basePrice, repExtraCost: d.repExtraCost,
          isActive: true, createdAt: now, updatedAt: now,
        });
      }
    }
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "خطأ في التهيئة" }); }
});

// ─── Shipment Items CRUD ─────────────────────────────────────────────────────

const ShipmentItemSchema = z.object({
  productId:   z.number().int().positive().nullish(),
  variantId:   z.number().int().positive().nullish(),
  warehouseId: z.number().int().positive().nullish(),
  product:     z.string().nullish(),
  color:       z.string().nullish(),
  size:        z.string().nullish(),
  quantity:    z.coerce.number().int().min(1).default(1),
  unitPrice:   z.coerce.number().min(0).default(0),
  costPrice:   z.coerce.number().min(0).default(0),
  notes:       z.string().nullish(),
});

// ─── PATCH /shipments/:id/urgent — تفعيل/إلغاء الاستعجال مباشرةً من تفاصيل الشحنة ──
router.patch("/shipments/:id/urgent", async (req, res): Promise<void> => {
  try {
    const shipmentId = Number(req.params.id);
    const tenantId   = getTenantId(req);
    const { isUrgent, urgentNote } = z.object({
      isUrgent:   z.boolean(),
      urgentNote: z.string().max(255).optional().nullable(),
    }).parse(req.body);

    // المندوب لا يملك صلاحية هذا الإجراء
    const reqUser = (req as any).user;
    if (reqUser?.role === "representative") {
      res.status(403).json({ error: "المندوب لا يملك صلاحية هذا الإجراء" });
      return;
    }

    // ابحث عن آخر بيان (مفتوح أو أي بيان) يحتوي هذه الشحنة
    const conditions: any[] = [eq(shipmentManifestItemsTable.shipmentId, shipmentId)];
    if (tenantId !== null) conditions.push(eq(shipmentManifestsTable.tenantId, tenantId));

    const [item] = await db
      .select({
        id:            shipmentManifestItemsTable.id,
        manifestId:    shipmentManifestItemsTable.manifestId,
        customerName:  shipmentsTable.receiverName,
        phone:         shipmentsTable.receiverPhone,
        city:          shipmentsTable.receiverCity,
        invoiceNumber: shipmentsTable.shipmentNumber,
        totalPrice:    shipmentsTable.totalAmount,
      })
      .from(shipmentManifestItemsTable)
      .innerJoin(shipmentManifestsTable, eq(shipmentManifestsTable.id, shipmentManifestItemsTable.manifestId))
      .innerJoin(shipmentsTable, eq(shipmentsTable.id, shipmentManifestItemsTable.shipmentId))
      .where(and(...conditions))
      .orderBy(desc(shipmentManifestItemsTable.id))
      .limit(1);

    if (!item) {
      res.status(404).json({ error: "هذه الشحنة غير مرتبطة بأي بيان شحن" });
      return;
    }

    await db
      .update(shipmentManifestItemsTable)
      .set({
        isUrgent:   isUrgent ? 1 : 0,
        urgentNote: isUrgent ? (urgentNote ?? null) : null,
        urgentAt:   isUrgent ? new Date() : null,
      })
      .where(eq(shipmentManifestItemsTable.id, item.id));

    // ─── SSE: أبلّغ المندوب فوراً ───────────────────────────────────────────
    if (isUrgent) {
      const [manifest] = await db
        .select({ shippingCompanyId: shipmentManifestsTable.shippingCompanyId, manifestNumber: shipmentManifestsTable.manifestNumber })
        .from(shipmentManifestsTable)
        .where(eq(shipmentManifestsTable.id, item.manifestId))
        .limit(1);
      if (manifest?.shippingCompanyId) {
        const { broadcastUrgentToCompany } = await import("./representative.js");
        broadcastUrgentToCompany(manifest.shippingCompanyId, {
          type: "urgent",
          manifestId:     item.manifestId,
          manifestNumber: manifest.manifestNumber,
          shipmentId,
          urgentNote:     urgentNote ?? null,
          urgentAt:       new Date().toISOString(),
          customerName:   item.customerName,
          phone:          item.phone,
          city:           item.city,
          invoiceNumber:  item.invoiceNumber,
          totalPrice:     item.totalPrice,
        });
      }
    }

    res.json({ success: true, isUrgent });
  } catch (e: any) {
    console.error("[PATCH /shipments/:id/urgent]", e);
    res.status(500).json({ error: "خطأ في تحديث حالة الاستعجال" });
  }
});

// GET /shipments/:id/items
router.get("/shipments/:id/items", async (req, res): Promise<void> => {
  try {
    const shipmentId = Number(req.params.id);
    const tenantId   = getTenantId(req);
    const conditions = [eq(shipmentItemsTable.shipmentId, shipmentId)];
    if (tenantId !== null) conditions.push(eq(shipmentItemsTable.tenantId, tenantId) as any);
    const items = await db
      .select()
      .from(shipmentItemsTable)
      .where(and(...conditions))
      .orderBy(shipmentItemsTable.createdAt);
    res.json(items);
  } catch (e) { console.error("[GET /shipments/:id/items]", e); res.status(500).json({ error: "خطأ في استرجاع بنود الشحنة", detail: String(e) }); }
});

// POST /shipments/:id/items
router.post("/shipments/:id/items", async (req, res): Promise<void> => {
  try {
    const shipmentId = Number(req.params.id);
    const tenantId   = getTenantId(req);
    const body = ShipmentItemSchema.parse(req.body);
    const now = new Date();
    const totalPrice = body.quantity * body.unitPrice;
    const [result] = await db.insert(shipmentItemsTable).values({
      shipmentId,
      tenantId,
      productId:   body.productId ?? null,
      variantId:   body.variantId ?? null,
      warehouseId: body.warehouseId ?? null,
      product:     body.product ?? null,
      color:       body.color ?? null,
      size:        body.size ?? null,
      quantity:    body.quantity,
      unitPrice:   String(body.unitPrice),
      costPrice:   String(body.costPrice),
      totalPrice:  String(totalPrice),
      notes:       body.notes ?? null,
      createdAt:   now,
      updatedAt:   now,
    });
    const newItem = await db.select().from(shipmentItemsTable).where(eq(shipmentItemsTable.id, (result as any).insertId)).limit(1);

    // اخصم من المخزون فوراً (نفس منطق الشحنة وقت الإنشاء)
    await syncShipmentItemsInventory(shipmentId);
    const refreshed = await db.select().from(shipmentItemsTable).where(eq(shipmentItemsTable.id, (result as any).insertId)).limit(1);

    res.status(201).json(refreshed[0] ?? newItem[0]);
  } catch (e: any) {
    console.error("[POST /shipments/:id/items]", e);
    if (e?.name === "ZodError") { res.status(400).json({ error: e.errors }); return; }
    res.status(500).json({ error: "خطأ في إضافة البند", detail: e?.message });
  }
});

// PATCH /shipments/:id/items/:itemId
router.patch("/shipments/:id/items/:itemId", async (req, res): Promise<void> => {
  try {
    const shipmentId = Number(req.params.id);
    const itemId   = Number(req.params.itemId);
    const tenantId = getTenantId(req);
    const body = ShipmentItemSchema.partial().parse(req.body);
    const now  = new Date().toISOString().slice(0, 19).replace("T", " ");

    const [existingItem] = await db.select().from(shipmentItemsTable).where(eq(shipmentItemsTable.id, itemId)).limit(1);

    const updateData: any = { ...body, updatedAt: now };
    if (body.quantity !== undefined && body.unitPrice !== undefined) {
      updateData.totalPrice = String(body.quantity * body.unitPrice);
    }

    // لو البند خصم من المخزون قبل كده وفيه تعديل على المنتج/الكمية/المخزن
    // → رجّع الكمية القديمة أولاً، بعدين خصم الجديدة (تتعمل تلقائي تحت)
    const touchesInventoryFields = body.productId !== undefined || body.variantId !== undefined
      || body.warehouseId !== undefined || body.quantity !== undefined;
    if (existingItem?.inventoryDeducted && touchesInventoryFields && !existingItem.inventoryReturned) {
      await reverseShipping(
        {
          productId: existingItem.productId,
          variantId: existingItem.variantId,
          product: existingItem.product,
          color: existingItem.color,
          size: existingItem.size,
          warehouseId: existingItem.warehouseId,
        },
        existingItem.quantity,
        null,
        shipmentId,
      );
      updateData.inventoryDeducted = 0;
    }

    await db.update(shipmentItemsTable).set(updateData).where(eq(shipmentItemsTable.id, itemId));

    // اخصم تاني حسب البيانات الجديدة لو لسه مخصومة
    await syncShipmentItemsInventory(shipmentId);

    const updated = await db.select().from(shipmentItemsTable).where(eq(shipmentItemsTable.id, itemId)).limit(1);
    res.json(updated[0]);
  } catch (e: any) {
    if (e?.name === "ZodError") { res.status(400).json({ error: e.errors }); return; }
    res.status(500).json({ error: "خطأ في تحديث البند" });
  }
});

// DELETE /shipments/:id/items/:itemId
router.delete("/shipments/:id/items/:itemId", async (req, res): Promise<void> => {
  try {
    const shipmentId = Number(req.params.id);
    const itemId = Number(req.params.itemId);

    const [existingItem] = await db.select().from(shipmentItemsTable).where(eq(shipmentItemsTable.id, itemId)).limit(1);
    if (existingItem?.inventoryDeducted && !existingItem.inventoryReturned) {
      await reverseShipping(
        {
          productId: existingItem.productId,
          variantId: existingItem.variantId,
          product: existingItem.product,
          color: existingItem.color,
          size: existingItem.size,
          warehouseId: existingItem.warehouseId,
        },
        existingItem.quantity,
        null,
        shipmentId,
      );
    }

    await db.delete(shipmentItemsTable).where(eq(shipmentItemsTable.id, itemId));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: "خطأ في حذف البند" }); }
});

export default router;
