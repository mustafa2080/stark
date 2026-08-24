import { Router, type IRouter } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db, productVariantsTable, productsTable, warehousesTable, warehouseStockTable } from "@workspace/db";
import { getTenantId } from "../middlewares/requireTenant.js";
import { z } from "zod";
import { addStock } from "../lib/inventory.js";
import { logAudit } from "../lib/audit.js";
import { requireRole } from "../middlewares/requireRole.js";

const router: IRouter = Router();

const CreateVariantSchema = z.object({
  color: z.string().min(1),
  colorHex: z.string().nullish().optional(),
  size: z.string().min(1),
  sku: z.string().nullish(),
  totalQuantity: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  unitPrice: z.number().min(0),
  costPrice: z.number().min(0).nullish(),
});

// Update schema: totalQuantity excluded — use /add-stock instead
const UpdateVariantSchema = z.object({
  color: z.string().min(1).optional(),
  colorHex: z.string().nullish().optional(),
  size: z.string().min(1).optional(),
  sku: z.string().nullish().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  unitPrice: z.number().min(0).optional(),
  costPrice: z.number().min(0).nullish().optional(),
});

const AddStockSchema = z.object({
  quantity: z.number().int().min(1),
  warehouseId: z.number().int().positive().nullish(),
  notes: z.string().nullish(),
});

// List all variants (with product info) — used by order form
router.get("/variants", async (req, res): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const joinConditions: any[] = [eq(productVariantsTable.productId, productsTable.id)];
    if (tenantId !== null) joinConditions.push(eq(productsTable.tenantId, tenantId));
    const variants = await db
      .select({
        id: productVariantsTable.id,
        productId: productVariantsTable.productId,
        productName: productsTable.name,
        color: productVariantsTable.color,
        colorHex: productVariantsTable.colorHex,
        size: productVariantsTable.size,
        sku: productVariantsTable.sku,
        totalQuantity: productVariantsTable.totalQuantity,
        reservedQuantity: productVariantsTable.reservedQuantity,
        soldQuantity: productVariantsTable.soldQuantity,
        lowStockThreshold: productVariantsTable.lowStockThreshold,
        unitPrice: productVariantsTable.unitPrice,
        costPrice: productVariantsTable.costPrice,
        createdAt: productVariantsTable.createdAt,
        updatedAt: productVariantsTable.updatedAt,
      })
      .from(productVariantsTable)
      .innerJoin(productsTable, and(...joinConditions))
      .orderBy(desc(productVariantsTable.createdAt));
    res.json(variants);
  } catch (err: any) {
    console.error("[GET /variants] DB error:", err?.message ?? err);
    // لو المشكلة في colorHex column → ارجع بدونه
    if (err?.message?.includes("color_hex") || err?.message?.includes("Unknown column")) {
      try {
        const tenantId = getTenantId(req);
        const joinConditions: any[] = [eq(productVariantsTable.productId, productsTable.id)];
        if (tenantId !== null) joinConditions.push(eq(productsTable.tenantId, tenantId));
        const variants = await db
          .select({
            id: productVariantsTable.id,
            productId: productVariantsTable.productId,
            productName: productsTable.name,
            color: productVariantsTable.color,
            size: productVariantsTable.size,
            sku: productVariantsTable.sku,
            totalQuantity: productVariantsTable.totalQuantity,
            reservedQuantity: productVariantsTable.reservedQuantity,
            soldQuantity: productVariantsTable.soldQuantity,
            lowStockThreshold: productVariantsTable.lowStockThreshold,
            unitPrice: productVariantsTable.unitPrice,
            costPrice: productVariantsTable.costPrice,
            createdAt: productVariantsTable.createdAt,
            updatedAt: productVariantsTable.updatedAt,
          })
          .from(productVariantsTable)
          .innerJoin(productsTable, and(...joinConditions))
          .orderBy(desc(productVariantsTable.createdAt));
        res.json(variants.map(v => ({ ...v, colorHex: null })));
        return;
      } catch (e2: any) {
        console.error("[GET /variants] fallback error:", e2?.message);
      }
    }
    res.status(500).json({ error: "فشل جلب المتغيرات", detail: err?.message ?? String(err) });
  }
});

// List variants for a specific product
router.get("/products/:productId/variants", async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.productId));
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid product ID" }); return; }

  const variants = await db
    .select()
    .from(productVariantsTable)
    .where(eq(productVariantsTable.productId, productId))
    .orderBy(productVariantsTable.color, productVariantsTable.size);
  res.json(variants);
});

// Create variant
router.post("/products/:productId/variants", requireRole("admin", "warehouse"), async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.productId));
  if (isNaN(productId)) { res.status(400).json({ error: "Invalid product ID" }); return; }

  const parsed = CreateVariantSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return; }

  try {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
    if (!product) { res.status(404).json({ error: "Product not found" }); return; }

    const skuInput = parsed.data.sku?.trim();
    const sku = skuInput || null;
    const colorHex = parsed.data.colorHex?.trim() || null;

    // استخرج الحقول المعروفة فقط — تجاهل أي حقول إضافية قد تسبب خطأ في DB
    const { color, size, totalQuantity, lowStockThreshold, unitPrice, costPrice } = parsed.data;

    const insertResult = await db.insert(productVariantsTable).values({
      productId,
      color,
      colorHex,
      size,
      sku,
      totalQuantity: totalQuantity ?? 0,
      reservedQuantity: 0,
      soldQuantity: 0,
      lowStockThreshold: lowStockThreshold ?? 5,
      unitPrice: unitPrice ?? 0,
      costPrice: costPrice ?? null,
    });
    const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
    const [variant] = await db.select().from(productVariantsTable).where(eq(productVariantsTable.id, insertId));

    await logAudit({ action: "create", entityType: "variant", entityId: variant.id, entityName: `${product.name} — ${variant.color} ${variant.size}`, after: { color: variant.color, size: variant.size, totalQuantity: variant.totalQuantity }, userId: req.user?.id, userName: req.user?.displayName });

    // ── تلقائياً: أضف صف بكمية 0 في كل المخازن الموجودة ──────────────────────
    try {
      const allWarehouses = await db.select({ id: warehousesTable.id }).from(warehousesTable);
      const now = new Date();
      for (const wh of allWarehouses) {
        await db.insert(warehouseStockTable).values({ warehouseId: wh.id, productId: null, variantId: variant.id, quantity: 0, updatedAt: now }).catch(() => {});
      }
    } catch (_) {}

    res.status(201).json(variant);
  } catch (err: any) {
    console.error("[POST /variants] DB error:", err?.message ?? err);
    res.status(500).json({ error: "فشل إنشاء SKU", detail: err?.message ?? String(err) });
  }
});

// Update variant
router.patch("/products/:productId/variants/:variantId", requireRole("admin", "warehouse"), async (req, res): Promise<void> => {
  const variantId = parseInt(String(req.params.variantId));
  if (isNaN(variantId)) { res.status(400).json({ error: "Invalid variant ID" }); return; }

  const parsed = UpdateVariantSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [before] = await db.select().from(productVariantsTable).where(eq(productVariantsTable.id, variantId));
  const normalizedData = {
    ...parsed.data,
    ...(parsed.data.sku !== undefined ? { sku: parsed.data.sku?.trim() || null } : {}),
    ...(parsed.data.colorHex !== undefined ? { colorHex: parsed.data.colorHex?.trim() || null } : {}),
  };
  await db.update(productVariantsTable)
    .set({ ...normalizedData, updatedAt: new Date() })
    .where(eq(productVariantsTable.id, variantId));
  const [variant] = await db.select().from(productVariantsTable).where(eq(productVariantsTable.id, variantId));
  if (!variant) { res.status(404).json({ error: "Variant not found" }); return; }

  if (before) await logAudit({ action: "update", entityType: "variant", entityId: variantId, entityName: `${variant.color} ${variant.size}`, before: { unitPrice: before.unitPrice, lowStockThreshold: before.lowStockThreshold }, after: { unitPrice: variant.unitPrice, lowStockThreshold: variant.lowStockThreshold }, userId: req.user?.id, userName: req.user?.displayName });

  res.json(variant);
});

// Delete variant
router.delete("/products/:productId/variants/:variantId", requireRole("admin"), async (req, res): Promise<void> => {
  const variantId = parseInt(String(req.params.variantId));
  if (isNaN(variantId)) { res.status(400).json({ error: "Invalid variant ID" }); return; }

  const [toDelete] = await db.select().from(productVariantsTable)
    .where(and(eq(productVariantsTable.id, variantId), eq(productVariantsTable.productId, parseInt(String(req.params.productId)))));
  if (!toDelete) { res.status(404).json({ error: "Variant not found" }); return; }

  await db.delete(warehouseStockTable)
    .where(eq(warehouseStockTable.variantId, variantId));

  await db.delete(productVariantsTable)
    .where(and(eq(productVariantsTable.id, variantId), eq(productVariantsTable.productId, parseInt(String(req.params.productId)))));

  const remainingVariants = await db
    .select({
      totalQuantity: productVariantsTable.totalQuantity,
      reservedQuantity: productVariantsTable.reservedQuantity,
      soldQuantity: productVariantsTable.soldQuantity,
    })
    .from(productVariantsTable)
    .where(eq(productVariantsTable.productId, toDelete.productId));

  const totals = remainingVariants.reduce((acc, variant) => {
    acc.totalQuantity += variant.totalQuantity ?? 0;
    acc.reservedQuantity += variant.reservedQuantity ?? 0;
    acc.soldQuantity += variant.soldQuantity ?? 0;
    return acc;
  }, { totalQuantity: 0, reservedQuantity: 0, soldQuantity: 0 });

  await db.update(productsTable)
    .set({ ...totals, updatedAt: new Date() })
    .where(eq(productsTable.id, toDelete.productId));

  await logAudit({ action: "delete", entityType: "variant", entityId: variantId, entityName: `${toDelete.color} ${toDelete.size}`, userId: req.user?.id, userName: req.user?.displayName });

  res.status(204).send();
});

// ─── Add Stock ────────────────────────────────────────────────────────────────

router.post("/products/:productId/variants/:variantId/add-stock", async (req, res): Promise<void> => {
  const productId = parseInt(String(req.params.productId));
  const variantId = parseInt(req.params.variantId);
  if (isNaN(productId) || isNaN(variantId)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const parsed = AddStockSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  const [variantRow] = await db.select().from(productVariantsTable).where(eq(productVariantsTable.id, variantId));
  if (!variantRow) { res.status(404).json({ error: "Variant not found" }); return; }

  // لو مفيش warehouseId في الطلب، استخدم الافتراضي أو الأول
  let targetWarehouseId: number | null = parsed.data.warehouseId ?? null;
  if (!targetWarehouseId) {
    const [defaultWh] = await db.select().from(warehousesTable).where(eq(warehousesTable.isDefault, true));
    const [anyWh] = defaultWh ? [defaultWh] : await db.select().from(warehousesTable).limit(1);
    targetWarehouseId = anyWh?.id ?? null;
  }

  // addStock تتولى كل حاجة: تعدّل warehouse_stock + تزامن totalQuantity + تسجّل حركة IN
  await addStock(
    {
      variantId,
      productId,
      product: product.name,
      color: variantRow.color,
      size: variantRow.size,
      warehouseId: targetWarehouseId,
    },
    parsed.data.quantity,
    parsed.data.notes ?? null,
  );

  const [updated] = await db.select().from(productVariantsTable).where(eq(productVariantsTable.id, variantId));
  res.json(updated);
});

export default router;
