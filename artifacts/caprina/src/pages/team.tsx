import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users, Plus, Edit2, Trash2, Target, FileText, ChevronRight, Check, X,
  TrendingUp, TrendingDown, Printer, Star, AlertCircle, Trophy, Briefcase, Package,
  DollarSign, Calendar, BarChart2, Settings, ArrowLeft, Save, RefreshCw, UserPlus,
  Clock, UserCheck, UserX, Gift, MinusCircle, CheckCircle2, XCircle, AlertTriangle,
  Crown, Medal, Award, Download, Search,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ReferenceLine, PieChart, Pie,
  LineChart, Line, Legend,
} from "recharts";
import { employeeApi, usersApi, type EmployeeProfile, type EmployeeKpi, type EmployeeReport, type AppUser, type DailyKpiEntry, type DailyLogDay, appSettingsApi, attendanceApi, type AttendanceRecord, type AttendanceStatus, type PayrollAdjustment, type MonthlySalaryReport } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

const fmt = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);
const fmtNum = (n: number) => new Intl.NumberFormat("ar-EG").format(n);

function dbInitials(name: string) {
  const p = (name || "?").trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[1][0]).toUpperCase() : (name || "?").slice(0, 2).toUpperCase();
}

async function waitForImages(root: HTMLElement) {
  const images = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    images.map(image =>
      image.complete
        ? Promise.resolve()
        : new Promise<void>(resolve => {
            image.onload = () => resolve();
            image.onerror = () => resolve();
          })
    )
  );
}

const METRIC_OPTIONS = [
  { value: "delivery_rate", label: "نسبة التسليم", unit: "%", direction: "higher_is_better", defaultTarget: 80 },
  { value: "return_rate", label: "نسبة المرتجعات", unit: "%", direction: "lower_is_better", defaultTarget: 20 },
  { value: "total_orders", label: "عدد الطلبيات", unit: "طلب", direction: "higher_is_better", defaultTarget: 50 },
  { value: "profit", label: "الربح المحقق", unit: "ج.م", direction: "higher_is_better", defaultTarget: 5000 },
  { value: "revenue", label: "الإيرادات", unit: "ج.م", direction: "higher_is_better", defaultTarget: 10000 },
  { value: "manual", label: "مؤشر مخصص (يدوي)", unit: "", direction: "higher_is_better", defaultTarget: 100 },
];

const RATING_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  ممتاز:      { color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/30", label: "ممتاز ⭐" },
  "جيد جداً": { color: "text-blue-700    dark:text-blue-400",    bg: "bg-blue-50    dark:bg-blue-900/30",    label: "جيد جداً 👍" },
  جيد:        { color: "text-primary",                            bg: "bg-primary/10",                        label: "جيد 👌" },
  مقبول:      { color: "text-amber-700   dark:text-amber-400",   bg: "bg-amber-50   dark:bg-amber-900/20",   label: "مقبول ⚠️" },
  ضعيف:       { color: "text-red-700     dark:text-red-400",     bg: "bg-red-50     dark:bg-red-900/20",     label: "ضعيف ❌" },
  "غير محدد": { color: "text-muted-foreground",                   bg: "bg-muted/20",                          label: "غير محدد" },
  "لا توجد بيانات": { color: "text-muted-foreground",             bg: "bg-muted/20",                          label: "لا توجد بيانات" },
};

// ─── Profile Form Dialog ──────────────────────────────────────────────────────
function ProfileFormDialog({
  open, onClose, profileId, displayName, isSystemUser, existing, isAdmin,
}: {
  open: boolean; onClose: () => void; profileId: number; displayName: string; isSystemUser: boolean; existing: EmployeeProfile | null; isAdmin?: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [memberName, setMemberName] = useState(existing?.displayName ?? displayName);
  const [jobTitle, setJobTitle] = useState(existing?.jobTitle ?? "");
  const [department, setDepartment] = useState(existing?.department ?? "");
  const [monthlySalary, setMonthlySalary] = useState(existing?.monthlySalary?.toString() ?? "0");
  const [hireDate, setHireDate] = useState(existing?.hireDate ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [avatar, setAvatar] = useState<string | null | undefined>(existing?.avatar ?? null);
  const [saving, setSaving] = useState(false);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "الصورة كبيرة جداً", description: "الحد الأقصى 5MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 300;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
        else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        const compressed = canvas.toDataURL("image/jpeg", 0.8);
        setAvatar(compressed);
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await employeeApi.updateProfile(profileId, {
        displayName: memberName || undefined,
        jobTitle: jobTitle || null,
        department: department || null,
        monthlySalary: parseFloat(monthlySalary) || 0,
        hireDate: hireDate || null,
        notes: notes || null,
        avatar: avatar ?? null,
      });
      qc.invalidateQueries({ queryKey: ["employee-profiles"] });
      toast({ title: "تم حفظ بيانات العضو" });
      onClose();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader><DialogTitle>بيانات العضو: {displayName}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2">
          {/* ── صورة الموظف — للأدمن فقط ── */}
          {isAdmin && (
          <div className="flex items-center gap-3">
            <div className="relative shrink-0">
              {avatar ? (
                <img src={avatar} alt="صورة الموظف" className="w-16 h-16 rounded-full object-cover border-2 border-border" />
              ) : (
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-2xl font-bold text-muted-foreground border-2 border-border border-dashed">
                  {dbInitials(memberName || displayName || "؟")}
                </div>
              )}
              {avatar && (
                <button
                  onClick={() => { setAvatar(null); }}
                  className="absolute -top-1 -left-1 w-4 h-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center hover:bg-red-600"
                >✕</button>
              )}
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs font-bold">صورة الموظف</Label>
              <label className="flex items-center gap-1.5 cursor-pointer bg-muted/40 hover:bg-muted/70 transition-colors rounded-md px-3 py-1.5 text-xs text-muted-foreground border border-border w-fit">
                <span>📷</span>
                <span>{avatar ? "تغيير الصورة" : "رفع صورة"}</span>
                <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
              </label>
              <p className="text-[9px] text-muted-foreground">JPG / PNG / WebP — حد أقصى 2MB</p>
            </div>
          </div>
          )}

          {!isSystemUser && (
            <div className="space-y-1">
              <Label className="text-xs font-bold">الاسم الكامل</Label>
              <Input value={memberName} onChange={e => setMemberName(e.target.value)} placeholder="أحمد محمد" className="h-8 text-xs" />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">المسمى الوظيفي</Label>
              <Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="مندوب مبيعات" className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">القسم</Label>
              <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="المبيعات" className="h-8 text-xs" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">الراتب الشهري (ج.م)</Label>
              <Input type="number" min="0" value={monthlySalary} onChange={e => setMonthlySalary(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">تاريخ التعيين</Label>
              <Input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ملاحظات</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="..." className="min-h-[50px] text-xs resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="text-xs h-7">إلغاء</Button>
          <Button onClick={handleSave} disabled={saving} className="text-xs h-7">{saving ? "جاري الحفظ..." : "حفظ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI Form Dialog ──────────────────────────────────────────────────────────
function KpiFormDialog({
  open, onClose, profileId, isSystemUser, existing, monthlySalary = 0,
}: {
  open: boolean; onClose: () => void; profileId: number; isSystemUser: boolean; existing?: EmployeeKpi; monthlySalary?: number;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(existing?.name ?? "");
  const [metric, setMetric] = useState(existing?.metric ?? "delivery_rate");
  const [targetValue, setTargetValue] = useState(existing?.targetValue?.toString() ?? "80");
  const [unit, setUnit] = useState(existing?.unit ?? "%");
  const [direction, setDirection] = useState<"higher_is_better" | "lower_is_better">(
    existing?.direction ?? "higher_is_better"
  );
  const [weight, setWeight] = useState(existing?.weight?.toString() ?? "100");
  const [salaryWeight, setSalaryWeight] = useState<string>(existing?.salaryWeight?.toString() ?? "0");
  const [overtargetBonus, setOvertargetBonus] = useState<string>(existing?.overtargetBonus?.toString() ?? "0");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [saving, setSaving] = useState(false);

  const salaryWeightNum = parseFloat(salaryWeight) || 0;
  const overtargetBonusNum = parseFloat(overtargetBonus) || 0;
  const kpiSalaryValue = monthlySalary > 0 ? Math.round((salaryWeightNum / 100) * monthlySalary) : null;
  const overtargetValue = monthlySalary > 0 ? Math.round((overtargetBonusNum / 100) * monthlySalary) : null;

  const handleMetricChange = (m: string) => {
    setMetric(m);
    const preset = METRIC_OPTIONS.find(o => o.value === m);
    if (preset && !existing) {
      setName(preset.label);
      setUnit(preset.unit);
      setDirection(preset.direction as any);
      setTargetValue(preset.defaultTarget.toString());
    }
  };

  const handleSave = async () => {
    if (!name.trim()) { toast({ title: "اسم المؤشر مطلوب", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const payload = {
        name, metric, targetValue: parseFloat(targetValue), unit,
        direction, weight: parseFloat(weight), isActive, description: description || null,
        salaryWeight: salaryWeightNum,
        overtargetBonus: overtargetBonusNum,
      };
      if (existing) {
        await employeeApi.updateKpi(existing.id, payload as any);
        toast({ title: "تم تحديث المؤشر" });
      } else {
        await employeeApi.createKpi({ profileId, ...payload } as any);
        toast({ title: "تم إضافة المؤشر" });
      }
      qc.invalidateQueries({ queryKey: ["employee-kpis", profileId] });
      qc.invalidateQueries({ queryKey: ["employee-report", profileId] });
      onClose();
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg" dir="rtl">
        <DialogHeader><DialogTitle className="flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          {existing ? "تعديل المؤشر" : "إضافة مؤشر أداء KPI"}
        </DialogTitle></DialogHeader>
        <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pr-1">

          {/* نوع المؤشر */}
          <div className="space-y-1">
            <Label className="text-xs font-bold">نوع المؤشر</Label>
            <Select value={metric} onValueChange={handleMetricChange}>
              <SelectTrigger className="h-8 text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(isSystemUser ? METRIC_OPTIONS : METRIC_OPTIONS.filter(o => o.value === "manual")).map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isSystemUser && (
              <p className="text-[10px] text-muted-foreground">أعضاء الفريق بدون حساب نظام يدعمون المؤشرات اليدوية فقط</p>
            )}
          </div>

          {/* اسم + هدف + وحدة */}
          <div className="space-y-1">
            <Label className="text-xs font-bold">اسم المؤشر *</Label>
            <div className="relative group">
              <Input
                value={name}
                onChange={e => setName(e.target.value)}
                onClick={() => { if (metric === "manual") setName(""); }}
                className="h-8 text-xs pr-7 cursor-text"
                placeholder="اكتب اسم المؤشر هنا..."
              />
              {metric === "manual" && name && (
                <button
                  type="button"
                  onClick={() => setName("")}
                  className="absolute left-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">الهدف *</Label>
              <Input type="number" value={targetValue} onChange={e => setTargetValue(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الوحدة</Label>
              {metric === "manual" ? (
                <Select value={unit} onValueChange={setUnit}>
                  <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="اختر الوحدة" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="%">نسبة مئوية (%)</SelectItem>
                    <SelectItem value="عدد">عدد</SelectItem>
                    <SelectItem value="ج.م">جنيه (ج.م)</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input value={unit} onChange={e => setUnit(e.target.value)} placeholder="%" className="h-8 text-xs" />
              )}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">الوزن (%)</Label>
              <Input type="number" min="0" max="100" value={weight} onChange={e => setWeight(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          {/* الاتجاه */}
          <div className="space-y-1">
            <Label className="text-xs font-bold">الاتجاه</Label>
            <Select value={direction} onValueChange={v => setDirection(v as any)}>
              <SelectTrigger className="h-8 text-xs bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="higher_is_better">↑ كلما زاد كلما كان أفضل</SelectItem>
                <SelectItem value="lower_is_better">↓ كلما قلّ كلما كان أفضل</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* ── قسم ربط KPI بالراتب ── */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
            <p className="text-xs font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5" />
              ربط المؤشر بالراتب
            </p>
            <div className="grid grid-cols-2 gap-3">
              {/* نسبة الخصم */}
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-muted-foreground">نسبة المؤشر من الراتب (%)</Label>
                <div className="relative">
                  <Input
                    type="number" min="0" max="100" step="0.5"
                    value={salaryWeight}
                    onChange={e => setSalaryWeight(e.target.value)}
                    className="h-8 text-xs pl-8"
                    placeholder="10"
                  />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-bold">%</span>
                </div>
                {kpiSalaryValue !== null && salaryWeightNum > 0 && (
                  <p className="text-[9px] text-amber-600 dark:text-amber-400 font-medium">= {fmt(kpiSalaryValue)} من الراتب</p>
                )}
                <p className="text-[9px] text-muted-foreground/70">لو لم يتحقق → يُخصم هذا المبلغ تلقائياً</p>
              </div>
              {/* مكافأة Over Target */}
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-muted-foreground">مكافأة Over Target (%)</Label>
                <div className="relative">
                  <Input
                    type="number" min="0" max="100" step="0.5"
                    value={overtargetBonus}
                    onChange={e => setOvertargetBonus(e.target.value)}
                    className="h-8 text-xs pl-8"
                    placeholder="5"
                  />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground font-bold">%</span>
                </div>
                {overtargetValue !== null && overtargetBonusNum > 0 && (
                  <p className="text-[9px] text-emerald-600 dark:text-emerald-400 font-medium">= +{fmt(overtargetValue)} مكافأة</p>
                )}
                <p className="text-[9px] text-muted-foreground/70">لو تجاوز الهدف → مكافأة إضافية</p>
              </div>
            </div>
            {/* معاينة حية */}
            {(salaryWeightNum > 0 || overtargetBonusNum > 0) && monthlySalary > 0 && (
              <div className="rounded-lg bg-background/60 border border-border/50 p-2.5 space-y-1.5">
                <p className="text-[10px] font-bold text-muted-foreground">📊 معاينة التأثير على الراتب:</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-muted/40 p-2">
                    <p className="text-[9px] text-muted-foreground">الراتب الأساسي</p>
                    <p className="text-xs font-black text-foreground">{fmt(monthlySalary)}</p>
                  </div>
                  <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2">
                    <p className="text-[9px] text-red-500">حالة القصور</p>
                    <p className="text-xs font-black text-red-500">{fmt(monthlySalary - (kpiSalaryValue ?? 0))}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2">
                    <p className="text-[9px] text-emerald-500">Over Target</p>
                    <p className="text-xs font-black text-emerald-500">{fmt(monthlySalary + (overtargetValue ?? 0))}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* وصف + تفعيل */}
          <div className="space-y-1">
            <Label className="text-xs">وصف (اختياري)</Label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="..." className="h-8 text-xs" />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs">مؤشر نشط</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="text-xs h-7">إلغاء</Button>
          <Button onClick={handleSave} disabled={saving} className="text-xs h-7 gap-1">
            {saving ? <><RefreshCw className="w-3 h-3 animate-spin" />جاري الحفظ...</> : <><Save className="w-3 h-3" />حفظ المؤشر</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Monthly Report ───────────────────────────────────────────────────────────
function MonthlyReport({ report }: { report: EmployeeReport }) {
  const printRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [specialBonus, setSpecialBonus] = useState<string>("");
  const [specialBonusNote, setSpecialBonusNote] = useState<string>("");
  const [specialBonusType, setSpecialBonusType] = useState<"bonus" | "deduction">("bonus");
  const [editingSpecialBonus, setEditingSpecialBonus] = useState(false);
  const specialBonusNum = parseFloat(specialBonus) || 0;
  const specialBonusValue = specialBonusType === "bonus" ? specialBonusNum : -specialBonusNum;
  const { toast } = useToast();
  const ratingCfg = RATING_CONFIG[report.rating] ?? RATING_CONFIG["غير محدد"];

  const { data: salaryReport } = useQuery({
    queryKey: ["salary-report", report.profile?.id, report.period.month],
    queryFn: () => {
      const profileId = report.profile?.id;
      if (!profileId) return null;
      return attendanceApi.salaryReport(profileId, report.period.month);
    },
    enabled: !!report.profile?.id,
  });

  // ── حساب تأثير KPI على الراتب ─────────────────────────────────────────────
  const baseSalary = salaryReport?.baseSalary ?? report.salary ?? 0;
  const kpiFinancials = report.kpiFinancials ?? {
    totalSalaryWeight: report.kpis.reduce((sum, k) => sum + (k.salaryWeight ?? 0), 0),
    salaryAtRiskPercent: report.kpis.reduce((sum, k) => sum + (k.salaryWeight ?? 0), 0),
    totalDeduction: report.kpis
      .filter(k => k.achieved === false && (k.salaryWeight ?? 0) > 0)
      .reduce((sum, k) => sum + Math.round(((k.salaryWeight ?? 0) / 100) * baseSalary), 0),
    totalBonus: report.kpis
      .filter(k => k.score !== null && k.score > 100 && (k.overtargetBonus ?? 0) > 0)
      .reduce((sum, k) => sum + Math.round(((k.overtargetBonus ?? 0) / 100) * baseSalary), 0),
    achievedCount: report.kpis.filter(k => k.achieved === true).length,
    failedCount: report.kpis.filter(k => k.achieved === false).length,
    overTargetCount: report.kpis.filter(k => k.score !== null && k.score > 100).length,
  };
  const kpiDeductions = kpiFinancials.totalDeduction;
  const kpiBonuses = kpiFinancials.totalBonus;
  const kpiAchievedCount = kpiFinancials.achievedCount;
  const kpiFailedCount = kpiFinancials.failedCount;
  const kpiOverTargetCount = kpiFinancials.overTargetCount;

  const handlePrint = () => {
    const content = exportRef.current;
    if (!content) return;
    const printWindow = window.open("", "_blank", "width=900,height=700");
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html><html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8" />
        <title>تقرير الأداء - ${report.displayName}</title>
        <style>
          * { box-sizing: border-box; }
          html, body { margin: 0; padding: 0; direction: rtl; font-family: 'Segoe UI', Tahoma, Arial, sans-serif; background: #fff; color: #0f172a; }
          body { padding: 0; }
          @page { size: A4; margin: 0; }
          .print-wrap { padding: 14mm 12mm; }
          .print-wrap img { max-width: 100%; }
          .print-wrap .shadow-sm,
          .print-wrap .shadow-md,
          .print-wrap .shadow-lg,
          .print-wrap [style*="box-shadow"] { box-shadow: none !important; }
          .print-wrap .report {
            max-width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #0f172a !important;
          }
          .print-wrap .report * { color: inherit; }
          .print-wrap .avoid-break { break-inside: avoid; page-break-inside: avoid; }
          .print-wrap .print-compact table { width: 100%; }
          .print-wrap .print-compact th,
          .print-wrap .print-compact td { font-size: 10px !important; padding-top: 8px !important; padding-bottom: 8px !important; }
          .print-wrap .print-page-title { margin-bottom: 8px; }
        </style>
      </head>
      <body><div class="print-wrap">${content.innerHTML}</div></body></html>
    `);
    printWindow.document.close();
    printWindow.onload = () => {
      setTimeout(() => { printWindow.print(); printWindow.close(); }, 300);
    };
  };

  const handleExportPdf = async () => {
    const content = exportRef.current;
    if (!content || exportingPdf) return;

    const root = document.documentElement;
    const hadDarkMode = root.classList.contains("dark");
    const previousColorScheme = root.style.colorScheme;

    setExportingPdf(true);
    try {
      if (hadDarkMode) root.classList.remove("dark");
      root.style.colorScheme = "light";
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

      await (document.fonts?.ready ?? Promise.resolve());
      await waitForImages(content);

      const captureNode = content.cloneNode(true) as HTMLElement;
      captureNode.setAttribute("data-pdf-capture", "true");
      captureNode.style.position = "fixed";
      captureNode.style.left = "0";
      captureNode.style.top = "0";
      captureNode.style.width = "1120px";
      captureNode.style.maxWidth = "1120px";
      captureNode.style.height = "auto";
      captureNode.style.margin = "0";
      captureNode.style.padding = "0";
      captureNode.style.background = "#ffffff";
      captureNode.style.color = "#0f172a";
      captureNode.style.zIndex = "2147483647";
      captureNode.style.pointerEvents = "none";
      captureNode.style.overflow = "visible";

      const pageShell = captureNode.querySelector(".report") as HTMLElement | null;
      if (pageShell) {
        pageShell.style.maxWidth = "1120px";
        pageShell.style.margin = "0";
        pageShell.style.padding = "24px";
        pageShell.style.background = "#ffffff";
        pageShell.style.color = "#0f172a";
      }

      document.body.appendChild(captureNode);
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      await waitForImages(captureNode);

      const canvas = await html2canvas(captureNode, {
        scale: 1.6,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 1120,
        windowHeight: captureNode.scrollHeight,
        scrollX: 0,
        scrollY: 0,
      });

      document.body.removeChild(captureNode);

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const margin = 8;
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;
      const imgData = canvas.toDataURL("image/png");
      const imageHeight = (canvas.height * usableWidth) / canvas.width;
      const pageHeightInCanvas = (usableHeight * canvas.width) / usableWidth;

      let position = 0;
      let pageIndex = 0;
      while (position < imageHeight) {
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", margin, margin - position, usableWidth, imageHeight, undefined, "FAST");
        position += pageHeightInCanvas;
        pageIndex += 1;
      }

      const fileName = `caprina-monthly-report-${report.profile?.id ?? "employee"}-${report.period.month}.pdf`;
      pdf.save(fileName);
      toast({ title: "تم تصدير PDF", description: "تم إنشاء التقرير الشهري بنجاح." });
    } catch (error: any) {
      toast({
        title: "تعذر تصدير PDF",
        description: error?.message || "حدث خطأ أثناء إنشاء ملف PDF. حاول مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      const existingCapture = document.querySelector('[data-pdf-capture="true"]');
      if (existingCapture?.parentElement) existingCapture.parentElement.removeChild(existingCapture);
      if (hadDarkMode) root.classList.add("dark");
      root.style.colorScheme = previousColorScheme;
      setExportingPdf(false);
    }
  };

  const [yearStr, monthStr] = report.period.month.split("-");
  const periodLabel = new Date(parseInt(yearStr), parseInt(monthStr) - 1, 1)
    .toLocaleDateString("ar-EG", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button onClick={handleExportPdf} disabled={exportingPdf} className="gap-2 h-8 text-xs bg-emerald-600 hover:bg-emerald-700">
          <Download className="w-3.5 h-3.5" />
          {exportingPdf ? "جارٍ التصدير..." : "تصدير PDF"}
        </Button>
        <Button onClick={handlePrint} className="gap-2 h-8 text-xs bg-primary">
          <Printer className="w-3.5 h-3.5" />طباعة التقرير
        </Button>
      </div>

      <div ref={printRef}>
        <div className="report" style={{ direction: "rtl", fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif" }}>

          {/* Header */}
          <div className="header border-b-2 border-primary pb-4 mb-5 flex justify-between items-start">
            <div className="flex items-center gap-3">
              <img
                src="/logo.jpg"
                alt="Caprina"
                className="h-12 w-12 rounded-2xl object-cover border border-border/60 shadow-sm bg-background"
              />
              <div>
                <div className="brand text-2xl font-black text-primary">CAPRINA</div>
                <div className="title text-xs text-muted-foreground mt-0.5">تقرير أداء موظف — {periodLabel}</div>
              </div>
            </div>
            <div className="text-left text-xs text-muted-foreground">
              <div>تاريخ الإصدار: {new Date().toLocaleDateString("ar-EG")}</div>
              {report.profile?.department && <div>القسم: {report.profile.department}</div>}
            </div>
          </div>

          {/* Employee Info */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div className="bg-muted/20 border border-border/50 rounded-lg p-3">
              <h3 className="text-[10px] text-muted-foreground uppercase mb-2 font-semibold">بيانات الموظف</h3>
              {[
                ["الاسم", report.displayName],
                ["المسمى الوظيفي", report.profile?.jobTitle || "—"],
                ["القسم", report.profile?.department || "—"],
                ["تاريخ التعيين", report.profile?.hireDate ? new Date(report.profile.hireDate).toLocaleDateString("ar-EG") : "—"],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold">{value}</span>
                </div>
              ))}
            </div>
            <div className="bg-muted/20 border border-border/50 rounded-lg p-3">
              <h3 className="text-[10px] text-muted-foreground uppercase mb-2 font-semibold">فترة التقرير</h3>
              {[
                ["الشهر", periodLabel],
                ["من", new Date(report.period.from).toLocaleDateString("ar-EG")],
                ["إلى", new Date(report.period.to).toLocaleDateString("ar-EG")],
                ["إجمالي الطلبيات", fmtNum(report.orderStats.total)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between text-xs mb-1">
                  <span className="text-muted-foreground">{label}</span>
                  <span className="font-semibold">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Order Stats */}
          <div className="grid grid-cols-4 gap-2 mb-5">
            {[
              { label: "إجمالي الطلبيات", value: fmtNum(report.orderStats.total), colorCls: "text-foreground", bgCls: "bg-muted/20 border-border/50" },
              { label: "مُسلَّم", value: fmtNum(report.orderStats.delivered), colorCls: "text-emerald-500", bgCls: "bg-emerald-500/10 border-emerald-500/20" },
              { label: "مُرتجَع", value: fmtNum(report.orderStats.returned), colorCls: "text-red-500", bgCls: "bg-red-500/10 border-red-500/20" },
              { label: "نسبة التسليم", value: `${report.orderStats.deliveryRate}%`, colorCls: "text-[#c9a227]", bgCls: "bg-[#c9a227]/10 border-[#c9a227]/20" },
            ].map(s => (
              <div key={s.label} className={`border rounded-xl p-2.5 text-center ${s.bgCls}`}>
                <div className={`text-xl font-black ${s.colorCls}`}>{s.value}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* KPIs Table */}
          {report.kpis.length > 0 && report.profile?.role === "sales" && (
            <div className="mb-5">
              <h3 className="text-sm font-bold mb-2 border-r-4 border-primary pr-2">مؤشرات الأداء الرئيسية</h3>

              {/* ملخص KPI المالي */}
              {(kpiDeductions > 0 || kpiBonuses > 0) && (
                <div className="flex gap-2 mb-3">
                  {kpiDeductions > 0 && (
                    <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                      <div className="text-[10px] text-muted-foreground mb-1">إجمالي خصم KPI</div>
                      <div className="text-base font-black text-red-500">−{fmt(kpiDeductions)}</div>
                      <div className="text-[9px] text-muted-foreground">{kpiFailedCount} مؤشر لم يتحقق</div>
                    </div>
                  )}
                  {kpiBonuses > 0 && (
                    <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                      <div className="text-[10px] text-muted-foreground mb-1">إجمالي مكافأة Over Target</div>
                      <div className="text-base font-black text-emerald-500">+{fmt(kpiBonuses)}</div>
                      <div className="text-[9px] text-muted-foreground">🏆 {kpiOverTargetCount} مؤشر</div>
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-xl overflow-hidden border border-border/50">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      {["المؤشر", "الهدف", "الفعلي", "الدرجة", "الحالة", "التأثير المالي"].map(h => (
                        <th key={h} className="bg-primary text-white px-3 py-2 text-right text-[11px] font-bold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.kpis.map((kpi, i) => {
                      const sw = kpi.salaryWeight ?? 0;
                      const ot = kpi.overtargetBonus ?? 0;
                      const kpiAmt = sw > 0 && baseSalary > 0 ? Math.round((sw / 100) * baseSalary) : 0;
                      const otAmt  = ot > 0 && baseSalary > 0 ? Math.round((ot / 100) * baseSalary) : 0;
                      const isOT   = kpi.score !== null && kpi.score > 100;
                      return (
                      <tr key={kpi.id} className={i % 2 === 0 ? "bg-muted/10" : "bg-muted/20"}>
                        <td className="px-3 py-2 border-b border-border/20 text-xs font-semibold">
                          {kpi.name}
                          {kpi.description && <div className="text-[10px] text-muted-foreground font-normal">{kpi.description}</div>}
                        </td>
                        <td className="px-3 py-2 border-b border-border/20 text-xs">
                          {kpi.direction === "lower_is_better" ? "≤" : "≥"}{fmtNum(kpi.targetValue)} {kpi.unit}
                        </td>
                        <td className="px-3 py-2 border-b border-border/20 text-xs font-bold">
                          {kpi.actualValue !== null ? `${fmtNum(kpi.actualValue)} ${kpi.unit}` : "—"}
                        </td>
                        <td className="px-3 py-2 border-b border-border/20 text-xs">
                          {kpi.score !== null ? `${kpi.score}%` : "—"}
                        </td>
                        <td className={`px-3 py-2 border-b border-border/20 text-xs font-bold ${isOT ? "text-blue-500" : kpi.achieved ? "text-emerald-500" : kpi.achieved === false ? "text-red-500" : "text-muted-foreground"}`}>
                          {isOT ? "🏆 Over Target" : kpi.achieved === true ? "✓ محقق" : kpi.achieved === false ? "✗ لم يتحقق" : "—"}
                        </td>
                        <td className="px-3 py-2 border-b border-border/20 text-xs font-bold">
                          {isOT && otAmt > 0 ? (
                            <span className="text-emerald-500">+{fmt(otAmt)}</span>
                          ) : kpi.achieved === false && kpiAmt > 0 ? (
                            <span className="text-red-500">−{fmt(kpiAmt)}</span>
                          ) : kpi.achieved === true ? (
                            <span className="text-muted-foreground">لا خصم</span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Overall Score */}
          <div className="bg-primary/8 border-2 border-primary rounded-xl p-4 mb-5 flex justify-between items-center">
            <div>
              <div className="text-xs text-muted-foreground mb-1">التقييم الإجمالي</div>
              <div className="text-4xl font-black text-primary">
                {report.overallScore !== null ? `${report.overallScore}%` : "—"}
              </div>
            </div>
            <div className="text-center">
              <div className="text-xl font-black">
                {report.overallScore == null ? "غير محدد"
                  : report.overallScore >= 80 ? "ممتاز"
                  : report.overallScore >= 65 ? "جيد جداً"
                  : report.overallScore >= 50 ? "جيد"
                  : report.overallScore >= 35 ? "مقبول"
                  : report.overallScore > 0  ? "ضعيف"
                  : "غير محدد"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {report.overallScore !== null
                  ? report.overallScore >= 90 ? "أداء استثنائي" : report.overallScore >= 75 ? "أداء فوق المتوسط" : report.overallScore >= 60 ? "أداء مقبول" : "يحتاج تحسين"
                  : "لا توجد مؤشرات"}
              </div>
            </div>
          </div>

          {/* Attendance & Salary Section */}
          {salaryReport && (
            <div className="mb-5">
              <h3 className="text-sm font-bold mb-3 border-r-4 border-primary pr-2">الحضور والمرتب التفصيلي</h3>

              {/* Attendance stats - responsive 3 cols on small, 5 on large */}
              <div className="grid grid-cols-3 gap-1.5 mb-3">
                {[
                  { label: "أيام الحضور",  val: salaryReport.workedDays,        colorCls: "text-emerald-500", bgCls: "bg-emerald-500/10 border-emerald-500/20" },
                  { label: "أيام الغياب",  val: salaryReport.absentDays,        colorCls: "text-red-500",     bgCls: "bg-red-500/10 border-red-500/20" },
                  { label: "أيام التأخير", val: salaryReport.lateDays,          colorCls: "text-amber-500",   bgCls: "bg-amber-500/10 border-amber-500/20" },
                  { label: "نصف يوم",      val: salaryReport.halfDays,          colorCls: "text-blue-500",    bgCls: "bg-blue-500/10 border-blue-500/20" },
                  { label: "إجمالي الأيام", val: salaryReport.totalWorkingDays, colorCls: "text-muted-foreground", bgCls: "bg-muted/20 border-border/50" },
                  { label: "أيام العمل الفعلية", val: salaryReport.workedDays + salaryReport.halfDays * 0.5, colorCls: "text-[#c9a227]", bgCls: "bg-[#c9a227]/10 border-[#c9a227]/20" },
                ].map(s => (
                  <div key={s.label} className={`border rounded-xl p-2.5 text-center ${s.bgCls}`}>
                    <div className={`text-2xl font-black leading-none ${s.colorCls}`}>{s.val}</div>
                    <div className="text-[9px] text-muted-foreground mt-1 font-medium">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Salary breakdown */}
              <div className="border border-border/50 rounded-xl overflow-hidden mb-2.5">
                <div className="bg-[#c9a227] px-3 py-2 flex justify-between items-center">
                  <span className="text-white font-bold text-xs">البند</span>
                  <span className="text-white font-bold text-xs">المبلغ</span>
                </div>
                {/* الراتب الأساسي */}
                <div className="flex justify-between items-center px-3 py-2 border-b border-border/30 bg-muted/10">
                  <span className="text-xs text-muted-foreground">الراتب الأساسي</span>
                  <span className="text-sm font-bold text-foreground">{fmt(salaryReport.baseSalary)}</span>
                </div>
                {/* خصم الغياب */}
                <div className={`flex justify-between items-center px-3 py-2 border-b border-border/30 ${salaryReport.attendanceDeduction > 0 ? "bg-red-500/5" : "bg-muted/10"}`}>
                  <span className="text-xs text-muted-foreground">خصم الغياب / نصف اليوم</span>
                  <span className={`text-sm font-bold ${salaryReport.attendanceDeduction > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                    {salaryReport.attendanceDeduction > 0 ? `−${fmt(salaryReport.attendanceDeduction)}` : "—"}
                  </span>
                </div>
                {/* خصم KPI */}
                <div className={`flex justify-between items-center px-3 py-2 border-b border-border/30 ${kpiDeductions > 0 ? "bg-red-500/5" : "bg-muted/10"}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">خصم مؤشرات KPI</span>
                    {kpiDeductions > 0 && (
                      <span className="text-[9px] bg-red-500/15 text-red-600 dark:text-red-400 rounded-full px-1.5 py-0.5 font-bold">{kpiFailedCount} مؤشر لم يتحقق</span>
                    )}
                  </div>
                  <span className={`text-sm font-bold ${kpiDeductions > 0 ? "text-red-500" : "text-muted-foreground"}`}>
                    {kpiDeductions > 0 ? `−${fmt(kpiDeductions)}` : "—"}
                  </span>
                </div>
                {/* مكافأة بونص */}
                <div className={`flex justify-between items-center px-3 py-2 border-b border-border/30 ${salaryReport.bonuses > 0 ? "bg-emerald-500/5" : "bg-muted/10"}`}>
                  <span className="text-xs text-muted-foreground">بونص إضافي</span>
                  <span className={`text-sm font-bold ${salaryReport.bonuses > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                    {salaryReport.bonuses > 0 ? `+${fmt(salaryReport.bonuses)}` : "—"}
                  </span>
                </div>
                {/* مكافأة Over Target */}
                <div className={`flex justify-between items-center px-3 py-2 border-b border-border/30 ${kpiBonuses > 0 ? "bg-emerald-500/5" : "bg-muted/10"}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">مكافأة Over Target</span>
                    {kpiBonuses > 0 && (
                      <span className="text-[9px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-full px-1.5 py-0.5 font-bold">🏆 {kpiOverTargetCount} مؤشر</span>
                    )}
                  </div>
                  <span className={`text-sm font-bold ${kpiBonuses > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                    {kpiBonuses > 0 ? `+${fmt(kpiBonuses)}` : "—"}
                  </span>
                </div>
                {/* خصومات إضافية */}
                {salaryReport.extraDeductions > 0 && (
                  <div className="flex justify-between items-center px-3 py-2 border-b border-border/30 bg-red-500/5">
                    <span className="text-xs text-muted-foreground">خصومات إضافية</span>
                    <span className="text-sm font-bold text-red-500">−{fmt(salaryReport.extraDeductions)}</span>
                  </div>
                )}
                {/* بونص أو خصم خاص */}
                <div className={`flex justify-between items-center px-3 py-2 border-b border-border/30 ${specialBonusNum > 0 ? (specialBonusType === "bonus" ? "bg-emerald-500/5" : "bg-red-500/5") : "bg-muted/10"}`}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground shrink-0">بونص / خصم خاص</span>
                    {editingSpecialBonus ? (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {/* +/- toggle */}
                        <button
                          onClick={() => setSpecialBonusType(t => t === "bonus" ? "deduction" : "bonus")}
                          className={`w-6 h-6 rounded-md text-xs font-black shrink-0 border transition-colors ${specialBonusType === "bonus" ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-500" : "bg-red-500/20 border-red-500/40 text-red-500"}`}>
                          {specialBonusType === "bonus" ? "+" : "−"}
                        </button>
                        <input
                          type="number" min="0" placeholder="القيمة"
                          value={specialBonus}
                          onChange={e => setSpecialBonus(e.target.value)}
                          className="w-20 h-6 text-xs px-2 rounded-md border border-border bg-background focus:outline-none focus:border-primary"
                        />
                        <input
                          type="text" placeholder="السبب / الملاحظة"
                          value={specialBonusNote}
                          onChange={e => setSpecialBonusNote(e.target.value)}
                          className="flex-1 min-w-0 h-6 text-xs px-2 rounded-md border border-border bg-background focus:outline-none focus:border-primary"
                        />
                        <button onClick={() => setEditingSpecialBonus(false)}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-primary text-primary-foreground font-bold shrink-0">
                          حفظ
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {specialBonusNote && <span className="text-[10px] text-muted-foreground truncate">{specialBonusNote}</span>}
                        <button onClick={() => setEditingSpecialBonus(true)}
                          className="text-[9px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors shrink-0">
                          {specialBonusNum > 0 ? "تعديل" : "+ إضافة"}
                        </button>
                      </div>
                    )}
                  </div>
                  <span className={`text-sm font-bold shrink-0 mr-2 ${specialBonusNum > 0 ? (specialBonusType === "bonus" ? "text-emerald-500" : "text-red-500") : "text-muted-foreground"}`}>
                    {specialBonusNum > 0 ? `${specialBonusType === "bonus" ? "+" : "−"}${fmt(specialBonusNum)}` : "—"}
                  </span>
                </div>
                {/* صافي المرتب النهائي */}
                {(() => {
                  const finalNet = salaryReport.netSalary - kpiDeductions + kpiBonuses + specialBonusValue;
                  return (
                    <div className={`flex justify-between items-center px-3 py-3 border-t-2 border-[#c9a227] ${finalNet >= salaryReport.baseSalary ? "bg-emerald-500/8" : finalNet < salaryReport.baseSalary * 0.9 ? "bg-red-500/5" : "bg-amber-500/8"}`}>
                      <div>
                        <p className="text-sm font-black">صافي المرتب</p>
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {salaryReport.baseSalary} − {salaryReport.attendanceDeduction + kpiDeductions} + {salaryReport.bonuses + kpiBonuses}
                        </p>
                      </div>
                      <span className={`text-2xl font-black ${finalNet >= salaryReport.baseSalary ? "text-emerald-500" : finalNet < salaryReport.baseSalary * 0.9 ? "text-red-500" : "text-amber-500"}`}>
                        {fmt(finalNet)}
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* Adjustments list */}
              {salaryReport.adjustments.length > 0 && (
                <div>
                  <p className="text-[11px] text-muted-foreground mb-1.5 font-semibold">تفاصيل البونص والخصومات:</p>
                  {salaryReport.adjustments.map(adj => (
                    <div key={adj.id} className={`flex justify-between items-center text-xs px-2.5 py-1.5 rounded-lg border mb-1 ${adj.type === "bonus" ? "bg-emerald-500/8 border-emerald-500/20" : "bg-red-500/8 border-red-500/20"}`}>
                      <span className="text-muted-foreground">{adj.reason}</span>
                      <span className={`font-bold text-sm ${adj.type === "bonus" ? "text-emerald-500" : "text-red-500"}`}>
                        {adj.type === "bonus" ? "+" : "−"}{fmt(adj.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Salary fallback (if no salaryReport) */}
          {!salaryReport && (
            <div className="border border-emerald-500/20 bg-emerald-500/8 rounded-xl p-3 mb-5">
              <h3 className="text-[11px] text-muted-foreground mb-2">الراتب الشهري</h3>
              <div className="flex justify-between items-center">
                <span className="text-xs">الراتب المستحق عن شهر {periodLabel}</span>
                <span className="text-xl font-black text-emerald-500">{fmt(report.salary)}</span>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ textAlign: "center", fontSize: 10, color: "#aaa", marginTop: 24, borderTop: "1px solid #eee", paddingTop: 12 }}>
            تقرير صادر من نظام CAPRINA لإدارة المبيعات — {new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
          </div>

        </div>
      </div>

      <div ref={exportRef} aria-hidden="true" className="fixed -left-[20000px] top-0 w-[980px] bg-white text-slate-900 pointer-events-none">
        <div className="p-8" style={{ direction: "rtl", fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif" }}>
          <div style={{
            borderRadius: 28,
            overflow: "hidden",
            background: "linear-gradient(135deg, #0f172a 0%, #111827 55%, #1f2937 100%)",
            color: "white",
            boxShadow: "0 24px 60px rgba(15, 23, 42, 0.18)",
          }}>
            <div style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 24,
              padding: "22px 26px",
              borderBottom: "1px solid rgba(255,255,255,0.12)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <img
                  src="/logo.jpg"
                  alt="Caprina"
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 14,
                    objectFit: "cover",
                    border: "2px solid rgba(201,162,39,0.45)",
                    boxShadow: "0 10px 24px rgba(0,0,0,0.22)",
                    background: "#fff",
                  }}
                />
                <div>
                  <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: 0.4, color: "#f8fafc" }}>CAPRINA</div>
                  <div style={{ fontSize: 11, color: "rgba(248,250,252,0.72)", marginTop: 2 }}>
                    تقرير الأداء الشهري للموظف — {periodLabel}
                  </div>
                </div>
              </div>
              <div style={{
                textAlign: "left",
                minWidth: 170,
                padding: "12px 16px",
                borderRadius: 18,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.12)",
              }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.62)" }}>تاريخ الإصدار</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{new Date().toLocaleDateString("ar-EG")}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.62)", marginTop: 8 }}>القسم</div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{report.profile?.department || "—"}</div>
              </div>
            </div>

            <div style={{ padding: 26, background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)", color: "#0f172a" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 16, marginBottom: 16 }}>
                <div className="avoid-break print-page-title" style={{
                  borderRadius: 22,
                  background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                  border: "1px solid rgba(148,163,184,0.18)",
                  padding: 16,
                  boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
                }}>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, letterSpacing: 0.3 }}>بيانات الموظف</div>
                  <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
                    {[
                      ["الاسم", report.displayName],
                      ["المسمى الوظيفي", report.profile?.jobTitle || "—"],
                      ["القسم", report.profile?.department || "—"],
                      ["تاريخ التعيين", report.profile?.hireDate ? new Date(report.profile.hireDate).toLocaleDateString("ar-EG") : "—"],
                    ].map(([label, value]) => (
                      <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12, padding: "6px 0", borderBottom: "1px dashed rgba(148,163,184,0.18)" }}>
                        <span style={{ color: "#64748b" }}>{label}</span>
                        <span style={{ fontWeight: 700, color: "#0f172a" }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{
                  borderRadius: 22,
                  background: "linear-gradient(135deg, #ffffff 0%, #f8fafc 100%)",
                  border: "1px solid rgba(148,163,184,0.18)",
                  padding: 16,
                  boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
                }}>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700 }}>ملخص الشهر</div>
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {[
                      { label: "الفترة", value: periodLabel },
                      { label: "من", value: new Date(report.period.from).toLocaleDateString("ar-EG") },
                      { label: "إلى", value: new Date(report.period.to).toLocaleDateString("ar-EG") },
                      { label: "النتيجة", value: report.rating },
                    ].map(item => (
                      <div key={item.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "9px 12px", borderRadius: 14, background: "rgba(248,250,252,0.95)", border: "1px solid rgba(226,232,240,0.9)" }}>
                        <span style={{ fontSize: 12, color: "#64748b" }}>{item.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: item.label === "النتيجة" ? "#c9a227" : "#0f172a" }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "إجمالي الطلبيات", value: fmtNum(report.orderStats.total), color: "#0f172a", bg: "#ffffff" },
                  { label: "مُسلَّم", value: fmtNum(report.orderStats.delivered), color: "#10b981", bg: "#ecfdf5" },
                  { label: "مُرتجَع", value: fmtNum(report.orderStats.returned), color: "#ef4444", bg: "#fef2f2" },
                  { label: "نسبة التسليم", value: `${report.orderStats.deliveryRate}%`, color: "#c9a227", bg: "#fffbeb" },
                ].map(item => (
                  <div key={item.label} style={{
                    borderRadius: 18,
                    background: item.bg,
                    border: "1px solid rgba(148,163,184,0.18)",
                    padding: "14px 16px",
                    boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
                  }}>
                    <div style={{ fontSize: 10, color: "#64748b", marginBottom: 8 }}>{item.label}</div>
                    <div style={{ fontSize: 24, lineHeight: 1, fontWeight: 900, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div className="avoid-break print-compact" style={{
                  borderRadius: 22,
                  background: "#ffffff",
                  border: "1px solid rgba(148,163,184,0.18)",
                  padding: 18,
                  boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>مؤشرات الأداء الرئيسية</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>{kpiFinancials.salaryAtRiskPercent}% من الراتب</div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 14 }}>
                    {[
                      { label: "محقق", value: kpiAchievedCount, bg: "#ecfdf5", color: "#10b981" },
                      { label: "لم يتحقق", value: kpiFailedCount, bg: "#fef2f2", color: "#ef4444" },
                      { label: "Over Target", value: kpiOverTargetCount, bg: "#eff6ff", color: "#2563eb" },
                    ].map(item => (
                      <div key={item.label} style={{ borderRadius: 16, padding: 12, textAlign: "center", background: item.bg, border: "1px solid rgba(148,163,184,0.14)" }}>
                        <div style={{ fontSize: 20, fontWeight: 900, color: item.color, lineHeight: 1 }}>{item.value}</div>
                        <div style={{ fontSize: 10, color: "#475569", marginTop: 6 }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderRadius: 16, padding: 14, background: "linear-gradient(135deg, #fffbeb 0%, #fff7ed 100%)", border: "1px solid rgba(245,158,11,0.18)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 8 }}>
                      <span style={{ color: "#64748b" }}>مؤشر الراتب المعرض للخطر</span>
                      <span style={{ fontWeight: 900, color: "#c9a227" }}>{Math.min(kpiFinancials.salaryAtRiskPercent, 100)}%</span>
                    </div>
                    <div style={{ height: 10, borderRadius: 999, background: "#fde68a", overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(kpiFinancials.salaryAtRiskPercent, 100)}%`, height: "100%", background: "linear-gradient(90deg, #f59e0b, #c9a227)" }} />
                    </div>
                    <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span style={{ color: "#64748b" }}>محتمل الخصم</span>
                      <span style={{ fontWeight: 900, color: "#b45309" }}>{fmt(kpiFinancials.totalDeduction)}</span>
                    </div>
                  </div>
                </div>

                <div className="avoid-break print-compact" style={{
                  borderRadius: 22,
                  background: "#ffffff",
                  border: "1px solid rgba(148,163,184,0.18)",
                  padding: 18,
                  boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>توزيع الراتب الشهري</div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {[
                      { label: "الأساسي", value: fmt(baseSalary), color: "#0f172a" },
                      { label: "خصم الحضور", value: `−${fmt(salaryReport?.attendanceDeduction ?? 0)}`, color: "#ef4444" },
                      { label: "خصم KPI", value: `−${fmt(kpiDeductions)}`, color: "#ef4444" },
                      { label: "البونص", value: `+${fmt((salaryReport?.bonuses ?? 0) + kpiBonuses)}`, color: "#10b981" },
                      { label: "الصافي", value: fmt(Math.max((salaryReport?.netSalary ?? baseSalary) - kpiDeductions + kpiBonuses, 0)), color: "#c9a227" },
                    ].map(item => (
                      <div key={item.label} style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", borderRadius: 14, background: "rgba(248,250,252,0.95)", border: "1px solid rgba(226,232,240,0.9)" }}>
                        <span style={{ fontSize: 12, color: "#64748b" }}>{item.label}</span>
                        <span style={{ fontSize: 13, fontWeight: 900, color: item.color }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {report.kpis.length > 0 && report.profile?.role === "sales" && (
                <div style={{
                  borderRadius: 22,
                  background: "#ffffff",
                  border: "1px solid rgba(148,163,184,0.18)",
                  padding: 16,
                  boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
                  marginBottom: 16,
                  breakInside: "avoid",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a" }}>مؤشرات الأداء التفصيلية</div>
                    <div style={{ fontSize: 11, color: "#64748b" }}>التأثير المالي لكل مؤشر</div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", direction: "rtl" }}>
                    <thead>
                      <tr>
                        {["المؤشر", "الهدف", "الفعلي", "الدرجة", "الحالة", "الأثر المالي"].map(h => (
                          <th key={h} style={{ textAlign: "right", fontSize: 10, color: "#64748b", padding: "10px 10px", borderBottom: "1px solid rgba(226,232,240,0.9)", background: "#f8fafc" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.kpis.map((kpi, index) => {
                        const sw = kpi.salaryWeight ?? 0;
                        const ot = kpi.overtargetBonus ?? 0;
                        const kpiAmt = sw > 0 && baseSalary > 0 ? Math.round((sw / 100) * baseSalary) : 0;
                        const otAmt = ot > 0 && baseSalary > 0 ? Math.round((ot / 100) * baseSalary) : 0;
                        const isOT = kpi.score !== null && kpi.score > 100;
                        return (
                          <tr key={kpi.id} style={{ background: index % 2 === 0 ? "#ffffff" : "#f8fafc" }}>
                            <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(226,232,240,0.8)", fontSize: 11, fontWeight: 700 }}>
                              {kpi.name}
                              {kpi.description && <div style={{ marginTop: 3, fontSize: 9, fontWeight: 400, color: "#64748b" }}>{kpi.description}</div>}
                            </td>
                            <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(226,232,240,0.8)", fontSize: 11 }}>
                              {kpi.direction === "lower_is_better" ? "≤" : "≥"}{fmtNum(kpi.targetValue)} {kpi.unit}
                            </td>
                            <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(226,232,240,0.8)", fontSize: 11, fontWeight: 700 }}>
                              {kpi.actualValue !== null ? `${fmtNum(kpi.actualValue)} ${kpi.unit}` : "—"}
                            </td>
                            <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(226,232,240,0.8)", fontSize: 11 }}>
                              {kpi.score !== null ? `${kpi.score}%` : "—"}
                            </td>
                            <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(226,232,240,0.8)", fontSize: 11, fontWeight: 800, color: isOT ? "#2563eb" : kpi.achieved ? "#10b981" : kpi.achieved === false ? "#ef4444" : "#64748b" }}>
                              {isOT ? "Over Target" : kpi.achieved === true ? "محقق" : kpi.achieved === false ? "لم يتحقق" : "—"}
                            </td>
                            <td style={{ padding: "10px 10px", borderBottom: "1px solid rgba(226,232,240,0.8)", fontSize: 11, fontWeight: 900, color: isOT && otAmt > 0 ? "#10b981" : kpi.achieved === false && kpiAmt > 0 ? "#ef4444" : "#64748b" }}>
                              {isOT && otAmt > 0 ? `+${fmt(otAmt)}` : kpi.achieved === false && kpiAmt > 0 ? `−${fmt(kpiAmt)}` : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {salaryReport && (
                <div style={{
                  borderRadius: 22,
                  background: "#ffffff",
                  border: "1px solid rgba(148,163,184,0.18)",
                  padding: 16,
                  boxShadow: "0 12px 30px rgba(15,23,42,0.06)",
                  marginBottom: 16,
                  breakInside: "avoid",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#0f172a", marginBottom: 12 }}>الحضور والمرتب التفصيلي</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10, marginBottom: 14 }}>
                    {[
                      { label: "الحضور", val: salaryReport.workedDays, bg: "#ecfdf5", color: "#10b981" },
                      { label: "الغياب", val: salaryReport.absentDays, bg: "#fef2f2", color: "#ef4444" },
                      { label: "التأخير", val: salaryReport.lateDays, bg: "#fffbeb", color: "#f59e0b" },
                      { label: "نصف يوم", val: salaryReport.halfDays, bg: "#eff6ff", color: "#2563eb" },
                      { label: "الأيام الكلية", val: salaryReport.totalWorkingDays, bg: "#f8fafc", color: "#0f172a" },
                      { label: "الأيام الفعلية", val: salaryReport.workedDays + salaryReport.halfDays * 0.5, bg: "#f8fafc", color: "#c9a227" },
                    ].map(item => (
                      <div key={item.label} style={{ borderRadius: 16, padding: 12, textAlign: "center", background: item.bg, border: "1px solid rgba(148,163,184,0.14)" }}>
                        <div style={{ fontSize: 22, fontWeight: 900, color: item.color, lineHeight: 1 }}>{item.val}</div>
                        <div style={{ fontSize: 10, color: "#475569", marginTop: 6 }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid rgba(226,232,240,0.9)" }}>
                    {[
                      ["الراتب الأساسي", fmt(salaryReport.baseSalary), "#0f172a"],
                      ["خصم الحضور / نصف اليوم", salaryReport.attendanceDeduction > 0 ? `−${fmt(salaryReport.attendanceDeduction)}` : "—", "#ef4444"],
                      ["خصم KPI", kpiDeductions > 0 ? `−${fmt(kpiDeductions)}` : "—", "#ef4444"],
                      ["البونص الإضافي", salaryReport.bonuses > 0 ? `+${fmt(salaryReport.bonuses)}` : "—", "#10b981"],
                      ["مكافأة Over Target", kpiBonuses > 0 ? `+${fmt(kpiBonuses)}` : "—", "#10b981"],
                    ].map((row, idx) => (
                      <div key={row[0]} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "11px 14px", background: idx % 2 === 0 ? "#ffffff" : "#f8fafc", borderBottom: idx < 4 ? "1px solid rgba(226,232,240,0.9)" : "none" }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>{row[0]}</span>
                        <span style={{ fontSize: 12, fontWeight: 900, color: row[2] }}>{row[1]}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "14px", background: "linear-gradient(135deg, #0f172a 0%, #111827 100%)", color: "white" }}>
                      <span style={{ fontSize: 12, fontWeight: 800 }}>صافي المرتب</span>
                      <span style={{ fontSize: 20, fontWeight: 900 }}>{fmt(Math.max((salaryReport.netSalary ?? baseSalary) - kpiDeductions + kpiBonuses, 0))}</span>
                    </div>
                  </div>
                </div>
              )}

              <div style={{
                borderRadius: 18,
                padding: "12px 16px",
                background: "linear-gradient(135deg, #fffbeb 0%, #fff7ed 100%)",
                border: "1px solid rgba(201,162,39,0.22)",
                color: "#92400e",
                fontSize: 11,
                fontWeight: 700,
              }}>
                تم إصدار هذا التقرير من نظام CAPRINA لإدارة المبيعات — نسخة رسمية مخصصة للتسليم الشهري.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Attendance Tab ──────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<AttendanceStatus, { label: string; color: string; bg: string; icon: any; deductPct: number }> = {
  present:  { label: "حاضر",       color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/20", icon: CheckCircle2,   deductPct: 0    },
  late:     { label: "متأخر",      color: "text-amber-600",   bg: "bg-amber-50 dark:bg-amber-900/20",     icon: Clock,          deductPct: 0    },
  half_day: { label: "نصف يوم",    color: "text-blue-600",    bg: "bg-blue-50 dark:bg-blue-900/20",       icon: AlertTriangle,  deductPct: 50   },
  absent:   { label: "غائب",       color: "text-red-600",     bg: "bg-red-50 dark:bg-red-900/20",         icon: XCircle,        deductPct: 100  },
  holiday:  { label: "إجازة",      color: "text-purple-600",  bg: "bg-purple-50 dark:bg-purple-900/20",   icon: Calendar,       deductPct: 0    },
  excused:  { label: "إذن/مبرر",   color: "text-gray-500",    bg: "bg-gray-50 dark:bg-gray-900/20",       icon: AlertCircle,    deductPct: 0    },
};

function AttendanceTab({ profileId, monthlySalary, isAdmin }: {
  profileId: number; monthlySalary: number; isAdmin: boolean;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [savingDay, setSavingDay] = useState<string | null>(null);
  const [adjType, setAdjType] = useState<"bonus" | "deduction">("bonus");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjReason, setAdjReason] = useState("");
  const [savingAdj, setSavingAdj] = useState(false);
  const [activeView, setActiveView] = useState<"calendar" | "salary">("calendar");

  // جلب سجل الحضور
  const { data: records = [], isLoading } = useQuery({
    queryKey: ["attendance", profileId, month],
    queryFn: () => attendanceApi.list(profileId, month),
  });

  // جلب الخصومات والبونص
  const { data: adjustments = [] } = useQuery({
    queryKey: ["attendance-adjustments", profileId, month],
    queryFn: () => attendanceApi.listAdjustments(profileId, month),
  });

  // بناء خريطة التواريخ
  const recMap = Object.fromEntries(records.map(r => [r.date, r]));

  // حساب أيام دورة الراتب: من 26 الشهر السابق لـ 25 الشهر الحالي
  const [year, mon] = month.split("-").map(Number);
  const prevMon  = mon === 1 ? 12 : mon - 1;
  const prevYear = mon === 1 ? year - 1 : year;
  const periodStart = new Date(prevYear, prevMon - 1, 26); // 26 الشهر السابق
  const periodEnd   = new Date(year, mon - 1, 25);         // 25 الشهر الحالي
  const days: string[] = [];
  const cur = new Date(periodStart);
  while (cur <= periodEnd) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${d}`);
    cur.setDate(cur.getDate() + 1);
  }
  const daysInMonth = days.length;

  // إحصائيات الحضور
  const stats = days.reduce((acc, date) => {
    const rec = recMap[date];
    if (!rec) return acc;
    if (rec.status === "present") acc.present++;
    else if (rec.status === "absent") acc.absent++;
    else if (rec.status === "late") { acc.present++; acc.late++; }
    else if (rec.status === "half_day") acc.halfDay++;
    else if (rec.status === "holiday" || rec.status === "excused") acc.excused++;
    acc.totalDeduction += rec.deduction;
    return acc;
  }, { present: 0, absent: 0, late: 0, halfDay: 0, excused: 0, totalDeduction: 0 });

  const workedDays = stats.present + stats.halfDay * 0.5;
  const bonusTotal = adjustments.filter(a => a.type === "bonus").reduce((s, a) => s + a.amount, 0);
  const deductTotal = adjustments.filter(a => a.type === "deduction").reduce((s, a) => s + a.amount, 0);
  const netSalary = monthlySalary - stats.totalDeduction + bonusTotal - deductTotal;

  // تغيير حالة يوم
  const handleDayStatus = async (date: string, status: AttendanceStatus) => {
    setSavingDay(date);
    const dailySalary = monthlySalary / daysInMonth;
    const cfg = STATUS_CONFIG[status];
    const deduction = (dailySalary * cfg.deductPct) / 100;
    try {
      await attendanceApi.save({ profileId, date, status, deduction });
      qc.invalidateQueries({ queryKey: ["attendance", profileId, month] });
      toast({ title: `تم تسجيل ${cfg.label} ليوم ${date}` });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally { setSavingDay(null); }
  };

  const handleAddAdjustment = async () => {
    if (!adjAmount || !adjReason.trim()) {
      toast({ title: "أدخل المبلغ والسبب", variant: "destructive" }); return;
    }
    setSavingAdj(true);
    try {
      await attendanceApi.addAdjustment({ profileId, month, type: adjType, amount: parseFloat(adjAmount), reason: adjReason });
      qc.invalidateQueries({ queryKey: ["attendance-adjustments", profileId, month] });
      setAdjAmount(""); setAdjReason("");
      toast({ title: adjType === "bonus" ? "تم إضافة البونص ✅" : "تم إضافة الخصم ✅" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally { setSavingAdj(false); }
  };

  const handleDeleteAdj = async (id: number) => {
    try {
      await attendanceApi.deleteAdjustment(id);
      qc.invalidateQueries({ queryKey: ["attendance-adjustments", profileId, month] });
      toast({ title: "تم الحذف" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Header: شهر + تبويب */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <Input type="month" value={month} onChange={e => setMonth(e.target.value)} className="h-8 text-xs w-36" />
        </div>
        <div className="flex gap-1 mr-auto">
          <Button size="sm" variant={activeView === "calendar" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setActiveView("calendar")}>
            <Calendar className="w-3 h-3 ml-1" />الحضور
          </Button>
          <Button size="sm" variant={activeView === "salary" ? "default" : "outline"} className="h-7 text-xs" onClick={() => setActiveView("salary")}>
            <DollarSign className="w-3 h-3 ml-1" />المرتب
          </Button>
        </div>
      </div>

      {/* بطاقات الإحصائيات */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "أيام الحضور",   val: stats.present,  icon: UserCheck,    color: "text-emerald-600" },
          { label: "أيام الغياب",   val: stats.absent,   icon: UserX,        color: "text-red-600"     },
          { label: "أيام التأخير",  val: stats.late,     icon: Clock,        color: "text-amber-600"   },
          { label: "إجمالي العمل",  val: `${workedDays} يوم`, icon: BarChart2, color: "text-blue-600" },
        ].map(({ label, val, icon: Icon, color }) => (
          <Card key={label} className="border-border">
            <CardContent className="p-3 flex items-center gap-2">
              <Icon className={`w-5 h-5 ${color} shrink-0`} />
              <div>
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className={`text-sm font-bold ${color}`}>{val}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── عرض التقويم ─── */}
      {activeView === "calendar" && (
        <div className="space-y-3">
          {isLoading && <p className="text-center text-xs text-muted-foreground py-6">جاري التحميل...</p>}
          {!isLoading && (
            <div className="grid grid-cols-7 gap-1">
              {["أحد","إثن","ثلا","أرب","خمس","جمع","سبت"].map(d => (
                <div key={d} className="text-center text-[9px] font-bold text-muted-foreground py-1">{d}</div>
              ))}
              {/* padding للبداية على أساس يوم 26 */}
              {Array.from({ length: periodStart.getDay() }).map((_, i) => (
                <div key={`pad-${i}`} />
              ))}
              {days.map(date => {
                const rec = recMap[date];
                const d = parseInt(date.split("-")[2]);
                const isToday = date === today;
                const isFuture = date > today;
                const cfg = rec ? STATUS_CONFIG[rec.status] : null;
                const Icon = cfg?.icon;
                return (
                  <div key={date} className={`relative rounded-lg border text-center p-1 transition-all ${isToday ? "ring-2 ring-primary" : ""} ${cfg ? cfg.bg : "bg-card"} ${isFuture ? "opacity-40" : ""}`}>
                    <div className={`text-[10px] font-bold mb-0.5 ${cfg ? cfg.color : "text-foreground"}`}>{d}</div>
                    {Icon && <Icon className={`w-3 h-3 mx-auto ${cfg.color}`} />}
                    {!isFuture && isAdmin && (
                      <Select
                        value={rec?.status ?? ""}
                        onValueChange={val => handleDayStatus(date, val as AttendanceStatus)}
                        disabled={savingDay === date}
                      >
                        <SelectTrigger className="h-4 text-[8px] mt-0.5 px-0.5 border-0 bg-transparent p-0 shadow-none focus:ring-0">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUS_CONFIG).map(([val, s]) => (
                            <SelectItem key={val} value={val} className="text-xs">{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    {!isAdmin && cfg && (
                      <p className={`text-[8px] font-bold mt-0.5 ${cfg.color}`}>{cfg.label}</p>
                    )}
                    {rec?.deduction ? (
                      <p className="text-[8px] text-red-500 font-bold">-{rec.deduction.toFixed(0)}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-2 pt-1">
            {Object.entries(STATUS_CONFIG).map(([k, s]) => (
              <div key={k} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${s.bg.split(" ")[0].replace("bg-","bg-")} ${s.color}`} style={{background:"currentColor"}} />
                <span className="text-[9px] text-muted-foreground">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── عرض المرتب ─── */}
      {activeView === "salary" && (
        <div className="space-y-4">
          {/* ملخص المرتب */}
          <Card className="border-border">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-primary" />
                ملخص المرتب — {month}
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-2">
              {[
                { label: "الراتب الأساسي",      val: monthlySalary,          color: "text-foreground",    sign: ""  },
                { label: "خصم الغياب/النصف",     val: -stats.totalDeduction,  color: "text-red-600",       sign: "-" },
                { label: "بونص إضافي",           val: bonusTotal,             color: "text-emerald-600",   sign: "+" },
                { label: "خصومات إضافية",        val: -deductTotal,           color: "text-red-600",       sign: "-" },
              ].map(({ label, val, color, sign }) => (
                <div key={label} className="flex justify-between items-center text-xs border-b border-border pb-1">
                  <span className="text-muted-foreground">{label}</span>
                  <span className={`font-bold ${color}`}>{sign}{fmt(Math.abs(val))}</span>
                </div>
              ))}
              <div className="flex justify-between items-center pt-1">
                <span className="font-bold text-sm">صافي المرتب</span>
                <span className={`text-lg font-black ${netSalary >= monthlySalary ? "text-emerald-600" : "text-amber-600"}`}>
                  {fmt(netSalary)}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground pt-1">
                أيام العمل الفعلية: <strong>{workedDays}</strong> من <strong>{daysInMonth}</strong> يوم
                {stats.late > 0 && <span> · تأخير: <strong className="text-amber-600">{stats.late} مرة</strong></span>}
              </div>
            </CardContent>
          </Card>

          {/* إضافة بونص أو خصم */}
          {isAdmin && (
            <Card className="border-border">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Gift className="w-4 h-4 text-primary" />
                  إضافة بونص / خصم
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                <div className="flex gap-2">
                  <Button size="sm" variant={adjType === "bonus" ? "default" : "outline"}
                    className="h-7 text-xs flex-1 gap-1" onClick={() => setAdjType("bonus")}>
                    <Gift className="w-3 h-3" />بونص
                  </Button>
                  <Button size="sm" variant={adjType === "deduction" ? "destructive" : "outline"}
                    className="h-7 text-xs flex-1 gap-1" onClick={() => setAdjType("deduction")}>
                    <MinusCircle className="w-3 h-3" />خصم
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[10px]">المبلغ (ج.م)</Label>
                    <Input type="number" min="0" placeholder="500" value={adjAmount}
                      onChange={e => setAdjAmount(e.target.value)} className="h-8 text-xs mt-1" />
                  </div>
                  <div>
                    <Label className="text-[10px]">السبب</Label>
                    <Input placeholder="مكافأة أداء..." value={adjReason}
                      onChange={e => setAdjReason(e.target.value)} className="h-8 text-xs mt-1" />
                  </div>
                </div>
                <Button size="sm" className="h-7 text-xs w-full gap-1" onClick={handleAddAdjustment} disabled={savingAdj}>
                  <Plus className="w-3 h-3" />{savingAdj ? "جاري الحفظ..." : "إضافة"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* قائمة البونص والخصومات */}
          {adjustments.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-bold text-muted-foreground">البونص والخصومات</p>
              {adjustments.map(adj => (
                <div key={adj.id} className={`rounded-lg px-3 py-2 text-xs border ${adj.type === "bonus" ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"}`}>
                  {/* السطر الأول: الأيقونة + المبلغ + زر الحذف */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {adj.type === "bonus"
                        ? <Gift className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        : <MinusCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />}
                      <span className={`font-bold text-sm ${adj.type === "bonus" ? "text-emerald-600" : "text-red-600"}`}>
                        {adj.type === "bonus" ? "+" : "-"}{fmt(adj.amount)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {adj.type === "bonus" ? "بونص" : "خصم"}
                      </span>
                    </div>
                    {isAdmin && (
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDeleteAdj(adj.id)}>
                        <X className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  {/* السطر الثاني: السبب */}
                  {adj.reason && (
                    <p className="text-[11px] text-muted-foreground mt-1 pr-5 leading-snug">
                      {adj.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Daily Tracker Tab ───────────────────────────────────────────────────────
function DailyTrackerTab({ profileId }: { profileId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [logValues, setLogValues] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const { data: dailyData, isLoading, refetch } = useQuery({
    queryKey: ["employee-daily-logs", profileId, selectedDate],
    queryFn: () => employeeApi.getDailyLogs(profileId, selectedDate),
  });

  const { data: weekData } = useQuery({
    queryKey: ["employee-week-logs", profileId, selectedDate],
    queryFn: () => employeeApi.getWeekLogs(profileId, selectedDate),
  });

  useEffect(() => {
    if (!dailyData) return;
    const init: Record<number, string> = {};
    dailyData.kpis.forEach(kpi => {
      if (kpi.metric === "manual" && kpi.actualValue !== null) {
        init[kpi.id] = String(kpi.actualValue);
      }
    });
    setLogValues(init);
  }, [dailyData]);

  const handleSave = async (kpi: DailyKpiEntry) => {
    const val = parseFloat(logValues[kpi.id] ?? "");
    if (isNaN(val)) { toast({ title: "أدخل قيمة صحيحة", variant: "destructive" }); return; }
    setSaving(s => ({ ...s, [kpi.id]: true }));
    try {
      await employeeApi.saveDailyLog({ profileId, kpiId: kpi.id, date: selectedDate, value: val });
      qc.invalidateQueries({ queryKey: ["employee-daily-logs", profileId, selectedDate] });
      qc.invalidateQueries({ queryKey: ["employee-week-logs", profileId, selectedDate] });
      toast({ title: "تم التسجيل ✅" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(s => ({ ...s, [kpi.id]: false }));
    }
  };

  const achievedCount = dailyData?.kpis.filter(k => k.achieved === true).length ?? 0;
  const totalCount = dailyData?.kpis.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Input
          type="date"
          value={selectedDate}
          onChange={e => setSelectedDate(e.target.value)}
          className="w-36 h-7 text-xs"
          max={new Date().toISOString().slice(0, 10)}
        />
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => refetch()}>
          <RefreshCw className="w-3 h-3" />تحديث
        </Button>
        {totalCount > 0 && (
          <Badge variant="outline" className={`text-xs mr-auto ${achievedCount === totalCount ? "border-emerald-700 text-emerald-400" : achievedCount > 0 ? "border-amber-700 text-amber-400" : "border-red-700 text-red-400"}`}>
            {achievedCount}/{totalCount} محقق
          </Badge>
        )}
      </div>

      {isLoading && <p className="text-center text-muted-foreground text-xs py-8 animate-pulse">جاري التحميل...</p>}

      {!isLoading && totalCount === 0 && (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-lg">
          <Target className="w-8 h-8 mx-auto mb-2 opacity-20" />
          <p className="text-sm">لا توجد مؤشرات نشطة.</p>
          <p className="text-xs mt-1">أضف مؤشرات من تاب «مؤشرات الأداء» أولاً.</p>
        </div>
      )}

      <div className="space-y-2">
        {(dailyData?.kpis ?? []).map(kpi => {
          const isManual = kpi.metric === "manual";

          // manual: progress = cumulative / monthly target
          // auto:   progress = today's value / daily target
          const compareValue  = isManual ? ((kpi as any).cumulativeValue ?? 0) : (kpi.actualValue ?? 0);
          const compareTarget = kpi.dailyTarget; // backend already sets correct target per type
          const rawPct = compareTarget > 0
            ? Math.min(100, (compareValue / compareTarget) * 100)
            : 0;
          const pct = kpi.direction === "lower_is_better"
            ? (kpi.achieved ? 100 : Math.max(0, 100 - rawPct))
            : rawPct;

          const todayValue      = (kpi as any).todayValue as number | null;
          const cumulativeValue = (kpi as any).cumulativeValue as number | null;

          // الهدف اليومي الثابت = الهدف الشهري / 30
          const dailyFixed = Math.max(1, Math.round(kpi.targetValue / 30));
          // المتوقع حتى اليوم = (الهدف الشهري / 30) * رقم اليوم المختار
          const selectedDayNum = new Date(selectedDate + "T00:00:00").getDate();
          const dailyExpected = isManual
            ? Math.round((kpi.targetValue / 30) * selectedDayNum)
            : dailyFixed;

          return (
            <Card key={kpi.id} className={`border ${kpi.achieved === true ? "border-emerald-700/50 bg-emerald-950/10" : kpi.achieved === false ? "border-red-800/30" : "border-border"}`}>
              <CardContent className="px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {kpi.achieved === true
                      ? <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                      : kpi.achieved === false
                        ? <X className="w-4 h-4 text-red-400 shrink-0" />
                        : <Target className="w-4 h-4 text-muted-foreground shrink-0" />}
                    <p className="text-sm font-bold break-words leading-tight" title={kpi.name}>{kpi.name}</p>
                    {!isManual && <Badge variant="outline" className="text-[8px] h-3.5 shrink-0">تلقائي</Badge>}
                    {isManual && <Badge variant="outline" className="text-[8px] h-3.5 shrink-0 border-blue-700/50 text-blue-400">متراكم</Badge>}
                  </div>
                  <Badge variant="outline" className={`text-[9px] shrink-0 ${kpi.achieved === true ? "border-emerald-700 text-emerald-400" : kpi.achieved === false ? "border-red-700 text-red-400" : "border-border text-muted-foreground"}`}>
                    {kpi.achieved === true ? "✅ محقق" : kpi.achieved === false ? "❌ لم يُحقَّق" : "غير مسجل"}
                  </Badge>
                </div>

                <Progress value={pct} className={`h-1.5 ${kpi.achieved === true ? "[&>div]:bg-emerald-500" : kpi.achieved === false ? "[&>div]:bg-red-400" : "[&>div]:bg-primary"}`} />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {/* الهدف الشهري */}
                  <div className="rounded-lg border border-border/50 bg-muted/10 px-3 py-2 text-center">
                    <p className="text-[9px] text-muted-foreground mb-0.5">{"\u0627\u0644\u0647\u062f\u0641 \u0627\u0644\u0634\u0647\u0631\u064a"}</p>
                    <p className="text-sm font-black text-foreground">{fmtNum(kpi.targetValue)}</p>
                    <p className="text-[9px] text-muted-foreground/60">{kpi.unit}</p>
                  </div>
                  {/* الهدف اليومي */}
                  <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-center">
                    <p className="text-[9px] text-muted-foreground mb-0.5">{"\u0627\u0644\u0647\u062f\u0641 \u0627\u0644\u064a\u0648\u0645\u064a"}</p>
                    <p className="text-sm font-black text-blue-400">{fmtNum(dailyFixed)}</p>
                    <p className="text-[9px] text-muted-foreground/60">{kpi.unit}</p>
                  </div>
                  {/* المتراكم */}
                  <div className={`rounded-lg border px-3 py-2 text-center ${
                    isManual
                      ? cumulativeValue !== null && cumulativeValue >= kpi.dailyTarget
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-amber-500/20 bg-amber-500/5"
                      : kpi.actualValue !== null && kpi.actualValue >= kpi.dailyTarget
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-amber-500/20 bg-amber-500/5"
                  }`}>
                    <p className="text-[9px] text-muted-foreground mb-0.5">{isManual ? "\u0627\u0644\u0645\u062a\u0631\u0627\u0643\u0645" : "\u0627\u0644\u0645\u062d\u0642\u0642"}</p>
                    <p className={`text-sm font-black ${
                      isManual
                        ? cumulativeValue !== null && cumulativeValue >= kpi.dailyTarget ? "text-emerald-400" : "text-amber-400"
                        : kpi.actualValue !== null && kpi.actualValue >= kpi.dailyTarget ? "text-emerald-400" : "text-amber-400"
                    }`}>
                      {isManual
                        ? (cumulativeValue !== null ? fmtNum(cumulativeValue) : "—")
                        : (kpi.actualValue !== null ? fmtNum(kpi.actualValue) : "—")}
                    </p>
                    <p className="text-[9px] text-muted-foreground/60">{kpi.unit}</p>
                  </div>
                  {/* المتوقع حتى اليوم */}
                  <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-center">
                    <p className="text-[9px] text-muted-foreground mb-0.5">{"\u0627\u0644\u0645\u062a\u0648\u0642\u0639 \u062d\u062a\u0649 \u0627\u0644\u064a\u0648\u0645"}</p>
                    <p className="text-sm font-black text-violet-400">{fmtNum(dailyExpected)}</p>
                    <p className="text-[9px] text-muted-foreground/60">{kpi.unit}</p>
                  </div>
                </div>

                {isManual && (
                  todayValue !== null ? (
                    <div className="flex items-center gap-2 pt-0.5 rounded-lg border border-emerald-700/40 bg-emerald-950/20 px-3 py-2">
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="text-[11px] text-emerald-400 font-semibold">{"\u062a\u0645 \u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u064a\u0648\u0645: "}{fmtNum(todayValue)} {kpi.unit}</span>
                      <span className="text-[10px] text-muted-foreground/50 mr-auto">{"\u0644\u0627 \u064a\u0645\u0643\u0646 \u0627\u0644\u062a\u0639\u062f\u064a\u0644 \u0628\u0639\u062f \u0627\u0644\u062a\u0633\u062c\u064a\u0644"}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-0.5">
                      <Input
                        type="number"
                        min="0"
                        value={logValues[kpi.id] ?? ""}
                        onChange={e => setLogValues(v => ({ ...v, [kpi.id]: e.target.value }))}
                        placeholder={`أضف قيمة اليوم (${kpi.unit})`}
                        className="h-7 text-xs flex-1"
                      />
                      <Button
                        size="sm"
                        className="h-7 text-xs gap-1 shrink-0"
                        disabled={saving[kpi.id] || !logValues[kpi.id]}
                        onClick={() => handleSave(kpi)}
                      >
                        <Save className="w-3 h-3" />
                        {saving[kpi.id] ? "..." : "أضف"}
                      </Button>
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {weekData && weekData.kpiWeeks.length > 0 && (
        <div className="pt-2">
          <p className="text-xs font-bold text-muted-foreground mb-3">آخر 7 أيام</p>
          <div className="space-y-3">
            {weekData.kpiWeeks.map(kpiWeek => (
              <div key={kpiWeek.kpiId}>
                <p className="text-[10px] text-muted-foreground mb-1.5">{kpiWeek.kpiName}</p>
                <div className="flex gap-1">
                  {kpiWeek.days.map(day => {
                    const d = new Date(day.date + "T12:00:00");
                    const dayName = d.toLocaleDateString("ar-EG", { weekday: "short" });
                    const isToday = day.date === new Date().toISOString().slice(0, 10);
                    return (
                      <div key={day.date} className={`flex-1 text-center rounded p-1.5 text-[8px] border transition-colors ${
                        day.achieved === true ? "bg-emerald-900/30 border-emerald-700/30 text-emerald-400" :
                        day.achieved === false ? "bg-red-900/20 border-red-700/20 text-red-400" :
                        "bg-muted/20 border-border text-muted-foreground"
                      } ${isToday ? "ring-1 ring-primary/40" : ""}`}>
                        <div className="font-bold text-[9px]">{day.achieved === true ? "✓" : day.achieved === false ? "✗" : "—"}</div>
                        <div className="mt-0.5">{dayName}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Add Member Wizard ────────────────────────────────────────────────────────
function AddMemberWizard({ open, onClose, onSuccess, availableUsers, existingProfiles }: {
  open: boolean; onClose: () => void; onSuccess: (profileId: number) => void;
  availableUsers: AppUser[]; existingProfiles: EmployeeProfile[];
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [mode, setMode] = useState<"system" | "team_only">("system");
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [department, setDepartment] = useState("");
  const [monthlySalary, setMonthlySalary] = useState("0");
  const [hireDate, setHireDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [jobRole, setJobRole] = useState("employee");
  const [teamOnlyAvatar, setTeamOnlyAvatar] = useState<string | null>(null);

  const reset = () => {
    setStep(1); setSaving(false); setSelectedUserId(""); setSelectedUser(null); setMode("system");
    setDisplayName(""); setJobTitle(""); setDepartment(""); setMonthlySalary("0");
    setHireDate(new Date().toISOString().slice(0, 10));
    setJobRole("employee"); setTeamOnlyAvatar(null);
  };

  const handleTeamOnlyAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "الصورة كبيرة جداً", description: "الحد الأقصى 5MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 300;
        let w = img.width, h = img.height;
        if (w > h) { if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; } }
        else { if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; } }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        setTeamOnlyAvatar(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSelectSystemUser = () => {
    if (!selectedUser) {
      toast({ title: "اختر مستخدم أولاً", variant: "destructive" });
      return;
    }
    setStep(2);
  };

  const handleSaveProfile = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      const profile = await employeeApi.upsertProfile({
        userId: selectedUser.id,
        displayName: selectedUser.displayName,
        jobTitle: jobTitle || null,
        department: department || null,
        monthlySalary: parseFloat(monthlySalary) || 0,
        hireDate: hireDate || null,
      });
      qc.invalidateQueries({ queryKey: ["employee-profiles"] });
      toast({ title: `تم إضافة ${selectedUser.displayName} للفريق ✅` });
      reset(); onSuccess(profile.id);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleSystemUserChange = (value: string) => {
    setSelectedUserId(value);
    const user = availableUsers.find(u => String(u.id) === value) ?? null;
    setSelectedUser(user);
    setDisplayName(user?.displayName ?? "");
    setJobRole(user?.role ?? "employee");
    const existingProfile = user ? existingProfiles.find(p => p.userId === user.id) ?? null : null;
    setJobTitle(existingProfile?.jobTitle ?? user?.jobTitle ?? "");
    setDepartment(existingProfile?.department ?? user?.department ?? "");
    setMonthlySalary(existingProfile?.monthlySalary?.toString() ?? "0");
    setHireDate(existingProfile?.hireDate ?? new Date().toISOString().slice(0, 10));
  };

  // Team-only flow: single step — name + job info only
  const handleCreateTeamOnly = async () => {
    if (!displayName.trim()) {
      toast({ title: "الاسم مطلوب", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      const profile = await employeeApi.createProfile({
        displayName: displayName.trim(),
        jobTitle: jobTitle || null,
        department: department || null,
        monthlySalary: parseFloat(monthlySalary) || 0,
        hireDate: hireDate || null,
        avatar: teamOnlyAvatar || null,
      });
      qc.invalidateQueries({ queryKey: ["employee-profiles"] });
      toast({ title: `تم إضافة ${displayName.trim()} للفريق ✅` });
      reset(); onSuccess(profile.id);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); }}}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-4 h-4 text-primary" />
            إضافة عضو جديد
          </DialogTitle>
        </DialogHeader>

        {/* Mode toggle */}
        {step === 1 && (
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode("system")}
              className={`p-3 rounded-lg border text-xs text-right transition-colors ${mode === "system" ? "border-primary bg-primary/5 text-primary font-bold" : "border-border hover:border-primary/40"}`}
            >
              <div className="font-bold mb-0.5">👤 عضو بحساب</div>
              <div className="text-[10px] text-muted-foreground">يدخل للنظام ويتتبع الطلبيات</div>
            </button>
            <button
              onClick={() => { setMode("team_only"); }}
              className={`p-3 rounded-lg border text-xs text-right transition-colors ${mode === "team_only" ? "border-amber-600 bg-amber-900/10 text-amber-400 font-bold" : "border-border hover:border-amber-700/40"}`}
            >
              <div className="font-bold mb-0.5">🏷️ عضو فريق فقط</div>
              <div className="text-[10px] text-muted-foreground">بدون حساب (مثل office boy)</div>
            </button>
          </div>
        )}

        {/* System user — step 1: account */}
        {mode === "system" && step === 1 && (
          <>
            <div className="flex items-center gap-2 text-[10px]">
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full font-bold bg-primary text-primary-foreground">١ اختيار المستخدم</div>
              <div className="flex-1 h-px bg-border" />
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full font-bold bg-muted text-muted-foreground">٢ بيانات الوظيفة</div>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-bold">اختر المستخدم *</Label>
                <Select value={selectedUserId} onValueChange={handleSystemUserChange}>
                  <SelectTrigger className="h-9 text-xs mt-1">
                    <SelectValue placeholder="اختر مستخدمًا من إدارة المستخدمين" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUsers.map(user => {
                      const linked = existingProfiles.some(p => p.userId === user.id);
                      return (
                        <SelectItem key={user.id} value={String(user.id)}>
                          <div className="flex flex-col items-start gap-0.5 w-full">
                            <span className="truncate font-medium">{user.displayName}</span>
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              @{user.username} · {user.role}{linked ? " · مضاف" : ""}
                            </span>
                            {(user.jobTitle || user.department) && (
                              <span className="text-[10px] text-primary/70 truncate">
                                {user.jobTitle || "—"}{user.department ? ` — ${user.department}` : ""}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {selectedUser && (
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold truncate">{selectedUser.displayName}</div>
                    <Badge variant="outline" className="text-[10px] h-5 px-2 border-primary/30 text-primary">{jobRole}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                    <div className="truncate">اسم المستخدم: <span className="text-foreground font-medium">{selectedUser.username}</span></div>
                    <div className="truncate">الحالة: <span className="text-foreground font-medium">{selectedUser.isActive ? "نشط" : "غير نشط"}</span></div>
                  </div>
                  {(selectedUser.jobTitle || selectedUser.department) && (
                    <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                      <div className="truncate">المسمى: <span className="text-foreground font-medium">{selectedUser.jobTitle || "—"}</span></div>
                      <div className="truncate">القسم: <span className="text-foreground font-medium">{selectedUser.department || "—"}</span></div>
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground">
                    {existingProfiles.some(p => p.userId === selectedUser.id) ? "هذا المستخدم لديه ملف فريق بالفعل — سيتم تحديثه." : "هذا المستخدم غير مضاف للفريق بعد."}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* System user — step 2: job info */}
        {mode === "system" && step === 2 && (
          <>
              <div className="flex items-center gap-2 text-[10px]">
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full font-bold bg-emerald-600/20 text-emerald-400"><Check className="w-3 h-3" /> بيانات الحساب</div>
                <div className="flex-1 h-px bg-border" />
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full font-bold bg-primary text-primary-foreground">٢ بيانات الوظيفة</div>
              </div>
              <div className="space-y-3">
                <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 flex items-center gap-2">
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  تم اختيار <strong>{selectedUser?.displayName}</strong> — الدور: <strong>{jobRole}</strong>
                </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold">المسمى الوظيفي</Label>
                  <Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="مسؤول مبيعات" className="h-8 text-xs mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-bold">القسم</Label>
                  <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="المبيعات" className="h-8 text-xs mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold">الراتب الشهري (ج.م)</Label>
                  <Input type="number" min="0" value={monthlySalary} onChange={e => setMonthlySalary(e.target.value)} className="h-8 text-xs mt-1" />
                </div>
                <div>
                  <Label className="text-xs font-bold">تاريخ التعيين</Label>
                  <Input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} className="h-8 text-xs mt-1" />
                </div>
              </div>
            </div>
          </>
        )}

        {/* Team-only — single step */}
        {mode === "team_only" && (
          <div className="space-y-3">
            <div className="p-2.5 rounded-lg bg-amber-900/10 border border-amber-700/30 text-xs text-amber-400 flex items-center gap-2">
              🏷️ هذا العضو لن يمتلك حساب دخول للنظام — يمكنك تتبع أداؤه يدوياً عبر المؤشرات
            </div>

            {/* Avatar upload */}
            <div className="flex items-center gap-3">
              <div className="relative shrink-0">
                {teamOnlyAvatar ? (
                  <img src={teamOnlyAvatar} className="w-16 h-16 rounded-2xl object-cover border-2 border-amber-600/40" alt="صورة العضو" />
                ) : (
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black bg-amber-900/20 border-2 border-amber-700/30 text-amber-500">
                    {displayName ? displayName.charAt(0).toUpperCase() : "؟"}
                  </div>
                )}
                {teamOnlyAvatar && (
                  <button
                    onClick={() => setTeamOnlyAvatar(null)}
                    className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center text-[10px] hover:bg-destructive/80 transition-colors"
                  >✕</button>
                )}
              </div>
              <div className="flex-1">
                <Label className="text-xs font-bold mb-1 block">صورة العضو (اختياري)</Label>
                <label className="flex items-center gap-2 cursor-pointer h-8 px-3 rounded-lg border border-dashed border-amber-700/40 bg-amber-900/10 hover:bg-amber-900/20 transition-colors text-xs text-amber-400 font-medium">
                  <input type="file" accept="image/*" className="hidden" onChange={handleTeamOnlyAvatarChange} />
                  📷 {teamOnlyAvatar ? "تغيير الصورة" : "رفع صورة"}
                </label>
                <p className="text-[10px] text-muted-foreground mt-1">PNG أو JPG — الحد الأقصى 5MB</p>
              </div>
            </div>

            <div>
              <Label className="text-xs font-bold">الاسم الكامل *</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="أحمد الساعي" className="h-8 text-xs mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">المسمى الوظيفي</Label>
                <Input value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="office boy" className="h-8 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-xs font-bold">القسم</Label>
                <Input value={department} onChange={e => setDepartment(e.target.value)} placeholder="الإدارة" className="h-8 text-xs mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-bold">الراتب الشهري (ج.م)</Label>
                <Input type="number" min="0" value={monthlySalary} onChange={e => setMonthlySalary(e.target.value)} className="h-8 text-xs mt-1" />
              </div>
              <div>
                <Label className="text-xs font-bold">تاريخ التعيين</Label>
                <Input type="date" value={hireDate} onChange={e => setHireDate(e.target.value)} className="h-8 text-xs mt-1" />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {mode === "system" && step === 1 && (
            <>
              <Button variant="outline" onClick={() => { reset(); onClose(); }} className="text-xs h-7">إلغاء</Button>
              <Button onClick={handleSelectSystemUser} disabled={saving || !selectedUserId} className="text-xs h-7 gap-1">
                {saving ? "..." : <><Check className="w-3 h-3" />التالي</>}
              </Button>
            </>
          )}
          {mode === "system" && step === 2 && (
            <>
              <Button variant="outline" onClick={() => setStep(1)} className="text-xs h-7">رجوع</Button>
              <Button onClick={handleSaveProfile} disabled={saving} className="text-xs h-7 gap-1">
                {saving ? "..." : <><Users className="w-3 h-3" />إضافة للفريق</>}
              </Button>
            </>
          )}
          {mode === "team_only" && (
            <>
              <Button variant="outline" onClick={() => { reset(); onClose(); }} className="text-xs h-7">إلغاء</Button>
              <Button onClick={handleCreateTeamOnly} disabled={saving || !displayName.trim()} className="text-xs h-7 gap-1 bg-amber-600 hover:bg-amber-700 text-white">
                {saving ? "..." : <><Users className="w-3 h-3" />إضافة للفريق</>}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Star Employees Section (عرض للجميع في لوحتي) ──────────────────────────
function StarEmployeesSection({ currentMonth: _cm }: { currentMonth: string }) {
  const { data: stars = [], isLoading } = useQuery({
    queryKey: ["star-employees"],
    queryFn: () => employeeApi.getStarEmployees(),
  });

  const rankIcons = [
    <Crown key="1" className="w-5 h-5 text-yellow-400" />,
    <Medal key="2" className="w-5 h-5 text-slate-300" />,
    <Award key="3" className="w-5 h-5 text-amber-600" />,
  ];
  const rankColors = [
    "from-yellow-500/20 to-yellow-600/5 border-yellow-500/30",
    "from-slate-400/20 to-slate-500/5 border-slate-400/30",
    "from-amber-600/20 to-amber-700/5 border-amber-600/30",
  ];
  const rankLabels = ["🥇 الأول", "🥈 الثاني", "🥉 الثالث"];

  if (isLoading || stars.length === 0) return null;

  return (
    <div className="rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/5 to-transparent p-4 mb-3">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-yellow-400" />
        <span className="text-sm font-bold text-yellow-300">موظفو الشهر المتميزون</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {stars.slice(0, 3).map((emp: any, i: number) => (
          <div key={emp.id}
            className={`relative rounded-xl border bg-gradient-to-br ${rankColors[i]} p-3 flex flex-col items-center gap-1.5 text-center`}>
            <div className="absolute -top-2 -right-1">{rankIcons[i]}</div>
            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white/10 bg-muted shrink-0">
              {emp.avatar
                ? <img src={emp.avatar} className="w-full h-full object-cover" alt={emp.displayName} />
                : <div className="w-full h-full flex items-center justify-center text-lg font-bold"
                    style={{ background: "linear-gradient(135deg,hsl(var(--primary)/0.7),hsl(var(--primary)/0.3))" }}>
                    {emp.displayName?.charAt(0)?.toUpperCase()}
                  </div>}
            </div>
            <p className="text-xs font-bold leading-tight">{emp.displayName}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{emp.jobTitle ?? emp.department ?? ""}</p>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: i === 0 ? "rgba(234,179,8,0.2)" : i === 1 ? "rgba(148,163,184,0.2)" : "rgba(180,83,9,0.2)",
                       color: i === 0 ? "#fbbf24" : i === 1 ? "#cbd5e1" : "#d97706" }}>
              {rankLabels[i]}
            </span>
          </div>
        ))}
      </div>
      <p className="text-center text-[10px] text-muted-foreground mt-2">
        🌟 هؤلاء الموظفون حققوا أعلى الأهداف هذا الشهر — استمر في التميز!
      </p>
    </div>
  );
}

// ─── Star Employees Manage Tab (للسوبر أدمن فقط) ─────────────────────────────
function StarEmployeesManageTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [rankMonth, setRankMonth] = useState(currentMonth);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);

  const { data: stars = [], isLoading: starsLoading } = useQuery({
    queryKey: ["star-employees"],
    queryFn: () => employeeApi.getStarEmployees(),
  });

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ["list-profiles"],
    queryFn: () => employeeApi.listProfiles(),
  });

  const { data: ranking = [], isLoading: rankLoading } = useQuery({
    queryKey: ["team-ranking-local", rankMonth, profiles.map((p: any) => p.id).join(",")],
    enabled: profiles.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        profiles.map(async (p: any) => {
          try {
            const report = await employeeApi.getReport(p.id, rankMonth);
            const score = report?.overallScore ?? null;
            return {
              id: p.id,
              displayName: p.displayName,
              jobTitle: p.jobTitle,
              department: p.department,
              avatar: p.avatar,
              overallScore: score,
              achievedCount: report?.kpis?.filter((k: any) => k.achieved === true).length ?? 0,
              totalKpis: report?.kpis?.length ?? 0,
            };
          } catch {
            return {
              id: p.id,
              displayName: p.displayName,
              jobTitle: p.jobTitle,
              department: p.department,
              avatar: p.avatar,
              overallScore: null,
              achievedCount: 0,
              totalKpis: 0,
            };
          }
        })
      );
      return results.sort((a, b) => {
        if (a.overallScore === null && b.overallScore === null) return 0;
        if (a.overallScore === null) return 1;
        if (b.overallScore === null) return -1;
        return b.overallScore - a.overallScore;
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (ids: number[]) => employeeApi.setStarEmployees(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["star-employees"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      toast({ title: "✅ تم حفظ موظفي الشهر المتميزين" });
    },
  });

  useEffect(() => {
    if (stars.length > 0) setSelectedIds(stars.map((s: any) => s.id));
  }, [stars]);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 3 ? [...prev, id] : prev
    );
  };

  const rankIcons = [
    <Crown key="1" className="w-5 h-5 text-yellow-400" />,
    <Medal key="2" className="w-5 h-5 text-slate-300" />,
    <Award key="3" className="w-5 h-5 text-amber-600" />,
  ];
  const rankColors = [
    "from-yellow-500/20 to-yellow-600/5 border-yellow-500/30",
    "from-slate-400/20 to-slate-500/5 border-slate-400/30",
    "from-amber-600/20 to-amber-700/5 border-amber-600/30",
  ];
  const rankLabels = ["🥇 الأول", "🥈 الثاني", "🥉 الثالث"];

  const monthLabel = new Date(parseInt(rankMonth.split("-")[0]), parseInt(rankMonth.split("-")[1]) - 1, 1)
    .toLocaleDateString("ar-EG", { month: "long", year: "numeric" });

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      {/* ── Header ── */}
      <div className="rounded-2xl border border-yellow-500/20 bg-gradient-to-br from-yellow-500/8 to-transparent p-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-yellow-400" />
            <div>
              <p className="text-sm font-bold">اختيار موظفي الشهر المتميزين</p>
              <p className="text-[11px] text-muted-foreground">اختر حتى 3 موظفين — ستظهر بطاقاتهم لجميع الموظفين تلقائياً</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-muted-foreground whitespace-nowrap">الشهر:</Label>
            <Input type="month" value={rankMonth} onChange={e => setRankMonth(e.target.value)}
              className="h-8 text-xs bg-background border-border w-36" />
          </div>
        </div>
      </div>

      {/* ── النجوم المختارون حالياً ── */}
      {stars.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-yellow-400" />
            النجوم المحفوظون حالياً
          </p>
          <div className="grid grid-cols-3 gap-2">
            {stars.slice(0, 3).map((emp: any, i: number) => (
              <div key={emp.id}
                className={`relative rounded-xl border bg-gradient-to-br ${rankColors[i]} p-2.5 flex flex-col items-center gap-1 text-center`}>
                <div className="absolute -top-1.5 -right-1">{rankIcons[i]}</div>
                <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-white/10 bg-muted shrink-0">
                  {emp.avatar
                    ? <img src={emp.avatar} className="w-full h-full object-cover" alt={emp.displayName} />
                    : <div className="w-full h-full flex items-center justify-center text-sm font-bold"
                        style={{ background: "linear-gradient(135deg,hsl(var(--primary)/0.7),hsl(var(--primary)/0.3))" }}>
                        {emp.displayName?.charAt(0)?.toUpperCase()}
                      </div>}
                </div>
                <p className="text-[11px] font-bold leading-tight">{emp.displayName}</p>
                <p className="text-[9px] text-muted-foreground">{emp.jobTitle ?? emp.department ?? ""}</p>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: i === 0 ? "rgba(234,179,8,0.2)" : i === 1 ? "rgba(148,163,184,0.2)" : "rgba(180,83,9,0.2)",
                           color: i === 0 ? "#fbbf24" : i === 1 ? "#cbd5e1" : "#d97706" }}>
                  {rankLabels[i]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Ranking ── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border/60 bg-muted/20 flex items-center justify-between">
          <p className="text-xs font-semibold flex items-center gap-1.5">
            <BarChart2 className="w-3.5 h-3.5 text-primary" />
            ترتيب الموظفين — {monthLabel}
          </p>
          <span className="text-[10px] text-muted-foreground">{selectedIds.length}/3 مختارين</span>
        </div>

        {(profilesLoading || rankLoading) ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground text-sm gap-2">
            <RefreshCw className="w-4 h-4 animate-spin" />
            جاري تحميل بيانات الموظفين...
          </div>
        ) : ranking.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
            <BarChart2 className="w-8 h-8 opacity-30" />
            <p className="text-sm">لا يوجد موظفون</p>
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {ranking.map((emp: any, i: number) => {
              const isSelected = selectedIds.includes(emp.id);
              const rank = i + 1;
              const score = emp.overallScore;
              const scoreColor = score === null ? "text-muted-foreground" : score >= 90 ? "text-emerald-400" : score >= 70 ? "text-blue-400" : score >= 50 ? "text-yellow-400" : "text-red-400";
              const barColor = score === null ? "bg-muted" : score >= 90 ? "bg-emerald-500" : score >= 70 ? "bg-blue-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";

              return (
                <div key={emp.id}
                  onClick={() => toggleSelect(emp.id)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-all hover:bg-muted/30 ${
                    isSelected ? "bg-primary/5 border-r-2 border-r-primary" : ""
                  }`}>
                  {/* rank badge */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                    rank === 1 ? "bg-yellow-500/20 text-yellow-400" :
                    rank === 2 ? "bg-slate-400/20 text-slate-300" :
                    rank === 3 ? "bg-amber-600/20 text-amber-500" : "bg-muted text-muted-foreground"
                  }`}>
                    {rank <= 3 ? rankIcons[rank - 1] : rank}
                  </div>
                  {/* avatar */}
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-muted shrink-0">
                    {emp.avatar
                      ? <img src={emp.avatar} className="w-full h-full object-cover" alt={emp.displayName} />
                      : <div className="w-full h-full flex items-center justify-center text-sm font-bold"
                          style={{ background: "linear-gradient(135deg,hsl(var(--primary)/0.7),hsl(var(--primary)/0.3))" }}>
                          {emp.displayName?.charAt(0)?.toUpperCase()}
                        </div>}
                  </div>
                  {/* info + progress */}
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold truncate">{emp.displayName}</p>
                      <span className={`text-sm font-black shrink-0 ${scoreColor}`}>
                        {score !== null ? `${score}%` : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${barColor}`}
                          style={{ width: `${Math.min(100, score ?? 0)}%` }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground shrink-0 tabular-nums">
                        {emp.achievedCount}/{emp.totalKpis} مؤشر
                      </span>
                    </div>
                    {emp.jobTitle && <p className="text-[10px] text-muted-foreground truncate">{emp.jobTitle}</p>}
                  </div>
                  {/* checkbox */}
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${
                    isSelected ? "border-primary bg-primary" : "border-border"
                  }`}>
                    {isSelected && <Check className="w-3 h-3 text-white" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Actions ── */}
      <div className="flex gap-2">
        <Button className={`flex-1 h-10 text-sm font-bold transition-all ${saved ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
          onClick={() => saveMutation.mutate(selectedIds)}
          disabled={saveMutation.isPending || selectedIds.length === 0}>
          {saveMutation.isPending ? (
            <><RefreshCw className="w-4 h-4 ml-2 animate-spin" />جاري الحفظ...</>
          ) : saved ? (
            <><CheckCircle2 className="w-4 h-4 ml-2" />تم الحفظ!</>
          ) : (
            <><Trophy className="w-4 h-4 ml-2" />حفظ النجوم ({selectedIds.length}/3)</>
          )}
        </Button>
        {(selectedIds.length > 0 || stars.length > 0) && (
          <Button variant="outline" size="sm" className="h-10 px-4 text-xs border-red-500/30 text-red-400 hover:bg-red-500/10"
            onClick={() => { setSelectedIds([]); saveMutation.mutate([]); }}>
            مسح الكل
          </Button>
        )}
      </div>

      {selectedIds.length > 0 && !saved && (
        <p className="text-center text-[11px] text-muted-foreground">
          💡 بعد الحفظ ستظهر بطاقات النجوم تلقائياً في لوحة كل موظف
        </p>
      )}
    </div>
  );
}


// ─── My Dashboard Tab ────────────────────────────────────────────────────────
export function MyDashboardTab({ profileId, monthlySalary }: {
  profileId: number; monthlySalary: number;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);

  // ── Toggle يومي/شهري ──
  const [viewMode, setViewMode] = useState<"monthly" | "daily">("daily");
  const [selectedDate, setSelectedDate] = useState(today);

  // daily report للتاريخ المختار
  const { data: dailyReport } = useQuery({
    queryKey: ["employee-report-daily", profileId, selectedDate],
    queryFn: () => employeeApi.getReport(profileId, undefined, "daily", selectedDate),
    enabled: viewMode === "daily",
    staleTime: 60_000,
  });

  // daily KPIs for selected date
  const { data: dailyData } = useQuery({
    queryKey: ["employee-daily-logs", profileId, selectedDate],
    queryFn: () => employeeApi.getDailyLogs(profileId, selectedDate),
    staleTime: 60_000,
  });
  const dailyKpis = ((dailyData as any)?.kpis ?? []) as any[];

  const prevMonthDate = new Date();
  prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
  const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const { data: report } = useQuery({
    queryKey: ["employee-report", profileId, currentMonth],
    queryFn: () => employeeApi.getReport(profileId, currentMonth),
  });
  const { data: prevReport } = useQuery({
    queryKey: ["employee-report", profileId, prevMonth],
    queryFn: () => employeeApi.getReport(profileId, prevMonth),
  });
  const { data: salaryReport } = useQuery({
    queryKey: ["salary-report", profileId, currentMonth],
    queryFn: () => attendanceApi.salaryReport(profileId, currentMonth),
    enabled: !!profileId,
  });

  const kpis            = (viewMode === "daily" ? (dailyKpis.length > 0 ? dailyKpis : dailyReport?.kpis) : report?.kpis) ?? [];

  // في daily mode: احسب overallScore من dailyKpis (getDailyLogs) — نفس اللي بيتعرض تحت
  // في monthly mode: خد من الـ report
  const dailyOverallScore = (() => {
    if (viewMode !== "daily" || dailyKpis.length === 0) return null;
    const scored = dailyKpis.filter((k:any) => k.score !== null && Number.isFinite(k.score));
    if (scored.length === 0) return null;
    const totalW = scored.reduce((s:number, k:any) => s + (k.weight ?? 0), 0);
    return totalW > 0
      ? Math.round(scored.reduce((s:number, k:any) => s + (k.score * (k.weight ?? 0)), 0) / totalW)
      : Math.round(scored.reduce((s:number, k:any) => s + k.score, 0) / scored.length);
  })();
  const overallScore = viewMode === "daily"
    ? (dailyOverallScore ?? dailyReport?.overallScore ?? null)
    : (report?.overallScore ?? null);
  const prevScore  = prevReport?.overallScore ?? null;
  const scoreDiff  = overallScore !== null && prevScore !== null && prevScore > 0 ? overallScore - prevScore : null;
  const activeReport    = viewMode === "daily" ? dailyReport : report;
  const achievedCount   = kpis.filter(k => k.achieved === true).length;
  const failedCount     = kpis.filter(k => k.achieved === false).length;
  const overTargetCount = kpis.filter(k => k.score !== null && k.score > 100).length;
  const totalKpis       = kpis.length;
  const baseSalary      = salaryReport?.baseSalary ?? monthlySalary;
  const kpiDeductions   = kpis
    .filter(k => k.achieved === false && (k.salaryWeight ?? 0) > 0)
    .reduce((sum, k) => sum + Math.round(((k.salaryWeight ?? 0) / 100) * baseSalary), 0);
  const kpiBonuses = kpis
    .filter(k => k.score !== null && k.score > 100 && (k.overtargetBonus ?? 0) > 0)
    .reduce((sum, k) => sum + Math.round(((k.overtargetBonus ?? 0) / 100) * baseSalary), 0);
  const workedDays       = salaryReport?.workedDays ?? 0;
  const totalWorkingDays = salaryReport?.totalWorkingDays ?? 26;
  const absentDays       = salaryReport?.absentDays ?? 0;
  const lateDays         = salaryReport?.lateDays ?? 0;
  const attPct           = totalWorkingDays > 0 ? Math.round((workedDays / totalWorkingDays) * 100) : 0;
  const daysInMonth        = new Date(parseInt(currentMonth.split("-")[0]), parseInt(currentMonth.split("-")[1]), 0).getDate();
  const dayOfMonth         = new Date().getDate();
  const monthProgress      = Math.round((dayOfMonth / daysInMonth) * 100);
  const isAtRisk           = overallScore !== null && overallScore < 60;
  const isMidMonthWarning  = dayOfMonth >= Math.floor(daysInMonth * 0.4) && dayOfMonth <= Math.floor(daysInMonth * 0.7) && overallScore !== null && overallScore < 50;
  const isExcellent        = overallScore !== null && overallScore >= 90;
  const totalPoints  = Math.round((overallScore ?? 0) * 3.4 + (prevScore ?? 0) * 2.1);
  const level        = totalPoints >= 800 ? "Elite 🏆" : totalPoints >= 500 ? "Gold 🥇" : totalPoints >= 300 ? "Silver 🥈" : "Bronze 🥉";
  const levelColor   = totalPoints >= 800 ? "text-blue-500" : totalPoints >= 500 ? "text-amber-500" : totalPoints >= 300 ? "text-muted-foreground" : "text-amber-700 dark:text-amber-500";
  const nextLevelPts = totalPoints >= 800 ? 1000 : totalPoints >= 500 ? 800 : totalPoints >= 300 ? 500 : 300;
  const levelPct     = Math.min(100, Math.round((totalPoints / nextLevelPts) * 100));
  const periodLabel  = viewMode === "daily"
    ? new Date(selectedDate + "T00:00:00").toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : new Date(parseInt(currentMonth.split("-")[0]), parseInt(currentMonth.split("-")[1]) - 1, 1)
        .toLocaleDateString("ar-EG", { month: "long", year: "numeric" });
  const statusColor = overallScore === null ? "text-muted-foreground" : overallScore >= 80 ? "text-emerald-500" : overallScore >= 60 ? "text-amber-500" : "text-red-500";
  const statusBg    = overallScore === null ? "bg-muted/20 border-border" : overallScore >= 80 ? "bg-emerald-500/8 border-emerald-500/20" : overallScore >= 60 ? "bg-amber-500/8 border-amber-500/20" : "bg-red-500/8 border-red-500/20";
  const statusLabel = overallScore === null ? "لا يوجد بيانات" : overallScore >= 90 ? "أداء استثنائي ⭐" : overallScore >= 80 ? "أداء ممتاز ✅" : overallScore >= 60 ? "أداء جيد 👍" : overallScore >= 40 ? "يحتاج تحسين ⚠️" : "أداء ضعيف — خطر ❌";

  return (
    <div className="space-y-4 animate-in fade-in duration-300">

      {/* ── موظفو الشهر المتميزون ── */}
      <StarEmployeesSection currentMonth={currentMonth} />

      {/* ── توصيتك الذكية ── */}
      {overallScore !== null && (
        <div className={`rounded-2xl border px-4 py-4 space-y-2 ${
          overallScore >= 90 ? "bg-emerald-500/8 border-emerald-500/20" :
          overallScore >= 70 ? "bg-amber-500/8 border-amber-500/20" :
          "bg-red-500/8 border-red-500/20"
        }`}>
          <div className="flex items-center gap-2">
            <Briefcase className={`w-4 h-4 shrink-0 ${overallScore >= 90 ? "text-emerald-500" : overallScore >= 70 ? "text-amber-500" : "text-red-500"}`} />
            <p className="text-xs font-bold">{"\u062a\u0648\u0635\u064a\u062a\u0643 \u0627\u0644\u0630\u0643\u064a\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0634\u0647\u0631"}</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {overallScore >= 90 ? "\uD83C\uDF1F \u0623\u062f\u0627\u0624\u0643 \u0647\u0630\u0627 \u0627\u0644\u0634\u0647\u0631 \u0627\u0633\u062a\u062b\u0646\u0627\u0626\u064a! \u0627\u0633\u062a\u0645\u0631 \u0639\u0644\u0649 \u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u062a\u0648\u0649 \u0648\u0634\u0627\u0631\u0643 \u062e\u0628\u0631\u062a\u0643 \u0645\u0639 \u0632\u0645\u0644\u0627\u0626\u0643 \u0644\u062a\u0639\u0632\u064a\u0632 \u0627\u0644\u0641\u0631\u064a\u0642." :
             overallScore >= 80 ? "\u2705 \u0623\u062f\u0627\u0621 \u0642\u0648\u064a\u060c \u0623\u0646\u062a \u0639\u0644\u0649 \u0627\u0644\u0645\u0633\u0627\u0631 \u0627\u0644\u0635\u062d\u064a\u062d. \u062d\u0627\u0648\u0644 \u062a\u062d\u0633\u064a\u0646 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062a \u0627\u0644\u0623\u0642\u0644 \u0644\u062a\u0635\u0644 \u0644\u0644\u0642\u0645\u0629 \u0627\u0644\u0634\u0647\u0631 \u0627\u0644\u0642\u0627\u062f\u0645." :
             overallScore >= 70 ? "\uD83D\uDC4D \u0623\u062f\u0627\u0621 \u062c\u064a\u062f \u0644\u0643\u0646 \u0641\u064a\u0647 \u0645\u0633\u0627\u062d\u0629 \u0644\u0644\u062a\u0645\u064a\u0632. \u0631\u0627\u062c\u0639 \u0627\u0644\u0645\u0624\u0634\u0631\u0627\u062a \u0627\u0644\u0644\u064a \u062a\u062d\u062a \u0627\u0644\u0647\u062f\u0641 \u0648\u0631\u0643\u0632 \u0639\u0644\u064a\u0647\u0627 \u0627\u0644\u0623\u0633\u0628\u0648\u0639 \u0627\u0644\u062c\u0627\u064a." :
             overallScore >= 50 ? "\u26A0\uFE0F \u0623\u062f\u0627\u0624\u0643 \u062a\u062d\u062a \u0627\u0644\u0645\u0633\u062a\u0647\u062f\u0641 \u0647\u0630\u0627 \u0627\u0644\u0634\u0647\u0631. \u062d\u062f\u062f \u0633\u0628\u0628 \u0627\u0644\u062a\u0631\u0627\u062c\u0639 \u0648\u0636\u0639 \u0644\u0646\u0641\u0633\u0643 \u062e\u0637\u0629 \u064a\u0648\u0645\u064a\u0629 \u0644\u0644\u062a\u062d\u0633\u064a\u0646." :
             "\uD83D\uDD34 \u0647\u0630\u0627 \u0627\u0644\u0634\u0647\u0631 \u0635\u0639\u0628\u060c \u0644\u0643\u0646 \u0643\u0644 \u064a\u0648\u0645 \u0641\u0631\u0635\u0629 \u062c\u062f\u064a\u062f\u0629. \u062a\u0648\u0627\u0635\u0644 \u0645\u0639 \u0645\u062f\u064a\u0631\u0643 \u0644\u0648\u0636\u0639 \u062e\u0637\u0629 \u0639\u0645\u0644\u064a\u0629 \u0644\u0644\u0646\u0647\u0648\u0636 \u0628\u0623\u062f\u0627\u0626\u0643."}
          </p>
        </div>
      )}

      {/* ── Toggle يومي / شهري ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-muted/20" dir="rtl">
          {(["daily", "monthly"] as const).map(mode => (
            <button key={mode} type="button" onClick={() => setViewMode(mode)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === mode ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}>
              {mode === "monthly" ? "شهري" : "يومي"}
            </button>
          ))}
        </div>
        {viewMode === "daily" ? (
          <input type="date" value={selectedDate} max={today}
            onChange={e => setSelectedDate(e.target.value)}
            className="rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-primary" />
        ) : (
          <span className="text-xs text-muted-foreground font-medium">{currentMonth}</span>
        )}
      </div>

      {/* ── إشارات الخطر والأمان ── */}
      <div className="space-y-2">
        {isExcellent && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/8 px-3.5 py-2.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span><strong>أداء ممتاز هذا الشهر!</strong>{kpiBonuses > 0 && <span> مكافأة Over Target: <strong>{fmt(kpiBonuses)}</strong></span>}</span>
          </div>
        )}
        {isMidMonthWarning && !isExcellent && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/8 px-3.5 py-2.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span><strong>تنبيه منتصف الشهر:</strong> أداؤك الحالي {overallScore}% — تبقى {daysInMonth - dayOfMonth} يوم.</span>
          </div>
        )}
        {isAtRisk && kpiDeductions > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/8 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span><strong>تحذير:</strong> {failedCount} مؤشر لم يتحقق — خصم محتمل: <strong>{fmt(kpiDeductions)}</strong></span>
          </div>
        )}
        {absentDays >= 3 && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-400">
            <UserX className="w-4 h-4 shrink-0" />
            <span><strong>غياب متكرر:</strong> {absentDays} أيام غياب هذا الشهر تؤثر على راتبك.</span>
          </div>
        )}
        {!isAtRisk && !isMidMonthWarning && !isExcellent && absentDays < 3 && overallScore !== null && overallScore >= 60 && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-2.5 text-xs text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>أداؤك في المنطقة الآمنة — استمر على هذا المستوى 💪</span>
          </div>
        )}
      </div>

      {/* ── التقييم الإجمالي + Ring ── */}
      <div className={`rounded-2xl border px-4 py-4 ${statusBg}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="relative w-24 h-24 shrink-0">
            <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
              <circle cx="48" cy="48" r="38" fill="none" stroke="hsl(var(--muted))" strokeWidth="9" />
              <circle cx="48" cy="48" r="38" fill="none"
                stroke={overallScore !== null && overallScore >= 80 ? "#10B981" : overallScore !== null && overallScore >= 60 ? "#F59E0B" : "#EF4444"}
                strokeWidth="9"
                strokeDasharray={`${(overallScore ?? 0) * 2.388} 238.8`}
                strokeLinecap="round" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-xl font-black leading-none ${statusColor}`}>{overallScore !== null ? `${overallScore}%` : "—"}</span>
              <span className="text-[9px] text-muted-foreground mt-0.5">أداؤك</span>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <p className={`text-sm font-bold ${statusColor}`}>{viewMode === "daily" ? statusLabel : overallScore !== null ? `${overallScore}%` : "—"}</p>
            <p className="text-xs text-muted-foreground">{periodLabel}</p>
            {scoreDiff !== null && (
              <div className={`flex items-center gap-1 text-xs font-bold ${scoreDiff >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                {scoreDiff >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                {scoreDiff >= 0 ? "+" : ""}{scoreDiff}% عن الشهر الماضي
              </div>
            )}
            {viewMode === "monthly" && (
            <div>
              <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
                <span>تقدم الشهر</span><span>{monthProgress}%</span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-1.5 rounded-full bg-primary/60 transition-all" style={{ width: `${monthProgress}%` }} />
              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* ── متتبع سرعة الإنجاز ── */}
      {(() => {
        const velKpis = (report?.kpis ?? []).filter((k: any) => k.isActive !== false && k.score !== null && k.score !== undefined);
        if (!velKpis.length) return null;
        const now = new Date();
        const dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const dp = now.getDate();
        const mPct = Math.round((dp / dim) * 100);
        return (
          <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
            {/* ── هيدر ── */}
            <div className="px-5 py-4 flex items-start justify-between gap-3 border-b border-border/50"
              style={{ background: "linear-gradient(135deg, hsl(var(--primary)/0.06) 0%, transparent 60%)" }}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-base">📊</span>
                  <span className="font-black text-base">متتبع سرعة الإنجاز</span>
                </div>
                <p className="text-[11px] text-muted-foreground pr-6">هل ستصل للهدف قبل نهاية الشهر بناءً على معدلك الحالي؟</p>
              </div>
              <div className="flex items-center gap-1.5 bg-muted/40 border border-border/50 rounded-lg px-3 py-1.5 shrink-0">
                <span className="text-[10px] text-muted-foreground">مر</span>
                <span className="text-[11px] font-bold text-foreground">{dp}</span>
                <span className="text-[10px] text-muted-foreground">من</span>
                <span className="text-[11px] font-bold text-foreground">{dim}</span>
                <span className="text-[10px] text-muted-foreground">يوم</span>
                <span className="text-[10px] text-primary font-bold bg-primary/10 rounded-md px-1.5 py-0.5 mr-1">
                  {mPct}%
                </span>
              </div>
            </div>

            {/* ── كروت KPI ── */}
            <div className="p-4 space-y-3">
              {velKpis.map((kpi: any) => {
                const sc        = Math.min(kpi.score ?? 0, 150);
                const projected = mPct > 0 ? Math.min(Math.round((sc / mPct) * 100), 150) : sc;
                const velocity  = Math.round(projected - 100);
                const willReach = projected >= 100;
                const isOT      = sc > 100;

                const accent = isOT
                  ? { bar: "#3b82f6", glow: "rgba(59,130,246,0.3)", proj: "rgba(59,130,246,0.18)", border: "border-blue-500/25", bg: "bg-blue-500/5" }
                  : willReach
                  ? { bar: "#10b981", glow: "rgba(16,185,129,0.3)", proj: "rgba(16,185,129,0.18)", border: "border-emerald-500/25", bg: "bg-emerald-500/5" }
                  : { bar: "#ef4444", glow: "rgba(239,68,68,0.25)",  proj: "rgba(239,68,68,0.12)",  border: "border-red-500/20",     bg: "bg-red-500/5" };

                const badgeLabel = isOT ? "فوق الهدف" : willReach ? "سيصل للهدف" : "يحتاج تسريع";
                const badgeCls   = isOT
                  ? "bg-blue-500/15 text-blue-400 border border-blue-500/40"
                  : willReach
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/40"
                  : "bg-red-500/15 text-red-400 border border-red-500/40";
                const badgeIcon  = isOT ? "🚀" : willReach ? "✅" : "⚡";
                const velColor   = velocity >= 0 ? "#10b981" : "#ef4444";

                return (
                  <div key={kpi.id}
                    className={`rounded-xl border ${accent.border} ${accent.bg} px-4 py-3.5 space-y-3 transition-all duration-200`}>

                    {/* صف العنوان */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[10px] font-bold rounded-full px-2.5 py-0.5 ${badgeCls}`}>
                        {badgeIcon} {badgeLabel}
                      </span>
                      <span className="text-sm font-bold">{kpi.name}</span>
                    </div>

                    {/* Progress bar احترافي */}
                    <div className="space-y-1.5">
                      <div className="relative w-full h-3 rounded-full overflow-hidden"
                        style={{ background: "rgba(255,255,255,0.06)" }}>
                        {/* الجزء المتوقع (خلفي شفاف) */}
                        <div className="absolute inset-y-0 right-0 rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(projected, 100)}%`, background: accent.proj }} />
                        {/* الجزء الفعلي (solid مع glow) */}
                        <div className="absolute inset-y-0 right-0 rounded-full transition-all duration-700"
                          style={{
                            width: `${Math.min(sc, 100)}%`,
                            background: `linear-gradient(90deg, ${accent.bar}cc, ${accent.bar})`,
                            boxShadow: `0 0 8px ${accent.glow}`,
                          }} />
                        {/* خط نقطة الوقت الحالي */}
                        <div className="absolute inset-y-0 w-[2px] rounded-full"
                          style={{ right: `${Math.min(mPct, 100)}%`, background: "rgba(255,255,255,0.5)" }} />
                      </div>

                      {/* أرقام تحت البار */}
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="font-bold" style={{ color: velColor }}>
                          {velocity >= 0 ? "+" : ""}{velocity}% عن المتوقع
                        </span>
                        <span className="text-muted-foreground">
                          توقع الشهر: <strong style={{ color: accent.bar }}>{projected}%</strong>
                        </span>
                        <span className="text-muted-foreground">
                          فعلي: <strong className="text-foreground">{sc}%</strong>
                        </span>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── مصفوفة مخاطر المؤشرات — من KPIs manual فقط ── */}
      {(() => {
        const manualKpis = (report?.kpis ?? []).filter(
          (k: any) => k.isActive !== false && k.metric === "manual" && k.score !== null && k.score !== undefined
        );
        if (!manualKpis.length) return null;

        const now = new Date();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const dayPassed   = now.getDate();
        const monthPct    = Math.round((dayPassed / daysInMonth) * 100);

        type Risk = "high" | "medium" | "low";
        const cfg: Record<Risk, {
          label: string; icon: string;
          barColor: string; glowColor: string;
          cardBg: string; cardBorder: string;
          valueText: string; tagBg: string; tagText: string;
        }> = {
          high:   { label: "خطر عالي", icon: "🔴", barColor: "#ef4444", glowColor: "rgba(239,68,68,0.4)",   cardBg: "linear-gradient(145deg,#1c0a0a,#2d0f0f)", cardBorder: "1px solid rgba(239,68,68,0.35)",  valueText: "#f87171", tagBg: "rgba(239,68,68,0.2)",  tagText: "#fca5a5" },
          medium: { label: "تحذير",    icon: "🟡", barColor: "#f59e0b", glowColor: "rgba(245,158,11,0.4)",  cardBg: "linear-gradient(145deg,#1a1200,#2b1e00)", cardBorder: "1px solid rgba(245,158,11,0.35)", valueText: "#fbbf24", tagBg: "rgba(245,158,11,0.2)", tagText: "#fde68a" },
          low:    { label: "آمن",      icon: "🟢", barColor: "#22c55e", glowColor: "rgba(34,197,94,0.4)",   cardBg: "linear-gradient(145deg,#071a0e,#0c2d18)", cardBorder: "1px solid rgba(34,197,94,0.35)",  valueText: "#4ade80", tagBg: "rgba(34,197,94,0.2)",  tagText: "#86efac" },
        };

        const items = manualKpis.map((k: any) => {
          const sc: number   = k.score as number;
          const projected    = monthPct > 0 ? Math.round((sc / monthPct) * 100) : sc;
          const velocity     = sc - monthPct;
          const isOT         = sc > 100;
          const willReach    = projected >= 100;
          const risk: Risk   = isOT || willReach ? "low" : sc >= monthPct * 0.75 ? "medium" : "high";
          const note         = isOT ? "فوق الهدف" : willReach ? "سيصل للهدف" : sc >= monthPct * 0.75 ? "يحتاج تحسين" : "تحت الحد المطلوب";
          return { label: k.name ?? k.displayName ?? "مؤشر", risk, sc, projected: Math.min(projected, 150), velocity, note, monthPct };
        }).sort((a: any, b: any) => ({ high: 0, medium: 1, low: 2 }[a.risk as Risk] - ({ high: 0, medium: 1, low: 2 }[b.risk as Risk])));

        return (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border/40 flex items-center justify-between"
              style={{ background: "linear-gradient(135deg,rgba(255,255,255,0.04) 0%,transparent 60%)" }}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)" }}>
                  <span className="text-sm">⚠️</span>
                </div>
                <div>
                  <p className="font-black text-sm">مصفوفة مخاطر المؤشرات</p>
                  <p className="text-[10px] text-muted-foreground/60">تصنيف حسب التقدم × التوقع الشهري</p>
                </div>
              </div>
              <span className="text-[9px] text-muted-foreground/60 bg-muted/30 rounded-full px-2 py-0.5">
                مرّ {dayPassed} يوم من {daysInMonth} ({monthPct}%)
              </span>
            </div>
            <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {items.map((item: any, i: number) => {
                const c = cfg[item.risk as Risk];
                return (
                  <div key={i} className="rounded-xl p-4 flex flex-col gap-3 relative overflow-hidden"
                    style={{ background: c.cardBg, border: c.cardBorder }}>
                    <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full opacity-20 pointer-events-none"
                      style={{ background: `radial-gradient(circle, ${c.barColor}, transparent 70%)` }} />
                    <div className="flex items-center justify-between gap-2 relative z-10">
                      <span className="text-[11px] text-white/60 font-medium truncate">{item.label}</span>
                      <span className="text-[9px] font-bold rounded-full px-2 py-0.5 shrink-0"
                        style={{ background: c.tagBg, color: c.tagText }}>{c.icon} {c.label}</span>
                    </div>
                    <div className="flex items-end justify-between gap-2 relative z-10">
                      <span className="text-3xl font-black leading-none" style={{ color: c.valueText }}>{item.sc}%</span>
                      <span className="text-[9px] text-white/40 mb-0.5">توقع نهاية الشهر: {item.projected}%</span>
                    </div>
                    <div className="relative z-10">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                        <div className="h-full rounded-full transition-all duration-700"
                          style={{ width: `${Math.min(item.sc, 100)}%`, background: c.barColor, boxShadow: `0 0 6px ${c.glowColor}` }} />
                      </div>
                      <div className="absolute top-[-4px] w-0.5 h-[14px] rounded-full bg-white/25"
                        style={{ left: `${Math.min(item.monthPct, 100)}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-white/40 relative z-10">
                      <span>{item.note}</span>
                      <span className="font-bold" style={{ color: item.velocity >= 0 ? "#22c55e" : "#ef4444" }}>
                        {item.velocity >= 0 ? "+" : ""}{item.velocity}% عن المتوقع
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
{/* ── بطاقات سريعة ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: "KPI محققة",    val: `${achievedCount}/${totalKpis}`, color: achievedCount >= Math.ceil(totalKpis * 0.8) ? "text-emerald-500" : "text-amber-500", bg: achievedCount >= Math.ceil(totalKpis * 0.8) ? "bg-emerald-500/8 border-emerald-500/20" : "bg-amber-500/8 border-amber-500/20" },
          { label: "Over Target",  val: overTargetCount > 0 ? `+${overTargetCount}` : "0", color: overTargetCount > 0 ? "text-blue-500" : "text-muted-foreground", bg: overTargetCount > 0 ? "bg-blue-500/8 border-blue-500/20" : "bg-muted/20 border-border" },
          { label: "نسبة الحضور", val: `${attPct}%`, color: attPct >= 80 ? "text-emerald-500" : attPct >= 60 ? "text-amber-500" : "text-red-500", bg: attPct >= 80 ? "bg-emerald-500/8 border-emerald-500/20" : attPct >= 60 ? "bg-amber-500/8 border-amber-500/20" : "bg-red-500/8 border-red-500/20" },
          { label: "تأثير الراتب", val: kpiBonuses > 0 ? `+${fmt(kpiBonuses)}` : kpiDeductions > 0 ? `-${fmt(kpiDeductions)}` : "مستقر", color: kpiBonuses > 0 ? "text-emerald-500" : kpiDeductions > 0 ? "text-red-500" : "text-muted-foreground", bg: kpiBonuses > 0 ? "bg-emerald-500/8 border-emerald-500/20" : kpiDeductions > 0 ? "bg-red-500/8 border-red-500/20" : "bg-muted/20 border-border" },
        ].map(c => (
          <div key={c.label} className={`rounded-xl border ${c.bg} p-3 text-center`}>
            <p className="text-[10px] text-muted-foreground mb-1">{c.label}</p>
            <p className={`text-base font-black ${c.color}`}>{c.val}</p>
          </div>
        ))}
      </div>

      {/* ── شريط KPIs التقدم ── */}

      {/* ── الحضور ── */}
      <div className="rounded-xl border border-border bg-card p-3.5">
        <p className="text-xs font-bold mb-3">سجل الحضور — {periodLabel}</p>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {[
            { label: "أيام الحضور",  val: workedDays,  color: "text-emerald-500" },
            { label: "أيام الغياب",  val: absentDays,  color: "text-red-500" },
            { label: "أيام التأخير", val: lateDays,    color: "text-amber-500" },
          ].map(s => (
            <div key={s.label} className="text-center rounded-lg bg-muted/20 p-2">
              <p className={`text-lg font-black ${s.color}`}>{s.val}</p>
              <p className="text-[9px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
        <div>
          <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
            <span>نسبة الحضور</span><span>{attPct}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-muted/30">
            <div className="h-2 rounded-full transition-all duration-700" style={{ width: `${attPct}%`, background: attPct >= 80 ? "#10B981" : attPct >= 60 ? "#F59E0B" : "#EF4444" }} />
          </div>
        </div>
      </div>

      {/* ── مستوى الإنجاز التراكمي ── */}
      <div className="rounded-xl border border-border bg-card p-3.5">
        <p className="text-xs font-bold mb-3">مستوى الإنجاز التراكمي</p>
        <div className="flex items-center gap-4">
          <div className="text-center shrink-0">
            <p className={`text-2xl font-black ${levelColor}`}>{level}</p>
            <p className="text-[9px] text-muted-foreground mt-0.5">{totalPoints} نقطة</p>
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
              <span>التقدم نحو المستوى التالي</span><span>{totalPoints}/{nextLevelPts}</span>
            </div>
            <div className="w-full h-2.5 rounded-full bg-muted/30">
              <div className="h-2.5 rounded-full transition-all duration-700 bg-amber-500" style={{ width: `${levelPct}%` }} />
            </div>
            <p className="text-[9px] text-muted-foreground mt-1">تبقى {nextLevelPts - totalPoints} نقطة للمستوى التالي</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ManagerKpiComment ───────────────────────────────────────────────────────
function ManagerKpiComment({ profileId, reportMonth }: { profileId: number; reportMonth: string }) {
  const STORAGE_KEY = `kpi_comment_${profileId}_${reportMonth}`;
  const [comment, setComment] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) ?? ""; } catch { return ""; }
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    try { localStorage.setItem(STORAGE_KEY, comment); } catch { /* ignore */ }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={comment}
        onChange={e => { setComment(e.target.value); setSaved(false); }}
        placeholder="أكتب ملاحظتك على أداء الموظف هذا الشهر — ستظهر في التقرير المطبوع..."
        className="text-xs min-h-[80px] resize-none"
        dir="rtl"
      />
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={handleSave}>
          {saved ? <><CheckCircle2 className="w-3 h-3 text-emerald-500" />تم الحفظ</> : <><Save className="w-3 h-3" />حفظ الملاحظة</>}
        </Button>
      </div>
    </div>
  );
}

// ─── MonthlyTrend ─────────────────────────────────────────────────────────────
function MonthlyTrend({ profileId, currentMonth, kpis }: { profileId: number; currentMonth: string; kpis: EmployeeKpi[] }) {
  // احسب آخر 3 أشهر
  const months = (() => {
    const [y, m] = currentMonth.split("-").map(Number);
    return [-2, -1, 0].map(offset => {
      const d = new Date(y, m - 1 + offset, 1);
      const my = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      return `${my}-${mm}`;
    });
  })();

  const { data: r0 } = useQuery({ queryKey: ["employee-report", profileId, months[0]], queryFn: () => employeeApi.getReport(profileId, months[0]) });
  const { data: r1 } = useQuery({ queryKey: ["employee-report", profileId, months[1]], queryFn: () => employeeApi.getReport(profileId, months[1]) });
  const { data: r2 } = useQuery({ queryKey: ["employee-report", profileId, months[2]], queryFn: () => employeeApi.getReport(profileId, months[2]) });

  const reports = [r0, r1, r2];

  const trendData = months.map((mo, i) => {
    const rep = reports[i];
    const label = new Date(parseInt(mo.split("-")[0]), parseInt(mo.split("-")[1]) - 1, 1)
      .toLocaleDateString("ar-EG", { month: "short" });
    return {
      month: label,
      score: rep?.overallScore ?? null,
      delivered: rep?.orderStats?.delivered ?? 0,
      returned: rep?.orderStats?.returned ?? 0,
      total: rep?.orderStats?.total ?? 0,
      isCurrentMonth: mo === currentMonth,
    };
  });

  if (trendData.every(d => d.score === null)) {
    return <p className="text-center text-xs text-muted-foreground py-4">لا توجد بيانات كافية لعرض الاتجاه الشهري.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {trendData.map((d, i) => (
          <div key={i} className={`rounded-xl border p-3 text-center transition-all ${
            d.isCurrentMonth ? "border-primary/40 bg-primary/5" : "border-border bg-muted/5"
          }`}>
            <p className="text-[9px] text-muted-foreground mb-1">{d.month}</p>
            {d.score !== null ? (
              <>
                <p className={`text-lg font-black ${
                  d.score >= 80 ? "text-emerald-500" : d.score >= 60 ? "text-amber-500" : "text-red-500"
                }`}>{d.score}%</p>
                <div className="w-full h-1.5 rounded-full bg-muted/40 mt-1.5 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{
                    width: `${d.score}%`,
                    background: d.score >= 80 ? "#10B981" : d.score >= 60 ? "#c9a227" : "#EF4444"
                  }} />
                </div>
                <p className="text-[8px] text-muted-foreground mt-1">{d.delivered} تسليم / {d.returned} مرتجع</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">—</p>
            )}
            {d.isCurrentMonth && <p className="text-[8px] text-primary font-bold mt-1">الشهر الحالي</p>}
          </div>
        ))}
      </div>
      {/* سهم الاتجاه */}
      {trendData[1].score !== null && trendData[2].score !== null && (() => {
        const diff = trendData[2].score! - trendData[1].score!;
        return (
          <div className={`flex items-center gap-1.5 justify-center text-xs font-bold ${diff >= 0 ? "text-emerald-500" : "text-red-500"}`}>
            {diff >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
            {diff >= 0 ? "+" : ""}{diff}% مقارنة بالشهر الماضي
          </div>
        );
      })()}
    </div>
  );
}

// ─── MyOrdersTab ─────────────────────────────────────────────────────────────
function MyOrdersTab({
  profileId, displayName, reportMonth, onMonthChange, kpis,
  monthlyScore, dailyScore, selectedDate,
}: {
  profileId: number;
  displayName: string;
  reportMonth: string;
  onMonthChange: (m: string) => void;
  kpis: EmployeeKpi[];
  monthlyScore?: number | null;
  dailyScore?: number | null;
  selectedDate?: string;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["employee-orders", profileId, reportMonth],
    queryFn: () => employeeApi.getOrders(profileId, reportMonth),
  });

  const orders = data?.orders ?? [];
  const stats  = data?.stats;
  const kpiImpact = data?.kpiImpact;

  // حساب KPI targets من الـ kpis المتاحة
  const deliveryKpi  = kpis.find(k => k.metric === "delivery_rate" && k.isActive);
  const returnKpi    = kpis.find(k => k.metric === "return_rate"   && k.isActive);
  const ordersKpi    = kpis.find(k => k.metric === "total_orders"  && k.isActive);
  const revenueKpi   = kpis.find(k => k.metric === "revenue"       && k.isActive);
  const profitKpi    = kpis.find(k => k.metric === "profit"        && k.isActive);

  const STATUS_MAP: Record<string, { label: string; color: string; bg: string }> = {
    pending:           { label: "معلق",           color: "text-amber-600 dark:text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20" },
    warehouse_ready:   { label: "جاهز للشحن",     color: "text-blue-600 dark:text-blue-400",     bg: "bg-blue-500/10 border-blue-500/20" },
    in_shipping:       { label: "في الشحن",        color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20" },
    received:          { label: "تم الاستلام",     color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    partial_received:  { label: "استلام جزئي",    color: "text-teal-600 dark:text-teal-400",     bg: "bg-teal-500/10 border-teal-500/20" },
    returned:          { label: "مرتجع",           color: "text-red-600 dark:text-red-400",       bg: "bg-red-500/10 border-red-500/20" },
    cancelled:         { label: "ملغي",            color: "text-muted-foreground",                bg: "bg-muted/20 border-border" },
  };

  // فلترة
  const filtered = orders.filter(o => {
    const matchStatus = statusFilter === "all" || o.status === statusFilter;
    const matchSearch = !search || o.customerName.includes(search) || (o.invoiceNumber ?? "").includes(search) || o.product.includes(search);
    return matchStatus && matchSearch;
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );

  return (
    <div className="space-y-3 animate-in fade-in duration-300">

      {/* ─ Header ─ */}
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <p className="text-sm font-bold">📦 طلبات {displayName}</p>
          <p className="text-[10px] text-muted-foreground">الطلبات التي أنشأها الموظف — مرتبطة بمؤشرات أدائه</p>
        </div>
        <div className="mr-auto">
          <Label className="text-[10px] text-muted-foreground block mb-1">الشهر</Label>
          <Input type="month" value={reportMonth} onChange={e => onMonthChange(e.target.value)} className="h-7 text-xs w-36" />
        </div>
      </div>

      {/* ─ بطاقات الإحصائيات ─ */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {[
            { label: "إجمالي الطلبات", val: stats.total,        color: "text-foreground",                  bg: "bg-muted/20 border-border",                    kpi: ordersKpi   },
            { label: "تم التسليم",     val: stats.delivered,    color: "text-emerald-500",                  bg: "bg-emerald-500/8 border-emerald-500/20",        kpi: null },
            { label: "في الشحن",       val: stats.inShipping,   color: "text-indigo-500",                   bg: "bg-indigo-500/8 border-indigo-500/20",          kpi: null },
            { label: "مرتجع",          val: stats.returned,     color: "text-red-500",                      bg: "bg-red-500/8 border-red-500/20",                kpi: null },
            { label: "نسبة التسليم",   val: `${stats.deliveryRate}%`, color: stats.deliveryRate >= (deliveryKpi?.targetValue ?? 80) ? "text-emerald-500" : "text-amber-500", bg: stats.deliveryRate >= (deliveryKpi?.targetValue ?? 80) ? "bg-emerald-500/8 border-emerald-500/20" : "bg-amber-500/8 border-amber-500/20", kpi: deliveryKpi },
            { label: "نسبة المرتجعات", val: `${stats.returnRate}%`,  color: stats.returnRate <= (returnKpi?.targetValue ?? 20)  ? "text-emerald-500" : "text-red-500",    bg: stats.returnRate <= (returnKpi?.targetValue ?? 20)  ? "bg-emerald-500/8 border-emerald-500/20" : "bg-red-500/8 border-red-500/20",    kpi: returnKpi   },
          ].map(c => (
            <div key={c.label} className={`rounded-xl border ${c.bg} p-2.5 text-center relative`}>
              {c.kpi && (
                <div className="absolute top-1.5 left-1.5">
                  <span className="text-[8px] bg-primary/10 text-primary rounded-full px-1 py-0.5 font-bold">KPI</span>
                </div>
              )}
              <p className="text-[9px] text-muted-foreground mb-0.5">{c.label}</p>
              <p className={`text-sm font-black ${c.color}`}>{c.val}</p>
              {c.kpi && (
                <p className="text-[8px] text-muted-foreground/60 mt-0.5">
                  هدف: {c.kpi.direction === "lower_is_better" ? "≤" : "≥"}{c.kpi.targetValue}{c.kpi.unit}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ─ KPI Impact Section ─ */}
      {kpiImpact && kpis.filter(k => k.isActive && k.metric !== "manual").length > 0 && (
        <Card className="border-border bg-card">
          <CardContent className="px-4 py-3">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-3.5 h-3.5 text-primary shrink-0" />
              <p className="text-xs font-bold">تأثير الطلبات على مؤشرات الأداء (KPIs)</p>
            </div>
            <div className="space-y-2.5">
              {[
                deliveryKpi && { kpi: deliveryKpi, actual: kpiImpact.deliveryRate, label: "نسبة التسليم" },
                returnKpi   && { kpi: returnKpi,   actual: kpiImpact.returnRate,   label: "نسبة المرتجعات" },
                ordersKpi   && { kpi: ordersKpi,   actual: kpiImpact.totalOrders,  label: "عدد الطلبيات" },
                revenueKpi  && { kpi: revenueKpi,  actual: kpiImpact.revenue,      label: "الإيرادات" },
                profitKpi   && { kpi: profitKpi,   actual: kpiImpact.profit,       label: "الربح" },
              ].filter(Boolean).map(item => {
                if (!item) return null;
                const { kpi, actual, label } = item as { kpi: EmployeeKpi; actual: number; label: string };
                const target = kpi.targetValue;
                let score = 0;
                if (kpi.direction === "lower_is_better") {
                  score = actual <= target ? 100 : Math.max(0, Math.round((target / actual) * 100));
                } else {
                  score = Math.min(Math.round((actual / target) * 100), 150);
                }
                const achieved = kpi.direction === "lower_is_better" ? score >= 70 : score >= 80;
                const isOT = score > 100;
                const barScore = Math.min(score, 100);
                const fillColor = isOT ? "#3B82F6" : achieved ? "#10B981" : "#EF4444";
                const fmtVal = (v: number, unit: string) => unit === "%" ? `${v}%` : unit === "ج.م" ? fmt(v) : fmtNum(v) + " " + unit;

                return (
                  <div key={kpi.id} className="rounded-xl border border-border/50 bg-muted/5 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[10px] font-bold truncate">{kpi.name}</span>
                        <span className="text-[9px] text-muted-foreground shrink-0">({label})</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[9px] font-black ${isOT ? "text-blue-500" : achieved ? "text-emerald-500" : "text-red-500"}`}>
                          {isOT ? `🏆 ${score}%` : achieved ? `✅ ${score}%` : `❌ ${score}%`}
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full bg-muted/30 overflow-hidden mb-1.5">
                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${barScore}%`, background: fillColor }} />
                    </div>
                    <div className="flex justify-between text-[9px] text-muted-foreground">
                      <span>فعلي: <strong className="text-foreground">{fmtVal(actual, kpi.unit)}</strong></span>
                      <span>هدف: {kpi.direction === "lower_is_better" ? "≤" : "≥"}{fmtVal(target, kpi.unit)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─ فلاتر + بحث ─ */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="بحث باسم العميل، الفاتورة، المنتج..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-7 text-xs flex-1 min-w-[180px]"
        />
        <div className="flex gap-1 flex-wrap">
          {["all", "pending", "in_shipping", "received", "returned"].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`h-6 px-2 rounded-lg text-[10px] font-bold border transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-muted/20 text-muted-foreground hover:border-primary/40"
              }`}
            >
              {s === "all" ? "الكل" : STATUS_MAP[s]?.label ?? s}
            </button>
          ))}
        </div>
      </div>

      {/* ─ جدول الطلبات ─ */}
      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-xs">
          {orders.length === 0 ? "لا توجد طلبات هذا الشهر" : "لا توجد طلبات مطابقة للفلتر"}
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[10px] text-muted-foreground">{filtered.length} طلب</p>
          {filtered.map(order => {
            const st = STATUS_MAP[order.status] ?? { label: order.status, color: "text-muted-foreground", bg: "bg-muted/20 border-border" };
            return (
              <div key={order.id} className="rounded-xl border border-border/50 bg-card px-3 py-2.5 flex items-center gap-3 hover:shadow-sm transition-shadow">
                {/* رقم الفاتورة */}
                <div className="shrink-0 w-20">
                  <p className="text-[9px] text-muted-foreground">فاتورة</p>
                  <p className="text-[10px] font-black text-primary truncate">{order.invoiceNumber ?? `#${order.id}`}</p>
                </div>
                {/* العميل + المنتج */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold truncate">{order.customerName}</p>
                  <p className="text-[9px] text-muted-foreground truncate">
                    {order.product}
                    {order.color ? ` · ${order.color}` : ""}
                    {order.size  ? ` / ${order.size}` : ""}
                    {order.city  ? ` · ${order.city}` : ""}
                  </p>
                </div>
                {/* الكمية + السعر */}
                <div className="shrink-0 text-center hidden sm:block">
                  <p className="text-[9px] text-muted-foreground">الكمية</p>
                  <p className="text-xs font-bold">{order.quantity}</p>
                </div>
                <div className="shrink-0 text-center hidden sm:block">
                  <p className="text-[9px] text-muted-foreground">الإجمالي</p>
                  <p className="text-xs font-bold text-emerald-500">{fmt(order.totalPrice)}</p>
                </div>
                {/* الحالة */}
                <div className={`shrink-0 rounded-lg border px-2 py-1 text-center ${st.bg}`}>
                  <p className={`text-[9px] font-black ${st.color}`}>{st.label}</p>
                </div>
                {/* التاريخ */}
                <div className="shrink-0 hidden lg:block">
                  <p className="text-[9px] text-muted-foreground">{new Date(order.createdAt).toLocaleDateString("ar-EG", { day: "2-digit", month: "short" })}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── KPI Tab Content (reusable inner component) ───────────────────────────────
function KpiTabContent({
  profileId,
  kpis,
  report,
  fullProfile,
  ratingCfg,
  kpiViewMode,
  kpiSelectedDate,
  reportMonth,
  isAdmin,
  isSuperAdmin,
  setEditingKpi,
  setKpiDialogOpen,
  deleteKpi,
  displayName,
}: {
  profileId: number;
  kpis: EmployeeKpi[];
  report: any;
  fullProfile: any;
  ratingCfg: any;
  kpiViewMode: "monthly" | "daily";
  kpiSelectedDate: string;
  reportMonth: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  setEditingKpi: (k: EmployeeKpi) => void;
  setKpiDialogOpen: (v: boolean) => void;
  deleteKpi: (id: number) => void;
  displayName: string;
}) {
  const salary = fullProfile?.monthlySalary ?? 0;
  const activeKpis = kpis.filter(k => k.isActive);
  const evaluatedKpis = report?.kpis ?? [];
  const evaluatedById = new Map(evaluatedKpis.map((k: any) => [k.id, k]));
  const totalSW = activeKpis.reduce((s, k) => s + (k.salaryWeight ?? 0), 0);
  const totalOT = activeKpis.reduce((s, k) => s + (k.overtargetBonus ?? 0), 0);
  const totalDeduction = salary > 0 ? Math.round((totalSW / 100) * salary) : 0;
  const totalBonus = salary > 0 ? Math.round((totalOT / 100) * salary) : 0;
  const achievedCount = evaluatedKpis.filter((k: any) => k.achieved === true).length;
  const failedCount = evaluatedKpis.filter((k: any) => k.achieved === false).length;
  const overTargetCount = evaluatedKpis.filter((k: any) => k.score !== null && k.score > 100).length;
  const scoredKpis = evaluatedKpis.filter((k: any) => k.score !== null && Number.isFinite(k.score));
  const overallScore = report?.overallScore ?? (scoredKpis.length > 0
    ? Math.round(scoredKpis.reduce((s: number, k: any) => s + Math.min(k.score ?? 0, 100), 0) / scoredKpis.length)
    : null);
  const radarData = activeKpis.map(k => ({
    subject: k.name.length > 6 ? k.name.slice(0, 6) + "…" : k.name,
    value: Math.min((evaluatedById.get(k.id) as any)?.score ?? (k.salaryWeight ?? 0), 100),
    fullName: k.name,
  }));
  const barData = activeKpis.slice(0, 4).map(k => ({
    name: k.name.length > 8 ? k.name.slice(0, 8) + "…" : k.name,
    "تقييم الأداء الحالي": Math.min((evaluatedById.get(k.id) as any)?.score ?? 0, 100),
    "المتوسط العام": 70,
  }));
  const opMetrics = activeKpis.slice(0, 3).map(k => ({
    label: k.name,
    value: (evaluatedById.get(k.id) as any)?.score !== null && (evaluatedById.get(k.id) as any)?.score !== undefined
      ? `${Math.min(Math.round((evaluatedById.get(k.id) as any)!.score ?? 0), 100)}%`
      : "—",
    achieved: (evaluatedById.get(k.id) as any)?.achieved,
    isOT: ((evaluatedById.get(k.id) as any)?.score ?? 0) > 100,
    icon: k.direction === "higher_is_better" ? TrendingUp : TrendingDown,
  }));
  const kpiOverviewCards = [
    { label: "إجمالي KPI", value: kpis.length, note: `${activeKpis.length} نشط`, color: "text-primary", bg: "bg-primary/8", border: "border-primary/20" },
    { label: "وزن الراتب", value: `${totalSW}%`, note: fmt(totalDeduction), color: "text-amber-500", bg: "bg-amber-500/8", border: "border-amber-500/20" },
    { label: "محقق", value: achievedCount, note: `${Math.min(Math.round((achievedCount / Math.max(evaluatedKpis.length, 1)) * 100), 100)}%`, color: "text-emerald-500", bg: "bg-emerald-500/8", border: "border-emerald-500/20" },
    { label: "يحتاج تحسين", value: failedCount, note: `${overTargetCount} OT`, color: "text-red-500", bg: "bg-red-500/8", border: "border-red-500/20" },
  ];

  return (
    <>
      <Card className="border-border/60 bg-gradient-to-br from-background via-card to-primary/5 overflow-hidden">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[10px] text-muted-foreground">
                <Target className="w-3 h-3 text-primary" />
                {kpiViewMode === "daily" ? `أداء يوم ${kpiSelectedDate}` : "لوحة مؤشرات الأداء الشهرية"}
              </div>
              <h3 className="text-lg font-black leading-tight">مراجعة سريعة لأداء {displayName}</h3>
              <p className="text-xs text-muted-foreground max-w-2xl">عرض احترافي يربط الأداء التشغيلي بالمؤشرات المالية، مع تتبع واضح للمحقق وغير المحقق والمكافآت.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-2 text-center min-w-[110px]">
                <p className="text-[10px] text-muted-foreground">التقييم الإجمالي</p>
                <p className="text-lg font-black text-primary">{overallScore !== null ? `${overallScore}%` : "—"}</p>
              </div>
              <div className={`rounded-2xl border px-3 py-2 text-center min-w-[110px] ${ratingCfg.bg} ${ratingCfg.color}`}>
                <p className="text-[10px] opacity-80">النتيجة</p>
                <p className="text-sm font-black">{ratingCfg.label}</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
            {kpiOverviewCards.map(card => (
              <div key={card.label} className={`rounded-2xl border ${card.border} ${card.bg} px-3 py-3`}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] text-muted-foreground">{card.label}</p>
                    <p className={`text-lg font-black ${card.color}`}>{card.value}</p>
                  </div>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-background/70 border border-border/40">
                    <div className={`w-2.5 h-2.5 rounded-full ${card.color.replace("text-", "bg-")}`} />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{card.note}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ROW 1 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Card className="relative overflow-hidden border-border bg-card">
          <div className="absolute top-2 right-2.5 text-[9px] font-black text-muted-foreground/40">1</div>
          <CardContent className="px-4 py-4 sm:py-5 flex flex-col items-center gap-3">
            <div className="flex items-center justify-between w-full">
              <p className="text-xs font-bold text-foreground">التقدم نحو الأهداف</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                overallScore !== null && overallScore >= 80 ? "bg-emerald-500/10 text-emerald-500" :
                overallScore !== null && overallScore >= 60 ? "bg-amber-500/10 text-amber-500" :
                "bg-red-500/10 text-red-500"
              }`}>
                {overallScore !== null && overallScore >= 80 ? "ممتاز" : overallScore !== null && overallScore >= 60 ? "جيد" : "يحتاج تحسين"}
              </span>
            </div>
            <div className="flex flex-col md:flex-row items-center gap-4 md:gap-5 w-full">
              <div className="relative w-28 h-28 shrink-0">
                <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
                  <circle cx="48" cy="48" r="38" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                  <circle cx="48" cy="48" r="38" fill="none"
                    stroke={overallScore !== null && overallScore >= 80 ? "#10B981" : overallScore !== null && overallScore >= 60 ? "#c9a227" : "#EF4444"}
                    strokeWidth="8"
                    strokeDasharray={`${(overallScore ?? 0) * 2.388} 238.8`}
                    strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xl font-black leading-none">{overallScore !== null ? `${overallScore}%` : "—"}</span>
                  <span className="text-[9px] text-muted-foreground mt-0.5">المتوسط الشهري</span>
                </div>
              </div>
              <div className="flex-1 w-full space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "محقق", value: achievedCount, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                    { label: "غير محقق", value: failedCount, color: "text-red-500", bg: "bg-red-500/10" },
                    { label: "OT", value: overTargetCount, color: "text-blue-500", bg: "bg-blue-500/10" },
                  ].map(item => (
                    <div key={item.label} className={`rounded-xl border border-border/50 ${item.bg} px-3 py-2 text-center`}>
                      <p className={`text-base font-black ${item.color}`}>{item.value}</p>
                      <p className="text-[9px] text-muted-foreground">{item.label}</p>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5 pt-1">
                  {activeKpis.slice(0, 3).map(k => {
                    const sc = Math.min((evaluatedById.get(k.id) as any)?.score ?? 0, 100);
                    return (
                      <div key={k.id} className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2">
                        <div className="flex items-center justify-between text-[9px] mb-1">
                          <span className="text-muted-foreground truncate max-w-[68%]">{k.name}</span>
                          <span className="font-bold">{sc}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-muted/40 overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-700"
                            style={{ width: `${sc}%`, background: sc >= 80 ? "#10B981" : sc >= 60 ? "#c9a227" : "#EF4444" }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <>
          {barData.length > 0 && (
            <Card className="relative overflow-hidden border-border bg-card">
              <div className="absolute top-2 right-2.5 text-[9px] font-black text-muted-foreground/40">2</div>
              <CardContent className="px-3 py-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-xs font-bold text-foreground">تقييم الأداء الربعي</p>
                    <p className="text-[9px] text-muted-foreground">مقارنة الأداء الحالي مع المرجع العام</p>
                  </div>
                  <div className="flex flex-col items-end gap-0.5">
                    <div className="flex items-center gap-1 text-[9px] text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-primary inline-block" />الأداء الحالي</div>
                    <div className="flex items-center gap-1 text-[9px] text-muted-foreground"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />المرجع</div>
                  </div>
                </div>
                {overallScore !== null && (
                  <div className="flex items-center gap-0.5 mb-2 justify-end">
                    {[1,2,3,4,5].map(s => (
                      <Star key={s} className={`w-3 h-3 ${s <= Math.round(overallScore / 20) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                    ))}
                    <span className="text-[9px] text-muted-foreground mr-1">
                      {overallScore >= 90 ? "ممتاز" : overallScore >= 75 ? "جيد جداً" : overallScore >= 60 ? "جيد" : "مقبول"}
                    </span>
                  </div>
                )}
                <ResponsiveContainer width="100%" height={radarData.length >= 3 ? 140 : 180}>
                  <LineChart data={barData} margin={{ top: 8, right: 8, bottom: 2, left: -20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 7, fill: "hsl(var(--muted-foreground))" }} domain={[0, 100]} axisLine={false} tickLine={false} />
                    <Tooltip formatter={(v: any, n: string) => [`${v}%`, n]} contentStyle={{ fontSize: 10, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, direction: "rtl", color: "hsl(var(--foreground))", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }} labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 9 }} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
                    <Line type="monotone" dataKey="تقييم الأداء الحالي" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                    <Line type="monotone" dataKey="المتوسط العام" stroke="#10B981" strokeWidth={2} strokeDasharray="4 2" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
                  </LineChart>
                </ResponsiveContainer>
                {radarData.length >= 3 && (
                  <div className="mt-3 pt-3 border-t border-border/30">
                    <p className="text-[9px] text-muted-foreground mb-1">تطور الكفاءات الأساسية</p>
                    <ResponsiveContainer width="100%" height={150}>
                      <RadarChart data={radarData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                        <PolarGrid stroke="hsl(var(--border))" />
                        <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
                        <Tooltip contentStyle={{ fontSize: 10, background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }} labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 9 }} />
                        <Radar name="الأداء" dataKey="value" stroke="#c9a227" fill="#c9a227" fillOpacity={0.3} strokeWidth={2} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      </div>

      {/* ROW 2 */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        {opMetrics.length > 0 && (
          <Card className="relative overflow-hidden border-border bg-card">
            <div className="absolute top-2 right-2.5 text-[9px] font-black text-muted-foreground/40">4</div>
            <CardContent className="px-4 py-4">
              <p className="text-xs font-bold text-foreground mb-3">مؤشرات الأداء التشغيلي</p>
              <div className="space-y-2.5">
                {opMetrics.map((m, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground truncate max-w-[55%]">{m.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black">{m.value}</span>
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${m.isOT ? "bg-blue-500/15" : m.achieved === true ? "bg-emerald-500/15" : m.achieved === false ? "bg-red-500/15" : "bg-muted/20"}`}>
                        <m.icon className={`w-3 h-3 ${m.isOT ? "text-blue-500" : m.achieved === true ? "text-emerald-500" : m.achieved === false ? "text-red-500" : "text-muted-foreground"}`} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {overallScore !== null && (
                <div className="mt-3 pt-2.5 border-t border-border/30">
                  <p className="text-[10px] font-bold text-muted-foreground mb-0.5">التعليقات والملاحظات</p>
                  <p className="text-[10px] text-muted-foreground/80">
                    {overallScore >= 90 ? "🌟 أداء استثنائي هذا الشهر، استمر في الإبداع!" :
                     overallScore >= 75 ? "👍 أداء فوق المتوسط، يحتاج تعزيز بعض الجوانب" :
                     overallScore >= 60 ? "✅ أداء مقبول، مع وجود فرص للتطوير" :
                     "⚠️ يحتاج الموظف إلى دعم وتحسين في المؤشرات"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
        <Card className="relative overflow-hidden border-border bg-card">
          <div className="absolute top-2 right-2.5 text-[9px] font-black text-muted-foreground/40">5</div>
          <CardContent className="px-4 py-4">
            <p className="text-xs font-bold text-foreground mb-3">الملخص المالي للمؤشرات</p>
            {salary > 0 ? (
              <div className="space-y-2">
                {[
                  { label: "الراتب الأساسي", value: fmt(salary), color: "text-foreground", bg: "bg-muted/20" },
                  { label: "إجمالي KPI من الراتب", value: `${totalSW}%`, sub: fmt(totalDeduction), color: "text-amber-600", bg: "bg-amber-500/8" },
                  { label: "عند قصور كامل", value: fmt(salary - totalDeduction), color: "text-red-500", bg: "bg-red-500/8" },
                  ...(totalBonus > 0 ? [{ label: "مع Over Target", value: fmt(salary + totalBonus), color: "text-blue-600", bg: "bg-blue-500/8", sub: undefined }] : []),
                ].map((row, i) => (
                  <div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2 ${row.bg}`}>
                    <span className="text-[10px] text-muted-foreground">{row.label}</span>
                    <div className="text-right">
                      <span className={`text-xs font-black ${row.color}`}>{row.value}</span>
                      {row.sub && <p className="text-[8px] text-muted-foreground">{row.sub}</p>}
                    </div>
                  </div>
                ))}
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {[
                    { label: "محقق", val: achievedCount, color: "text-emerald-600", bg: "bg-emerald-500/10" },
                    { label: "لم يتحقق", val: failedCount, color: "text-red-500", bg: "bg-red-500/10" },
                    { label: "Over Target", val: overTargetCount, color: "text-blue-600", bg: "bg-blue-500/10" },
                  ].map(s => (
                    <div key={s.label} className={`rounded-lg py-2 text-center ${s.bg}`}>
                      <p className={`text-base font-black ${s.color}`}>{s.val}</p>
                      <p className="text-[8px] text-muted-foreground">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-6">
                <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs text-muted-foreground">لم يُحدد الراتب الأساسي بعد</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">أضف الراتب في تعديل بيانات الموظف لرؤية التأثير المالي</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* KPI Detail Cards */}
      <div>
        <h3 className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
          <Settings className="w-3.5 h-3.5" />مؤشرات الأداء التفصيلية
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {kpis.map((kpi) => {
            const salaryW = kpi.salaryWeight ?? 0;
            const otBonus = kpi.overtargetBonus ?? 0;
            const kpiAmt = salary > 0 && salaryW > 0 ? Math.round((salaryW / 100) * salary) : 0;
            const bonusAmt = salary > 0 && otBonus > 0 ? Math.round((otBonus / 100) * salary) : 0;
            const evalKpi = evaluatedById.get(kpi.id) as any;
            const isOT = (evalKpi?.score ?? 0) > 100;
            const isAchieved = evalKpi?.achieved === true;
            const isFailed = evalKpi?.achieved === false;
            const colorMap: Record<string, { accent: string; iconBg: string; iconColor: string; badgeBg: string; badgeText: string }> = {
              delivery_rate: { accent: "bg-emerald-500", iconBg: "bg-emerald-50 dark:bg-emerald-900/30", iconColor: "text-emerald-600 dark:text-emerald-400", badgeBg: "bg-emerald-50/50 dark:bg-emerald-900/20 border-emerald-200/60 dark:border-emerald-700/40", badgeText: "text-emerald-700 dark:text-emerald-300" },
              return_rate:   { accent: "bg-red-500",     iconBg: "bg-red-50 dark:bg-red-900/30",         iconColor: "text-red-600 dark:text-red-400",     badgeBg: "bg-red-50/50 dark:bg-red-900/20 border-red-200/60 dark:border-red-700/40",         badgeText: "text-red-700 dark:text-red-300" },
              total_orders:  { accent: "bg-blue-500",    iconBg: "bg-blue-50 dark:bg-blue-900/30",        iconColor: "text-blue-600 dark:text-blue-400",    badgeBg: "bg-blue-50/50 dark:bg-blue-900/20 border-blue-200/60 dark:border-blue-700/40",    badgeText: "text-blue-700 dark:text-blue-300" },
              profit:        { accent: "bg-violet-500",  iconBg: "bg-violet-50 dark:bg-violet-900/30",    iconColor: "text-violet-600 dark:text-violet-400",badgeBg: "bg-violet-50/50 dark:bg-violet-900/20 border-violet-200/60 dark:border-violet-700/40",badgeText: "text-violet-700 dark:text-violet-300" },
              revenue:       { accent: "bg-amber-500",   iconBg: "bg-amber-50 dark:bg-amber-900/30",      iconColor: "text-amber-600 dark:text-amber-400",  badgeBg: "bg-amber-50/50 dark:bg-amber-900/20 border-amber-200/60 dark:border-amber-700/40",  badgeText: "text-amber-700 dark:text-amber-300" },
              manual:        { accent: "bg-primary",     iconBg: "bg-primary/10",                         iconColor: "text-primary",                        badgeBg: "bg-primary/5 border-primary/20",                                                    badgeText: "text-primary" },
            };
            const colors = colorMap[kpi.metric] ?? colorMap.manual;
            const iconForMetric: Record<string, React.ReactNode> = {
              delivery_rate: <TrendingUp className="w-4 h-4" />,
              return_rate:   <TrendingDown className="w-4 h-4" />,
              total_orders:  <Package className="w-4 h-4" />,
              profit:        <DollarSign className="w-4 h-4" />,
              revenue:       <BarChart2 className="w-4 h-4" />,
              manual:        <Target className="w-4 h-4" />,
            };
            return (
              <div key={kpi.id} className="relative rounded-xl border border-border bg-card overflow-hidden transition-all hover:shadow-md hover:border-border/80">
                <div className={`h-1 w-full ${colors.accent} opacity-80`} />
                {(isOT || isAchieved || isFailed) && (
                  <div className={`px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-bold border-b border-border/20 ${
                    isOT ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                    isAchieved ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
                                "bg-red-500/10 text-red-700 dark:text-red-400"
                  }`}>
                    {isOT ? <><Trophy className="w-3 h-3" />Over Target — تجاوز الهدف 🏆</> :
                     isAchieved ? <><CheckCircle2 className="w-3 h-3" />تم تحقيق المؤشر ✅</> :
                                  <><XCircle className="w-3 h-3" />لم يتحقق المؤشر ❌</>}
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colors.iconBg}`}>
                        <span className={colors.iconColor}>{iconForMetric[kpi.metric] ?? <Target className="w-4 h-4" />}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold leading-tight truncate">{kpi.name}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {kpi.direction === "higher_is_better" ? "↑ الأعلى أفضل" : "↓ الأدنى أفضل"}{" · "}وزن {kpi.weight}%
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      {!kpi.isActive && <span className="text-[9px] bg-muted text-muted-foreground rounded-full px-2 py-0.5">غير نشط</span>}
                      {isAdmin && (
                        <>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/60 hover:text-primary" onClick={() => { setEditingKpi(kpi); setKpiDialogOpen(true); }}>
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          {isSuperAdmin && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/60 hover:text-destructive" onClick={() => deleteKpi(kpi.id)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <div className={`flex items-center justify-between rounded-lg px-3 py-2 mb-3 border ${colors.badgeBg}`}>
                    <span className="text-[10px] text-muted-foreground">الهدف المطلوب</span>
                    <span className={`text-sm font-black ${colors.badgeText}`}>
                      {kpi.direction === "lower_is_better" ? "≤" : "≥"}{fmtNum(kpi.targetValue)} <span className="text-[9px] font-normal opacity-70">{kpi.unit}</span>
                    </span>
                  </div>
                  {(salaryW > 0 || otBonus > 0) && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {salaryW > 0 ? (
                        <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200/60 dark:border-red-700/40 px-2.5 py-2">
                          <p className="text-[9px] text-red-500/80 mb-0.5">عند قصور</p>
                          <p className="text-xs font-black text-red-600 dark:text-red-400">−{fmt(kpiAmt)}</p>
                          <p className="text-[9px] text-red-400/70">{salaryW}% من الراتب</p>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-muted/20 border border-border px-2.5 py-2 text-center opacity-40">
                          <p className="text-[9px] text-muted-foreground mb-0.5">عند قصور</p>
                          <p className="text-xs font-bold text-muted-foreground">—</p>
                        </div>
                      )}
                      {otBonus > 0 ? (
                        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-700/40 px-2.5 py-2">
                          <p className="text-[9px] text-emerald-500/80 mb-0.5">Over Target</p>
                          <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">+{fmt(bonusAmt)}</p>
                          <p className="text-[9px] text-emerald-400/70">+{otBonus}% مكافأة</p>
                        </div>
                      ) : (
                        <div className="rounded-lg bg-muted/20 border border-border px-2.5 py-2 text-center opacity-40">
                          <p className="text-[9px] text-muted-foreground mb-0.5">Over Target</p>
                          <p className="text-xs font-bold text-muted-foreground">—</p>
                        </div>
                      )}
                    </div>
                  )}
                  {salaryW > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-muted-foreground">نسبة تأثير المؤشر على الراتب</span>
                        <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">{salaryW}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-muted/40 overflow-hidden">
                        <div className={`h-full rounded-full ${colors.accent} opacity-70 transition-all duration-700`} style={{ width: `${Math.min(100, salaryW)}%` }} />
                      </div>
                    </div>
                  )}
                  {kpi.description && (
                    <p className="text-[9px] text-muted-foreground/60 mt-2.5 italic leading-relaxed border-t border-border/20 pt-2">{kpi.description}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Smart Recommendation */}
      {overallScore !== null && (
        <div className={`rounded-2xl border px-4 py-4 space-y-2 ${
          overallScore >= 90 ? "bg-emerald-500/8 border-emerald-500/20" :
          overallScore >= 70 ? "bg-amber-500/8 border-amber-500/20" :
          "bg-red-500/8 border-red-500/20"
        }`}>
          <div className="flex items-center gap-2">
            <Briefcase className={`w-4 h-4 shrink-0 ${overallScore >= 90 ? "text-emerald-500" : overallScore >= 70 ? "text-amber-500" : "text-red-500"}`} />
            <p className="text-xs font-bold">توصيتك الذكية لهذا الشهر</p>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {overallScore >= 90 ? `🌟 أداؤك هذا الشهر استثنائي! استمر على هذا المستوى وشارك خبرتك مع زملائك لتعزيز الفريق.` :
             overallScore >= 80 ? `✅ أداء قوي، أنت على المسار الصحيح. حاول تحسين المؤشرات الأقل لتصل للقمة الشهر القادم.` :
             overallScore >= 70 ? `👍 أداء جيد لكن فيه مساحة للتميز. راجع المؤشرات اللي تحت الهدف وركز عليها الأسبوع الجاي.` :
             overallScore >= 50 ? `⚠️ أداؤك تحت المستهدف هذا الشهر. حدد سبب التراجع وضع لنفسك خطة يومية للتحسين.` :
             `🔴 هذا الشهر صعب، لكن كل يوم فرصة جديدة. تواصل مع مديرك لوضع خطة عملية للنهوض بأدائك.`}
          </p>
        </div>
      )}

      {/* Monthly Trend */}
      {kpiViewMode === "monthly" && (
        <Card className="border-border bg-card">
          <CardContent className="px-4 py-4">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-4 h-4 text-primary shrink-0" />
              <p className="text-xs font-bold">مقارنة الأداء — آخر 3 أشهر</p>
            </div>
            <MonthlyTrend profileId={profileId} currentMonth={reportMonth} kpis={kpis} />
          </CardContent>
        </Card>
      )}

      {/* Performance Risk Matrix */}
      {activeKpis.length > 0 && (() => {
        const matrixKpis = activeKpis.map(k => {
          const ev = evaluatedById.get(k.id) as any;
          const sc = ev?.score ?? null;
          const salaryW = k.salaryWeight ?? 0;
          const impact = salaryW >= 20 ? "high" : salaryW >= 10 ? "medium" : "low";
          const perf = sc === null ? "unknown" : sc >= 80 ? "good" : sc >= 50 ? "warning" : "danger";
          return { ...k, sc, impact, perf };
        });
        const zones = [
          { key: "danger-high",   label: "🔴 خطر عالي الأولوية",  color: "bg-red-500/12 border-red-500/30",      textColor: "text-red-600 dark:text-red-400",    filter: (k: any) => (k.perf === "danger" || k.perf === "unknown") && k.impact === "high" },
          { key: "danger-low",    label: "🟠 خطر منخفض التأثير",  color: "bg-orange-500/10 border-orange-500/25", textColor: "text-orange-600 dark:text-orange-400", filter: (k: any) => (k.perf === "danger" || k.perf === "unknown") && k.impact !== "high" },
          { key: "warning-high",  label: "🟡 تحذير — راقبه",      color: "bg-amber-500/10 border-amber-500/25",   textColor: "text-amber-600 dark:text-amber-400",  filter: (k: any) => k.perf === "warning" },
          { key: "good",          label: "🟢 على المسار الصحيح",  color: "bg-emerald-500/10 border-emerald-500/25",textColor: "text-emerald-600 dark:text-emerald-400", filter: (k: any) => k.perf === "good" },
        ];
        return (
          <Card className="border-border bg-card">
            <CardContent className="px-4 py-4">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <p className="text-xs font-bold">مصفوفة مخاطر المؤشرات</p>
                <span className="text-[9px] text-muted-foreground/60 mr-auto">تصنيف حسب الأداء × التأثير المالي</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {zones.map(zone => {
                  const items = matrixKpis.filter(zone.filter);
                  if (items.length === 0) return null;
                  return (
                    <div key={zone.key} className={`rounded-xl border p-3 ${zone.color}`}>
                      <p className={`text-[10px] font-bold mb-2 ${zone.textColor}`}>{zone.label}</p>
                      <div className="space-y-1.5">
                        {items.map(k => (
                          <div key={k.id} className="flex items-center justify-between gap-2">
                            <span className="text-[10px] truncate text-foreground/80">{k.name}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {k.sc !== null && (
                                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${k.sc >= 80 ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : k.sc >= 50 ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-red-500/20 text-red-600 dark:text-red-400"}`}>{k.sc}%</span>
                              )}
                              {(k.salaryWeight ?? 0) > 0 && (
                                <span className="text-[9px] text-muted-foreground bg-muted/40 rounded-full px-1.5 py-0.5">{k.salaryWeight}%</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }).filter(Boolean)}
                {zones.every(z => matrixKpis.filter(z.filter).length === 0) && (
                  <div className="col-span-2 text-center py-6 text-xs text-muted-foreground">لا توجد بيانات كافية لعرض المصفوفة</div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })()}


      {/* Achievement Badge Wall */}
      {(() => {
        const scoredKpisForBadge = activeKpis.filter(k => (evaluatedById.get(k.id) as any)?.score !== null && (evaluatedById.get(k.id) as any)?.score !== undefined);
        const hasData = scoredKpisForBadge.length > 0;
        const badges = [
          { icon: "🏆", title: "محقق الكل",    desc: "تحقيق جميع المؤشرات في شهر واحد",     earned: hasData && scoredKpisForBadge.every(k => (evaluatedById.get(k.id) as any)?.achieved === true || ((evaluatedById.get(k.id) as any)?.score ?? 0) > 100), color: "border-amber-500/40 bg-amber-500/8 text-amber-500" },
          { icon: "🚀", title: "فوق الهدف",    desc: "تجاوز الهدف في مؤشر واحد على الأقل",   earned: hasData && scoredKpisForBadge.some(k => ((evaluatedById.get(k.id) as any)?.score ?? 0) > 100),   color: "border-blue-500/40 bg-blue-500/8 text-blue-500" },
          { icon: "⭐", title: "أداء ممتاز",   desc: "متوسط أداء فوق 90%",                   earned: overallScore !== null && overallScore >= 90,     color: "border-emerald-500/40 bg-emerald-500/8 text-emerald-500" },
          { icon: "📈", title: "تحسن مستمر",   desc: "أداء فوق 70% — على مسار التحسين",      earned: overallScore !== null && overallScore >= 70 && overallScore < 90, color: "border-indigo-500/40 bg-indigo-500/8 text-indigo-500" },
          { icon: "🎯", title: "نصف الطريق",   desc: "تحقيق 50%+ من المؤشرات النشطة",        earned: hasData && (scoredKpisForBadge.filter(k => (evaluatedById.get(k.id) as any)?.achieved === true || ((evaluatedById.get(k.id) as any)?.score ?? 0) > 100).length / scoredKpisForBadge.length) >= 0.5, color: "border-violet-500/40 bg-violet-500/8 text-violet-500" },
          { icon: "💰", title: "حامي الراتب",  desc: "لا خصومات KPI هذا الشهر",              earned: hasData && scoredKpisForBadge.every(k => (evaluatedById.get(k.id) as any)?.achieved !== false || (k.salaryWeight ?? 0) === 0), color: "border-rose-500/40 bg-rose-500/8 text-rose-500" },
        ];
        const earnedCount = badges.filter(b => b.earned).length;
        return (
          <Card className="border-border bg-card">
            <CardContent className="px-4 py-4">
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2">
                  <Gift className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-xs font-bold">جدار الإنجازات الشهرية</p>
                </div>
                <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${earnedCount >= 4 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : earnedCount >= 2 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted/40 text-muted-foreground"}`}>{earnedCount} / {badges.length} شارة محققة</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {badges.map(badge => (
                  <div key={badge.title} className={`relative rounded-xl border p-3 text-center transition-all ${badge.earned ? `${badge.color} shadow-sm` : "border-border/30 bg-muted/5 opacity-35 grayscale"}`}>
                    {badge.earned && <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-current animate-pulse opacity-60" />}
                    <div className="text-2xl mb-1.5">{badge.icon}</div>
                    <p className="text-[10px] font-black leading-tight">{badge.title}</p>
                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed">{badge.desc}</p>
                    {badge.earned && <div className="mt-1.5 text-[8px] font-bold opacity-70">✓ محققة</div>}
                  </div>
                ))}
              </div>
              {earnedCount === 0 && (
                <p className="text-center text-[10px] text-muted-foreground mt-3">
                  {hasData ? "لا توجد شارات محققة بعد — حسّن أداءك لتحقيق الشارات 🎯" : "أدخل القيم الفعلية في تاب «المتابعة اليومية» لتفعيل نظام الشارات."}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })()}
    </>
  );
}

// ─── Employee KPI Tab (standalone exportable) ─────────────────────────────────
export function EmployeeKpiTab({ profileId, monthlySalary: _ms }: { profileId: number; monthlySalary?: number }) {
  const { isAdmin, isSuperAdmin, can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [kpiDialogOpen, setKpiDialogOpen] = useState(false);
  const [editingKpi, setEditingKpi] = useState<EmployeeKpi | undefined>();
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const today = new Date().toISOString().slice(0, 10);
  const [kpiViewMode, setKpiViewMode] = useState<"monthly" | "daily">("monthly");
  const [kpiSelectedDate, setKpiSelectedDate] = useState(today);

  const { data: kpis = [], isLoading: kpisLoading } = useQuery({
    queryKey: ["employee-kpis", profileId],
    queryFn: () => employeeApi.listKpis(profileId),
  });
  const { data: fullProfile } = useQuery({
    queryKey: ["employee-profile", profileId],
    queryFn: () => employeeApi.getProfile(profileId),
  });
  const { data: monthlyReport, isLoading: reportLoading } = useQuery({
    queryKey: ["employee-report", profileId, reportMonth],
    queryFn: () => employeeApi.getReport(profileId, reportMonth),
  });
  const { data: dailyReportKpi } = useQuery({
    queryKey: ["employee-report-kpi-daily", profileId, kpiSelectedDate],
    queryFn: () => employeeApi.getReport(profileId, undefined, "daily", kpiSelectedDate),
    enabled: kpiViewMode === "daily",
    staleTime: 60_000,
  });
  const report = kpiViewMode === "daily" ? dailyReportKpi : monthlyReport;
  const { data: salaryReport } = useQuery({
    queryKey: ["salary-report", profileId, reportMonth],
    queryFn: () => attendanceApi.salaryReport(profileId, reportMonth),
    enabled: !!profileId,
  });

  const deleteKpi = async (kpiId: number) => {
    if (!confirm("حذف هذا المؤشر؟")) return;
    try {
      await employeeApi.deleteKpi(kpiId);
      qc.invalidateQueries({ queryKey: ["employee-kpis", profileId] });
      qc.invalidateQueries({ queryKey: ["employee-report", profileId] });
      toast({ title: "تم حذف المؤشر" });
    } catch (e: any) { toast({ title: "خطأ", description: e.message, variant: "destructive" }); }
  };

  return (
    <div className="space-y-4">
      {/* Dialog */}
      <KpiFormDialog
        open={kpiDialogOpen}
        onClose={() => { setKpiDialogOpen(false); setEditingKpi(undefined); }}
        profileId={profileId}
        existing={editingKpi}
        onSuccess={() => {
          qc.invalidateQueries({ queryKey: ["employee-kpis", profileId] });
          qc.invalidateQueries({ queryKey: ["employee-report", profileId] });
          setKpiDialogOpen(false); setEditingKpi(undefined);
        }}
      />

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-bold">لوحة مؤشرات الأداء</p>
          <p className="text-[10px] text-muted-foreground">
            {kpiViewMode === "daily"
              ? `أداء يوم ${new Date(kpiSelectedDate + "T00:00:00").toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}`
              : "نظرة شاملة على أداء الموظف ومؤشراته الشهرية"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-muted/20">
            {(["monthly", "daily"] as const).map(mode => (
              <button key={mode} type="button" onClick={() => setKpiViewMode(mode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${kpiViewMode === mode ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {mode === "monthly" ? "شهري" : "يومي"}
              </button>
            ))}
          </div>
          {kpiViewMode === "daily" ? (
            <input type="date" value={kpiSelectedDate} max={today} onChange={e => setKpiSelectedDate(e.target.value)}
              className="rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-primary" />
          ) : (
            <select value={reportMonth} onChange={e => setReportMonth(e.target.value)}
              className="rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-primary">
              {Array.from({ length: 12 }, (_, i) => {
                const d = new Date(); d.setMonth(d.getMonth() - i);
                const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                return <option key={val} value={val}>{d.toLocaleDateString("ar-EG", { month: "long", year: "numeric" })}</option>;
              })}
            </select>
          )}
          {isAdmin && (
            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { setEditingKpi(undefined); setKpiDialogOpen(true); }}>
              <Plus className="w-3 h-3" />إضافة مؤشر
            </Button>
          )}
        </div>
      </div>

      {(kpisLoading || reportLoading) && <p className="text-center text-muted-foreground text-xs py-6">جاري التحميل...</p>}

      {!kpisLoading && kpis.length === 0 && (
        <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-bold">لا توجد مؤشرات أداء بعد</p>
        </div>
      )}

      {!kpisLoading && kpis.length > 0 && report && (() => {
        const ratingCfg = RATING_CONFIG[report.rating ?? "غير محدد"] ?? RATING_CONFIG["غير محدد"];
        return (
          <KpiTabContent
            profileId={profileId}
            kpis={kpis}
            report={report}
            fullProfile={fullProfile}
            salaryReport={salaryReport}
            ratingCfg={ratingCfg}
            kpiViewMode={kpiViewMode}
            kpiSelectedDate={kpiSelectedDate}
            reportMonth={reportMonth}
            isAdmin={isAdmin}
            isSuperAdmin={isSuperAdmin}
            setEditingKpi={setEditingKpi}
            setKpiDialogOpen={setKpiDialogOpen}
            deleteKpi={deleteKpi}
            displayName={fullProfile?.displayName ?? "الموظف"}
          />
        );
      })()}
    </div>
  );
}

// ─── Employee Detail ──────────────────────────────────────────────────────────
function EmployeeDetail({
  profileId, displayName, isSystemUser, username, onBack,
}: {
  profileId: number; displayName: string; isSystemUser: boolean; username?: string | null; onBack?: () => void;
}) {
  const { isAdmin, isSuperAdmin, can } = useAuth();
  const canSalaries   = isAdmin || can("team.salaries");
  const canPerformance = isAdmin || can("team.performance");
  const canManage     = isAdmin || can("team.manage");
  const { toast } = useToast();
  const qc = useQueryClient();
  const [profileOpen, setProfileOpen] = useState(false);
  const [kpiDialogOpen, setKpiDialogOpen] = useState(false);
  const [editingKpi, setEditingKpi] = useState<EmployeeKpi | undefined>();
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const today = new Date().toISOString().slice(0, 10);
  const [kpiViewMode, setKpiViewMode] = useState<"monthly" | "daily">("monthly");
  const [kpiSelectedDate, setKpiSelectedDate] = useState(today);

  const { data: kpis = [], isLoading: kpisLoading } = useQuery({
    queryKey: ["employee-kpis", profileId],
    queryFn: () => employeeApi.listKpis(profileId),
  });

  const { data: fullProfile } = useQuery({
    queryKey: ["employee-profile", profileId],
    queryFn: () => employeeApi.getProfile(profileId),
  });

  const { data: monthlyReport, isLoading: reportLoading } = useQuery({
    queryKey: ["employee-report", profileId, reportMonth],
    queryFn: () => employeeApi.getReport(profileId, reportMonth),
  });

  const { data: dailyReportKpi } = useQuery({
    queryKey: ["employee-report-kpi-daily", profileId, kpiSelectedDate],
    queryFn: () => employeeApi.getReport(profileId, undefined, "daily", kpiSelectedDate),
    enabled: kpiViewMode === "daily",
    staleTime: 60_000,
  });

  const report = kpiViewMode === "daily" ? dailyReportKpi : monthlyReport;

  const { data: salaryReport } = useQuery({
    queryKey: ["salary-report", profileId, reportMonth],
    queryFn: () => {
      if (!profileId) return null;
      return attendanceApi.salaryReport(profileId, reportMonth);
    },
    enabled: !!profileId,
  });

  const deleteKpi = async (kpiId: number) => {
    if (!confirm("حذف هذا المؤشر؟")) return;
    try {
      await employeeApi.deleteKpi(kpiId);
      qc.invalidateQueries({ queryKey: ["employee-kpis", profileId] });
      qc.invalidateQueries({ queryKey: ["employee-report", profileId] });
      toast({ title: "تم حذف المؤشر" });
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    }
  };

  const ratingCfg = RATING_CONFIG[report?.rating ?? "غير محدد"] ?? RATING_CONFIG["غير محدد"];
  const periodLabel = report?.period.month
    ? new Date(
        parseInt(report.period.month.split("-")[0]),
        parseInt(report.period.month.split("-")[1]) - 1,
        1
      ).toLocaleDateString("ar-EG", { month: "long", year: "numeric" })
    : "—";

  // ── حساب تأثير KPI على الراتب ─────────────────────────────────────────────
  const baseSalary = report?.salary ?? 0;
  const kpiFinancials = report?.kpiFinancials ?? {
    totalSalaryWeight: (report?.kpis ?? []).reduce((sum, k) => sum + (k.salaryWeight ?? 0), 0),
    salaryAtRiskPercent: (report?.kpis ?? []).reduce((sum, k) => sum + (k.salaryWeight ?? 0), 0),
    totalDeduction: (report?.kpis ?? [])
      .filter(k => k.achieved === false && (k.salaryWeight ?? 0) > 0)
      .reduce((sum, k) => sum + Math.round(((k.salaryWeight ?? 0) / 100) * baseSalary), 0),
    totalBonus: (report?.kpis ?? [])
      .filter(k => k.score !== null && k.score > 100 && (k.overtargetBonus ?? 0) > 0)
      .reduce((sum, k) => sum + Math.round(((k.overtargetBonus ?? 0) / 100) * baseSalary), 0),
    achievedCount: (report?.kpis ?? []).filter(k => k.achieved === true).length,
    failedCount: (report?.kpis ?? []).filter(k => k.achieved === false).length,
    overTargetCount: (report?.kpis ?? []).filter(k => k.score !== null && k.score > 100).length,
  };
  const kpiDeductions = kpiFinancials.totalDeduction;
  const kpiBonuses = kpiFinancials.totalBonus;
  const kpiAchievedCount = kpiFinancials.achievedCount;
  const kpiFailedCount = kpiFinancials.failedCount;
  const kpiOverTargetCount = kpiFinancials.overTargetCount;

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Back button + name */}
      <div className="flex items-center gap-3">
        {onBack && (
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div>
          <h2 className="text-base font-bold">{displayName}</h2>
          <p className="text-xs text-muted-foreground">
            {fullProfile?.jobTitle && <span>{fullProfile.jobTitle}</span>}
            {fullProfile?.department && <span> — {fullProfile.department}</span>}
            {!fullProfile?.jobTitle && !fullProfile?.department && (
              isSystemUser && username ? <span>@{username}</span> : <span className="text-amber-400">عضو فريق · بدون حساب نظام</span>
            )}
          </p>
        </div>
        <div className="mr-auto flex items-center gap-2">
          {!isSystemUser && (
            <Badge variant="outline" className="text-[9px] h-5 border-amber-700 text-amber-400">فريق فقط</Badge>
          )}
          {isAdmin && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setProfileOpen(true)}>
              <Edit2 className="w-3 h-3" />تعديل البيانات
            </Button>
          )}
        </div>
      </div>

      <Tabs defaultValue="my-dashboard">
        {/* ── TabsList متجاوب — scroll أفقي على الموبايل ── */}
        <div className="overflow-x-auto no-scrollbar -mx-1 px-1">
          <TabsList className="h-9 text-xs flex w-max min-w-full sm:w-full gap-0.5 p-1 rounded-xl bg-muted/40 dark:bg-black/30 border border-border/50 backdrop-blur-sm">
            <TabsTrigger value="my-dashboard" className="text-xs px-3 rounded-lg whitespace-nowrap transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_rgba(99,102,241,0.3),0_2px_8px_rgba(0,0,0,0.15)] dark:data-[state=active]:shadow-[0_0_16px_rgba(99,102,241,0.45),0_2px_10px_rgba(0,0,0,0.4)]">🏠 لوحتي</TabsTrigger>
            {isSystemUser  && <TabsTrigger value="my-orders"   className="text-xs px-3 rounded-lg whitespace-nowrap transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_rgba(99,102,241,0.3),0_2px_8px_rgba(0,0,0,0.15)] dark:data-[state=active]:shadow-[0_0_16px_rgba(99,102,241,0.45),0_2px_10px_rgba(0,0,0,0.4)]">📦 طلباتي</TabsTrigger>}
            {canSalaries   && <TabsTrigger value="attendance" className="text-xs px-3 rounded-lg whitespace-nowrap transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_rgba(99,102,241,0.3),0_2px_8px_rgba(0,0,0,0.15)] dark:data-[state=active]:shadow-[0_0_16px_rgba(99,102,241,0.45),0_2px_10px_rgba(0,0,0,0.4)]">الحضور والمرتب</TabsTrigger>}
            {canManage     && <TabsTrigger value="daily"      className="text-xs px-3 rounded-lg whitespace-nowrap transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_rgba(99,102,241,0.3),0_2px_8px_rgba(0,0,0,0.15)] dark:data-[state=active]:shadow-[0_0_16px_rgba(99,102,241,0.45),0_2px_10px_rgba(0,0,0,0.4)]">متابعة يومية</TabsTrigger>}
            {canPerformance && <TabsTrigger value="kpis"      className="text-xs px-3 rounded-lg whitespace-nowrap transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_rgba(99,102,241,0.3),0_2px_8px_rgba(0,0,0,0.15)] dark:data-[state=active]:shadow-[0_0_16px_rgba(99,102,241,0.45),0_2px_10px_rgba(0,0,0,0.4)]">مؤشرات الأداء</TabsTrigger>}
            {canPerformance && <TabsTrigger value="report"    className="text-xs px-3 rounded-lg whitespace-nowrap transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_rgba(99,102,241,0.3),0_2px_8px_rgba(0,0,0,0.15)] dark:data-[state=active]:shadow-[0_0_16px_rgba(99,102,241,0.45),0_2px_10px_rgba(0,0,0,0.4)]">التقرير الشهري</TabsTrigger>}
            {isSuperAdmin && <TabsTrigger value="star-employees" className="text-xs px-3 rounded-lg whitespace-nowrap transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_rgba(99,102,241,0.3),0_2px_8px_rgba(0,0,0,0.15)] dark:data-[state=active]:shadow-[0_0_16px_rgba(99,102,241,0.45),0_2px_10px_rgba(0,0,0,0.4)]">🏆 نجوم الشهر</TabsTrigger>}
            <TabsTrigger value="profile" className="text-xs px-3 rounded-lg whitespace-nowrap transition-all duration-200 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-[0_0_12px_rgba(99,102,241,0.3),0_2px_8px_rgba(0,0,0,0.15)] dark:data-[state=active]:shadow-[0_0_16px_rgba(99,102,241,0.45),0_2px_10px_rgba(0,0,0,0.4)]">الملف الشخصي</TabsTrigger>
          </TabsList>
        </div>

        {/* ─── My Dashboard Tab ─── */}
        <TabsContent value="my-dashboard" className="space-y-3 mt-3">
          <MyDashboardTab
            profileId={profileId}
            monthlySalary={fullProfile?.monthlySalary ?? 0}
          />
        </TabsContent>

        {/* ─── My Orders Tab ─── */}
        {isSystemUser && (
          <TabsContent value="my-orders" className="space-y-3 mt-3">
            <MyOrdersTab
              profileId={profileId}
              displayName={displayName}
              reportMonth={reportMonth}
              onMonthChange={setReportMonth}
              kpis={kpis}
              monthlyScore={report?.overallScore ?? null}
              dailyScore={dailyReportKpi?.overallScore ?? null}
              selectedDate={kpiSelectedDate}
            />
          </TabsContent>
        )}

        {/* ─── Attendance Tab ─── */}
        {canSalaries && (
        <TabsContent value="attendance" className="space-y-3 mt-3">
          <AttendanceTab
            profileId={profileId}
            monthlySalary={fullProfile?.monthlySalary ?? 0}
            isAdmin={isAdmin}
          />
        </TabsContent>
        )}

        {/* ─── Daily Tracker Tab ─── */}
        {canManage && (
        <TabsContent value="daily" className="space-y-3 mt-3">
          <DailyTrackerTab profileId={profileId} />
        </TabsContent>
        )}

        {/* ─── KPIs Tab ─── */}
        {canPerformance && (
        <TabsContent value="kpis" className="space-y-4 mt-3">

          {/* ── Header ── */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-bold">لوحة مؤشرات الأداء</p>
              <p className="text-[10px] text-muted-foreground">
                {kpiViewMode === "daily"
                  ? `أداء يوم ${new Date(kpiSelectedDate + "T00:00:00").toLocaleDateString("ar-EG", { weekday: "long", day: "numeric", month: "long" })}`
                  : "نظرة شاملة على أداء الموظف ومؤشراته الشهرية"}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Toggle يومي/شهري */}
              <div className="flex items-center gap-1 p-1 rounded-xl border border-border bg-muted/20">
                {(["monthly", "daily"] as const).map(mode => (
                  <button key={mode} type="button" onClick={() => setKpiViewMode(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      kpiViewMode === mode ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}>
                    {mode === "monthly" ? "شهري" : "يومي"}
                  </button>
                ))}
              </div>
              {/* date/month picker */}
              {kpiViewMode === "daily" ? (
                <input type="date" value={kpiSelectedDate} max={today}
                  onChange={e => setKpiSelectedDate(e.target.value)}
                  className="rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-primary" />
              ) : (
                <select value={reportMonth} onChange={e => setReportMonth(e.target.value)}
                  className="rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs font-medium focus:outline-none focus:border-primary">
                  {Array.from({ length: 12 }, (_, i) => {
                    const d = new Date(); d.setMonth(d.getMonth() - i);
                    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                    return <option key={val} value={val}>{d.toLocaleDateString("ar-EG", { month: "long", year: "numeric" })}</option>;
                  })}
                </select>
              )}
              {isAdmin && (
                <Button size="sm" className="h-7 text-xs gap-1" onClick={() => { setEditingKpi(undefined); setKpiDialogOpen(true); }}>
                  <Plus className="w-3 h-3" />إضافة مؤشر
                </Button>
              )}
            </div>
          </div>

          {kpisLoading && <p className="text-center text-muted-foreground text-xs py-6">جاري التحميل...</p>}

          {!kpisLoading && kpis.length === 0 && (
            <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl">
              <Target className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-sm font-bold">لا توجد مؤشرات أداء بعد</p>
              {isAdmin && <p className="text-xs mt-1 text-muted-foreground/70">أضف مؤشرات لتتبع وتقييم أداء هذا الموظف</p>}
            </div>
          )}

          {!kpisLoading && kpis.length > 0 && (() => {
            const salary = fullProfile?.monthlySalary ?? 0;
            const ratingCfgLocal = RATING_CONFIG[report?.rating ?? "غير محدد"] ?? RATING_CONFIG["غير محدد"];
            const activeKpis = kpis.filter(k => k.isActive);
            const evaluatedKpis = report?.kpis ?? [];
            const evaluatedById = new Map(evaluatedKpis.map(k => [k.id, k]));
            const totalSW = activeKpis.reduce((s, k) => s + (k.salaryWeight ?? 0), 0);
            const totalOT = activeKpis.reduce((s, k) => s + (k.overtargetBonus ?? 0), 0);
            const totalDeduction = salary > 0 ? Math.round((totalSW / 100) * salary) : 0;
            const totalBonus = salary > 0 ? Math.round((totalOT / 100) * salary) : 0;
            const achievedCount = evaluatedKpis.filter(k => k.achieved === true).length;
            const failedCount = evaluatedKpis.filter(k => k.achieved === false).length;
            const overTargetCount = evaluatedKpis.filter(k => k.score !== null && k.score > 100).length;
            const scoredKpis = evaluatedKpis.filter(k => k.score !== null && Number.isFinite(k.score));
            // Use backend overallScore (weighted, includes manual cumulative) — fallback to local simple avg
            const overallScore = report?.overallScore ?? (scoredKpis.length > 0
              ? Math.round(scoredKpis.reduce((s, k) => s + Math.min(k.score ?? 0, 100), 0) / scoredKpis.length)
              : null);

            // Radar data — كفاءات المؤشرات
            const radarData = activeKpis.map(k => ({
              subject: k.name.length > 6 ? k.name.slice(0, 6) + "…" : k.name,
              value: Math.min(evaluatedById.get(k.id)?.score ?? (k.salaryWeight ?? 0), 100),
              fullName: k.name,
            }));

            // Bar data — تقييم ربعي
            const barData = activeKpis.slice(0, 4).map(k => ({
              name: k.name.length > 8 ? k.name.slice(0, 8) + "…" : k.name,
              "تقييم الأداء الحالي": Math.min(evaluatedById.get(k.id)?.score ?? 0, 100),
              "المتوسط العام": 70,
            }));

            // مؤشرات تشغيلية للبطاقة 4
            const opMetrics = activeKpis.slice(0, 3).map(k => ({
              label: k.name,
              value: evaluatedById.get(k.id)?.score !== null && evaluatedById.get(k.id)?.score !== undefined
                ? `${Math.min(Math.round(evaluatedById.get(k.id)!.score ?? 0), 100)}%`
                : "—",
              achieved: evaluatedById.get(k.id)?.achieved,
              isOT: (evaluatedById.get(k.id)?.score ?? 0) > 100,
              icon: k.direction === "higher_is_better" ? TrendingUp : TrendingDown,
            }));
            const kpiOverviewCards = [
              { label: "إجمالي KPI", value: kpis.length, note: `${activeKpis.length} نشط`, color: "text-primary", bg: "bg-primary/5", border: "border-primary/20" },
              { label: "وزن الراتب", value: `${totalSW}%`, note: fmt(totalDeduction), color: "text-amber-500", bg: "bg-amber-500/8", border: "border-amber-500/20" },
              { label: "محقق", value: achievedCount, note: `${Math.min(Math.round((achievedCount / Math.max(evaluatedKpis.length, 1)) * 100), 100)}%`, color: "text-emerald-500", bg: "bg-emerald-500/8", border: "border-emerald-500/20" },
              { label: "يحتاج تحسين", value: failedCount, note: `${overTargetCount} OT`, color: "text-red-500", bg: "bg-red-500/8", border: "border-red-500/20" },
            ];

            return (
              <>
                <Card className="border-border/60 bg-gradient-to-br from-background via-card to-primary/5 overflow-hidden">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                      <div className="space-y-1">
                        <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[10px] font-bold text-muted-foreground">
                          <Target className="w-3 h-3 text-primary" />
                          {kpiViewMode === "daily" ? `أداء يوم ${kpiSelectedDate}` : "لوحة مؤشرات الأداء الشهرية"}
                        </div>
                        <h3 className="text-lg font-black leading-tight">مراجعة سريعة لأداء {displayName}</h3>
                        <p className="text-xs text-muted-foreground max-w-2xl">
                          عرض احترافي يربط الأداء التشغيلي بالمؤشرات المالية، مع تتبع واضح للمحقق وغير المحقق والمكافآت.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-2 text-center min-w-[110px]">
                          <p className="text-[10px] text-muted-foreground">التقييم الإجمالي</p>
                          <p className="text-lg font-black text-primary">{overallScore !== null ? `${overallScore}%` : "—"}</p>
                        </div>
                        <div className={`rounded-2xl border px-3 py-2 text-center min-w-[110px] ${ratingCfg.bg} ${ratingCfg.color}`}>
                          <p className="text-[10px] opacity-80">النتيجة</p>
                          <p className="text-sm font-black">{ratingCfg.label}</p>
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
                      {kpiOverviewCards.map(card => (
                        <div key={card.label} className={`rounded-2xl border ${card.border} ${card.bg} px-3 py-3`}>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[10px] text-muted-foreground">{card.label}</p>
                              <p className={`text-lg font-black ${card.color}`}>{card.value}</p>
                            </div>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-background/70 border border-border/50`}>
                              <div className={`w-2.5 h-2.5 rounded-full ${card.color.replace("text-", "bg-")}`} />
                            </div>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1">{card.note}</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* ══ ROW 1: نظرة عامة + الرسوم ══ */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">

                  {/* بطاقة 1 — التقدم نحو الأهداف (Progress Ring) */}
                  <Card className="relative overflow-hidden border-border bg-card">
                    <div className="absolute top-2 right-2.5 text-[9px] font-black text-muted-foreground/40">1</div>
                    <CardContent className="px-4 py-4 sm:py-5 flex flex-col items-center gap-3">
                      <div className="flex items-center justify-between w-full">
                        <p className="text-xs font-bold text-foreground">التقدم نحو الأهداف</p>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          overallScore !== null && overallScore >= 80 ? "bg-emerald-500/10 text-emerald-500" :
                          overallScore !== null && overallScore >= 60 ? "bg-amber-500/10 text-amber-500" :
                          "bg-red-500/10 text-red-500"
                        }`}>
                          {overallScore !== null && overallScore >= 80 ? "ممتاز" : overallScore !== null && overallScore >= 60 ? "جيد" : "يحتاج تحسين"}
                        </span>
                      </div>
                      <div className="flex flex-col md:flex-row items-center gap-4 md:gap-5 w-full">
                        <div className="relative w-28 h-28 shrink-0">
                          <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
                            <circle cx="48" cy="48" r="38" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
                            <circle cx="48" cy="48" r="38" fill="none"
                              stroke={overallScore !== null && overallScore >= 80 ? "#10B981" : overallScore !== null && overallScore >= 60 ? "#c9a227" : "#EF4444"}
                              strokeWidth="8"
                              strokeDasharray={`${(overallScore ?? 0) * 2.388} 238.8`}
                              strokeLinecap="round" />
                          </svg>
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-xl font-black leading-none">{overallScore !== null ? `${overallScore}%` : "—"}</span>
                            <span className="text-[9px] text-muted-foreground mt-0.5">المتوسط الشهري</span>
                          </div>
                        </div>
                        <div className="flex-1 w-full space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            {[
                              { label: "محقق", value: achievedCount, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                              { label: "غير محقق", value: failedCount, color: "text-red-500", bg: "bg-red-500/10" },
                              { label: "OT", value: overTargetCount, color: "text-blue-500", bg: "bg-blue-500/10" },
                            ].map(item => (
                              <div key={item.label} className={`rounded-xl border border-border/50 ${item.bg} px-3 py-2 text-center`}>
                                <p className={`text-base font-black ${item.color}`}>{item.value}</p>
                                <p className="text-[9px] text-muted-foreground">{item.label}</p>
                              </div>
                            ))}
                          </div>
                          <div className="space-y-1.5 pt-1">
                            {activeKpis.slice(0, 3).map(k => {
                              const sc = Math.min(evaluatedById.get(k.id)?.score ?? 0, 100);
                              return (
                                <div key={k.id} className="rounded-lg border border-border/40 bg-muted/10 px-3 py-2">
                                  <div className="flex items-center justify-between text-[9px] mb-1">
                                    <span className="text-muted-foreground truncate max-w-[68%]">{k.name}</span>
                                    <span className="font-bold">{sc}%</span>
                                  </div>
                                  <div className="w-full h-1.5 rounded-full bg-muted/40 overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-700"
                                      style={{ width: `${sc}%`, background: sc >= 80 ? "#10B981" : sc >= 60 ? "#c9a227" : "#EF4444" }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* الرسوم — Bar دائماً + Radar لو >= 3 مؤشرات */}
                  <>
                    {barData.length > 0 && (
                      <Card className="relative overflow-hidden border-border bg-card">
                        <div className="absolute top-2 right-2.5 text-[9px] font-black text-muted-foreground/40">2</div>
                        <CardContent className="px-3 py-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="text-xs font-bold text-foreground">تقييم الأداء الربعي</p>
                              <p className="text-[9px] text-muted-foreground">مقارنة الأداء الحالي مع المرجع العام</p>
                            </div>
                            <div className="flex flex-col items-end gap-0.5">
                              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                                <span className="w-2 h-2 rounded-sm bg-primary inline-block" />الأداء الحالي
                              </div>
                              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                                <span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />المرجع
                              </div>
                            </div>
                          </div>
                          {overallScore !== null && (
                            <div className="flex items-center gap-0.5 mb-2 justify-end">
                              {[1,2,3,4,5].map(s => (
                                <Star key={s} className={`w-3 h-3 ${s <= Math.round(overallScore / 20) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                              ))}
                              <span className="text-[9px] text-muted-foreground mr-1">
                                {overallScore >= 90 ? "ممتاز" : overallScore >= 75 ? "جيد جداً" : overallScore >= 60 ? "جيد" : "مقبول"}
                              </span>
                            </div>
                          )}
                          <ResponsiveContainer width="100%" height={radarData.length >= 3 ? 140 : 180}>
                            <LineChart data={barData} margin={{ top: 8, right: 8, bottom: 2, left: -20 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                              <XAxis dataKey="name" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                              <YAxis tick={{ fontSize: 7, fill: "hsl(var(--muted-foreground))" }} domain={[0, 100]} axisLine={false} tickLine={false} />
                              <Tooltip
                                formatter={(v: any, n: string) => [`${v}%`, n]}
                                contentStyle={{
                                  fontSize: 10,
                                  background: "hsl(var(--card))",
                                  border: "1px solid hsl(var(--border))",
                                  borderRadius: 8,
                                  direction: "rtl",
                                  color: "hsl(var(--foreground))",
                                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                }}
                                labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 9 }}
                                cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }}
                              />
                              <Line
                                type="monotone"
                                dataKey="تقييم الأداء الحالي"
                                stroke="hsl(var(--primary))"
                                strokeWidth={2.5}
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 0 }}
                              />
                              <Line
                                type="monotone"
                                dataKey="المتوسط العام"
                                stroke="#10B981"
                                strokeWidth={2}
                                strokeDasharray="4 2"
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 0 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                          {/* Radar مدمج هنا لو المؤشرات أقل من 3 أو بعد الـ Bar */}
                          {radarData.length >= 3 && (
                            <>
                              <div className="mt-3 pt-3 border-t border-border/30">
                                <p className="text-[9px] text-muted-foreground mb-1">تطور الكفاءات الأساسية</p>
                                <ResponsiveContainer width="100%" height={150}>
                                  <RadarChart data={radarData} margin={{ top: 5, right: 20, bottom: 5, left: 20 }}>
                                    <PolarGrid stroke="hsl(var(--border))" />
                                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
                                    <Tooltip
                                      contentStyle={{
                                        fontSize: 10,
                                        background: "hsl(var(--card))",
                                        border: "1px solid hsl(var(--border))",
                                        borderRadius: 8,
                                        color: "hsl(var(--foreground))",
                                        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                                      }}
                                      labelStyle={{ color: "hsl(var(--muted-foreground))", fontSize: 9 }}
                                    />
                                    <Radar name="الأداء" dataKey="value" stroke="#c9a227" fill="#c9a227" fillOpacity={0.3} strokeWidth={2} dot={{ fill: "#c9a227", r: 2 }} />
                                  </RadarChart>
                                </ResponsiveContainer>
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    )}
                  </>
                </div>

                {/* ══ ROW 2: بطاقتان — مؤشرات تشغيلية + ملخص مالي ══ */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">

                  {/* بطاقة 4 — مؤشرات الأداء التشغيلي — تظهر فقط لو في مؤشرات */}
                  {opMetrics.length > 0 && (
                  <Card className="relative overflow-hidden border-border bg-card">
                    <div className="absolute top-2 right-2.5 text-[9px] font-black text-muted-foreground/40">4</div>
                    <CardContent className="px-4 py-4">
                      <p className="text-xs font-bold text-foreground mb-3">مؤشرات الأداء التشغيلي</p>
                      <div className="space-y-2.5">
                        {opMetrics.map((m, i) => (
                          <div key={i} className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground truncate max-w-[55%]">{m.label}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-black">{m.value}</span>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                m.isOT ? "bg-blue-500/15" : m.achieved === true ? "bg-emerald-500/15" : m.achieved === false ? "bg-red-500/15" : "bg-muted/30"
                              }`}>
                                <m.icon className={`w-3 h-3 ${
                                  m.isOT ? "text-blue-500" : m.achieved === true ? "text-emerald-500" : m.achieved === false ? "text-red-500" : "text-muted-foreground"
                                }`} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {overallScore !== null && (
                        <div className="mt-3 pt-2.5 border-t border-border/30">
                          <p className="text-[10px] font-bold text-muted-foreground mb-0.5">التعليقات والملاحظات</p>
                          <p className="text-[10px] text-muted-foreground/80">
                            {overallScore >= 90 ? "🌟 أداء استثنائي هذا الشهر، استمر في الإبداع!" :
                             overallScore >= 75 ? "👍 أداء فوق المتوسط، يحتاج تعزيز بعض الجوانب" :
                             overallScore >= 60 ? "✅ أداء مقبول، مع وجود فرص للتطوير" :
                             "⚠️ يحتاج الموظف إلى دعم وتحسين في المؤشرات"}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                  )}

                  {/* بطاقة 5 — الملخص المالي KPI */}
                  <Card className="relative overflow-hidden border-border bg-card">
                    <div className="absolute top-2 right-2.5 text-[9px] font-black text-muted-foreground/40">5</div>
                    <CardContent className="px-4 py-4">
                      <p className="text-xs font-bold text-foreground mb-3">الملخص المالي للمؤشرات</p>
                      {salary > 0 ? (
                        <div className="space-y-2">
                          {[
                            { label: "الراتب الأساسي", value: fmt(salary), color: "text-foreground", bg: "bg-muted/20" },
                            { label: "إجمالي KPI من الراتب", value: `${totalSW}%`, sub: fmt(totalDeduction), color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/8" },
                            { label: "عند قصور كامل", value: fmt(salary - totalDeduction), color: "text-red-500", bg: "bg-red-500/8" },
                            ...(totalBonus > 0 ? [{ label: "مع Over Target", value: fmt(salary + totalBonus), color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/8" }] : []),
                          ].map((row, i) => (
                            <div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2 ${row.bg}`}>
                              <span className="text-[10px] text-muted-foreground">{row.label}</span>
                              <div className="text-right">
                                <span className={`text-xs font-black ${row.color}`}>{row.value}</span>
                                {(row as any).sub && <p className="text-[8px] text-muted-foreground">{(row as any).sub}</p>}
                              </div>
                            </div>
                          ))}
                          <div className="grid grid-cols-3 gap-1.5 pt-1">
                            {[
                              { label: "محقق", val: achievedCount, color: "text-emerald-600", bg: "bg-emerald-500/10" },
                              { label: "لم يتحقق", val: failedCount, color: "text-red-500", bg: "bg-red-500/10" },
                              { label: "Over Target", val: overTargetCount, color: "text-blue-600", bg: "bg-blue-500/10" },
                            ].map(s => (
                              <div key={s.label} className={`rounded-lg py-2 text-center ${s.bg}`}>
                                <p className={`text-base font-black ${s.color}`}>{s.val}</p>
                                <p className="text-[8px] text-muted-foreground">{s.label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-6">
                          <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-20" />
                          <p className="text-xs text-muted-foreground">لم يُحدد الراتب الأساسي بعد</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-1">أضف الراتب في تعديل بيانات الموظف لرؤية التأثير المالي</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                {/* ══ KPI Detail Cards ══ */}
                <div>
                  <h3 className="text-xs font-bold text-muted-foreground mb-3 flex items-center gap-1.5">
                    <Settings className="w-3.5 h-3.5" />مؤشرات الأداء التفصيلية
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {kpis.map((kpi, idx) => {
                      const salaryW = kpi.salaryWeight ?? 0;
                      const otBonus = kpi.overtargetBonus ?? 0;
                      const kpiAmt = salary > 0 && salaryW > 0 ? Math.round((salaryW / 100) * salary) : 0;
                      const bonusAmt = salary > 0 && otBonus > 0 ? Math.round((otBonus / 100) * salary) : 0;
                      const evalKpi = evaluatedById.get(kpi.id);
                      const isOT = (evalKpi?.score ?? 0) > 100;
                      const isAchieved = evalKpi?.achieved === true;
                      const isFailed = evalKpi?.achieved === false;

                      const colorMap: Record<string, { accent: string; iconBg: string; iconColor: string; badgeBg: string; badgeText: string }> = {
                        delivery_rate: { accent: "bg-emerald-500", iconBg: "bg-emerald-50 dark:bg-emerald-900/30", iconColor: "text-emerald-600 dark:text-emerald-400", badgeBg: "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-700/40", badgeText: "text-emerald-700 dark:text-emerald-300" },
                        return_rate:   { accent: "bg-red-500",     iconBg: "bg-red-50 dark:bg-red-900/30",         iconColor: "text-red-600 dark:text-red-400",         badgeBg: "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700/40",         badgeText: "text-red-700 dark:text-red-300" },
                        total_orders:  { accent: "bg-blue-500",    iconBg: "bg-blue-50 dark:bg-blue-900/30",        iconColor: "text-blue-600 dark:text-blue-400",        badgeBg: "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700/40",        badgeText: "text-blue-700 dark:text-blue-300" },
                        profit:        { accent: "bg-violet-500",  iconBg: "bg-violet-50 dark:bg-violet-900/30",    iconColor: "text-violet-600 dark:text-violet-400",    badgeBg: "bg-violet-50 dark:bg-violet-900/30 border-violet-200 dark:border-violet-700/40", badgeText: "text-violet-700 dark:text-violet-300" },
                        revenue:       { accent: "bg-amber-500",   iconBg: "bg-amber-50 dark:bg-amber-900/30",      iconColor: "text-amber-600 dark:text-amber-400",      badgeBg: "bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-700/40",      badgeText: "text-amber-700 dark:text-amber-300" },
                        manual:        { accent: "bg-primary",     iconBg: "bg-primary/10",                         iconColor: "text-primary",                            badgeBg: "bg-primary/5 border-primary/20",                                                      badgeText: "text-primary" },
                      };
                      const colors = colorMap[kpi.metric] ?? colorMap.manual;

                      const iconForMetric: Record<string, React.ReactNode> = {
                        delivery_rate: <TrendingUp className="w-4 h-4" />,
                        return_rate:   <TrendingDown className="w-4 h-4" />,
                        total_orders:  <Package className="w-4 h-4" />,
                        profit:        <DollarSign className="w-4 h-4" />,
                        revenue:       <BarChart2 className="w-4 h-4" />,
                        manual:        <Target className="w-4 h-4" />,
                      };

                      return (
                        <div key={kpi.id} className={`relative rounded-xl border border-border bg-card overflow-hidden transition-all duration-200 ${!kpi.isActive ? "opacity-40 grayscale" : "hover:shadow-lg hover:-translate-y-0.5"}`}>
                          <div className={`h-1 w-full ${colors.accent} opacity-80`} />
                          {(isOT || isAchieved || isFailed) && (
                            <div className={`px-3 py-1.5 flex items-center gap-1.5 text-[10px] font-bold border-b border-border/20 ${
                              isOT ? "bg-blue-500/10 text-blue-600 dark:text-blue-400" :
                              isAchieved ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
                                          "bg-red-500/10 text-red-700 dark:text-red-400"
                            }`}>
                              {isOT ? <><Trophy className="w-3 h-3" />Over Target — تجاوز الهدف 🏆</> :
                               isAchieved ? <><CheckCircle2 className="w-3 h-3" />تم تحقيق المؤشر ✅</> :
                                            <><XCircle className="w-3 h-3" />لم يتحقق المؤشر ❌</>}
                            </div>
                          )}
                          <div className="p-4">
                            <div className="flex items-start justify-between gap-2 mb-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colors.iconBg}`}>
                                  <span className={colors.iconColor}>{iconForMetric[kpi.metric] ?? <Target className="w-4 h-4" />}</span>
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-bold leading-tight truncate">{kpi.name}</p>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {kpi.direction === "higher_is_better" ? "↑ الأعلى أفضل" : "↓ الأدنى أفضل"}
                                    {" · "}وزن {kpi.weight}%
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5 shrink-0">
                                {!kpi.isActive && <span className="text-[9px] bg-muted text-muted-foreground rounded-full px-2 py-0.5 border border-border">معطل</span>}
                                {isAdmin && (
                                  <>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/60 hover:text-primary hover:bg-primary/5 rounded-lg"
                                      onClick={() => { setEditingKpi(kpi); setKpiDialogOpen(true); }}>
                                      <Edit2 className="w-3 h-3" />
                                    </Button>
                                    {isSuperAdmin && (
                                      <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/5 rounded-lg"
                                        onClick={() => deleteKpi(kpi.id)}>
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Row 2: الهدف الكمي */}
                            <div className={`flex items-center justify-between rounded-lg px-3 py-2 mb-3 border ${colors.badgeBg}`}>
                              <span className="text-[10px] text-muted-foreground">الهدف المطلوب</span>
                              <span className={`text-sm font-black ${colors.badgeText}`}>
                                {kpi.direction === "lower_is_better" ? "≤" : "≥"}{fmtNum(kpi.targetValue)} <span className="text-[10px] font-normal opacity-70">{kpi.unit}</span>
                              </span>
                            </div>

                            {/* Row 3: التأثير المالي — صف مقسم */}
                            {(salaryW > 0 || otBonus > 0) && (
                              <div className="grid grid-cols-2 gap-2 mb-3">
                                {salaryW > 0 ? (
                                  <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200/60 dark:border-red-700/30 px-2.5 py-2 text-center">
                                    <p className="text-[9px] text-red-500/80 mb-0.5">عند قصور</p>
                                    <p className="text-xs font-black text-red-600 dark:text-red-400">−{fmt(kpiAmt)}</p>
                                    <p className="text-[9px] text-red-400/70">{salaryW}% من الراتب</p>
                                  </div>
                                ) : (
                                  <div className="rounded-lg bg-muted/20 border border-border px-2.5 py-2 text-center opacity-40">
                                    <p className="text-[9px] text-muted-foreground mb-0.5">عند قصور</p>
                                    <p className="text-xs font-bold text-muted-foreground">—</p>
                                  </div>
                                )}
                                {otBonus > 0 ? (
                                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200/60 dark:border-emerald-700/30 px-2.5 py-2 text-center">
                                    <p className="text-[9px] text-emerald-500/80 mb-0.5">Over Target</p>
                                    <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">+{fmt(bonusAmt)}</p>
                                    <p className="text-[9px] text-emerald-400/70">+{otBonus}% مكافأة</p>
                                  </div>
                                ) : (
                                  <div className="rounded-lg bg-muted/20 border border-border px-2.5 py-2 text-center opacity-40">
                                    <p className="text-[9px] text-muted-foreground mb-0.5">Over Target</p>
                                    <p className="text-xs font-bold text-muted-foreground">—</p>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Row 4: Progress bar — نسبة وزن المؤشر */}
                            {salaryW > 0 && (
                              <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[9px] text-muted-foreground">نسبة تأثير المؤشر على الراتب</span>
                                  <span className="text-[9px] font-bold text-amber-600 dark:text-amber-400">{salaryW}%</span>
                                </div>
                                <div className="w-full h-1.5 rounded-full bg-muted/40 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${colors.accent} opacity-70 transition-all duration-700`}
                                    style={{ width: `${Math.min(100, salaryW)}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* ملاحظة */}
                            {kpi.description && (
                              <p className="text-[9px] text-muted-foreground/60 mt-2.5 italic leading-relaxed border-t border-border/30 pt-2">
                                {kpi.description}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ══ NEW: توصية ذكية + ملاحظة المدير + مقارنة الأشهر ══ */}

                {/* ─── Smart Recommendation Box ─── */}
                {overallScore !== null && (
                  <div className={`rounded-2xl border px-4 py-4 space-y-2 ${
                    overallScore >= 90 ? "bg-emerald-500/8 border-emerald-500/20" :
                    overallScore >= 70 ? "bg-amber-500/8 border-amber-500/20" :
                    "bg-red-500/8 border-red-500/20"
                  }`}>
                    <div className="flex items-center gap-2">
                      <Briefcase className={`w-4 h-4 shrink-0 ${overallScore >= 90 ? "text-emerald-500" : overallScore >= 70 ? "text-amber-500" : "text-red-500"}`} />
                      <p className="text-xs font-bold">توصية ذكية للسوبريوزر</p>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {overallScore >= 90
                        ? `🌟 ${displayName} يؤدي بشكل استثنائي. يُنصح بالنظر في ترقيته أو إسناد مهام قيادية إضافية. المكافأة المالية ستعزز الدافعية.`
                        : overallScore >= 80
                        ? `✅ أداء قوي من ${displayName}. يمكن الاعتماد عليه في المهام المعقدة. حدد معه هدفاً طموحاً للشهر القادم.`
                        : overallScore >= 70
                        ? `👍 أداء جيد لكن هناك فرص للتحسين. يُنصح بمراجعة المؤشرات الضعيفة معه في اجتماع قصير واضع تارجت واضح.`
                        : overallScore >= 50
                        ? `⚠️ الأداء تحت المتوسط. تحقق من الأسباب: هل هناك عقبات خارجية؟ ضع خطة تحسين ٣٠ يوم مع متابعة أسبوعية.`
                        : `🔴 أداء ضعيف ويحتاج تدخل فوري. اعقد اجتماع 1-on-1 عاجل. إذا استمر خلال شهر، ادرس إعادة التقييم الوظيفي.`
                      }
                    </p>
                  </div>
                )}

                {/* ─── Manager Comment Box ─── */}
                <Card className="border-border bg-card">
                  <CardContent className="px-4 py-4">
                    <div className="flex items-center gap-2 mb-3">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <p className="text-xs font-bold">ملاحظة المدير على المؤشرات</p>
                      <span className="text-[9px] text-muted-foreground/60 mr-auto">(تظهر في التقرير المطبوع)</span>
                    </div>
                    <ManagerKpiComment profileId={profileId} reportMonth={reportMonth} />
                  </CardContent>
                </Card>

                {/* ─── Monthly Trend: آخر 3 أشهر — شهري فقط ─── */}
                {kpiViewMode === "monthly" && (
                <Card className="border-border bg-card">
                  <CardContent className="px-4 py-4">
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="w-4 h-4 text-primary shrink-0" />
                      <p className="text-xs font-bold">مقارنة الأداء — آخر 3 أشهر</p>
                    </div>
                    <MonthlyTrend profileId={profileId} currentMonth={reportMonth} kpis={kpis} />
                  </CardContent>
                </Card>
                )}

                {/* ─── NEW 1: Performance Risk Matrix ─── */}
                {activeKpis.length > 0 && (() => {
                  // كل KPI يحصل على تصنيف في مصفوفة 2×2: التأثير المالي (محور X) × الأداء الحالي (محور Y)
                  const matrixKpis = activeKpis.map(k => {
                    const ev = evaluatedById.get(k.id);
                    const sc = ev?.score ?? null;
                    const salaryW = k.salaryWeight ?? 0;
                    const impact = salaryW >= 20 ? "high" : salaryW >= 10 ? "medium" : "low";
                    const perf = sc === null ? "unknown" : sc >= 80 ? "good" : sc >= 50 ? "warning" : "danger";
                    return { ...k, sc, impact, perf };
                  });

                  const zones = [
                    { key: "danger-high",   label: "🔴 خطر عالي الأولوية",  color: "bg-red-500/12 border-red-500/30",    textColor: "text-red-600 dark:text-red-400",    filter: (k: any) => k.perf === "danger" && k.impact === "high" },
                    { key: "danger-low",    label: "🟠 خطر منخفض التأثير",  color: "bg-orange-500/10 border-orange-500/25", textColor: "text-orange-600 dark:text-orange-400", filter: (k: any) => k.perf === "danger" && k.impact !== "high" },
                    { key: "warning-high",  label: "🟡 تحذير — راقبه",      color: "bg-amber-500/10 border-amber-500/25",  textColor: "text-amber-600 dark:text-amber-400",  filter: (k: any) => k.perf === "warning" && k.impact === "high" },
                    { key: "good",          label: "🟢 على المسار الصحيح",  color: "bg-emerald-500/10 border-emerald-500/25", textColor: "text-emerald-600 dark:text-emerald-400", filter: (k: any) => k.perf === "good" },
                  ];

                  return (
                    <Card className="border-border bg-card">
                      <CardContent className="px-4 py-4">
                        <div className="flex items-center gap-2 mb-4">
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                          <p className="text-xs font-bold">مصفوفة مخاطر المؤشرات</p>
                          <span className="text-[9px] text-muted-foreground/60 mr-auto">تصنيف حسب الأداء × التأثير المالي</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {zones.map(zone => {
                            const items = matrixKpis.filter(zone.filter);
                            if (items.length === 0) return null;
                            return (
                              <div key={zone.key} className={`rounded-xl border p-3 ${zone.color}`}>
                                <p className={`text-[10px] font-bold mb-2 ${zone.textColor}`}>{zone.label}</p>
                                <div className="space-y-1.5">
                                  {items.map(k => (
                                    <div key={k.id} className="flex items-center justify-between gap-2">
                                      <span className="text-[10px] truncate text-foreground/80">{k.name}</span>
                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {k.sc !== null && (
                                          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                                            k.sc >= 80 ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" :
                                            k.sc >= 50 ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" :
                                            "bg-red-500/20 text-red-600 dark:text-red-400"
                                          }`}>{k.sc}%</span>
                                        )}
                                        {(k.salaryWeight ?? 0) > 0 && (
                                          <span className="text-[9px] text-muted-foreground bg-muted/40 rounded-full px-1.5 py-0.5">{k.salaryWeight}%</span>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }).filter(Boolean)}
                          {zones.every(z => matrixKpis.filter(z.filter).length === 0) && (
                            <div className="col-span-2 text-center py-6 text-xs text-muted-foreground">
                              لا توجد بيانات كافية لعرض المصفوفة — أدخل القيم الفعلية للمؤشرات أولاً.
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })()}



                {/* ─── NEW 3: Achievement Badge Wall ─── */}
                {(() => {
                  // شارات الإنجاز تُحسب من الأداء الحالي
                  // helper: KPIs that have actual data (score != null)
                  const scoredKpisForBadge = activeKpis.filter(k => evaluatedById.get(k.id)?.score !== null && evaluatedById.get(k.id)?.score !== undefined);
                  const hasData = scoredKpisForBadge.length > 0;

                  const badges: { icon: string; title: string; desc: string; earned: boolean; color: string }[] = [
                    {
                      icon: "🏆", title: "محقق الكل",
                      desc: "تحقيق جميع المؤشرات في شهر واحد",
                      earned: hasData && scoredKpisForBadge.every(k => evaluatedById.get(k.id)?.achieved === true || (evaluatedById.get(k.id)?.score ?? 0) >= 100),
                      color: "border-amber-500/40 bg-amber-500/8 text-amber-500",
                    },
                    {
                      icon: "🚀", title: "فوق الهدف",
                      desc: "تجاوز الهدف في مؤشر واحد على الأقل",
                      earned: hasData && scoredKpisForBadge.some(k => (evaluatedById.get(k.id)?.score ?? 0) > 100),
                      color: "border-blue-500/40 bg-blue-500/8 text-blue-500",
                    },
                    {
                      icon: "⭐", title: "أداء ممتاز",
                      desc: "متوسط أداء فوق 90%",
                      earned: overallScore !== null && overallScore >= 90,
                      color: "border-emerald-500/40 bg-emerald-500/8 text-emerald-500",
                    },
                    {
                      icon: "📈", title: "تحسن مستمر",
                      desc: "أداء فوق 70% — على مسار التحسين",
                      earned: overallScore !== null && overallScore >= 70 && overallScore < 90,
                      color: "border-indigo-500/40 bg-indigo-500/8 text-indigo-500",
                    },
                    {
                      icon: "🎯", title: "نصف الطريق",
                      desc: "تحقيق 50%+ من المؤشرات النشطة",
                      earned: hasData && (scoredKpisForBadge.filter(k => evaluatedById.get(k.id)?.achieved === true || (evaluatedById.get(k.id)?.score ?? 0) >= 100).length / scoredKpisForBadge.length) >= 0.5,
                      color: "border-violet-500/40 bg-violet-500/8 text-violet-500",
                    },
                    {
                      icon: "💰", title: "حامي الراتب",
                      desc: "لا خصومات KPI هذا الشهر",
                      earned: hasData && scoredKpisForBadge.every(k => (evaluatedById.get(k.id)?.achieved !== false) || (k.salaryWeight ?? 0) === 0),
                      color: "border-rose-500/40 bg-rose-500/8 text-rose-500",
                    },
                  ];

                  const earnedCount = badges.filter(b => b.earned).length;

                  return (
                    <Card className="border-border bg-card">
                      <CardContent className="px-4 py-4">
                        <div className="flex items-center justify-between gap-2 mb-4">
                          <div className="flex items-center gap-2">
                            <Gift className="w-4 h-4 text-primary shrink-0" />
                            <p className="text-xs font-bold">جدار الإنجازات الشهرية</p>
                          </div>
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                            earnedCount >= 4 ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
                            earnedCount >= 2 ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" :
                            "bg-muted/40 text-muted-foreground"
                          }`}>
                            {earnedCount} / {badges.length} شارة محققة
                          </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {badges.map(badge => (
                            <div key={badge.title} className={`relative rounded-xl border p-3 text-center transition-all ${
                              badge.earned
                                ? `${badge.color} shadow-sm`
                                : "border-border/30 bg-muted/5 opacity-35 grayscale"
                            }`}>
                              {badge.earned && (
                                <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-current animate-pulse opacity-60" />
                              )}
                              <div className="text-2xl mb-1.5">{badge.icon}</div>
                              <p className="text-[10px] font-black leading-tight">{badge.title}</p>
                              <p className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed">{badge.desc}</p>
                              {badge.earned && (
                                <div className="mt-1.5 text-[8px] font-bold opacity-70">✓ محققة</div>
                              )}
                            </div>
                          ))}
                        </div>
                        {earnedCount === 0 && (
                          <p className="text-center text-[10px] text-muted-foreground mt-3">
                            {hasData
                              ? "لا توجد شارات محققة بعد — حسّن أداءك لتحقيق الشارات 🎯"
                              : "أدخل القيم الفعلية في تاب «المتابعة اليومية» لتفعيل نظام الشارات."}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })()}

              </>
            );
          })()}
        </TabsContent>
        )}

        {/* ─── Monthly Report Tab ─── */}
        {canPerformance && (
        <TabsContent value="report" className="space-y-3 mt-3">
          <div className="flex items-center gap-3">
            <div className="space-y-0.5">
              <Label className="text-[10px] text-muted-foreground">اختر الشهر</Label>
              <Input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)} className="h-7 text-xs w-40" />
            </div>
            {report && (
              <div className={`mr-auto px-3 py-1 rounded-full text-xs font-bold ${ratingCfg.bg} ${ratingCfg.color}`}>
                {ratingCfg.label}
                {report.overallScore !== null && ` — ${report.overallScore}%`}
              </div>
            )}
          </div>

          {reportLoading && <p className="text-center text-muted-foreground text-xs py-8">جاري التحميل...</p>}

          {report && !reportLoading && (
            <>
              <Card className="relative overflow-hidden border-border/60 bg-gradient-to-br from-card via-card to-emerald-500/5">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(201,162,39,0.12),transparent_35%),radial-gradient(circle_at_bottom_left,rgba(16,185,129,0.10),transparent_28%)] pointer-events-none" />
                <CardContent className="relative p-4 sm:p-5 space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/70 px-3 py-1 text-[10px] font-bold text-muted-foreground">
                        <FileText className="w-3 h-3 text-primary" />
                        التقرير الشهري التفصيلي
                      </div>
                      <h3 className="text-lg font-black leading-tight">ملخص أداء {report.displayName}</h3>
                      <p className="text-xs text-muted-foreground max-w-2xl">
                        نظرة مالية وتشغيلية متكاملة تجمع بين الطلبيات، مؤشرات الأداء، والحضور — بصورة سهلة القراءة وعرض احترافي.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-2 min-w-[115px]">
                        <p className="text-[10px] text-muted-foreground">الشهر</p>
                        <p className="text-sm font-black">{periodLabel}</p>
                      </div>
                      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 min-w-[115px]">
                        <p className="text-[10px] text-muted-foreground">الحالة</p>
                        <p className="text-sm font-black text-emerald-500">
                          {report.overallScore == null ? "غير محدد"
                            : report.overallScore >= 80 ? "ممتاز"
                            : report.overallScore >= 65 ? "جيد جداً"
                            : report.overallScore >= 50 ? "جيد"
                            : report.overallScore >= 35 ? "مقبول"
                            : report.overallScore > 0  ? "ضعيف"
                            : "غير محدد"}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {[
                      { label: "الطلبيات", value: fmtNum(report.orderStats.total), color: "text-primary" },
                      { label: "نسبة التسليم", value: `${report.orderStats.deliveryRate}%`, color: "text-amber-500" },
                      { label: "خصم KPI", value: fmt(kpiDeductions), color: "text-red-500" },
                      { label: "مكافأة KPI", value: fmt(kpiBonuses), color: "text-emerald-500" },
                    ].map(item => (
                      <div key={item.label} className="rounded-2xl border border-border/60 bg-background/75 px-3 py-3">
                        <p className="text-[10px] text-muted-foreground">{item.label}</p>
                        <p className={`text-lg font-black ${item.color}`}>{item.value}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Quick stats row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                  { label: "الطلبيات",      value: fmtNum(report.orderStats.total),          icon: Package,     color: "text-primary",                         bg: "bg-primary/5 dark:bg-primary/10",             glow: "shadow-[0_0_14px_rgba(99,102,241,0.18)] dark:shadow-[0_0_18px_rgba(99,102,241,0.3)]",  border: "border-primary/20 dark:border-primary/30",  gradient: "from-primary/5 to-transparent"         },
                  { label: "مُسلَّم",        value: fmtNum(report.orderStats.delivered),      icon: TrendingUp,  color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-900/20",        glow: "shadow-[0_0_14px_rgba(16,185,129,0.18)] dark:shadow-[0_0_18px_rgba(16,185,129,0.3)]",   border: "border-emerald-200/60 dark:border-emerald-700/40", gradient: "from-emerald-500/5 to-transparent" },
                  { label: "مُرتجَع",        value: fmtNum(report.orderStats.returned),       icon: TrendingDown, color: "text-red-600 dark:text-red-400",        bg: "bg-red-50 dark:bg-red-900/20",                glow: "shadow-[0_0_14px_rgba(239,68,68,0.18)] dark:shadow-[0_0_18px_rgba(239,68,68,0.3)]",     border: "border-red-200/60 dark:border-red-700/40",  gradient: "from-red-500/5 to-transparent"          },
                  { label: "نسبة التسليم",  value: `${report.orderStats.deliveryRate}%`,     icon: Star,        color: "text-amber-600 dark:text-amber-400",     bg: "bg-amber-50 dark:bg-amber-900/20",            glow: "shadow-[0_0_14px_rgba(245,158,11,0.18)] dark:shadow-[0_0_18px_rgba(245,158,11,0.3)]",   border: "border-amber-200/60 dark:border-amber-700/40", gradient: "from-amber-500/5 to-transparent"      },
                ].map(s => (
                  <Card key={s.label} className={`relative overflow-hidden border-border ${s.bg} ${s.glow} ${s.border} transition-all duration-200`}>
                    <div className={`absolute inset-0 bg-gradient-to-br ${s.gradient} pointer-events-none`} />
                    <CardContent className="relative px-3 py-3 flex items-center gap-2">
                      <s.icon className={`w-4 h-4 shrink-0 ${s.color}`} />
                      <div>
                        <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                        <p className="text-[9px] text-muted-foreground">{s.label}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {report.kpis.length > 0 && report.profile?.role === "sales" && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 mt-3">
                  <Card className="border-border bg-card/80">
                    <CardHeader className="px-4 pt-4 pb-2">
                      <CardTitle className="text-sm flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5">
                          <Target className="w-4 h-4 text-primary" />توزيع حالة KPI
                        </span>
                        <Badge variant="outline" className="text-[10px] h-5 px-2">
                          {kpiFinancials.salaryAtRiskPercent}% من الراتب
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <div className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-3 items-center">
                        <div className="h-[220px] w-full">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={[
                                  { name: "محقق", value: kpiAchievedCount, fill: "#10B981" },
                                  { name: "لم يتحقق", value: kpiFailedCount, fill: "#EF4444" },
                                  { name: "Over Target", value: kpiOverTargetCount, fill: "#2563EB" },
                                ].filter(item => item.value > 0)}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={54}
                                outerRadius={82}
                                paddingAngle={3}
                                isAnimationActive={true}
                                animationBegin={0}
                                animationDuration={900}
                                animationEasing="ease-out"
                              >
                                {[
                                  { name: "محقق", value: kpiAchievedCount, fill: "#10B981" },
                                  { name: "لم يتحقق", value: kpiFailedCount, fill: "#EF4444" },
                                  { name: "Over Target", value: kpiOverTargetCount, fill: "#2563EB" },
                                ].filter(item => item.value > 0).map((entry, index) => (
                                  <Cell
                                    key={`status-${index}`}
                                    fill={entry.fill}
                                    stroke="transparent"
                                    style={{ cursor: "pointer", transition: "opacity 0.2s, filter 0.2s" }}
                                  />
                                ))}
                              </Pie>
                              <Tooltip
                                formatter={(value: any, name: string) => [`${value}`, name]}
                                contentStyle={{
                                  fontSize: 11,
                                  background: "hsl(var(--card))",
                                  border: "1px solid hsl(var(--border))",
                                  borderRadius: 10,
                                  direction: "rtl",
                                  color: "hsl(var(--foreground))",
                                  boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                                  padding: "8px 12px",
                                }}
                                itemStyle={{ color: "hsl(var(--foreground))" }}
                                cursor={false}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-2">
                          {[
                            { label: "محقق", value: kpiAchievedCount, color: "text-emerald-500", bg: "bg-emerald-500/10" },
                            { label: "لم يتحقق", value: kpiFailedCount, color: "text-red-500", bg: "bg-red-500/10" },
                            { label: "Over Target", value: kpiOverTargetCount, color: "text-blue-500", bg: "bg-blue-500/10" },
                            { label: "إجمالي وزن KPI", value: `${kpiFinancials.totalSalaryWeight}%`, color: "text-amber-500", bg: "bg-amber-500/10" },
                          ].map(item => (
                            <div key={item.label} className={`rounded-xl px-3 py-2 flex items-center justify-between ${item.bg}`}>
                              <span className="text-xs text-muted-foreground">{item.label}</span>
                              <span className={`text-sm font-black ${item.color}`}>{item.value}</span>
                            </div>
                          ))}
                          <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
                            <p className="text-[10px] text-muted-foreground mb-1">مؤشر الراتب المعرض للخطر</p>
                            <Progress value={Math.min(kpiFinancials.salaryAtRiskPercent, 100)} className="h-2" />
                            <div className="mt-2 flex items-center justify-between text-[10px]">
                              <span className="text-muted-foreground">محتمل الخصم</span>
                              <span className="font-bold text-amber-600 dark:text-amber-400">{fmt(kpiFinancials.totalDeduction)}</span>
                            </div>
                            {kpiFinancials.totalSalaryWeight > 100 && (
                              <p className="mt-1 text-[10px] font-medium text-red-500">
                                إجمالي الأوزان أكبر من 100%، راجع إعدادات KPI حتى لا يتجاوز الخصم الراتب الأساسي.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-border bg-card/80">
                    <CardHeader className="px-4 pt-4 pb-2">
                      <CardTitle className="text-sm flex items-center gap-1.5">
                        <BarChart2 className="w-4 h-4 text-primary" />توزيع الراتب الشهري
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-4 pb-4">
                      <ResponsiveContainer width="100%" height={220}>
                        <LineChart
                          data={[
                            { name: "الأساسي",     value: baseSalary },
                            { name: "خصم الحضور", value: salaryReport?.attendanceDeduction ?? 0 },
                            { name: "خصم KPI",    value: kpiDeductions },
                            { name: "البونص",      value: (salaryReport?.bonuses ?? 0) + kpiBonuses },
                            { name: "الصافي",      value: Math.max((salaryReport?.netSalary ?? baseSalary) - kpiDeductions + kpiBonuses, 0) },
                          ]}
                          margin={{ top: 12, right: 16, left: 0, bottom: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={v => fmt(v).replace("ج.م.‏","").trim()} width={60} />
                          <Tooltip
                            formatter={(v: any) => [fmt(Number(v)), "القيمة"]}
                            contentStyle={{
                              fontSize: 10,
                              background: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: 10,
                              direction: "rtl",
                              color: "hsl(var(--foreground))",
                              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                              padding: "8px 12px",
                            }}
                            itemStyle={{ color: "hsl(var(--foreground))" }}
                            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1, strokeDasharray: "4 2" }}
                          />
                          <Line
                            type="monotone"
                            dataKey="value"
                            stroke="#c9a227"
                            strokeWidth={2.5}
                            dot={{ fill: "#c9a227", r: 4, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                            activeDot={{ r: 6, strokeWidth: 2, stroke: "hsl(var(--card))" }}
                            isAnimationActive={true}
                            animationDuration={800}
                            animationEasing="ease-out"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* KPI Charts */}
              {report.kpis.length > 0 && report.profile?.role === "sales" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Radar Chart */}
                  <Card className="border-border bg-card/90 overflow-hidden">
                    <CardHeader className="pb-1 pt-3 px-4 border-b border-border/40 bg-muted/20">
                      <CardTitle className="text-xs flex items-center gap-1.5 text-muted-foreground">
                        <BarChart2 className="w-3.5 h-3.5" />مؤشرات الأداء — نسبة التحقق
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-2 pb-3">
                      <ResponsiveContainer width="100%" height={200}>
                        <RadarChart data={report.kpis.filter(k => k.score !== null).map(k => ({
                          subject: k.name.length > 8 ? k.name.slice(0, 8) + "…" : k.name,
                          score: Math.min(k.score ?? 0, 120),
                          fullName: k.name,
                        }))}>
                          <PolarGrid stroke="hsl(var(--border))" />
                          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                          <Radar name="الأداء" dataKey="score" stroke="#c9a227" fill="#c9a227" fillOpacity={0.25} strokeWidth={2} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {/* Bar Chart — KPI vs Target */}
                  <Card className="border-border bg-card/90 overflow-hidden">
                    <CardHeader className="pb-1 pt-3 px-4 border-b border-border/40 bg-muted/20">
                      <CardTitle className="text-xs flex items-center gap-1.5 text-muted-foreground">
                        <Target className="w-3.5 h-3.5" />نسبة التحقق لكل مؤشر
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="px-2 pb-3">
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart
                          data={report.kpis.filter(k => k.score !== null).map(k => ({
                            name: k.name.length > 7 ? k.name.slice(0, 7) + "…" : k.name,
                            score: Math.min(k.score ?? 0, 130),
                            achieved: k.achieved,
                            fullName: k.name,
                          }))}
                          margin={{ top: 8, right: 8, left: -20, bottom: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="name" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                          <YAxis domain={[0, 130]} tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                          <ReferenceLine y={100} stroke="#10B981" strokeDasharray="4 2" strokeWidth={1.5} label={{ value: "الهدف", fill: "#10B981", fontSize: 9, position: "insideTopRight" }} />
                          <Tooltip
                            formatter={(v: any, _: any, props: any) => [`${v}%`, props?.payload?.fullName ?? "الأداء"]}
                            contentStyle={{
                              fontSize: 10,
                              background: "hsl(var(--card))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: 10,
                              direction: "rtl",
                              color: "hsl(var(--foreground))",
                              boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                              padding: "8px 12px",
                            }}
                            itemStyle={{ color: "hsl(var(--foreground))" }}
                            cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1, strokeDasharray: "4 2" }}
                          />
                          <Line
                            type="monotone"
                            dataKey="score"
                            stroke="#c9a227"
                            strokeWidth={2.5}
                            dot={false}
                            activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--card))", fill: "#c9a227" }}
                            isAnimationActive={true}
                            animationDuration={800}
                            animationEasing="ease-out"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* KPI Evaluation */}
              {report.kpis.length > 0 && report.profile?.role === "sales" && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-muted-foreground flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5" />تقييم المؤشرات
                  </h3>

                  {/* ملخص التأثير المالي للـ KPIs */}
                  {(() => {
                    const salary = report.salary || fullProfile?.monthlySalary || 0;
                    const kpiDeductions = report.kpis
                      .filter(k => k.achieved === false && (k.salaryWeight ?? 0) > 0)
                      .reduce((sum, k) => sum + Math.round(((k.salaryWeight ?? 0) / 100) * salary), 0);
                    const kpiBonuses = report.kpis
                      .filter(k => k.score !== null && k.score > 100 && (k.overtargetBonus ?? 0) > 0)
                      .reduce((sum, k) => sum + Math.round(((k.overtargetBonus ?? 0) / 100) * salary), 0);
                    const hasImpact = kpiDeductions > 0 || kpiBonuses > 0;
                    if (!hasImpact) return null;
                    return (
                      <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                        <p className="text-[10px] font-bold text-muted-foreground">💼 التأثير المالي لمؤشرات الأداء هذا الشهر:</p>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="rounded-lg bg-muted/30 p-2 text-center">
                            <p className="text-[9px] text-muted-foreground">الراتب الأساسي</p>
                            <p className="text-xs font-black">{fmt(salary)}</p>
                          </div>
                          {kpiDeductions > 0 && (
                            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-center">
                              <p className="text-[9px] text-red-500">خصم KPI</p>
                              <p className="text-xs font-black text-red-500">−{fmt(kpiDeductions)}</p>
                            </div>
                          )}
                          {kpiBonuses > 0 && (
                            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-2 text-center">
                              <p className="text-[9px] text-emerald-500">مكافأة OT</p>
                              <p className="text-xs font-black text-emerald-500">+{fmt(kpiBonuses)}</p>
                            </div>
                          )}
                          <div className={`rounded-lg p-2 text-center col-span-${kpiDeductions > 0 && kpiBonuses > 0 ? "3" : "1"} ${(salary - kpiDeductions + kpiBonuses) < salary ? "bg-amber-500/10 border border-amber-500/20" : "bg-emerald-500/10 border border-emerald-500/20"}`}>
                            <p className="text-[9px] text-muted-foreground">صافي بعد KPI</p>
                            <p className={`text-sm font-black ${(salary - kpiDeductions + kpiBonuses) < salary ? "text-amber-500" : "text-emerald-500"}`}>
                              {fmt(salary - kpiDeductions + kpiBonuses)}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {report.kpis.map(kpi => {
                    const salaryW = kpi.salaryWeight ?? 0;
                    const otBonus = kpi.overtargetBonus ?? 0;
                    const salary = report.salary || fullProfile?.monthlySalary || 0;
                    const kpiAmt = salary > 0 && salaryW > 0 ? Math.round((salaryW / 100) * salary) : 0;
                    const bonusAmt = salary > 0 && otBonus > 0 ? Math.round((otBonus / 100) * salary) : 0;
                    const isOverTarget = kpi.score !== null && kpi.score > 100;

                    return (
                      <div key={kpi.id} className={`p-3 rounded-lg border transition-colors ${
                        kpi.achieved === true  ? "border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20" :
                        kpi.achieved === false ? "border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/10" :
                                                 "border-border bg-card"
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                            kpi.achieved === true  ? "bg-emerald-100 dark:bg-emerald-900/50" :
                            kpi.achieved === false ? "bg-red-100 dark:bg-red-900/40" :
                                                     "bg-muted/40"
                          }`}>
                            {kpi.achieved === true  ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> :
                             kpi.achieved === false ? <X className="w-3.5 h-3.5 text-red-600 dark:text-red-400" /> :
                                                      <AlertCircle className="w-3.5 h-3.5 text-muted-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                <p className="text-xs font-bold truncate">{kpi.name}</p>
                                {isOverTarget && otBonus > 0 && (
                                  <Badge className="text-[9px] h-4 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-0 shrink-0">
                                    🏆 Over Target
                                  </Badge>
                                )}
                                {kpi.achieved === false && salaryW > 0 && (
                                  <Badge className="text-[9px] h-4 bg-red-500/15 text-red-600 dark:text-red-400 border-0 shrink-0">
                                    ⚠️ خصم مطبّق
                                  </Badge>
                                )}
                              </div>
                              <Badge
                                variant="outline"
                                className={`text-[10px] shrink-0 ${
                                  kpi.achieved === true  ? "border-emerald-500 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400" :
                                  kpi.achieved === false ? "border-red-500 dark:border-red-700 text-red-700 dark:text-red-400" :
                                                           "border-border text-muted-foreground"
                                }`}
                              >
                                {kpi.score !== null ? `${kpi.score}%` : "—"}
                              </Badge>
                            </div>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="text-[10px] text-muted-foreground">
                                الفعلي: <strong className={kpi.achieved === true ? "text-emerald-600 dark:text-emerald-400" : kpi.achieved === false ? "text-red-600 dark:text-red-400" : "text-foreground"}>
                                  {kpi.actualValue !== null ? `${fmtNum(kpi.actualValue)} ${kpi.unit}` : "—"}
                                </strong>
                                {" / هدف: "}{kpi.direction === "lower_is_better" ? "≤" : "≥"}{fmtNum(kpi.targetValue)} {kpi.unit}
                              </span>
                            </div>
                            <Progress
                              value={Math.min(kpi.score ?? 0, 100)}
                              className={`h-1.5 ${kpi.achieved === true ? "[&>div]:bg-emerald-500" : kpi.achieved === false ? "[&>div]:bg-red-400" : "[&>div]:bg-primary"}`}
                            />
                            {/* تأثير على الراتب */}
                            {(salaryW > 0 || otBonus > 0) && salary > 0 && (
                              <div className="flex gap-2 mt-1.5 flex-wrap">
                                {salaryW > 0 && (
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                    kpi.achieved === false
                                      ? "bg-red-500/15 text-red-500"
                                      : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 line-through opacity-60"
                                  }`}>
                                    {kpi.achieved === false ? `−${fmt(kpiAmt)} خصم KPI` : `✓ لا خصم (${salaryW}%)`}
                                  </span>
                                )}
                                {otBonus > 0 && (
                                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                    isOverTarget
                                      ? "bg-emerald-500/15 text-emerald-500"
                                      : "bg-muted/40 text-muted-foreground opacity-50"
                                  }`}>
                                    {isOverTarget ? `+${fmt(bonusAmt)} مكافأة OT` : `مكافأة OT: ${fmt(bonusAmt)} (لم تُحقق)`}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Salary card */}
              <Card className="relative overflow-hidden border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/10 shadow-[0_0_20px_rgba(16,185,129,0.12)] dark:shadow-[0_0_24px_rgba(16,185,129,0.2)] transition-all duration-200">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/8 to-transparent pointer-events-none" />
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />
                <CardContent className="relative px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="text-xs font-bold">الراتب المستحق</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(parseInt(reportMonth.split("-")[0]), parseInt(reportMonth.split("-")[1]) - 1, 1)
                          .toLocaleDateString("ar-EG", { month: "long", year: "numeric" })}
                      </p>
                    </div>
                  </div>
                  <span className="text-xl font-black text-emerald-600 dark:text-emerald-400">{fmt(report.salary)}</span>
                </CardContent>
              </Card>

              <MonthlyReport report={report} />
            </>
          )}
        </TabsContent>
        )}

        {/* ─── Star Employees Manage Tab (سوبر أدمن فقط) ─── */}
        {isSuperAdmin && (
        <TabsContent value="star-employees" className="space-y-3 mt-3">
          <StarEmployeesManageTab />
        </TabsContent>
        )}

        {/* ─── Profile Tab ─── */}
        <TabsContent value="profile" className="mt-3">
          {/* ── Hero Card ── */}
          <div className="relative rounded-2xl overflow-hidden border border-border bg-gradient-to-br from-card via-card to-muted/20 mb-3">
            {/* خلفية زخرفية */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-10"
                style={{ background: "radial-gradient(circle, hsl(var(--primary)), transparent)" }} />
              <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full opacity-8"
                style={{ background: "radial-gradient(circle, #c9a227, transparent)" }} />
            </div>
            <div className="relative px-5 py-5 flex items-center gap-4">
              {/* Avatar */}
              <div className="relative shrink-0">
                <div className="w-20 h-20 rounded-2xl overflow-hidden border-2 border-primary/30 shadow-lg"
                  style={{ boxShadow: "0 0 20px hsl(var(--primary)/0.25)" }}>
                  {fullProfile?.avatar
                    ? <img src={fullProfile.avatar} alt={displayName} className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center text-2xl font-black"
                        style={{ background: "linear-gradient(135deg,hsl(var(--primary)/0.8),hsl(var(--primary)/0.4))", color: "hsl(var(--primary-foreground))" }}>
                        {(displayName || "?").charAt(0).toUpperCase()}
                      </div>
                  }
                </div>
                {/* نقطة الحالة */}
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-card bg-emerald-500" />
              </div>
              {/* بيانات أساسية */}
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-black truncate">{displayName}</h2>
                <p className="text-sm text-primary font-semibold truncate">
                  {fullProfile?.jobTitle || "—"}
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {fullProfile?.department && (
                    <span className="text-[10px] bg-muted/50 border border-border/50 px-2 py-0.5 rounded-full text-muted-foreground">
                      {fullProfile.department}
                    </span>
                  )}
                  {isSystemUser && username && (
                    <span className="text-[10px] bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full text-primary font-mono">
                      @{username}
                    </span>
                  )}
                  {!isSystemUser && (
                    <span className="text-[10px] bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full text-amber-500">
                      فريق فقط
                    </span>
                  )}
                </div>
              </div>
              {/* زرار تعديل */}
              {isAdmin && (
                <Button variant="outline" size="icon"
                  className="shrink-0 rounded-xl h-9 w-9 border-border/60 hover:border-primary/50 hover:bg-primary/5"
                  onClick={() => setProfileOpen(true)}>
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
              )}
            </div>
          </div>

          {/* ── Info Grid ── */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            {[
              {
                icon: DollarSign,
                label: "الراتب الأساسي",
                value: fullProfile?.monthlySalary ? fmt(fullProfile.monthlySalary) : "—",
                color: "text-emerald-400",
                bg: "from-emerald-500/10 to-green-600/5 border-emerald-500/20",
              },
              {
                icon: Calendar,
                label: "تاريخ التعيين",
                value: fullProfile?.hireDate
                  ? new Date(fullProfile.hireDate).toLocaleDateString("ar-EG", { year: "numeric", month: "short", day: "numeric" })
                  : "—",
                color: "text-blue-400",
                bg: "from-blue-500/10 to-blue-600/5 border-blue-500/20",
              },
              {
                icon: Briefcase,
                label: "المسمى الوظيفي",
                value: fullProfile?.jobTitle || "—",
                color: "text-violet-400",
                bg: "from-violet-500/10 to-purple-600/5 border-violet-500/20",
              },
              {
                icon: Users,
                label: "القسم",
                value: fullProfile?.department || "—",
                color: "text-amber-400",
                bg: "from-amber-500/10 to-yellow-600/5 border-amber-500/20",
              },
            ].map(item => (
              <div key={item.label}
                className={`rounded-xl p-3 border bg-gradient-to-br ${item.bg} flex flex-col gap-1`}>
                <div className="flex items-center gap-1.5">
                  <item.icon className={`w-3.5 h-3.5 ${item.color}`} />
                  <span className="text-[10px] text-muted-foreground">{item.label}</span>
                </div>
                <p className={`text-sm font-black truncate ${item.color}`}>{item.value}</p>
              </div>
            ))}
          </div>

          {/* ── مدة الخدمة ── */}
          {fullProfile?.hireDate && (() => {
            const hire = new Date(fullProfile.hireDate);
            const now = new Date();
            const months = (now.getFullYear() - hire.getFullYear()) * 12 + (now.getMonth() - hire.getMonth());
            const years = Math.floor(months / 12);
            const remMonths = months % 12;
            const label = years > 0
              ? `${years} ${years === 1 ? "سنة" : "سنوات"}${remMonths > 0 ? ` و ${remMonths} شهر` : ""}`
              : `${months} شهر`;
            return (
              <div className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3 mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <Clock className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-[10px] text-muted-foreground">مدة الخدمة</p>
                    <p className="text-sm font-black text-primary">{label}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">من</p>
                  <p className="text-xs font-bold">{hire.toLocaleDateString("ar-EG", { year: "numeric", month: "long" })}</p>
                </div>
              </div>
            );
          })()}

          {/* ── ملاحظات ── */}
          {fullProfile?.notes && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <p className="text-[10px] text-amber-500 font-bold mb-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />ملاحظات
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">{fullProfile.notes}</p>
            </div>
          )}

          {/* ── لو مفيش profile ── */}
          {!fullProfile && (
            <div className="rounded-xl border border-dashed border-border/50 bg-muted/10 px-4 py-8 text-center">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm text-muted-foreground">لم يتم إنشاء ملف شخصي بعد</p>
              {isAdmin && (
                <Button size="sm" className="mt-3 text-xs" onClick={() => setProfileOpen(true)}>
                  إنشاء ملف شخصي
                </Button>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {profileOpen && (
        <ProfileFormDialog
          open={profileOpen}
          onClose={() => { setProfileOpen(false); qc.invalidateQueries({ queryKey: ["employee-profile", profileId] }); qc.invalidateQueries({ queryKey: ["employee-profiles"] }); }}
          profileId={profileId}
          displayName={displayName}
          isSystemUser={isSystemUser}
          existing={fullProfile ?? null}
          isAdmin={isAdmin}
        />
      )}

      {kpiDialogOpen && (
        <KpiFormDialog
          open={kpiDialogOpen}
          onClose={() => { setKpiDialogOpen(false); setEditingKpi(undefined); }}
          profileId={profileId}
          isSystemUser={isSystemUser}
          existing={editingKpi}
          monthlySalary={fullProfile?.monthlySalary ?? 0}
        />
      )}
    </div>
  );
}

// ─── EmployeeScoreRing — نفس حسبة MyDashboardTab بالظبط ─────────────────────
// يجيب الـ score من getReport مباشرة زي لوحتي، مش من listProfiles
function EmployeeScoreRing({ profileId, monthProgress, dailyScore, attendanceScore }: {
  profileId: number;
  monthProgress: number;
  dailyScore: number | null;
  attendanceScore: number | null;
}) {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const { data: report } = useQuery({
    queryKey: ["employee-report-card", profileId, currentMonth],
    queryFn: () => employeeApi.getReport(profileId, currentMonth),
    staleTime: 5 * 60_000,
  });

  const monthly = report?.overallScore ?? null;
  const ringColor = monthly === null ? "#6B7280" : monthly >= 80 ? "#10B981" : monthly >= 60 ? "#F59E0B" : "#EF4444";
  const scoreText = monthly === null ? "text-muted-foreground" : monthly >= 80 ? "text-emerald-400" : monthly >= 60 ? "text-amber-400" : "text-red-400";
  const statusLabel = monthly === null ? "لا بيانات" : monthly >= 90 ? "أداء استثنائي ⭐" : monthly >= 80 ? "أداء ممتاز ✅" : monthly >= 60 ? "أداء جيد 👍" : monthly >= 40 ? "يحتاج تحسين ⚠️" : "أداء ضعيف ❌";
  const statusBg = monthly === null ? "bg-muted/20 border-border" : monthly >= 80 ? "bg-emerald-500/8 border-emerald-500/20" : monthly >= 60 ? "bg-amber-500/8 border-amber-500/20" : "bg-red-500/8 border-red-500/20";
  // circumference لـ r=38 → 2×π×38 = 238.8 — نفس MyDashboardTab بالظبط
  const circ = 238.8;
  const dash = (Math.min(monthly ?? 0, 100) / 100) * circ;
  // الحالة تظهر فقط في آخر 10 أيام من الشهر
  const _now = new Date();
  const _daysInMonth = new Date(_now.getFullYear(), _now.getMonth() + 1, 0).getDate();
  const _dayOfMonth = _now.getDate();
  const showStatusLabel = _dayOfMonth >= _daysInMonth - 9;

  return (
    <div className={`rounded-xl p-3 border ${statusBg} flex flex-col gap-2`}>
      {/* الدائرة + statusLabel + دائرتين صغيرتين — نفس layout MyDashboardTab */}
      <div className="flex items-center gap-3">
        <div className="relative w-16 h-16 shrink-0">
          <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
            <circle cx="48" cy="48" r="38" fill="none" stroke="hsl(var(--muted))" strokeWidth="9" />
            <circle cx="48" cy="48" r="38" fill="none" stroke={ringColor} strokeWidth="9"
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-xs font-black leading-none ${scoreText}`}>
              {monthly !== null ? `${monthly}%` : report === undefined ? "..." : "—"}
            </span>
            <span className="text-[7px] text-muted-foreground mt-0.5">شهري</span>
          </div>
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className={`text-[10px] font-bold leading-tight ${scoreText}`}>{monthly !== null ? `${monthly}%` : "—"}</p>
          {/* دائرتين صغيرتين: يومي + حضور */}
          <div className="flex items-center gap-2">
            {[{ label: "يومي", score: dailyScore }, { label: "حضور", score: attendanceScore }].map(({ label, score }) => {
              const r2 = 10, circ2 = 2 * Math.PI * r2;
              const dash2 = (Math.min(score ?? 0, 100) / 100) * circ2;
              const bar2 = score === null ? "#6B7280" : score >= 75 ? "#10B981" : score >= 50 ? "#F59E0B" : "#EF4444";
              const col2 = score === null ? "text-muted-foreground" : score >= 75 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";
              return (
                <div key={label} className="flex flex-col items-center gap-0.5">
                  <div className="relative">
                    <svg width="28" height="28" viewBox="0 0 28 28" style={{ transform: "rotate(-90deg)" }}>
                      <circle cx="14" cy="14" r={r2} fill="none" stroke="rgba(128,128,128,0.15)" strokeWidth="3" />
                      <circle cx="14" cy="14" r={r2} fill="none" stroke={bar2} strokeWidth="3"
                        strokeDasharray={`${dash2} ${circ2 - dash2}`} strokeLinecap="round" />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className={`text-[7px] font-black ${col2}`}>{score !== null ? `${score}%` : "—"}</span>
                    </div>
                  </div>
                  <span className="text-[7px] text-muted-foreground/70">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {/* شريط تقدم الشهر — نفس MyDashboardTab */}
      <div>
        <div className="flex justify-between text-[7px] text-muted-foreground/60 mb-1">
          <span>تقدم الشهر</span><span>{monthProgress}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-black/10 dark:bg-white/10">
          <div className="h-1.5 rounded-full bg-primary/60 transition-all" style={{ width: `${monthProgress}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function TeamPage() {
  const { isAdmin, can, user } = useAuth();
  const isSuperAdmin = user?.role === "super_admin";
  // ── Team permission shortcuts ──────────────────────────────────────────────
  const canManage     = isAdmin || can("team.manage");
  const canSalaries   = isAdmin || can("team.salaries");
  const canPerformance = isAdmin || can("team.performance");
  const canAddMember  = isAdmin || can("add_team_member");

  // ── Access guard — لازم يكون عنده على الأقل واحدة ──────────────────────────
  if (!isAdmin && !can("team.view") && !can("team.manage") && !can("team.salaries") && !can("team.performance")) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <span className="text-3xl">🔒</span>
        </div>
        <h2 className="text-xl font-bold">غير مصرح بالوصول</h2>
        <p className="text-muted-foreground text-sm max-w-xs">ليس لديك صلاحية لعرض صفحة الفريق. تواصل مع المدير.</p>
      </div>
    );
  }
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [addProfileOpen, setAddProfileOpen] = useState(false);
  const [addingUser, setAddingUser] = useState<AppUser | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [teamSearch, setTeamSearch] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: appSettings } = useQuery({
    queryKey: ["app-settings"],
    queryFn: appSettingsApi.get,
  });

  const showAddMemberBtn = appSettings?.showAddTeamMember ?? true;
  // لو عنده صلاحية add_team_member → يظهر الزرار بغض النظر عن appSettings
  const canShowWizard = canAddMember && (showAddMemberBtn || can("add_team_member"));

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ["employee-profiles"],
    queryFn: employeeApi.listProfiles,
  });

  const { data: teamPerfData = [] } = useQuery({
    queryKey: ["team-perf-cards"],
    queryFn: () => teamAnalyticsApi.teamPerformanceExtended(),
    staleTime: 2 * 60_000,
  });
  
  const { data: allUsers = [] } = useQuery({
    queryKey: ["users"],
    queryFn: usersApi.list,
    enabled: isAdmin || can("settings.users"),
  });

  const profiledUserIds2 = new Set(profiles.map(p => (p as any).userId).filter(Boolean));
  const unprofiledUsers = allUsers.filter((u: any) => !profiledUserIds2.has(u.id) && u.isActive);

  const profileToDelete = profiles.find(p => p.id === deleteConfirmId);

  const handleDeleteProfile = async () => {
    if (!deleteConfirmId) return;
    setDeleting(true);
    try {
      await employeeApi.deleteProfile(deleteConfirmId);
      qc.invalidateQueries({ queryKey: ["employee-profiles"] });
      toast({ title: "تم حذف العضو بنجاح" });
      setDeleteConfirmId(null);
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const selectedProfile = profiles.find(p => p.id === selectedProfileId);

  // ── لو الـ user مش admin → وجّهه تلقائياً لـ profile بتاعه ──────────────────
  const myProfile = !isAdmin ? profiles.find((p: any) => p.userId === user?.id) : null;

  // auto-select عند أول تحميل للـ profiles
  React.useEffect(() => {
    if (!isAdmin && myProfile && selectedProfileId === null) {
      setSelectedProfileId(myProfile.id);
    }
  }, [isAdmin, myProfile?.id]);

  // لو الـ user مش admin ومفيش profile → رسالة
  if (!isAdmin && !profilesLoading && !myProfile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
        <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <span className="text-3xl">👤</span>
        </div>
        <h2 className="text-lg font-bold">لم يتم إنشاء ملفك الشخصي بعد</h2>
        <p className="text-muted-foreground text-sm max-w-xs">تواصل مع المدير لإضافتك في نظام إدارة الفريق.</p>
      </div>
    );
  }

  if (selectedProfileId !== null && selectedProfile) {
    return (
      <div className="max-w-3xl mx-auto animate-in fade-in duration-300">
        <EmployeeDetail
          profileId={selectedProfileId}
          displayName={selectedProfile.displayName ?? "—"}
          isSystemUser={!!(selectedProfile as any).isSystemUser}
          username={(selectedProfile as any).username}
          onBack={isAdmin ? () => setSelectedProfileId(null) : undefined}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            إدارة الفريق
          </h1>
          <p className="text-muted-foreground text-xs mt-0.5">بيانات الموظفين، مؤشرات الأداء، والتقارير الشهرية</p>
        </div>
        {/* ── بحث realtime ── */}
        <div className="relative w-56">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="ابحث باسم الموظف..."
            value={teamSearch}
            onChange={e => setTeamSearch(e.target.value)}
            className="h-8 text-xs pr-8 pl-3"
          />
          {teamSearch && (
            <button onClick={() => setTeamSearch("")} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        {canShowWizard && (
          <Button size="sm" className="gap-1 h-8 text-xs" onClick={() => setWizardOpen(true)}>
            <Plus className="w-3.5 h-3.5" />عضو جديد
          </Button>
        )}
      </div>

      {profilesLoading && <p className="text-center text-muted-foreground py-12 text-sm">جاري التحميل...</p>}

      {!profilesLoading && profiles.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="w-10 h-10 mx-auto mb-3 opacity-20" />
          <p className="text-sm">لا توجد ملفات موظفين بعد.</p>
          {canAddMember && unprofiledUsers.length > 0 && (
            <Button size="sm" className="mt-3 text-xs" onClick={() => setAddProfileOpen(true)}>
              إضافة موظف
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {profiles.filter(p => { const q = teamSearch.toLowerCase(); return !teamSearch || (p.displayName ?? "").toLowerCase().includes(q) || (p as any).username?.toLowerCase().includes(q) || (p as any).jobTitle?.toLowerCase().includes(q); }).map(profile => {
          const isSystemUser = !!(profile as any).isSystemUser;
          const roleMap: Record<string, string> = { super_admin: "سوبر أدمن", admin: "مدير", warehouse: "مخزن", employee: "موظف" };
          const roleLabel = (profile as any).role ? (roleMap[(profile as any).role] ?? (profile as any).role) : (isSystemUser ? "موظف" : "فريق فقط");
          const name = profile.displayName ?? "—";
          const att = (profile as any).attendanceSummary ?? { workedDays: 0, absentDays: 0, lateDays: 0 };
          const kpiCount = (profile as any).kpiCount ?? 0;
          const totalDaysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
          const attPct = Math.min(100, Math.round((att.workedDays / Math.max(totalDaysInMonth, 1)) * 100));

          // الأداء من listProfiles (overallScore محسوب في الـ backend من KPIs اليومية)
          const perfScore: number | null = (profile as any).overallScore ?? null;
          const perfRating = perfScore === null ? null : perfScore >= 90 ? "ممتاز" : perfScore >= 75 ? "جيد جداً" : perfScore >= 60 ? "جيد" : perfScore >= 40 ? "مقبول" : "ضعيف";
          const perfColor = perfScore === null ? "text-muted-foreground" : perfScore >= 75 ? "text-emerald-400" : perfScore >= 50 ? "text-amber-400" : "text-red-400";
          const perfBar   = perfScore === null ? "#6B7280" : perfScore >= 75 ? "#10B981" : perfScore >= 50 ? "#F59E0B" : "#EF4444";
          const monthProgress = Math.round((new Date().getDate() / totalDaysInMonth) * 100);

          // الصورة: أولوية لصورة الـ profile، ثم صورة الـ user من allUsers
          const linkedUser = isSystemUser ? allUsers.find((u: any) => u.id === (profile as any).userId) : null;
          const avatarSrc = profile.avatar || (linkedUser as any)?.avatar || null;

          // لون بناءً على نسبة الحضور
          const attColor = att.workedDays === 0
            ? { text: "text-muted-foreground", bar: "#6B7280", glow: "rgba(107,114,128,0.3)" }
            : attPct >= 80
            ? { text: "text-emerald-400", bar: "#10B981", glow: "rgba(16,185,129,0.35)" }
            : attPct >= 50
            ? { text: "text-amber-400", bar: "#F59E0B", glow: "rgba(245,158,11,0.35)" }
            : { text: "text-red-400", bar: "#EF4444", glow: "rgba(239,68,68,0.35)" };

          return (
            <div
              key={profile.id}
              className="group relative overflow-hidden rounded-[22px] cursor-pointer transition-all duration-200 hover:-translate-y-1 dark:border-white/10 border-black/10"
              style={{
                background: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                boxShadow: "0 2px 12px rgba(0,0,0,0.08), 0 4px 24px rgba(0,0,0,0.06)",
              }}
              onClick={() => setSelectedProfileId(profile.id)}
            >
              {/* خط ضوء علوي */}
              <div className="absolute inset-x-0 top-0 h-px"
                style={{ background: isSystemUser
                  ? "linear-gradient(90deg, transparent, rgba(201,162,39,0.6), transparent)"
                  : "linear-gradient(90deg, transparent, rgba(245,158,11,0.4), transparent)" }} />

              {/* كرة ضوء خلفية */}
              <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none"
                style={{ background: isSystemUser ? "rgba(201,162,39,0.06)" : "rgba(245,158,11,0.04)", filter: "blur(20px)" }} />

              <div className="p-5">
                {/* ── الهيدر ── */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    {/* الأفاتار */}
                    {avatarSrc ? (
                      <img src={avatarSrc} alt={name}
                        className="w-12 h-12 rounded-2xl object-cover shrink-0"
                        style={{ border: "2px solid rgba(255,255,255,0.12)" }} />
                    ) : (
                      <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-black shrink-0"
                        style={{
                          background: isSystemUser ? "rgba(201,162,39,0.15)" : "rgba(245,158,11,0.10)",
                          border: `2px solid ${isSystemUser ? "rgba(201,162,39,0.35)" : "rgba(245,158,11,0.25)"}`,
                          color: isSystemUser ? "#c9a227" : "#F59E0B",
                        }}>
                        {name.charAt(0)}
                      </div>
                    )}

                    <div className="min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: "hsl(var(--foreground))" }}>{name}</p>
                      <p className="text-[11px] truncate mt-0.5" style={{ color: "hsl(var(--muted-foreground))" }}>
                        {profile.jobTitle || (isSystemUser ? null : "عضو فريق")}
                        {profile.department && (
                          <span style={{ color: "rgba(255,255,255,0.35)" }}>{profile.jobTitle ? ` · ${profile.department}` : profile.department}</span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Badge الدور + زرار حذف للسوبر ادمن */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                      style={{
                        background: isSystemUser ? "rgba(201,162,39,0.15)" : "rgba(245,158,11,0.10)",
                        color: isSystemUser ? "#c9a227" : "#F59E0B",
                        border: `1px solid ${isSystemUser ? "rgba(201,162,39,0.30)" : "rgba(245,158,11,0.20)"}`,
                      }}>
                      {roleLabel}
                    </span>
                    {isSuperAdmin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(profile.id); }}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="حذف العضو"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {/* ── الإحصائيات ── */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {/* دائرة الأداء — نفس حسبة MyDashboardTab بالظبط من getReport */}
                  <EmployeeScoreRing
                    profileId={profile.id}
                    monthProgress={monthProgress}
                    dailyScore={(profile as any).dailyScore ?? null}
                    attendanceScore={(profile as any).attendanceScore ?? null}
                  />

                  {/* مؤشرات الأداء */}
                  <div className="rounded-xl p-3 bg-muted/40 dark:bg-white/[0.04] border border-border/60 dark:border-white/[0.07]">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] font-bold text-muted-foreground">مؤشرات الأداء</p>
                      <span className={`text-sm font-black ${kpiCount > 0 ? "text-indigo-500 dark:text-indigo-400" : "text-muted-foreground/40"}`}>
                        {kpiCount > 0 ? kpiCount : "—"}
                      </span>
                    </div>
                    {/* نقاط المؤشرات */}
                    <div className="flex gap-1 flex-wrap">
                      {kpiCount > 0
                        ? Array.from({ length: Math.min(kpiCount, 6) }).map((_, i) => (
                            <div key={i} className="w-2 h-2 rounded-full"
                              style={{ background: "#6366F1", boxShadow: "0 0 4px rgba(99,102,241,0.5)" }} />
                          ))
                        : <p className="text-[9px] text-muted-foreground/50">لم تُضف بعد</p>
                      }
                      {kpiCount > 6 && (
                        <span className="text-[9px] text-indigo-500 dark:text-indigo-400/70">+{kpiCount - 6}</span>
                      )}
                    </div>
                    <p className="text-[9px] mt-1 text-muted-foreground/70">
                      {kpiCount > 0 ? `${kpiCount} مؤشر نشط` : "أضف مؤشرات أداء"}
                    </p>
                  </div>
                </div>

                {/* ── الفوتر ── */}
                <div className="flex items-center justify-between pt-3 border-t border-border/50">
                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/60">
                    <Target className="w-3 h-3" />
                    <span>عرض المؤشرات والتقرير</span>
                  </div>
                  {/* غياب لو فيه */}
                  {att.absentDays > 0 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-500 dark:text-red-400 border border-red-500/25">
                      غياب: {att.absentDays}
                    </span>
                  )}
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add member wizard */}
      <AddMemberWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSuccess={(profileId) => { setWizardOpen(false); setSelectedProfileId(profileId); }}
        availableUsers={unprofiledUsers}
        existingProfiles={profiles}
      />

      {/* Add profile dialog (existing users without profile) */}
      {addProfileOpen && (
        <Dialog open={addProfileOpen} onOpenChange={v => { if (!v) { setAddProfileOpen(false); setAddingUser(null); }}}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader><DialogTitle>اختر مستخدماً لإضافته كموظف</DialogTitle></DialogHeader>
            <div className="space-y-2 py-2">
              {unprofiledUsers.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">جميع المستخدمين لديهم ملفات بالفعل.</p>
              )}
              {unprofiledUsers.map(u => (
                <div
                  key={u.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${addingUser?.id === u.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
                  onClick={() => setAddingUser(u)}
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-black text-primary">
                    {u.displayName.charAt(0)}
                  </div>
                  <div>
                    <p className="text-xs font-bold">{u.displayName}</p>
                    <p className="text-[10px] text-muted-foreground">@{u.username}</p>
                  </div>
                  {addingUser?.id === u.id && <Check className="w-4 h-4 text-primary mr-auto" />}
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setAddProfileOpen(false); setAddingUser(null); }} className="text-xs h-7">إلغاء</Button>
              <Button
                disabled={!addingUser}
                onClick={async () => {
                  if (addingUser) {
                    try {
                      const created = await employeeApi.upsertProfile({ userId: addingUser.id });
                      qc.invalidateQueries({ queryKey: ["employee-profiles"] });
                      setAddProfileOpen(false);
                      setAddingUser(null);
                      setSelectedProfileId(created.id);
                    } catch {
                      setAddProfileOpen(false);
                    }
                  }
                }}
                className="text-xs h-7"
              >
                إضافة للفريق
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Delete Confirm Dialog — super_admin فقط ── */}
      {deleteConfirmId !== null && (
        <Dialog open onOpenChange={() => setDeleteConfirmId(null)}>
          <DialogContent className="max-w-sm" dir="rtl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <Trash2 className="w-4 h-4" />
                حذف العضو
              </DialogTitle>
            </DialogHeader>
            <div className="py-2 space-y-2">
              <p className="text-sm">
                هل أنت متأكد من حذف{" "}
                <strong>{profileToDelete?.displayName ?? "هذا العضو"}</strong>؟
              </p>
              <p className="text-xs text-muted-foreground">
                سيتم حذف الملف الشخصي ومؤشرات الأداء وسجل الحضور. هذا الإجراء لا يمكن التراجع عنه.
              </p>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)} className="text-xs">إلغاء</Button>
              <Button variant="destructive" size="sm" onClick={handleDeleteProfile} disabled={deleting} className="text-xs gap-1">
                {deleting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                {deleting ? "جارٍ الحذف..." : "حذف نهائي"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
