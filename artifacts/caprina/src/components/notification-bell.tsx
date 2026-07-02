import { useState, useRef, useEffect } from "react";
import { Bell, CheckCheck, Package, AlertTriangle, Undo2, PackageCheck, Receipt, Boxes, Info } from "lucide-react";
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
  shipment_created: Package,
  shipment_delayed: AlertTriangle,
  shipment_returned: Undo2,
  shipment_delivered: PackageCheck,
  invoice: Receipt,
  inventory: Boxes,
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
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const handleItemClick = (n: AppNotification) => {
    if (!n.isRead) markRead(n.id);
    if (n.link) navigate(n.link);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 active:scale-90 hover:bg-foreground/10"
        aria-label="الإشعارات"
      >
        <Bell className="w-4 h-4 text-foreground/70" />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -left-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center leading-none"
            style={{ boxShadow: "0 0 6px rgba(239,68,68,0.8)" }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          dir="rtl"
          className="absolute left-0 top-full mt-2 w-80 max-w-[90vw] rounded-xl border shadow-2xl z-[999] overflow-hidden"
          style={{ background: "hsl(var(--card))", borderColor: "hsl(var(--border))" }}
        >
          <div className="flex items-center justify-between px-3 py-2.5 border-b" style={{ borderColor: "hsl(var(--border))" }}>
            <p className="text-xs font-black text-foreground">الإشعارات</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead()}
                className="flex items-center gap-1 text-[10px] text-primary hover:underline font-bold"
              >
                <CheckCheck className="w-3 h-3" /> تعليم الكل كمقروء
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
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
        </div>
      )}
    </div>
  );
}
