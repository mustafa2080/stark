import { Link } from "wouter";
import { useState } from "react";
import { Plus, Menu, LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export interface BottomNavItem {
  href: string;
  icon: any;
  label: string;
  rgb: string;
  exact?: boolean;
  badge?: number;
}

interface MobileBottomNavProps {
  location: string;
  items: BottomNavItem[];           // العناصر الثابتة الأربعة الظاهرة في الشريط
  moreItems: BottomNavItem[];       // باقي العناصر المتاحة — تظهر في شيت "المزيد"
  fabHref: string;                  // رابط الزر الرئيسي البارز
  fabLabel?: string;
  onLogout: () => void;
  userDisplayName?: string | null;
  userRoleLabel?: string | null;
}

function isItemActive(item: { href: string; exact?: boolean }, location: string) {
  return item.exact
    ? location === item.href
    : location === item.href || location.startsWith(item.href + "/");
}

// ── أيقونة عنصر واحد في الشريط الرئيسي ─────────────────────────────────────
function BottomNavIcon({ item, location }: { item: BottomNavItem; location: string }) {
  const isActive = isItemActive(item, location);
  const Icon = item.icon;
  return (
    <Link href={item.href} className="flex-1 min-w-0">
      <div className="flex flex-col items-center justify-center gap-1 py-1.5 relative">
        <div
          className="relative flex items-center justify-center rounded-2xl transition-all duration-200 active:scale-90"
          style={{
            width: "40px",
            height: "40px",
            background: isActive
              ? `linear-gradient(155deg, rgba(${item.rgb},0.22) 0%, rgba(${item.rgb},0.08) 100%)`
              : "transparent",
          }}
        >
          <Icon
            style={{
              width: "20px",
              height: "20px",
              color: isActive ? `rgb(${item.rgb})` : "hsl(var(--muted-foreground))",
            }}
            strokeWidth={isActive ? 2.25 : 1.75}
          />
          {!!item.badge && (
            <Badge
              className="absolute -top-1 -right-1 h-4 min-w-4 px-1 flex items-center justify-center text-[9px] font-bold"
              variant="destructive"
            >
              {item.badge > 99 ? "99+" : item.badge}
            </Badge>
          )}
        </div>
        <span
          className="text-[10px] font-semibold truncate max-w-full px-0.5 transition-colors duration-200"
          style={{ color: isActive ? `rgb(${item.rgb})` : "hsl(var(--muted-foreground))" }}
        >
          {item.label}
        </span>
        {isActive && (
          <span
            className="absolute -bottom-0.5 w-1 h-1 rounded-full"
            style={{ background: `rgb(${item.rgb})`, boxShadow: `0 0 6px rgb(${item.rgb})` }}
          />
        )}
      </div>
    </Link>
  );
}

// ── الزر السداسي البارز (FAB) ────────────────────────────────────────────
function BottomNavFab({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex-1 min-w-0">
      <div className="flex flex-col items-center justify-center gap-1 py-1.5">
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-200 active:scale-90"
          style={{
            background: "linear-gradient(155deg, hsl(var(--primary)) 0%, hsl(var(--primary)/.75) 100%)",
            boxShadow: "0 2px 8px hsl(var(--primary)/0.4)",
          }}
        >
          <Plus className="w-5 h-5 text-primary-foreground" strokeWidth={2.25} />
        </div>
        <span className="text-[10px] font-semibold text-primary truncate max-w-full px-0.5">{label}</span>
      </div>
    </Link>
  );
}

// ── زر "المزيد" اللي بيفتح الـ Sheet ─────────────────────────────────────
function BottomNavMoreButton({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onOpenChange(true)} className="flex-1 min-w-0">
      <div className="flex flex-col items-center justify-center gap-1 py-1.5">
        <div
          className="flex items-center justify-center rounded-2xl transition-all duration-200 active:scale-90"
          style={{
            width: "40px",
            height: "40px",
            background: open ? "hsl(var(--primary)/0.12)" : "transparent",
          }}
        >
          <Menu
            style={{ width: "20px", height: "20px", color: open ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
            strokeWidth={open ? 2.25 : 1.75}
          />
        </div>
        <span
          className="text-[10px] font-semibold"
          style={{ color: open ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))" }}
        >
          المزيد
        </span>
      </div>
    </button>
  );
}

// ── عنصر واحد جوه شيت "المزيد" ────────────────────────────────────────────
function MoreSheetItem({ item, location, onClick }: { item: BottomNavItem; location: string; onClick: () => void }) {
  const isActive = isItemActive(item, location);
  const Icon = item.icon;
  return (
    <Link href={item.href} onClick={onClick}>
      <div
        className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all duration-200 active:scale-95"
        style={{
          background: isActive
            ? `linear-gradient(155deg, rgba(${item.rgb},0.16) 0%, rgba(${item.rgb},0.05) 100%)`
            : "hsl(var(--muted)/0.4)",
          border: isActive ? `1px solid rgba(${item.rgb},0.35)` : "1px solid transparent",
        }}
      >
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{
            background: `linear-gradient(155deg, rgba(${item.rgb},0.25) 0%, rgba(${item.rgb},0.1) 100%)`,
          }}
        >
          <Icon style={{ width: "18px", height: "18px", color: `rgb(${item.rgb})` }} strokeWidth={1.9} />
        </div>
        <span className="text-[11px] font-semibold text-center leading-tight" style={{ color: isActive ? `rgb(${item.rgb})` : "hsl(var(--foreground)/0.85)" }}>
          {item.label}
        </span>
      </div>
    </Link>
  );
}

export function MobileBottomNav({
  location,
  items,
  moreItems,
  fabHref,
  fabLabel = "شحنة جديدة",
  onLogout,
  userDisplayName,
  userRoleLabel,
}: MobileBottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  // الشريط: عنصرين شمال، الزر السداسي في النص، عنصرين + المزيد يمين
  const left = items.slice(0, 2);
  const right = items.slice(2, 4);

  return (
    <>
      <nav
        className="md:hidden print:hidden fixed bottom-0 left-0 right-0 z-50"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div
          className="flex items-stretch justify-around px-1"
          style={{
            height: "64px",
            background: "hsl(var(--card))",
            borderTop: "1px solid hsl(var(--border))",
            boxShadow: "0 -8px 24px -8px rgba(0,0,0,0.25)",
          }}
        >
          {left.map((item) => (
            <BottomNavIcon key={item.href} item={item} location={location} />
          ))}

          <BottomNavFab href={fabHref} label={fabLabel} />

          {right.map((item) => (
            <BottomNavIcon key={item.href} item={item} location={location} />
          ))}

          <BottomNavMoreButton open={moreOpen} onOpenChange={setMoreOpen} />
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl border-t px-0 pb-0 max-h-[80vh] flex flex-col">
          <SheetHeader className="px-4 pt-2 pb-3 text-right">
            <SheetTitle className="text-base">كل الأقسام</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4">
            <div className="grid grid-cols-4 gap-2.5 pb-4">
              {moreItems.map((item) => (
                <MoreSheetItem key={item.href} item={item} location={location} onClick={() => setMoreOpen(false)} />
              ))}
            </div>
          </div>

          <Separator />

          <div
            className="flex items-center justify-between px-4 py-3 shrink-0"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
          >
            <div className="min-w-0">
              {userDisplayName && (
                <p className="text-sm font-bold truncate">{userDisplayName}</p>
              )}
              {userRoleLabel && (
                <p className="text-[11px] text-muted-foreground truncate">{userRoleLabel}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setMoreOpen(false); onLogout(); }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-red-500 bg-red-500/10 active:scale-95 transition-transform shrink-0"
            >
              <LogOut className="w-3.5 h-3.5" />
              تسجيل الخروج
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
