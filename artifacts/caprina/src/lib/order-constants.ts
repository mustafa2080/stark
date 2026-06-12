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
  pending:          "bg-amber-100  dark:bg-amber-900/40   text-amber-800   dark:text-amber-300   border-amber-400   dark:border-amber-700",
  warehouse_ready:  "bg-teal-600   dark:bg-teal-700       text-white        dark:text-white        border-teal-700    dark:border-teal-600",
  in_shipping:      "bg-sky-100    dark:bg-sky-900/40     text-sky-800     dark:text-sky-300     border-sky-400     dark:border-sky-700",
  received:         "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-400 dark:border-emerald-700",
  partial_received: "bg-cyan-100   dark:bg-cyan-900/40    text-cyan-800    dark:text-cyan-300    border-cyan-400    dark:border-cyan-700",
  delayed:          "bg-indigo-600 dark:bg-indigo-700       text-white        dark:text-white        border-indigo-700    dark:border-indigo-600",
  returned:         "bg-red-100    dark:bg-red-900/40     text-red-800     dark:text-red-300     border-red-400     dark:border-red-700",
  // fallback mapping للقيم القديمة في الـ DB
  waiting:          "bg-amber-100  dark:bg-amber-900/40   text-amber-800   dark:text-amber-300   border-amber-400   dark:border-amber-700",
  confirmed:        "bg-amber-100  dark:bg-amber-900/40   text-amber-800   dark:text-amber-300   border-amber-400   dark:border-amber-700",
  picked_up:        "bg-teal-600   dark:bg-teal-700       text-white        dark:text-white        border-teal-700    dark:border-teal-600",
  in_transit:       "bg-sky-100    dark:bg-sky-900/40     text-sky-800     dark:text-sky-300     border-sky-400     dark:border-sky-700",
  out_for_delivery: "bg-sky-100    dark:bg-sky-900/40     text-sky-800     dark:text-sky-300     border-sky-400     dark:border-sky-700",
  delivered:        "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-400 dark:border-emerald-700",
  cancelled:        "bg-red-100    dark:bg-red-900/40     text-red-800     dark:text-red-300     border-red-400     dark:border-red-700",
};
