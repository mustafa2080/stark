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
  pending:          "bg-amber-50   dark:bg-amber-900/30   text-amber-700   dark:text-amber-400   border-amber-300   dark:border-amber-800",
  warehouse_ready:  "bg-teal-50    dark:bg-teal-900/30    text-teal-700    dark:text-teal-400    border-teal-300    dark:border-teal-800",
  in_shipping:      "bg-sky-50     dark:bg-sky-900/30     text-sky-700     dark:text-sky-400     border-sky-300     dark:border-sky-800",
  received:         "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
  partial_received: "bg-purple-50  dark:bg-purple-900/30  text-purple-700  dark:text-purple-400  border-purple-300  dark:border-purple-800",
  delayed:          "bg-blue-50    dark:bg-blue-900/30    text-blue-700    dark:text-blue-400    border-blue-300    dark:border-blue-800",
  returned:         "bg-red-50     dark:bg-red-900/30     text-red-700     dark:text-red-400     border-red-300     dark:border-red-800",
  // fallback mapping للقيم القديمة في الـ DB
  waiting:          "bg-amber-50   dark:bg-amber-900/30   text-amber-700   dark:text-amber-400   border-amber-300   dark:border-amber-800",
  confirmed:        "bg-teal-50    dark:bg-teal-900/30    text-teal-700    dark:text-teal-400    border-teal-300    dark:border-teal-800",
  picked_up:        "bg-teal-50    dark:bg-teal-900/30    text-teal-700    dark:text-teal-400    border-teal-300    dark:border-teal-800",
  in_transit:       "bg-sky-50     dark:bg-sky-900/30     text-sky-700     dark:text-sky-400     border-sky-300     dark:border-sky-800",
  out_for_delivery: "bg-sky-50     dark:bg-sky-900/30     text-sky-700     dark:text-sky-400     border-sky-300     dark:border-sky-800",
  delivered:        "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
  cancelled:        "bg-red-50     dark:bg-red-900/30     text-red-700     dark:text-red-400     border-red-300     dark:border-red-800",
};
