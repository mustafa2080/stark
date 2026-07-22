// seed-dummy-shipments.mjs
// سكريبت مؤقت لإضافة شحنات وهمية للمندوب عشان تجربة الشكل.
// يشتغل من مجلد lib/db (فيه mysql2 كـ dependency فعليًا).
//
// تشغيل عادي:   node seed-dummy-shipments.mjs
// حذف البيانات: node seed-dummy-shipments.mjs --undo

import mysql from "mysql2/promise";

const DATABASE_URL = process.env.DATABASE_URL
  || "mysql://starkvector_user:NewStrongPassword123!@localhost:3306/starkvector";

const DUMMY_TAG = "DUMMY_SEED_2026";

const DUMMY_NAMES = [
  "أحمد محمد السيد", "منى عبد الرحمن", "كريم حسن علي", "سارة إبراهيم فتحي",
  "محمود عزت رشدي", "ياسمين طارق نبيل", "عمر خالد فؤاد", "هدى سامي عبد الله",
  "مصطفى وائل شعبان", "نور الهدى جمال", "إسلام رفعت أنور", "دينا عصام الدين",
];

const CITIES = ["القاهرة", "الجيزة", "الإسكندرية", "المنصورة", "طنطا"];
const AREAS  = ["مدينة نصر", "المهندسين", "سموحة", "شارع الجمهورية", "حي أول"];

// نفس أنواع الحالات المستخدمة فعليًا في الكود (SHIPMENT_STATUSES)
const STATUSES = [
  "waiting", "confirmed", "picked_up", "in_transit",
  "out_for_delivery", "delivered", "delivered", "delivered",
  "partial_received", "delayed", "returned", "delivered",
];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomPhone() { return "01" + pick(["0", "1", "2", "5"]) + Math.floor(10000000 + Math.random() * 89999999); }
function fmtDate(d) { return d.toISOString().slice(0, 19).replace("T", " "); }

async function main() {
  const undo = process.argv.includes("--undo");
  const conn = await mysql.createConnection(DATABASE_URL);

  if (undo) {
    const [res] = await conn.query("DELETE FROM shipments WHERE internal_notes = ?", [DUMMY_TAG]);
    console.log(`تم حذف ${res.affectedRows} شحنة وهمية.`);
    await conn.end();
    return;
  }

  const [reps] = await conn.query(
    `SELECT id, username, display_name, tenant_id, shipping_company_id
     FROM users WHERE role = 'representative' AND is_active = 1
     ORDER BY id ASC LIMIT 1`
  );
  if (!reps.length) {
    console.error("مفيش أي مستخدم بدور representative. لازم يتعمل مندوب واحد الأول.");
    await conn.end();
    process.exit(1);
  }
  const rep = reps[0];
  console.log("المندوب المستخدم:", rep);

  if (!rep.shipping_company_id) {
    console.error(`المندوب ${rep.display_name} (id=${rep.id}) مش مربوط بشركة شحن. ظبط ده الأول يدوي.`);
    await conn.end();
    process.exit(1);
  }

  const companyId = rep.shipping_company_id;
  const tenantId = rep.tenant_id;

  const [admins] = await conn.query(
    `SELECT id, display_name FROM users WHERE role IN ('admin','super_admin') AND (tenant_id = ? OR tenant_id IS NULL) LIMIT 1`,
    [tenantId]
  );
  const createdByUserId = admins.length ? admins[0].id : null;
  const createdByName = admins.length ? admins[0].display_name : "نظام";

  const [zones] = await conn.query(
    `SELECT id FROM shipment_zones WHERE tenant_id = ? OR tenant_id IS NULL LIMIT 5`,
    [tenantId]
  );

  const now = new Date();
  const rows = [];

  for (let i = 0; i < DUMMY_NAMES.length; i++) {
    const status = STATUSES[i % STATUSES.length];
    const city = pick(CITIES);
    const area = pick(AREAS);
    const codAmount = (Math.floor(Math.random() * 40) + 5) * 25;
    const shippingFee = pick([30, 35, 40, 45, 50]);
    const total = codAmount + shippingFee;
    const createdAt = new Date(now.getTime() - Math.floor(Math.random() * 10) * 86400000);
    const zoneId = zones.length ? pick(zones).id : null;
    const shipmentNumber = "DUM-" + Date.now().toString().slice(-6) + "-" + (i + 1);

    const returnReason = status === "returned"
      ? pick(["العميل رفض الاستلام", "لم يتم الرد على الهاتف", "العنوان غير صحيح", "تغيير رأي العميل"])
      : null;
    const partialQuantity = status === "partial_received" ? Math.floor(Math.random() * 2) + 1 : null;
    const returnReceived = (status === "returned" || status === "partial_received") ? pick([0, 1]) : null;

    rows.push({
      tenant_id: tenantId,
      shipment_number: shipmentNumber,
      tracking_number: null,
      client_id: null,
      sender_name: "شركة ستارك للشحن",
      sender_phone: randomPhone(),
      sender_phone2: null,
      sender_email: null,
      sender_address: "مقر الشركة",
      sender_city: "القاهرة",
      receiver_name: DUMMY_NAMES[i],
      receiver_phone: randomPhone(),
      receiver_phone2: null,
      receiver_address: `${area} - شارع رقم ${Math.floor(Math.random() * 40) + 1} - عمارة ${Math.floor(Math.random() * 20) + 1}`,
      receiver_city: city,
      zone_id: zoneId,
      zone_price: 0,
      parcel_type: "طرد عادي",
      parcel_type_price: 0,
      weight: (Math.random() * 3 + 0.5).toFixed(2),
      pieces: Math.floor(Math.random() * 3) + 1,
      description: "بضاعة متنوعة (بيانات وهمية للتجربة)",
      product_id: null,
      variant_id: null,
      warehouse_id: null,
      declared_value: 0,
      can_open: null,
      is_divisible: null,
      rejection_policy: null,
      payment_method: "cod",
      cod_amount: codAmount,
      cost_price: 0,
      shipping_fee: shippingFee,
      insurance_fee: 0,
      total_amount: total,
      collected_amount: status === "delivered" ? total : (status === "partial_received" ? Math.floor(total / 2) : 0),
      status,
      shipping_company_id: companyId,
      assigned_user_id: rep.id,
      created_by_user_id: createdByUserId,
      created_by_name: createdByName,
      notes: "بيان تجريبي",
      internal_notes: DUMMY_TAG,
      return_reason: returnReason,
      return_received: returnReceived,
      return_note: status === "returned" ? "ملاحظة إرجاع تجريبية" : null,
      partial_quantity: partialQuantity,
      is_replacement_requested: 0,
      inventory_deducted: 0,
      inventory_returned: 0,
      estimated_delivery: null,
      actual_delivery: status === "delivered" ? fmtDate(createdAt) : null,
      deleted_at: null,
      created_at: fmtDate(createdAt),
      updated_at: fmtDate(now),
    });
  }

  const columns = Object.keys(rows[0]);
  const placeholders = columns.map(() => "?").join(", ");
  const sql = `INSERT INTO shipments (${columns.join(", ")}) VALUES (${placeholders})`;

  let inserted = 0;
  for (const row of rows) {
    const values = columns.map((c) => row[c]);
    await conn.execute(sql, values);
    inserted++;
  }

  console.log(`تم إدخال ${inserted} شحنة وهمية بنجاح للمندوب: ${rep.display_name} (id=${rep.id})`);
  console.log("للحذف لاحقًا: node seed-dummy-shipments.mjs --undo");
  await conn.end();
}

main().catch((e) => {
  console.error("خطأ:", e);
  process.exit(1);
});
