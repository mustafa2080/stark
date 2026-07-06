import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus, Loader2, ArrowDownCircle, ArrowUpCircle, XCircle,
} from "lucide-react";
import {
  type ClientAdjustmentDTO, type AdjustmentType, type AdjustmentDirection,
  ADJUSTMENT_TYPE_LABELS,
} from "@/lib/api";

const fmt = (n: string | number | null | undefined) =>
  new Intl.NumberFormat("ar-EG", { maximumFractionDigits: 0 }).format(Number(n ?? 0));

const fmtDateTime = (d: string) => {
  const date = new Date(d);
  return date.toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" }) +
    " " + date.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" });
};

export interface AdjustmentFormState {
  type: AdjustmentType; direction: AdjustmentDirection; amount: string; reason: string;
}

export const ADJUSTMENT_FORM_DEFAULT: AdjustmentFormState = {
  type: "discount", direction: "credit", amount: "", reason: "",
};

interface AdjustmentsTabProps {
  adjustments: ClientAdjustmentDTO[];
  isLoading: boolean;
  onCreate: (form: AdjustmentFormState) => void;
  isCreating: boolean;
  onVoid: (id: number) => void;
}

// ─── تاب: التسويات والخصومات — قائمة + حوار الإضافة ───────────────────────────
export function AdjustmentsTab({ adjustments, isLoading, onCreate, isCreating, onVoid }: AdjustmentsTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<AdjustmentFormState>(ADJUSTMENT_FORM_DEFAULT);

  const handleCreate = () => {
    onCreate(form);
  };

  const handleOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) setForm(ADJUSTMENT_FORM_DEFAULT);
  };

  return (
    <div className="rounded-2xl p-4" style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}>
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="text-sm font-bold">التسويات والخصومات ({adjustments.length})</p>
        <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> إضافة تسوية
        </Button>
      </div>

      {isLoading ? (
        <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" /> جاري التحميل...</div>
      ) : (
        <div className="space-y-2">
          {adjustments.map(adj => {
            const isVoided = !!adj.voidedAt;
            const isCredit = adj.direction === "credit";
            return (
              <div key={adj.id} className={`flex items-center justify-between gap-3 rounded-xl p-3 ${isVoided ? "opacity-50" : ""}`}
                style={{ background: "hsl(var(--muted)/0.15)" }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: isCredit ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)" }}>
                    {isCredit ? <ArrowDownCircle className="w-4.5 h-4.5 text-emerald-400" /> : <ArrowUpCircle className="w-4.5 h-4.5 text-red-400" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold flex items-center gap-1.5">
                      {ADJUSTMENT_TYPE_LABELS[adj.type]}
                      {isVoided && <Badge variant="outline" className="text-[9px] text-muted-foreground">ملغاة</Badge>}
                    </p>
                    <p className="text-[10px] text-muted-foreground truncate max-w-[280px]">{adj.reason}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{fmtDateTime(adj.adjustedAt)} {adj.createdByName ? `— بواسطة ${adj.createdByName}` : ""}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className={`text-sm font-black ${isCredit ? "text-emerald-400" : "text-red-400"}`}>
                    {isCredit ? "-" : "+"}{fmt(adj.amount)} ج.م
                  </p>
                  {!isVoided && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400"
                      onClick={() => onVoid(adj.id)}>
                      <XCircle className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
          {adjustments.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs">لا توجد تسويات مسجلة</div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>إضافة تسوية / خصم</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">نوع التسوية</label>
              <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v as AdjustmentType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ADJUSTMENT_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">الاتجاه</label>
              <Select value={form.direction} onValueChange={(v) => setForm(f => ({ ...f, direction: v as AdjustmentDirection }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="credit">لصالح العميل (خصم من رصيده)</SelectItem>
                  <SelectItem value="debit">على العميل (إضافة لرصيده)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">المبلغ (ج.م)</label>
              <Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1.5 block">السبب</label>
              <Textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="اكتب سبب التسوية..." rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleOpenChange(false)}>إلغاء</Button>
            <Button onClick={handleCreate} disabled={isCreating || !form.amount || !form.reason}>
              {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : "حفظ التسوية"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
