// اختبار منطقي مستقل لمنطق استيراد الشحنات - بدون سيرفر أو DB حقيقية
// بيحاكي نفس دوال findZone / findParcelPricing / findWarehouse / validation loop

const norm = (s) => s.trim().toLowerCase();

// ── بيانات وهمية منطقية (زي ما هتكون فعليًا في القاعدة) ─────────────────────
const zones = [
  { id: 1, name: "المعادي", toGovernorate: "القاهرة", price: "35" },
  { id: 2, name: "سموحة", toGovernorate: "الإسكندرية", price: "45" },
  { id: 3, name: "المنصورة", toGovernorate: "الدقهلية", price: "50" },
];

const parcelPricing = [
  { parcelType: "normal", label: "عادي", basePrice: "0" },
  { parcelType: "fragile", label: "قابل للكسر", basePrice: "15" },
  { parcelType: "electronics", label: "إلكترونيات", basePrice: "25" },
];

const warehouses = [
  { id: 1, name: "المخزن الرئيسي" },
  { id: 2, name: "مخزن الإسكندرية" },
];

const findZone = (raw) => {
  if (!raw) return null;
  const n = norm(raw);
  return zones.find(z => {
    const name = norm(z.name || "");
    const gov = norm(z.toGovernorate || "");
    const combo = gov && name ? `${gov} - ${name}` : (gov || name);
    return name === n || combo === n || gov === n;
  }) ?? zones.find(z => norm(z.name || "").includes(n) || norm(z.toGovernorate || "").includes(n)) ?? null;
};

const PARCEL_TYPE_MAP = {
  "مستندات": "document", "document": "document",
  "عادي": "normal", "normal": "normal",
  "قابل للكسر": "fragile", "fragile": "fragile",
  "ثقيل": "heavy", "heavy": "heavy",
  "إلكترونيات": "electronics", "electronics": "electronics",
  "ملابس": "clothing", "clothing": "clothing",
  "طعام": "food", "food": "food",
  "أخرى": "other", "other": "other",
};
const findParcelPricing = (raw) => {
  if (!raw) return null;
  const n = norm(raw);
  const mappedType = PARCEL_TYPE_MAP[raw] ?? PARCEL_TYPE_MAP[n] ?? null;
  return parcelPricing.find(p => p.parcelType === mappedType)
    ?? parcelPricing.find(p => norm(p.label || "") === n || norm(p.parcelType) === n)
    ?? null;
};

const PAYMENT_METHOD_MAP = {
  "الدفع عند الاستلام": "cod", "cod": "cod",
  "مدفوع مسبقا": "prepaid", "مدفوع مسبقاً": "prepaid", "prepaid": "prepaid",
  "آجل": "deferred", "اجل": "deferred", "deferred": "deferred",
};

const findWarehouse = (raw) => {
  if (!raw) return null;
  const n = norm(raw);
  return warehouses.find(w => norm(w.name || "") === n)
    ?? warehouses.find(w => norm(w.name || "").includes(n))
    ?? null;
};

// ── صفوف اختبار: 3 صحيحة + 5 فيها أخطاء متعمدة لاختبار كل حالة ──────────────
const headers = ["اسم الراسل", "اسم المستلم", "المخزن", "المنطقة", "نوع الطرد", "الوزن", "عدد القطع", "طريقة الدفع", "المبلغ الكلي"];
const rows = [
  ["أحمد علي", "محمد سعيد", "المخزن الرئيسي", "المعادي", "عادي", "1.5", "1", "الدفع عند الاستلام", "100"],           // ✅ صحيح
  ["سارة محمود", "لؤي حسن", "مخزن الإسكندرية", "سموحة", "قابل للكسر", "2", "2", "مدفوع مسبقاً", "80"],               // ✅ صحيح
  ["كريم فؤاد", "دينا طارق", "المخزن الرئيسي", "", "إلكترونيات", "0.5", "1", "", "60"],                              // ✅ صحيح (منطقة فاضية، دفع افتراضي cod)
  ["", "عميل بدون راسل", "المخزن الرئيسي", "المعادي", "عادي", "1", "1", "cod", "50"],                                // ❌ اسم الراسل مفقود
  ["مصطفى جمال", "", "المخزن الرئيسي", "المعادي", "عادي", "1", "1", "cod", "50"],                                    // ❌ اسم المستلم مفقود
  ["هبة كريم", "علي محمد", "مخزن غير موجود", "المعادي", "عادي", "1", "1", "cod", "50"],                              // ❌ مخزن غير موجود
  ["ياسر فتحي", "منى سعد", "المخزن الرئيسي", "منطقة وهمية غير موجودة", "عادي", "1", "1", "cod", "50"],               // ❌ منطقة غير موجودة
  ["رامي حسام", "نور الدين", "المخزن الرئيسي", "المعادي", "نوع غريب", "1", "1", "cod", "50"],                        // ❌ نوع طرد غير معروف
  ["عمرو صلاح", "ندى وليد", "المخزن الرئيسي", "المعادي", "عادي", "abc", "1", "cod", "50"],                           // ❌ وزن غير صحيح
  ["فادي رمزي", "ريم عادل", "المخزن الرئيسي", "المعادي", "عادي", "1", "1", "طريقة غريبة", "50"],                     // ❌ طريقة دفع غير معروفة
];

const headerIdx = {};
headers.forEach((h, i) => (headerIdx[h] = i));
const getCell = (row, colName) => {
  const idx = headerIdx[colName];
  if (idx === undefined) return "";
  const v = row[idx];
  return v === null || v === undefined ? "" : String(v).trim();
};

const mapping = {
  senderName: "اسم الراسل", receiverName: "اسم المستلم", warehouse: "المخزن",
  zone: "المنطقة", parcelType: "نوع الطرد", weight: "الوزن", pieces: "عدد القطع",
  paymentMethod: "طريقة الدفع", codAmount: "المبلغ الكلي",
};

const errors = [];
const validShipments = [];

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const rowNum = i + 2;

  const senderName = getCell(row, mapping.senderName);
  const receiverName = getCell(row, mapping.receiverName);
  const zoneRaw = getCell(row, mapping.zone);
  const parcelTypeRaw = getCell(row, mapping.parcelType);
  const rawWeight = getCell(row, mapping.weight);
  const rawPieces = getCell(row, mapping.pieces);
  const paymentMethodRaw = getCell(row, mapping.paymentMethod);
  const rawCodAmount = getCell(row, mapping.codAmount).replace(/,/g, "");
  const warehouseRaw = getCell(row, mapping.warehouse);

  if (!senderName && !receiverName && !rawCodAmount) continue;

  if (!senderName) { errors.push(`الصف ${rowNum}: اسم الراسل مطلوب`); continue; }
  if (!receiverName) { errors.push(`الصف ${rowNum}: اسم المستلم مطلوب`); continue; }

  let warehouseId = null;
  if (warehouseRaw) {
    const wh = findWarehouse(warehouseRaw);
    if (!wh) { errors.push(`الصف ${rowNum}: المخزن "${warehouseRaw}" غير موجود`); continue; }
    warehouseId = wh.id;
  } else {
    errors.push(`الصف ${rowNum}: المخزن مطلوب`);
    continue;
  }

  let zoneId = null, zonePrice = 0;
  if (zoneRaw) {
    const zone = findZone(zoneRaw);
    if (!zone) { errors.push(`الصف ${rowNum}: منطقة التوصيل "${zoneRaw}" غير موجودة`); continue; }
    zoneId = zone.id;
    zonePrice = Number(zone.price) || 0;
  }

  let parcelType = null, parcelPrice = 0;
  if (parcelTypeRaw) {
    const pricing = findParcelPricing(parcelTypeRaw);
    if (!pricing) { errors.push(`الصف ${rowNum}: نوع الطرد "${parcelTypeRaw}" غير معروف`); continue; }
    parcelType = pricing.parcelType;
    parcelPrice = Number(pricing.basePrice) || 0;
  }

  const weight = rawWeight ? parseFloat(rawWeight) : null;
  if (rawWeight && isNaN(weight)) { errors.push(`الصف ${rowNum}: الوزن غير صحيح ("${rawWeight}")`); continue; }

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
  const cod = paymentMethod === "cod" ? (total - shippingFee) : total;

  validShipments.push({ senderName, receiverName, warehouseId, zoneId, zonePrice, parcelType, parcelPrice, weight, pieces: pieces || 1, paymentMethod: paymentMethod || "cod", codAmount: cod || 0, shippingFee, totalAmount: total || 0 });
}

console.log(`✅ صفوف صحيحة: ${validShipments.length}`);
console.log(JSON.stringify(validShipments, null, 2));
console.log(`\n❌ أخطاء: ${errors.length}`);
errors.forEach(e => console.log(" - " + e));
