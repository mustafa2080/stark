// نموذج Excel فارغ لاستيراد الشحنات (صفحة /import).
//
// ⚠️ أسماء الأعمدة وترتيبها هنا لازم تفضل مطابقة 1:1 لـ SHIPMENTS_FIELDS في
// artifacts/caprina/src/pages/import.tsx، عشان ربط الأعمدة (autoDetect) يشتغل
// تلقائي 100% لما العميل يرفع الملف. القيم في القوائم المنسدلة مطابقة لما
// بيقبله POST /shipments/import/execute بالظبط (نفس خرائط الدفع/نعم-لا/الرفض).
import ExcelJS from "exceljs";

export interface ShipmentsTemplateLists {
  /** أسماء العملاء (الراسلين) المسجلين */
  senders: string[];
  /** مناطق التوصيل بصيغة "المحافظة - المنطقة" (نفس صيغة findZone في الاستيراد) */
  zones: string[];
  /** أسماء أنواع الشحنات المُسعّرة */
  parcelTypes: string[];
}

type ListKey = "senders" | "zones" | "parcelTypes" | "paymentMethods" | "yesNo" | "rejection";

interface ColumnDef {
  header: string;
  required: boolean;
  width: number;
  kind: "text" | "phone" | "decimal" | "list";
  list?: ListKey;
  /** true = يمنع أي قيمة خارج القائمة، false = يحذّر فقط ويسمح بالكتابة اليدوية */
  strict?: boolean;
  hint: string;
  example: string;
}

const STATIC_LISTS: Record<"paymentMethods" | "yesNo" | "rejection", string[]> = {
  paymentMethods: ["الدفع عند الاستلام", "مدفوع مسبقاً", "آجل"],
  yesNo: ["نعم", "لا"],
  rejection: ["دفع كامل", "مجاني"],
};

// ترتيب الأعمدة في ورقة "Lists" المخفية (A..F)
const LIST_ORDER: ListKey[] = ["senders", "zones", "parcelTypes", "paymentMethods", "yesNo", "rejection"];
const LIST_TITLES: Record<ListKey, string> = {
  senders: "الراسلون", zones: "مناطق التوصيل", parcelTypes: "أنواع الشحنات",
  paymentMethods: "طرق الدفع", yesNo: "نعم/لا", rejection: "حالة الرفض",
};

const COLUMNS: ColumnDef[] = [
  { header: "اسم الراسل", required: true, width: 28, kind: "list", list: "senders", strict: false,
    hint: "اسم العميل المسجل (اختر من القائمة). هاتف الراسل ومحافظته والمخزن بيتجابوا تلقائياً من حسابه.", example: "شركة النور للتجارة" },
  { header: "اسم المستلم", required: true, width: 24, kind: "text",
    hint: "الاسم الكامل للمستلم.", example: "محمد أحمد" },
  { header: "هاتف المستلم", required: true, width: 18, kind: "phone",
    hint: "رقم موبايل المستلم (يُحفظ كنص للحفاظ على الصفر في البداية).", example: "01012345678" },
  { header: "هاتف المستلم 2", required: false, width: 18, kind: "phone",
    hint: "رقم بديل للمستلم.", example: "01198765432" },
  { header: "عنوان المستلم", required: false, width: 38, kind: "text",
    hint: "العنوان بالتفصيل (الشارع، رقم العمارة، علامة مميزة).", example: "12 شارع التحرير، الدقي" },
  { header: "محافظة/مدينة المستلم", required: false, width: 22, kind: "text",
    hint: "لو تركتها فاضية وحددت منطقة توصيل، هتتعبّى من المنطقة تلقائياً.", example: "الجيزة" },
  { header: "منطقة التوصيل", required: false, width: 26, kind: "list", list: "zones", strict: true,
    hint: "اختر من القائمة بصيغة «المحافظة - المنطقة». تحدد سعر التوصيل.", example: "" },
  { header: "نوع الشحنة", required: false, width: 18, kind: "list", list: "parcelTypes", strict: true,
    hint: "اختر من القائمة. يضيف سعر نوع الشحنة على رسوم الشحن.", example: "" },
  { header: "الوزن (كجم)", required: false, width: 14, kind: "decimal",
    hint: "رقم بالكيلوجرام (مثال: 1.5).", example: "1.5" },
  { header: "وصف الشحنة", required: false, width: 30, kind: "text",
    hint: "محتوى الشحنة باختصار.", example: "ملابس" },
  { header: "طريقة الدفع", required: false, width: 22, kind: "list", list: "paymentMethods", strict: true,
    hint: "اختر من القائمة. لو تُركت فاضية تُعتبر «الدفع عند الاستلام».", example: "الدفع عند الاستلام" },
  { header: "سعر الشحنة (الإجمالي)", required: false, width: 22, kind: "decimal",
    hint: "الإجمالي بالجنيه شامل رسوم الشحن. في الدفع عند الاستلام يُخصم منه رسوم الشحن لحساب مبلغ التحصيل.", example: "450" },
  { header: "ملاحظات", required: false, width: 30, kind: "text",
    hint: "أي ملاحظات إضافية على الشحنة.", example: "" },
  { header: "حالة الشحنة (الفتح)", required: true, width: 20, kind: "list", list: "yesNo", strict: true,
    hint: "هل يُسمح للمستلم بفتح الشحنة قبل الاستلام؟ نعم / لا.", example: "نعم" },
  { header: "حالة التجزئة", required: true, width: 16, kind: "list", list: "yesNo", strict: true,
    hint: "هل الشحنة قابلة للتجزئة (تسليم جزئي)؟ نعم / لا.", example: "لا" },
  { header: "حالة الرفض", required: true, width: 18, kind: "list", list: "rejection", strict: true,
    hint: "لو المستلم رفض: «دفع كامل» (يدفع رسوم الشحن كاملة) أو «مجاني».", example: "دفع كامل" },
];

const MAX_ROWS = 1000; // عدد الصفوف اللي عليها قوائم/تحقق (من الصف 2)

const REQUIRED_FILL = "FF0F766E"; // أخضر داكن — حقل مطلوب
const OPTIONAL_FILL = "FF475569"; // رمادي — حقل اختياري
const thin = { style: "thin" as const, color: { argb: "FFCBD5E1" } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

const colLetter = (index1: number): string => {
  let n = index1, s = "";
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
};

export async function buildShipmentsImportTemplate(lists: ShipmentsTemplateLists): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Stark";
  wb.created = new Date();

  const data = wb.addWorksheet("الشحنات", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
  const guide = wb.addWorksheet("تعليمات", { views: [{ rightToLeft: true, showGridLines: false }] });
  const listsWs = wb.addWorksheet("Lists", { state: "hidden" });

  // ── القوائم (ورقة مخفية) ────────────────────────────────────────────────────
  const listValues: Record<ListKey, string[]> = { ...STATIC_LISTS, senders: lists.senders, zones: lists.zones, parcelTypes: lists.parcelTypes };
  const listRange: Partial<Record<ListKey, string>> = {};
  LIST_ORDER.forEach((key, i) => {
    const col = colLetter(i + 1);
    listsWs.getCell(`${col}1`).value = LIST_TITLES[key];
    const values = listValues[key];
    values.forEach((v, r) => { listsWs.getCell(`${col}${r + 2}`).value = v; });
    if (values.length > 0) listRange[key] = `Lists!$${col}$2:$${col}$${values.length + 1}`;
    listsWs.getColumn(i + 1).width = 28;
  });

  // ── ورقة الشحنات ────────────────────────────────────────────────────────────
  COLUMNS.forEach((def, i) => {
    const col = data.getColumn(i + 1);
    col.width = def.width;
    if (def.kind === "phone") col.numFmt = "@";
    if (def.kind === "decimal") col.numFmt = "#,##0.00";
    col.alignment = { horizontal: def.kind === "list" && def.list !== "senders" && def.list !== "zones" ? "center" : "right", vertical: "middle", wrapText: true };
  });

  const headerRow = data.getRow(1);
  headerRow.height = 30;
  COLUMNS.forEach((def, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = def.header; // ⚠️ لازم يطابق label الحقل في import.tsx بالحرف
    cell.style = {
      font: { bold: true, size: 11, color: { argb: "FFFFFFFF" } },
      fill: { type: "pattern", pattern: "solid", fgColor: { argb: def.required ? REQUIRED_FILL : OPTIONAL_FILL } },
      alignment: { horizontal: "center", vertical: "middle", wrapText: true },
      border,
    };
    cell.note = `${def.required ? "مطلوب" : "اختياري"} — ${def.hint}`;
  });

  // ── التحقق والقوائم المنسدلة ────────────────────────────────────────────────
  const dv = (data as any).dataValidations;
  COLUMNS.forEach((def, i) => {
    const range = `${colLetter(i + 1)}2:${colLetter(i + 1)}${MAX_ROWS + 1}`;
    if (def.kind === "list" && def.list && listRange[def.list]) {
      dv.add(range, {
        type: "list",
        allowBlank: true,
        formulae: [listRange[def.list]],
        showInputMessage: true,
        promptTitle: def.header,
        prompt: def.strict ? "اختر من القائمة" : "اختر من القائمة (أو اكتب اسماً غير مسجل)",
        showErrorMessage: true,
        errorStyle: def.strict ? "stop" : "warning",
        errorTitle: def.strict ? "قيمة غير صحيحة" : "اسم غير مسجل",
        error: def.strict
          ? `اختر قيمة من قائمة «${def.header}» فقط.`
          : "الاسم غير موجود في قائمة العملاء المسجلين. تأكد من كتابته صح — الشحنة ستُسجل بدون ربط بعميل.",
      });
    } else if (def.kind === "decimal") {
      dv.add(range, {
        type: "decimal",
        operator: "greaterThanOrEqual",
        allowBlank: true,
        formulae: [0],
        showErrorMessage: true,
        errorStyle: "stop",
        errorTitle: "قيمة غير صحيحة",
        error: `«${def.header}» لازم يكون رقماً أكبر من أو يساوي صفر.`,
      });
    }
  });

  // ── ورقة التعليمات ──────────────────────────────────────────────────────────
  guide.columns = [{ width: 26 }, { width: 11 }, { width: 70 }, { width: 28 }];
  const title = guide.getCell("A1");
  guide.mergeCells("A1:D1");
  title.value = "تعليمات تعبئة نموذج استيراد الشحنات";
  title.font = { bold: true, size: 15, color: { argb: REQUIRED_FILL } };
  title.alignment = { horizontal: "right", vertical: "middle" };
  guide.getRow(1).height = 30;

  const notes = [
    "املأ ورقة «الشحنات» فقط: كل صف = شحنة واحدة، وابدأ من الصف الثاني.",
    "لا تغيّر أسماء الأعمدة أو ترتيبها — عشان يتم ربطها تلقائياً عند رفع الملف.",
    "الأعمدة ذات العنوان الأخضر الداكن مطلوبة، والرمادية اختيارية.",
    "الخانات ذات القائمة المنسدلة: اختر القيمة من القائمة بدل الكتابة لتجنب أخطاء الإملاء.",
    "رقم الشحنة ورقم التتبع بيتولّدوا تلقائياً بعد الاستيراد، فمفيش داعي تكتبهم.",
    "اسم الراسل لازم يطابق عميل مسجل عشان يتربط بمخزنه وبياناته؛ لو غير مطابق تُسجَّل الشحنة بدون ربط ويربطها المسؤول يدوياً.",
  ];
  notes.forEach((text, i) => {
    const r = i + 3;
    guide.mergeCells(`A${r}:D${r}`);
    const c = guide.getCell(`A${r}`);
    c.value = `${i + 1}. ${text}`;
    c.alignment = { horizontal: "right", vertical: "middle", wrapText: true };
    guide.getRow(r).height = 22;
  });

  const tableHeaderRow = notes.length + 4;
  ["العمود", "الحالة", "الوصف / القيم المسموحة", "مثال"].forEach((h, i) => {
    const c = guide.getRow(tableHeaderRow).getCell(i + 1);
    c.value = h;
    c.style = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: REQUIRED_FILL } }, alignment: { horizontal: "center", vertical: "middle" }, border };
  });
  COLUMNS.forEach((def, i) => {
    const row = guide.getRow(tableHeaderRow + 1 + i);
    let example = def.example;
    if (def.list === "senders" && lists.senders[0]) example = lists.senders[0];
    if (def.list === "zones") example = lists.zones[0] ?? "";
    if (def.list === "parcelTypes") example = lists.parcelTypes[0] ?? "";
    [def.header, def.required ? "مطلوب" : "اختياري", def.hint, example].forEach((v, j) => {
      const c = row.getCell(j + 1);
      c.value = v;
      c.alignment = { horizontal: j === 1 ? "center" : "right", vertical: "middle", wrapText: true };
      c.border = border;
      if (j === 1) c.font = { bold: true, color: { argb: def.required ? REQUIRED_FILL : "FF64748B" } };
    });
    row.height = 34;
  });

  return Buffer.from(await wb.xlsx.writeBuffer());
}
