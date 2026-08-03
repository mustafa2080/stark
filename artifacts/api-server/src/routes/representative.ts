import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, desc, isNull, count, sql, inArray } from "drizzle-orm";
import { db, shipmentsTable, shipmentItemsTable, shippingCompaniesTable, usersTable, shipmentZonesTable, auditLogsTable, shipmentManifestsTable, shipmentManifestItemsTable, shipmentRatingsTable, representativeWalletTransactionsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth.js";
import { computeManifestNetDue } from "../lib/manifestFinance.js";
import { verifyToken } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";
import { getTenantId, buildTenantCondition } from "../middlewares/requireTenant.js";

// ─── SSE: مخزن connections المناديب مرتبة بـ companyId ───────────────────────
export const repSseClients = new Map<number, Set<Response>>();

export function broadcastUrgentToCompany(companyId: number, payload: object) {
  const clients = repSseClients.get(companyId);
  if (!clients || clients.size === 0) return;
  const data = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try { res.write(data); } catch (_) {}
  }
}

// ─── helper: جيب IDs الشحنات بتاعة شركة الشحن عن طريق الـ manifests ──────────
async function getShipmentIdsByCompany(companyId: number): Promise<number[]> {
  const manifests = await db.select({ id: shipmentManifestsTable.id })
    .from(shipmentManifestsTable)
    .where(eq(shipmentManifestsTable.shippingCompanyId, companyId));
  if (!manifests.length) return [];
  const manifestIds = manifests.map(m => m.id);
  const items = await db.select({ shipmentId: shipmentManifestItemsTable.shipmentId })
    .from(shipmentManifestItemsTable)
    .where(inArray(shipmentManifestItemsTable.manifestId, manifestIds));
  return [...new Set(items.map(i => i.shipmentId))];
}

const router: IRouter = Router();

// ─── GET /representative/sse — لازم يتسجل قبل requireAuth لأن EventSource مش بيبعت header ───
router.get("/sse", (req: Request, res: Response): void => {
  const rawToken = (req.query.token as string) || (req.headers.authorization?.replace("Bearer ", "") ?? "");
  if (!rawToken) { res.status(401).json({ error: "غير مصرح" }); return; }
  const user = verifyToken(rawToken) as any;
  if (!user) { res.status(401).json({ error: "انتهت الجلسة" }); return; }
  const allowed = ["representative", "admin", "super_admin", "super-admin"];
  if (!allowed.includes(user.role)) { res.status(403).json({ error: "غير مصرح" }); return; }
  const companyId = user.shippingCompanyId as number | undefined;
  if (!companyId) { res.status(400).json({ error: "المندوب غير مرتبط بشركة شحن" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  if (!repSseClients.has(companyId)) repSseClients.set(companyId, new Set());
  repSseClients.get(companyId)!.add(res);

  const heartbeat = setInterval(() => {
    try { res.write(": ping\n\n"); } catch (_) { cleanup(); }
  }, 25000);

  function cleanup() {
    clearInterval(heartbeat);
    repSseClients.get(companyId!)?.delete(res);
  }

  req.on("close", cleanup);
  req.on("error", cleanup);
});

router.use(requireAuth);

// ─── Block PATCH/POST/DELETE for representatives (عدا تحديث موقعهم الحالي) ───
function blockRepresentativeWrites(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (
    user?.role === "representative" &&
    ["POST", "PATCH", "PUT", "DELETE"].includes(req.method) &&
    req.path !== "/location"
  ) {
    res.status(403).json({ error: "المندوب لا يملك صلاحية التعديل" });
    return;
  }
  next();
}
router.use(blockRepresentativeWrites);

// ─── Only representatives and admins ─────────────────────────────────────────
function requireRepresentativeOrAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;
  if (!user) { res.status(401).json({ error: "غير مصرح" }); return; }
  const allowed = ["representative", "admin", "super_admin", "super-admin"];
  if (!allowed.includes(user.role)) {
    res.status(403).json({ error: "غير مصرح — هذه الصفحة للمناديب فقط" });
    return;
  }
  next();
}

// ─── GET /representative/me ───────────────────────────────────────────────────
router.get("/me", requireRepresentativeOrAdmin, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  if (user.role === "representative" && !user.shippingCompanyId) {
    res.status(400).json({ error: "المندوب غير مرتبط بشركة شحن" });
    return;
  }
  const companyId = user.shippingCompanyId ?? null;
  let company = null;
  if (companyId) {
    const [c] = await db.select().from(shippingCompaniesTable).where(eq(shippingCompaniesTable.id, companyId)).limit(1);
    company = c ?? null;
  }
  const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
  const { passwordHash: _, ...safeUser } = dbUser as any;
  res.json({ user: safeUser, company });
});

// ─── GET /representative/shipments ───────────────────────────────────────────
router.get("/shipments", requireRepresentativeOrAdmin, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const companyId = user.role === "representative"
    ? user.shippingCompanyId
    : req.query.companyId ? parseInt(req.query.companyId as string) : null;
  if (!companyId) { res.status(400).json({ error: "companyId مطلوب" }); return; }

  const page     = Math.max(1, parseInt((req.query.page as string) ?? "1"));
  const limit    = Math.min(100, parseInt((req.query.limit as string) ?? "50"));
  const offset   = (page - 1) * limit;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo   = req.query.dateTo as string | undefined;
  const status   = req.query.status as string | undefined;

  const shipmentIds = await getShipmentIdsByCompany(companyId);
  if (!shipmentIds.length) { res.json({ data: [], total: 0, page, limit }); return; }

  const conditions: any[] = [inArray(shipmentsTable.id, shipmentIds), isNull(shipmentsTable.deletedAt)];
  if (dateFrom) conditions.push(sql`${shipmentsTable.createdAt} >= ${new Date(dateFrom)}`);
  if (dateTo)   conditions.push(sql`${shipmentsTable.createdAt} <= ${new Date(dateTo + "T23:59:59")}`);
  if (status)   conditions.push(eq(shipmentsTable.status, status));
  const where = and(...conditions);

  const [rows, totalRows] = await Promise.all([
    db.select({
      id: shipmentsTable.id, shipmentNumber: shipmentsTable.shipmentNumber,
      trackingNumber: shipmentsTable.trackingNumber, receiverName: shipmentsTable.receiverName,
      receiverPhone: shipmentsTable.receiverPhone, receiverCity: shipmentsTable.receiverCity,
      receiverAddress: shipmentsTable.receiverAddress,
      status: shipmentsTable.status, codAmount: shipmentsTable.codAmount,
      shippingFee: shipmentsTable.shippingFee,
      createdAt: shipmentsTable.createdAt, actualDelivery: shipmentsTable.actualDelivery,
      returnReason: shipmentsTable.returnReason, zoneName: shipmentZonesTable.name,
      collectedAmount: shipmentsTable.collectedAmount, totalAmount: shipmentsTable.totalAmount,
      partialQuantity: shipmentsTable.partialQuantity, notes: shipmentsTable.notes,
      isUrgent: shipmentsTable.isUrgent, urgentNote: shipmentsTable.urgentNote,
    })
      .from(shipmentsTable)
      .leftJoin(shipmentZonesTable, eq(shipmentsTable.zoneId, shipmentZonesTable.id))
      .where(where).orderBy(desc(shipmentsTable.createdAt)).limit(limit).offset(offset),
    db.select({ cnt: count() }).from(shipmentsTable).where(where).then(r => r[0]?.cnt ?? 0),
  ]);

  // ─── جلب حالة الاستعجال (isUrgent/urgentNote) من آخر manifest item لكل شحنة ───
  const rowIds = rows.map(r => r.id);
  const urgentMap = new Map<number, { isUrgent: boolean; urgentNote: string | null }>();
  if (rowIds.length) {
    const urgentItems = await db.select({
      shipmentId: shipmentManifestItemsTable.shipmentId,
      isUrgent:   shipmentManifestItemsTable.isUrgent,
      urgentNote: shipmentManifestItemsTable.urgentNote,
      id:         shipmentManifestItemsTable.id,
    })
      .from(shipmentManifestItemsTable)
      .where(inArray(shipmentManifestItemsTable.shipmentId, rowIds))
      .orderBy(desc(shipmentManifestItemsTable.id));
    // خد أحدث item بس لكل shipmentId (الصفوف جاية مرتبة desc)
    for (const it of urgentItems) {
      if (!urgentMap.has(it.shipmentId)) {
        urgentMap.set(it.shipmentId, { isUrgent: it.isUrgent === 1, urgentNote: it.urgentNote ?? null });
      }
    }
  }
  // ─── جلب بنود الشحنة (المنتجات/الأصناف والكمية) لكل الشحنات دفعة واحدة ───
  const itemsMap = new Map<number, { product: string | null; color: string | null; size: string | null; quantity: number }[]>();
  if (rowIds.length) {
    const items = await db.select({
      shipmentId: shipmentItemsTable.shipmentId,
      product:    shipmentItemsTable.product,
      color:      shipmentItemsTable.color,
      size:       shipmentItemsTable.size,
      quantity:   shipmentItemsTable.quantity,
    })
      .from(shipmentItemsTable)
      .where(inArray(shipmentItemsTable.shipmentId, rowIds));
    for (const it of items) {
      if (!itemsMap.has(it.shipmentId)) itemsMap.set(it.shipmentId, []);
      itemsMap.get(it.shipmentId)!.push({ product: it.product, color: it.color, size: it.size, quantity: it.quantity });
    }
  }

  const rowsWithUrgent = rows.map(r => ({
    ...r,
    // أولوية لقيمة الاستعجال على مستوى الشحنة نفسها، مع fallback على آخر بيان (لو قديمة)
    isUrgent:   r.isUrgent === 1 || (urgentMap.get(r.id)?.isUrgent ?? false),
    urgentNote: r.urgentNote ?? urgentMap.get(r.id)?.urgentNote ?? null,
    items:      itemsMap.get(r.id) ?? [],
  }));

  await logAudit({ action: "login", entityType: "representative_view", entityId: companyId,
    entityName: `shipments-page=${page}`, userId: user.id, userName: user.displayName });

  res.json({ data: rowsWithUrgent, total: Number(totalRows), page, limit });
});

// ─── GET /representative/dashboard ───────────────────────────────────────────
router.get("/dashboard", requireRepresentativeOrAdmin, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const companyId = user.role === "representative"
    ? user.shippingCompanyId
    : req.query.companyId ? parseInt(req.query.companyId as string) : null;
  if (!companyId) { res.status(400).json({ error: "companyId مطلوب" }); return; }

  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo   = req.query.dateTo as string | undefined;
  const shipmentIds2 = await getShipmentIdsByCompany(companyId);

  // ─── إجمالي المحصل / المطلوب المتبقي — مبنيين على البيان المفتوح الحالي بس ───
  // (نفس منطق "الرصيد الحالي" في /wallet بالظبط، عشان الكارتين يطابقوا بعض تمامًا)
  const [openManifest] = await db.select().from(shipmentManifestsTable)
    .where(and(eq(shipmentManifestsTable.shippingCompanyId, companyId), eq(shipmentManifestsTable.status, "open")));
  let openManifestCollected = 0;
  let openManifestPending = 0;
  if (openManifest) {
    const openItems = await db.select().from(shipmentManifestItemsTable)
      .where(eq(shipmentManifestItemsTable.manifestId, openManifest.id));
    openManifestCollected = (await computeManifestNetDue(openManifest, openItems)).net;
    const openShipmentIds = openItems.map(i => i.shipmentId);
    if (openShipmentIds.length) {
      const openShipments = await db.select({ status: shipmentsTable.status, codAmount: shipmentsTable.codAmount, totalAmount: shipmentsTable.totalAmount, shippingFee: shipmentsTable.shippingFee })
        .from(shipmentsTable).where(inArray(shipmentsTable.id, openShipmentIds));
      // القيمة الكاملة المطلوب تحصيلها = totalAmount (codAmount + shippingFee)، مش
      // codAmount لوحده — نفس totalPrice المستخدم في الفرونت (عمود "إجمالي" بالجدول).
      openManifestPending = openShipments
        .filter(s => !["delivered", "partial_received", "returned", "cancelled"].includes(s.status))
        .reduce((sum, s) => sum + Number((s as any).totalAmount ?? (Number(s.codAmount ?? 0) + Number((s as any).shippingFee ?? 0))), 0);
    }
  }

  if (!shipmentIds2.length) {
    res.json({ total: 0, delivered: 0, partial: 0, returned: 0, inProgress: 0, deliveryRate: 0, returnRate: 0, totalCollected: 0, openManifestCollected, openManifestPending, zones: [], topZone: null, lastLogin: null, ratingsAvg: null, ratingsCount: 0, recentRatings: [], highReturnRisk: false });
    return;
  }
  const conditions: any[] = [inArray(shipmentsTable.id, shipmentIds2), isNull(shipmentsTable.deletedAt)];
  if (dateFrom) conditions.push(sql`${shipmentsTable.createdAt} >= ${new Date(dateFrom)}`);
  if (dateTo)   conditions.push(sql`${shipmentsTable.createdAt} <= ${new Date(dateTo + "T23:59:59")}`);

  const all = await db.select({
    status: shipmentsTable.status, receiverCity: shipmentsTable.receiverCity,
    zoneName: shipmentZonesTable.name, codAmount: shipmentsTable.codAmount,
    collectedAmount: shipmentsTable.collectedAmount,
  })
    .from(shipmentsTable)
    .leftJoin(shipmentZonesTable, eq(shipmentsTable.zoneId, shipmentZonesTable.id))
    .where(and(...conditions));

  const total      = all.length;
  const delivered  = all.filter(s => s.status === "delivered").length;
  const partial    = all.filter(s => s.status === "partial_received").length;
  const returned   = all.filter(s => s.status === "returned").length;
  const inProgress = all.filter(s => !["delivered","returned","cancelled","partial_received"].includes(s.status)).length;
  const deliveryRate = total > 0 ? Math.round(((delivered + partial) / total) * 100) : 0;
  const returnRate   = total > 0 ? Math.round((returned / total) * 100) : 0;
  // المحصّل الفعلي: يشمل التسليم الكامل والاستلام الجزئي، ويعتمد على collectedAmount (المبلغ الفعلي)
  // مع fallback على codAmount لو collectedAmount مش متسجل
  const totalCollected = all
    .filter(s => s.status === "delivered" || s.status === "partial_received")
    .reduce((sum, s) => sum + (Number(s.collectedAmount) > 0 ? Number(s.collectedAmount) : Number(s.codAmount ?? 0)), 0);

  const zoneMap = new Map<string, number>();
  for (const s of all) {
    const zone = s.zoneName || s.receiverCity || "غير محدد";
    zoneMap.set(zone, (zoneMap.get(zone) ?? 0) + 1);
  }
  const zones = Array.from(zoneMap.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);

  const [lastLogin] = await db.select({ createdAt: auditLogsTable.createdAt })
    .from(auditLogsTable)
    .where(and(eq(auditLogsTable.userId, user.id), eq(auditLogsTable.action, "login")))
    .orderBy(desc(auditLogsTable.createdAt)).limit(1);

  // ─── تقييمات العملاء ──────────────────────────────────────────────────────
  const ratingRows = await db.select({
      rating:       shipmentRatingsTable.rating,
      comment:      shipmentRatingsTable.comment,
      createdAt:    shipmentRatingsTable.createdAt,
      receiverName: shipmentsTable.receiverName,
    })
    .from(shipmentRatingsTable)
    .innerJoin(shipmentsTable, eq(shipmentsTable.id, shipmentRatingsTable.shipmentId))
    .where(inArray(shipmentRatingsTable.shipmentId, shipmentIds2))
    .orderBy(desc(shipmentRatingsTable.createdAt))
    .limit(10);

  const ratingsAvg = ratingRows.length
    ? Math.round((ratingRows.reduce((sum, r) => sum + r.rating, 0) / ratingRows.length) * 10) / 10
    : null;

  res.json({ total, delivered, partial, returned, inProgress, deliveryRate, returnRate,
    totalCollected, openManifestCollected, openManifestPending,
    zones, topZone: zones[0] ?? null, lastLogin: lastLogin?.createdAt ?? null,
    ratingsAvg, ratingsCount: ratingRows.length, recentRatings: ratingRows,
    highReturnRisk: total >= 5 && returnRate > 30 });
});

// ─── GET /representative/today-tasks — مهام اليوم للمندوب ───────────────────
router.get("/today-tasks", requireRepresentativeOrAdmin, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const companyId = user.role === "representative"
    ? user.shippingCompanyId
    : req.query.companyId ? parseInt(req.query.companyId as string) : null;
  if (!companyId) { res.status(400).json({ error: "companyId مطلوب" }); return; }

  // جيب كل البيانات المفتوحة للشركة
  const manifests = await db.select({ id: shipmentManifestsTable.id })
    .from(shipmentManifestsTable)
    .where(and(
      eq(shipmentManifestsTable.shippingCompanyId, companyId),
      eq(shipmentManifestsTable.status, "open"),
    ));

  if (!manifests.length) {
    res.json({ tasks: [], summary: { urgent: 0, outForDelivery: 0, pending: 0, total: 0 } });
    return;
  }

  const manifestIds = manifests.map(m => m.id);

  // جيب الـ items من البيانات المفتوحة — الغير مسلمة ولا مرتجعة
  const activeDeliveryStatuses = ["pending", "delayed", "partial_delivered"];
  const items = await db.select({
    id:             shipmentManifestItemsTable.id,
    manifestId:     shipmentManifestItemsTable.manifestId,
    shipmentId:     shipmentManifestItemsTable.shipmentId,
    deliveryStatus: shipmentManifestItemsTable.deliveryStatus,
    // isUrgent/urgentNote أصبحوا على مستوى الشحنة نفسها (shipmentsTable) بعد التحديث الأخير
    // مع fallback على القيمة القديمة في shipment_manifest_items (لو الاستعجال اتسجل قبل التحديث)
    itemIsUrgent:   shipmentManifestItemsTable.isUrgent,
    itemUrgentNote: shipmentManifestItemsTable.urgentNote,
    urgentAt:       shipmentManifestItemsTable.urgentAt,
    addedAt:        shipmentManifestItemsTable.addedAt,
  })
    .from(shipmentManifestItemsTable)
    .where(and(
      inArray(shipmentManifestItemsTable.manifestId, manifestIds),
      inArray(shipmentManifestItemsTable.deliveryStatus, activeDeliveryStatuses),
    ))
    .orderBy(desc(shipmentManifestItemsTable.addedAt));

  // لو مفيش customerName column — جيب بيانات الشحنة من shipmentsTable
  const shipmentIds = [...new Set(items.map(i => i.shipmentId))];
  let shipmentMap = new Map<number, any>();
  if (shipmentIds.length > 0) {
    const shipments = await db.select({
      id: shipmentsTable.id,
      receiverName: shipmentsTable.receiverName,
      receiverPhone: shipmentsTable.receiverPhone,
      receiverCity: shipmentsTable.receiverCity,
      receiverAddress: shipmentsTable.receiverAddress,
      shipmentNumber: shipmentsTable.shipmentNumber,
      codAmount: shipmentsTable.codAmount,
      status: shipmentsTable.status,
      notes: shipmentsTable.notes,
      returnReason: shipmentsTable.returnReason,
      partialQuantity: shipmentsTable.partialQuantity,
      collectedAmount: shipmentsTable.collectedAmount,
      isUrgent: shipmentsTable.isUrgent,
      urgentNote: shipmentsTable.urgentNote,
    })
      .from(shipmentsTable)
      .where(inArray(shipmentsTable.id, shipmentIds));
    shipmentMap = new Map(shipments.map(s => [s.id, s]));
  }

  const tasks = items.map(item => {
    const sh = shipmentMap.get(item.shipmentId);
    return {
      id: item.shipmentId,
      manifestId: item.manifestId,
      deliveryStatus: item.deliveryStatus,
      // أولوية لقيمة الاستعجال على مستوى الشحنة نفسها، مع fallback على القيمة القديمة في البيان
      isUrgent: sh?.isUrgent === 1 || item.itemIsUrgent === 1,
      urgentNote: sh?.urgentNote ?? item.itemUrgentNote ?? null,
      urgentAt: item.urgentAt ?? null,
      receiverName:    sh?.receiverName    ?? "",
      receiverPhone:   sh?.receiverPhone   ?? "",
      receiverCity:    sh?.receiverCity    ?? "",
      receiverAddress: sh?.receiverAddress ?? "",
      shipmentNumber:  sh?.shipmentNumber  ?? "",
      codAmount:      sh?.codAmount      ?? 0,
      status:           sh?.status           ?? item.deliveryStatus,
      notes:            sh?.notes            ?? null,
      returnReason:     sh?.returnReason      ?? null,
      partialQuantity:  sh?.partialQuantity   ?? null,
      collectedAmount:  sh?.collectedAmount   ?? null,
    };
  });

  // رتب: مستعجل أولاً → delayed → partial_delivered → pending
  const priority = (t: any) => {
    if (t.isUrgent) return 0;
    if (t.deliveryStatus === "delayed") return 1;
    if (t.deliveryStatus === "partial_delivered") return 2;
    return 3;
  };
  tasks.sort((a, b) => priority(a) - priority(b));

  const summary = {
    urgent:          tasks.filter(t => t.isUrgent).length,
    outForDelivery:  tasks.filter(t => !t.isUrgent && t.deliveryStatus === "pending").length,
    pending:         tasks.filter(t => !t.isUrgent && t.deliveryStatus !== "pending").length,
    total:           tasks.length,
  };

  res.json({ tasks, summary });
});

// ─── PATCH /representative/shipments/bulk-start-day — بدأت اليوم ─────────────
router.patch("/shipments/bulk-start-day", requireRepresentativeOrAdmin, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const companyId = user.role === "representative"
    ? user.shippingCompanyId
    : (req.body?.companyId ? parseInt(req.body.companyId) : null);
  if (!companyId) { res.status(400).json({ error: "companyId مطلوب" }); return; }

  // جيب البيانات المفتوحة
  const manifests = await db.select({ id: shipmentManifestsTable.id })
    .from(shipmentManifestsTable)
    .where(and(
      eq(shipmentManifestsTable.shippingCompanyId, companyId),
      eq(shipmentManifestsTable.status, "open"),
    ));

  if (!manifests.length) { res.json({ updated: 0 }); return; }
  const manifestIds = manifests.map(m => m.id);

  // غير حالة الـ items الـ pending فقط → delayed (لإظهارها كـ "في الطريق")
  // في الواقع نغير حالة الشحنات المقابلة في shipmentsTable
  const pendingItems = await db.select({ shipmentId: shipmentManifestItemsTable.shipmentId })
    .from(shipmentManifestItemsTable)
    .where(and(
      inArray(shipmentManifestItemsTable.manifestId, manifestIds),
      eq(shipmentManifestItemsTable.deliveryStatus, "pending"),
    ));

  if (!pendingItems.length) { res.json({ updated: 0 }); return; }

  const shipmentIds = [...new Set(pendingItems.map(i => i.shipmentId))];

  // غير حالة الشحنات في shipmentsTable لـ out_for_delivery
  const eligibleStatuses = ["waiting", "confirmed", "picked_up", "in_transit", "delayed"];
  const result = await db
    .update(shipmentsTable)
    .set({ status: "out_for_delivery", updatedAt: new Date() } as any)
    .where(and(
      inArray(shipmentsTable.id, shipmentIds),
      isNull(shipmentsTable.deletedAt),
      inArray(shipmentsTable.status, eligibleStatuses),
    ));

  await logAudit({
    action: "status_change",
    entityType: "shipment",
    entityId: companyId,
    entityName: `bulk-start-day-company-${companyId}`,
    userId: user.id,
    userName: user.displayName,
  });

  res.json({ updated: (result as any).affectedRows ?? shipmentIds.length });
});

// ─── GET /representative/admin/representatives — قائمة المناديب للأدمن ────────
router.get("/admin/representatives", async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  if (!["admin", "super_admin", "super-admin"].includes(user.role)) { res.status(403).json({ error: "غير مصرح" }); return; }

  const reps = await db.select({
    id: usersTable.id, username: usersTable.username, displayName: usersTable.displayName,
    isActive: usersTable.isActive, shippingCompanyId: (usersTable as any).shippingCompanyId,
    updatedAt: usersTable.updatedAt, avatar: usersTable.avatar,
  })
    .from(usersTable)
    .where(and(
      eq(usersTable.role, "representative"),
      user.tenantId ? eq(usersTable.tenantId, user.tenantId) : sql`1=1`,
    ));

  const result = await Promise.all(reps.map(async (rep) => {
    const companyId = rep.shippingCompanyId;
    if (!companyId) return { ...rep, company: null, stats: null, lastLogin: null };
    const [company] = await db.select({ id: shippingCompaniesTable.id, name: shippingCompaniesTable.name })
      .from(shippingCompaniesTable).where(eq(shippingCompaniesTable.id, companyId)).limit(1);
    const all = await db.select({ status: shipmentsTable.status })
      .from(shipmentsTable).where(and(eq(shipmentsTable.shippingCompanyId, companyId), isNull(shipmentsTable.deletedAt)));
    const total = all.length;
    const delivered = all.filter(s => s.status === "delivered").length;
    const partial   = all.filter(s => s.status === "partial_received").length;
    const returned  = all.filter(s => s.status === "returned").length;
    const deliveryRate = total > 0 ? Math.round(((delivered + partial) / total) * 100) : 0;
    const returnRate   = total > 0 ? Math.round((returned / total) * 100) : 0;
    const [lastLoginRow] = await db.select({ createdAt: auditLogsTable.createdAt })
      .from(auditLogsTable).where(and(eq(auditLogsTable.userId, rep.id), eq(auditLogsTable.action, "login")))
      .orderBy(desc(auditLogsTable.createdAt)).limit(1);
    return { ...rep, company: company ?? null,
      stats: { total, delivered, partial, returned, deliveryRate, returnRate, highReturnRisk: returnRate > 30 },
      lastLogin: lastLoginRow?.createdAt ?? null };
  }));
  res.json(result);
});

// ─── GET /representative/admin/representatives/:id/audit ─────────────────────
router.get("/admin/representatives/:id/audit", async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  if (!["admin", "super_admin", "super-admin"].includes(user.role)) { res.status(403).json({ error: "غير مصرح" }); return; }
  const repId = parseInt(req.params.id as string);
  if (isNaN(repId)) { res.status(400).json({ error: "ID غير صحيح" }); return; }
  const page = Math.max(1, parseInt((req.query.page as string) ?? "1"));
  const limit = 50; const offset = (page - 1) * limit;
  const [logs, total] = await Promise.all([
    db.select().from(auditLogsTable).where(eq(auditLogsTable.userId, repId))
      .orderBy(desc(auditLogsTable.createdAt)).limit(limit).offset(offset),
    db.select({ cnt: count() }).from(auditLogsTable).where(eq(auditLogsTable.userId, repId)).then(r => Number(r[0]?.cnt ?? 0)),
  ]);
  res.json({ data: logs, total, page, limit });
});

// ─── PATCH /representative/location — تحديث موقع المندوب الحالي (خريطة السير) ─
router.patch("/location", requireRepresentativeOrAdmin, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "representative") { res.status(403).json({ error: "متاح للمناديب فقط" }); return; }

  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    res.status(400).json({ error: "إحداثيات غير صحيحة" });
    return;
  }

  await db.update(usersTable)
    .set({ lastLat: String(lat), lastLng: String(lng), lastLocationAt: new Date() } as any)
    .where(eq(usersTable.id, user.id));

  res.json({ ok: true });
});

// ─── GET /representative/location — آخر موقع معروف للمندوب الحالي ────────────
router.get("/location", requireRepresentativeOrAdmin, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  if (user.role !== "representative") { res.status(403).json({ error: "متاح للمناديب فقط" }); return; }

  const [row] = await db.select({
    lastLat: usersTable.lastLat, lastLng: usersTable.lastLng, lastLocationAt: usersTable.lastLocationAt,
  }).from(usersTable).where(eq(usersTable.id, user.id)).limit(1);

  res.json({
    lat: row?.lastLat != null ? Number(row.lastLat) : null,
    lng: row?.lastLng != null ? Number(row.lastLng) : null,
    updatedAt: row?.lastLocationAt ?? null,
  });
});

// ─── GET /representative/wallet — سجل تصفيات محفظة المندوب ───────────────────
// كل صف = بيان اتقفل بواسطة المندوب نفسه، بالقيمة اللي اتصفّت وقتها.
// currentBalance = الرصيد الحالي المستحق من البيان المفتوح (لسه ما اتقفلش
// نهائيًا من الأدمن) — بنفس منطق computeManifestNetDue بالظبط. بيفضل الرقم
// ده ظاهر هنا لحد ما الأدمن يقفل البيان، وقتها يتصفر تلقائيًا ويتحول لصف
// جديد في الأرشيف تحت (transactions).
router.get("/wallet", requireRepresentativeOrAdmin, async (req: Request, res: Response): Promise<void> => {
  const user = (req as any).user;
  const targetUserId = user.role === "representative"
    ? user.id
    : req.query.userId ? parseInt(req.query.userId as string) : null;
  if (!targetUserId) { res.status(400).json({ error: "userId مطلوب" }); return; }

  const rows = await db.select()
    .from(representativeWalletTransactionsTable)
    .where(eq(representativeWalletTransactionsTable.representativeUserId, targetUserId))
    .orderBy(desc(representativeWalletTransactionsTable.createdAt))
    .limit(100);

  const totalSettled = rows.reduce((sum, r) => sum + Number(r.amount ?? 0), 0);

  // ─── الرصيد الحالي (غير المُقفل نهائيًا بعد) ───────────────────────────────
  let currentBalance = 0;
  const companyId = user.role === "representative"
    ? user.shippingCompanyId
    : req.query.companyId ? parseInt(req.query.companyId as string) : null;
  if (companyId) {
    // البيانات اللي لسه "مفتوحة فعليًا" من وجهة نظر الأدمن (status="open")
    // — سواء لسه ما اتلمسش خالص، أو المندوب قفلها مؤقتًا (closedByRole="representative")
    // وبيستنى تأكيد الأدمن. لما الأدمن يقفلها فعليًا (status="closed") بيتم
    // الترحيل للخزنة وتتسجل كتصفية، فمابقتش من ضمن الحساب هنا.
    const openManifests = await db.select()
      .from(shipmentManifestsTable)
      .where(and(
        eq(shipmentManifestsTable.shippingCompanyId, companyId),
        eq(shipmentManifestsTable.status, "open"),
      ));
    for (const manifest of openManifests) {
      const items = await db.select().from(shipmentManifestItemsTable)
        .where(eq(shipmentManifestItemsTable.manifestId, manifest.id));
      const netDue = await computeManifestNetDue(manifest, items);
      currentBalance += netDue.net;
    }
  }

  res.json({
    transactions: rows.map(r => ({ ...r, amount: Number(r.amount) })),
    totalSettled,
    currentBalance,
  });
});

export default router;
