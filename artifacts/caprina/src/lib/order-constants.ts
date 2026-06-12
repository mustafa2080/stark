export const RETURN_REASONS: { value: string; label: string }[] = [
  { value: "size_mismatch", label: "مقاس غير مناسب" },
  { value: "quality",       label: "جودة" },
  { value: "customer_refused", label: "عميل غير جاد" },
  { value: "customer_requested_return", label: "طلب العميل مرتجع" },
  { value: "delay",         label: "سبب التأخير" },
  { value: "other",         label: "سبب آخر" },
];

export const returnReasonLabel = (reason: string | null | undefined): string => {
  if (!reason) return "—";
  return RETURN_REASONS.find(r => r.value === reason)?.label ?? reason;
};

export const STATUS_LABELS: Record<string, string> = {
  pending:          "قيد الانتظار",
  warehouse_ready:  "قيد الشحن في المخزن",
  in_shipping:      "قيد الشحن",
  received:         "استلم",
  partial_received: "استلام جزئي",
  delayed:          "مؤجل",
  returned:         "مرتجع",
  // fallback mapping للقيم القديمة في الـ DB
  waiting:          "قيد الانتظار",
  confirmed:        "قيد الشحن في المخزن",
  picked_up:        "قيد الشحن في المخزن",
  in_transit:       "قيد الشحن",
  out_for_delivery: "قيد الشحن",
  delivered:        "استلم",
  cancelled:        "مرتجع",
};

export const STATUS_CLASSES: Record<string, string> = {
  pending:          "bg-amber-500  dark:bg-amber-600  text-white dark:text-white  border-amber-600  dark:border-amber-700",
  warehouse_ready:  "bg-teal-600   dark:bg-teal-700   text-white dark:text-white  border-teal-700   dark:border-teal-600",
  in_shipping:      "bg-sky-600    dark:bg-sky-700    text-white dark:text-white  border-sky-700    dark:border-sky-600",
  received:         "bg-emerald-600 dark:bg-emerald-700 text-white dark:text-white border-emerald-700 dark:border-emerald-600",
  partial_received: "bg-purple-600 dark:bg-purple-700  text-white dark:text-white  border-purple-700 dark:border-purple-600",
  delayed:          "bg-indigo-600 dark:bg-indigo-700  text-white dark:text-white  border-indigo-700 dark:border-indigo-600",
  returned:         "bg-red-600    dark:bg-red-700     text-white dark:text-white  border-red-700    dark:border-red-600",
  // fallback mapping للقيم القديمة في الـ DB
  waiting:          "bg-amber-500  dark:bg-amber-600  text-white dark:text-white  border-amber-600  dark:border-amber-700",
  confirmed:        "bg-amber-500  dark:bg-amber-600  text-white dark:text-white  border-amber-600  dark:border-amber-700",
  picked_up:        "bg-teal-600   dark:bg-teal-700   text-white dark:text-white  border-teal-700   dark:border-teal-600",
  in_transit:       "bg-sky-600    dark:bg-sky-700    text-white dark:text-white  border-sky-700    dark:border-sky-600",
  out_for_delivery: "bg-sky-600    dark:bg-sky-700    text-white dark:text-white  border-sky-700    dark:border-sky-600",
  delivered:        "bg-emerald-600 dark:bg-emerald-700 text-white dark:text-white border-emerald-700 dark:border-emerald-600",
  cancelled:        "bg-red-600    dark:bg-red-700     text-white dark:text-white  border-red-700    dark:border-red-600",
};
