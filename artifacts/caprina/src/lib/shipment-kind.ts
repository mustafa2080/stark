/**
 * Shared presentation helpers for the three shipment workflows.
 * Keep these values aligned with the API's `shipmentKind` enum.
 */
export const SHIPMENT_KINDS = ["new", "replacement", "pickup"] as const;

export type ShipmentKind = (typeof SHIPMENT_KINDS)[number];

export const SHIPMENT_KIND_LABELS: Record<ShipmentKind, string> = {
  new: "شحنة جديدة",
  replacement: "طلب استبدال",
  pickup: "إحضار طرد",
};

export const SHIPMENT_KIND_HINTS: Record<ShipmentKind, string> = {
  new: "إرسال شحنة جديدة للعميل",
  replacement: "استبدال شحنة سابقة لدى العميل",
  pickup: "إحضار طرد من العميل",
};

export const SHIPMENT_KIND_COLORS: Record<ShipmentKind, string> = {
  new: "border-emerald-500 text-emerald-600",
  replacement: "border-violet-500 text-violet-600",
  pickup: "border-cyan-500 text-cyan-600",
};

/** Normalizes unknown or legacy values to the default shipment workflow. */
export function getShipmentKind(value: string | null | undefined): ShipmentKind {
  return SHIPMENT_KINDS.includes(value as ShipmentKind) ? (value as ShipmentKind) : "new";
}

/** Statuses that represent a successfully completed shipment workflow. */
export function isCompletedStatus(status: string | null | undefined): boolean {
  return status === "delivered" || status === "received" || status === "replaced" || status === "parcel_picked";
}
