import { Link } from "wouter";
import { useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
import { Plus, Menu, LogOut, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// ─── شريط تنقّل سفلي احترافي موحّد ────────────────────────────────────────────
// بيستخدمه التلات أنواع الحسابات (admin / custom / representative) بنفس المكوّن
// وبنفس منظومة الحركة، لكن كل حساب بياخد "accent" لوني خاص بيه (identity)
// عشان يفضل واضح فرق حساب عن التاني بصريًا من غير ما يتكرر نفس الكود 3 مرات.
//
// السمة المميزة (signature): "الكبسولة السائلة" (liquid pill) — طبقة خلفية واحدة
// بتتحرك بفيزياء نابضية (spring) من تاب للتاني بدل ما تختفي وتظهر تاب لتاب،
// فالانتقال حسّي ومتصل بصريًا. الأيقونة بترتفع وتكبر شوية لما تتفعّل،
// والزر بيعمل "انضغاطة" (bounce) حقيقية عند اللمس.

export interface NavItem {
  id: string;
  href?: string;   // وضع routes (admin/custom) — مطلوب لو مفيش onSelectTab
  icon: any;
  label: string;
  exact?: boolean;
  badge?: number;
}

interface ProfessionalBottomNavProps {
  location: string;
  items: NavItem[];          // 3-5 عناصر ظاهرة في الشريط الرئيسي
  moreItems?: NavItem[];     // لو موجودة، بيظهر زر "المزيد" آخر عنصر بيفتح شيت
  accent: string;            // "37,99,235" (RGB) — لون الـ identity الخاص بالحساب
  accentSoft?: string;       // لون تكميلي أفتح للتوهج، افتراضيًا نفس accent
  onLogout?: () => void;
  userDisplayName?: string | null;
  userRoleLabel?: string | null;
  // ── وضع tabs داخل صفحة واحدة (SPA) بدل routes حقيقية — لو موجودة، الضغط
  // على أي عنصر بيستدعيها بدل ما يعمل Link فعلي، والـ active بيتحدد بالـ id ──
  activeTabId?: string;
  onSelectTab?: (id: string) => void;
}

function isItemActive(
  item: { id: string; href?: string; exact?: boolean },
  location: string,
  activeTabId?: string,
) {
  if (activeTabId !== undefined) return item.id === activeTabId;
  if (!item.href) return false;
  return item.exact
    ? location === item.href
    : location === item.href || location.startsWith(item.href + "/");
}

// ── عنصر واحد داخل الشريط (بيتشارك في نفس LayoutGroup عشان الـ pill ينزلق) ──
function NavButton({
  item, isActive, accent, onNavigate,
}: {
  item: NavItem; isActive: boolean; accent: string; onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const content = (
    <motion.div
      className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2 min-w-0"
      whileTap={{ scale: 0.86 }}
      transition={{ type: "spring", stiffness: 500, damping: 22 }}
    >
      {isActive && (
        <motion.span
          layoutId="bottomNavActivePill"
          className="absolute inset-x-1 top-0.5 bottom-0.5 rounded-2xl"
          style={{
            background: `linear-gradient(155deg, rgba(${accent},0.20) 0%, rgba(${accent},0.06) 100%)`,
            boxShadow: `0 0 0 1px rgba(${accent},0.22) inset, 0 2px 10px -2px rgba(${accent},0.35)`,
          }}
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
        />
      )}

      <motion.span
        className="relative z-10 flex items-center justify-center"
        animate={{
          y: isActive ? -1 : 0,
          scale: isActive ? 1.12 : 1,
        }}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
      >
        <Icon
          style={{
            width: 20,
            height: 20,
            color: isActive ? `rgb(${accent})` : "hsl(var(--muted-foreground))",
          }}
          strokeWidth={isActive ? 2.3 : 1.75}
        />
        {!!item.badge && (
          <span className="absolute -top-1.5 -right-2 flex items-center justify-center">
            <span
              className="absolute inline-flex h-3.5 w-3.5 rounded-full opacity-75"
              style={{ background: "rgb(239,68,68)", animation: "profNavPing 1.6s cubic-bezier(0,0,0.2,1) infinite" }}
            />
            <span
              className="relative flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-[3px] text-[9px] font-bold text-white"
              style={{ background: "rgb(239,68,68)" }}
            >
              {item.badge > 9 ? "9+" : item.badge}
            </span>
          </span>
        )}
      </motion.span>

      <span
        className="relative z-10 text-[10px] font-semibold truncate max-w-full px-0.5 transition-colors duration-200"
        style={{ color: isActive ? `rgb(${accent})` : "hsl(var(--muted-foreground))" }}
      >
        {item.label}
      </span>
    </motion.div>
  );

  // وضع tabs (SPA): مفيش href → زرار عادي بيستدعي onNavigate بدل Link
  if (!item.href) {
    return (
      <button type="button" onClick={onNavigate} className="flex flex-1 min-w-0">
        {content}
      </button>
    );
  }

  return (
    <Link href={item.href} onClick={onNavigate} className="flex flex-1 min-w-0">
      {content}
    </Link>
  );
}

// ── زر "المزيد" اللي بيفتح الشيت ──────────────────────────────────────────
function MoreButton({ open, onOpenChange, accent }: { open: boolean; onOpenChange: (v: boolean) => void; accent: string }) {
  return (
    <motion.button
      type="button"
      onClick={() => onOpenChange(!open)}
      className="relative flex flex-1 flex-col items-center justify-center gap-1 py-2 min-w-0"
      whileTap={{ scale: 0.86 }}
      transition={{ type: "spring", stiffness: 500, damping: 22 }}
    >
      <AnimatePresence>
        {open && (
          <motion.span
            className="absolute inset-x-1 top-0.5 bottom-0.5 rounded-2xl"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            style={{
              background: `linear-gradient(155deg, rgba(${accent},0.20) 0%, rgba(${accent},0.06) 100%)`,
              boxShadow: `0 0 0 1px rgba(${accent},0.22) inset`,
            }}
          />
        )}
      </AnimatePresence>
      <motion.span
        className="relative z-10 flex items-center justify-center"
        animate={{ rotate: open ? 90 : 0, scale: open ? 1.1 : 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 20 }}
      >
        {open
          ? <X style={{ width: 20, height: 20, color: `rgb(${accent})` }} strokeWidth={2.3} />
          : <Menu style={{ width: 20, height: 20, color: "hsl(var(--muted-foreground))" }} strokeWidth={1.75} />}
      </motion.span>
      <span
        className="relative z-10 text-[10px] font-semibold"
        style={{ color: open ? `rgb(${accent})` : "hsl(var(--muted-foreground))" }}
      >
        المزيد
      </span>
    </motion.button>
  );
}

// ── عنصر واحد داخل شيت "المزيد" ────────────────────────────────────────────
function MoreSheetItem({ item, isActive, accent, onClick, index }: {
  item: NavItem; isActive: boolean; accent: string; onClick: () => void; index: number;
}) {
  const Icon = item.icon;
  const body = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, type: "spring", stiffness: 400, damping: 28 }}
      whileTap={{ scale: 0.94 }}
      className="flex flex-col items-center gap-2 p-3 rounded-2xl"
      style={{
        background: isActive
          ? `linear-gradient(155deg, rgba(${accent},0.16) 0%, rgba(${accent},0.05) 100%)`
          : "hsl(var(--muted)/0.4)",
        border: isActive ? `1px solid rgba(${accent},0.35)` : "1px solid transparent",
      }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center"
        style={{ background: `linear-gradient(155deg, rgba(${accent},0.25) 0%, rgba(${accent},0.1) 100%)` }}
      >
        <Icon style={{ width: 18, height: 18, color: `rgb(${accent})` }} strokeWidth={1.9} />
      </div>
      <span
        className="text-[11px] font-semibold text-center leading-tight"
        style={{ color: isActive ? `rgb(${accent})` : "hsl(var(--foreground)/0.85)" }}
      >
        {item.label}
      </span>
    </motion.div>
  );

  if (!item.href) {
    return <button type="button" onClick={onClick} className="w-full">{body}</button>;
  }

  return (
    <Link href={item.href} onClick={onClick}>
      {body}
    </Link>
  );
}

export function ProfessionalBottomNav({
  location, items, moreItems, accent, onLogout, userDisplayName, userRoleLabel,
  activeTabId, onSelectTab,
}: ProfessionalBottomNavProps) {
  const [moreOpen, setMoreOpen] = useState(false);

  return (
    <>
      <nav
        className="md:hidden print:hidden fixed bottom-0 left-0 right-0 z-50 flex justify-center px-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 10px)" }}
      >
        <LayoutGroup>
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="flex items-stretch gap-0.5 w-full max-w-md rounded-[26px] px-1.5"
            style={{
              background: "hsl(var(--card)/0.85)",
              backdropFilter: "blur(20px) saturate(180%)",
              WebkitBackdropFilter: "blur(20px) saturate(180%)",
              border: "1px solid hsl(var(--border))",
              boxShadow: "0 -8px 32px -8px rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.04) inset",
            }}
          >
            {items.map((item) => (
              <NavButton
                key={item.id}
                item={item}
                isActive={isItemActive(item, location, activeTabId)}
                accent={accent}
                onNavigate={onSelectTab ? () => onSelectTab(item.id) : undefined}
              />
            ))}

            {moreItems && moreItems.length > 0 && (
              <MoreButton open={moreOpen} onOpenChange={setMoreOpen} accent={accent} />
            )}
          </motion.div>
        </LayoutGroup>
      </nav>

      {moreItems && (
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetContent side="bottom" className="rounded-t-3xl border-t px-0 pb-0 max-h-[80vh] flex flex-col">
            <SheetHeader className="px-4 pt-2 pb-3 text-right">
              <SheetTitle className="text-base">كل الأقسام</SheetTitle>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto px-4">
              <div className="grid grid-cols-4 gap-2.5 pb-4">
                {moreItems.map((item, i) => (
                  <MoreSheetItem
                    key={item.id}
                    item={item}
                    isActive={isItemActive(item, location, activeTabId)}
                    accent={accent}
                    index={i}
                    onClick={() => {
                      setMoreOpen(false);
                      onSelectTab?.(item.id);
                    }}
                  />
                ))}
              </div>
            </div>

            {(userDisplayName || onLogout) && (
              <>
                <div className="border-t" />
                <div
                  className="flex items-center justify-between px-4 py-3 shrink-0"
                  style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 12px)" }}
                >
                  <div className="min-w-0">
                    {userDisplayName && <p className="text-sm font-bold truncate">{userDisplayName}</p>}
                    {userRoleLabel && <p className="text-[11px] text-muted-foreground truncate">{userRoleLabel}</p>}
                  </div>
                  {onLogout && (
                    <button
                      type="button"
                      onClick={() => { setMoreOpen(false); onLogout(); }}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-red-500 bg-red-500/10 active:scale-95 transition-transform shrink-0"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      تسجيل الخروج
                    </button>
                  )}
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>
      )}

      <style>{`
        @keyframes profNavPing {
          75%, 100% { transform: scale(1.8); opacity: 0; }
        }
      `}</style>
    </>
  );
}

// ── الزر السداسي البارز (FAB) اختياري — لو محتاج زر "إضافة" وسط الشريط ──────
export function BottomNavFab({ href, label = "جديد", accent }: { href: string; label?: string; accent: string }) {
  return (
    <Link href={href} className="flex flex-1 min-w-0">
      <motion.div
        className="flex flex-col items-center justify-center gap-1 py-2 min-w-0"
        whileTap={{ scale: 0.86 }}
        transition={{ type: "spring", stiffness: 500, damping: 22 }}
      >
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center"
          style={{
            background: `linear-gradient(155deg, rgb(${accent}) 0%, rgba(${accent},0.75) 100%)`,
            boxShadow: `0 2px 10px -2px rgba(${accent},0.5)`,
          }}
        >
          <Plus className="w-5 h-5 text-white" strokeWidth={2.3} />
        </div>
        <span className="text-[10px] font-semibold truncate max-w-full px-0.5" style={{ color: `rgb(${accent})` }}>
          {label}
        </span>
      </motion.div>
    </Link>
  );
}
