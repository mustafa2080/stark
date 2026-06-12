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
  waiting:          "انتظار",
  confirmed:        "مؤكدة",
  picked_up:        "تم الاستلام",
  in_transit:       "في الطريق",
  out_for_delivery: "خرجت للتسليم",
  delivered:        "تم التسليم",
  delayed:          "متأخرة",
  returned:         "مرتجع",
  cancelled:        "ملغية",
};

export const STATUS_CLASSES: Record<string, string> = {
  waiting:          "bg-amber-50   dark:bg-amber-900/30   text-amber-700   dark:text-amber-400   border-amber-300   dark:border-amber-800",
  confirmed:        "bg-teal-50    dark:bg-teal-900/30    text-teal-700    dark:text-teal-400    border-teal-300    dark:border-teal-800",
  picked_up:        "bg-cyan-50    dark:bg-cyan-900/30    text-cyan-700    dark:text-cyan-400    border-cyan-300    dark:border-cyan-800",
  in_transit:       "bg-sky-50     dark:bg-sky-900/30     text-sky-700     dark:text-sky-400     border-sky-300     dark:border-sky-800",
  out_for_delivery: "bg-orange-50  dark:bg-orange-900/30  text-orange-700  dark:text-orange-400  border-orange-300  dark:border-orange-800",
  delivered:        "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800",
  delayed:          "bg-purple-50  dark:bg-purple-900/30  text-purple-700  dark:text-purple-400  border-purple-300  dark:border-purple-800",
  returned:         "bg-red-50     dark:bg-red-900/30     text-red-700     dark:text-red-400     border-red-300     dark:border-red-800",
  cancelled:        "bg-gray-50    dark:bg-gray-900/30    text-gray-600    dark:text-gray-400    border-gray-300    dark:border-gray-700",
};
