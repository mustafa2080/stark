import { useParams, Link, useLocation } from "wouter";
import { format } from "date-fns";
import { ArrowRight, AlertCircle, Pencil, Save, X, Printer, Phone, MapPin, Trash2, RotateCcw, TrendingUp, TrendingDown, AlertTriangle, Lock, MessageCircle, Package } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useGetOrder, getGetOrderQueryKey, useUpdateOrder, getListOrdersQueryKey, getGetOrdersSummaryQueryKey, getGetRecentOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ToastAction } from "@/components/ui/toast";
import { shippingApi, ordersApi, productsApi, variantsApi } from "@/lib/api";
import { type WhatsAppOrderData } from "@/lib/whatsapp";
import { WhatsAppDialog } from "@/components/whatsapp-dialog";
import { RETURN_REASONS, returnReasonLabel, STATUS_LABELS as statusLabels, STATUS_CLASSES as statusClasses } from "@/lib/order-constants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const editSchema = z.object({
  customerName: z.string().min(2),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  product: z.string().min(1),
  quantity: z.coerce.number().int().min(1),
  unitPrice: z.coerce.number().min(0),
  shippingCompanyId: z.coerce.number().optional().nullable(),
  trackingNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

type EditFormValues = z.infer<typeof editSchema>;

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("ar-EG", { style: "currency", currency: "EGP", maximumFractionDigits: 0 }).format(n);

export default function OrderDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isAdmin, canViewFinancials } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [showPartialInput, setShowPartialInput] = useState(false);
  const [partialQty, setPartialQty] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showWaDialog, setShowWaDialog] = useState(false);

  // Return reason state
  const [showReturnInput, setShowReturnInput] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnNote, setReturnNote] = useState("");
  const [returnIsDamaged, setReturnIsDamaged] = useState(false);

  const initializedRef = useRef(false);

  const { data: order, isLoading, error } = useGetOrder(id, { query: { enabled: !!id, queryKey: getGetOrderQueryKey(id) } });
  const { data: shippingCompanies } = useQuery({ queryKey: ["shipping"], queryFn: shippingApi.list });
  const { data: products } = useQuery({ queryKey: ["products"], queryFn: productsApi.list });
  const { data: allVariants } = useQuery({ queryKey: ["variants"], queryFn: variantsApi.listAll });
  const updateOrder = useUpdateOrder();

  // Track selected product for stock display in edit mode
  const [editProductId, setEditProductId] = useState<number | null>(null);
  const [editColor, setEditColor] = useState<string>("");

  const form = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: { customerName: "", phone: "", address: "", product: "", quantity: 1, unitPrice: 0, notes: "" },
  });

  useEffect(() => {
    if (order && !initializedRef.current) {
      form.reset({ customerName: order.customerName, phone: order.phone, address: order.address, product: order.product, quantity: order.quantity, unitPrice: order.unitPrice, shippingCompanyId: order.shippingCompanyId, trackingNumber: (order as any).trackingNumber ?? null, notes: order.notes });
      initializedRef.current = true;
    }
  }, [order, form]);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: ["products"] });
  };

  const handleStatusChange = (newStatus: string) => {
    if (!order || order.status === newStatus) return;
    if (newStatus === "partial_received") { setShowPartialInput(true); return; }
    if (newStatus === "returned") { setShowReturnInput(true); return; }

    updateOrder.mutate({ id, data: { status: newStatus as any } }, {
      onSuccess: (updated: any) => {
        queryClient.setQueryData(getGetOrderQueryKey(id), updated);
        invalidateAll();
        if (newStatus === "in_shipping" && updated.manifestId) {
          toast({
            title: "ظ£à ╪ز┘à ╪د┘╪ز╪ص┘ê┘è┘ ┘┘é┘è╪» ╪د┘╪┤╪ص┘",
            description: "╪ز┘à ╪«╪╡┘à ╪د┘┘à╪«╪▓┘ê┘ ┘ê╪ح╪╢╪د┘╪ر ╪د┘╪╖┘╪ذ ┘╪ذ┘è╪د┘ ╪د┘╪┤╪ص┘",
            action: (
              <ToastAction altText="╪╣╪▒╪╢ ╪د┘╪ذ┘è╪د┘" onClick={() => navigate(`/shipping/manifests/${updated.manifestId}`)}>
                ╪╣╪▒╪╢ ╪د┘╪ذ┘è╪د┘ ظ
              </ToastAction>
            ),
          });
        } else {
          toast({ title: "╪ز┘à ╪ز╪ص╪»┘è╪س ╪د┘╪ص╪د┘╪ر", description: `╪د┘╪╖┘╪ذ ╪ث╪╡╪ذ╪ص: ${statusLabels[newStatus]}` });
        }
      },
      onError: () => toast({ title: "╪«╪╖╪ث", description: "┘╪┤┘ ╪ز╪ص╪»┘è╪س ╪د┘╪ص╪د┘╪ر.", variant: "destructive" }),
    });
  };

  const handlePartialReceived = () => {
    const pQty = parseInt(partialQty);
    if (isNaN(pQty) || pQty < 1) { toast({ title: "╪«╪╖╪ث", description: "╪ث╪»╪«┘ ┘â┘à┘è╪ر ╪╡╪ص┘è╪ص╪ر.", variant: "destructive" }); return; }

    updateOrder.mutate({ id, data: { status: "partial_received", partialQuantity: pQty } }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetOrderQueryKey(id), updated);
        invalidateAll();
        setShowPartialInput(false);
        setPartialQty("");
        toast({ title: "╪ز┘à ╪د┘╪ز╪ص╪»┘è╪س", description: `╪ز┘à ╪د╪│╪ز┘╪د┘à ${pQty} ┘ê╪ص╪»╪ر ╪ش╪▓╪خ┘è╪د┘ï.` });
      },
      onError: () => toast({ title: "╪«╪╖╪ث", description: "┘╪┤┘ ╪د┘╪ز╪ص╪»┘è╪س.", variant: "destructive" }),
    });
  };

  const handleReturnConfirm = () => {
    if (!returnReason) { toast({ title: "╪«╪╖╪ث", description: "╪د╪«╪ز╪▒ ╪│╪ذ╪ذ ╪د┘╪ح╪▒╪ش╪د╪╣.", variant: "destructive" }); return; }
    if (returnReason === "other" && !returnNote.trim()) { toast({ title: "╪«╪╖╪ث", description: "╪د┘â╪ز╪ذ ╪│╪ذ╪ذ ╪د┘╪ح╪▒╪ش╪د╪╣.", variant: "destructive" }); return; }

    updateOrder.mutate({
      id,
      data: {
        status: "returned",
        returnReason,
        returnNote: returnReason === "other" ? returnNote.trim() : null,
        isDamaged: returnIsDamaged,
      } as any,
    }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetOrderQueryKey(id), updated);
        invalidateAll();
        setShowReturnInput(false);
        setReturnReason("");
        setReturnNote("");
        setReturnIsDamaged(false);
        toast({ title: "╪ز┘à ╪د┘╪ز╪│╪ش┘è┘", description: returnIsDamaged ? "╪ز┘à ╪ز╪│╪ش┘è┘ ╪د┘┘à╪▒╪ز╪ش╪╣ ╪د┘╪ز╪د┘┘ ظ¤ ┘┘à ┘è┘╪╢╪د┘ ┘┘┘à╪«╪▓┘ê┘." : "╪ز┘à ╪ز╪│╪ش┘è┘ ╪د┘┘à╪▒╪ز╪ش╪╣ ┘ê╪ث┘╪╢┘è┘ ┘┘┘à╪«╪▓┘ê┘." });
      },
      onError: () => toast({ title: "╪«╪╖╪ث", description: "┘╪┤┘ ╪ز╪ص╪»┘è╪س ╪د┘╪ص╪د┘╪ر.", variant: "destructive" }),
    });
  };

  const onSubmitEdit = (values: EditFormValues) => {
    updateOrder.mutate({ id, data: { ...values, shippingCompanyId: values.shippingCompanyId || null } }, {
      onSuccess: (updated) => {
        queryClient.setQueryData(getGetOrderQueryKey(id), updated);
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetRecentOrdersQueryKey() });
        setIsEditing(false);
        initializedRef.current = false;
        toast({ title: "╪ز┘à ╪د┘╪ص┘╪╕", description: "╪ز┘à ╪ص┘╪╕ ╪د┘╪ز╪╣╪»┘è┘╪د╪ز ╪ذ┘╪ش╪د╪ص." });
      },
      onError: () => toast({ title: "╪«╪╖╪ث", description: "┘╪┤┘ ╪د┘╪ص┘╪╕.", variant: "destructive" }),
    });
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await ordersApi.delete(id);
      // Remove this order from cache immediately so it won't show on return
      queryClient.removeQueries({ queryKey: getGetOrderQueryKey(id) });
      // Force-refetch the orders list (bypass staleTime)
      await queryClient.refetchQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetOrdersSummaryQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetRecentOrdersQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["orders-stats"] });
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "╪ز┘à ╪د┘╪ص╪░┘", description: "╪ز┘à ╪ص╪░┘ ╪د┘╪╖┘╪ذ ╪ذ┘╪ش╪د╪ص." });
      navigate("/orders");
    } catch (err: any) {
      const msg = err?.message || "┘╪┤┘ ╪ص╪░┘ ╪د┘╪╖┘╪ذ.";
      toast({ title: "╪«╪╖╪ث", description: msg, variant: "destructive" });
    } finally {
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const handlePrint = () => { window.open(`/invoices?orderId=${id}`, "_blank"); };

  const handleWhatsApp = () => { setShowWaDialog(true); };

  const handleWaSent = () => {
    if (!order) return;
    if (order.status === "pending") {
      updateOrder.mutate(
        { id, data: { status: "in_shipping" } },
        {
          onSuccess: (updated: any) => {
            queryClient.setQueryData(getGetOrderQueryKey(id), updated);
            invalidateAll();
            if (updated.manifestId) {
              toast({
                title: "╪ز┘à ╪ح╪▒╪│╪د┘ ┘ê╪د╪ز╪│╪د╪ذ ظ£à",
                description: "╪ز┘à ╪ز╪ص┘ê┘è┘ ╪د┘╪╖┘╪ذ ┘┘ ┬س┘é┘è╪» ╪د┘╪┤╪ص┘┬╗ ┘ê╪ح╪╢╪د┘╪ز┘ç ┘┘╪ذ┘è╪د┘",
                action: (
                  <ToastAction altText="╪╣╪▒╪╢ ╪د┘╪ذ┘è╪د┘" onClick={() => navigate(`/shipping/manifests/${updated.manifestId}`)}>
                    ╪╣╪▒╪╢ ╪د┘╪ذ┘è╪د┘ ظ
                  </ToastAction>
                ),
              });
            } else {
              toast({ title: "╪ز┘à ╪ح╪▒╪│╪د┘ ┘ê╪د╪ز╪│╪د╪ذ ظ£à", description: "╪ز┘à ╪ز╪ص┘ê┘è┘ ╪د┘╪╖┘╪ذ ┘┘ ┬س┘é┘è╪» ╪د┘╪┤╪ص┘┬╗ ╪ز┘┘é╪د╪خ┘è╪د┘ï" });
            }
          },
        }
      );
    } else {
      toast({ title: "╪ز┘à ┘╪ز╪ص ┘ê╪د╪ز╪│╪د╪ذ ظ£à", description: "╪د┘╪▒╪│╪د┘╪ر ╪ش╪د┘ç╪▓╪ر ┘┘╪ح╪▒╪│╪د┘" });
    }
  };

  if (isLoading) return <div className="p-12 text-center text-muted-foreground animate-pulse">╪ش╪د╪▒┘è ╪د┘╪ز╪ص┘à┘è┘...</div>;
  if (error || !order) return (
    <div className="p-12 text-center">
      <AlertCircle className="w-12 h-12 mx-auto mb-3 text-destructive opacity-50" />
      <h2 className="text-lg font-bold mb-2">╪د┘╪╖┘╪ذ ╪║┘è╪▒ ┘à┘ê╪ش┘ê╪»</h2>
      <Link href="/orders"><Button variant="outline" className="mt-3">╪د┘╪╣┘ê╪»╪ر ┘┘╪╖┘╪ذ╪د╪ز</Button></Link>
    </div>
  );

  const shippingCompany = shippingCompanies?.find(c => c.id === order.shippingCompanyId);
  const orderReturnReason = (order as any).returnReason as string | null;
  const orderReturnNote = (order as any).returnNote as string | null;
  const isOrderLocked = (order.status === "received" || order.status === "partial_received") && !isAdmin;

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/orders">
            <Button variant="outline" size="icon" className="h-8 w-8 rounded-full border-border"><ArrowRight className="h-4 w-4" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">╪╖┘╪ذ #{order.id.toString().padStart(4,"0")}</h1>
              {!isEditing && (
                <Badge variant="outline" className={`font-bold border text-[10px] ${statusClasses[order.status] || ""}`}>
                  {statusLabels[order.status] || order.status}
                </Badge>
              )}
              {isOrderLocked && (
                <Badge variant="outline" className="text-[9px] font-bold border-amber-700 bg-amber-900/10 text-amber-400 gap-1 flex items-center">
                  <Lock className="w-2.5 h-2.5" /> ┘à┘é┘┘
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(order.createdAt), "yyyy/MM/dd HH:mm")}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isEditing && (
            <>
              <div className="w-44">
                <Select value={order.status} onValueChange={handleStatusChange} disabled={updateOrder.isPending}>
                  <SelectTrigger className="h-8 text-xs bg-card border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">┘é┘è╪» ╪د┘╪د┘╪ز╪╕╪د╪▒</SelectItem>
                    <SelectItem value="in_shipping">┘é┘è╪» ╪د┘╪┤╪ص┘</SelectItem>
                    <SelectItem value="received">╪د╪│╪ز┘┘à ظ£ô</SelectItem>
                    <SelectItem value="delayed">┘à╪ج╪ش┘</SelectItem>
                    <SelectItem value="returned">┘à╪▒╪ز╪ش╪╣</SelectItem>
                    <SelectItem value="partial_received">╪د╪│╪ز┘┘à ╪ش╪▓╪خ┘è</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline" size="sm"
                onClick={() => !isOrderLocked && setIsEditing(true)}
                disabled={isOrderLocked}
                title={isOrderLocked ? "╪د┘╪╖┘╪ذ ┘à┘é┘┘ ظ¤ ┘┘é╪╖ ╪د┘┘à╪»┘è╪▒ ┘è┘à┘â┘┘ç ╪د┘╪ز╪╣╪»┘è┘" : undefined}
                className="h-8 text-xs gap-1 border-border disabled:opacity-40"
              >
                {isOrderLocked ? <Lock className="w-3 h-3" /> : <Pencil className="w-3 h-3" />}╪ز╪╣╪»┘è┘
              </Button>
              <Button variant="outline" size="sm" onClick={handlePrint} className="h-8 text-xs gap-1 border-border">
                <Printer className="w-3 h-3" />┘╪د╪ز┘ê╪▒╪ر
              </Button>
              {(order.status === "pending" || order.status === "in_shipping" || order.status === "delayed") && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleWhatsApp}
                  className="h-8 text-xs gap-1 border-green-700 text-green-400 hover:bg-green-500/10 hover:text-green-400"
                  title="╪ح╪▒╪│╪د┘ ╪▒╪│╪د┘╪ر ┘ê╪د╪ز╪│╪د╪ذ ┘┘╪╣┘à┘è┘"
                >
                  <MessageCircle className="w-3 h-3" />┘ê╪د╪ز╪│╪د╪ذ
                </Button>
              )}
              <Button
                variant="outline" size="sm"
                onClick={() => !isOrderLocked && setShowDeleteDialog(true)}
                disabled={isOrderLocked}
                title={isOrderLocked ? "╪د┘╪╖┘╪ذ ┘à┘é┘┘ ظ¤ ┘┘é╪╖ ╪د┘┘à╪»┘è╪▒ ┘è┘à┘â┘┘ç ╪د┘╪ص╪░┘" : undefined}
                className="h-8 text-xs gap-1 border-red-800 text-red-400 hover:bg-red-900/20 hover:text-red-400 disabled:opacity-40"
              >
                <Trash2 className="w-3 h-3" />╪ص╪░┘
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>╪ز╪ث┘â┘è╪» ╪ص╪░┘ ╪د┘╪╖┘╪ذ</AlertDialogTitle>
            <AlertDialogDescription>
              ┘ç┘ ╪ث┘╪ز ┘à╪ز╪ث┘â╪» ┘à┘ ╪ص╪░┘ ╪╖┘╪ذ #{order.id.toString().padStart(4,"0")} ┘┘╪╣┘à┘è┘ {order.customerName}╪ا ┘╪د ┘è┘à┘â┘ ╪د┘╪ز╪▒╪د╪ش╪╣ ╪╣┘ ┘ç╪░╪د ╪د┘╪ح╪ش╪▒╪د╪ة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>╪ح┘╪║╪د╪ة</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700 text-white">
              {isDeleting ? "╪ش╪د╪▒┘è ╪د┘╪ص╪░┘..." : "┘╪╣┘à╪î ╪د╪ص╪░┘"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* WhatsApp dialog */}
      {order && (
        <WhatsAppDialog
          open={showWaDialog}
          onOpenChange={setShowWaDialog}
          order={{ id: order.id, customerName: order.customerName, product: order.product, quantity: order.quantity, totalPrice: order.totalPrice, status: order.status, phone: order.phone }}
          onSent={handleWaSent}
        />
      )}

      {/* Partial received input */}
      {showPartialInput && (
        <Card className="border-purple-800 bg-purple-900/20">
          <CardContent className="p-4">
            <p className="text-sm font-bold text-purple-400 mb-3">╪د╪│╪ز┘╪د┘à ╪ش╪▓╪خ┘è ظ¤ ┘â┘à ┘ê╪ص╪»╪ر ╪د╪│╪ز┘┘à╪ز╪ا</p>
            <div className="flex items-center gap-3">
              <Input type="number" min="1" max={order.quantity} placeholder={`╪د┘╪ص╪» ╪د┘╪ث┘é╪╡┘ë: ${order.quantity}`} value={partialQty} onChange={e => setPartialQty(e.target.value)} className="h-8 text-sm w-40 bg-card" />
              <Button size="sm" className="h-8 text-xs bg-purple-600 hover:bg-purple-700 text-white" onClick={handlePartialReceived} disabled={updateOrder.isPending}>╪ز╪ث┘â┘è╪»</Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowPartialInput(false); setPartialQty(""); }}>╪ح┘╪║╪د╪ة</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Return reason input */}
      {showReturnInput && (
        <Card className="border-red-800 bg-red-900/20">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <RotateCcw className="w-4 h-4 text-red-400" />
              <p className="text-sm font-bold text-red-400">╪ز╪│╪ش┘è┘ ┘à╪▒╪ز╪ش╪╣ ظ¤ ┘à╪د ╪│╪ذ╪ذ ╪د┘╪ح╪▒╪ش╪د╪╣╪ا</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">╪│╪ذ╪ذ ╪د┘╪ح╪▒╪ش╪د╪╣ *</Label>
              <Select value={returnReason} onValueChange={setReturnReason}>
                <SelectTrigger className="h-9 text-sm bg-card border-red-800 focus:ring-red-700">
                  <SelectValue placeholder="╪د╪«╪ز╪▒ ╪د┘╪│╪ذ╪ذ..." />
                </SelectTrigger>
                <SelectContent>
                  {RETURN_REASONS.map(r => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {returnReason === "other" && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">╪د┘â╪ز╪ذ ╪د┘╪│╪ذ╪ذ *</Label>
                <Textarea
                  placeholder="╪د┘â╪ز╪ذ ╪│╪ذ╪ذ ╪د┘╪ح╪▒╪ش╪د╪╣ ╪ذ╪د┘╪ز┘╪╡┘è┘..."
                  className="min-h-[70px] text-sm resize-none bg-card border-red-800 focus:ring-red-700"
                  value={returnNote}
                  onChange={e => setReturnNote(e.target.value)}
                />
              </div>
            )}
            {/* Damaged checkbox */}
            <div
              className={`flex items-center gap-3 p-2.5 rounded border cursor-pointer transition-colors ${returnIsDamaged ? "border-amber-700 bg-amber-900/20" : "border-border bg-card/50"}`}
              onClick={() => setReturnIsDamaged(v => !v)}
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${returnIsDamaged ? "bg-amber-600 border-amber-600" : "border-muted-foreground"}`}>
                {returnIsDamaged && <X className="w-2.5 h-2.5 text-white" />}
              </div>
              <div>
                <p className={`text-xs font-bold ${returnIsDamaged ? "text-amber-400" : "text-muted-foreground"}`}>
                  <AlertTriangle className="w-3 h-3 inline ml-1" />
                  ╪د┘┘à┘╪ز╪ش ╪ز╪د┘┘ / ╪║┘è╪▒ ╪╡╪د┘╪ص ┘┘╪ذ┘è╪╣
                </p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {returnIsDamaged ? "ظأب ┘┘ ┘è┘╪╢╪د┘ ┘┘┘à╪«╪▓┘ê┘ ظ¤ ╪│┘è┘╪│╪ش┘┘ّ┘ ┘â╪«╪│╪د╪▒╪ر" : "┘┘è ╪ص╪د┘╪ر ╪د┘╪ز┘è┘â╪î ┘┘ ┘è┘╪▒╪ش┘╪╣ ┘┘┘à╪«╪▓┘ê┘"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" className="h-8 text-xs bg-red-700 hover:bg-red-600 text-white gap-1" onClick={handleReturnConfirm} disabled={updateOrder.isPending}>
                <RotateCcw className="w-3 h-3" />{updateOrder.isPending ? "╪ش╪د╪▒┘è..." : "╪ز╪ث┘â┘è╪» ╪د┘╪ح╪▒╪ش╪د╪╣"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowReturnInput(false); setReturnReason(""); setReturnNote(""); setReturnIsDamaged(false); }}>╪ح┘╪║╪د╪ة</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 space-y-4">
          {isEditing ? (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitEdit)}>
                <Card className="border-primary/40 bg-card">
                  <CardHeader className="pb-3 pt-4 px-4 border-b border-border">
                    <CardTitle className="text-sm font-bold text-primary">╪ز╪╣╪»┘è┘ ╪د┘╪╖┘╪ذ</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="customerName" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">╪د╪│┘à ╪د┘╪╣┘à┘è┘</FormLabel><FormControl><Input className="h-8 text-sm" {...field} /></FormControl><FormMessage className="text-xs"/></FormItem>
                      )} />
                      <FormField control={form.control} name="phone" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">╪د┘┘ç╪د╪ز┘</FormLabel><FormControl><Input className="h-8 text-sm" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="address" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">╪د┘╪╣┘┘ê╪د┘</FormLabel><FormControl><Input className="h-8 text-sm" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                    )} />
                    <div className="grid grid-cols-2 gap-3">
                      <FormField control={form.control} name="shippingCompanyId" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">╪┤╪▒┘â╪ر ╪د┘╪┤╪ص┘</FormLabel>
                          <Select value={field.value?.toString() || "none"} onValueChange={v => field.onChange(v === "none" ? null : Number(v))}>
                            <SelectTrigger className="h-8 text-sm bg-card"><SelectValue placeholder="╪ذ╪»┘ê┘" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">╪ذ╪»┘ê┘</SelectItem>
                              {shippingCompanies?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )} />
                      <FormField control={form.control} name="trackingNumber" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">╪▒┘é┘à ╪د┘╪ز╪ز╪ذ╪╣</FormLabel><FormControl><Input className="h-8 text-sm font-mono" placeholder="TRK-12345" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                      )} />
                    </div>
                    {/* Product picker from inventory */}
                    <div className="space-y-2 p-3 bg-muted/10 rounded border border-border/50">
                      <p className="text-[10px] text-muted-foreground font-bold flex items-center gap-1"><Package className="w-3 h-3" />╪د╪«╪ز╪▒ ┘à┘ ╪د┘┘à╪«╪▓┘ê┘ (╪د╪«╪ز┘è╪د╪▒┘è)</p>
                      <div className="grid grid-cols-2 gap-2">
                        {/* Product dropdown */}
                        <div>
                          <p className="text-[10px] text-muted-foreground mb-1">╪د┘┘à┘╪ز╪ش</p>
                          <Select
                            value={editProductId?.toString() || "none"}
                            onValueChange={v => {
                              if (v === "none") {
                                setEditProductId(null);
                                setEditColor("");
                              } else {
                                const pid = Number(v);
                                setEditProductId(pid);
                                setEditColor("");
                                const p = products?.find(p => p.id === pid);
                                if (p) form.setValue("product", p.name);
                              }
                            }}
                          >
                            <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="╪د╪«╪ز╪▒ ┘à┘ ╪د┘┘à╪«╪▓┘ê┘..." /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">ظ¤ ╪ح╪»╪«╪د┘ ┘è╪»┘ê┘è ظ¤</SelectItem>
                              {products?.map(p => {
                                const avail = p.totalQuantity - p.reservedQuantity - p.soldQuantity;
                                return (
                                  <SelectItem key={p.id} value={String(p.id)}>
                                    {p.name} ({avail} ┘à╪ز╪د╪ص)
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* Color dropdown (only if product has variants) */}
                        {editProductId && allVariants?.some(v => v.productId === editProductId) && (
                          <div>
                            <p className="text-[10px] text-muted-foreground mb-1">╪د┘┘┘ê┘ / ╪د┘┘à┘é╪د╪│</p>
                            <Select
                              value={editColor || "none"}
                              onValueChange={v => {
                                setEditColor(v === "none" ? "" : v);
                                const variant = allVariants?.find(va => va.productId === editProductId && `${va.color}-${va.size}` === v);
                                if (variant) form.setValue("unitPrice", variant.unitPrice);
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs bg-card"><SelectValue placeholder="╪د╪«╪ز╪▒..." /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">ظ¤ ╪ذ╪»┘ê┘ ╪ز╪ص╪»┘è╪» ظ¤</SelectItem>
                                {allVariants
                                  ?.filter(v => v.productId === editProductId)
                                  .map(v => {
                                    const avail = v.totalQuantity - v.reservedQuantity - v.soldQuantity;
                                    const key = `${v.color}-${v.size}`;
                                    return (
                                      <SelectItem key={v.id} value={key} disabled={avail === 0}>
                                        {v.color} / {v.size} ظ¤ {avail === 0 ? "┘┘╪»" : `${avail} ┘à╪ز╪د╪ص`}
                                      </SelectItem>
                                    );
                                  })}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                      {/* Stock badge */}
                      {editProductId && (() => {
                        const variants = allVariants?.filter(v => v.productId === editProductId) ?? [];
                        if (variants.length === 0) {
                          const p = products?.find(p => p.id === editProductId);
                          if (!p) return null;
                          const avail = p.totalQuantity - p.reservedQuantity - p.soldQuantity;
                          return (
                            <Badge variant="outline" className={`text-[9px] font-bold border ${avail <= p.lowStockThreshold ? "border-red-700 text-red-400" : "border-emerald-700 text-emerald-400"}`}>
                              ┘à╪ز╪د╪ص ┘┘è ╪د┘┘à╪«╪▓┘ê┘: {avail} ┘ê╪ص╪»╪ر
                            </Badge>
                          );
                        }
                        if (editColor) {
                          const variant = variants.find(v => `${v.color}-${v.size}` === editColor);
                          if (!variant) return null;
                          const avail = variant.totalQuantity - variant.reservedQuantity - variant.soldQuantity;
                          return (
                            <Badge variant="outline" className={`text-[9px] font-bold border ${avail <= variant.lowStockThreshold ? "border-red-700 text-red-400" : "border-emerald-700 text-emerald-400"}`}>
                              ┘à╪ز╪د╪ص ({variant.color} / {variant.size}): {avail} ┘ê╪ص╪»╪ر
                            </Badge>
                          );
                        }
                        const totalAvail = variants.reduce((s, v) => s + v.totalQuantity - v.reservedQuantity - v.soldQuantity, 0);
                        return (
                          <Badge variant="outline" className="text-[9px] font-bold border-primary/40 text-primary">
                            ╪ح╪ش┘à╪د┘┘è ╪د┘┘à╪ز╪د╪ص: {totalAvail} ┘ê╪ص╪»╪ر ({variants.length} ┘à╪ز╪║┘è╪▒╪د╪ز)
                          </Badge>
                        );
                      })()}
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <FormField control={form.control} name="product" render={({ field }) => (
                        <FormItem className="col-span-1"><FormLabel className="text-xs">╪د╪│┘à ╪د┘┘à┘╪ز╪ش</FormLabel><FormControl><Input className="h-8 text-sm" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="quantity" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">╪د┘┘â┘à┘è╪ر</FormLabel><FormControl><Input type="number" min="1" className="h-8 text-sm" {...field} /></FormControl></FormItem>
                      )} />
                      <FormField control={form.control} name="unitPrice" render={({ field }) => (
                        <FormItem><FormLabel className="text-xs">╪د┘╪│╪╣╪▒</FormLabel><FormControl><Input type="number" min="0" step="0.01" className="h-8 text-sm" {...field} /></FormControl></FormItem>
                      )} />
                    </div>
                    <FormField control={form.control} name="notes" render={({ field }) => (
                      <FormItem><FormLabel className="text-xs">┘à┘╪د╪ص╪╕╪د╪ز</FormLabel><FormControl><Textarea className="min-h-[60px] text-sm resize-none" {...field} value={field.value ?? ""} /></FormControl></FormItem>
                    )} />
                    <div className="flex gap-2 pt-2">
                      <Button type="submit" size="sm" className="h-8 text-xs gap-1" disabled={updateOrder.isPending}>
                        <Save className="w-3 h-3" />{updateOrder.isPending ? "╪ش╪د╪▒┘è..." : "╪ص┘╪╕"}
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => { setIsEditing(false); initializedRef.current = false; setEditProductId(null); setEditColor(""); }}>
                        <X className="w-3 h-3 ml-1" />╪ح┘╪║╪د╪ة
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </form>
            </Form>
          ) : (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3 pt-4 px-4 border-b border-border">
                <CardTitle className="text-sm font-bold">╪ز┘╪د╪╡┘è┘ ╪د┘╪╖┘╪ذ</CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">╪د╪│┘à ╪د┘╪╣┘à┘è┘</p>
                    <p className="font-semibold">{order.customerName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Phone className="w-3 h-3" />╪د┘┘ç╪د╪ز┘</p>
                    <p className="font-semibold">{order.phone || <span className="text-muted-foreground">ظ¤</span>}</p>
                  </div>
                  {order.address && (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" />╪د┘╪╣┘┘ê╪د┘</p>
                      <p className="font-semibold">{order.address}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">╪د┘┘à┘╪ز╪ش</p>
                    <p className="font-semibold">{order.product}</p>
                    {((order as any).color || (order as any).size) && (
                      <div className="flex items-center gap-1.5 mt-1">
                        {(order as any).color && <Badge variant="outline" className="text-[9px] border-border text-muted-foreground">{(order as any).color}</Badge>}
                        {(order as any).size && <Badge variant="outline" className="text-[9px] border-primary/40 text-primary font-bold">{(order as any).size}</Badge>}
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">╪د┘┘â┘à┘è╪ر</p>
                    <p className="font-semibold">{order.quantity} ┘ê╪ص╪»╪ر</p>
                  </div>
                  {order.partialQuantity && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">╪د┘┘à╪│╪ز┘┘à ╪ش╪▓╪خ┘è╪د┘ï</p>
                      <p className="font-semibold text-purple-400">{order.partialQuantity} ┘ê╪ص╪»╪ر</p>
                    </div>
                  )}
                  {shippingCompany && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">╪┤╪▒┘â╪ر ╪د┘╪┤╪ص┘</p>
                      <p className="font-semibold">{shippingCompany.name}</p>
                    </div>
                  )}
                </div>

                {/* Return reason section */}
                {order.status === "returned" && orderReturnReason && (
                  <div className="mt-2 p-3 rounded border border-red-900 bg-red-900/10">
                    <p className="text-xs text-red-400 font-bold mb-1 flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" />╪│╪ذ╪ذ ╪د┘╪ح╪▒╪ش╪د╪╣
                    </p>
                    <p className="text-sm font-semibold text-red-300">
                      {returnReasonLabel(orderReturnReason, orderReturnNote)}
                    </p>
                    {orderReturnNote && orderReturnReason !== "other" && (
                      <p className="text-xs text-muted-foreground mt-1">{orderReturnNote}</p>
                    )}
                  </div>
                )}

                {order.notes && (
                  <div className="mt-2">
                    <p className="text-xs text-muted-foreground mb-1">┘à┘╪د╪ص╪╕╪د╪ز</p>
                    <div className="bg-muted/20 p-3 rounded text-sm border border-border">{order.notes}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Financial summary */}
        <div className="space-y-4">
          {/* Revenue */}
          <Card className="border-primary/30 bg-card">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold text-primary">╪د┘┘à┘╪«╪╡ ╪د┘┘à╪د┘┘è</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">╪د┘┘â┘à┘è╪ر</span>
                  <span>{order.quantity}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">╪│╪╣╪▒ ╪د┘┘ê╪ص╪»╪ر</span>
                  <span>{formatCurrency(order.unitPrice)}</span>
                </div>
                <Separator className="border-border" />
                <div className="flex justify-between">
                  <span className="font-bold text-xs">╪ح╪ش┘à╪د┘┘è ╪د┘╪ذ┘è╪╣</span>
                  <span className="font-bold text-lg text-primary">{formatCurrency(order.totalPrice)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Profit breakdown ظ¤ admin only */}
          {canViewFinancials && (() => {
            const costPrice = (order as any).costPrice as number | null;
            const shippingCost = (order as any).shippingCost as number | null;
            if (!costPrice) return null;
            const qty = order.status === "partial_received" && order.partialQuantity ? order.partialQuantity : order.quantity;
            const isReturned = order.status === "returned";
            const revenue = isReturned ? 0 : qty * order.unitPrice;
            const cost = qty * costPrice;
            const shipping = shippingCost ?? 0;
            const netProfit = revenue - cost - shipping;
            const margin = revenue > 0 ? Math.round((netProfit / revenue) * 100) : 0;
            const isPositive = netProfit >= 0;
            return (
              <Card className={`border ${isReturned ? "border-red-900/50 bg-red-900/5" : isPositive ? "border-emerald-900/50 bg-emerald-900/5" : "border-red-900/50 bg-red-900/5"}`}>
                <CardHeader className="pb-2 pt-4 px-4 border-b border-border">
                  <CardTitle className="text-sm font-bold flex items-center gap-2">
                    {isPositive && !isReturned ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                    ╪ز╪ص┘┘è┘ ╪د┘╪▒╪ذ╪ص┘è╪ر
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-4 pt-3 space-y-2 text-xs">
                  {isReturned && (
                    <div className="p-2 bg-red-900/20 rounded text-red-400 text-[10px] font-semibold border border-red-900/30">
                      ┘à╪▒╪ز╪ش╪╣ ظ¤ ╪«╪│╪د╪▒╪ر ┘â╪د┘à┘╪ر
                    </div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">╪د┘╪ح┘è╪▒╪د╪»╪د╪ز</span><span className="text-primary font-semibold">{formatCurrency(revenue)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">╪ز┘â┘┘╪ر ╪د┘╪ذ╪╢╪د╪╣╪ر</span><span className="text-amber-400">-{formatCurrency(cost)}</span></div>
                  {shipping > 0 && <div className="flex justify-between"><span className="text-muted-foreground">╪ز┘â┘┘╪ر ╪د┘╪┤╪ص┘</span><span className="text-orange-400">-{formatCurrency(shipping)}</span></div>}
                  <Separator />
                  <div className="flex justify-between items-center pt-1">
                    <span className="font-bold">╪د┘╪▒╪ذ╪ص ╪د┘╪╡╪د┘┘è</span>
                    <span className={`font-black text-base ${isPositive && !isReturned ? "text-emerald-400" : "text-red-400"}`}>{formatCurrency(netProfit)}</span>
                  </div>
                  {revenue > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">┘ç╪د┘à╪┤ ╪د┘╪▒╪ذ╪ص</span>
                      <span className={`font-bold ${margin >= 20 ? "text-emerald-400" : margin >= 10 ? "text-amber-400" : "text-red-400"}`}>{margin}%</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          <p className="text-[10px] text-center text-muted-foreground">
            ╪ت╪«╪▒ ╪ز╪ص╪»┘è╪س: {format(new Date(order.updatedAt), "yyyy/MM/dd HH:mm")}
          </p>
        </div>
      </div>
    </div>
  );
}
