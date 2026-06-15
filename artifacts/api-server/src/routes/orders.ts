import { Router, type IRouter } from "express";
import { eq, desc, like, or, gte, lte, and, isNull, isNotNull, inArray, notInArray, sql } from "drizzle-orm";
import { db, ordersTable, productsTable, productVariantsTable, shippingManifestOrdersTable, shippingManifestsTable, shippingCompaniesTable, inventoryMovementsTable, cashRegistersTable, cashTransactionsTable } from "@workspace/db";
import {
  ListOrdersQueryParams,
  ListOrdersResponse,
  CreateOrderBody,
  GetOrderParams,
  GetOrderResponse,
  UpdateOrderParams,
  UpdateOrderBody,
  UpdateOrderResponse,
  GetOrdersSummaryResponse,
  GetRecentOrdersResponse,
} from "@workspace/api-zod";
import { processDelivery, reverseDelivery, processReturn, processToShipping, reverseShipping, updateMovementReason, resolveInventoryTarget, adjustWarehouseStock, syncProductQuantityFromWarehouses, recordMovement } from "../lib/inventory.js";
import { logAudit, diffObjects } from "../lib/audit.js";
import { requireAuth } from "../middlewares/requireAuth.js";
import { invalidateChartsCache, invalidateSmartCache } from "./analytics.js";
import { isAdmin } from "../middlewares/requireRole.js";
import { getTenantId } from "../middlewares/requireTenant.js";

const router: IRouter = Router();
router.use(requireAuth);

const LOCKED_STATUSES = ["received", "partial_received"] as const;

// ظ¤ظ¤ظ¤ Helper: generate invoice number ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤
function generateInvoiceNumber(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${yy}${mm}${dd}-${rand}`;
}

// ظ¤ظ¤ظ¤ Stats ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.get("/orders/stats", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfToday.getDate() - startOfToday.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const baseConditions: any[] = [isNull(ordersTable.deletedAt)];
  if (tenantId !== null) baseConditions.push(eq(ordersTable.tenantId, tenantId));

  const all = await db.select().from(ordersTable).where(and(...baseConditions));

  const groupByInvoice = (records: typeof all) => {
    const aggregated = new Map<string, { totalPrice: number; status: string; createdAt: Date }>();
    for (const o of records) {
      const key = o.invoiceNumber ?? `solo-${o.id}`;
      if (!aggregated.has(key)) {
        aggregated.set(key, { totalPrice: 0, status: o.status, createdAt: o.createdAt });
      }
      aggregated.get(key)!.totalPrice += o.totalPrice;
    }
    return Array.from(aggregated.values());
  };

  const allGroups = groupByInvoice(all);
  const filterGroups = (from: Date) => allGroups.filter(g => new Date(g.createdAt) >= from);
  const revenue = (groups: ReturnType<typeof groupByInvoice>) =>
    groups.filter(g => g.status === "received" || g.status === "partial_received")
      .reduce((s, g) => s + g.totalPrice, 0);

  const productCount: Record<string, number> = {};
  all.forEach(o => { productCount[o.product] = (productCount[o.product] || 0) + o.quantity; });
  const bestProduct = Object.entries(productCount).sort((a, b) => b[1] - a[1])[0];

  res.json({
    today: { orders: filterGroups(startOfToday).length, revenue: revenue(filterGroups(startOfToday)) },
    week: { orders: filterGroups(startOfWeek).length, revenue: revenue(filterGroups(startOfWeek)) },
    month: { orders: filterGroups(startOfMonth).length, revenue: revenue(filterGroups(startOfMonth)) },
    bestProduct: bestProduct ? { name: bestProduct[0], quantity: bestProduct[1] } : null,
  });
});

// ─── My Orders (طلبات الموظف الحالي من الـ token) ──────────────────────────────
router.get("/orders/my-orders", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const userId = (req as any).user?.id;
  if (!userId) { res.status(401).json({ error: "غير مصرح" }); return; }

  const { month } = req.query as { month?: string };

  const conditions: any[] = [
    isNull(ordersTable.deletedAt),
    eq(ordersTable.createdByUserId, userId),
  ];
  if (tenantId !== null) conditions.push(eq(ordersTable.tenantId, tenantId));

  if (month) {
    const [year, mon] = month.split("-").map(Number);
    const from = new Date(year, mon - 1, 1);
    const to = new Date(year, mon, 1);
    conditions.push(gte(ordersTable.createdAt, from));
    conditions.push(lte(ordersTable.createdAt, to));
  }

  const orders = await db
    .select()
    .from(ordersTable)
    .where(and(...conditions))
    .orderBy(desc(ordersTable.createdAt));

  // ── Group rows → invoices بنفس منطق /employee-orders ──
  const _SP: Record<string, number> = { pending:1, in_shipping:2, warehouse_ready:3, delayed:4, partial_received:5, received:6, returned:7 };
  const invMap = new Map<string, (typeof ordersTable.$inferSelect)[]>();
  for (const o of orders) {
    const k = o.invoiceNumber ?? `solo-${o.id}`;
    if (!invMap.has(k)) invMap.set(k, []);
    invMap.get(k)!.push(o);
  }

  const result = Array.from(invMap.values()).map(rows => {
    const resolvedStatus = [...rows.map(r => r.status)].sort((a, b) => (_SP[a] ?? 99) - (_SP[b] ?? 99))[0];
    const first = rows[0];
    const totalQty   = rows.reduce((s, r) => s + r.quantity, 0);
    const totalPrice = rows.reduce((s, r) => s + r.totalPrice, 0);
    const totalProfit = rows.reduce((s, r) => s + (r.totalPrice - (r.costPrice ?? 0) * r.quantity - (r.shippingCost ?? 0)), 0);
    const productNames = [...new Set(rows.map(r => r.product ?? ""))].join(" + ");
    return {
      id:            first.id,
      invoiceNumber: first.invoiceNumber,
      customerName:  first.customerName,
      product:       productNames,
      color:         rows.length > 1 ? null : first.color,
      size:          rows.length > 1 ? null : first.size,
      quantity:      totalQty,
      unitPrice:     first.unitPrice,
      totalPrice,
      status:        resolvedStatus,
      city:          first.city,
      adSource:      first.adSource,
      shippingCost:  first.shippingCost,
      profit:        totalProfit,
      createdAt:     first.createdAt,
      productCount:  rows.length,
    };
  }).sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime());

  res.json(result);
});

// ظ¤ظ¤ظ¤ List orders ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.get("/orders", async (req, res): Promise<void> => {
  const params = ListOrdersQueryParams.safeParse(req.query);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const tenantId = getTenantId(req);

  let query = db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt)).$dynamic();
  const conditions: any[] = [isNull(ordersTable.deletedAt)];
  if (tenantId !== null) conditions.push(eq(ordersTable.tenantId, tenantId));

  const isDashboard = (req.query as any).source === "dashboard";

  if (params.data.status) {
    if (isDashboard) {
      conditions.push(eq(ordersTable.status, params.data.status as any));
    } else if (params.data.status === "delayed") {
      // الطلبات المؤجلة: status بتاعها in_shipping لكن deliveryStatus = postponed في بيان مفتوح
      // نجيب الـ IDs من البيانات المفتوحة أولاً (نفس الـ postponedOrderIdsSet اللي هيتبنى بعدين)
      // هنا نبني مؤقتاً عشان نحدد الـ conditions قبل الـ query
      const openMfForFilter = await db
        .select({ id: shippingManifestsTable.id })
        .from(shippingManifestsTable)
        .where(eq(shippingManifestsTable.status, "open"));
      const openMfIds = openMfForFilter.map(m => m.id);
      if (openMfIds.length > 0) {
        const postponedLinks = await db
          .select({ orderId: shippingManifestOrdersTable.orderId })
          .from(shippingManifestOrdersTable)
          .where(and(
            inArray(shippingManifestOrdersTable.manifestId, openMfIds),
            eq(shippingManifestOrdersTable.deliveryStatus, "postponed")
          ));
        const postponedIds = postponedLinks.map(l => l.orderId);
        if (postponedIds.length > 0) {
          conditions.push(inArray(ordersTable.id, postponedIds));
        } else {
          res.json([]);
          return;
        }
      } else {
        res.json([]);
        return;
      }
    } else {
      // ╪ذ┘╪ش┘è╪ذ ┘┘é╪╖ ╪د┘┘ invoiceNumbers ╪د┘┘┘è ┘â┘ rows ┘┘è┘ç╪د ┘┘╪│ ╪د┘┘ status ╪د┘┘à╪╖┘┘ê╪ذ
      const allInvBaseConditions: any[] = [isNull(ordersTable.deletedAt)];
      if (tenantId !== null) allInvBaseConditions.push(eq(ordersTable.tenantId, tenantId));
      const allInvRows = await db
        .select({ invoiceNumber: ordersTable.invoiceNumber, id: ordersTable.id, status: ordersTable.status })
        .from(ordersTable)
        .where(and(...allInvBaseConditions));

      // ┘╪ش┘à┘ّ╪╣ ┘â┘ ╪د┘╪ص╪د┘╪د╪ز ┘┘â┘ invoiceNumber
      // نفس منطق chart: invoice بتاخد حالة الأنشط (أولوية)
      const STATUS_PRIORITY_FILTER: Record<string, number> = {
        returned: 1, pending: 2, in_shipping: 3, warehouse_ready: 4, delayed: 5,
        partial_received: 6, received: 7,
      };
      const invStatusMap = new Map<string, Set<string>>();
      const soloMap = new Map<number, string>();
      for (const r of allInvRows) {
        if (r.invoiceNumber) {
          if (!invStatusMap.has(r.invoiceNumber)) invStatusMap.set(r.invoiceNumber, new Set());
          invStatusMap.get(r.invoiceNumber)!.add(r.status);
        } else {
          soloMap.set(r.id, r.status);
        }
      }
      const resolveStatus = (statuses: Set<string>): string => {
        if (statuses.size === 1) return Array.from(statuses)[0];
        return Array.from(statuses).sort(
          (a, b) => (STATUS_PRIORITY_FILTER[a] ?? 99) - (STATUS_PRIORITY_FILTER[b] ?? 99)
        )[0];
      };

      // ┘╪ث╪«╪░ ┘┘é╪╖ ╪د┘┘ invoiceNumbers ╪د┘┘┘è ┘â┘ rows ┘┘è┘ç╪د ┘┘╪│ ╪د┘┘ status ╪د┘┘à╪╖┘┘ê╪ذ
      const matchingInvNums: string[] = [];
      for (const [inv, statuses] of invStatusMap.entries()) {
        if (resolveStatus(statuses) === params.data.status) {
          matchingInvNums.push(inv);
        }
      }
      const soloIds = new Set<number>();
      for (const [id, status] of soloMap.entries()) {
        if (status === params.data.status) soloIds.add(id);
      }

      if (matchingInvNums.length > 0 && soloIds.size > 0) {
        conditions.push(or(
          inArray(ordersTable.invoiceNumber, matchingInvNums),
          and(isNull(ordersTable.invoiceNumber), inArray(ordersTable.id, Array.from(soloIds)))
        ));
      } else if (matchingInvNums.length > 0) {
        conditions.push(inArray(ordersTable.invoiceNumber, matchingInvNums));
      } else if (soloIds.size > 0) {
        conditions.push(and(isNull(ordersTable.invoiceNumber), inArray(ordersTable.id, Array.from(soloIds))));
      } else {
        res.json([]);
        return;
      }
    }
  }

  let manifestOrderIdsSet = new Set<number>();
  const skipManifestFilter = (req.query as any).includeInManifest === "true" || (req.query as any).source === "dashboard";
  if (params.data.status === "in_shipping" && !skipManifestFilter) {
    const openManifests = await db
      .select({ id: shippingManifestsTable.id })
      .from(shippingManifestsTable)
      .where(eq(shippingManifestsTable.status, "open"));
    const openManifestIds = openManifests.map(m => m.id);
    if (openManifestIds.length > 0) {
      const inManifest = await db
        .select({ orderId: shippingManifestOrdersTable.orderId })
        .from(shippingManifestOrdersTable)
        .where(inArray(shippingManifestOrdersTable.manifestId, openManifestIds));
      manifestOrderIdsSet = new Set(inManifest.map(r => r.orderId));
    }
  }

  if (params.data.search) {
    const s = `%${params.data.search}%`;
    conditions.push(or(like(ordersTable.customerName, s), like(ordersTable.product, s), like(ordersTable.phone, s)));
  }
  if ((req.query as any).dateFrom) {
    conditions.push(gte(ordersTable.createdAt, new Date((req.query as any).dateFrom as string)));
  }
  if ((req.query as any).dateTo) {
    const dateTo = new Date((req.query as any).dateTo as string);
    dateTo.setHours(23, 59, 59, 999);
    conditions.push(lte(ordersTable.createdAt, dateTo));
  }
  if ((req.query as any).shippingCompanyId) {
    const cid = parseInt((req.query as any).shippingCompanyId as string);
    if (!isNaN(cid)) conditions.push(eq(ordersTable.shippingCompanyId, cid));
  }
  if ((req.query as any).createdByUserId) {
    const uid = parseInt((req.query as any).createdByUserId as string);
    if (!isNaN(uid)) conditions.push(eq(ordersTable.createdByUserId, uid));
  }

  if (conditions.length === 1) query = query.where(conditions[0]);
  else if (conditions.length > 1) query = query.where(and(...conditions));

  const rows = await query;

  // جيب الطلبات المؤجلة (postponed) من البيانات المفتوحة
  // الطلب المؤجل في البيان status بتاعه in_shipping لكن deliveryStatus = postponed
  const openManifestsList = await db
    .select({ id: shippingManifestsTable.id })
    .from(shippingManifestsTable)
    .where(eq(shippingManifestsTable.status, "open"));
  const openManifestIds = openManifestsList.map(m => m.id);
  const postponedOrderIdsSet = new Set<number>();
  const postponedNoteMapFromManifest = new Map<number, string | null>();
  // الطلبات المرتجعة في بيان مفتوح (لسه عند شركة الشحن → تظهر كـ in_shipping في قسم الطلبات)
  const returnedInOpenManifestSet = new Set<number>();
  if (openManifestIds.length > 0) {
    const manifestOpenLinks = await db
      .select({ orderId: shippingManifestOrdersTable.orderId, deliveryNote: shippingManifestOrdersTable.deliveryNote, deliveryStatus: shippingManifestOrdersTable.deliveryStatus })
      .from(shippingManifestOrdersTable)
      .where(and(
        inArray(shippingManifestOrdersTable.manifestId, openManifestIds),
        or(
          eq(shippingManifestOrdersTable.deliveryStatus, "postponed"),
          eq(shippingManifestOrdersTable.deliveryStatus, "returned")
        )
      ));
    for (const link of manifestOpenLinks) {
      if (link.deliveryStatus === "postponed") {
        postponedOrderIdsSet.add(link.orderId);
        if (!postponedNoteMapFromManifest.has(link.orderId)) {
          postponedNoteMapFromManifest.set(link.orderId, link.deliveryNote ?? null);
        }
      } else if (link.deliveryStatus === "returned") {
        returnedInOpenManifestSet.add(link.orderId);
      }
    }
  }

  const returnedNullIds = rows.filter(o => o.status === "returned" && (o as any).returnReceived == null).map(o => o.id);
  const manifestReturnMap = new Map<number, number | null>();
  if (returnedNullIds.length > 0) {
    try {
      const manifestLinks = await db
        .select({ orderId: shippingManifestOrdersTable.orderId, returnReceived: shippingManifestOrdersTable.returnReceived })
        .from(shippingManifestOrdersTable)
        .where(inArray(shippingManifestOrdersTable.orderId, returnedNullIds));
      for (const link of manifestLinks) {
        const existing = manifestReturnMap.get(link.orderId);
        if (existing === undefined || (link.returnReceived !== null && existing === null)) {
          manifestReturnMap.set(link.orderId, link.returnReceived ?? null);
        }
      }
    } catch (_) { /* ╪ز╪ش╪د┘ç┘ */ }
  }

  const delayedIds = rows.filter(o => o.status === "delayed").map(o => o.id);
  const manifestDelayNoteMap = new Map<number, string | null>();
  if (delayedIds.length > 0) {
    try {
      const manifestLinks = await db
        .select({ orderId: shippingManifestOrdersTable.orderId, deliveryNote: shippingManifestOrdersTable.deliveryNote })
        .from(shippingManifestOrdersTable)
        .where(and(
          inArray(shippingManifestOrdersTable.orderId, delayedIds),
          eq(shippingManifestOrdersTable.deliveryStatus, "postponed")
        ))
        .orderBy(desc(shippingManifestOrdersTable.id));
      for (const link of manifestLinks) {
        if (!manifestDelayNoteMap.has(link.orderId) && link.deliveryNote != null) {
          manifestDelayNoteMap.set(link.orderId, link.deliveryNote);
        }
      }
    } catch (_) { /* تجاهل */ }
  }

  const partialIds = rows.filter(o => o.status === "partial_received").map(o => o.id);
  const manifestPartialMap = new Map<number, number | null>();
  if (partialIds.length > 0) {
    try {
      const manifestLinks = await db
        .select({ orderId: shippingManifestOrdersTable.orderId, partialQuantity: shippingManifestOrdersTable.partialQuantity })
        .from(shippingManifestOrdersTable)
        .where(inArray(shippingManifestOrdersTable.orderId, partialIds))
        .orderBy(desc(shippingManifestOrdersTable.id));
      for (const link of manifestLinks) {
        if (!manifestPartialMap.has(link.orderId) && link.partialQuantity != null) {
          manifestPartialMap.set(link.orderId, link.partialQuantity);
        }
      }
    } catch (_) { /* ╪ز╪ش╪د┘ç┘ */ }
  }

  const groupMap = new Map<string, typeof rows>();
  for (const o of rows) {
    const key = o.invoiceNumber ?? `solo-${o.id}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key)!.push(o);
  }

  const filteredGroups = Array.from(groupMap.values()).filter(grp => {
    // لما الفلتر = in_shipping → نجيب بس الطلبات اللي في بيان مفتوح فعلاً
    if (params.data.status === "in_shipping" && manifestOrderIdsSet.size > 0) {
      return grp.some(o => manifestOrderIdsSet.has(o.id));
    }
    // في الحالات التانية (بدون فلتر status) → نشيل الطلبات اللي كلها في بيان مفتوح
    if (!params.data.status && manifestOrderIdsSet.size > 0) {
      const allInManifest = grp.every(o => manifestOrderIdsSet.has(o.id));
      return !allInManifest;
    }
    return true;
  });

  const getReturnReceived = (o: (typeof rows)[0]): number | null => {
    const fromOrder = (o as any).returnReceived;
    if (fromOrder !== null && fromOrder !== undefined) return fromOrder;
    return manifestReturnMap.get(o.id) ?? null;
  };

  const getDelayNote = (o: (typeof rows)[0]): string | null => {
    return postponedNoteMapFromManifest.get(o.id) ?? manifestDelayNoteMap.get(o.id) ?? null;
  };

  const getPartialQuantity = (o: (typeof rows)[0]): number | null => {
    const fromManifest = manifestPartialMap.get(o.id);
    if (fromManifest != null) return fromManifest;
    return o.partialQuantity ?? null;
  };

  const calcReceivedPrice = (o: (typeof rows)[0], pq: number | null): number => {
    if (o.status === "partial_received" && pq != null) {
      const unit = (o as any).unitPrice ?? (o.quantity > 0 ? Math.round(o.totalPrice / o.quantity) : o.totalPrice);
      return Math.round(unit * pq);
    }
    return o.totalPrice;
  };

  const grouped = filteredGroups.map(grp => {
    if (grp.length === 1) {
      const rep = { ...grp[0] } as any;
      rep._invoiceOrders = [grp[0]];
      // لو الطلب in_shipping لكن مؤجل في البيان → حوّل status لـ delayed
      if (rep.status === "in_shipping" && postponedOrderIdsSet.has(grp[0].id)) {
        rep.status = "delayed";
      }
      if (rep.status === "returned") rep.returnReceived = getReturnReceived(grp[0]);
      if (rep.status === "delayed") rep.delayNote = getDelayNote(grp[0]);
      if (rep.status === "partial_received") {
        const pq = getPartialQuantity(grp[0]);
        rep.partialQuantity = pq;
        rep._receivedPrice = calcReceivedPrice(grp[0], pq);
        rep._fullPrice = grp[0].totalPrice;
      }
      return rep;
    }
    const rep = { ...grp[0] } as any;
    rep.totalPrice     = grp.reduce((s, o) => s + o.totalPrice, 0);
    rep.quantity       = grp.reduce((s, o) => s + o.quantity,   0);
    rep.product        = grp.map(o => `${o.product} ×${o.quantity}`).join(" ، ");
    rep._groupIds      = grp.map(o => o.id);
    rep._groupCount    = grp.length;
    rep._groupStatuses = grp.map(o => o.status);
    rep._invoiceOrders = grp;
    // لو كل الطلبات in_shipping ومؤجلة في البيان → حوّل status الـ group لـ delayed
    const allInShippingPostponed = grp.every(o => o.status === "in_shipping" && postponedOrderIdsSet.has(o.id));
    if (allInShippingPostponed) {
      rep.status = "delayed";
      let dn: string | null = null;
      for (const o of grp) { const val = getDelayNote(o); if (val !== null) { dn = val; break; } }
      rep.delayNote = dn;
    }
    const allReturned = grp.every(o => o.status === "returned");
    // لو فيه أي أوردر مرتجع في الفاتورة → الفاتورة تظهر كـ returned
    const anyReturned = !allInShippingPostponed && grp.some(o => o.status === "returned");
    if (anyReturned) {
      rep.status = "returned";
      let rr: number | null = null;
      for (const o of grp) { const val = getReturnReceived(o); if (val !== null) { rr = val; break; } }
      rep.returnReceived = rr;
    } else if (allReturned) {
      let rr: number | null = null;
      for (const o of grp) { const val = getReturnReceived(o); if (val !== null) { rr = val; break; } }
      rep.returnReceived = rr;
    }
    const allPartial = grp.every(o => o.status === "partial_received");
    if (allPartial) {
      rep.partialQuantity = grp.reduce((s, o) => s + (getPartialQuantity(o) ?? 0), 0);
      rep._receivedPrice  = grp.reduce((s, o) => s + calcReceivedPrice(o, getPartialQuantity(o)), 0);
      rep._fullPrice      = rep.totalPrice;
    }
    const allDelayed = grp.every(o => o.status === "delayed");
    if (allDelayed) {
      let dn: string | null = null;
      for (const o of grp) { const val = getDelayNote(o); if (val !== null) { dn = val; break; } }
      rep.delayNote = dn;
    }
    return rep;
  });

  res.json(grouped);
});

// ظ¤ظ¤ظ¤ Create order (single) ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const totalPrice = parsed.data.quantity * parsed.data.unitPrice;
  let costPrice = (parsed.data as any).costPrice ?? null;
  if (!costPrice && (parsed.data as any).variantId) {
    const [variant] = await db.select().from(productVariantsTable).where(eq(productVariantsTable.id, (parsed.data as any).variantId));
    if (variant?.costPrice) costPrice = variant.costPrice;
  }
  if (!costPrice && (parsed.data as any).productId) {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, (parsed.data as any).productId));
    if (product?.costPrice) costPrice = product.costPrice;
  }

  const invoiceNumber = (parsed.data as any).invoiceNumber || generateInvoiceNumber();
  const result = await db.insert(ordersTable).values({ ...parsed.data, totalPrice, status: "pending", costPrice, invoiceNumber, tenantId: getTenantId(req), createdByUserId: req.user?.id ?? null, createdByName: req.user?.displayName ?? null, createdAt: new Date(), updatedAt: new Date() });
  const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, insertId));

  await logAudit({
    action: "create", entityType: "order", entityId: order.id,
    entityName: `${order.customerName} ظ¤ ${order.product}`,
    after: { customerName: order.customerName, product: order.product, quantity: order.quantity, unitPrice: order.unitPrice, status: order.status },
    userId: req.user?.id, userName: req.user?.displayName,
  });

  res.status(201).json(GetOrderResponse.parse(order));
});

// ظ¤ظ¤ظ¤ Create batch orders ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.post("/orders/batch", async (req, res): Promise<void> => {
  const { items, ...sharedFields } = req.body;
  if (!Array.isArray(items) || items.length === 0) { res.status(400).json({ error: "┘è╪ش╪ذ ╪ح╪▒╪│╪د┘ ┘é╪د╪خ┘à╪ر ┘à┘╪ز╪ش╪د╪ز (items)" }); return; }

  const invoiceNumber = sharedFields.invoiceNumber ?? generateInvoiceNumber();
  const shippingPerItem = sharedFields.shippingCost ? Number(sharedFields.shippingCost) / items.length : 0;
  const createdOrders = [];

  for (const item of items) {
    const parsed = CreateOrderBody.safeParse({ ...sharedFields, product: item.product, color: item.color ?? null, size: item.size ?? null, quantity: item.quantity, unitPrice: item.unitPrice, costPrice: item.costPrice ?? null, shippingCost: shippingPerItem, productId: item.productId ?? null, variantId: item.variantId ?? null });
    if (!parsed.success) { res.status(400).json({ error: `┘à┘╪ز╪ش ╪║┘è╪▒ ╪╡╪د┘╪ص: ${parsed.error.message}` }); return; }
    const totalPrice = parsed.data.quantity * parsed.data.unitPrice;
    let costPrice = (parsed.data as any).costPrice ?? null;
    if (!costPrice && (parsed.data as any).variantId) {
      const [variant] = await db.select().from(productVariantsTable).where(eq(productVariantsTable.id, (parsed.data as any).variantId));
      if (variant?.costPrice) costPrice = variant.costPrice;
    }
    if (!costPrice && (parsed.data as any).productId) {
      const [product] = await db.select().from(productsTable).where(eq(productsTable.id, (parsed.data as any).productId));
      if (product?.costPrice) costPrice = product.costPrice;
    }
    const result = await db.insert(ordersTable).values({ ...parsed.data, totalPrice, status: "pending", costPrice, invoiceNumber, tenantId: getTenantId(req), createdByUserId: req.user?.id ?? null, createdByName: req.user?.displayName ?? null, createdAt: new Date(), updatedAt: new Date() });
    const insertId = (result as any)[0]?.insertId ?? (result as any).insertId;
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, insertId));
    createdOrders.push(order);
    await logAudit({ action: "create", entityType: "order", entityId: order.id, entityName: `${order.customerName} ظ¤ ${order.product} [${invoiceNumber}]`, after: { customerName: order.customerName, product: order.product, quantity: order.quantity, unitPrice: order.unitPrice, status: order.status, invoiceNumber }, userId: req.user?.id, userName: req.user?.displayName });
  }
  res.status(201).json({ invoiceNumber, orders: createdOrders });
});

// ظ¤ظ¤ظ¤ Summary ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.get("/orders/summary", async (_req, res): Promise<void> => {
  const tenantId = getTenantId(_req);
  const summaryConditions: any[] = [isNull(ordersTable.deletedAt)];
  if (tenantId !== null) summaryConditions.push(eq(ordersTable.tenantId, tenantId));
  // مرتبة desc عشان أول row لكل invoice هو الأحدث — نفس منطق analytics/charts
  const rows = await db.select().from(ordersTable).where(and(...summaryConditions)).orderBy(desc(ordersTable.createdAt));
  // نفس منطق analytics/charts تماماً:
  // invoice بتتحسب بحالة X بس لو كل rows فيها بحالة X واحدة
  type InvoiceRaw = { statuses: Set<string>; totalPrice: number };
  const invoiceMapRaw = new Map<string, InvoiceRaw>();
  for (const o of rows) {
    const key = o.invoiceNumber ?? `solo-${o.id}`;
    if (!invoiceMapRaw.has(key)) invoiceMapRaw.set(key, { statuses: new Set(), totalPrice: 0 });
    invoiceMapRaw.get(key)!.statuses.add(o.status);
    invoiceMapRaw.get(key)!.totalPrice += o.totalPrice;
  }
  type InvoiceGroup = { status: string; totalPrice: number };
  const invoices: InvoiceGroup[] = [];
  const STATUS_PRIORITY: Record<string, number> = {
    pending: 1, in_shipping: 2, warehouse_ready: 3, delayed: 4,
    partial_received: 5, received: 6, returned: 7,
  };
  for (const raw of invoiceMapRaw.values()) {
    let resolvedStatus: string;
    if (raw.statuses.size === 1) {
      resolvedStatus = Array.from(raw.statuses)[0];
    } else {
      resolvedStatus = Array.from(raw.statuses).sort(
        (a, b) => (STATUS_PRIORITY[a] ?? 99) - (STATUS_PRIORITY[b] ?? 99)
      )[0];
    }
    invoices.push({ status: resolvedStatus, totalPrice: raw.totalPrice });
  }
  const summary = {
    totalOrders: invoices.length,
    pendingOrders: invoices.filter(o => o.status === "pending").length,
    warehouseReadyOrders: invoices.filter(o => o.status === "warehouse_ready").length,
    shippingOrders: invoices.filter(o => o.status === "in_shipping").length,
    receivedOrders: invoices.filter(o => o.status === "received").length,
    delayedOrders: invoices.filter(o => o.status === "delayed").length,
    returnedOrders: invoices.filter(o => o.status === "returned").length,
    partialOrders: invoices.filter(o => o.status === "partial_received").length,
    totalRevenue: invoices.filter(o => o.status === "received" || o.status === "partial_received").reduce((s, o) => s + o.totalPrice, 0),
  };
  res.json(GetOrdersSummaryResponse.parse(summary));
});

// ظ¤ظ¤ظ¤ Recent orders ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.get("/orders/recent", async (_req, res): Promise<void> => {
  const tenantId = getTenantId(_req);
  const recentConds: any[] = [isNull(ordersTable.deletedAt)];
  if (tenantId !== null) recentConds.push(eq(ordersTable.tenantId, tenantId));
  const rows = await db.select().from(ordersTable).where(and(...recentConds)).orderBy(desc(ordersTable.createdAt)).limit(80);
  const seen = new Set<string>();
  const unique: typeof rows = [];
  for (const o of rows) {
    const key = o.invoiceNumber ?? `solo-${o.id}`;
    if (!seen.has(key)) { seen.add(key); unique.push(o); if (unique.length === 8) break; }
  }
  res.json(GetRecentOrdersResponse.parse(unique));
});

// ظ¤ظ¤ظ¤ Archived orders ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.get("/orders/archived", async (_req, res): Promise<void> => {
  const tenantId = getTenantId(_req);
  const archConds: any[] = [isNotNull(ordersTable.deletedAt)];
  if (tenantId !== null) archConds.push(eq(ordersTable.tenantId, tenantId));
  const orders = await db.select().from(ordersTable).where(and(...archConds)).orderBy(desc(ordersTable.deletedAt));
  res.json(orders);
});

// ظ¤ظ¤ظ¤ Purge archived orders permanently (admin only) ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤
router.delete("/orders/archived/purge", async (req, res): Promise<void> => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "ids ┘à╪╖┘┘ê╪ذ╪ر" });
    return;
  }
  const numericIds = ids.map(Number).filter(n => !isNaN(n));
  // ╪ص╪░┘ ┘┘ç╪د╪خ┘è ظ¤ ╪ذ╪│ ┘┘╪╖┘╪ذ╪د╪ز ╪د┘┘à╪ج╪▒╪┤┘╪ر (deletedAt IS NOT NULL)
  await db.delete(ordersTable).where(
    and(inArray(ordersTable.id, numericIds), isNotNull(ordersTable.deletedAt))
  );
  res.json({ success: true, deleted: numericIds.length });
});

// ظ¤ظ¤ظ¤ Orders in manifest ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

// ── جيب كل الأوردرات بدون grouping عشان الـ AddOrdersToManifestDialog ──
router.get("/orders/for-manifest-dialog", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const conditions: any[] = [isNull(ordersTable.deletedAt)];
  if (tenantId !== null) conditions.push(eq(ordersTable.tenantId, tenantId));

  const rows = await db
    .select({
      id: ordersTable.id,
      customerName: ordersTable.customerName,
      product: ordersTable.product,
      phone: ordersTable.phone,
      quantity: ordersTable.quantity,
      totalPrice: ordersTable.totalPrice,
      status: ordersTable.status,
      color: ordersTable.color,
      size: ordersTable.size,
      invoiceNumber: ordersTable.invoiceNumber,
    })
    .from(ordersTable)
    .where(and(...conditions))
    .orderBy(desc(ordersTable.createdAt));

  res.json(rows);
});

router.get("/orders/in-manifest-ids", async (_req, res): Promise<void> => {
  const openManifests = await db.select({ id: shippingManifestsTable.id }).from(shippingManifestsTable).where(eq(shippingManifestsTable.status, "open"));
  if (openManifests.length === 0) { res.json({ ids: [] }); return; }
  const openIds = openManifests.map(m => m.id);
  const rows = await db.select({ orderId: shippingManifestOrdersTable.orderId }).from(shippingManifestOrdersTable).where(inArray(shippingManifestOrdersTable.manifestId, openIds));
  res.json({ ids: rows.map(r => r.orderId) });
});

// ظ¤ظ¤ظ¤ Bulk delete orders (must be BEFORE /:id routes) ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.delete("/orders/bulk", async (req, res): Promise<void> => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: "┘è╪ش╪ذ ╪ح╪▒╪│╪د┘ ┘é╪د╪خ┘à╪ر IDs" });
    return;
  }
  const userRole = (req as any).user?.role;
  const numericIds = ids.map(Number).filter(n => !isNaN(n));
  const orders = await db.select().from(ordersTable)
    .where(and(inArray(ordersTable.id, numericIds), isNull(ordersTable.deletedAt)));
  let deleted = 0;
  let skipped = 0;
  for (const order of orders) {
    if (LOCKED_STATUSES.includes(order.status as any) && userRole !== "admin") {
      skipped++;
      continue;
    }
    // -- 1) restore inventory stock if a movement exists
    try {
      const [lastMovement] = await db
        .select({ id: inventoryMovementsTable.id })
        .from(inventoryMovementsTable)
        .where(eq(inventoryMovementsTable.orderId, order.id))
        .orderBy(desc(inventoryMovementsTable.id))
        .limit(1);
      if (lastMovement) {
        const orderRef = {
          variantId: order.variantId, productId: order.productId,
          product: order.product, color: order.color,
          size: order.size, warehouseId: order.warehouseId,
        };
        const { variantId, productId } = await resolveInventoryTarget(orderRef);
        await adjustWarehouseStock(order.warehouseId, variantId, productId, order.quantity).catch(() => {});
        await syncProductQuantityFromWarehouses(variantId, productId).catch(() => {});
        await db.delete(inventoryMovementsTable).where(eq(inventoryMovementsTable.orderId, order.id)).catch(() => {});
      }
    } catch (_) {}

    // -- 2) reverse cash transaction linked to this order
    try {
      const [txRow] = await db
        .select()
        .from(cashTransactionsTable)
        .where(
          and(
            eq(cashTransactionsTable.type, "order_collected"),
            eq(cashTransactionsTable.orderId, order.id),
          )
        )
        .limit(1);
      if (txRow) {
        const amt = parseFloat(txRow.amount ?? "0");
        // اطرح المبلغ من رصيد الخزنة
        await db
          .update(cashRegistersTable)
          .set({
            balance: sql`balance - ${amt}`,
            updatedAt: new Date(),
          })
          .where(eq(cashRegistersTable.id, txRow.registerId));
        // احذف الـ transaction
        await db
          .delete(cashTransactionsTable)
          .where(eq(cashTransactionsTable.id, txRow.id));
      }
    } catch (_) {}

    await db.update(ordersTable).set({ deletedAt: new Date() }).where(eq(ordersTable.id, order.id));
    await logAudit({
      action: "delete", entityType: "order", entityId: order.id,
      entityName: `${order.customerName} ظ¤ ${order.product}`,
      before: { customerName: order.customerName, product: order.product, status: order.status },
      userId: (req as any).user?.id, userName: (req as any).user?.displayName,
    });
    deleted++;
  }
  res.json({ deleted, skipped });
});

// ظ¤ظ¤ظ¤ Restore archived order ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.post("/orders/:id/restore", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!existing) { res.status(404).json({ error: "Order not found" }); return; }
  if (!existing.deletedAt) { res.status(400).json({ error: "Order is not archived" }); return; }
  await db.update(ordersTable).set({ deletedAt: null }).where(eq(ordersTable.id, id));
  const [restored] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  await logAudit({ action: "restore", entityType: "order", entityId: id, entityName: `${existing.customerName} ظ¤ ${existing.product}`, after: { status: existing.status, restoredAt: new Date().toISOString() }, userId: req.user?.id, userName: req.user?.displayName });
  res.json(restored);
});

// ظ¤ظ¤ظ¤ Invoice manifest status ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.get("/orders/invoice-manifest-status/:invoiceNumber", async (req, res): Promise<void> => {
  const { invoiceNumber } = req.params;
  if (!invoiceNumber) { res.status(400).json({ error: "invoiceNumber ┘à╪╖┘┘ê╪ذ" }); return; }

  const invoiceOrders = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.invoiceNumber, invoiceNumber), isNull(ordersTable.deletedAt)))
    .orderBy(ordersTable.id);

  if (invoiceOrders.length === 0) { res.json([]); return; }

  const orderIds = invoiceOrders.map(o => o.id);
  const links = await db.select({ mo: shippingManifestOrdersTable, m: shippingManifestsTable })
    .from(shippingManifestOrdersTable)
    .innerJoin(shippingManifestsTable, eq(shippingManifestOrdersTable.manifestId, shippingManifestsTable.id))
    .where(inArray(shippingManifestOrdersTable.orderId, orderIds))
    .orderBy(desc(shippingManifestOrdersTable.id));

  const latestByOrder = new Map<number, typeof links[0]>();
  for (const link of links) {
    if (!latestByOrder.has(link.mo.orderId)) latestByOrder.set(link.mo.orderId, link);
  }

  const result = invoiceOrders.map(order => {
    const link = latestByOrder.get(order.id);
    const rr = link?.mo.returnReceived;
    return {
      orderId: order.id, product: order.product, quantity: order.quantity, status: order.status,
      manifestId: link?.m.id ?? null, manifestNumber: link?.m.manifestNumber ?? null,
      manifestStatus: link?.m.status ?? null, deliveryStatus: link?.mo.deliveryStatus ?? null,
      deliveryNote: link?.mo.deliveryNote ?? null, manifestPartialQuantity: link?.mo.partialQuantity ?? null,
      deliveredAt: link?.mo.deliveredAt ?? null, returnReceived: rr == null ? null : Number(rr),
    };
  });

  res.json(result);
});

// ظ¤ظ¤ظ¤ Orders by invoice ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.get("/orders/by-invoice/:invoiceNumber", async (req, res): Promise<void> => {
  const { invoiceNumber } = req.params;
  if (!invoiceNumber) { res.status(400).json({ error: "invoiceNumber ┘à╪╖┘┘ê╪ذ" }); return; }
  const orders = await db.select().from(ordersTable).where(and(eq(ordersTable.invoiceNumber, invoiceNumber), isNull(ordersTable.deletedAt))).orderBy(ordersTable.id);
  res.json(orders);
});

// ظ¤ظ¤ظ¤ Get order manifest status ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.get("/orders/:id/manifest-status", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const links = await db.select({ mo: shippingManifestOrdersTable, m: shippingManifestsTable })
    .from(shippingManifestOrdersTable)
    .innerJoin(shippingManifestsTable, eq(shippingManifestOrdersTable.manifestId, shippingManifestsTable.id))
    .where(eq(shippingManifestOrdersTable.orderId, id))
    .orderBy(desc(shippingManifestOrdersTable.id));
  if (links.length === 0) { res.json(null); return; }
  const link = links[0];
  // ╪د┘é╪▒╪ث returnReceived ┘à┘ ╪ش╪»┘ê┘ orders ┘à╪ذ╪د╪┤╪▒╪ر (┘à╪╡╪»╪▒ ╪د┘╪ص┘é┘è┘é╪ر)
  const [orderRow] = await db.select({ returnReceived: ordersTable.returnReceived }).from(ordersTable).where(eq(ordersTable.id, id));
  const rr = (orderRow?.returnReceived != null) ? Number(orderRow.returnReceived) : (link.mo.returnReceived == null ? null : Number(link.mo.returnReceived));
  res.json({
    manifestId: link.m.id, manifestNumber: link.m.manifestNumber, manifestStatus: link.m.status,
    deliveryStatus: link.mo.deliveryStatus, deliveryNote: link.mo.deliveryNote,
    partialQuantity: link.mo.partialQuantity ?? null, deliveredAt: link.mo.deliveredAt,
    returnReceived: rr,
  });
});

// ظ¤ظ¤ظ¤ Get single order ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.get("/orders/:id", async (req, res): Promise<void> => {
  const params = GetOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const [order] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, params.data.id), isNull(ordersTable.deletedAt)));
  if (!order) { res.status(404).json({ error: "Order not found" }); return; }
  res.json(GetOrderResponse.parse(order));
});

// ظ¤ظ¤ظ¤ Update order (PATCH) ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.patch("/orders/:id", async (req, res): Promise<void> => {
  const params = UpdateOrderParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }

  const [existing] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, params.data.id), isNull(ordersTable.deletedAt)));
  if (!existing) { res.status(404).json({ error: "Order not found" }); return; }

  const userRole = (req as any).user?.role;

  const parsed = UpdateOrderBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const data = parsed.data as Record<string, any>;
  const newQty        = data.quantity  ?? existing.quantity;
  const newUnitPrice  = data.unitPrice ?? existing.unitPrice;
  const newTotalPrice = newQty * newUnitPrice;
  // ضمان إن shippingCost دايمًا موجب
  if (data.shippingCost != null) data.shippingCost = Math.abs(data.shippingCost);

  const oldStatus = existing.status;
  const newStatus = data.status ?? oldStatus;
  const deliveredStatuses = ["received", "partial_received"];

  // ┘┘ê ╪د┘╪╖┘╪ذ ┘┘è ╪ذ┘è╪د┘ ╪┤╪ص┘ ظْ ╪ص╪▒┘â╪د╪ز ╪د┘┘à╪«╪▓┘ê┘ ┘à╪│╪ج┘ê┘┘è╪ر ╪د┘╪ذ┘è╪د┘ ┘┘é╪╖╪î ┘╪د ┘╪╣┘à┘┘ç╪د ┘ç┘╪د
  const [manifestLink] = await db
    .select({ id: shippingManifestOrdersTable.id })
    .from(shippingManifestOrdersTable)
    .where(eq(shippingManifestOrdersTable.orderId, existing.id))
    .limit(1)
    .catch(() => []);
  const isInManifest = !!manifestLink;

  // لو الطلب في بيان شحن → حركات المخزون مسؤولية البيان فقط
  // استثناء: received / partial_received من الـ close dialog → نخصم دايماً
  const isManualClose = deliveredStatuses.includes(newStatus) && !!(data as any).cashRegisterId;
  if (newStatus !== oldStatus && (!isInManifest || isManualClose)) {
    const orderRef = { variantId: existing.variantId, productId: existing.productId, product: existing.product, color: existing.color, size: existing.size, warehouseId: existing.warehouseId };

    // ظ¤ظ¤ ┘à┘╪╖┘é ╪ص╪▒┘â╪د╪ز ╪د┘┘à╪«╪▓┘ê┘ ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤
    // ╪د┘┘é╪د╪╣╪»╪ر ╪د┘╪ش╪»┘è╪»╪ر:
    //   warehouse_ready = ╪د┘╪╖┘╪ذ ╪ش╪د┘ç╪▓ ┘┘è ╪د┘┘à╪«╪▓┘╪î ┘┘â┘ ┘┘à ┘è╪«╪╡┘à ╪ذ╪╣╪» (┘è┘╪«╪╡┘à ╪╣┘╪» ╪ح╪╢╪د┘╪ز┘ç ┘╪ذ┘è╪د┘)
    //   in_shipping = ╪د┘╪╖┘╪ذ ┘┘è ╪┤╪▒┘â╪ر ╪د┘╪┤╪ص┘ (╪«┘╪╡┘à ┘à┘ ╪د┘┘à╪«╪▓┘ ╪╣┘╪» ╪ح┘╪┤╪د╪ة ╪د┘╪ذ┘è╪د┘)

    // ظ¤ظ¤ ┘┘ê ╪د┘╪ص╪د┘╪ر ╪د┘╪ش╪»┘è╪»╪ر warehouse_ready: ┘╪د ┘è╪ص╪»╪س ╪«╪╡┘à ┘┘è ╪د┘┘à╪«╪▓┘ê┘ ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤
    // ┘╪ز╪ش╪د┘ç┘ ╪ث┘è ╪ز╪║┘è┘è╪▒ ┘à╪«╪▓┘ê┘ ┘ç┘╪د ظ¤ ╪د┘╪«╪╡┘à ┘è╪ص╪»╪س ┘┘à╪د ┘è╪ز╪╢╪د┘ ┘┘╪ذ┘è╪د┘

    // ┘ç┘ ┘┘è ╪ص╪▒┘â╪ر ┘à┘ê╪ش┘ê╪»╪ر ┘┘╪ث┘ê╪▒╪»╪▒ ╪»┘ç ┘┘è ╪ش╪»┘ê┘ ╪د┘┘à╪«╪▓┘ê┘╪ا
    const [existingMovement] = await db
      .select({ id: inventoryMovementsTable.id, reason: inventoryMovementsTable.reason })
      .from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.orderId, existing.id))
      .orderBy(desc(inventoryMovementsTable.id))
      .limit(1)
      .catch(() => []);

    // ظ¤ظ¤ warehouse_ready ظْ ┘╪د ╪ص╪▒┘â╪ر ┘à╪«╪▓┘ê┘ ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤
    if (newStatus === "warehouse_ready") {
      // ┘╪د ┘è┘ê╪ش╪» ╪«╪╡┘à ┘à┘ ╪د┘┘à╪«╪▓┘ê┘ ┘ç┘╪د ظ¤ ╪د┘╪«╪╡┘à ┘è╪ص╪»╪س ┘┘à╪د ┘è╪»╪«┘ ╪د┘╪ذ┘è╪د┘
    }

    if (newStatus === "in_shipping" && oldStatus !== "in_shipping") {
      if (existingMovement) {
        // ┘┘ê ╪د┘╪ص╪▒┘â╪ر ╪د┘┘à┘ê╪ش┘ê╪»╪ر adjustment (╪د┘┘à┘╪ز╪ش ┘â╪د┘ ┘┘è ╪د┘┘à╪«╪▓┘ê┘) ظْ ┘╪د╪▓┘à ┘╪«╪╡┘à ╪د┘┘à╪«╪▓┘ê┘ ╪»┘┘ê┘é╪ز┘è
        if (existingMovement.reason === "adjustment") {
          const { variantId, productId } = await resolveInventoryTarget(orderRef);
          await adjustWarehouseStock(existing.warehouseId, variantId, productId, -existing.quantity).catch(() => {});
          await syncProductQuantityFromWarehouses(variantId, productId).catch(() => {});
        }
        await updateMovementReason(existing.id, existingMovement.reason as any, "to_shipping" as any, "╪ز╪ص┘ê┘è┘ ┘╪┤╪▒┘â╪ر ╪د┘╪┤╪ص┘").catch(() => {});
      } else {
        // ┘à┘┘è╪┤ ╪ص╪▒┘â╪ر ظْ ╪د╪«╪╡┘à ┘à┘ ╪د┘┘à╪«╪▓┘ê┘ ┘ê╪│╪ش┘ّ┘ to_shipping
        await processToShipping(orderRef, existing.quantity, existing.id).catch(() => {});
      }
    }

    if (newStatus === "received") {
      if (existingMovement) {
        // لو to_shipping → المخزون اتخصم بالفعل → بس غيّر reason
        // لو adjustment أو غيره → لم يُخصم كبيع → نخصم دلوقتي
        if (existingMovement.reason !== "to_shipping") {
          const { variantId: vId, productId: pId } = await resolveInventoryTarget(orderRef);
          await adjustWarehouseStock(existing.warehouseId, vId, pId, -existing.quantity).catch(() => {});
          await syncProductQuantityFromWarehouses(vId, pId).catch(() => {});
        }
        // ┘┘è ╪ص╪▒┘â╪ر ┘à┘ê╪ش┘ê╪»╪ر ظْ ╪║┘è┘ّ╪▒ reason ┘┘ sale ┘┘é╪╖ (┘╪د ╪«╪╡┘à ╪ش╪»┘è╪»)
        await updateMovementReason(existing.id, existingMovement.reason as any, "sale", "╪ز┘à ╪د┘╪د╪│╪ز┘╪د┘à ظ¤ ╪ذ┘è╪╣").catch(() => {});
      } else {
        // ┘à┘┘è╪┤ ╪ص╪▒┘â╪ر ظْ ╪د╪«╪╡┘à ┘â╪ذ┘è╪╣ ┘à╪ذ╪د╪┤╪▒╪ر
        await processDelivery(orderRef, existing.quantity, "sale", existing.id).catch(() => {});
      }
    }

    if (newStatus === "partial_received") {
      if (existingMovement) {
        if (existingMovement.reason !== "to_shipping") {
          const { variantId: vId2, productId: pId2 } = await resolveInventoryTarget(orderRef);
          await adjustWarehouseStock(existing.warehouseId, vId2, pId2, -existing.quantity).catch(() => {});
          await syncProductQuantityFromWarehouses(vId2, pId2).catch(() => {});
        }
        // ┘┘è ╪ص╪▒┘â╪ر ┘à┘ê╪ش┘ê╪»╪ر ظْ ╪║┘è┘ّ╪▒ reason ┘┘ partial_sale ┘┘é╪╖ (┘╪د ╪«╪╡┘à ╪ش╪»┘è╪»)
        await updateMovementReason(existing.id, existingMovement.reason as any, "partial_sale", "╪د╪│╪ز┘╪د┘à ╪ش╪▓╪خ┘è").catch(() => {});
      } else {
        // ┘à┘┘è╪┤ ╪ص╪▒┘â╪ر ظْ ╪د╪«╪╡┘à ┘â╪ذ┘è╪╣ ╪ش╪▓╪خ┘è
        await processDelivery(orderRef, existing.quantity, "partial_sale", existing.id).catch(() => {});
      }
    }

    if (newStatus === "returned") {
      const returnReceived = data.returnReceived === true || data.returnReceived === 1;
      const isDamaged = data.isDamaged === true || data.isDamaged === 1;
      const { variantId, productId } = await resolveInventoryTarget(orderRef);

      if (existingMovement) {
        const wasDeducted = ["sale", "partial_sale", "to_shipping"].includes(existingMovement.reason ?? "");
        if (returnReceived) {
          if (isDamaged) {
            // المنتج تالف → لا يُضاف للمخزون، سجّل كـ damaged (خسارة)
            await updateMovementReason(existing.id, existingMovement.reason as any, "damaged" as any, "مرتجع تالف — لا يُضاف للمخزون، خسارة").catch(() => {});
          } else {
          // ╪ز┘à ╪د┘╪د╪│╪ز┘╪د┘à ظْ ╪ث╪▒╪ش╪╣ ╪د┘┘à╪«╪▓┘ê┘ ╪ذ╪د┘┘à┘ê╪ش╪ذ (IN) ┘┘ê ┘â╪د┘╪ز ┘à╪ز╪«╪╡┘ê┘à╪ر
            if (wasDeducted) {
              await adjustWarehouseStock(existing.warehouseId, variantId, productId, existing.quantity).catch(() => {});
              await syncProductQuantityFromWarehouses(variantId, productId).catch(() => {});
            }
            await updateMovementReason(existing.id, existingMovement.reason as any, "return", "┘à╪▒╪ز╪ش╪╣ ظ¤ ╪ز┘à ╪د┘╪د╪│╪ز┘╪د┘à ┘ê╪»╪«┘ ╪د┘┘à╪«╪▓┘").catch(() => {});
            }
        } else {
          // ┘à╪د╪▓╪د┘ ╪╣┘╪» ╪د┘╪┤╪ص┘ ظْ ┘╪د ╪ز╪▒╪ش╪╣ ╪د┘┘à╪«╪▓┘ê┘╪î ╪│╪ش┘ OUT
          await updateMovementReason(existing.id, existingMovement.reason as any, "return", "┘à╪▒╪ز╪ش╪╣ ظ¤ ┘à╪د╪▓╪د┘ ╪╣┘╪» ╪┤╪▒┘â╪ر ╪د┘╪┤╪ص┘").catch(() => {});
        }
      } else {
        const wasReceived = oldStatus === "received" || oldStatus === "partial_received";
        if (returnReceived) {
          // ╪ز┘à ╪د┘╪د╪│╪ز┘╪د┘à ظْ IN ┘à┘ê╪ش╪ذ
          await processReturn({ ...orderRef, quantity: existing.quantity }, wasReceived, isDamaged, existing.id).catch(() => {});
        } else {
          // ┘à╪د╪▓╪د┘ ╪╣┘╪» ╪د┘╪┤╪ص┘ ظْ OUT ╪│╪د┘╪ذ (┘╪د ┘è╪»╪«┘ ╪د┘┘à╪«╪▓┘)
          if (variantId || productId) {
            await recordMovement({
              product: existing.product ?? "┘à┘╪ز╪ش",
              color: existing.color,
              size: existing.size,
              quantity: existing.quantity,
              type: "OUT",
              reason: "return" as any,
              productId: productId ?? null,
              variantId: variantId ?? null,
              warehouseId: existing.warehouseId ?? null,
              orderId: existing.id,
              notes: "┘à╪▒╪ز╪ش╪╣ ظ¤ ┘à╪د╪▓╪د┘ ╪╣┘╪» ╪┤╪▒┘â╪ر ╪د┘╪┤╪ص┘",
            }).catch(() => {});
          }
        }
      }
    }

    if (oldStatus === "in_shipping" && newStatus !== "in_shipping" && newStatus !== "received" && newStatus !== "partial_received" && newStatus !== "returned") {
      // ╪ح┘╪║╪د╪ة ╪د┘╪┤╪ص┘ (╪▒╪ش╪╣ ┘┘ pending ┘à╪س┘╪د┘ï) ظْ ╪ث╪▒╪ش╪╣ ╪د┘┘à╪«╪▓┘ê┘ ┘ê╪╣╪»┘ّ┘ ╪د┘╪ص╪▒┘â╪ر
      if (existingMovement) {
        const { variantId, productId } = await resolveInventoryTarget(orderRef);
        await adjustWarehouseStock(existing.warehouseId, variantId, productId, existing.quantity).catch(() => {});
        await syncProductQuantityFromWarehouses(variantId, productId).catch(() => {});
        await updateMovementReason(existing.id, existingMovement.reason as any, "adjustment" as any, "╪ح┘╪║╪د╪ة ╪┤╪ص┘ ظ¤ ╪ح╪▒╪ش╪د╪╣ ┘┘┘à╪«╪▓┘ê┘").catch(() => {});
      } else {
        await reverseShipping(orderRef, existing.quantity, existing.id).catch(() => {});
      }
    }

    if (oldStatus === "received" && newStatus !== "received") {
      if (existingMovement) {
        // ┘┘è ╪ص╪▒┘â╪ر ┘à┘ê╪ش┘ê╪»╪ر ظْ ╪ث╪▒╪ش╪╣ ╪د┘┘à╪«╪▓┘ê┘ ┘ê╪╣╪»┘ّ┘ reason
        const { variantId, productId } = await resolveInventoryTarget(orderRef);
        await adjustWarehouseStock(existing.warehouseId, variantId, productId, existing.quantity).catch(() => {});
        await syncProductQuantityFromWarehouses(variantId, productId).catch(() => {});
        await updateMovementReason(existing.id, existingMovement.reason as any, "adjustment" as any, "╪ح┘╪║╪د╪ة ╪د╪│╪ز┘╪د┘à").catch(() => {});
      } else {
        await reverseDelivery(orderRef, existing.quantity, existing.id).catch(() => {});
      }
    }
  }

  // ── خصم المخزون عند الإغلاق المباشر (received) حتى لو الطلب في بيان ──────────
  // هذا يحدث لما المستخدم يضغط "إغلاق" مباشرة من صفحة الطلب
  // الشرط: تغيّر لـ received + كان في بيان + مفيش حركة to_shipping (مش مشحون فعلاً)
  if (
    newStatus !== oldStatus &&
    ["received", "partial_received"].includes(newStatus) &&
    !["received", "partial_received"].includes(oldStatus) &&
    isInManifest
  ) {
    try {
      const orderRef2 = { variantId: existing.variantId, productId: existing.productId, product: existing.product, color: existing.color, size: existing.size, warehouseId: existing.warehouseId };
      const [existingMovement2] = await db
        .select({ id: inventoryMovementsTable.id, reason: inventoryMovementsTable.reason })
        .from(inventoryMovementsTable)
        .where(eq(inventoryMovementsTable.orderId, existing.id))
        .orderBy(desc(inventoryMovementsTable.id))
        .limit(1)
        .catch(() => []);

      const alreadyDeducted = existingMovement2
        ? ["sale", "partial_sale", "to_shipping"].includes(existingMovement2.reason ?? "")
        : false;

      if (!alreadyDeducted) {
        // مفيش خصم تم — نخصم دلوقتي
        await processDelivery(
          orderRef2,
          existing.quantity,
          newStatus === "partial_received" ? "partial_sale" : "sale",
          existing.id
        ).catch(() => {});
      } else if (existingMovement2) {
        // في حركة موجودة — بس نحدّث الـ reason فقط
        await updateMovementReason(
          existing.id,
          existingMovement2.reason as any,
          newStatus === "partial_received" ? "partial_sale" : "sale",
          "تم الاستلام — بيع"
        ).catch(() => {});
      }
    } catch (_) {}
  }

  const before = { customerName: existing.customerName, product: existing.product, status: existing.status, quantity: existing.quantity, unitPrice: existing.unitPrice };

  await db.update(ordersTable)
    .set({ ...data, totalPrice: newTotalPrice, updatedAt: new Date() })
    .where(eq(ordersTable.id, params.data.id));

  // ── إضافة الإيراد للخزنة عند التسليم (received / partial_received) ──────────
  // لو الطلب في فاتورة متعددة → Transaction واحدة بإجمالي الكل تتعمل بعد كده
  // لو طلب فردي → transaction هنا مباشرة
  const isInvoiceGroup = !!existing.invoiceNumber;
  if (
    deliveredStatuses.includes(newStatus) &&
    !deliveredStatuses.includes(oldStatus) &&
    !isInvoiceGroup  // الفاتورة المتعددة بتتعالج بعد كده بـ transaction واحدة
  ) {
    try {
      const [mainRegister] = await db
        .select()
        .from(cashRegistersTable)
        .where(and(eq(cashRegistersTable.type, "main"), eq(cashRegistersTable.isActive, true)))
        .limit(1);

      if (mainRegister) {
        const targetRegister = (data as any).cashRegisterId
          ? (await db.select().from(cashRegistersTable).where(eq(cashRegistersTable.id, (data as any).cashRegisterId)).limit(1))[0] ?? mainRegister
          : mainRegister;
        const [existingTx] = await db
          .select({ id: cashTransactionsTable.id })
          .from(cashTransactionsTable)
          .where(and(
            eq(cashTransactionsTable.type, "order_collected" as any),
            eq(cashTransactionsTable.orderId, existing.id),
          ))
          .limit(1);

        if (!existingTx) {
          const amount    = newTotalPrice;
          const balBefore = Number(targetRegister.balance ?? 0);
          const balAfter  = balBefore + amount;
          const now       = new Date();
          await db.insert(cashTransactionsTable).values({
            registerId:      targetRegister.id,
            type:            "order_collected" as any,
            amount:          String(amount),
            balanceBefore:   String(balBefore),
            balanceAfter:    String(balAfter),
            description:     `تحصيل طلب #${existing.id} — ${existing.customerName}`,
            referenceNumber: String(existing.id),
            orderId:         existing.id,
            transactionDate: now,
            createdByUserId: req.user?.id ?? null,
            createdByName:   req.user?.displayName ?? null,
            createdAt:       now,
          });
          await db.update(cashRegistersTable)
            .set({ balance: String(balAfter), updatedAt: now })
            .where(eq(cashRegistersTable.id, targetRegister.id));
        }
      }
    } catch (_) {}
  }
  // ── إزالة الإيراد من الخزنة لو رجع من received لحالة تانية ──────────────────
  if (
    deliveredStatuses.includes(oldStatus) &&
    !deliveredStatuses.includes(newStatus)
  ) {
    try {
      const [txRow] = await db
        .select()
        .from(cashTransactionsTable)
        .where(and(
          eq(cashTransactionsTable.type, "order_collected" as any),
          eq(cashTransactionsTable.orderId, existing.id),
        ))
        .limit(1);
      if (txRow) {
        const amt = parseFloat(txRow.amount ?? "0");
        await db.update(cashRegistersTable).set({
          balance:   sql`balance - ${amt}`,
          updatedAt: new Date(),
        }).where(eq(cashRegistersTable.id, txRow.registerId));
        await db.delete(cashTransactionsTable).where(eq(cashTransactionsTable.id, txRow.id));
      }
    } catch (_) {}
  }
  // ─────────────────────────────────────────────────────────────────────────────

  // لو الحالة اتغيرت وفيه invoiceNumber → غير كل منتجات الـ invoice بنفس الحالة
  if (data.status && data.status !== oldStatus && existing.invoiceNumber) {
    // بناء الـ set object — لو returned نضيف returnReason وباقي حقول المرتجع
    const bulkSet: Record<string, any> = { status: data.status, updatedAt: new Date() };
    if (data.status === "returned") {
      if (data.returnReason !== undefined) bulkSet.returnReason = data.returnReason;
      if (data.returnNote !== undefined) bulkSet.returnNote = data.returnNote;
      if (data.returnReceived !== undefined) bulkSet.returnReceived = data.returnReceived === true ? 1 : data.returnReceived === false ? 0 : data.returnReceived;
      if (data.isDamaged !== undefined) bulkSet.isDamaged = data.isDamaged ? 1 : 0;
    }
    await db.update(ordersTable)
      .set(bulkSet)
      .where(and(
        eq(ordersTable.invoiceNumber, existing.invoiceNumber),
        isNull(ordersTable.deletedAt),
      ));

    // ━━ Inventory للأوردرات الأخرى في نفس الفاتورة ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // الأوردر الحالي (existing.id) اتعالج inventory-ه فوق — هنا نعالج الباقين فقط
    const siblingOrders = await db
      .select()
      .from(ordersTable)
      .where(and(
        eq(ordersTable.invoiceNumber, existing.invoiceNumber),
        isNull(ordersTable.deletedAt),
      ));

    for (const sibling of siblingOrders) {
      if (sibling.id === existing.id) continue; // اتعالج inventory-ه فوق

      // عند received: نخصم المخزون بغض النظر عن البيان (الإغلاق يدوي مش من البيان)
      // عند باقي الحالات: لو في بيان → البيان هو المسؤول
      const skipForManifest = data.status !== "received" && data.status !== "partial_received";
      if (skipForManifest) {
        const [siblingManifestLink] = await db
          .select({ id: shippingManifestOrdersTable.id })
          .from(shippingManifestOrdersTable)
          .where(eq(shippingManifestOrdersTable.orderId, sibling.id))
          .limit(1)
          .catch(() => []);
        if (siblingManifestLink) continue;
      }

      const siblingRef = {
        variantId: sibling.variantId,
        productId: sibling.productId,
        product: sibling.product,
        color: sibling.color,
        size: sibling.size,
        warehouseId: sibling.warehouseId,
      };

      const [siblingMovement] = await db
        .select({ id: inventoryMovementsTable.id, reason: inventoryMovementsTable.reason })
        .from(inventoryMovementsTable)
        .where(eq(inventoryMovementsTable.orderId, sibling.id))
        .orderBy(desc(inventoryMovementsTable.id))
        .limit(1)
        .catch(() => []);

      if (data.status === "in_shipping" && oldStatus !== "in_shipping") {
        if (siblingMovement) {
          if (siblingMovement.reason === "adjustment") {
            const { variantId, productId } = await resolveInventoryTarget(siblingRef);
            await adjustWarehouseStock(sibling.warehouseId, variantId, productId, -sibling.quantity).catch(() => {});
            await syncProductQuantityFromWarehouses(variantId, productId).catch(() => {});
          }
          await updateMovementReason(sibling.id, siblingMovement.reason as any, "to_shipping" as any, "تحويل لشركة الشحن").catch(() => {});
        } else {
          await processToShipping(siblingRef, sibling.quantity, sibling.id).catch(() => {});
        }
      }

      if (data.status === "received") {
        // خصم المخزون لكل sibling
        if (siblingMovement) {
          // لو to_shipping → اتخصم بالفعل → بس غيّر reason
          // لو adjustment أو غيره → لم يُخصم → نخصم دلوقتي
          if (siblingMovement.reason !== "to_shipping") {
            const { variantId: sVid, productId: sPid } = await resolveInventoryTarget(siblingRef);
            await adjustWarehouseStock(sibling.warehouseId, sVid, sPid, -sibling.quantity).catch(() => {});
            await syncProductQuantityFromWarehouses(sVid, sPid).catch(() => {});
          }
          await updateMovementReason(sibling.id, siblingMovement.reason as any, "sale", "تم الاستلام — بيع").catch(() => {});
        } else {
          await processDelivery(siblingRef, sibling.quantity, "sale", sibling.id).catch(() => {});
        }
        // لا نعمل transaction هنا — هتتعمل transaction واحدة شاملة بعد اللوب
      }

      if (data.status === "partial_received") {
        if (siblingMovement) {
          // لو adjustment أو غيره → لم يُخصم → نخصم دلوقتي
          if (siblingMovement.reason !== "to_shipping") {
            const { variantId: sVid2, productId: sPid2 } = await resolveInventoryTarget(siblingRef);
            await adjustWarehouseStock(sibling.warehouseId, sVid2, sPid2, -sibling.quantity).catch(() => {});
            await syncProductQuantityFromWarehouses(sVid2, sPid2).catch(() => {});
          }
          await updateMovementReason(sibling.id, siblingMovement.reason as any, "partial_sale", "استلام جزئي").catch(() => {});
        } else {
          await processDelivery(siblingRef, sibling.quantity, "partial_sale", sibling.id).catch(() => {});
        }
        // لا نعمل transaction هنا — هتتعمل transaction واحدة شاملة بعد اللوب
      }

      if (data.status === "returned") {
        const returnReceived = data.returnReceived === true || data.returnReceived === 1;
        const isDamaged = data.isDamaged === true || data.isDamaged === 1;
        const { variantId, productId } = await resolveInventoryTarget(siblingRef);

        if (siblingMovement) {
          const wasDeducted = ["sale", "partial_sale", "to_shipping"].includes(siblingMovement.reason ?? "");
          if (returnReceived) {
            if (isDamaged) {
              await updateMovementReason(sibling.id, siblingMovement.reason as any, "damaged" as any, "مرتجع تالف").catch(() => {});
            } else {
              if (wasDeducted) {
                await adjustWarehouseStock(sibling.warehouseId, variantId, productId, sibling.quantity).catch(() => {});
                await syncProductQuantityFromWarehouses(variantId, productId).catch(() => {});
              }
              await updateMovementReason(sibling.id, siblingMovement.reason as any, "return", "مرتجع — تم الاستلام ودخل المخزن").catch(() => {});
            }
          } else {
            await updateMovementReason(sibling.id, siblingMovement.reason as any, "return", "مرتجع — مازال عند شركة الشحن").catch(() => {});
          }
        } else {
          const wasReceived = oldStatus === "received" || oldStatus === "partial_received";
          if (returnReceived) {
            await processReturn({ ...siblingRef, quantity: sibling.quantity }, wasReceived, isDamaged, sibling.id).catch(() => {});
          } else {
            if (variantId || productId) {
              await recordMovement({
                product: sibling.product ?? "منتج",
                color: sibling.color,
                size: sibling.size,
                quantity: sibling.quantity,
                type: "OUT",
                reason: "return" as any,
                productId: productId ?? null,
                variantId: variantId ?? null,
                warehouseId: sibling.warehouseId ?? null,
                orderId: sibling.id,
                notes: "مرتجع — مازال عند شركة الشحن",
              }).catch(() => {});
            }
          }
        }
      }

      if (oldStatus === "in_shipping" && data.status !== "in_shipping" && data.status !== "received" && data.status !== "partial_received" && data.status !== "returned") {
        if (siblingMovement) {
          const { variantId, productId } = await resolveInventoryTarget(siblingRef);
          await adjustWarehouseStock(sibling.warehouseId, variantId, productId, sibling.quantity).catch(() => {});
          await syncProductQuantityFromWarehouses(variantId, productId).catch(() => {});
          await updateMovementReason(sibling.id, siblingMovement.reason as any, "adjustment" as any, "إلغاء شحن — إرجاع للمخزون").catch(() => {});
        } else {
          await reverseShipping(siblingRef, sibling.quantity, sibling.id).catch(() => {});
        }
      }

      if (oldStatus === "received" && data.status !== "received") {
        if (siblingMovement) {
          const { variantId, productId } = await resolveInventoryTarget(siblingRef);
          await adjustWarehouseStock(sibling.warehouseId, variantId, productId, sibling.quantity).catch(() => {});
          await syncProductQuantityFromWarehouses(variantId, productId).catch(() => {});
          await updateMovementReason(sibling.id, siblingMovement.reason as any, "adjustment" as any, "إلغاء استلام").catch(() => {});
        } else {
          await reverseDelivery(siblingRef, sibling.quantity, sibling.id).catch(() => {});
        }
      }
    }
    // ━━ Transaction واحدة شاملة لكل الفاتورة عند received / partial_received ━━━━
    if (deliveredStatuses.includes(newStatus) && !deliveredStatuses.includes(oldStatus)) {
      try {
        const [mainReg] = await db.select().from(cashRegistersTable)
          .where(and(eq(cashRegistersTable.type, "main"), eq(cashRegistersTable.isActive, true)))
          .limit(1);
        if (mainReg) {
          const targetReg = (data as any).cashRegisterId
            ? (await db.select().from(cashRegistersTable).where(eq(cashRegistersTable.id, (data as any).cashRegisterId)).limit(1))[0] ?? mainReg
            : mainReg;
          // نجمع كل totalPrice لكل الأوردرات في الفاتورة (existing + siblings)
          const totalInvoiceAmount = siblingOrders.reduce(
            (sum, o) => sum + Number(o.totalPrice ?? 0), 0
          );
          // تأكد مفيش transaction مسجلة بالفعل لهذه الفاتورة
          const [existingInvoiceTx] = await db
            .select({ id: cashTransactionsTable.id })
            .from(cashTransactionsTable)
            .where(and(
              eq(cashTransactionsTable.type, "order_collected" as any),
              eq(cashTransactionsTable.referenceNumber, existing.invoiceNumber!),
            ))
            .limit(1);
          if (!existingInvoiceTx) {
            const balBefore = Number(targetReg.balance ?? 0);
            const balAfter  = balBefore + totalInvoiceAmount;
            const now       = new Date();
            await db.insert(cashTransactionsTable).values({
              registerId:      targetReg.id,
              type:            "order_collected" as any,
              amount:          String(totalInvoiceAmount),
              balanceBefore:   String(balBefore),
              balanceAfter:    String(balAfter),
              description:     `تحصيل فاتورة #${existing.invoiceNumber} — ${existing.customerName}`,
              referenceNumber: existing.invoiceNumber!,
              orderId:         existing.id,
              transactionDate: now,
              createdByUserId: req.user?.id ?? null,
              createdByName:   req.user?.displayName ?? null,
              createdAt:       now,
            });
            await db.update(cashRegistersTable)
              .set({ balance: String(balAfter), updatedAt: now })
              .where(eq(cashRegistersTable.id, targetReg.id));
          }
        }
      } catch (_) {}
    }
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  }

  const [updated] = await db.select().from(ordersTable).where(eq(ordersTable.id, params.data.id));
  if (!updated) { res.status(500).json({ error: "Update failed" }); return; }
  // ظ…ط³ط­ cache ط§ظ„ظ€ analytics ظپظˆط±ط§ظ‹ ط¹ط´ط§ظ† ط§ظ„ط¯ط§ط´ط¨ظˆط±ط¯ ظٹطھط­ط¯ط« real-time
  invalidateChartsCache(getTenantId(req));
  invalidateSmartCache(getTenantId(req));

  const after = { customerName: updated.customerName, product: updated.product, status: updated.status, quantity: updated.quantity, unitPrice: updated.unitPrice };
  await logAudit({ action: "update", entityType: "order", entityId: updated.id, entityName: `${updated.customerName} ظ¤ ${updated.product}`, before, after: diffObjects(before, after), userId: (req as any).user?.id, userName: (req as any).user?.displayName });

  res.json(UpdateOrderResponse.parse(updated));
});

// ظ¤ظ¤ظ¤ Delete single order (soft delete) ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤ظ¤

router.delete("/orders/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [existing] = await db.select().from(ordersTable).where(and(eq(ordersTable.id, id), isNull(ordersTable.deletedAt)));
  if (!existing) { res.status(404).json({ error: "Order not found" }); return; }

  const userRole = (req as any).user?.role;
  if (LOCKED_STATUSES.includes(existing.status as any) && userRole !== "admin") {
    res.status(403).json({ error: "┘ç╪░╪د ╪د┘╪╖┘╪ذ ┘à┘é┘┘ ┘ê┘╪د ┘è┘à┘â┘ ╪ص╪░┘┘ç" });
    return;
  }


  // ━━ إرجاع المخزون + خصم الخزنة عند الحذف ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const orderRef = {
    variantId: existing.variantId,
    productId: existing.productId,
    product: existing.product,
    color: existing.color,
    size: existing.size,
    warehouseId: existing.warehouseId,
  };

  const [manifestLink] = await db
    .select({ id: shippingManifestOrdersTable.id })
    .from(shippingManifestOrdersTable)
    .where(eq(shippingManifestOrdersTable.orderId, existing.id))
    .limit(1)
    .catch(() => []);

  if (!manifestLink) {
    const [existingMovement] = await db
      .select({ id: inventoryMovementsTable.id, reason: inventoryMovementsTable.reason })
      .from(inventoryMovementsTable)
      .where(eq(inventoryMovementsTable.orderId, existing.id))
      .orderBy(desc(inventoryMovementsTable.id))
      .limit(1)
      .catch(() => []);

    const deductedStatuses = ["in_shipping", "received", "partial_received"];
    const wasDeducted = existingMovement
      ? ["sale", "partial_sale", "to_shipping"].includes(existingMovement.reason ?? "")
      : deductedStatuses.includes(existing.status ?? "");

    if (wasDeducted) {
      const { variantId, productId } = await resolveInventoryTarget(orderRef);
      await adjustWarehouseStock(existing.warehouseId, variantId, productId, existing.quantity).catch(() => {});
      await syncProductQuantityFromWarehouses(variantId, productId).catch(() => {});
      if (existingMovement) {
        await updateMovementReason(existing.id, existingMovement.reason as any, "adjustment" as any, "حذف الطلب — إرجاع للمخزون").catch(() => {});
      }
    }
  }

  // خصم الخزنة لو في transaction مرتبطة بالطلب
  try {
    const [txRow] = await db
      .select()
      .from(cashTransactionsTable)
      .where(and(
        eq(cashTransactionsTable.type, "order_collected"),
        eq(cashTransactionsTable.orderId, existing.id),
      ))
      .limit(1);
    if (txRow) {
      const amt = parseFloat(txRow.amount ?? "0");
      await db.update(cashRegistersTable).set({
        balance: sql`balance - ${amt}`,
        updatedAt: new Date(),
      }).where(eq(cashRegistersTable.id, txRow.registerId));
      await db.delete(cashTransactionsTable).where(eq(cashTransactionsTable.id, txRow.id));
    }
  } catch (_) {}
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  await db.update(ordersTable).set({ deletedAt: new Date() }).where(eq(ordersTable.id, id));

  await logAudit({
    action: "delete", entityType: "order", entityId: id,
    entityName: `${existing.customerName} ظ¤ ${existing.product}`,
    before: { customerName: existing.customerName, product: existing.product, status: existing.status },
    userId: (req as any).user?.id, userName: (req as any).user?.displayName,
  });

  res.status(204).send();
});

export default router;
