import { Router, type IRouter } from "express";
import { eq, desc, and, inArray, sql, count, isNull, or } from "drizzle-orm";
import {
  db,
  shipmentManifestsTable,
  shipmentManifestItemsTable,
  shipmentsTable,
  shippingCompaniesTable,
  cashRegistersTable,
  cashTransactionsTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getTenantId } from "../middlewares/requireTenant.js";
import { syncShipmentInventory } from "./shipments.js";
import { syncShipmentItemsInventory } from "../lib/inventory.js";
import { broadcastUrgentToCompany } from "./representative.js";

const router: IRouter = Router();
router.use(requireAuth);

// ─── توليد رقم البيان ────────────────────────────────────────────────────────
async function generateManifestNumber(companyId: number): Promise<string> {
  const [row] = await db
    .select({ cnt: count() })
    .from(shipmentManifestsTable)
    .where(eq(shipmentManifestsTable.shippingCompanyId, companyId));
  const seq = (Number(row?.cnt ?? 0) + 1).toString().padStart(3, "0");
  return `SMF-${companyId}-${seq}`;
}

// ─── GET /shipment-manifests?companyId=X ─────────────────────────────────────
router.get("/shipment-manifests", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const reqUser = (req as any).user;
    // المندوب يشوف بيانات شركته بس — نتجاهل أي companyId جاي من العميل
    const companyId = reqUser?.role === "representative"
      ? reqUser.shippingCompanyId
      : (req.query.companyId ? Number(req.query.companyId) : undefined);

    // tenantId === null يعني super_admin → بدون فلتر tenant
    const tenantCondition = tenantId !== null
      ? or(eq(shipmentManifestsTable.tenantId, tenantId), isNull(shipmentManifestsTable.tenantId))
      : undefined;

    const where = and(
      tenantCondition,
      companyId ? eq(shipmentManifestsTable.shippingCompanyId, companyId) : undefined,
    );

    const manifests = await db
      .select()
      .from(shipmentManifestsTable)
      .where(where)
      .orderBy(desc(shipmentManifestsTable.createdAt));

    // جيب عدد الشحنات لكل بيان مع تفصيل الحالات
    const ids = manifests.map(m => m.id);
    let countMap: Record<number, number> = {};
    let statusCountMap: Record<number, { pending: number; delayed: number; returned: number; delivered: number; partial: number }> = {};
    if (ids.length) {
      const counts = await db
        .select({
          manifestId: shipmentManifestItemsTable.manifestId,
          deliveryStatus: shipmentManifestItemsTable.deliveryStatus,
          cnt: count(),
        })
        .from(shipmentManifestItemsTable)
        .where(inArray(shipmentManifestItemsTable.manifestId, ids))
        .groupBy(shipmentManifestItemsTable.manifestId, shipmentManifestItemsTable.deliveryStatus);

      counts.forEach(r => {
        const mid = r.manifestId;
        countMap[mid] = (countMap[mid] ?? 0) + Number(r.cnt);
        if (!statusCountMap[mid]) statusCountMap[mid] = { pending: 0, delayed: 0, returned: 0, delivered: 0, partial: 0 };
        const st = r.deliveryStatus ?? "pending";
        const n = Number(r.cnt);
        if (st === "pending") statusCountMap[mid].pending += n;
        else if (st === "delayed") statusCountMap[mid].delayed += n;
        else if (st === "returned") statusCountMap[mid].returned += n;
        else if (st === "delivered") statusCountMap[mid].delivered += n;
        else if (st === "partial_delivered") statusCountMap[mid].partial += n;
      });
    }

    // جيب اسم الشركة
    const companies = await db.select({ id: shippingCompaniesTable.id, name: shippingCompaniesTable.name, logo: shippingCompaniesTable.logo })
      .from(shippingCompaniesTable);
    const coMap: Record<number, { name: string; logo: string | null }> = {};
    companies.forEach(c => { coMap[c.id] = { name: c.name, logo: c.logo }; });

    const result = manifests.map(m => ({
      ...m,
      shipmentCount: countMap[m.id] ?? 0,
      statusCounts: statusCountMap[m.id] ?? { pending: 0, delayed: 0, returned: 0, delivered: 0, partial: 0 },
      companyName: coMap[m.shippingCompanyId]?.name ?? "",
      companyLogo: coMap[m.shippingCompanyId]?.logo ?? null,
    }));

    res.json(result);
  } catch (e) {
    console.error("[GET /shipment-manifests]", e);
    res.status(500).json({ error: "خطأ في جلب البيانات" });
  }
});

// ─── GET /shipment-manifests/:id ─────────────────────────────────────────────
router.get("/shipment-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const [manifest] = await db.select().from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, id));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }

    // المندوب يشوف بيانات شركته فقط
    const reqUser = (req as any).user;
    if (reqUser?.role === "representative" && manifest.shippingCompanyId !== reqUser.shippingCompanyId) {
      res.status(403).json({ error: "غير مصرح بعرض هذا البيان" });
      return;
    }

    const items = await db
      .select()
      .from(shipmentManifestItemsTable)
      .where(eq(shipmentManifestItemsTable.manifestId, id));

    const shipmentIds = items.map(i => i.shipmentId);
    let shipments: any[] = [];
    if (shipmentIds.length) {
      shipments = await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds));
    }

    const shipmentMap: Record<number, any> = {};
    shipments.forEach(s => { shipmentMap[s.id] = s; });

    const enrichedItems = items.map(item => {
      const sh = shipmentMap[item.shipmentId] ?? null;
      return {
        ...item,
        shipment: sh,
        // حقول مُستخرجة مباشرةً من بيانات الشحنة للفرونت
        customerName:  sh?.receiverName  ?? "",
        phone:         sh?.receiverPhone ?? "",
        city:          sh?.receiverCity  ?? "",
        address:       sh?.receiverAddress ?? "",
        senderName:    sh?.senderName    ?? "",
        quantity:      sh?.pieces        ?? 1,
        totalPrice:    Number(sh?.codAmount  ?? 0) || Number(sh?.totalAmount ?? 0),
        unitPrice:     Number(sh?.codAmount  ?? 0) || Number(sh?.totalAmount ?? 0),
        shippingCost:  Number(sh?.shippingFee ?? 0),
        invoiceNumber: sh?.shipmentNumber ?? "",
      };
    });

    // إحصائيات
    const delivered = items.filter(i => i.deliveryStatus === "delivered").length;
    const returned  = items.filter(i => i.deliveryStatus === "returned").length;
    const pending   = items.filter(i => i.deliveryStatus === "pending").length;
    const delayed   = items.filter(i => i.deliveryStatus === "delayed").length;
    const partial   = items.filter(i => i.deliveryStatus === "partial_delivered").length;

    // ─── حسابات مالية (P&L) ───────────────────────────────────────────────
    // الحقول:
    //   cod      = قيمة الشحنة (COD) التي يدفعها العميل
    //   shipping = رسوم الشحن (shippingFee) التي تأخذها شركة الشحن
    //   cost     = تكلفة البضاعة (costPrice)
    let totalRevenue = 0, totalCost = 0, totalShippingCost = 0, returnLosses = 0, deliveredGross = 0;
    // إجمالي رسوم الشحن (shippingFee) للشحنات المسلَّمة — تُخصم من المستحق وتدخل في حساب الربح
    let deliveredShippingFees = 0;
    for (const item of items) {
      const shipment = shipmentMap[item.shipmentId];
      if (!shipment) continue;
      const cod      = Number(shipment.codAmount ?? shipment.totalAmount ?? 0);
      const shipping = Number(shipment.shippingFee ?? 0);
      const cost     = Number(shipment.costPrice ?? 0);

      if (item.deliveryStatus === "delivered") {
        totalRevenue += cod;
        deliveredGross += cod;
        totalCost += cost;
        totalShippingCost += shipping;
        deliveredShippingFees += shipping;
      } else if (item.deliveryStatus === "partial_delivered" && item.partialQuantity != null) {
        // returnReceived === 1 → الجزء الباقي تم استلامه فعليًا (إيراد كامل على الكمية المستلمة)
        // returnReceived !== 1 (0 أو null) → لسه عند شركة الشحن، إيراد صفر مؤقتًا لحد ما يتم الاستلام
        if ((item as any).returnReceived === 1) {
          const qty = Number(shipment.quantity ?? 1);
          const unitCod = qty > 0 ? cod / qty : cod;
          const unitCost = qty > 0 ? cost / qty : cost;
          const partialCod = unitCod * Number(item.partialQuantity);
          totalRevenue += partialCod;
          deliveredGross += partialCod;
          totalCost += unitCost * Number(item.partialQuantity);
          totalShippingCost += shipping;
          deliveredShippingFees += shipping;
        }
      } else if (item.deliveryStatus === "returned") {
        // مرتجع لسه عند شركة الشحن (returnReceived !== 1) → خسارة شحن صفر مؤقتًا لحد ما يتم الاستلام فعليًا
        if ((item as any).returnReceived === 1) {
          totalShippingCost += shipping;
        }
      } else {
        // pending/delayed → لسه عند شركة الشحن، مفيش تكلفة شحن تُحسب عليه دلوقتي
      }
    }
    const netProfit = totalRevenue - totalCost - totalShippingCost - returnLosses;

    // ─── حسابات بيان التسوية الجديدة ───────────────────────────────────────
    // تكلفة المندوب اليدوية على مستوى البيان (تُدخل من البطاقة)
    const courierCostManual = manifest.courierCostManual != null ? Number(manifest.courierCostManual) : 0;
    // صافي المستحق للشركة = إجمالي المسلَّم (COD) − تكلفة المندوب
    const netDueToCompany   = deliveredGross - courierCostManual;
    // صافي الربح الحقيقي = إجمالي رسوم الشحن − تكلفة المندوب
    const realNetProfit     = deliveredShippingFees - courierCostManual;

    const [company] = await db.select().from(shippingCompaniesTable)
      .where(eq(shippingCompaniesTable.id, manifest.shippingCompanyId));

    res.json({
      ...manifest,
      company: company ?? null,
      items: enrichedItems,
      stats: {
        total: items.length, delivered, returned, pending, delayed, partial,
        totalRevenue, totalCost, totalShippingCost, returnLosses,
        netProfit, deliveredGross,
        // ── بيان التسوية الجديد ──
        deliveredShippingFees,                       // إجمالي رسوم الشحن (shippingFee) للشحنات المسلَّمة
        netDueToCompany,                             // صافي المستحق للشركة = المسلَّم − تكلفة المندوب
        realNetProfit,                               // صافي الربح الحقيقي = رسوم الشحن − تكلفة المندوب
      },
      courierCostManual: manifest.courierCostManual != null ? Number(manifest.courierCostManual) : null,
    });
  } catch (e) {
    console.error("[GET /shipment-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في جلب البيان" });
  }
});

// ─── POST /shipment-manifests ─────────────────────────────────────────────────
const CreateSchema = z.object({
  shippingCompanyId: z.number().int().positive(),
  shipmentIds:       z.array(z.number().int().positive()).min(1),
  notes:             z.string().nullish(),
});

router.post("/shipment-manifests", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const body = CreateSchema.parse(req.body);

    // تأكد مفيش بيان مفتوح لنفس الشركة
    const [existing] = await db
      .select({ id: shipmentManifestsTable.id })
      .from(shipmentManifestsTable)
      .where(and(
        eq(shipmentManifestsTable.shippingCompanyId, body.shippingCompanyId),
        eq(shipmentManifestsTable.status, "open"),
        tenantId !== null
          ? or(eq(shipmentManifestsTable.tenantId, tenantId), isNull(shipmentManifestsTable.tenantId))
          : undefined,
      ));
    if (existing) {
      res.status(409).json({ error: "يوجد بيان مفتوح بالفعل لهذه الشركة" });
      return;
    }

    const manifestNumber = await generateManifestNumber(body.shippingCompanyId);
    const now = new Date();

    const [result] = await db.insert(shipmentManifestsTable).values({
      tenantId:          tenantId ?? null,
      manifestNumber,
      shippingCompanyId: body.shippingCompanyId,
      status:            "open",
      notes:             body.notes ?? null,
      createdAt:         now,
    });
    const manifestId = (result as any).insertId as number;

    // أضف الشحنات للبيان
    await db.insert(shipmentManifestItemsTable).values(
      body.shipmentIds.map(sid => ({
        manifestId,
        shipmentId:     sid,
        deliveryStatus: "pending",
        addedAt:        now,
      }))
    );

    // حدّث حالة الشحنات → in_shipping + احفظ اسم المندوب (shippingCompanyId)
    await db.update(shipmentsTable)
      .set({ status: "in_shipping", shippingCompanyId: body.shippingCompanyId, updatedAt: now })
      .where(inArray(shipmentsTable.id, body.shipmentIds));

    res.status(201).json({
      id: manifestId,
      manifestNumber,
      shipmentCount: body.shipmentIds.length,
    });
  } catch (e: any) {
    console.error("[POST /shipment-manifests]", e);
    if (e?.name === "ZodError") { res.status(400).json({ error: e.errors[0]?.message }); return; }
    res.status(500).json({ error: "خطأ في إنشاء البيان" });
  }
});

// ─── PATCH /shipment-manifests/:id/items/:shipmentId ─────────────────────────
const UpdateItemSchema = z.object({
  deliveryStatus: z.enum(["pending", "delivered", "returned", "delayed", "partial_delivered"]),
  deliveryNote:   z.string().nullish(),
  partialQuantity: z.number().int().nullish(),
  returnReceived: z.boolean().nullish(),
  returnReason:   z.string().nullish(),
  itemReceivedQuantities: z.record(z.string(), z.coerce.number().int().min(0)).nullish(),
});

router.patch("/shipment-manifests/:id/items/:shipmentId", async (req, res): Promise<void> => {
  try {
    const manifestId  = Number(req.params.id);
    const shipmentId  = Number(req.params.shipmentId);
    const body        = UpdateItemSchema.parse(req.body);
    const now         = new Date();

    // المندوب يقدر يعدّل بيانات شركته بس، وبشرط البيان يكون لسه مفتوح
    const reqUser = (req as any).user;
    if (reqUser?.role === "representative") {
      const [manifestRow] = await db.select({
        shippingCompanyId: shipmentManifestsTable.shippingCompanyId,
        status: shipmentManifestsTable.status,
      }).from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, manifestId)).limit(1);
      if (!manifestRow || manifestRow.shippingCompanyId !== reqUser.shippingCompanyId) {
        res.status(403).json({ error: "غير مصرح بتعديل هذا البيان" });
        return;
      }
      if (manifestRow.status === "closed") {
        res.status(400).json({ error: "البيان مغلق — لا يمكن التعديل" });
        return;
      }
    }

    await db.update(shipmentManifestItemsTable)
      .set({
        deliveryStatus: body.deliveryStatus,
        deliveryNote:   body.deliveryNote ?? null,
        partialQuantity: body.partialQuantity ?? null,
        returnReason:   body.returnReason ?? null,
        returnReceived: body.returnReceived == null ? null : body.returnReceived ? 1 : 0,
        deliveredAt:    (body.deliveryStatus === "delivered" || body.deliveryStatus === "partial_delivered") ? now : undefined,
      })
      .where(and(
        eq(shipmentManifestItemsTable.manifestId, manifestId),
        eq(shipmentManifestItemsTable.shipmentId, shipmentId),
      ));

    // حدّث حالة الشحنة نفسها — partial_delivered (البيان) يقابل partial_received (شحنات) بنفس الاسم
    // عشان عمود "الحالة" في صفحة الشحنات يفضل واحد ثابت، والفرق (لسه عند الشحن / في المخزن) بييجي من returnReceived
    const statusMap: Record<string, string> = {
      delivered: "delivered",
      returned:  "returned",
      delayed:   "delayed",
      partial_delivered: "partial_received",
      pending:   "in_transit",
    };

    // ربط المخزون: لو الحالة "مرتجع" أو "استلام جزئي" → نفس منطق صفحة الشحنة مباشرة
    // (deliveryStatus بتاع البيان بيستخدم "partial_delivered"، نظام المخزون بيتوقع "partial_received")
    const inventoryStatus =
      body.deliveryStatus === "returned"          ? "returned" :
      body.deliveryStatus === "partial_delivered" ? "partial_received" :
      undefined;

    const shipmentPatch: Record<string, any> = {
      status: statusMap[body.deliveryStatus] ?? "in_transit",
      updatedAt: now,
    };
    if (body.partialQuantity != null) shipmentPatch.partialQuantity = body.partialQuantity;
    // returnReceived و returnReason بتاعين "مرتجع"/"استلام جزئي" — لازم ينعكسوا على جدول الشحنات
    // عشان صفحة الشحنات تعرض نفس التاج (ما زال عند شركة الشحن / في المخزن) من البيان
    if (body.deliveryStatus === "returned" || body.deliveryStatus === "partial_delivered") {
      shipmentPatch.returnReceived = body.returnReceived == null ? null : body.returnReceived ? 1 : 0;
    } else {
      shipmentPatch.returnReceived = null;
    }
    if (body.deliveryStatus === "returned") shipmentPatch.returnReason = body.returnReason ?? null;

    if (inventoryStatus) {
      const [existingShipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, shipmentId)).limit(1);
      if (existingShipment) {
        // منتج واحد (single product) على الشحنة نفسها — afterPatch.status هنا للمخزون فقط
        // (مش نفس status اللي هيتسجل فعليًا)، فبنستخدم نسخة مؤقتة ونلقط الفلاجز اللي ضافها
        const invPatch: Record<string, any> = { ...shipmentPatch, status: inventoryStatus };
        await syncShipmentInventory(existingShipment, invPatch);
        if (invPatch.inventoryDeducted != null) shipmentPatch.inventoryDeducted = invPatch.inventoryDeducted;
        if (invPatch.inventoryReturned != null) shipmentPatch.inventoryReturned = invPatch.inventoryReturned;
        // منتجات متعددة (shipment_items) على الشحنة
        await syncShipmentItemsInventory(shipmentId, inventoryStatus, body.itemReceivedQuantities ?? undefined, body.returnReceived === true);
      }
    }

    await db.update(shipmentsTable)
      .set(shipmentPatch)
      .where(eq(shipmentsTable.id, shipmentId));

    res.json({ success: true });
  } catch (e: any) {
    console.error("[PATCH /shipment-manifests/:id/items/:shipmentId]", e);
    res.status(500).json({ error: "خطأ في تحديث حالة الشحنة" });
  }
});

// ─── PATCH /shipment-manifests/:id/items/:shipmentId/urgent — تفعيل/إلغاء الاستعجال ──
router.patch("/shipment-manifests/:id/items/:shipmentId/urgent", async (req, res): Promise<void> => {
  try {
    const manifestId = Number(req.params.id);
    const shipmentId = Number(req.params.shipmentId);
    const { isUrgent, urgentNote } = z.object({
      isUrgent:   z.boolean(),
      urgentNote: z.string().max(255).optional().nullable(),
    }).parse(req.body);

    // تأكد إن البيان موجود والمستخدم مش مندوب (المندوب مش يقدر يستعجل نفسه)
    const reqUser = (req as any).user;
    if (reqUser?.role === "representative") {
      res.status(403).json({ error: "المندوب لا يملك صلاحية هذا الإجراء" });
      return;
    }

    const [item] = await db
      .select({ id: shipmentManifestItemsTable.id })
      .from(shipmentManifestItemsTable)
      .where(and(
        eq(shipmentManifestItemsTable.manifestId, manifestId),
        eq(shipmentManifestItemsTable.shipmentId, shipmentId),
      ))
      .limit(1);

    if (!item) { res.status(404).json({ error: "الشحنة غير موجودة في هذا البيان" }); return; }

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
        .where(eq(shipmentManifestsTable.id, manifestId))
        .limit(1);
      if (manifest?.shippingCompanyId) {
        const [shipmentItem] = await db
          .select({
            customerName: shipmentManifestItemsTable.customerName,
            phone:        shipmentManifestItemsTable.phone,
            city:         shipmentManifestItemsTable.city,
            invoiceNumber:shipmentManifestItemsTable.invoiceNumber,
            totalPrice:   shipmentManifestItemsTable.totalPrice,
          })
          .from(shipmentManifestItemsTable)
          .where(eq(shipmentManifestItemsTable.id, item.id))
          .limit(1);
        broadcastUrgentToCompany(manifest.shippingCompanyId, {
          type: "urgent",
          manifestId,
          manifestNumber: manifest.manifestNumber,
          shipmentId,
          urgentNote: urgentNote ?? null,
          urgentAt: new Date().toISOString(),
          ...(shipmentItem ?? {}),
        });
      }
    }

    res.json({ success: true, isUrgent });
  } catch (e: any) {
    console.error("[PATCH /shipment-manifests/:id/items/:shipmentId/urgent]", e);
    res.status(500).json({ error: "خطأ في تحديث حالة الاستعجال" });
  }
});

// ─── تحويل إيراد البيان للخزنة عند الإغلاق ──────────────────────────────────
async function createTreasuryEntryOnClose(
  manifest: typeof shipmentManifestsTable.$inferSelect,
  items: (typeof shipmentManifestItemsTable.$inferSelect)[],
  userId: number | null,
  userName: string | null,
): Promise<void> {
  const now = new Date();

  // جيب الشحنات لمعرفة سعر كل شحنة
  const shipmentIds = items.map(i => i.shipmentId);
  const shipments = shipmentIds.length > 0
    ? await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds))
    : [];
  const shipmentMap = new Map(shipments.map(s => [s.id, s]));

  let grossRevenue = 0;

  for (const item of items) {
    const shipment = shipmentMap.get(item.shipmentId);
    if (!shipment) continue;
    const price = Number(shipment.totalPrice ?? shipment.shippingFee ?? 0);

    if (item.deliveryStatus === "delivered") {
      grossRevenue += price;
    } else if (item.deliveryStatus === "partial_delivered" && item.partialQuantity != null) {
      // لو الشحنة مسلمة جزئياً → نحسب نسبة من السعر
      const qty = Number(shipment.quantity ?? 1);
      const unitPrice = qty > 0 ? price / qty : price;
      grossRevenue += unitPrice * Number(item.partialQuantity);
    }
    // returned / delayed / pending → مش بيتحسب
  }

  if (grossRevenue <= 0) return;

  // جيب الخزنة الرئيسية
  const [mainRegister] = await db
    .select()
    .from(cashRegistersTable)
    .where(and(eq(cashRegistersTable.type, "main"), eq(cashRegistersTable.isActive, true)))
    .limit(1);

  if (!mainRegister) return;

  const balanceBefore = Number(mainRegister.balance ?? 0);
  const balanceAfter  = balanceBefore + grossRevenue;

  const [company] = await db.select().from(shippingCompaniesTable)
    .where(eq(shippingCompaniesTable.id, manifest.shippingCompanyId));

  await db.insert(cashTransactionsTable).values({
    registerId:      mainRegister.id,
    type:            "shipping_transfer" as any,
    amount:          String(grossRevenue),
    balanceBefore:   String(balanceBefore),
    balanceAfter:    String(balanceAfter),
    description:     `تحصيل بيان شحنات ${manifest.manifestNumber} - ${company?.name ?? ""}`,
    referenceNumber: manifest.manifestNumber,
    transactionDate: now,
    createdByUserId: userId,
    createdByName:   userName,
    createdAt:       now,
  });

  await db.update(cashRegistersTable)
    .set({ balance: String(balanceAfter), updatedAt: now })
    .where(eq(cashRegistersTable.id, mainRegister.id));
}

// ─── جلب أو إنشاء البيان المفتوح المستهدف لنفس شركة الشحن ────────────────────
async function getOrCreateOpenManifest(
  closedManifest: typeof shipmentManifestsTable.$inferSelect,
  defaultNotes: string,
): Promise<{ id: number; manifestNumber: string }> {
  const [openManifest] = await db
    .select()
    .from(shipmentManifestsTable)
    .where(and(
      eq(shipmentManifestsTable.shippingCompanyId, closedManifest.shippingCompanyId),
      eq(shipmentManifestsTable.status, "open"),
    ));

  if (openManifest) return { id: openManifest.id, manifestNumber: openManifest.manifestNumber };

  const manifestNumber = await generateManifestNumber(closedManifest.shippingCompanyId);
  const [result] = await db.insert(shipmentManifestsTable).values({
    tenantId:          closedManifest.tenantId,
    manifestNumber,
    shippingCompanyId: closedManifest.shippingCompanyId,
    status:            "open",
    notes:             defaultNotes,
    createdAt:         new Date(),
  });
  const newId = (result as any).insertId as number;
  return { id: newId, manifestNumber };
}

// ─── ترحيل الشحنات لبيان جديد عند إغلاق البيان ───────────────────────────────
// 1) مؤجل (delayed): يترحّل كصف pending جديد كامل في الجدول — الحالة الوحيدة اللي بتاخد صف جديد كامل
// 2) مرتجع (returned) أو استلام جزئي (partial_delivered) لسه عند شركة الشحن (returnReceived != 1):
//    يترحّل "زي ما هو تماماً" بدون أي تغيير في الجدول — بيفضل ظاهر في حاوية "بضاعة لسه عند شركة الشحن"
//    بنفس بياناته (الملاحظات والكمية الجزئية) من بيان لبيان لحد ما اليوزر يضغط "تم الاستلام"
//    (ده شامل الحالتين: لسه ولا اتستلمش خالص، أو اتستلم جزء وفضل جزء عند الشحن)
async function rolloverPartialShipments(
  closedManifest: typeof shipmentManifestsTable.$inferSelect,
  items: (typeof shipmentManifestItemsTable.$inferSelect)[],
): Promise<{
  id: number;
  manifestNumber: string;
  orderCount: number;
  postponedCount: number;
  returnedInShippingCount: number;
  partialInShippingCount: number;
} | null> {
  const now = new Date();

  // ── 1) مؤجل: يترحّل كصف pending جديد زي ما هو ───────────────────────────────
  const delayedItems = items.filter(i => i.deliveryStatus === "delayed");

  // ── 2) مرتجع / استلام جزئي لسه عند شركة الشحن (بدون returnReceived) ────────
  //    يترحّل بنفس بياناته بالظبط، بدون تغيير أي حاجة — يشمل الجزئي اللي لسه
  //    عند الشحن كله أو جزء منه، الملاحظة والكمية الجزئية بتترحّل زي ما هي
  const stillAtShippingItems = items.filter(i =>
    (i.deliveryStatus === "returned" || i.deliveryStatus === "partial_delivered") &&
    i.returnReceived !== 1
  );

  const hasRollover = delayedItems.length > 0 || stillAtShippingItems.length > 0;
  if (!hasRollover) return null;

  const targetManifest = await getOrCreateOpenManifest(closedManifest, "بيان مرحّل تلقائياً");
  const targetManifestId = targetManifest.id;

  // الشحنات اللي ممكن تتكرر بين الفئات (نادراً) — نمنع تكرار نفس shipmentId في نفس البيان
  const existing = await db
    .select({ shipmentId: shipmentManifestItemsTable.shipmentId })
    .from(shipmentManifestItemsTable)
    .where(eq(shipmentManifestItemsTable.manifestId, targetManifestId));
  const existingIds = new Set(existing.map(e => e.shipmentId));

  const rowsToInsert: (typeof shipmentManifestItemsTable.$inferInsert)[] = [];
  const shipmentIdsToMarkInTransit: number[] = [];
  let delayedCount = 0;
  let returnedStillAtShippingCount = 0;
  let partialStillAtShippingCount = 0;

  // 1) مؤجل → صف pending جديد (نفس الشحنة بالكامل)
  for (const item of delayedItems) {
    if (existingIds.has(item.shipmentId)) continue;
    rowsToInsert.push({
      manifestId:     targetManifestId,
      shipmentId:     item.shipmentId,
      deliveryStatus: "pending",
      deliveryNote:   `مؤجل من بيان ${closedManifest.manifestNumber}`,
      addedAt:        now,
    });
    shipmentIdsToMarkInTransit.push(item.shipmentId);
    existingIds.add(item.shipmentId);
    delayedCount++;
  }

  // 2) مرتجع / جزئي لسه عند الشحن → يترحّل زي ما هو بدون أي تغيير (ملاحظات وكمية جزئية فقط)
  for (const item of stillAtShippingItems) {
    if (existingIds.has(item.shipmentId)) continue;
    rowsToInsert.push({
      manifestId:      targetManifestId,
      shipmentId:      item.shipmentId,
      deliveryStatus:  item.deliveryStatus,
      deliveryNote:    item.deliveryNote,
      partialQuantity: item.partialQuantity,
      returnReceived:  item.returnReceived,
      returnReason:    item.returnReason,
      addedAt:         now,
    });
    existingIds.add(item.shipmentId);
    if (item.deliveryStatus === "returned") returnedStillAtShippingCount++;
    else partialStillAtShippingCount++;
    // الشحنة لسه فعلياً عند شركة الشحن، فمش بنغيّر حالتها في shipmentsTable
  }

  if (rowsToInsert.length === 0) return null;

  await db.insert(shipmentManifestItemsTable).values(rowsToInsert);

  if (shipmentIdsToMarkInTransit.length > 0) {
    await db.update(shipmentsTable)
      .set({ status: "in_transit", updatedAt: now })
      .where(inArray(shipmentsTable.id, shipmentIdsToMarkInTransit));
  }

  return {
    id:                      targetManifestId,
    manifestNumber:          targetManifest.manifestNumber,
    orderCount:              rowsToInsert.length,
    postponedCount:          delayedCount,
    returnedInShippingCount: returnedStillAtShippingCount,
    partialInShippingCount:  partialStillAtShippingCount,
  };
}

// ─── PATCH /shipment-manifests/:id  (قفل/فتح البيان) ────────────────────────
router.patch("/shipment-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id   = Number(req.params.id);
    let body = req.body as { status?: "open" | "closed"; notes?: string; invoicePrice?: number | null };
    const now  = new Date();

    // المندوب يقدر يقفل/يفتح بيانه بس — مش يعدّل ملاحظات أو سعر فاتورة
    const reqUser = (req as any).user;
    if (reqUser?.role === "representative") {
      const [existingManifest] = await db.select({ shippingCompanyId: shipmentManifestsTable.shippingCompanyId })
        .from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, id)).limit(1);
      if (!existingManifest || existingManifest.shippingCompanyId !== reqUser.shippingCompanyId) {
        res.status(403).json({ error: "غير مصرح بتعديل هذا البيان" });
        return;
      }
      body = { status: body.status };
    }

    await db.update(shipmentManifestsTable)
      .set({
        ...(body.status ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.invoicePrice !== undefined ? { invoicePrice: String(body.invoicePrice) } : {}),
        ...(body.status === "closed" ? { closedAt: now } : {}),
        ...(body.status === "open"   ? { closedAt: null } : {}),
      })
      .where(eq(shipmentManifestsTable.id, id));

    // ── تحويل الإيراد للخزنة عند الإغلاق ──────────────────────────────────
    let rolledOverManifest: any = null;
    if (body.status === "closed") {
      try {
        const [manifest] = await db.select().from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, id));
        if (manifest) {
          const items = await db.select().from(shipmentManifestItemsTable)
            .where(eq(shipmentManifestItemsTable.manifestId, id));
          const userId   = (req as any).user?.id   ?? null;
          const userName = (req as any).user?.name ?? null;
          await createTreasuryEntryOnClose(manifest, items, userId, userName);

          // ترحيل الشحنات المعلّقة لبيان جديد: مؤجل (صف جديد) + استلام جزئي (الباقي كصف جديد)
          // + مرتجع/جزئي لسه عند الشحن (يترحّل زي ما هو بدون تغيير لحد ما يُستلم)
          rolledOverManifest = await rolloverPartialShipments(manifest, items);
        }
      } catch (err) {
        console.error("[PATCH /shipment-manifests/:id] treasury entry error:", err);
        // لا نوقف الـ response — البيان اتقفل بنجاح حتى لو الخزنة فيها مشكلة
      }
    }

    res.json({ success: true, rolledOverManifest });
  } catch (e) {
    console.error("[PATCH /shipment-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في تحديث البيان" });
  }
});

// ─── POST /shipment-manifests/:id/add-shipments ──────────────────────────────
router.post("/shipment-manifests/:id/add-shipments", async (req, res): Promise<void> => {
  try {
    const manifestId  = Number(req.params.id);
    const { shipmentIds } = req.body as { shipmentIds: number[] };

    if (!Array.isArray(shipmentIds) || shipmentIds.length === 0) {
      res.status(400).json({ error: "يجب إرسال قائمة شحنات" });
      return;
    }

    const [manifest] = await db.select().from(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, manifestId));
    if (!manifest) { res.status(404).json({ error: "البيان غير موجود" }); return; }
    if (manifest.status === "closed") { res.status(400).json({ error: "البيان مغلق" }); return; }

    const now = new Date();

    // استبعد الشحنات الموجودة في البيان
    const existing = await db.select({ shipmentId: shipmentManifestItemsTable.shipmentId })
      .from(shipmentManifestItemsTable)
      .where(eq(shipmentManifestItemsTable.manifestId, manifestId));
    const existingIds = new Set(existing.map(e => e.shipmentId));
    const candidateIds = shipmentIds.filter(id => !existingIds.has(id));

    if (candidateIds.length === 0) {
      res.json({ added: 0, manifestNumber: manifest.manifestNumber });
      return;
    }

    // اتأكد إن الشحنات لسه "قيد الشحن في المخزن" فعلياً (مش picked_up أو أي حالة تانية)
    const candidates = await db.select({ id: shipmentsTable.id, status: shipmentsTable.status })
      .from(shipmentsTable)
      .where(inArray(shipmentsTable.id, candidateIds));
    const newIds = candidates.filter(c => c.status === "warehouse_ready").map(c => c.id);

    if (newIds.length === 0) {
      res.json({ added: 0, manifestNumber: manifest.manifestNumber });
      return;
    }

    await db.insert(shipmentManifestItemsTable).values(
      newIds.map(sid => ({
        manifestId,
        shipmentId:     sid,
        deliveryStatus: "pending",
        addedAt:        now,
      }))
    );

    // حدّث حالة الشحنات → in_transit
    await db.update(shipmentsTable)
      .set({ status: "in_transit", updatedAt: now })
      .where(inArray(shipmentsTable.id, newIds));

    res.json({ added: newIds.length, manifestNumber: manifest.manifestNumber });
  } catch (e) {
    console.error("[POST /shipment-manifests/:id/add-shipments]", e);
    res.status(500).json({ error: "خطأ في إضافة الشحنات" });
  }
});

// ─── DELETE /shipment-manifests/:id ──────────────────────────────────────────
router.delete("/shipment-manifests/:id", async (req, res): Promise<void> => {
  try {
    const id = Number(req.params.id);
    // أرجع حالة الشحنات → waiting
    const items = await db.select({ shipmentId: shipmentManifestItemsTable.shipmentId })
      .from(shipmentManifestItemsTable)
      .where(eq(shipmentManifestItemsTable.manifestId, id));
    if (items.length) {
      const ids = items.map(i => i.shipmentId);
      await db.update(shipmentsTable)
        .set({ status: "waiting", updatedAt: new Date() })
        .where(inArray(shipmentsTable.id, ids));
    }
    await db.delete(shipmentManifestsTable).where(eq(shipmentManifestsTable.id, id));
    res.json({ success: true });
  } catch (e) {
    console.error("[DELETE /shipment-manifests/:id]", e);
    res.status(500).json({ error: "خطأ في حذف البيان" });
  }
});

// ─── GET /shipping-companies/:id/shipment-stats ───────────────────────────────
router.get("/shipping-companies/:id/shipment-stats", async (req, res): Promise<void> => {
  try {
    const companyId = Number(req.params.id);
    const tenantId  = getTenantId(req);

    const manifests = await db.select({ id: shipmentManifestsTable.id })
      .from(shipmentManifestsTable)
      .where(and(
        eq(shipmentManifestsTable.shippingCompanyId, companyId),
        tenantId !== null
          ? or(eq(shipmentManifestsTable.tenantId, tenantId), isNull(shipmentManifestsTable.tenantId))
          : undefined,
      ));

    const manifestIds = manifests.map(m => m.id);
    let items: any[] = [];
    if (manifestIds.length) {
      items = await db.select().from(shipmentManifestItemsTable)
        .where(inArray(shipmentManifestItemsTable.manifestId, manifestIds));
    }

    const delivered = items.filter(i => i.deliveryStatus === "delivered").length;
    const returned  = items.filter(i => i.deliveryStatus === "returned").length;
    const partial   = items.filter(i => i.deliveryStatus === "partial_delivered").length;
    const pending   = items.filter(i => i.deliveryStatus === "pending" || i.deliveryStatus === "delayed").length;
    const total     = items.length;
    const deliveryRate = total > 0 ? Math.round(((delivered + partial) / total) * 100) : 0;

    // ─── حسابات مالية (P&L) من بيانات الشحنات نفسها ─────────────────────────
    let totalRevenue = 0, totalCost = 0, totalShippingCost = 0, returnLosses = 0, deliveredGross = 0;
    if (items.length) {
      const shipmentIds = items.map(i => i.shipmentId);
      const shipments = await db.select().from(shipmentsTable).where(inArray(shipmentsTable.id, shipmentIds));
      const shipmentMap = new Map(shipments.map(s => [s.id, s]));

      for (const item of items) {
        const shipment = shipmentMap.get(item.shipmentId);
        if (!shipment) continue;
        const cod      = Number(shipment.codAmount ?? shipment.totalAmount ?? 0);
        const shipping = Number(shipment.shippingFee ?? 0);
        const cost     = Number(shipment.costPrice ?? 0);

        if (item.deliveryStatus === "delivered" || item.deliveryStatus === "partial_delivered") {
          totalRevenue += cod;
          deliveredGross += cod;
          totalCost += cost;
          totalShippingCost += shipping;
        } else if (item.deliveryStatus === "returned") {
          returnLosses += shipping;
        } else {
          totalShippingCost += shipping;
        }
      }
    }
    const netProfit = totalRevenue - totalCost - totalShippingCost - returnLosses;

    res.json({
      total, delivered, partial, returned, pending,
      deliveryRate,
      totalRevenue, totalCost, totalShippingCost, returnLosses,
      netProfit, deliveredGross,
      manifestCount: manifests.length,
    });
  } catch (e) {
    console.error("[GET /shipping-companies/:id/shipment-stats]", e);
    res.status(500).json({ error: "خطأ في جلب الإحصائيات" });
  }
});

export default router;
