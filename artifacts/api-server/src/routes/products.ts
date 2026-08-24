import { Router, type IRouter } from "express";
import { eq, desc, and, isNull } from "drizzle-orm";
import { db, productsTable, warehousesTable, warehouseStockTable, productVariantsTable } from "@workspace/db";
import { getTenantId } from "../middlewares/requireTenant.js";
import { z } from "zod";
import { addStock } from "../lib/inventory.js";
import { logAudit } from "../lib/audit.js";
import { requireRole } from "../middlewares/requireRole.js";

const router: IRouter = Router();

const CreateProductSchema = z.object({
  name: z.string().min(1),
  sku: z.string().nullish(),
  totalQuantity: z.number().int().min(0).default(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  unitPrice: z.number().min(0),
  costPrice: z.number().min(0).nullish(),
  image: z.string().nullish(),
});

// Update schema: totalQuantity excluded — use /add-stock instead
const UpdateProductSchema = z.object({
  name: z.string().min(1).optional(),
  sku: z.string().nullish().optional(),
  lowStockThreshold: z.number().int().min(0).optional(),
  unitPrice: z.number().min(0).optional(),
  costPrice: z.number().min(0).nullish().optional(),
  image: z.string().nullish().optional(),
  isArchived: z.boolean().optional(),
});

const AddStockSchema = z.object({
  quantity: z.number().int().min(1),
  warehouseId: z.number().int().positive().nullish(),
  notes: z.string().nullish(),
});

router.get("/products", async (req, res): Promise<void> => {
  const tenantId = getTenantId(req);
  const conditions: any[] = [eq(productsTable.isArchived, false)];
  if (tenantId !== null) conditions.push(eq(productsTable.tenantId, tenantId));
  const products = await db.select().from(productsTable).where(and(...conditions)).orderBy(desc(productsTable.createdAt));
  res.json(products);
});

router.post("/products", requireRole("admin", "warehouse", "super_admin"), async (req, res): Promise<void> => {
  const parsed = CreateProductSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const insertResult = await db.insert(productsTable).values(parsed.data);
  const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, insertId));

  await logAudit({ action: "create", entityType: "product", entityId: product.id, entityName: product.name, after: { name: product.name, unitPrice: product.unitPrice, totalQuantity: product.totalQuantity }, userId: req.user?.id, userName: req.user?.displayName });

  // ── تلقائياً: أضف صف بكمية 0 في كل المخازن الموجودة ──────────────────────
  try {
    const allWarehouses = await db.select({ id: warehousesTable.id }).from(warehousesTable);
    const now = new Date();
    for (const wh of allWarehouses) {
      await db.insert(warehouseStockTable).values({ warehouseId: wh.id, productId: product.id, variantId: null, quantity: 0, updatedAt: now }).catch(() => {});
    }
  } catch (_) {}

  res.status(201).json(product);
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }
  res.json(product);
});

router.patch("/products/:id", requireRole("admin", "warehouse", "super_admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const parsed = UpdateProductSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [before] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!before) { res.status(404).json({ error: "Product not found" }); return; }

  await db.update(productsTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(productsTable.id, id));

  // ── لو بيتأرشف: احذف warehouse_stock وصفّر variants تلقائياً ──────────────
  if (parsed.data.isArchived === true) {
    try {
      // 1. احذف warehouse_stock للمنتج نفسه
      await db.delete(warehouseStockTable).where(eq(warehouseStockTable.productId, id));

      // 2. جيب كل variants المنتج
      const variants = await db.select({ id: productVariantsTable.id })
        .from(productVariantsTable)
        .where(eq(productVariantsTable.productId, id));

      // 3. احذف warehouse_stock لكل variant + صفّر الكميات
      for (const v of variants) {
        await db.delete(warehouseStockTable).where(eq(warehouseStockTable.variantId, v.id));
        await db.update(productVariantsTable)
          .set({ totalQuantity: 0, reservedQuantity: 0, updatedAt: new Date() })
          .where(eq(productVariantsTable.id, v.id));
      }

      // 4. صفّر المنتج نفسه
      await db.update(productsTable)
        .set({ totalQuantity: 0, reservedQuantity: 0, updatedAt: new Date() })
        .where(eq(productsTable.id, id));
    } catch (e) {
      console.error("Archive cleanup error:", e);
    }
  }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  await logAudit({
    action: parsed.data.isArchived ? "archive" : "update",
    entityType: "product", entityId: id, entityName: product.name,
    before: { name: before.name, unitPrice: before.unitPrice, totalQuantity: before.totalQuantity },
    after: parsed.data.isArchived
      ? { isArchived: true, note: "تم أرشفة المنتج وحذف مخزونه" }
      : { name: product.name, unitPrice: product.unitPrice },
    userId: req.user?.id, userName: req.user?.displayName
  });

  res.json(product);
});

router.delete("/products/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const [existing] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!existing) { res.status(404).json({ error: "Product not found" }); return; }

  await db.delete(warehouseStockTable).where(eq(warehouseStockTable.productId, id));
  const variants = await db.select({ id: productVariantsTable.id }).from(productVariantsTable).where(eq(productVariantsTable.productId, id));
  for (const variant of variants) {
    await db.delete(warehouseStockTable).where(eq(warehouseStockTable.variantId, variant.id));
  }
  await db.delete(productVariantsTable).where(eq(productVariantsTable.productId, id));
  await db.delete(productsTable).where(eq(productsTable.id, id));

  await logAudit({ action: "delete", entityType: "product", entityId: id, entityName: existing.name, before: { name: existing.name }, userId: req.user?.id, userName: req.user?.displayName });

  res.status(204).send();
});

// ─── Add Stock ────────────────────────────────────────────────────────────────

router.post("/products/:id/add-stock", requireRole("admin", "warehouse", "super_admin"), async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id));
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ID" }); return; }

  const parsed = AddStockSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) { res.status(404).json({ error: "Product not found" }); return; }

  // addStock تعدّل warehouse_stock تلقائياً وتزامن totalQuantity
  await addStock(
    { productId: id, product: product.name, warehouseId: parsed.data.warehouseId ?? null },
    parsed.data.quantity,
    parsed.data.notes ?? null,
  );

  await logAudit({ action: "add_stock", entityType: "product", entityId: id, entityName: product.name, before: { totalQuantity: product.totalQuantity }, after: { totalQuantity: product.totalQuantity + parsed.data.quantity, added: parsed.data.quantity, notes: parsed.data.notes }, userId: req.user?.id, userName: req.user?.displayName });

  const [updated] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  res.json(updated);
});

export default router;
