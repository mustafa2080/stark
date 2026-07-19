import { Router, type IRouter } from "express";
import { eq, desc, and, inArray, isNull, or } from "drizzle-orm";
import { db, shippingCompaniesTable, shippingManifestsTable, shippingManifestOrdersTable, ordersTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { getTenantId } from "../middlewares/requireTenant.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { hashPassword } from "../lib/auth.js";
import { logAudit } from "../lib/audit.js";

const router: IRouter = Router();
router.use(requireAuth);

const CreateSchema = z.object({
  name: z.string().min(1),
  phone: z.string().nullish(),
  website: z.string().nullish(),
  zoneId: z.number().int().nullish(),
  zoneIds: z.array(z.number().int()).nullish(),
  shippingCost: z.number().min(0).nullish(), // تكلفة الشحن لكل شحنة
  costMode:   z.enum(["rep", "zone"]).nullish(),  // "zone" = سعر الزون (من منطقة/مناطق تكلفة) | "rep" = سعر المندوب اليدوي
  zoneCostId: z.number().int().nullish(),         // (قديم) مرجع منطقة تكلفة واحدة
  zoneCostIds: z.array(z.number().int()).nullish(), // مناطق تكلفة متعددة عند اختيار "سعر الزون"
  notes: z.string().nullish(),
  logo: z.string().nullish(),
  isActive: z.boolean().default(true),
});

const UpdateSchema = CreateSchema.partial();

router.get("/shipping-companies", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  // tenantId === null يعني super_admin → يشوف كل الشركات بدون فلتر
  const where = tenantId !== null
    ? or(eq(shippingCompaniesTable.tenantId, tenantId), isNull(shippingCompaniesTable.tenantId))
    : undefined;
  const query = db.select().from(shippingCompaniesTable);
  const companies = where
    ? await query.where(where).orderBy(desc(shippingCompaniesTable.createdAt))
    : await query.orderBy(desc(shippingCompaniesTable.createdAt));
  res.json(companies);
});

router.post("/shipping-companies", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const now = new Date();
    now.setMilliseconds(0); // MySQL DATETIME لا يدعم milliseconds
    const insertResult = await db.insert(shippingCompaniesTable).values({
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      website: parsed.data.website ?? null,
      zoneId: parsed.data.zoneId ?? (parsed.data.zoneIds?.[0] ?? null),
      zoneIds: parsed.data.zoneIds?.length ? JSON.stringify(parsed.data.zoneIds) : null,
      shippingCost: parsed.data.shippingCost != null ? String(parsed.data.shippingCost) : null,
      costMode:   parsed.data.costMode ?? "zone",
      zoneCostId: parsed.data.zoneCostId ?? (parsed.data.zoneCostIds?.[0] ?? null),
      zoneCostIds: parsed.data.zoneCostIds?.length ? JSON.stringify(parsed.data.zoneCostIds) : null,
      notes: parsed.data.notes ?? null,
      logo: parsed.data.logo ?? null,
      isActive: parsed.data.isActive ?? true,
      ...(tenantId !== null ? { tenantId } : {}),
      createdAt: now,
    });
    const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
    const [company] = await db.select().from(shippingCompaniesTable).where(eq(shippingCompaniesTable.id, insertId));
    res.status(201).json(company);
  } catch (err: any) {
    console.error("[POST /shipping-companies] DB error:", err?.message ?? err);
    res.status(500).json({ error: err?.message ?? "Database error" });
  }
});


router.get("/shipping-companies/:id/stats", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  // Get all manifests for this company
  const manifests = await db.select().from(shippingManifestsTable)
    .where(eq(shippingManifestsTable.shippingCompanyId, id));

  const manifestCount = manifests.length;

  if (manifestCount === 0) {
    res.json({
      total: 0,
      delivered: 0,
      partial: 0,
      returned: 0,
      pending: 0,
      postponed: 0,
      deliveryRate: 0,
      totalRevenue: 0,
      totalCost: 0,
      totalShippingCost: 0,
      returnLosses: 0,
      netProfit: 0,
      deliveredGross: 0,
      manifestCount: 0,
    });
    return;
  }

  // البيان المفتوح (لو موجود)
  const openManifest = manifests.find(m => m.status === "open");
  const openManifestId = openManifest?.id ?? null;

  const manifestIds = manifests.map(m => m.id);

  // Get all orders in these manifests
  const links = await db
    .select({
      deliveryStatus: shippingManifestOrdersTable.deliveryStatus,
      partialQuantity: shippingManifestOrdersTable.partialQuantity,
      orderId: shippingManifestOrdersTable.orderId,
      manifestId: shippingManifestOrdersTable.manifestId,
    })
    .from(shippingManifestOrdersTable)
    .where(inArray(shippingManifestOrdersTable.manifestId, manifestIds));

  if (links.length === 0) {
    res.json({
      total: 0,
      delivered: 0,
      partial: 0,
      returned: 0,
      pending: 0,
      postponed: 0,
      deliveryRate: 0,
      totalRevenue: 0,
      totalCost: 0,
      totalShippingCost: 0,
      returnLosses: 0,
      netProfit: 0,
      deliveredGross: 0,
      manifestCount,
    });
    return;
  }

  const orderIds = links.map(l => l.orderId);
  const orders = await db.select().from(ordersTable).where(inArray(ordersTable.id, orderIds));
  const orderMap = new Map(orders.map(o => [o.id, o]));

  // ─── حساب "البيان الحالي" = عدد الفواتير الفريدة الـ pending/postponed في البيان المفتوح ─
  let postponed = 0;
  if (openManifestId) {
    const openLinks = links.filter(
      l => l.manifestId === openManifestId &&
        (l.deliveryStatus === "pending" || l.deliveryStatus === "postponed")
    );
    // عدّ الفواتير الفريدة (invoiceNumber) بدل عدد الطلبات الفردية
    const uniqueInvoices = new Set<string>();
    for (const link of openLinks) {
      const order = orderMap.get(link.orderId);
      if (!order) continue;
      const key = order.invoiceNumber?.trim() || `solo-${order.id}`;
      uniqueInvoices.add(key);
    }
    postponed = uniqueInvoices.size;
  }

  // ─── تجميع الطلبات بنفس invoiceNumber في فاتورة واحدة (لكل البيانات) ───
  const invoiceMap = new Map<string, { status: string; orders: typeof orders[0][] }>();
  for (const link of links) {
    const order = orderMap.get(link.orderId);
    if (!order) continue;
    const key = order.invoiceNumber?.trim() || `solo-${order.id}`;
    if (!invoiceMap.has(key)) {
      invoiceMap.set(key, { status: link.deliveryStatus, orders: [order] });
    } else {
      invoiceMap.get(key)!.orders.push(order);
      const cur = invoiceMap.get(key)!.status;
      const s = link.deliveryStatus;
      if (s === "postponed" || cur === "postponed") {
        invoiceMap.get(key)!.status = "postponed";
      } else if (s !== "delivered" && s !== "partial_received") {
        invoiceMap.get(key)!.status = s;
      }
    }
  }

  let delivered = 0, returned = 0, partial = 0, pending = 0;
  let totalRevenue = 0, totalCost = 0, totalShipping = 0, returnLosses = 0;

  for (const [, invoice] of invoiceMap) {
    const status = invoice.status;
    for (const order of invoice.orders) {
      const qty      = order.quantity;
      const shipping = order.shippingCost ?? 0;
      totalShipping += shipping;

      if (status === "delivered") {
        // تسليم كامل → إيراد كامل
        totalRevenue += order.totalPrice;
        totalCost    += (order.costPrice ?? 0) * qty;
      } else if (status === "partial_received") {
        // استلام جزئي → إيراد على القطع اللي اتستلمت فعلاً فقط
        const deliveredQty = (order as any).partialQuantity != null ? Number((order as any).partialQuantity) : 0;
        if (deliveredQty > 0) {
          totalRevenue += (order.unitPrice ?? 0) * deliveredQty;
          totalCost    += (order.costPrice ?? 0) * deliveredQty;
        }
        // الجزء الباقي رجع مخزن = لا إيراد ولا خسارة شحن
      } else if (status === "returned") {
        // مرتجع كامل → خسارة شحن فقط
        returnLosses += shipping;
      }
    }
    if (status === "delivered")        delivered++;
    else if (status === "partial_received") partial++;
    else if (status === "returned")    returned++;
    else if (status === "pending")     pending++;
    // postponed محسوب مسبقاً من البيان المفتوح فقط
  }

  const total = delivered + partial + returned + postponed + pending;
  const deliveryRate = total > 0 ? Math.round(((delivered + partial) / total) * 100) : 0;
  const netProfit = totalRevenue - totalCost - totalShipping - returnLosses;
  res.json({
    total,
    delivered,
    partial,
    returned,
    pending,
    postponed,
    deliveryRate,
    totalRevenue,
    totalCost,
    totalShippingCost: totalShipping,
    returnLosses,
    netProfit,
    deliveredGross: totalRevenue,
    manifestCount,
  });
});

router.patch("/shipping-companies/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const parsed = UpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  // بناء الـ update payload مع دعم zoneIds
  const updatePayload: Record<string, any> = { ...parsed.data };
  if (parsed.data.zoneIds !== undefined) {
    updatePayload.zoneIds = parsed.data.zoneIds?.length ? JSON.stringify(parsed.data.zoneIds) : null;
    if (!('zoneId' in parsed.data)) {
      updatePayload.zoneId = parsed.data.zoneIds?.[0] ?? null;
    }
  }
  if (parsed.data.zoneCostIds !== undefined) {
    updatePayload.zoneCostIds = parsed.data.zoneCostIds?.length ? JSON.stringify(parsed.data.zoneCostIds) : null;
    if (!('zoneCostId' in parsed.data)) {
      updatePayload.zoneCostId = parsed.data.zoneCostIds?.[0] ?? null;
    }
  }
  if (parsed.data.shippingCost !== undefined) {
    updatePayload.shippingCost = parsed.data.shippingCost != null ? String(parsed.data.shippingCost) : null;
  }

  await db.update(shippingCompaniesTable).set(updatePayload).where(eq(shippingCompaniesTable.id, id));
  const [company] = await db.select().from(shippingCompaniesTable).where(eq(shippingCompaniesTable.id, id));
  if (!company) { res.status(404).json({ error: "Company not found" }); return; }
  res.json(company);
});

router.delete("/shipping-companies/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [toDelete] = await db.select().from(shippingCompaniesTable).where(eq(shippingCompaniesTable.id, id));
  if (!toDelete) { res.status(404).json({ error: "Company not found" }); return; }
  await db.delete(shippingCompaniesTable).where(eq(shippingCompaniesTable.id, id));
  res.status(204).send();
});

// ─── POST /shipping-companies/:id/representative — إنشاء/تحديث حساب مندوب ───
const RepSchema = z.object({
  username: z.string().min(3).regex(/^[a-z0-9_]+$/, "أحرف إنجليزية صغيرة وأرقام وـ فقط"),
  password: z.string().min(6).optional(), // اختياري عند التحديث
  displayName: z.string().min(1).optional(),
});

router.post("/shipping-companies/:id/representative", async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (!["admin", "super_admin", "super-admin"].includes(user?.role)) {
    res.status(403).json({ error: "غير مصرح" }); return;
  }
  const companyId = parseInt(req.params.id);
  if (isNaN(companyId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [company] = await db.select().from(shippingCompaniesTable).where(eq(shippingCompaniesTable.id, companyId)).limit(1);
  if (!company) { res.status(404).json({ error: "شركة الشحن غير موجودة" }); return; }

  const parsed = RepSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const { username, password, displayName } = parsed.data;

  // هل فيه مندوب مرتبط بالشركة دي بالفعل؟
  const [existing] = await db.select().from(usersTable)
    .where(eq((usersTable as any).shippingCompanyId, companyId)).limit(1);

  if (existing) {
    // تحديث: نحدّث الباسورد لو اتبعت، واليوزرنيم لو اتغير
    const updates: Record<string, any> = { updatedAt: new Date() };
    if (password) updates.passwordHash = await hashPassword(password);
    if (displayName) updates.displayName = displayName;
    // username: نتحقق من التفرد لو اتغير
    if (username && username !== existing.username) {
      const [dup] = await db.select({ id: usersTable.id }).from(usersTable)
        .where(eq(usersTable.username, username)).limit(1);
      if (dup) { res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل" }); return; }
      updates.username = username;
    }
    await db.update(usersTable).set(updates).where(eq(usersTable.id, existing.id));
    const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, existing.id)).limit(1);
    const { passwordHash: _, ...safe } = updated as any;
    await logAudit({ action: "update", entityType: "representative", entityId: existing.id,
      entityName: updated.displayName, userId: user.id, userName: user.displayName });
    res.json({ user: safe, created: false });
    return;
  }

  // إنشاء جديد
  if (!password) { res.status(400).json({ error: "كلمة المرور مطلوبة عند إنشاء حساب جديد" }); return; }
  const [dup] = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.username, username)).limit(1);
  if (dup) { res.status(409).json({ error: "اسم المستخدم مستخدم بالفعل" }); return; }

  const passwordHash = await hashPassword(password);
  const [result] = await db.insert(usersTable).values({
    username,
    passwordHash,
    displayName: displayName ?? company.name,
    role: "representative",
    tenantId: company.tenantId ?? user.tenantId ?? null,
    permissions: JSON.stringify([]),
    isActive: true,
    shippingCompanyId: companyId,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any);
  const newId = (result as any).insertId as number;
  const [newUser] = await db.select().from(usersTable).where(eq(usersTable.id, newId)).limit(1);
  const { passwordHash: _, ...safe } = newUser as any;

  await logAudit({ action: "create", entityType: "representative", entityId: newId,
    entityName: newUser.displayName, userId: user.id, userName: user.displayName });

  res.status(201).json({ user: safe, created: true });
});

// ─── GET /shipping-companies/:id/representative — بيانات حساب المندوب ────────
router.get("/shipping-companies/:id/representative", async (req, res): Promise<void> => {
  const user = (req as any).user;
  if (!["admin", "super_admin", "super-admin"].includes(user?.role)) {
    res.status(403).json({ error: "غير مصرح" }); return;
  }
  const companyId = parseInt(req.params.id);
  if (isNaN(companyId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [rep] = await db.select().from(usersTable)
    .where(eq((usersTable as any).shippingCompanyId, companyId)).limit(1);
  if (!rep) { res.status(404).json({ error: "لا يوجد حساب مندوب لهذه الشركة" }); return; }

  const { passwordHash: _, ...safe } = rep as any;
  res.json(safe);
});

export default router;
