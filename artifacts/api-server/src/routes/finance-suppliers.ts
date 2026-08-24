import { Router, type IRouter } from "express";
import { eq, desc, and, sql, or, like, isNull } from "drizzle-orm";
import {
  db, suppliersTable, purchaseOrdersTable, purchaseOrderItemsTable,
  cashRegistersTable, cashTransactionsTable,
} from "@workspace/db";
import ExcelJS from "exceljs";
import { z } from "zod";
import { getTenantId } from "../middlewares/requireTenant.js";

const router: IRouter = Router();

const SupplierSchema = z.object({
  name: z.string().min(1), phone: z.string().nullish(), email: z.string().nullish(),
  address: z.string().nullish(), country: z.string().nullish(), category: z.string().nullish(),
  taxNumber: z.string().nullish(), paymentTerms: z.string().nullish(),
  notes: z.string().nullish(), isActive: z.boolean().default(true),
});
const PurchaseItemSchema = z.object({
  productId: z.number().nullish(), variantId: z.number().nullish(),
  productName: z.string().min(1), color: z.string().nullish(), size: z.string().nullish(),
  sku: z.string().nullish(), quantity: z.number().int().min(1), unitCost: z.number().min(0),
  notes: z.string().nullish(),
});
const PurchaseOrderSchema = z.object({
  supplierId: z.number().nullish(), supplierName: z.string().nullish(),
  warehouseId: z.number().nullish(),
  status: z.enum(["draft","ordered","received","partial_received","cancelled"]).default("draft"),
  shippingCost: z.number().default(0), taxAmount: z.number().default(0),
  discountAmount: z.number().default(0), notes: z.string().nullish(),
  expectedDate: z.string().nullish(), items: z.array(PurchaseItemSchema).min(1),
});

const PAY_LABEL: Record<string,string> = { unpaid:"غير مدفوع", partial:"جزئي", paid:"مدفوع" };
const STA_LABEL: Record<string,string> = {
  draft:"مسودة", ordered:"تم الطلب", received:"تم الاستلام",
  partial_received:"استلام جزئي", cancelled:"ملغي",
};
const CAT_LABEL: Record<string,string> = {
  raw_materials:"خامات", products:"منتجات", packaging:"تغليف", services:"خدمات", other:"أخرى",
};

// ── Suppliers ──────────────────────────────────────────────────────────────
router.get("/finance/suppliers", async (req, res): Promise<void> => {
  const { search, category } = req.query as Record<string, string>;
  const tenantId = getTenantId(req);
  const conds: any[] = tenantId !== null ? [eq(suppliersTable.tenantId, tenantId)] : [];
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    conds.push(or(like(suppliersTable.name, q), like(suppliersTable.phone, q), like(suppliersTable.email, q)));
  }
  if (category?.trim() && category !== "all") conds.push(eq(suppliersTable.category, category.trim()));
  const rows = await db.select().from(suppliersTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(suppliersTable.createdAt));
  res.json(rows);
});

// ── المورد الافتراضي ────────────────────────────────────────────────────────
router.get("/finance/suppliers/default", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const conds: any[] = [eq(suppliersTable.isDefault, true)];
  if (tenantId !== null) conds.push(eq(suppliersTable.tenantId, tenantId));
  const [supplier] = await db.select().from(suppliersTable).where(and(...conds)).limit(1);
  if (!supplier) { res.status(404).json({ message: "لا يوجد مورد افتراضي" }); return; }
  res.json(supplier);
});

// ── تعيين مورد كافتراضي (يلغي السابق) ────────────────────────────────────
router.patch("/finance/suppliers/:id/set-default", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const supplierId = parseInt(req.params.id);
  if (isNaN(supplierId)) { res.status(400).json({ message: "id غير صالح" }); return; }

  // ألغِ الافتراضي القديم
  const clearConds: any[] = [eq(suppliersTable.isDefault, true)];
  if (tenantId !== null) clearConds.push(eq(suppliersTable.tenantId, tenantId));
  await db.update(suppliersTable).set({ isDefault: false, updatedAt: new Date() }).where(and(...clearConds));

  // عيّن الجديد
  const setConds: any[] = [eq(suppliersTable.id, supplierId)];
  if (tenantId !== null) setConds.push(eq(suppliersTable.tenantId, tenantId));
  await db.update(suppliersTable).set({ isDefault: true, updatedAt: new Date() }).where(and(...setConds));

  const [updated] = await db.select().from(suppliersTable).where(and(...setConds)).limit(1);
  res.json(updated);
});

router.get("/finance/suppliers/export-excel", async (req, res): Promise<void> => {
  const { search, category } = req.query as Record<string, string>;
  const tenantId = getTenantId(req);
  const conds: any[] = tenantId !== null ? [eq(suppliersTable.tenantId, tenantId)] : [];
  if (search?.trim()) { const q = `%${search.trim()}%`; conds.push(or(like(suppliersTable.name, q), like(suppliersTable.phone, q))); }
  if (category?.trim() && category !== "all") conds.push(eq(suppliersTable.category, category.trim()));
  const rows = await db.select().from(suppliersTable)
    .where(conds.length ? and(...conds) : undefined).orderBy(desc(suppliersTable.createdAt));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("الموردون");
  ws.views = [{ rightToLeft: true }];
  ws.columns = [
    { header:"#", key:"id", width:6 }, { header:"الاسم", key:"name", width:28 },
    { header:"الفئة", key:"cat", width:18 }, { header:"هاتف", key:"phone", width:16 },
    { header:"بريد", key:"email", width:24 }, { header:"شروط الدفع", key:"terms", width:20 },
    { header:"الرصيد", key:"balance", width:14 }, { header:"الحالة", key:"active", width:10 },
  ];
  ws.getRow(1).font = { bold:true, size:11 };
  ws.getRow(1).fill = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFE2E8F0" } };
  rows.forEach(s => ws.addRow({
    id: s.id, name: s.name, cat: CAT_LABEL[s.category ?? ""] ?? s.category ?? "",
    phone: s.phone ?? "", email: s.email ?? "", terms: s.paymentTerms ?? "",
    balance: parseFloat(s.balance ?? "0"), active: s.isActive ? "نشط" : "غير نشط",
  }));
  res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition",`attachment; filename="suppliers.xlsx"`);
  await wb.xlsx.write(res); res.end();
});

router.post("/finance/suppliers", async (req, res): Promise<void> => {
  const parsed = SupplierSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date();
  const tenantId = getTenantId(req);
  const result = await db.insert(suppliersTable).values({
    ...parsed.data, balance:"0", createdAt:now, updatedAt:now,
    ...(tenantId !== null ? { tenantId } : {}),
  });
  const id = (result as any)[0]?.insertId;
  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  res.status(201).json(s);
});

router.patch("/finance/suppliers/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const parsed = SupplierSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await db.update(suppliersTable).set({ ...parsed.data, updatedAt:new Date() }).where(eq(suppliersTable.id, id));
  const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!s) { res.status(404).json({ error:"Supplier not found" }); return; }
  res.json(s);
});

router.delete("/finance/suppliers/:id", async (req, res): Promise<void> => {
  try {
    const id = parseInt(req.params.id);
    // تحقق من وجود أوامر شراء مرتبطة
    const relatedOrders = await db.select({ id: purchaseOrdersTable.id })
      .from(purchaseOrdersTable)
      .where(eq(purchaseOrdersTable.supplierId, id))
      .limit(1);
    if (relatedOrders.length > 0) {
      res.status(400).json({ error: "لا يمكن حذف المورد — يوجد أوامر شراء مرتبطة به" });
      return;
    }
    await db.delete(suppliersTable).where(eq(suppliersTable.id, id));
    res.status(204).send();
  } catch (err) {
    console.error("[DELETE supplier]", err);
    res.status(500).json({ error: "فشل حذف المورد" });
  }
});

// ── Supplier Statement ──────────────────────────────────────────────────────
router.get("/finance/suppliers/:id/statement", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { from, to } = req.query as Record<string, string>;
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!supplier) { res.status(404).json({ error:"المورد غير موجود" }); return; }
  const conds: any[] = [eq(purchaseOrdersTable.supplierId, id)];
  if (from) conds.push(sql`${purchaseOrdersTable.createdAt} >= ${new Date(from)}`);
  if (to)   conds.push(sql`${purchaseOrdersTable.createdAt} <= ${new Date(to + "T23:59:59")}`);
  const orders = await db.select().from(purchaseOrdersTable).where(and(...conds)).orderBy(desc(purchaseOrdersTable.createdAt));
  const totalAmount = orders.reduce((s,o) => s + parseFloat(o.totalAmount??"0"), 0);
  const totalPaid   = orders.reduce((s,o) => s + parseFloat(o.paidAmount ??"0"), 0);
  res.json({ supplier, orders, summary:{ totalOrders:orders.length, totalAmount, totalPaid, totalUnpaid:totalAmount-totalPaid } });
});

router.get("/finance/suppliers/:id/statement/export-excel", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { from, to } = req.query as Record<string, string>;
  const [supplier] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!supplier) { res.status(404).json({ error:"المورد غير موجود" }); return; }
  const conds: any[] = [eq(purchaseOrdersTable.supplierId, id)];
  if (from) conds.push(sql`${purchaseOrdersTable.createdAt} >= ${new Date(from)}`);
  if (to)   conds.push(sql`${purchaseOrdersTable.createdAt} <= ${new Date(to + "T23:59:59")}`);
  const orders = await db.select().from(purchaseOrdersTable).where(and(...conds)).orderBy(desc(purchaseOrdersTable.createdAt));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("كشف حساب");
  ws.views = [{ rightToLeft:true }];
  ws.mergeCells("A1:H1");
  ws.getCell("A1").value = `كشف حساب — ${supplier.name}`;
  ws.getCell("A1").font  = { bold:true, size:14 };
  ws.getCell("A1").alignment = { horizontal:"center" };
  ws.addRow([]);
  ws.columns = [
    { header:"رقم الأمر", key:"po", width:18 }, { header:"التاريخ", key:"date", width:14 },
    { header:"الحالة", key:"status", width:16 }, { header:"الإجمالي", key:"total", width:14 },
    { header:"المدفوع", key:"paid", width:14 }, { header:"المتبقي", key:"due", width:14 },
    { header:"حالة الدفع", key:"payStatus", width:14 }, { header:"ملاحظات", key:"notes", width:28 },
  ];
  const hdr = ws.getRow(3); hdr.font = { bold:true }; hdr.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFE2E8F0" } };
  orders.forEach(o => {
    const total = parseFloat(o.totalAmount??"0"); const paid = parseFloat(o.paidAmount??"0");
    ws.addRow({ po:o.poNumber, date:o.createdAt?new Date(o.createdAt).toLocaleDateString("ar-EG"):"",
      status:STA_LABEL[o.status??""]??o.status??"", total, paid, due:total-paid,
      payStatus:PAY_LABEL[o.paymentStatus??""]??o.paymentStatus??"", notes:o.notes??"" });
  });
  res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition",`attachment; filename="supplier-statement-${id}.xlsx"`);
  await wb.xlsx.write(res); res.end();
});

// ── Purchase Orders ─────────────────────────────────────────────────────────
router.get("/finance/purchases", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const conds: any[] = tenantId !== null ? [eq(purchaseOrdersTable.tenantId, tenantId)] : [];
  const orders = await db.select().from(purchaseOrdersTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(purchaseOrdersTable.createdAt));
  res.json(orders);
});

router.get("/finance/purchases/export-excel", async (req, res): Promise<void> => {
  const { search, paymentStatus, status, supplierId, from, to } = req.query as Record<string,string>;
  const tenantId = getTenantId(req);
  const conds: any[] = tenantId !== null ? [eq(purchaseOrdersTable.tenantId, tenantId)] : [];
  let orders = await db.select().from(purchaseOrdersTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(purchaseOrdersTable.createdAt));
  const allSupp = await db.select().from(suppliersTable)
    .where(tenantId !== null ? eq(suppliersTable.tenantId, tenantId) : undefined);
  const suppMap: Record<number,string> = {};
  allSupp.forEach(s => { suppMap[s.id] = s.name; });
  if (search?.trim()) {
    const q = search.trim().toLowerCase();
    orders = orders.filter(o =>
      o.poNumber?.toLowerCase().includes(q) ||
      (suppMap[o.supplierId??0]??o.supplierName??"").toLowerCase().includes(q) ||
      o.notes?.toLowerCase().includes(q)
    );
  }
  if (paymentStatus && paymentStatus !== "all") orders = orders.filter(o => o.paymentStatus === paymentStatus);
  if (status && status !== "all")               orders = orders.filter(o => o.status === status);
  if (supplierId && supplierId !== "all")        orders = orders.filter(o => String(o.supplierId) === supplierId);
  if (from) orders = orders.filter(o => o.createdAt && new Date(o.createdAt) >= new Date(from));
  if (to)   orders = orders.filter(o => o.createdAt && new Date(o.createdAt) <= new Date(to+"T23:59:59"));
  const totalAmt  = orders.reduce((s,o) => s + parseFloat(o.totalAmount??"0"), 0);
  const totalPaid = orders.reduce((s,o) => s + parseFloat(o.paidAmount ??"0"), 0);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("أوامر الشراء");
  ws.views = [{ rightToLeft:true }];
  ws.mergeCells("A1:I1");
  ws.getCell("A1").value = `أوامر الشراء — ${orders.length} أمر | الإجمالي: ${totalAmt.toLocaleString("ar-EG")} ج.م | المدفوع: ${totalPaid.toLocaleString("ar-EG")} ج.م | المتبقي: ${(totalAmt-totalPaid).toLocaleString("ar-EG")} ج.م`;
  ws.getCell("A1").font  = { bold:true, size:11 };
  ws.getCell("A1").fill  = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFDBEAFE" } };
  ws.addRow([]);
  ws.columns = [
    { header:"رقم الأمر", key:"po", width:20 }, { header:"التاريخ", key:"date", width:13 },
    { header:"المورد", key:"supplier", width:22 }, { header:"حالة الطلب", key:"status", width:16 },
    { header:"الإجمالي", key:"total", width:14 }, { header:"المدفوع", key:"paid", width:14 },
    { header:"المتبقي", key:"due", width:14 }, { header:"حالة الدفع", key:"payStatus", width:14 },
    { header:"ملاحظات", key:"notes", width:30 },
  ];
  const hdr = ws.getRow(3); hdr.font = { bold:true, size:10 }; hdr.fill = { type:"pattern", pattern:"solid", fgColor:{ argb:"FFE2E8F0" } };
  orders.forEach(o => {
    const total = parseFloat(o.totalAmount??"0"); const paid = parseFloat(o.paidAmount??"0");
    const row = ws.addRow({
      po: o.poNumber, date: o.createdAt?new Date(o.createdAt).toLocaleDateString("ar-EG"):"",
      supplier: suppMap[o.supplierId??0]??o.supplierName??"—",
      status: STA_LABEL[o.status??""]??o.status??"",
      total, paid, due: total-paid,
      payStatus: PAY_LABEL[o.paymentStatus??""]??o.paymentStatus??"",
      notes: o.notes??"",
    });
    if (o.paymentStatus === "unpaid")  row.getCell("payStatus").font = { color:{ argb:"FFE53E3E" } };
    if (o.paymentStatus === "partial") row.getCell("payStatus").font = { color:{ argb:"FFD97706" } };
    if (o.paymentStatus === "paid")    row.getCell("payStatus").font = { color:{ argb:"FF059669" } };
  });
  res.setHeader("Content-Type","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition",`attachment; filename="purchases.xlsx"`);
  await wb.xlsx.write(res); res.end();
});

router.get("/finance/purchases/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!order) { res.status(404).json({ error:"Purchase order not found" }); return; }
  const items = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, id));
  res.json({ ...order, items });
});

router.post("/finance/purchases", async (req, res): Promise<void> => {
  const parsed = PurchaseOrderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date();
  const tenantId = getTenantId(req);
  const { items, ...orderData } = parsed.data;
  const totalAmount = items.reduce((s,i) => s + i.quantity * i.unitCost, 0)
    + (orderData.shippingCost??0) + (orderData.taxAmount??0) - (orderData.discountAmount??0);
  const poNumber = `PO-${Date.now()}`;
  const result = await db.insert(purchaseOrdersTable).values({
    ...orderData,
    ...(orderData.shippingCost   !== undefined ? { shippingCost:   String(orderData.shippingCost) } : {}),
    ...(orderData.taxAmount      !== undefined ? { taxAmount:      String(orderData.taxAmount) } : {}),
    ...(orderData.discountAmount !== undefined ? { discountAmount: String(orderData.discountAmount) } : {}),
    poNumber, totalAmount:String(totalAmount),
    paidAmount:"0", paymentStatus:"unpaid", createdAt:now, updatedAt:now,
    ...(tenantId !== null ? { tenantId } : {}),
  } as any);
  const poId = (result as any)[0]?.insertId;
  for (const item of items) {
    await db.insert(purchaseOrderItemsTable).values({
      purchaseOrderId:poId, ...item, unitCost:String(item.unitCost), receivedQuantity:0, totalCost:String(item.quantity*item.unitCost),
    } as any);
  }
  const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, poId));
  const newItems = await db.select().from(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, poId));
  res.status(201).json({ ...order, items:newItems });
});

// ── helper: جيب الخزنة الافتراضية أو أول خزنة نشطة ─────────────────────
async function getDefaultRegister() {
  const regs = await db.select().from(cashRegistersTable)
    .where(eq(cashRegistersTable.isActive, true))
    .orderBy(cashRegistersTable.id);
  return (regs.find((r: any) => r.isDefault) ?? regs.find((r: any) => r.type === "main") ?? regs[0]) ?? null;
}

router.patch("/finance/purchases/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const { status, paymentStatus, paidAmount, notes } = req.body;
  const now = new Date();

  const [ob] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!ob) { res.status(404).json({ error:"أمر الشراء مش موجود" }); return; }

  const prevPay  = ob.paymentStatus ?? "unpaid";
  const newPay   = paymentStatus ?? prevPay;
  const prevPaid = parseFloat(ob.paidAmount ?? "0");
  const total    = parseFloat(ob.totalAmount ?? "0");

  // ── حساب المبلغ الجديد المدفوع ────────────────────────────────────────────
  let newPaidAmt: number;
  if (newPay === "unpaid")  newPaidAmt = 0;
  else if (newPay === "paid") newPaidAmt = total;
  else newPaidAmt = Math.min(Math.max(parseFloat(paidAmount ?? "0"), 0), total); // partial

  const delta = newPaidAmt - prevPaid; // موجب = خصم، سالب = إرجاع

  try {
    if (delta > 0) {
      // ── خصم من الخزنة ──────────────────────────────────────────────────
      const reg = await getDefaultRegister();
      if (!reg) { res.status(400).json({ error:"لا توجد خزنة نشطة" }); return; }
      const bb = parseFloat(reg.balance ?? "0");
      if (bb < delta) {
        res.status(400).json({ error:`رصيد الخزنة "${reg.name}" مش كفاية — المتاح: ${bb.toLocaleString("ar-EG")} ج.م` });
        return;
      }
      const ba = bb - delta;
      await db.update(cashRegistersTable).set({ balance:String(ba), updatedAt:now }).where(eq(cashRegistersTable.id, reg.id));
      await db.insert(cashTransactionsTable).values({
        registerId:reg.id, type:"purchase_paid", amount:String(delta),
        balanceBefore:String(bb), balanceAfter:String(ba),
        purchaseOrderId:id,
        description:`دفع ${newPay==="paid"?"كامل":"جزئي"} — أمر شراء ${ob.poNumber}`,
        referenceNumber:ob.poNumber, transactionDate:now, createdAt:now,
      });

    } else if (delta < 0) {
      // ── إرجاع للخزنة ───────────────────────────────────────────────────
      const refund = Math.abs(delta);
      const reg = await getDefaultRegister();
      if (reg) {
        const bb = parseFloat(reg.balance ?? "0");
        const ba = bb + refund;
        await db.update(cashRegistersTable).set({ balance:String(ba), updatedAt:now }).where(eq(cashRegistersTable.id, reg.id));
        await db.insert(cashTransactionsTable).values({
          registerId:reg.id, type:"deposit", amount:String(refund),
          balanceBefore:String(bb), balanceAfter:String(ba),
          purchaseOrderId:id,
          description:`إرجاع دفع — أمر شراء ${ob.poNumber}`,
          referenceNumber:ob.poNumber, transactionDate:now, createdAt:now,
        });
      }
    }
    // delta === 0 → لا تغيير في الخزنة

    // ── تحديث أمر الشراء ──────────────────────────────────────────────────
    const finalPayStatus = newPaidAmt <= 0 ? "unpaid" : newPaidAmt >= total ? "paid" : "partial";
    await db.update(purchaseOrdersTable).set({
      status:        status ?? ob.status,
      paymentStatus: finalPayStatus,
      paidAmount:    String(newPaidAmt),
      notes:         notes ?? ob.notes,
      updatedAt:     now,
    }).where(eq(purchaseOrdersTable.id, id));

  } catch(e) { console.error(e); res.status(500).json({ error:"خطأ أثناء تحديث أمر الشراء" }); return; }

  const [order] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  res.json(order);
});

router.delete("/finance/purchases/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  const now = new Date();

  const [ob] = await db.select().from(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  if (!ob) { res.status(404).json({ error:"أمر الشراء مش موجود" }); return; }

  // ── لو فيه مبلغ مدفوع → ارجعه للخزنة قبل الحذف ──────────────────────────
  const paidSoFar = parseFloat(ob.paidAmount ?? "0");
  if (paidSoFar > 0) {
    const reg = await getDefaultRegister();
    if (reg) {
      const bb = parseFloat(reg.balance ?? "0");
      const ba = bb + paidSoFar;
      await db.update(cashRegistersTable).set({ balance:String(ba), updatedAt:now }).where(eq(cashRegistersTable.id, reg.id));
      await db.insert(cashTransactionsTable).values({
        registerId:reg.id, type:"deposit", amount:String(paidSoFar),
        balanceBefore:String(bb), balanceAfter:String(ba),
        purchaseOrderId:id,
        description:`إلغاء أمر شراء ${ob.poNumber} — إرجاع ${paidSoFar.toLocaleString("ar-EG")} ج.م`,
        referenceNumber:ob.poNumber, transactionDate:now, createdAt:now,
      });
    }
  }

  await db.delete(purchaseOrderItemsTable).where(eq(purchaseOrderItemsTable.purchaseOrderId, id));
  await db.delete(purchaseOrdersTable).where(eq(purchaseOrdersTable.id, id));
  res.status(204).send();
});

export default router;
