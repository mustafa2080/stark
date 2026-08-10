import { Router, type IRouter } from "express";
import { eq, desc, and, count, isNull, or } from "drizzle-orm";
import {
  db,
  clientReturnManifestsTable,
  clientReturnManifestItemsTable,
  clientAccountManifestItemsTable,
  shipmentsTable,
  clientsTable,
} from "@workspace/db";
import { z } from "zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getTenantId } from "../middlewares/requireTenant.js";

const router: IRouter = Router();
router.use(requireAuth);

// ─── توليد رقم بيان المرتجعات ──────────────────────────────────────────────
async function generateReturnManifestNumber(clientId: number): Promise<string> {
  const [row] = await db
    .select({ cnt: count() })
    .from(clientReturnManifestsTable)
    .where(eq(clientReturnManifestsTable.clientId, clientId));
  const seq = (Number(row?.cnt ?? 0) + 1).toString().padStart(3, "0");
  return `CRM-${clientId}-${seq}`;
}

// ─── هات بيان مرتجعات مفتوح لنفس العميل، أو افتح واحد جديد لو مفيش ─────────
async function getOrCreateOpenReturnManifest(
  clientId: number,
  tenantId: number | null,
): Promise<number> {
  const tenantCondition = tenantId !== null
    ? or(eq(clientReturnManifestsTable.tenantId, tenantId), isNull(clientReturnManifestsTable.tenantId))
    : undefined;

  const [openManifest] = await db
    .select({ id: clientReturnManifestsTable.id })
    .from(clientReturnManifestsTable)
    .where(and(
      eq(clientReturnManifestsTable.clientId, clientId),
      eq(clientReturnManifestsTable.status, "open"),
      tenantCondition,
    ))
    .limit(1);

  if (openManifest) return openManifest.id;

  const manifestNumber = await generateReturnManifestNumber(clientId);
  const now = new Date();
  const [result] = await db.insert(clientReturnManifestsTable).values({
    tenantId: tenantId ?? null,
    manifestNumber,
    clientId,
    status: "open",
    notes: null,
    createdAt: now,
  });
  return (result as any).insertId as number;
}

// ─── POST /client-return-manifests/:clientId/confirm-delivery/:shipmentId ───
// الزرار الوحيد: بيتأكد إن المرتجع اتسلم فعليًا للعميل. بيعمل حاجتين مع بعض:
// (أ) يعمل snapshot لبيانات الشحنة ويضيفه لبيان المرتجعات المفتوح (يفتحه لو مش موجود)
// (ب) يسجّل returnReceived=1 على بند البيان الأصلي (client_account_manifest_items)
// عشان يختفي من قايمة "لم يتم تسليمها" في بيان حساب العميل العادي.
router.post("/client-return-manifests/:clientId/confirm-delivery/:shipmentId", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const clientId = Number(req.params.clientId);
    const shipmentId = Number(req.params.shipmentId);

    const [shipment] = await db.select().from(shipmentsTable).where(eq(shipmentsTable.id, shipmentId)).limit(1);
    if (!shipment) { res.status(404).json({ error: "الشحنة غير موجودة" }); return; }

    // ─── منع تكرار الترحيل: لو الشحنة دي اترحلت بالفعل لبند في بيان مرتجعات، متتضافش تاني
    const [existingItem] = await db
      .select({ id: clientReturnManifestItemsTable.id })
      .from(clientReturnManifestItemsTable)
      .where(eq(clientReturnManifestItemsTable.shipmentId, shipmentId))
      .limit(1);
    if (existingItem) { res.status(400).json({ error: "المرتجع ده اتسجل تسليمه للعميل بالفعل" }); return; }

    const manifestId = await getOrCreateOpenReturnManifest(clientId, tenantId);
    const now = new Date();

    await db.insert(clientReturnManifestItemsTable).values({
      manifestId,
      shipmentId,
      shipmentNumber: shipment.shipmentNumber,
      receiverName:   shipment.receiverName ?? null,
      receiverPhone:  shipment.receiverPhone ?? null,
      receiverCity:   shipment.receiverCity ?? null,
      codAmount:      shipment.codAmount != null ? String(shipment.codAmount) : null,
      returnReason:   (shipment as any).returnReason ?? null,
      addedAt:        now,
    });

    // ─── تسجيل returnReceived=1 على بند بيان حساب العميل العادي (لو موجود) ───
    await db.update(clientAccountManifestItemsTable)
      .set({ returnReceived: 1 })
      .where(eq(clientAccountManifestItemsTable.shipmentId, shipmentId));

    res.json({ success: true, manifestId });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "خطأ في تأكيد تسليم المرتجع" });
  }
});

// ─── GET /client-return-manifests?clientId=X ─────────────────────────────────
router.get("/client-return-manifests", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const clientId = req.query.clientId ? Number(req.query.clientId) : undefined;

    const tenantCondition = tenantId !== null
      ? or(eq(clientReturnManifestsTable.tenantId, tenantId), isNull(clientReturnManifestsTable.tenantId))
      : undefined;

    const where = and(
      tenantCondition,
      clientId ? eq(clientReturnManifestsTable.clientId, clientId) : undefined,
    );

    const manifests = await db
      .select()
      .from(clientReturnManifestsTable)
      .where(where)
      .orderBy(desc(clientReturnManifestsTable.createdAt));

    const ids = manifests.map(m => m.id);
    let countMap: Record<number, number> = {};
    if (ids.length) {
      for (const id of ids) {
        const [row] = await db.select({ cnt: count() })
          .from(clientReturnManifestItemsTable)
          .where(eq(clientReturnManifestItemsTable.manifestId, id));
        countMap[id] = Number(row?.cnt ?? 0);
      }
    }

    const clientIds = [...new Set(manifests.map(m => m.clientId))];
    const clientsRows = clientIds.length
      ? await db.select({ id: clientsTable.id, name: clientsTable.name })
          .from(clientsTable)
      : [];
    const clientMap: Record<number, string> = {};
    clientsRows.forEach(c => { if (clientIds.includes(c.id)) clientMap[c.id] = c.name; });

    res.json({
      manifests: manifests.map(m => ({
        ...m,
        itemsCount: countMap[m.id] ?? 0,
        clientName: clientMap[m.clientId] ?? null,
      })),
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "خطأ في جلب بيانات المرتجعات" });
  }
});

// ─── GET /client-return-manifests/:id ────────────────────────────────────────
router.get("/client-return-manifests/:id", async (req, res): Promise<void> => {
  try {
    const manifestId = Number(req.params.id);
    const [manifest] = await db.select().from(clientReturnManifestsTable)
      .where(eq(clientReturnManifestsTable.id, manifestId)).limit(1);
    if (!manifest) { res.status(404).json({ error: "بيان المرتجعات غير موجود" }); return; }

    const items = await db.select().from(clientReturnManifestItemsTable)
      .where(eq(clientReturnManifestItemsTable.manifestId, manifestId))
      .orderBy(desc(clientReturnManifestItemsTable.addedAt));

    const [client] = await db.select({ id: clientsTable.id, name: clientsTable.name })
      .from(clientsTable).where(eq(clientsTable.id, manifest.clientId)).limit(1);

    res.json({ manifest: { ...manifest, clientName: client?.name ?? null }, items });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "خطأ في جلب تفاصيل بيان المرتجعات" });
  }
});

// ─── PATCH /client-return-manifests/:id ─── إغلاق البيان ─────────────────────
const CloseManifestSchema = z.object({
  status: z.enum(["open", "closed"]),
  notes: z.string().nullish(),
  courierName: z.string().nullish(),
});

router.patch("/client-return-manifests/:id", async (req, res): Promise<void> => {
  try {
    const manifestId = Number(req.params.id);
    const body = CloseManifestSchema.parse(req.body);

    const [manifest] = await db.select().from(clientReturnManifestsTable)
      .where(eq(clientReturnManifestsTable.id, manifestId)).limit(1);
    if (!manifest) { res.status(404).json({ error: "بيان المرتجعات غير موجود" }); return; }

    await db.update(clientReturnManifestsTable)
      .set({
        status: body.status,
        notes: body.notes ?? manifest.notes,
        courierName: body.courierName ?? manifest.courierName,
        closedAt: body.status === "closed" ? new Date() : null,
      })
      .where(eq(clientReturnManifestsTable.id, manifestId));

    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "خطأ في تحديث بيان المرتجعات" });
  }
});

export default router;
