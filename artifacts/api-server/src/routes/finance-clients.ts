import { Router } from "express";
import { db, clientsTable, saleOrdersTable, saleOrderItemsTable, shipmentsTable } from "@workspace/db";
import { eq, desc, and, sql, or, like } from "drizzle-orm";
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

    // جلب warehouse_id بـ raw SQL عشان Drizzle compiled schema مش شايله
    const ids = clients.map(c => c.id);
    let warehouseMap: Record<number, number | null> = {};
    if (ids.length) {
      const rows = await db.execute(sql`SELECT id, warehouse_id FROM clients WHERE id IN (${sql.join(ids.map(i => sql`${i}`), sql`, `)})`);
      for (const r of (rows as any)[0] ?? []) warehouseMap[r.id] = r.warehouse_id ?? null;
    }

    // حساب الإحصائيات live من أوامر البيع لكل عميل
    const orderConds: any[] = [];
    if (tenantId !== null) orderConds.push(eq(saleOrdersTable.tenantId, tenantId));

    const allOrders = await db.select({
      clientName:    saleOrdersTable.clientName,
      totalAmount:   saleOrdersTable.totalAmount,
      paidAmount:    saleOrdersTable.paidAmount,
      paymentStatus: saleOrdersTable.paymentStatus,
    }).from(saleOrdersTable)
      .where(orderConds.length ? and(...orderConds) : undefined);

    // تجميع الأرقام لكل عميل — يراعي paymentStatus
    const statsMap: Record<string, { totalOrders: number; totalSales: number; totalPaid: number }> = {};
    for (const o of allOrders) {
      const name = o.clientName ?? "";
      if (!statsMap[name]) statsMap[name] = { totalOrders: 0, totalSales: 0, totalPaid: 0 };
      const t = parseFloat(o.totalAmount ?? "0");
      const p = o.paymentStatus === "paid" ? t : parseFloat(o.paidAmount ?? "0");
      statsMap[name].totalOrders++;
      statsMap[name].totalSales += t;
      statsMap[name].totalPaid  += p;
    }

    const enriched = clients.map(c => {
      const s = statsMap[c.name] ?? { totalOrders: 0, totalSales: 0, totalPaid: 0 };
      return {
        ...c,
        warehouseId: warehouseMap[c.id] ?? null,
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

    // جلب warehouse_id بـ raw SQL
    const [[whRow]] = await db.execute(sql`SELECT warehouse_id FROM clients WHERE id = ${id}`) as any;
    const warehouseId = whRow?.warehouse_id ?? null;

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
    const [result] = await db.insert(clientsTable).values({
      ...parsed.data,
      creditLimit:  String(parsed.data.creditLimit ?? 0),
      totalOrders:  0,
      totalSales:   "0",
      totalPaid:    "0",
      createdAt: now, updatedAt: now,
      ...(tenantId !== null ? { tenantId } : {}),
    });

    const id = (result as any).insertId;
    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    res.status(201).json(client);
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

    // warehouseId يحتاج raw SQL عشان الـ compiled Drizzle schema ممكن مش فيه الـ column
    const { warehouseId, ...rest } = updates;
    await db.update(clientsTable).set(rest).where(eq(clientsTable.id, id));
    if (warehouseId !== undefined) {
      await db.execute(sql`UPDATE clients SET warehouse_id = ${warehouseId ?? null} WHERE id = ${id}`);
    }

    const [client] = await db.select().from(clientsTable).where(eq(clientsTable.id, id));
    if (!client) { res.status(404).json({ error: "العميل غير موجود" }); return; }
    res.json(client);
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

export { syncClientStats };
export default router;
