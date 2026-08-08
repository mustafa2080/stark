import { Router, type IRouter } from "express";
import multer from "multer";
import ExcelJS from "exceljs";
import { db, ordersTable, productsTable, productVariantsTable, shipmentsTable, shipmentZonesTable, parcelTypePricingTable, warehousesTable, clientsTable } from "@workspace/db";
import { eq, and, ilike } from "drizzle-orm";
import { getTenantId } from "../middlewares/requireTenant.js";
import { generateShipmentNumber } from "./shipments.js";
import { autoAddShipmentToClientAccountManifest } from "./client-account-manifests.js";

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
      canOpen?: string;
      isDivisible?: string;
      rejectionPolicy?: string;
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
  const clients = await db.select().from(clientsTable)
    .where(tenantId !== null ? eq(clientsTable.tenantId, tenantId) : undefined as any);

  const norm = (s: string) => s.trim().toLowerCase();

  // تطبيع عربي ذكي: بيشيل التشكيل، المسافات الزيادة، ويوحّد الحروف المتشابهة
  // (أ/إ/آ/ا، ة/ه، ي/ى) عشان مطابقة اسم الراسل تبقى حساسة زي البحث اليدوي بالظبط
  const normArabic = (s: string) => {
    if (!s) return "";
    return s
      .trim()
      .toLowerCase()
      .replace(/[\u064B-\u065F\u0670]/g, "")   // إزالة التشكيل
      .replace(/[أإآ]/g, "ا")                    // توحيد الألف
      .replace(/ة/g, "ه")                        // تاء مربوطة -> هاء
      .replace(/ى/g, "ي")                        // ألف مقصورة -> ياء
      .replace(/[\u200B\u200C\u200D]/g, "")      // إزالة المسافات الخفية
      .replace(/\s+/g, " ")                       // توحيد المسافات المتعددة
      .trim();
  };

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
    "دفع عند الاستلام": "cod", "الدفع عند التسليم": "cod", "دفع عند التسليم": "cod",
    "مدفوع مسبقا": "prepaid", "مدفوع مسبقاً": "prepaid", "prepaid": "prepaid",
    "مدفوع مقدما": "prepaid", "مقدم": "prepaid", "دفع مقدم": "prepaid",
    "آجل": "deferred", "اجل": "deferred", "deferred": "deferred",
    "دفع آجل": "deferred", "دفع اجل": "deferred",
  };
  const PAYMENT_METHOD_MAP_NORM: Record<string, string> = Object.fromEntries(
    Object.entries(PAYMENT_METHOD_MAP).map(([k, v]) => [normArabic(k), v])
  );
  const parsePaymentMethod = (raw: string): string | null => {
    const n = normArabic(raw);
    if (n in PAYMENT_METHOD_MAP_NORM) return PAYMENT_METHOD_MAP_NORM[n];
    const nNoAl = n.replace(/^ال/, "");
    if (nNoAl in PAYMENT_METHOD_MAP_NORM) return PAYMENT_METHOD_MAP_NORM[nNoAl];
    if (n.includes("استلام") || n.includes("تسليم") || n === "cod") return "cod";
    if (n.includes("مسبق") || n.includes("مقدم") || n === "prepaid") return "prepaid";
    if (n.includes("اجل") || n === "deferred") return "deferred";
    return null;
  };

  const findWarehouse = (raw: string) => {
    if (!raw) return null;
    const n = norm(raw);
    return warehouses.find(w => norm(w.name || "") === n)
      ?? warehouses.find(w => norm(w.name || "").includes(n))
      ?? null;
  };

  // مطابقة العميل بالاسم (لتحديد المخزن تلقائيًا من مخزن الراسل)
  // مطابقة ذكية ومتدرجة، زي البحث اليدوي بالظبط:
  // 1) تطابق تام بعد التطبيع العربي (تشكيل/مسافات/همزات/تاء مربوطة... إلخ)
  // 2) احتواء نصي (اسم الراسل يحتوي اسم العميل أو العكس)
  // 3) تطابق بالكلمات: كل كلمات اسم العميل موجودة في اسم الراسل، بأي ترتيب
  //    (بيعالج فرق ترتيب الاسم أو وجود لقب/كلمة زيادة زي "شركة"/"مؤسسة")
  const findClient = (raw: string) => {
    if (!raw) return null;
    const n = normArabic(raw);
    if (!n) return null;

    // 1) تطابق تام
    const exact = clients.find(c => normArabic(c.name || "") === n);
    if (exact) return exact;

    // 2) احتواء نصي في أي اتجاه
    const contains = clients.find(c => {
      const cn = normArabic(c.name || "");
      return cn && (cn.includes(n) || n.includes(cn));
    });
    if (contains) return contains;

    // 3) تطابق بالكلمات (بدون ترتيب)، لو فيه أكتر من عميل مطابق ناخد الأقرب في عدد الكلمات
    const rawWords = n.split(" ").filter(Boolean);
    if (rawWords.length > 0) {
      const wordMatches = clients
        .map(c => {
          const cWords = normArabic(c.name || "").split(" ").filter(Boolean);
          if (cWords.length === 0) return null;
          const matchedCount = cWords.filter(w => rawWords.includes(w)).length;
          const fullyContained = matchedCount === cWords.length || matchedCount === rawWords.length;
          return fullyContained && matchedCount > 0 ? { client: c, matchedCount } : null;
        })
        .filter((x): x is { client: typeof clients[number]; matchedCount: number } => x !== null)
        .sort((a, b) => b.matchedCount - a.matchedCount);
      if (wordMatches.length > 0) return wordMatches[0].client;
    }

    return null;
  };

  // "نعم"/"لا" بأي صيغة شائعة -> 1/0
  const YES_NO_MAP: Record<string, number> = {
    "نعم": 1, "لا": 0,
    "ايوه": 1, "أيوه": 1, "ايوة": 1, "أيوة": 1,
    "yes": 1, "no": 0, "true": 1, "false": 0, "y": 1, "n": 0,
    "1": 1, "0": 0,
    // حالة الفتح
    "مسموح": 1, "ممنوع": 0, "قابل للفتح": 1, "غير قابل للفتح": 0,
    "يمكن الفتح": 1, "لا يمكن الفتح": 0,
    // حالة التجزئة
    "قابله للتجزئه": 1, "قابلة للتجزئة": 1,
    "غير قابله للتجزئه": 0, "غير قابلة للتجزئة": 0,
    "الشحنه قابله للتجزئه": 1, "الشحنة قابلة للتجزئة": 1,
    "الشحنه غير قابله للتجزئه": 0, "الشحنة غير قابلة للتجزئة": 0,
  };
  const normalizeYesNoKey = (raw: string): string =>
    raw.trim().replace(/[إأآا]/g, "ا").replace(/ة/g, "ه").replace(/\s+/g, " ");
  const parseYesNo = (raw: string): number | null => {
    const n = normalizeYesNoKey(raw);
    if (n in YES_NO_MAP) return YES_NO_MAP[n];
    // مطابقة مرنة: لو النص فيه "غير" يبقى لأ، غير كده لو فيه "قابل"/"مسموح"/"يمكن" يبقى نعم
    if (n.includes("غير") || n.includes("ممنوع") || n.includes("لا يمكن")) return 0;
    if (n.includes("قابل") || n.includes("مسموح") || n.includes("يمكن")) return 1;
    return null;
  };

  // "دفع كامل"/"مجاني" -> full_fee/free
  const REJECTION_POLICY_MAP: Record<string, string> = {
    "دفع كامل": "full_fee",
    "يدفع كامل": "full_fee",
    "دفع كامل مصاريف الشحن": "full_fee",
    "يتم دفع مصاريف الشحن كامله": "full_fee",
    "يتم دفع مصاريف الشحن كاملة": "full_fee",
    "دفع مصاريف الشحن كامله": "full_fee",
    "full_fee": "full_fee", "full fee": "full_fee",
    "مجاني": "free", "مجانا": "free",
    "بدون مصاريف": "free", "بدون مصاريف شحن": "free",
    "free": "free",
  };
  const parseRejectionPolicy = (raw: string): string | null => {
    const n = normalizeYesNoKey(raw);
    if (n in REJECTION_POLICY_MAP) return REJECTION_POLICY_MAP[n];
    if (n.includes("مجان") || n.includes("بدون مصاريف") || n.includes("free")) return "free";
    if (n.includes("دفع") && (n.includes("كامل") || n.includes("مصاريف الشحن"))) return "full_fee";
    return null;
  };

  const errors: string[] = [];
  const validShipments: any[] = [];

  // ── ملاحظة: أسماء الراسلين غير المطابقة لعميل تجاري لم تعد تُرفض بالكامل ───
  // الشحنة بيانات الراسل بتاعتها بتتسجل بدون عميل/مخزن مربوط (يتم ربطها يدويًا لاحقًا من الإدارة)

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;

    const senderName      = getCell(row, mapping.senderName);
    const receiverName    = getCell(row, mapping.receiverName);
    // ملاحظة: senderPhone/senderPhone2/senderCity بتتجاب تلقائياً من بيانات العميل (clientsTable) تحت، مش من الإكسيل
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
    const canOpenRaw       = getCell(row, mapping.canOpen);
    const isDivisibleRaw   = getCell(row, mapping.isDivisible);
    const rejectionPolicyRaw = getCell(row, mapping.rejectionPolicy);

    // تجاهل الصفوف الفاضية تماماً
    if (!senderName && !receiverName && !rawCodAmount) continue;

    // ── Validation: نفس الحقول المطلوبة الموجودة في فورم "شحنة جديدة" ──────────
    if (!senderName)   { errors.push(`الصف ${rowNum}: اسم الراسل مطلوب`); continue; }
    if (!receiverName) { errors.push(`الصف ${rowNum}: اسم المستلم مطلوب`); continue; }
    if (!receiverPhone) { errors.push(`الصف ${rowNum}: هاتف المستلم مطلوب`); continue; }

    // حالة الفتح (canOpen) — إجباري، "نعم"/"لا"
    if (!canOpenRaw) { errors.push(`الصف ${rowNum}: حالة الشحنة (الفتح) مطلوبة`); continue; }
    const canOpen = parseYesNo(canOpenRaw);
    if (canOpen === null) {
      errors.push(`الصف ${rowNum}: حالة الشحنة (الفتح) "${canOpenRaw}" غير معروفة (المتاح: نعم، لا)`);
      continue;
    }

    // حالة التجزئة (isDivisible) — إجباري، "نعم"/"لا"
    if (!isDivisibleRaw) { errors.push(`الصف ${rowNum}: حالة التجزئة مطلوبة`); continue; }
    const isDivisible = parseYesNo(isDivisibleRaw);
    if (isDivisible === null) {
      errors.push(`الصف ${rowNum}: حالة التجزئة "${isDivisibleRaw}" غير معروفة (المتاح: نعم، لا)`);
      continue;
    }

    // حالة الرفض (rejectionPolicy) — إجباري، "دفع كامل"/"مجاني"
    if (!rejectionPolicyRaw) { errors.push(`الصف ${rowNum}: حالة الرفض مطلوبة`); continue; }
    const rejectionPolicy = parseRejectionPolicy(rejectionPolicyRaw);
    if (!rejectionPolicy) {
      errors.push(`الصف ${rowNum}: حالة الرفض "${rejectionPolicyRaw}" غير معروفة (المتاح: دفع كامل، مجاني)`);
      continue;
    }

    // العميل (الراسل) يتحدد بالاسم، وبيانات المرسل (هاتف، هاتف 2، محافظة) والمخزن تُجلب منه تلقائيًا
    // لو الراسل مش مطابق لعميل مسجل، الشحنة بتتسجل بدون عميل/مخزن (يتم ربطها يدويًا لاحقًا من الإدارة)
    let clientId: number | null = null;
    let warehouseId: number | null = null;
    let senderPhone: string | null = null;
    let senderPhone2: string | null = null;
    let senderCity: string | null = null;
    {
      const clientRow = findClient(senderName);
      if (clientRow) {
        clientId = clientRow.id;
        warehouseId = clientRow.warehouseId || null;
        senderPhone = clientRow.phone || null;
        senderPhone2 = clientRow.phone2 || null;
        senderCity = clientRow.region || clientRow.city || null;
      }
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
      ? parsePaymentMethod(paymentMethodRaw)
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
      clientId,
      warehouseId,
      canOpen,
      isDivisible,
      rejectionPolicy,
    });
  }

  // ── إدخال الشحنات دفعة دفعة، كل شحنة برقمها التسلسلي الخاص ──────────────────
  // نحسب رقم البداية مرة واحدة فقط من الداتابيز، وبعدين نزوّد العداد محليًا لكل
  // صف — لأن استدعاء generateShipmentNumber جوه اللوب كان بيعتمد على createdAt
  // للترتيب، وكل صفوف الاستيراد بتتحط بنفس اللحظة بالميلي ثانية، فكان بيرجّع
  // نفس الرقم القديم لعدة صفوف ويسبب أرقام شحنات مكررة.
  let insertedCount = 0;
  const now = new Date();
  const firstShipmentNumber = await generateShipmentNumber(tenantId);
  const numberPrefix = firstShipmentNumber.slice(0, -4);
  let nextSeq = parseInt(firstShipmentNumber.slice(-4), 10);

  for (const s of validShipments) {
    try {
      const shipmentNumber = `${numberPrefix}${String(nextSeq).padStart(4, "0")}`;
      nextSeq++;
      const insertResult = await db.insert(shipmentsTable).values({
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
        canOpen:         s.canOpen,
        isDivisible:     s.isDivisible,
        rejectionPolicy: s.rejectionPolicy,
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

      // إضافة تلقائية لبيان حساب العميل المفتوح (لو موجود)، أو فتح بيان جديد له
      // — نفس آلية POST /shipments، عشان الشحنات المستوردة متفضلش معلّقة برة
      // أي بيان حساب لحد ما حد يضيفها يدويًا.
      if (s.clientId) {
        const insertId = (insertResult as any)[0]?.insertId ?? (insertResult as any).insertId;
        autoAddShipmentToClientAccountManifest(insertId, s.clientId, tenantId)
          .catch((e) => console.error("[POST /import/shipments] auto-add manifest error", e));
      }
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
