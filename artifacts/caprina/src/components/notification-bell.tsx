import { useState, useRef, useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { Bell, CheckCheck, Package, AlertTriangle, Undo2, PackageCheck, Receipt, Boxes, Info, Lock } from "lucide-react";
import { useNotifications, type AppNotification } from "@/hooks/useNotifications";
import { useLocation } from "wouter";
import { cn } from "@/lib/utils";

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} ي`;
}

const TYPE_ICON: Record<string, any> = {
  shipment_new: Package,
  shipment_created: Package,
  shipment_delayed: AlertTriangle,
  shipment_returned: Undo2,
  shipment_delivered: PackageCheck,
  shipment_received: PackageCheck,
  shipment_updated: Package,
  invoice: Receipt,
  inventory: Boxes,
  manifest_closed: Lock,
};

const SEVERITY_STYLE: Record<string, { color: string; bg: string }> = {
  critical: { color: "text-red-500", bg: "bg-red-500/10" },
  warning:  { color: "text-amber-500", bg: "bg-amber-500/10" },
  success:  { color: "text-emerald-500", bg: "bg-emerald-500/10" },
  info:     { color: "text-sky-500", bg: "bg-sky-500/10" },
};

function NotificationItem({ n, onClick }: { n: AppNotification; onClick: () => void }) {
  const Icon = TYPE_ICON[n.type] || Info;
  const style = SEVERITY_STYLE[n.severity] || SEVERITY_STYLE.info;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-start gap-2.5 px-3 py-2.5 text-right transition-colors hover:bg-foreground/5",
        !n.isRead && "bg-primary/5"
      )}
    >
      <div className={cn("shrink-0 w-8 h-8 rounded-full flex items-center justify-center", style.bg)}>
        <Icon className={cn("w-4 h-4", style.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
          <p className="text-xs font-bold text-foreground truncate">{n.title}</p>
        </div>
        {n.message && (
          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
        )}
        <p className="text-[10px] text-muted-foreground/60 mt-1">{timeAgo(n.createdAt)}</p>
      </div>
    </button>
  );
}

export function NotificationBell({ className }: { className?: string }) {
  const { notifications, unreadCount, isLoading, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const portalId = `notification-bell-portal-${useId()}`;
  const [coords, setCoords] = useState<{ top: number; right: number; maxHeight: number } | null>(null);
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!open) return;
    const HEADER_HEIGHT = 44; // ارتفاع هيدر "الإشعارات" الثابت
    const GAP = 10;
    const MARGIN = 12; // هامش أمان من حواف الشاشة
    const MIN_LIST_HEIGHT = 160;
    const MAX_TOTAL_HEIGHT = 440; // سقف أقصى ثابت لطول القائمة كلها (هيدر + عناصر) — يمنعها من التمدد لطول الشاشة
    const updateCoords = () => {
      const rect = btnRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return; // زرار مخفي فعليًا (نسخة تانية جوه sidebar مطوي) → تجاهل
      const spaceBelow = window.innerHeight - rect.bottom - MARGIN;
      const spaceAbove = rect.top - MARGIN;
      const right = Math.max(MARGIN, window.innerWidth - rect.right);

      let top: number;
      let maxHeight: number;
      if (spaceBelow >= HEADER_HEIGHT + MIN_LIST_HEIGHT || spaceBelow >= spaceAbove) {
        // افتح لتحت الزرار
        top = rect.bottom + GAP;
        maxHeight = Math.min(MAX_TOTAL_HEIGHT, Math.max(HEADER_HEIGHT + MIN_LIST_HEIGHT, spaceBelow - GAP));
      } else {
        // مفيش مساحة كافية تحت → افتح لفوق (بس دايمًا جوه حدود الشاشة، أبدًا يطلع بره top:0)
        maxHeight = Math.min(MAX_TOTAL_HEIGHT, Math.max(HEADER_HEIGHT + MIN_LIST_HEIGHT, spaceAbove - GAP));
        top = Math.max(MARGIN, rect.top - GAP - maxHeight);
      }
      // ضمان نهائي: القائمة أبدًا متطلعش بره أعلى أو أسفل الشاشة
      top = Math.min(Math.max(MARGIN, top), window.innerHeight - MARGIN - HEADER_HEIGHT - MIN_LIST_HEIGHT);
      maxHeight = Math.min(maxHeight, window.innerHeight - top - MARGIN);
      setCoords({ top, right, maxHeight });
    };
    updateCoords();
    window.addEventListener("resize", updateCoords);
    window.addEventListener("scroll", updateCoords, true);
    return () => {
      window.removeEventListener("resize", updateCoords);
      window.removeEventListener("scroll", updateCoords, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current && wrapRef.current.contains(target)) return;
      const dropdownEl = document.getElementById(portalId);
      if (dropdownEl && dropdownEl.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open, portalId]);

  const handleItemClick = (n: AppNotification) => {
    if (!n.isRead) markRead(n.id);
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 active:scale-90 hover:bg-foreground/10"
        aria-label="الإشعارات"
      >
        <Bell className="w-4 h-4 text-foreground/70" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -left-1.5 flex">
            <span className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-60" />
            <span
              className="relative min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center leading-none ring-2"
              style={{ boxShadow: "0 0 8px rgba(239,68,68,0.8)", ringColor: "hsl(var(--card))" } as any}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          </span>
        )}
      </button>

      {open && coords && createPortal(
        <div
          id={portalId}
          dir="rtl"
          className="fixed w-80 max-w-[90vw] rounded-2xl border shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
          style={{
            top: coords.top,
            right: coords.right,
            maxHeight: coords.maxHeight,
            zIndex: 9999,
            background: "hsl(var(--card))",
            borderColor: "hsl(var(--border))",
          }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b shrink-0"
            style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted) / 0.4)" }}
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-black text-foreground">الإشعارات</p>
              {unreadCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center leading-none">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead()}
                className="flex items-center gap-1 text-[11px] text-primary hover:underline font-bold shrink-0"
              >
                <CheckCheck className="w-3.5 h-3.5" /> تعليم الكل كمقروء
              </button>
            )}
          </div>

          <div className="overflow-y-auto min-h-0">
            {isLoading ? (
              <p className="text-center text-xs text-muted-foreground py-8">جارِ التحميل...</p>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
                <Bell className="w-8 h-8 opacity-30" />
                <p className="text-xs">لا توجد إشعارات بعد</p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem key={n.id} n={n} onClick={() => handleItemClick(n)} />
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
