import { Router } from "express";
import { db, clientsTable, saleOrdersTable, saleOrderItemsTable, shipmentsTable, warehousesTable } from "@workspace/db";
import { eq, desc, and, sql, or, like, isNull, inArray } from "drizzle-orm";
import { getTenantId } from "../middlewares/requireTenant.js";
import { z } from "zod";

const router = Router();

const ClientSchema = z.object({
  name:          z.string().min(1),
  phone:         z.string().nullish(),
  phone2:        z.string().nullish(),
  email:         z.string().nullish(),
  address:       z.string().nullish(),
  city:          z.string().nullish(),
  region:        z.string().nullish(),
  taxNumber:     z.string().nullish(),
  commercialReg: z.string().nullish(),
  paymentTerms:  z.string().nullish(),
  creditLimit:   z.number().default(0),
  notes:         z.string().nullish(),
  isActive:      z.boolean().default(true),
  avatar:        z.string().nullish(),
  clientType:    z.enum(["normal", "commercial", "vip"]).nullish(),
  warehouseId:   z.number().nullish(),
  defaultAdSource: z.string().nullish(),
  whatsappGroupLink: z.string().nullish(),
});

// ── حساب نوع العميل تلقائياً بناءً على عدد الشحنات الشهرية ────────────
function calcClientType(monthlyShipments: number): "normal" | "commercial" | "vip" {
  if (monthlyShipments >= 501) return "vip";
  if (monthlyShipments >= 201) return "commercial";
  return "normal";
}

// ── مساعد: تحديث إحصائيات العميل من أوامر البيع ────────────────────────────
async function syncClientStats(clientName: string, tenantId: number | null) {
  const conds: any[] = [eq(saleOrdersTable.clientName, clientName)];
  if (tenantId !== null) conds.push(eq(saleOrdersTable.tenantId, tenantId));

  const orders = await db.select({
    totalAmount:   saleOrdersTable.totalAmount,
    paidAmount:    saleOrdersTable.paidAmount,
    paymentStatus: saleOrdersTable.paymentStatus,
  }).from(saleOrdersTable).where(and(...conds));

  const totalOrders = orders.length;
  const totalSales  = orders.reduce((s, o) => s + parseFloat(o.totalAmount ?? "0"), 0);
  const totalPaid   = orders.reduce((s, o) => {
    const t = parseFloat(o.totalAmount ?? "0");
    const p = o.paymentStatus === "paid" ? t : parseFloat(o.paidAmount ?? "0");
    return s + p;
  }, 0);

  const clientConds: any[] = [eq(clientsTable.name, clientName)];
  if (tenantId !== null) clientConds.push(eq(clientsTable.tenantId, tenantId));

  await db.update(clientsTable).set({
    totalOrders,
    totalSales:  String(totalSales),
    totalPaid:   String(totalPaid),
    updatedAt:   new Date(),
  }).where(and(...clientConds));
}

// ── GET /finance/clients/for-shipment ── للاستخدام في نموذج إنشاء الشحنة فقط ──
router.get("/finance/clients/for-shipment", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const rows = await db
      .select({
        id:          clientsTable.id,
        name:        clientsTable.name,
        phone:       clientsTable.phone,
        phone2:      clientsTable.phone2,
        city:        clientsTable.city,
        region:      clientsTable.region,
        address:     clientsTable.address,
        warehouseId: clientsTable.warehouseId,
        avatar:      clientsTable.avatar,
        defaultAdSource: clientsTable.defaultAdSource,
      })
      .from(clientsTable)
      .where(
        tenantId !== null
          ? and(eq(clientsTable.tenantId, tenantId), eq(clientsTable.isActive, true))
          : eq(clientsTable.isActive, true)
      )
      .orderBy(clientsTable.name);
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /finance/clients ─────────────────────────────────────────────────────
router.get("/finance/clients", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { search, isActive } = req.query;

    const conds: any[] = [];
    if (tenantId !== null) conds.push(eq(clientsTable.tenantId, tenantId));
    if (isActive === "true")  conds.push(eq(clientsTable.isActive, true));
    if (isActive === "false") conds.push(eq(clientsTable.isActive, false));
    if (search) {
      const q = `%${search}%`;
      conds.push(or(
        like(clientsTable.name,  q),
        like(clientsTable.phone, q),
        like(clientsTable.email, q),
      ));
    }

    const clients = await db.select().from(clientsTable)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(clientsTable.createdAt));

    // جلب warehouse_id و region و whatsapp_group_link بـ raw SQL عشان Drizzle compiled schema مش شايلهم
    const ids = clients.map(c => c.id);
    let warehouseMap: Record<number, number | null> = {};
    let regionMap: Record<number, string | null> = {};
    let whatsappGroupLinkMap: Record<number, string | null> = {};
    if (ids.length) {
      const rows = await db.execute(sql`SELECT id, warehouse_id, region, whatsapp_group_link FROM clients WHERE id IN (${sql.join(ids.map(i => sql`${i}`), sql`, `)})`);
      const rowsArr: any[] = Array.isArray((rows as any)[0]) ? (rows as any)[0] : Array.isArray(rows) ? rows as any[] : [];
      for (const r of rowsArr) {
        warehouseMap[r.id] = r.warehouse_id ?? null;
        regionMap[r.id] = r.region ?? null;
        whatsappGroupLinkMap[r.id] = r.whatsapp_group_link ?? null;
      }
    }

    // حساب الإحصائيات live من شحنات العميل (shipments.clientId) — المصدر الفعلي للبيانات
    const shipConds: any[] = [isNull(shipmentsTable.deletedAt)];
    if (tenantId !== null) shipConds.push(eq(shipmentsTable.tenantId, tenantId));

    const allShipments = await db.select({
      clientId:        shipmentsTable.clientId,
      totalAmount:     shipmentsTable.totalAmount,
      collectedAmount: shipmentsTable.collectedAmount,
      status:          shipmentsTable.status,
    }).from(shipmentsTable)
      .where(and(...shipConds));

    // تجميع الأرقام لكل عميل حسب clientId — لا حاجة لمطابقة أسماء نصية
    const statsMap: Record<number, { totalOrders: number; totalSales: number; totalPaid: number }> = {};
    for (const s of allShipments) {
      if (s.clientId == null) continue;
      if (!statsMap[s.clientId]) statsMap[s.clientId] = { totalOrders: 0, totalSales: 0, totalPaid: 0 };
      const t = parseFloat(s.totalAmount ?? "0");
      const p = parseFloat(s.collectedAmount ?? "0");
      statsMap[s.clientId].totalOrders++;
      statsMap[s.clientId].totalSales += t;
      statsMap[s.clientId].totalPaid  += p;
    }

    const enriched = clients.map(c => {
      const s = statsMap[c.id] ?? { totalOrders: 0, totalSales: 0, totalPaid: 0 };
      return {
        ...c,
        warehouseId: warehouseMap[c.id] ?? null,
        region:      regionMap[c.id] ?? (c as any).region ?? null,
        whatsappGroupLink: whatsappGroupLinkMap[c.id] ?? (c as any).whatsappGroupLink ?? null,
        totalOrders: s.totalOrders,
        totalSales:  String(s.totalSales),
        totalPaid:   String(s.totalPaid),
      };
    });

    res.json(enriched);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /finance/clients/search?q=... (للـ autocomplete في نموذج البيع) ──────
router.get("/finance/clients/search", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const q = `%${req.query.q ?? ""}%`;

    const conds: any[] = [eq(clientsTable.isActive, true)];
    if (tenantId !== null) conds.push(eq(clientsTable.tenantId, tenantId));
    conds.push(or(like(clientsTable.name, q), like(clientsTable.phone, q)));

    const clients = await db.select({
      id: clientsTable.id, name: clientsTable.name,
      phone: clientsTable.phone, phone2: clientsTable.phone2,
      address: clientsTable.address, city: clientsTable.city,
      region: clientsTable.region, paymentTerms: clientsTable.paymentTerms,
      totalOrders: clientsTable.totalOrders, totalSales: clientsTable.totalSales,
    }).from(clientsTable)
      .where(and(...conds))
      .orderBy(clientsTable.name)
      .limit(10);

    res.json(clients);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /finance/clients/me — بيانات العميل المسجل حالياً ──────────────────
router.get("/finance/clients/me", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const user = (req as any).user;

    // نجيب العميل المرتبط بنفس الـ tenantId بتاع الـ user
    const conds: any[] = [];
    if (tenantId !== null) conds.push(eq(clientsTable.tenantId, tenantId));

    // نحاول نطابق باسم العرض أو رقم الهاتف أو الإيميل
    const [client] = await db.select().from(clientsTable)
      .where(conds.length ? and(...conds) : undefined as any)
      .limit(1);

    if (!client) {
      // لو مفيش عميل → نرجع بيانات الـ user نفسه كـ placeholder
      res.json({
        id: null,
        name: user?.displayName ?? "عميل",
        phone: user?.phone ?? null,
        email: user?.email ?? null,
        isActive: true,
        totalSales: "0",
        totalPaid: "0",
        totalOrders: 0,
        deliveryRate: 0,
        orders: [],
      });
      return;
    }

    const orderConds: any[] = [eq(saleOrdersTable.clientName, client.name)];
    if (tenantId !== null) orderConds.push(eq(saleOrdersTable.tenantId, tenantId));

    const orders = await db.select({
      id: saleOrdersTable.id, soNumber: saleOrdersTable.soNumber,
      status: saleOrdersTable.status, paymentStatus: saleOrdersTable.paymentStatus,
      totalAmount: saleOrdersTable.totalAmount, paidAmount: saleOrdersTable.paidAmount,
      createdAt: saleOrdersTable.createdAt, invoiceNumber: saleOrdersTable.soNumber,
    }).from(saleOrdersTable)
      .where(and(...orderConds))
      .orderBy(desc(saleOrdersTable.createdAt));

    const totalSales = orders.reduce((s, o) => s + parseFloat(o.totalAmount ?? "0"), 0);
    const totalPaid  = orders.reduce((s, o) => {
      const t = parseFloat(o.totalAmount ?? "0");
      const p = o.paymentStatus === "paid" ? t : parseFloat(o.paidAmount ?? "0");
      return s + p;
    }, 0);
    const totalOrders     = orders.length;
    const deliveredOrders = orders.filter(o => o.status === "delivered").length;
    const deliveryRate    = totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0;

    res.json({
      ...client,
      totalOrders,
      totalSales: String(totalSales),
      totalPaid:  String(totalPaid),
      deliveryRate,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /finance/clients/me/orders ──────────────────────────────────────────
router.get("/finance/clients/me/orders", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const conds: any[] = [];
    if (tenantId !== null) conds.push(eq(clientsTable.tenantId, tenantId));

    const [client] = await db.select({ name: clientsTable.name })
      .from(clientsTable)
      .where(conds.length ? and(...conds) : undefined as any)
      .limit(1);

    if (!client) { res.json([]); return; }

    const orderConds: any[] = [eq(saleOrdersTable.clientName, client.name)];
    if (tenantId !== null) orderConds.push(eq(saleOrdersTable.tenantId, tenantId));

    const orders = await db.select().from(saleOrdersTable)
      .where(and(...orderConds))
      .orderBy(desc(saleOrdersTable.createdAt));

    res.json(orders);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /finance/clients/:id ─────────────────────────────────────────────────
router.get("/finance/clients/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);

    const conds: any[] = [eq(clientsTable.id, id)];
    if (tenantId !== null) conds.push(eq(clientsTable.tenantId, tenantId));

    const [client] = await db.select().from(clientsTable).where(and(...conds));
    if (!client) { res.status(404).json({ error: "العميل غير موجود" }); return; }

    // جلب warehouse_id و whatsapp_group_link بـ raw SQL
    const [[whRow]] = await db.execute(sql`SELECT warehouse_id, whatsapp_group_link FROM clients WHERE id = ${id}`) as any;
    const warehouseId = whRow?.warehouse_id ?? null;
    const whatsappGroupLink = whRow?.whatsapp_group_link ?? null;

    // جلب أوامر البيع المرتبطة
    const orderConds: any[] = [eq(saleOrdersTable.clientName, client.name)];
    if (tenantId !== null) orderConds.push(eq(saleOrdersTable.tenantId, tenantId));

    const orders = await db.select({
      id: saleOrdersTable.id, soNumber: saleOrdersTable.soNumber,
      status: saleOrdersTable.status, paymentStatus: saleOrdersTable.paymentStatus,
      totalAmount: saleOrdersTable.totalAmount, paidAmount: saleOrdersTable.paidAmount,
      createdAt: saleOrdersTable.createdAt, expectedDate: saleOrdersTable.expectedDate,
    }).from(saleOrdersTable)
      .where(and(...orderConds))
      .orderBy(desc(saleOrdersTable.createdAt));

    // ✅ حساب الإحصائيات live من الفواتير الفعلية (مش من الـ DB المخزّن)
    const totalSales = orders.reduce((s, o) => s + parseFloat(o.totalAmount ?? "0"), 0);
    const totalPaid  = orders.reduce((s, o) => {
      const t = parseFloat(o.totalAmount ?? "0");
      const p = o.paymentStatus === "paid" ? t : parseFloat(o.paidAmount ?? "0");
      return s + p;
    }, 0);
    const totalOrders     = orders.length;
    const deliveredOrders = orders.filter(o => o.status === "delivered").length;
    const deliveryRate    = totalOrders > 0 ? Math.round((deliveredOrders / totalOrders) * 100) : 0;

    res.json({
      ...client,
      warehouseId,
      whatsappGroupLink,
      totalOrders,
      totalSales:   String(totalSales),
      totalPaid:    String(totalPaid),
      deliveryRate,
      orders,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /finance/clients/:id/statement ──────────────────────────────────────
router.get("/finance/clients/:id/statement", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);

    const conds: any[] = [eq(clientsTable.id, id)];
    if (tenantId !== null) conds.push(eq(clientsTable.tenantId, tenantId));

    const [client] = await db.select().from(clientsTable).where(and(...conds));
    if (!client) { res.status(404).json({ error: "العميل غير موجود" }); return; }

    const orderConds: any[] = [eq(saleOrdersTable.clientName, client.name)];
    if (tenantId !== null) orderConds.push(eq(saleOrdersTable.tenantId, tenantId));
    if (req.query.from) orderConds.push(sql`${saleOrdersTable.createdAt} >= ${new Date(req.query.from as string)}`);
    if (req.query.to)   orderConds.push(sql`${saleOrdersTable.createdAt} <= ${new Date(req.query.to as string + "T23:59:59")}`);

    const orders = await db.select().from(saleOrdersTable)
      .where(and(...orderConds))
      .orderBy(desc(saleOrdersTable.createdAt));

    const totalAmount = orders.reduce((s, o) => s + parseFloat(o.totalAmount ?? "0"), 0);
    const totalPaid   = orders.reduce((s, o) => s + parseFloat(o.paidAmount  ?? "0"), 0);

    res.json({
      client,
      orders,
      summary: {
        totalOrders: orders.length,
        totalAmount,
        totalPaid,
        totalUnpaid: totalAmount - totalPaid,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /finance/clients ─────────────────────────────────────────────────────
router.post("/finance/clients", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const parsed = ClientSchema.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const now = new Date();
    // warehouseId و region و defaultAdSource و whatsappGroupLink يتفصلان لأن الـ compiled Drizzle schema على السيرفر ممكن مش يعرفهم — نضيفهم بـ raw SQL بعد الإنشاء
    const { warehouseId, region, defaultAdSource, whatsappGroupLink, ...restData } = parsed.data;
    const [result] = await db.insert(clientsTable).values({
      ...restData,
      creditLimit:  String(parsed.data.creditLimit ?? 0),
      totalOrders:  0,
      totalSales:   "0",
      totalPaid:    "0",
      createdAt: now, updatedAt: now,
      ...(tenantId !== null ? { tenantId } : {}),
    });

    const id = (result as any).insertId;
    if (warehouseId !== undefined) {
      await db.execute(sql`UPDATE clients SET warehouse_id = ${warehouseId ?? null} WHERE id = ${id}`);
    }
    if (region !== undefined) {
      await db.execute(sql`UPDATE clients SET region = ${region ?? null} WHERE id = ${id}`);
    }
    if (defaultAdSource !== undefined) {
      await db.execute(sql`UPDATE clients SET default_ad_source = ${defaultAdSource ?? null} WHERE id = ${id}`);
    }
    if (whatsappGroupLink !== undefined) {
      await db.execute(sql`UPDATE clients SET whatsapp_group_link = ${whatsappGroupLink ?? null} WHERE id = ${id}`);
    }

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    const [[whRow]] = await db.execute(sql`SELECT warehouse_id, default_ad_source, whatsapp_group_link FROM clients WHERE id = ${id}`) as any;
    res.status(201).json({ ...client, warehouseId: whRow?.warehouse_id ?? null, defaultAdSource: whRow?.default_ad_source ?? null, whatsappGroupLink: whRow?.whatsapp_group_link ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /finance/clients/:id ───────────────────────────────────────────────
router.patch("/finance/clients/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    const parsed = ClientSchema.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

    const updates: any = { ...parsed.data, updatedAt: new Date() };
    if (parsed.data.creditLimit !== undefined) updates.creditLimit = String(parsed.data.creditLimit);

    // warehouseId و region و defaultAdSource و whatsappGroupLink يحتاجان raw SQL عشان الـ compiled Drizzle schema ممكن مش فيه الـ columns
    const { warehouseId, region, defaultAdSource, whatsappGroupLink, ...rest } = updates;
    await db.update(clientsTable).set(rest).where(eq(clientsTable.id, id));
    if (warehouseId !== undefined) {
      await db.execute(sql`UPDATE clients SET warehouse_id = ${warehouseId ?? null} WHERE id = ${id}`);
    }
    if (region !== undefined) {
      await db.execute(sql`UPDATE clients SET region = ${region ?? null} WHERE id = ${id}`);
    }
    if (defaultAdSource !== undefined) {
      await db.execute(sql`UPDATE clients SET default_ad_source = ${defaultAdSource ?? null} WHERE id = ${id}`);
    }
    if (whatsappGroupLink !== undefined) {
      await db.execute(sql`UPDATE clients SET whatsapp_group_link = ${whatsappGroupLink ?? null} WHERE id = ${id}`);
    }

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!client) { res.status(404).json({ error: "العميل غير موجود" }); return; }

    // جلب warehouse_id و default_ad_source و whatsapp_group_link بـ raw SQL عشان نضمن رجوعهم في الـ response مهما كانت حالة الـ compiled schema
    const [[whRow]] = await db.execute(sql`SELECT warehouse_id, default_ad_source, whatsapp_group_link FROM clients WHERE id = ${id}`) as any;
    res.json({ ...client, warehouseId: whRow?.warehouse_id ?? null, defaultAdSource: whRow?.default_ad_source ?? null, whatsappGroupLink: whRow?.whatsapp_group_link ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PATCH /finance/clients/:id/sync ─ تحديث الإحصائيات يدوياً ──────────────
router.patch("/finance/clients/:id/sync", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!client) { res.status(404).json({ error: "العميل غير موجود" }); return; }

    await syncClientStats(client.name, tenantId);
    const [updated] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /finance/clients/:id ──────────────────────────────────────────────
router.delete("/finance/clients/:id", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);

    const conds: any[] = [eq(clientsTable.id, id)];
    if (tenantId !== null) conds.push(eq(clientsTable.tenantId, tenantId));

    const [client] = await db.select().from(clientsTable).where(and(...conds));
    if (!client) { res.status(404).json({ error: "العميل غير موجود" }); return; }

    // تحقق من وجود أوامر بيع مرتبطة
    const [hasOrders] = await db.select({ id: saleOrdersTable.id })
      .from(saleOrdersTable)
      .where(eq(saleOrdersTable.clientName, client.name))
      .limit(1);

    if (hasOrders) {
      res.status(400).json({ error: "لا يمكن حذف العميل — يوجد أوامر بيع مرتبطة به" });
      return;
    }

    await db.delete(clientsTable).where(and(...conds));
    res.status(204).send();
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /finance/clients/:id/top-products ────────────────────────────────────
router.get("/finance/clients/:id/top-products", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);

    const conds: any[] = [eq(clientsTable.id, id)];
    if (tenantId !== null) conds.push(eq(clientsTable.tenantId, tenantId));
    const [client] = await db.select({ name: clientsTable.name }).from(clientsTable).where(and(...conds));
    if (!client) { res.status(404).json({ error: "العميل غير موجود" }); return; }

    // جلب كل بنود أوامر البيع لهذا العميل عبر join
    const orderConds: any[] = [eq(saleOrdersTable.clientName, client.name)];
    if (tenantId !== null) orderConds.push(eq(saleOrdersTable.tenantId, tenantId));

    const items = await db
      .select({
        productName: saleOrderItemsTable.productName,
        quantity:    sql<number>`SUM(${saleOrderItemsTable.quantity})`,
        totalValue:  sql<number>`SUM(${saleOrderItemsTable.totalPrice})`,
      })
      .from(saleOrderItemsTable)
      .innerJoin(saleOrdersTable, eq(saleOrderItemsTable.saleOrderId, saleOrdersTable.id))
      .where(and(...orderConds))
      .groupBy(saleOrderItemsTable.productName)
      .orderBy(desc(sql`SUM(${saleOrderItemsTable.totalPrice})`))
      .limit(5);

    // حساب الإجمالي عشان نطلع النسبة
    const grandTotal = items.reduce((s, i) => s + Number(i.totalValue), 0);

    const result = items.map(i => ({
      productName: i.productName,
      quantity:    Number(i.quantity),
      totalValue:  Number(i.totalValue),
      percentage:  grandTotal > 0 ? Math.round((Number(i.totalValue) / grandTotal) * 100) : 0,
    }));

    res.json({ items: result, grandTotal });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /finance/clients/:id/shipments ──────────────────────────────────────
router.get("/finance/clients/:id/shipments", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);

    // جلب العميل عشان نعرف الاسم
    const conds: any[] = [eq(clientsTable.id, id)];
    if (tenantId !== null) conds.push(eq(clientsTable.tenantId, tenantId));
    const [client] = await db.select().from(clientsTable).where(and(...conds));
    if (!client) { res.status(404).json({ error: "العميل غير موجود" }); return; }

    // جلب الشحنات بالـ clientId أو بالاسم
    const shipConds: any[] = [];
    const idCond   = eq(shipmentsTable.clientId, id);
    const nameCond = eq(shipmentsTable.senderName, client.name);
    shipConds.push(or(idCond, nameCond)!);
    if (tenantId !== null) shipConds.push(eq(shipmentsTable.tenantId, tenantId));

    const shipments = await db.select({
      id:             shipmentsTable.id,
      shipmentNumber: shipmentsTable.shipmentNumber,
      status:         shipmentsTable.status,
      receiverName:   shipmentsTable.receiverName,
      receiverCity:   shipmentsTable.receiverCity,
      codAmount:      shipmentsTable.codAmount,
      shippingFee:    shipmentsTable.shippingFee,
      createdAt:      shipmentsTable.createdAt,
      pieces:         shipmentsTable.pieces,
    }).from(shipmentsTable)
      .where(and(...shipConds))
      .orderBy(desc(shipmentsTable.createdAt))
      .limit(200);

    res.json({ shipments, total: shipments.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /finance/clients-dashboard ── داشبورد شاملة لكل العملاء التجاريين ──
router.get("/finance/clients-dashboard", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);

    const clientConds: any[] = [];
    if (tenantId !== null) clientConds.push(eq(clientsTable.tenantId, tenantId));

    const clients = await db.select({
      id:     clientsTable.id,
      name:   clientsTable.name,
      phone:  clientsTable.phone,
      city:   clientsTable.city,
      avatar: clientsTable.avatar,
      isActive: clientsTable.isActive,
      createdAt: clientsTable.createdAt,
    }).from(clientsTable).where(clientConds.length ? and(...clientConds) : undefined);

    if (clients.length === 0) {
      res.json({
        totals: { clients: 0, active: 0, shipments: 0, delivered: 0, waiting: 0, inWarehouse: 0, delayed: 0, returned: 0, revenue: 0, collected: 0 },
        topClients: [], leastClients: [], statusBreakdown: [], clients: [],
      });
      return;
    }

    const clientIds = clients.map((c: any) => c.id);
    const clientNames = clients.map((c: any) => c.name);

    // جلب أسماء كل المخازن (لعرضها بدل الأرقام)
    const allWarehouses = await db.select({ id: warehousesTable.id, name: warehousesTable.name }).from(warehousesTable);
    const warehouseNameById = new Map<number, string>();
    for (const w of allWarehouses) warehouseNameById.set(w.id, w.name);

    const shipConds: any[] = [
      isNull(shipmentsTable.deletedAt),
      or(inArray(shipmentsTable.clientId, clientIds), inArray(shipmentsTable.senderName, clientNames))!,
    ];
    if (tenantId !== null) shipConds.push(eq(shipmentsTable.tenantId, tenantId));

    const shipments = await db.select({
      id:         shipmentsTable.id,
      clientId:   shipmentsTable.clientId,
      senderName: shipmentsTable.senderName,
      status:     shipmentsTable.status,
      totalAmount: shipmentsTable.totalAmount,
      collectedAmount: shipmentsTable.collectedAmount,
      warehouseId: shipmentsTable.warehouseId,
      inventoryDeducted: shipmentsTable.inventoryDeducted,
      inventoryReturned: shipmentsTable.inventoryReturned,
      createdAt:  shipmentsTable.createdAt,
    }).from(shipmentsTable).where(and(...shipConds));

    // ربط كل شحنة بالعميل: clientId أولاً، وإلا بالاسم (senderName)
    const nameToClientId = new Map<string, number>();
    for (const c of clients) nameToClientId.set(c.name, c.id);

    type Stat = {
      shipmentsCount: number; delivered: number; waiting: number; inWarehouse: number;
      delayed: number; returned: number; cancelled: number;
      totalAmount: number; collectedAmount: number; lastOrderAt: string | null;
      warehouseNames: Set<string>;
    };
    const statsByClientId = new Map<number, Stat>();
    const emptyStat = (): Stat => ({
      shipmentsCount: 0, delivered: 0, waiting: 0, inWarehouse: 0,
      delayed: 0, returned: 0, cancelled: 0, totalAmount: 0, collectedAmount: 0, lastOrderAt: null,
      warehouseNames: new Set<string>(),
    });

    // إحصائيات إجمالية
    const totals = {
      clients: clients.length, active: clients.filter((c: any) => c.isActive).length,
      shipments: 0, delivered: 0, waiting: 0, inWarehouse: 0, delayed: 0, returned: 0,
      revenue: 0, collected: 0,
    };

    for (const s of shipments) {
      const cid = s.clientId ?? nameToClientId.get(s.senderName);
      if (cid == null) continue;

      const stat = statsByClientId.get(cid) ?? emptyStat();
      stat.shipmentsCount++;
      const total = Number(s.totalAmount ?? 0);
      const collected = Number(s.collectedAmount ?? 0);
      stat.totalAmount += total;
      stat.collectedAmount += collected;
      if (!stat.lastOrderAt || new Date(s.createdAt) > new Date(stat.lastOrderAt)) stat.lastOrderAt = String(s.createdAt);

      // "قيد الشحن في المخزن" = لسه واقفة قبل ما تتحرك (انتظار/مؤكدة) وفيها مخزن مرتبط
      const isInWarehouse = (s.status === "waiting" || s.status === "confirmed") && s.warehouseId != null;

      if (s.warehouseId != null) {
        const whName = warehouseNameById.get(s.warehouseId);
        if (whName) stat.warehouseNames.add(whName);
      }

      if (s.status === "delivered")            { stat.delivered++; totals.delivered++; }
      else if (s.status === "delayed")         { stat.delayed++;  totals.delayed++; }
      else if (s.status === "returned")        { stat.returned++; totals.returned++; }
      else if (s.status === "cancelled")       { stat.cancelled++; }
      else if (isInWarehouse)                  { stat.inWarehouse++; totals.inWarehouse++; }
      else if (s.status === "waiting")         { stat.waiting++; totals.waiting++; }

      totals.shipments++;
      totals.revenue += total;
      totals.collected += collected;

      statsByClientId.set(cid, stat);
    }

    const enrichedClients = clients.map((c: any) => {
      const stat = statsByClientId.get(c.id) ?? emptyStat();
      const deliveryRate = stat.shipmentsCount > 0 ? Math.round((stat.delivered / stat.shipmentsCount) * 100) : 0;
      const warehouseNamesArr = Array.from(stat.warehouseNames);
      return {
        id: c.id, name: c.name, phone: c.phone, city: c.city, avatar: c.avatar, isActive: c.isActive,
        shipmentsCount: stat.shipmentsCount,
        delivered: stat.delivered, waiting: stat.waiting, inWarehouse: stat.inWarehouse,
        delayed: stat.delayed, returned: stat.returned, cancelled: stat.cancelled,
        totalAmount: stat.totalAmount, collectedAmount: stat.collectedAmount,
        deliveryRate, lastOrderAt: stat.lastOrderAt,
        warehouseName: warehouseNamesArr.length > 0 ? warehouseNamesArr.join("، ") : "بدون مخزن",
      };
    });

    // أفضل/أقل العملاء بناءً على إجمالي المبيعات (من عندهم شحنات فعلاً)
    const withShipments = enrichedClients.filter((c: any) => c.shipmentsCount > 0);
    const topClients = [...withShipments].sort((a, b) => b.totalAmount - a.totalAmount).slice(0, 5);
    const leastClients = [...withShipments].sort((a, b) => a.totalAmount - b.totalAmount).slice(0, 5);

    const statusBreakdown = [
      { status: "delivered",    label: "تم التسليم",        count: totals.delivered,    color: "#22C55E" },
      { status: "waiting",      label: "قيد الانتظار",       count: totals.waiting,      color: "#EAB308" },
      { status: "inWarehouse",  label: "قيد الشحن بالمخزن",  count: totals.inWarehouse,  color: "#F97316" },
      { status: "delayed",      label: "مؤجل",               count: totals.delayed,      color: "#3B82F6" },
      { status: "returned",     label: "مرتجع",              count: totals.returned,     color: "#EF4444" },
    ].map(s => ({ ...s, percentage: totals.shipments ? Math.round((s.count / totals.shipments) * 100) : 0 }));

    res.json({
      totals,
      topClients,
      leastClients,
      statusBreakdown,
      clients: enrichedClients.sort((a: any, b: any) => b.totalAmount - a.totalAmount),
    });
  } catch (err: any) {
    console.error("finance/clients-dashboard error:", err);
    res.status(500).json({ error: err.message });
  }
});

export { syncClientStats };
export default router;
