import { Router, type IRouter } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { db, ordersTable, productsTable, productVariantsTable, shipmentsTable, shipmentZonesTable, parcelTypePricingTable, warehousesTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { getTenantId } from "../middlewares/requireTenant.js";
import { generateShipmentNumber } from "./shipments.js";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

// ─── Shared parser ─────────────────────────────────────────────────────────────
async function parseFileToRaw(buffer: Buffer, originalname: string): Promise<{ headers: string[]; rows: any[][] }> {
  const isCSV = /\.csv$/i.test(originalname);
  const workbook = new ExcelJS.Workbook();

  if (isCSV) {
    const { Readable } = await import("stream");
    const stream = Readable.from(buffer.toString("utf-8"));
    await workbook.csv.read(stream);
  } else {
    await workbook.xlsx.load(buffer);
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return { headers: [], rows: [] };

  // اعرف عدد الأعمدة الفعلي من الـ worksheet مش من أول صف فقط
  const actualColCount = worksheet.columnCount || worksheet.actualColumnCount || 0;

  let headers: string[] = [];
  const rows: any[][] = [];

  worksheet.eachRow({ includeEmpty: false }, (row, rowNum) => {
    // جيب كل القيم بما فيها الخلايا الفاضية
    const rawValues = row.values as any[];
    // ExcelJS بيبدأ من index 1
    const values: any[] = [];
    const maxCol = Math.max(actualColCount, rawValues.length - 1);
    for (let c = 1; c <= maxCol; c++) {
      const v = rawValues[c];
      if (v === null || v === undefined) {
        values.push("");
      } else if (typeof v === "object" && "result" in v) {
        values.push(v.result ?? "");
      } else {
        values.push(v);
      }
    }

    if (rowNum === 1) {
      headers = values.map((v, i) => {
        const s = String(v ?? "").trim();
        return s || `عمود_${i + 1}`;
      });
    } else {
      const trimmed = values.slice(0, headers.length);
      // أكمّل بـ "" لو الصف أقصر من عدد الأعمدة
      while (trimmed.length < headers.length) trimmed.push("");
      const isEmpty = trimmed.every(v => v === "" || v === null || v === undefined);
      if (!isEmpty) {
        rows.push(trimmed);
      }
    }
  });

  return { headers, rows };
}

// ─── Step 1: Parse file → return headers + sample ─────────────────────────────
router.post("/orders/import/parse", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "لم يتم رفع ملف" }); return; }

  try {
    const { headers, rows } = await parseFileToRaw(req.file.buffer, req.file.originalname);

    if (!headers.length) {
      res.status(400).json({ error: "الملف فارغ أو غير مدعوم" });
      return;
    }

    res.json({
      headers,
      sample: rows.slice(0, 5),
      totalRows: rows.length,
      allRows: rows,
    });
  } catch (err: any) {
    res.status(500).json({ error: `فشل قراءة الملف: ${err.message}` });
  }
});

// ─── Step 2: Execute with mapping ─────────────────────────────────────────────
router.post("/orders/import/execute", async (req, res): Promise<void> => {
  const { headers, rows, mapping, duplicateAction } = req.body as {
    headers: string[];
    rows: any[][];
    mapping: {
      name: string;
      phone: string;
      city: string;
      address: string;
      product: string;
      color: string;
      size: string;
      quantity: string;
      price: string;
      notes: string;
      adSource: string;
      warehouseId: string;
      assignedUserId: string;
      shippingCost: string;
    };
    duplicateAction?: "separate" | "merge";
  };

  if (!headers?.length || !rows?.length || !mapping) {
    res.status(400).json({ error: "بيانات غير مكتملة" });
    return;
  }

  const headerIdx: Record<string, number> = {};
  headers.forEach((h, i) => { headerIdx[h] = i; });

  const getCell = (row: any[], colName: string): string => {
    if (!colName) return "";
    const idx = headerIdx[colName];
    if (idx === undefined) return "";
    const v = row[idx];
    if (v === null || v === undefined) return "";
    return String(v).trim();
  };

  const validOrders: any[] = [];
  const errors: string[] = [];

  function generateInvoiceNumber(): string {
    const now = new Date();
    const yy = String(now.getFullYear()).slice(-2);
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `INV-${yy}${mm}${dd}-${rand}`;
  }

  // في mode "منفصل": كل صف ياخد invoice خاص بيه
  // في mode "دمج": نفس العميل ياخد نفس الـ invoice
  const customerInvoiceMap = new Map<string, string>();

  const AD_SOURCE_MAP: Record<string, string> = {
    "فيسبوك": "facebook", "facebook": "facebook",
    "تيكتوك": "tiktok", "tiktok": "tiktok",
    "انستجرام": "instagram", "instagram": "instagram",
    "واتساب": "whatsapp", "whatsapp": "whatsapp",
    "عضوي": "organic", "organic": "organic",
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const customerName = getCell(row, mapping.name);
    const product = getCell(row, mapping.product);
    const rawQty = getCell(row, mapping.quantity);
    const rawPrice = getCell(row, mapping.price).replace(/,/g, "");
    const phone = getCell(row, mapping.phone) || null;
    const city = getCell(row, mapping.city) || null;
    const address = getCell(row, mapping.address) || null;
    const color = getCell(row, mapping.color) || null;
    const size = getCell(row, mapping.size) || null;
    const notes = getCell(row, mapping.notes) || null;
    const adSourceRaw = getCell(row, mapping.adSource) || null;
    const rawWarehouseId = getCell(row, mapping.warehouseId);
    const rawAssignedUserId = getCell(row, mapping.assignedUserId);
    const rawShippingCost = getCell(row, mapping.shippingCost).replace(/,/g, "");

    if (!customerName && !product && !rawQty) continue;

    if (!customerName) { errors.push(`الصف ${rowNum}: اسم العميل مطلوب`); continue; }
    if (!product) { errors.push(`الصف ${rowNum}: اسم المنتج مطلوب`); continue; }

    const quantity = parseInt(rawQty || "1");
    if (isNaN(quantity) || quantity < 1) { errors.push(`الصف ${rowNum}: الكمية غير صحيحة ("${rawQty}")`); continue; }

    const unitPrice = rawPrice ? parseFloat(rawPrice) : 0;
    if (rawPrice && isNaN(unitPrice)) { errors.push(`الصف ${rowNum}: السعر غير صحيح ("${rawPrice}")`); continue; }

    const shippingCost = rawShippingCost ? parseFloat(rawShippingCost) : 0;
    const warehouseId = rawWarehouseId ? parseInt(rawWarehouseId) || null : null;
    const assignedUserId = rawAssignedUserId ? parseInt(rawAssignedUserId) || null : null;

    const adSource = adSourceRaw
      ? (AD_SOURCE_MAP[adSourceRaw.toLowerCase()] ?? AD_SOURCE_MAP[adSourceRaw] ?? "other")
      : null;

    const customerKey = `${customerName.trim().toLowerCase()}|${(phone ?? "").trim()}`;
    // في mode "منفصل": كل صف ياخد invoice فريد حتى لو نفس العميل
    // في mode "دمج": نفس العميل ياخد نفس الـ invoice (يتدمجوا بعدين في mergeMap)
    let invoiceNumber: string;
    if (duplicateAction === "merge" && customerInvoiceMap.has(customerKey)) {
      invoiceNumber = customerInvoiceMap.get(customerKey)!;
    } else {
      invoiceNumber = generateInvoiceNumber();
      customerInvoiceMap.set(customerKey, invoiceNumber);
    }

    validOrders.push({
      customerName,
      product,
      color,
      size,
      quantity,
      unitPrice: unitPrice || 0,
      totalPrice: quantity * (unitPrice || 0),
      phone,
      city,
      address,
      notes,
      adSource,
      warehouseId,
      assignedUserId,
      shippingCost: shippingCost || 0,
      invoiceNumber,
      status: "pending" as const,
      createdByUserId: (req as any).user?.id ?? null,
      createdByName: (req as any).user?.displayName ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // ── Merge duplicate customers if requested ──────────────────────────────
  let finalOrders = validOrders;
  if (duplicateAction === "merge") {
    const mergeMap = new Map<string, any>();
    for (const order of validOrders) {
      const key = `${order.customerName.trim().toLowerCase()}|${(order.phone ?? "").trim()}`;
      if (mergeMap.has(key)) {
        const existing = mergeMap.get(key)!;
        // دمج الكميات والأسعار
        existing.quantity += order.quantity;
        existing.totalPrice += order.totalPrice;
        existing.shippingCost = Math.max(existing.shippingCost, order.shippingCost);
        // دمج اسم المنتج
        if (order.product && !existing.product.includes(order.product)) {
          existing.product = `${existing.product} + ${order.product}`;
        }
        // دمج الملاحظات
        if (order.notes) {
          existing.notes = existing.notes ? `${existing.notes} | ${order.notes}` : order.notes;
        }
      } else {
        mergeMap.set(key, { ...order });
      }
    }
    finalOrders = Array.from(mergeMap.values());
  }

  // ── Insert in batches of 100 to avoid huge payloads ─────────────────────
  const BATCH_SIZE = 100;
  let insertedCount = 0;

  if (finalOrders.length > 0) {
    try {
      for (let i = 0; i < finalOrders.length; i += BATCH_SIZE) {
        const batch = finalOrders.slice(i, i + BATCH_SIZE);
        await db.insert(ordersTable).values(batch);
        insertedCount += batch.length;
      }
    } catch (insertErr: any) {
      res.status(500).json({ error: `فشل إدخال البيانات: ${insertErr.message}` });
      return;
    }
  }

  res.json({
    imported: insertedCount,
    failed: errors.length,
    errors: errors.slice(0, 50),
    receivedRows: rows.length,
    validCount: validOrders.length,
    orders: [],
  });
});

// ─── Products Import: Parse ─────────────────────────────────────────────────────
router.post("/products/import/parse", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "لم يتم رفع ملف" }); return; }
  try {
    const { headers, rows } = await parseFileToRaw(req.file.buffer, req.file.originalname);
    if (!headers.length) { res.status(400).json({ error: "الملف فارغ أو غير مدعوم" }); return; }
    res.json({ headers, sample: rows.slice(0, 5), totalRows: rows.length, allRows: rows });
  } catch (err: any) {
    res.status(500).json({ error: `فشل قراءة الملف: ${err.message}` });
  }
});

// ─── Products Import: Execute ───────────────────────────────────────────────────
router.post("/products/import/execute", async (req, res): Promise<void> => {
  const { headers, rows, mapping } = req.body as {
    headers: string[];
    rows: any[][];
    mapping: {
      name: string;
      sku?: string;
      unitPrice?: string;
      costPrice?: string;
      totalQuantity?: string;
      lowStockThreshold?: string;
      color?: string;
      size?: string;
    };
  };

  if (!headers?.length || !rows?.length || !mapping) {
    res.status(400).json({ error: "بيانات غير مكتملة" }); return;
  }

  const headerIdx: Record<string, number> = {};
  headers.forEach((h, i) => { headerIdx[h] = i; });

  const getCell = (row: any[], colName: string | undefined): string => {
    if (!colName) return "";
    const idx = headerIdx[colName];
    if (idx === undefined) return "";
    const v = row[idx];
    if (v === null || v === undefined) return "";
    return String(v).trim();
  };

  const errors: string[] = [];
  let importedProducts = 0;
  let importedVariants = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const name = getCell(row, mapping.name);
    if (!name) { errors.push(`الصف ${rowNum}: اسم المنتج مطلوب`); continue; }

    const rawUnitPrice = getCell(row, mapping.unitPrice).replace(/,/g, "");
    const unitPrice = rawUnitPrice ? parseFloat(rawUnitPrice) : 0;
    if (rawUnitPrice && isNaN(unitPrice)) { errors.push(`الصف ${rowNum}: سعر البيع غير صحيح`); continue; }

    const rawCostPrice = getCell(row, mapping.costPrice).replace(/,/g, "");
    const costPrice = rawCostPrice ? parseFloat(rawCostPrice) : null;

    const rawQty = getCell(row, mapping.totalQuantity);
    const totalQuantity = rawQty ? parseInt(rawQty) : 0;

    const rawThreshold = getCell(row, mapping.lowStockThreshold);
    const lowStockThreshold = rawThreshold ? parseInt(rawThreshold) : 5;

    const sku = getCell(row, mapping.sku) || null;
    const color = getCell(row, mapping.color) || null;
    const size = getCell(row, mapping.size) || null;

    let [product] = await db.select().from(productsTable).where(ilike(productsTable.name, name)).limit(1);
    if (!product) {
      const [created] = await db.insert(productsTable).values({
        name,
        sku,
        unitPrice,
        costPrice,
        totalQuantity: (!color && !size) ? totalQuantity : 0,
        lowStockThreshold,
      }).returning();
      product = created;
      importedProducts++;
    } else {
      const updates: any = {};
      if (unitPrice) updates.unitPrice = unitPrice;
      if (costPrice !== null) updates.costPrice = costPrice;
      await db.update(productsTable).set({ ...updates, updatedAt: new Date() }).where(eq(productsTable.id, product.id));
    }

    if (color && size) {
      const [existingVariant] = await db.select().from(productVariantsTable)
        .where(and(
          eq(productVariantsTable.productId, product.id),
          ilike(productVariantsTable.color, color),
          ilike(productVariantsTable.size, size),
        )).limit(1);

      if (!existingVariant) {
        const variantSku = sku || `${name.substring(0, 3).toUpperCase()}-${color.substring(0, 3).toUpperCase()}-${size.toUpperCase()}`;
        await db.insert(productVariantsTable).values({
          productId: product.id,
          color,
          size,
          sku: variantSku,
          totalQuantity,
          lowStockThreshold,
          unitPrice: unitPrice || product.unitPrice,
          costPrice: costPrice ?? product.costPrice,
          reservedQuantity: 0,
          soldQuantity: 0,
        });
        importedVariants++;
      } else {
        const updates: any = {};
        if (totalQuantity) updates.totalQuantity = totalQuantity;
        if (unitPrice) updates.unitPrice = unitPrice;
        if (costPrice !== null) updates.costPrice = costPrice;
        await db.update(productVariantsTable).set({ ...updates, updatedAt: new Date() }).where(eq(productVariantsTable.id, existingVariant.id));
      }
    }
  }

  res.json({
    imported: importedProducts + importedVariants,
    importedProducts,
    importedVariants,
    failed: errors.length,
    errors: errors.slice(0, 30),
  });
});

// ─── Shipments Import: Parse ────────────────────────────────────────────────────
router.post("/shipments/import/parse", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "لم يتم رفع ملف" }); return; }
  try {
    const { headers, rows } = await parseFileToRaw(req.file.buffer, req.file.originalname);
    if (!headers.length) { res.status(400).json({ error: "الملف فارغ أو غير مدعوم" }); return; }
    res.json({ headers, sample: rows.slice(0, 5), totalRows: rows.length, allRows: rows });
  } catch (err: any) {
    res.status(500).json({ error: `فشل قراءة الملف: ${err.message}` });
  }
});

// ─── Shipments Import: Execute ──────────────────────────────────────────────────
// نفس منطق فورم "شحنة جديدة" بالظبط: نفس الحقول، نفس الـ validation، نفس طريقة حساب
// السعر (سعر المنطقة + سعر نوع الطرد)، عشان أي ملف يترفع من غير مشاكل.
router.post("/shipments/import/execute", async (req, res): Promise<void> => {
  const { headers, rows, mapping } = req.body as {
    headers: string[];
    rows: any[][];
    mapping: {
      senderName?: string;
      senderPhone?: string;
      senderPhone2?: string;
      senderCity?: string;
      receiverName?: string;
      receiverPhone?: string;
      receiverPhone2?: string;
      receiverAddress?: string;
      receiverCity?: string;
      zone?: string;
      parcelType?: string;
      weight?: string;
      pieces?: string;
      description?: string;
      paymentMethod?: string;
      codAmount?: string;
      notes?: string;
      warehouse?: string;
      shippingCompanyId?: string;
    };
  };

  if (!headers?.length || !rows?.length || !mapping) {
    res.status(400).json({ error: "بيانات غير مكتملة" });
    return;
  }

  const tenantId = getTenantId(req);
  const user = (req as any).user;

  const headerIdx: Record<string, number> = {};
  headers.forEach((h, i) => { headerIdx[h] = i; });

  const getCell = (row: any[], colName: string | undefined): string => {
    if (!colName) return "";
    const idx = headerIdx[colName];
    if (idx === undefined) return "";
    const v = row[idx];
    if (v === null || v === undefined) return "";
    return String(v).trim();
  };

  // ── تحميل جداول المرجع (مناطق التوصيل، أنواع الطرود، المخازن) مرة واحدة ──────
  const zones = await db.select().from(shipmentZonesTable)
    .where(tenantId !== null ? eq(shipmentZonesTable.tenantId, tenantId) : undefined as any);
  const parcelPricing = await db.select().from(parcelTypePricingTable)
    .where(tenantId !== null ? eq(parcelTypePricingTable.tenantId, tenantId) : undefined as any);
  const warehouses = await db.select().from(warehousesTable)
    .where(tenantId !== null ? eq(warehousesTable.tenantId, tenantId) : undefined as any);

  const norm = (s: string) => s.trim().toLowerCase();

  // مطابقة المنطقة: بالاسم أو بـ"المحافظة - المنطقة"
  const findZone = (raw: string) => {
    if (!raw) return null;
    const n = norm(raw);
    return zones.find(z => {
      const name = norm(z.name || "");
      const gov = norm(z.toGovernorate || "");
      const combo = gov && name ? `${gov} - ${name}` : (gov || name);
      return name === n || combo === n || gov === n;
    }) ?? zones.find(z => norm(z.name || "").includes(n) || norm(z.toGovernorate || "").includes(n)) ?? null;
  };

  const PARCEL_TYPE_MAP: Record<string, string> = {
    "مستندات": "document", "document": "document",
    "عادي": "normal", "normal": "normal",
    "قابل للكسر": "fragile", "fragile": "fragile",
    "ثقيل": "heavy", "heavy": "heavy",
    "إلكترونيات": "electronics", "electronics": "electronics",
    "ملابس": "clothing", "clothing": "clothing",
    "طعام": "food", "food": "food",
    "أخرى": "other", "other": "other",
  };
  const findParcelPricing = (raw: string) => {
    if (!raw) return null;
    const n = norm(raw);
    const mappedType = PARCEL_TYPE_MAP[raw] ?? PARCEL_TYPE_MAP[n] ?? null;
    return parcelPricing.find(p => p.parcelType === mappedType)
      ?? parcelPricing.find(p => norm(p.label || "") === n || norm(p.parcelType) === n)
      ?? null;
  };

  const PAYMENT_METHOD_MAP: Record<string, string> = {
    "الدفع عند الاستلام": "cod", "الدفع عند الاستلام (cod)": "cod", "cod": "cod",
    "مدفوع مسبقا": "prepaid", "مدفوع مسبقاً": "prepaid", "prepaid": "prepaid",
    "آجل": "deferred", "اجل": "deferred", "deferred": "deferred",
  };

  const findWarehouse = (raw: string) => {
    if (!raw) return null;
    const n = norm(raw);
    return warehouses.find(w => norm(w.name || "") === n)
      ?? warehouses.find(w => norm(w.name || "").includes(n))
      ?? null;
  };

  const errors: string[] = [];
  const validShipments: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const senderName      = getCell(row, mapping.senderName);
    const receiverName    = getCell(row, mapping.receiverName);
    const senderPhone     = getCell(row, mapping.senderPhone) || null;
    const senderPhone2    = getCell(row, mapping.senderPhone2) || null;
    const senderCity      = getCell(row, mapping.senderCity) || null;
    const receiverPhone   = getCell(row, mapping.receiverPhone) || null;
    const receiverPhone2  = getCell(row, mapping.receiverPhone2) || null;
    const receiverAddress = getCell(row, mapping.receiverAddress) || null;
    const receiverCityRaw = getCell(row, mapping.receiverCity) || null;
    const zoneRaw          = getCell(row, mapping.zone);
    const parcelTypeRaw    = getCell(row, mapping.parcelType);
    const rawWeight        = getCell(row, mapping.weight);
    const rawPieces        = getCell(row, mapping.pieces);
    const description      = getCell(row, mapping.description) || null;
    const paymentMethodRaw = getCell(row, mapping.paymentMethod);
    const rawCodAmount     = getCell(row, mapping.codAmount).replace(/,/g, "");
    const notes            = getCell(row, mapping.notes) || null;
    const warehouseRaw     = getCell(row, mapping.warehouse);

    // تجاهل الصفوف الفاضية تماماً
    if (!senderName && !receiverName && !rawCodAmount) continue;

    // ── Validation: نفس الحقول المطلوبة الموجودة في فورم "شحنة جديدة" ──────────
    if (!senderName)   { errors.push(`الصف ${rowNum}: اسم الراسل مطلوب`); continue; }
    if (!receiverName) { errors.push(`الصف ${rowNum}: اسم المستلم مطلوب`); continue; }

    // المخزن مطلوب (زي الفورم بالظبط)
    let warehouseId: number | null = null;
    if (warehouseRaw) {
      const wh = findWarehouse(warehouseRaw);
      if (!wh) { errors.push(`الصف ${rowNum}: المخزن "${warehouseRaw}" غير موجود`); continue; }
      warehouseId = wh.id;
    } else {
      errors.push(`الصف ${rowNum}: المخزن مطلوب`);
      continue;
    }

    // المنطقة (اختيارية لكن لو مكتوبة لازم تكون موجودة فعلاً)
    let zoneId: number | null = null;
    let zonePrice = 0;
    let resolvedReceiverCity = receiverCityRaw;
    if (zoneRaw) {
      const zone = findZone(zoneRaw);
      if (!zone) { errors.push(`الصف ${rowNum}: منطقة التوصيل "${zoneRaw}" غير موجودة`); continue; }
      zoneId = zone.id;
      zonePrice = Number(zone.price) || 0;
      if (!resolvedReceiverCity) resolvedReceiverCity = zone.toGovernorate || null;
    }

    // نوع الطرد (اختياري لكن لو مكتوب لازم يكون معروف)
    let parcelType: string | null = null;
    let parcelPrice = 0;
    if (parcelTypeRaw) {
      const pricing = findParcelPricing(parcelTypeRaw);
      if (!pricing) { errors.push(`الصف ${rowNum}: نوع الطرد "${parcelTypeRaw}" غير معروف`); continue; }
      parcelType = pricing.parcelType;
      parcelPrice = Number(pricing.basePrice) || 0;
    }

    const weight = rawWeight ? parseFloat(rawWeight) : null;
    if (rawWeight && isNaN(weight as number)) { errors.push(`الصف ${rowNum}: الوزن غير صحيح ("${rawWeight}")`); continue; }

    const pieces = rawPieces ? parseInt(rawPieces) : 1;
    if (rawPieces && (isNaN(pieces) || pieces < 1)) { errors.push(`الصف ${rowNum}: عدد القطع غير صحيح ("${rawPieces}")`); continue; }

    const paymentMethod = paymentMethodRaw
      ? (PAYMENT_METHOD_MAP[paymentMethodRaw] ?? PAYMENT_METHOD_MAP[norm(paymentMethodRaw)] ?? null)
      : "cod";
    if (paymentMethodRaw && !paymentMethod) {
      errors.push(`الصف ${rowNum}: طريقة الدفع "${paymentMethodRaw}" غير معروفة (المتاح: الدفع عند الاستلام، مدفوع مسبقاً، آجل)`);
      continue;
    }

    const total = rawCodAmount ? parseFloat(rawCodAmount) : 0;
    if (rawCodAmount && isNaN(total)) { errors.push(`الصف ${rowNum}: سعر الشحنة غير صحيح ("${rawCodAmount}")`); continue; }

    const shippingFee = zonePrice + parcelPrice;
    // نفس معادلة الفورم بالظبط: مبلغ COD = الإجمالي - رسوم الشحن (فقط لو الدفع COD)
    const cod = paymentMethod === "cod" ? (total - shippingFee) : total;

    validShipments.push({
      senderName, senderPhone, senderPhone2, senderCity,
      receiverName, receiverPhone, receiverPhone2, receiverAddress,
      receiverCity: resolvedReceiverCity,
      zoneId, zonePrice,
      parcelType, parcelPrice,
      weight, pieces: pieces || 1,
      description,
      paymentMethod: paymentMethod || "cod",
      codAmount: cod || 0,
      shippingFee,
      totalAmount: total || 0,
      notes,
      warehouseId,
    });
  }

  // ── إدخال الشحنات دفعة دفعة، كل شحنة برقمها التسلسلي الخاص ──────────────────
  let insertedCount = 0;
  const now = new Date();

  for (const s of validShipments) {
    try {
      const shipmentNumber = await generateShipmentNumber(tenantId);
      await db.insert(shipmentsTable).values({
        ...(tenantId !== null ? { tenantId } : {}),
        shipmentNumber,
        senderName:      s.senderName,
        senderPhone:     s.senderPhone ?? undefined,
        senderPhone2:    s.senderPhone2 ?? undefined,
        senderCity:      s.senderCity ?? undefined,
        receiverName:    s.receiverName,
        receiverPhone:   s.receiverPhone ?? undefined,
        receiverPhone2:  s.receiverPhone2 ?? undefined,
        receiverAddress: s.receiverAddress ?? undefined,
        receiverCity:    s.receiverCity ?? undefined,
        zoneId:          s.zoneId ?? undefined,
        zonePrice:       String(s.zonePrice),
        parcelType:      s.parcelType ?? undefined,
        parcelTypePrice: String(s.parcelPrice),
        weight:          s.weight != null ? String(s.weight) : undefined,
        pieces:          s.pieces,
        description:     s.description ?? undefined,
        warehouseId:     s.warehouseId ?? undefined,
        declaredValue:   "0",
        paymentMethod:   s.paymentMethod,
        codAmount:       String(s.codAmount),
        shippingFee:     String(s.shippingFee),
        insuranceFee:    "0",
        totalAmount:     String(s.totalAmount),
        collectedAmount: "0",
        status:          "waiting",
        notes:           s.notes ?? undefined,
        createdByUserId: user?.id,
        createdByName:   user?.displayName ?? user?.username,
        createdAt:       now,
        updatedAt:       now,
      });
      insertedCount++;
    } catch (insertErr: any) {
      errors.push(`فشل إدخال شحنة "${s.receiverName}": ${insertErr.message}`);
    }
  }

  res.json({
    imported: insertedCount,
    failed: errors.length,
    errors: errors.slice(0, 50),
    receivedRows: rows.length,
    validCount: validShipments.length,
  });
});

// ─── Returns Import: Parse ──────────────────────────────────────────────────────
router.post("/returns/import/parse", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "لم يتم رفع ملف" }); return; }
  try {
    const { headers, rows } = await parseFileToRaw(req.file.buffer, req.file.originalname);
    if (!headers.length) { res.status(400).json({ error: "الملف فارغ أو غير مدعوم" }); return; }
    res.json({ headers, sample: rows.slice(0, 5), totalRows: rows.length, allRows: rows });
  } catch (err: any) {
    res.status(500).json({ error: `فشل قراءة الملف: ${err.message}` });
  }
});

// ─── Returns Import: Execute ────────────────────────────────────────────────────
router.post("/returns/import/execute", async (req, res): Promise<void> => {
  const { headers, rows, mapping } = req.body as {
    headers: string[];
    rows: any[][];
    mapping: { orderId?: string; customerName?: string; product?: string; reason?: string };
  };

  if (!headers?.length || !rows?.length || !mapping) {
    res.status(400).json({ error: "بيانات غير مكتملة" }); return;
  }

  const headerIdx: Record<string, number> = {};
  headers.forEach((h, i) => { headerIdx[h] = i; });

  const getCell = (row: any[], colName: string | undefined): string => {
    if (!colName) return "";
    const idx = headerIdx[colName];
    if (idx === undefined) return "";
    const v = row[idx];
    if (v === null || v === undefined) return "";
    return String(v).trim();
  };

  const errors: string[] = [];
  let importedReturns = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const orderIdRaw = getCell(row, mapping.orderId);
    const customerName = getCell(row, mapping.customerName);
    const product = getCell(row, mapping.product);
    const reason = getCell(row, mapping.reason) || "مرتجع مستورد";

    if (!orderIdRaw && !customerName && !product) continue;

    let order: any = null;

    if (orderIdRaw) {
      const orderId = parseInt(orderIdRaw);
      if (!isNaN(orderId)) {
        const [found] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
        order = found;
      }
    }

    if (!order && customerName && product) {
      const [found] = await db.select().from(ordersTable)
        .where(and(ilike(ordersTable.customerName, customerName), ilike(ordersTable.product, product)))
        .limit(1);
      order = found;
    }

    if (!order) {
      const id = orderIdRaw ? `#${orderIdRaw}` : `${customerName}/${product}`;
      errors.push(`الصف ${rowNum}: لم يتم إيجاد الطلب (${id})`);
      continue;
    }

    if (order.status === "returned") {
      importedReturns++;
      continue;
    }

    await db.update(ordersTable)
      .set({ status: "returned", notes: reason, updatedAt: new Date() })
      .where(eq(ordersTable.id, order.id));

    importedReturns++;
  }

  res.json({ imported: importedReturns, failed: errors.length, errors: errors.slice(0, 30) });
});

// ─── Legacy endpoint ────────────────────────────────────────────────────────────
router.post("/orders/import", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }

  try {
    const { headers, rows: rawRows } = await parseFileToRaw(req.file.buffer, req.file.originalname);
    if (!rawRows.length) { res.status(400).json({ error: "Empty file or unsupported format" }); return; }

    const headerIdx: Record<string, number> = {};
    headers.forEach((h, i) => { headerIdx[h] = i; });

    const getCell = (row: any[], ...names: string[]) => {
      for (const name of names) {
        const idx = headerIdx[name];
        if (idx !== undefined && row[idx] !== undefined) return String(row[idx]).trim();
      }
      return "";
    };

    const validOrders: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const rowNum = i + 2;
      const customerName = getCell(row, "اسم العميل", "customerName", "customer_name", "name", "الاسم");
      const product = getCell(row, "المنتج", "product");
      const rawQty = getCell(row, "الكمية", "quantity");
      const rawPrice = getCell(row, "سعر الوحدة", "unitPrice", "unit_price", "السعر").replace(/,/g, "");
      const phone = getCell(row, "رقم الهاتف", "phone") || null;
      const address = getCell(row, "العنوان", "address") || null;
      const color = getCell(row, "اللون", "color") || null;
      const size = getCell(row, "المقاس", "size") || null;
      const notes = getCell(row, "ملاحظات", "notes") || null;

      if (!customerName && !product) continue;
      if (!customerName) { errors.push(`الصف ${rowNum}: اسم العميل مطلوب`); continue; }
      if (!product) { errors.push(`الصف ${rowNum}: اسم المنتج مطلوب`); continue; }

      const quantity = parseInt(rawQty || "1");
      if (isNaN(quantity) || quantity < 1) { errors.push(`الصف ${rowNum}: الكمية غير صحيحة`); continue; }

      const unitPrice = rawPrice ? parseFloat(rawPrice) : 0;
      if (rawPrice && isNaN(unitPrice)) { errors.push(`الصف ${rowNum}: السعر غير صحيح`); continue; }

      validOrders.push({
        customerName, product, color, size,
        quantity, unitPrice: unitPrice || 0,
        totalPrice: quantity * (unitPrice || 0),
        phone, address, notes, status: "pending" as const,
      });
    }

    const BATCH_SIZE = 100;
    let insertedCount = 0;
    if (validOrders.length > 0) {
      for (let i = 0; i < validOrders.length; i += BATCH_SIZE) {
        const batch = validOrders.slice(i, i + BATCH_SIZE);
        await db.insert(ordersTable).values(batch);
        insertedCount += batch.length;
      }
    }

    res.json({ imported: insertedCount, failed: errors.length, errors: errors.slice(0, 20), orders: [] });
  } catch (err: any) {
    res.status(500).json({ error: `فشل قراءة الملف: ${err.message}` });
  }
});

// ─── POST /api/import/inventory ─────────────────────────────────────────────
router.post("/import/inventory", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "لم يتم رفع ملف" }); return; }

  try {
    const { headers, rows } = await parseFileToRaw(req.file.buffer, req.file.originalname);

    const findCol = (...names: string[]) => {
      for (const h of headers) {
        if (names.some(n => h.trim().toLowerCase().includes(n.toLowerCase()))) return headers.indexOf(h);
      }
      return -1;
    };

    const skuCol = findCol("sku", "باركود", "كود");
    const qtyCol = findCol("الكمية المضافة", "كمية", "quantity", "qty");
    const costCol = findCol("سعر التكلفة", "تكلفة", "cost");

    if (skuCol === -1 || qtyCol === -1) {
      res.status(400).json({
        error: "الملف يجب أن يحتوي على أعمدة: SKU (أو باركود), الكمية المضافة",
        headers,
      });
      return;
    }

    const allVariants = await db.select().from(productVariantsTable);
    const variantBySku = new Map(allVariants.filter(v => v.sku).map(v => [v.sku!.trim().toLowerCase(), v]));

    const updated: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const sku = String(row[skuCol] ?? "").trim();
      const qty = parseInt(String(row[qtyCol] ?? "0"));
      const cost = costCol >= 0 ? parseFloat(String(row[costCol] ?? "")) : null;

      if (!sku) continue;
      if (isNaN(qty) || qty < 0) { errors.push(`صف ${i + 2}: كمية غير صالحة للـ SKU ${sku}`); continue; }

      const variant = variantBySku.get(sku.toLowerCase());
      if (!variant) { errors.push(`صف ${i + 2}: لم يُعثر على SKU ${sku}`); continue; }

      const updateData: any = { totalQuantity: variant.totalQuantity + qty };
      if (cost !== null && !isNaN(cost) && cost > 0) updateData.costPrice = cost;

      await db.update(productVariantsTable)
        .set(updateData)
        .where(eq(productVariantsTable.id, variant.id));

      updated.push({ sku, addedQty: qty, newTotal: variant.totalQuantity + qty });
    }

    res.json({ updated: updated.length, failed: errors.length, errors, items: updated });
  } catch (err: any) {
    res.status(500).json({ error: `فشل معالجة الملف: ${err.message}` });
  }
});

export default router;
