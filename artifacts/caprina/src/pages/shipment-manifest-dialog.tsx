import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { shipmentsApi, shipmentManifestsApi, type ShippingCompany } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Truck, Search, MapPin, Phone } from "lucide-react";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

// الحالات اللي تعتبر "متاحة" للإضافة لبيان شحن جديد
const AVAILABLE_STATUSES = ["waiting", "confirmed", "delayed"];

const STATUS_LABELS: Record<string, string> = {
  waiting: "انتظار", confirmed: "مؤكدة", delayed: "متأخرة",
};
const STATUS_COLORS: Record<string, string> = {
  waiting: "border-amber-700 bg-amber-900/20 text-amber-400",
  confirmed: "border-blue-700 bg-blue-900/20 text-blue-400",
  delayed: "border-orange-700 bg-orange-900/20 text-orange-400",
};

export function CreateShipmentManifestDialog({
  company,
  onClose,
  onCreated,
}: {
  company: ShippingCompany;
  onClose: () => void;
  onCreated?: (manifest: { id: number; manifestNumber: string; shipmentCount: number }) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["shipments-available-for-manifest", company.id],
    queryFn: () => shipmentsApi.list({ shippingCompanyId: company.id, limit: 200 }),
  });

  const availableShipments = useMemo(() => {
    return (data?.data ?? []).filter(s => AVAILABLE_STATUSES.includes(s.status));
  }, [data]);

  const filtered = useMemo(() => {
    if (!search.trim()) return availableShipments;
    const q = search.toLowerCase();
    return availableShipments.filter(s =>
      s.receiverName?.toLowerCase().includes(q) ||
      s.shipmentNumber?.toLowerCase().includes(q) ||
      (s.receiverPhone && s.receiverPhone.includes(q)) ||
      (s.trackingNumber && s.trackingNumber.toLowerCase().includes(q)) ||
      (s.receiverCity && s.receiverCity.toLowerCase().includes(q))
    );
  }, [availableShipments, search]);

  const toggleAll = () => {
    if (filtered.length > 0 && filtered.every(s => selectedIds.has(s.id))) {
      const next = new Set(selectedIds);
      filtered.forEach(s => next.delete(s.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filtered.forEach(s => next.add(s.id));
      setSelectedIds(next);
    }
  };

  const toggleOne = (id: number) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const createMutation = useMutation({
    mutationFn: () =>
      shipmentManifestsApi.create({
        shippingCompanyId: company.id,
        shipmentIds: Array.from(selectedIds),
        notes: notes.trim() || undefined,
      }),
    onSuccess: (manifest) => {
      queryClient.invalidateQueries({ queryKey: ["shipment-manifests", company.id] });
      queryClient.invalidateQueries({ queryKey: ["company-shipment-stats", company.id] });
      queryClient.invalidateQueries({ queryKey: ["shipments-available-for-manifest", company.id] });
      queryClient.invalidateQueries({ queryKey: ["company-shipments"] });
      toast({ title: "تم إنشاء البيان", description: `${manifest.manifestNumber} — ${manifest.shipmentCount} شحنة` });
      if (onCreated) onCreated(manifest);
      else onClose();
    },
    onError: (e: any) => toast({ title: "خطأ", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-card border-border max-w-3xl max-h-[90vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" />
            إنشاء بيان شحن — {company.name}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-3 mt-2">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="بحث بالاسم / رقم الشحنة / الهاتف..."
                className="h-9 text-sm bg-background pr-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {!isLoading && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {filtered.length} شحنة
              </span>
            )}
          </div>

          {!isLoading && filtered.length > 0 && (
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={filtered.length > 0 && filtered.every(s => selectedIds.has(s.id))}
                  onCheckedChange={toggleAll}
                />
                <span className="text-xs text-muted-foreground">تحديد الكل ({filtered.length})</span>
              </div>
              <span className="text-xs font-bold text-primary">{selectedIds.size} محددة</span>
            </div>
          )}

          <div className="overflow-y-auto flex-1 border border-border rounded-md">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm animate-pulse">جاري تحميل الشحنات...</div>
            ) : filtered.length === 0 ? (
              <div className="p-10 text-center">
                <Truck className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-20" />
                <p className="text-sm text-muted-foreground">
                  {availableShipments.length === 0
                    ? "لا توجد شحنات متاحة حالياً لهذه الشركة (انتظار / مؤكدة / متأخرة)"
                    : "لا توجد نتائج تطابق البحث"}
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-[auto_1fr_1fr_90px_90px] gap-0 border-b border-border bg-muted/20 px-3 py-2 text-[10px] font-semibold text-muted-foreground sticky top-0">
                  <div className="w-5" />
                  <div>المستلم</div>
                  <div>المدينة / العنوان</div>
                  <div className="text-left">التحصيل</div>
                  <div>الحالة</div>
                </div>
                {filtered.map((s) => {
                  const isSelected = selectedIds.has(s.id);
                  return (
                    <div
                      key={s.id}
                      className={`grid grid-cols-[auto_1fr_1fr_90px_90px] gap-0 items-center px-3 py-2.5 border-b border-border/50 cursor-pointer hover:bg-muted/20 transition-colors ${isSelected ? "bg-primary/5 hover:bg-primary/8" : ""}`}
                      onClick={() => toggleOne(s.id)}
                    >
                      <div className="w-5 flex items-center">
                        <Checkbox checked={isSelected} onCheckedChange={() => {}} />
                      </div>
                      <div className="min-w-0 pr-2">
                        <p className="text-xs font-semibold truncate">{s.receiverName}</p>
                        <p className="text-[10px] text-muted-foreground flex items-center gap-1 flex-wrap">
                          <span className="font-mono text-primary/70">{s.shipmentNumber}</span>
                          {s.receiverPhone && <span className="flex items-center gap-0.5"><Phone className="w-2.5 h-2.5" />{s.receiverPhone}</span>}
                        </p>
                      </div>
                      <div className="min-w-0 pr-2">
                        {s.receiverCity && (
                          <p className="text-xs truncate flex items-center gap-1"><MapPin className="w-2.5 h-2.5 text-muted-foreground" />{s.receiverCity}</p>
                        )}
                        {s.receiverAddress && (
                          <p className="text-[10px] text-muted-foreground truncate">{s.receiverAddress}</p>
                        )}
                      </div>
                      <div className="text-left text-xs font-bold">
                        {Number(s.codAmount) > 0 ? formatCurrency(Number(s.codAmount)) : "—"}
                      </div>
                      <div>
                        <Badge variant="outline" className={`text-[9px] font-bold border ${STATUS_COLORS[s.status] ?? "border-border text-muted-foreground"}`}>
                          {STATUS_LABELS[s.status] ?? s.status}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>

          <div>
            <Label className="text-xs mb-1.5 block">ملاحظات (اختياري)</Label>
            <Textarea
              placeholder="ملاحظات على البيان..."
              className="min-h-[50px] text-sm resize-none bg-background"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button
              className="flex-1 h-9 text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={() => createMutation.mutate()}
              disabled={selectedIds.size === 0 || createMutation.isPending}
            >
              {createMutation.isPending ? "جاري الإنشاء..." : `إنشاء البيان (${selectedIds.size} شحنة)`}
            </Button>
            <Button variant="outline" className="h-9 text-sm border-border" onClick={onClose}>إلغاء</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
