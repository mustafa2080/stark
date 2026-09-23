import { inArray } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";

/**
 * يجيب اسم المنتج القديم (originalProductId) لمجموعة شحنات دفعة واحدة، عشان بيان
 * المندوب وبيان العميل يعرضوا "المنتج القديم: <الاسم>" في سطر المرتجع الفرعي بدل
 * النص العام. الاستعلام واحد بـ inArray (مش N+1)، ومش بيتنفذ أصلًا لو مفيش أي
 * شحنة استبدال فيها original_product_id.
 *
 * بيرجّع Map من shipmentId → اسم المنتج القديم (الشحنات اللي مالهاش منتج قديم
 * مسجّل مش بتظهر في الـ Map، فالفرونت يقع على النص العام).
 */
export async function getOriginalProductNamesByShipment(
  shipments: Array<{ id: number; originalProductId?: number | null }>,
): Promise<Record<number, string>> {
  const productIds = [
    ...new Set(
      shipments
        .map((s) => s.originalProductId)
        .filter((v): v is number => !!v),
    ),
  ];
  if (productIds.length === 0) return {};

  const rows = await db
    .select({ id: productsTable.id, name: productsTable.name })
    .from(productsTable)
    .where(inArray(productsTable.id, productIds));
  const nameByProduct = new Map(rows.map((r) => [r.id, r.name]));

  const result: Record<number, string> = {};
  for (const s of shipments) {
    const name = s.originalProductId ? nameByProduct.get(s.originalProductId) : undefined;
    if (name) result[s.id] = name;
  }
  return result;
}
