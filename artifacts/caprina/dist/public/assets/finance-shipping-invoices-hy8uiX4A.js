import{j as e,b as xe,u as _,c as V}from"./vendor-query-8HrXCEMH.js";import{u as ge,g as he,q as ue,B as R,a as v}from"./index-DLH1JnOV.js";import{u as be,r as U,L as H}from"./vendor-router-D4U-j562.js";import{C as J}from"./card-BWamtzWZ.js";import{S as fe,a as we,b as ye,c as ve,d as E}from"./select-DZfFw-bR.js";import{a5 as K,a2 as je,af as X,bj as Z,C as ee,n as te,T as Q,N as Ne,ae as ke,b9 as se,P as $e,aa as Fe}from"./vendor-icons-Dkbae6l-.js";import{f as $}from"./format-CzfXRGH8.js";import"./vendor-ui-B6Uk5PbZ.js";import"./vendor-charts-BgmbPIKF.js";const Ae={pending:{label:"في انتظار التسوية",color:"#F59E0B",glow:"rgba(245,158,11,0.25)",solid:"rgba(245,158,11,0.15)"},verified:{label:"تم التحقق",color:"#3B82F6",glow:"rgba(59,130,246,0.25)",solid:"rgba(59,130,246,0.15)"},paid:{label:"تم التحويل للخزنة",color:"#10B981",glow:"rgba(16,185,129,0.25)",solid:"rgba(16,185,129,0.15)"},disputed:{label:"متنازع عليها",color:"#EF4444",glow:"rgba(239,68,68,0.25)",solid:"rgba(239,68,68,0.15)"}},u=P=>new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:0}).format(Number(P));function Oe(){const{isAdmin:P,can:ae}=ge();if(!P&&!ae("finance.view"))return e.jsxs("div",{className:"flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4",children:[e.jsx("div",{className:"w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center",children:e.jsx("span",{className:"text-3xl",children:"🔒"})}),e.jsx("h2",{className:"text-xl font-bold",children:"غير مصرح بالوصول"}),e.jsx("p",{className:"text-muted-foreground text-sm max-w-xs",children:"ليس لديك صلاحية لعرض صفحة الماليات. تواصل مع المدير."})]});const f=xe(),{toast:j}=he(),[,re]=be(),{brand:Se}=ue(),[D,ie]=U.useState("all"),[M,I]=U.useState(null),[F,ne]=U.useState(new Set),oe=t=>{ne(l=>{const s=new Set(l);return s.has(t)?s.delete(t):s.add(t),s})},{data:w=[],isLoading:le}=_({queryKey:["finance-shipping-invoices"],queryFn:()=>v("/finance/shipping-invoices")}),{data:Y=[]}=_({queryKey:["shipping"],queryFn:()=>v("/shipping-companies")}),{data:de}=_({queryKey:["/api/cash-registers"],queryFn:()=>v("/cash-registers")}),T=de?.registers?.find(t=>t.type==="main"),W=V({mutationFn:({id:t,status:l})=>v(`/finance/shipping-invoices/${t}`,{method:"PATCH",body:JSON.stringify({status:l})}),onSuccess:()=>{f.invalidateQueries({queryKey:["finance-shipping-invoices"]}),f.invalidateQueries({queryKey:["/api/cash-registers"]}),f.invalidateQueries({queryKey:["/api/cash-registers/alerts"]}),f.invalidateQueries({queryKey:["finance-hub"]}),j({title:"✅ تم تحديث حالة الفاتورة"})},onError:t=>j({title:"❌ خطأ",description:t.message,variant:"destructive"})}),A=V({mutationFn:t=>v(`/finance/shipping-invoices/${t}`,{method:"DELETE"}),onSuccess:()=>{f.invalidateQueries({queryKey:["finance-shipping-invoices"]}),f.invalidateQueries({queryKey:["/api/cash-registers"]}),f.invalidateQueries({queryKey:["finance-hub"]}),I(null),j({title:"✅ تم حذف الفاتورة بنجاح"})},onError:t=>{I(null),j({title:"❌ فشل الحذف",description:t.message,variant:"destructive"})}}),O=D==="all"?w:w.filter(t=>t.status===D),y=t=>{const l=parseFloat(String(t??0));return isNaN(l)?0:l},q=w.filter(t=>t.status==="pending").reduce((t,l)=>t+y(l.netDue)-y(l.paidAmount),0),ce=w.filter(t=>t.status==="paid").reduce((t,l)=>t+y(l.netDue),0),pe=async()=>{if(F.size===0)return;const t=w.filter(r=>F.has(r.id)),l=await new Promise(r=>{const n=new Image;n.crossOrigin="anonymous",n.onload=()=>{const p=document.createElement("canvas");p.width=n.width,p.height=n.height;const b=p.getContext("2d");b.drawImage(n,0,0);const g=b.getImageData(0,0,p.width,p.height);for(let o=0;o<g.data.length;o+=4){const a=g.data[o],d=g.data[o+1],x=g.data[o+2];a<40&&d<40&&x<40&&(g.data[o+3]=0)}b.putImageData(g,0,0),r(p.toDataURL("image/png"))},n.onerror=()=>r(`${window.location.origin}/logo.jpg`),n.src=`${window.location.origin}/logo.jpg`}),s={pending:"قيد الانتظار",warehouse_ready:"جاهزة للشحن",in_shipping:"قيد الشحن",received:"استلم",partial_received:"استلم جزئي",returned:"مرتجع",delivered:"استلم",waiting:"انتظار",cancelled:"ملغية",delayed:"مؤجل"},c=r=>new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(Number(r||0)),L=(await Promise.all(t.map(async r=>{let n=[];if(r.manifestId)try{const p=await v(`/shipping-manifests/${r.manifestId}`);n=p?.orders??p?.shipments??[]}catch{}return{inv:r,shipments:n}}))).map(({inv:r,shipments:n})=>{const p=Y.find(i=>i.id===r.shippingCompanyId),b=r.createdAt?$(new Date(r.createdAt),"yyyy/MM/dd"):"",g=n.reduce((i,m)=>i+Number(m.shippingFee||0),0),o=n.reduce((i,m)=>i+Number(m.codAmount||0),0),a=Number(r.netDue||0);Number(r.paidAmount||0);const d=n.slice(0,12).map((i,m)=>{const h=s[i.status]??i.status??"—",N=i.receiverName||i.customerName||"—",C=i.receiverCity||i.city||"—",k=Number(i.shippingFee||0),G=Number(i.totalAmount||0)||k+Number(i.codAmount||0);return`<tr class="${i.status==="returned"?"ret":""}">
          <td>${m+1}</td>
          <td class="name">${N}</td>
          <td>${C}</td>
          <td><span class="badge">${h}</span></td>
          <td>${c(k)}</td>
          <td class="tot">${c(G)}</td>
        </tr>`}).join(""),x=r.status==="paid"?"مدفوعة":r.status==="verified"?"تم التحقق":r.status==="disputed"?"متنازع":"انتظار";return`
        <div class="inv-card">
          <div class="inv-header">
            <div>
              <div class="inv-title">فاتورة شحن</div>
              <div class="inv-meta">${r.invoiceNumber} · ${p?.name??"—"} · ${b}</div>
              <div class="inv-meta">عدد الشحنات: ${n.length} · الحالة: ${x}</div>
            </div>
            <img src="${l}" class="logo" onerror="this.style.display='none'"/>
          </div>
          <table>
            <thead><tr>
              <th>#</th><th class="name">المستلم</th><th>المحافظة</th><th>الحالة</th><th>رسوم الشحن</th><th>الإجمالي</th>
            </tr></thead>
            <tbody>${d}${n.length>12?`<tr><td colspan="6" style="text-align:center;color:#888;font-style:italic">... و${n.length-12} شحنة أخرى</td></tr>`:""}</tbody>
          </table>
          <div class="summary">
            <div class="s-row"><span>إجمالي رسوم الشحن</span><span>${c(g)} ج</span></div>
            <div class="s-row"><span>إجمالي COD</span><span>${c(o)} ج</span></div>
            <div class="s-row total"><span>صافي المستحق</span><span class="green">${c(a)} ج</span></div>
          </div>
        </div>`}).join(""),S=window.open("","_blank");S&&(S.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>طباعة الفواتير المحددة</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:0}
html,body{width:100%;height:100%;font-family:'Cairo',Arial,sans-serif;background:#fff;direction:rtl}

/* شاشة: معاينة قبل الطباعة */
.page{
  display:grid;
  grid-template-columns:1fr 1fr;
  grid-template-rows:1fr 1fr;
  gap:10px;
  padding:14px;
  width:297mm;
  height:210mm;
  margin:auto;
  background:#fff;
}

/* كارت الفاتورة */
.inv-card{
  border:1.5px solid #ddd;
  border-radius:6px;
  padding:8px 10px;
  display:flex;
  flex-direction:column;
  gap:4px;
  overflow:hidden;
  background:#fff;
}

/* هيدر */
.inv-header{display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #222;padding-bottom:5px;margin-bottom:4px}
.inv-title{font-size:11px;font-weight:900;color:#111;margin-bottom:2px}
.inv-meta{font-size:7.5px;color:#555;font-weight:600;line-height:1.5}
.logo{width:38px;height:38px;object-fit:contain}

/* شريط ملون */
.color-bar{height:3px;background:linear-gradient(90deg,#111,#555);border-radius:2px;margin-bottom:4px}

/* جدول */
table{width:100%;border-collapse:collapse;flex:1}
thead tr{background:#1a1a1a;color:#fff}
th{padding:3px 4px;font-size:7px;font-weight:700;text-align:center;white-space:nowrap}
th.name{text-align:right}
td{padding:2.5px 4px;text-align:center;font-size:7px;color:#333;border-bottom:1px solid #f0f0f0}
td.name{text-align:right;font-weight:700;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
td.tot{font-weight:900;color:#111}
tr:nth-child(even) td{background:#fafafa}
tr.ret td{color:#bbb;text-decoration:line-through}
.badge{font-size:6.5px;padding:1px 4px;border-radius:8px;background:#f3f4f6;color:#374151;font-weight:700;white-space:nowrap}

/* ملخص */
.summary{border-top:1.5px solid #222;padding-top:4px;margin-top:auto}
.s-row{display:flex;justify-content:space-between;font-size:7.5px;padding:1.5px 0;color:#555;font-weight:600}
.s-row.total{font-size:9px;font-weight:900;color:#111;border-top:1px solid #ccc;margin-top:2px;padding-top:2px}
.green{color:#16a34a}

/* طباعة: A4 landscape، 4 فواتير في صفحة واحدة */
@page{size:A4 landscape;margin:0}
@media print{
  html,body{width:297mm;height:210mm;overflow:hidden}
  .page{
    width:297mm;
    height:210mm;
    padding:8mm;
    gap:6mm;
    page-break-after:always;
  }
  .inv-card{border-color:#ccc}
}
</style>
</head>
<body>
<div class="page">
${L}
</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),800);}<\/script>
</body></html>`),S.document.close())},z=w.find(t=>t.id===M),me=async t=>{const l=await new Promise(a=>{const d=new Image;d.crossOrigin="anonymous",d.onload=()=>{const x=document.createElement("canvas");x.width=d.width,x.height=d.height;const i=x.getContext("2d");i.drawImage(d,0,0);const m=i.getImageData(0,0,x.width,x.height);for(let h=0;h<m.data.length;h+=4){const N=m.data[h],C=m.data[h+1],k=m.data[h+2];N<40&&C<40&&k<40&&(m.data[h+3]=0)}i.putImageData(m,0,0),a(x.toDataURL("image/png"))},d.onerror=()=>a(`${window.location.origin}/logo.jpg`),d.src=`${window.location.origin}/logo.jpg`}),s=a=>new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(Number(a||0));let c=[];if(t.manifestId)try{const a=await v(`/shipping-manifests/${t.manifestId}`);c=a?.orders??a?.shipments??[]}catch{j({title:"⚠️ تعذر جلب الشحنات",variant:"destructive"});return}if(!c.length){j({title:"⚠️ لا توجد شحنات مرتبطة بهذه الفاتورة"});return}const B={pending:"قيد الانتظار",warehouse_ready:"جاهزة للشحن",in_shipping:"قيد الشحن",received:"استلم",partial_received:"استلم جزئي",returned:"مرتجع",delivered:"استلم",waiting:"انتظار",cancelled:"ملغية",delayed:"مؤجل"},L=t.createdAt?$(new Date(t.createdAt),"yyyy/MM/dd HH:mm"):$(new Date,"yyyy/MM/dd HH:mm"),S=c.map((a,d)=>{a.shipmentNumber??a.shipment_number??`${String(a.id).padStart(4,"0")}`;const x=a.trackingNumber??a.tracking_number??"—",i=B[a.status]??a.status??"—",m=a.receiverName||a.customerName||"—",h=a.receiverCity||a.city||"—",N=Number(a.shippingFee||0),C=Number(a.codAmount||0),k=Number(a.totalAmount||0)||N+C;return`
        <tr class="${a.status==="returned"?"row-returned":""}">
          <td>${d+1}</td>
          <td class="name">${m}</td>
          <td>${h}</td>
          <td>${x}</td>
          <td><span class="status-badge">${i}</span></td>
          <td>${s(N)}</td>
          <td class="total-cell">${s(k)}</td>
        </tr>`}).join(""),r=c.reduce((a,d)=>a+Number(d.shippingFee||0),0),n=c.reduce((a,d)=>a+Number(d.codAmount||0),0),p=Number(t.netDue||0),b=Number(t.paidAmount||0),g=p-b,o=window.open("","_blank");o&&(o.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>فاتورة شحن — ${t.invoiceNumber}</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:0}
body{font-family:'Cairo',Tahoma,Arial,sans-serif;background:#fff;color:#111;font-size:15px;direction:rtl}
.page{max-width:900px;margin:24px auto;background:#fff;padding:32px 36px}

/* ── HEADER ── */
.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:2px solid #ddd;margin-bottom:18px}
.header-left .inv-title{font-size:26px;font-weight:900;color:#111;margin-bottom:6px}
.header-left .inv-meta{font-size:14px;color:#555;line-height:2;font-weight:600}
.header-right .logo{width:140px;height:140px;border-radius:12px;object-fit:contain;border:none;background:transparent;margin-top:16px}

/* ── INFO BAR ── */
.info-bar{background:#111;color:#fff;border-radius:8px;padding:12px 20px;display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;gap:16px;flex-wrap:wrap}
.info-item{text-align:center}
.info-item .i-label{font-size:11px;color:#aaa;font-weight:600;margin-bottom:3px}
.info-item .i-value{font-size:16px;font-weight:900;color:#fff}
.info-item .i-value.highlight{color:#f0c040}
.info-item .i-value.green{color:#4ade80}

/* ── TABLE ── */
table{width:100%;border-collapse:collapse;margin-bottom:18px}
thead tr{background:#333;color:#fff}
th{padding:11px 10px;font-size:14px;font-weight:800;text-align:center}
th:nth-child(2){text-align:right}
tbody tr{border-bottom:1px solid #e0e0e0}
tbody tr:last-child{border-bottom:2px solid #ccc}
td{padding:10px 10px;text-align:center;font-size:14px;font-weight:600;color:#222}
td.name{font-weight:800;text-align:right}
td.total-cell{font-weight:900;color:#111}
tr.row-returned td{color:#aaa;text-decoration:line-through}
.status-badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:12px;font-weight:700;background:#f3f4f6;color:#374151}

/* ── SUMMARY ── */
.summary-wrap{display:flex;justify-content:flex-start;margin-bottom:18px}
.summary-table{width:400px;border:1px solid #ccc;border-radius:6px;overflow:hidden}
.s-row{display:flex;justify-content:space-between;align-items:center;padding:11px 16px;font-size:15px;border-bottom:1px solid #e4e4e4}
.s-row:last-child{border:none;background:#2a2a2a;color:#fff;font-size:17px;font-weight:900;padding:13px 16px}
.s-row:last-child .s-val{color:#f0c040}
.s-lbl{font-weight:600;color:#444}
.s-row:last-child .s-lbl{color:#ddd;font-weight:700}
.s-val{font-weight:800;color:#111}
.s-val.green{color:#1a7a4a}
.s-val.red{color:#c0392b}

/* ── FOOTER ── */
.footer{margin-top:30px;padding-top:12px;border-top:1px solid #ddd;text-align:center;font-size:14px;font-weight:600;color:#666}

@media print{
  body{background:#fff}
  .page{margin:0;padding:20px 24px;max-width:none}
}
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-left">
      <div class="inv-title">فاتورة شحن</div>
      <div class="inv-meta">
        رقم الفاتورة: ${t.invoiceNumber}<br>
        شركة الشحن: ${t.shippingCompanyName||"—"}<br>
        التاريخ: ${L}<br>
        عدد الشحنات: ${c.length}
      </div>
    </div>
    <div class="header-right">
      <img class="logo" src="${l}" alt="Logo" onerror="this.style.display='none'"/>
    </div>
  </div>

  <!-- INFO BAR -->
  <div class="info-bar">
    <div class="info-item">
      <div class="i-label">شركة الشحن</div>
      <div class="i-value">${t.shippingCompanyName||"—"}</div>
    </div>
    <div class="info-item">
      <div class="i-label">عدد الشحنات</div>
      <div class="i-value highlight">${c.length}</div>
    </div>
    <div class="info-item">
      <div class="i-label">إجمالي رسوم الشحن</div>
      <div class="i-value">${s(r)}</div>
    </div>
    <div class="info-item">
      <div class="i-label">إجمالي COD</div>
      <div class="i-value">${s(n)}</div>
    </div>
    <div class="info-item">
      <div class="i-label">الحالة</div>
      <div class="i-value green">${t.status==="paid"?"مدفوعة":t.status==="verified"?"تم التحقق":t.status==="disputed"?"متنازع":"انتظار"}</div>
    </div>
  </div>

  <!-- SHIPMENTS TABLE -->
  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th style="text-align:right">المستلم</th>
        <th>المحافظة</th>
        <th>رقم التتبع</th>
        <th>الحالة</th>
        <th>رسوم الشحن</th>
        <th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>${S}</tbody>
  </table>

  <!-- SUMMARY -->
  <div class="summary-wrap">
    <div class="summary-table">
      <div class="s-row"><span class="s-lbl">إجمالي مستحق</span><span class="s-val">${s(p)}</span></div>
      <div class="s-row"><span class="s-lbl">المدفوع</span><span class="s-val green">${s(b)}</span></div>
      <div class="s-row"><span class="s-lbl">المتبقي</span><span class="s-val ${g>0?"red":"green"}">${s(g)}</span></div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">طُبع في: ${$(new Date,"yyyy/MM/dd HH:mm")}</div>

</div>
</body></html>`),o.document.close(),o.onload=()=>{o.document.fonts?.ready?o.document.fonts.ready.then(()=>{setTimeout(()=>{o.focus(),o.print()},300)}):setTimeout(()=>{o.focus(),o.print()},1200)})};return e.jsxs("div",{className:"space-y-5 animate-in fade-in duration-500",dir:"rtl",children:[M!==null&&z&&e.jsx("div",{className:"fixed inset-0 z-50 flex items-center justify-center p-4",style:{background:"rgba(0,0,0,0.65)",backdropFilter:"blur(4px)"},children:e.jsxs("div",{className:"relative w-full max-w-sm rounded-[24px] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200",style:{background:"hsl(var(--card))",border:"1.5px solid rgba(239,68,68,0.40)",boxShadow:"0 24px 60px rgba(239,68,68,0.20)"},children:[e.jsx("div",{className:"absolute inset-x-12 top-0 h-px",style:{background:"linear-gradient(90deg, transparent, #EF4444, transparent)"}}),e.jsx("div",{className:"w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center",style:{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.35)"},children:e.jsx(K,{className:"w-7 h-7",style:{color:"#EF4444"}})}),e.jsx("h3",{className:"text-lg font-black text-center mb-1",children:"حذف الفاتورة"}),e.jsx("p",{className:"text-sm text-center text-muted-foreground mb-1",children:"هل أنت متأكد من حذف الفاتورة"}),e.jsx("p",{className:"text-center font-bold mb-1",style:{color:"#EF4444"},children:z.invoiceNumber}),z.status==="paid"&&e.jsxs("div",{className:"mt-2 mb-3 rounded-xl px-3 py-2 text-xs text-center",style:{background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.30)",color:"#F59E0B"},children:["⚠️ هذه الفاتورة مدفوعة — سيتم خصم ",u(z.paidAmount)," من الخزنة تلقائياً"]}),e.jsx("p",{className:"text-xs text-center text-muted-foreground mb-5",children:"هذا الإجراء لا يمكن التراجع عنه"}),e.jsxs("div",{className:"flex gap-3",children:[e.jsx(R,{className:"flex-1 h-10 font-bold",variant:"outline",onClick:()=>I(null),disabled:A.isPending,children:"إلغاء"}),e.jsxs("button",{className:"flex-1 h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",style:{background:"rgba(239,68,68,0.20)",border:"1.5px solid rgba(239,68,68,0.50)",color:"#EF4444",opacity:A.isPending?.6:1},onClick:()=>A.mutate(M),disabled:A.isPending,children:[e.jsx(K,{className:"w-4 h-4"}),A.isPending?"جاري الحذف...":"تأكيد الحذف"]})]})]})}),e.jsxs("div",{className:"flex items-center justify-between flex-wrap gap-3",children:[e.jsxs("div",{children:[e.jsxs("button",{onClick:()=>re("/finance"),className:"flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2",children:[e.jsx(je,{className:"w-4 h-4"}),"لوحة الماليات"]}),e.jsx("h1",{className:"text-2xl font-bold",children:"فواتير شركات الشحن"}),e.jsx("p",{className:"text-muted-foreground text-sm",children:"الفواتير المالية المُنشأة تلقائياً عند إقفال بيانات الشحن"})]}),e.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[F.size>0&&e.jsxs("button",{onClick:pe,className:"flex items-center gap-2 h-9 px-4 rounded-xl font-bold text-sm transition-all",style:{background:"rgba(99,102,241,0.15)",border:"1.5px solid rgba(99,102,241,0.40)",color:"#818cf8"},children:[e.jsx(X,{className:"w-4 h-4"}),"طباعة المحدد (",F.size,")"]}),e.jsx(H,{href:"/shipping",children:e.jsxs(R,{variant:"outline",className:"gap-2 border-border",children:[e.jsx(Z,{className:"w-4 h-4"}),"إدارة بيانات الشحن"]})})]})]}),e.jsxs("div",{className:"grid grid-cols-1 sm:grid-cols-3 gap-3",children:[e.jsxs("div",{className:"relative overflow-hidden rounded-[20px] p-4 transition-all duration-300",style:{background:"linear-gradient(135deg, rgba(245,158,11,0.38) 0%, rgba(245,158,11,0.14) 52%, rgba(255,255,255,0.05) 100%)",border:"1px solid rgba(245,158,11,0.28)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.15), 0 10px 28px rgba(245,158,11,0.22)",backdropFilter:"blur(12px)"},children:[e.jsx("div",{className:"absolute inset-x-8 top-0 h-px",style:{background:"linear-gradient(90deg, transparent, #F59E0B, transparent)"}}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"w-9 h-9 rounded-xl flex items-center justify-center shrink-0",style:{background:"rgba(245,158,11,0.20)",border:"1px solid rgba(245,158,11,0.35)"},children:e.jsx(ee,{className:"w-4 h-4",style:{color:"#F59E0B"}})}),e.jsxs("div",{children:[e.jsx("p",{className:"text-xs font-bold",style:{color:"rgba(255,255,255,0.60)"},children:"في انتظار التسوية"}),e.jsx("p",{className:"text-lg font-black",style:{color:"#F59E0B",textShadow:"0 0 14px rgba(245,158,11,0.55)"},children:u(q)})]})]})]}),e.jsxs("div",{className:"relative overflow-hidden rounded-[20px] p-4 transition-all duration-300",style:{background:"linear-gradient(135deg, rgba(16,185,129,0.38) 0%, rgba(16,185,129,0.14) 52%, rgba(255,255,255,0.05) 100%)",border:"1px solid rgba(16,185,129,0.28)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.15), 0 10px 28px rgba(16,185,129,0.22)",backdropFilter:"blur(12px)"},children:[e.jsx("div",{className:"absolute inset-x-8 top-0 h-px",style:{background:"linear-gradient(90deg, transparent, #10B981, transparent)"}}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"w-9 h-9 rounded-xl flex items-center justify-center shrink-0",style:{background:"rgba(16,185,129,0.20)",border:"1px solid rgba(16,185,129,0.35)"},children:e.jsx(te,{className:"w-4 h-4",style:{color:"#10B981"}})}),e.jsxs("div",{children:[e.jsx("p",{className:"text-xs font-bold",style:{color:"rgba(255,255,255,0.60)"},children:"تم التحويل للخزنة"}),e.jsx("p",{className:"text-lg font-black",style:{color:"#10B981",textShadow:"0 0 14px rgba(16,185,129,0.55)"},children:u(ce)})]})]})]}),e.jsxs("div",{className:"relative overflow-hidden rounded-[20px] p-4 transition-all duration-300",style:{background:"linear-gradient(135deg, rgba(99,102,241,0.38) 0%, rgba(99,102,241,0.14) 52%, rgba(255,255,255,0.05) 100%)",border:"1px solid rgba(99,102,241,0.28)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.15), 0 10px 28px rgba(99,102,241,0.22)",backdropFilter:"blur(12px)"},children:[e.jsx("div",{className:"absolute inset-x-8 top-0 h-px",style:{background:"linear-gradient(90deg, transparent, #6366F1, transparent)"}}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"w-9 h-9 rounded-xl flex items-center justify-center shrink-0",style:{background:"rgba(99,102,241,0.20)",border:"1px solid rgba(99,102,241,0.35)"},children:e.jsx(Q,{className:"w-4 h-4",style:{color:"#6366F1"}})}),e.jsxs("div",{children:[e.jsx("p",{className:"text-xs font-bold",style:{color:"rgba(255,255,255,0.60)"},children:"رصيد الخزنة الرئيسية"}),e.jsx("p",{className:"text-lg font-black",style:{color:"#6366F1",textShadow:"0 0 14px rgba(99,102,241,0.55)"},children:T?u(T.balance):e.jsx("span",{className:"text-xs",style:{color:"rgba(255,255,255,0.40)"},children:"لا توجد خزنة رئيسية"})})]})]})]})]}),!T&&q>0&&e.jsxs(J,{className:"p-4 border-amber-500/30 bg-amber-500/5 flex items-start gap-3",children:[e.jsx(Ne,{className:"w-5 h-5 text-amber-500 shrink-0 mt-0.5"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm font-bold text-amber-700 dark:text-amber-400",children:"لا توجد خزنة رئيسية"}),e.jsxs("p",{className:"text-xs text-muted-foreground mt-0.5",children:["يوجد ",u(q)," في انتظار التحويل. أنشئ خزنة رئيسية من قسم الخزنة وسيتم تحويل المبالغ إليها تلقائياً."]}),e.jsx(H,{href:"/finance/cash",children:e.jsxs(R,{size:"sm",className:"mt-2 h-7 text-xs gap-1",children:[e.jsx(ke,{className:"w-3 h-3"}),"إنشاء خزنة رئيسية"]})})]})]}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsxs(fe,{value:D,onValueChange:ie,children:[e.jsx(we,{className:"w-48 h-9 text-sm border-border",children:e.jsx(ye,{})}),e.jsxs(ve,{children:[e.jsxs(E,{value:"all",children:["كل الفواتير (",w.length,")"]}),e.jsx(E,{value:"pending",children:"في انتظار التسوية"}),e.jsx(E,{value:"paid",children:"تم التحويل للخزنة"}),e.jsx(E,{value:"verified",children:"تم التحقق"}),e.jsx(E,{value:"disputed",children:"متنازع عليها"})]})]}),e.jsxs("span",{className:"text-xs text-muted-foreground",children:[O.length," فاتورة"]})]}),le?e.jsx("div",{className:"p-8 text-center text-muted-foreground",children:"جاري التحميل..."}):O.length===0?e.jsxs(J,{className:"p-10 text-center border-dashed border-border",children:[e.jsx(Q,{className:"w-10 h-10 text-muted-foreground/40 mx-auto mb-3"}),e.jsx("p",{className:"text-muted-foreground text-sm",children:D==="all"?"لا توجد فواتير بعد. ستظهر هنا تلقائياً عند إقفال بيانات الشحن.":"لا توجد فواتير بهذه الحالة."})]}):e.jsx("div",{className:"space-y-3",children:O.map(t=>{const l=Y.find(B=>B.id===t.shippingCompanyId),s=Ae[t.status]??{label:t.status,color:"#6B7280",glow:"rgba(107,114,128,0.25)",solid:"rgba(107,114,128,0.15)"},c=y(t.netDue)-y(t.paidAmount);return e.jsxs("div",{className:"group relative overflow-hidden rounded-[20px] p-4 transition-all duration-200 hover:-translate-y-0.5",style:{background:`linear-gradient(135deg, ${s.solid} 0%, rgba(255,255,255,0.03) 100%)`,border:`1px solid ${s.glow}`,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.10), 0 6px 24px ${s.glow}`,backdropFilter:"blur(10px)"},children:[e.jsx("div",{className:"absolute inset-x-10 top-0 h-px pointer-events-none",style:{background:`linear-gradient(90deg, transparent, ${s.color}, transparent)`}}),e.jsxs("div",{className:"flex items-start justify-between gap-3 flex-wrap",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("input",{type:"checkbox",checked:F.has(t.id),onChange:()=>oe(t.id),className:"w-4 h-4 rounded cursor-pointer shrink-0 mt-3",style:{accentColor:"#6366f1"}}),e.jsx("div",{className:"w-10 h-10 rounded-xl flex items-center justify-center shrink-0",style:{background:s.solid,border:`1px solid ${s.glow.replace("0.25","0.40")}`},children:e.jsx(Q,{className:"w-5 h-5",style:{color:s.color}})}),e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[e.jsx("p",{className:"font-bold text-sm",style:{color:"hsl(var(--foreground))"},children:t.invoiceNumber}),t.manifestId&&e.jsx(H,{href:"/shipping",children:e.jsxs("span",{className:"text-[9px] px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-1",style:{color:s.color,border:`1px solid ${s.glow}`,background:s.solid},children:[e.jsx(Z,{className:"w-2.5 h-2.5"}),"بيان شحن مرتبط"]})})]}),e.jsxs("p",{className:"text-xs mt-0.5",style:{color:"hsl(var(--muted-foreground))"},children:[l?.name??"—"," · ",$(new Date(t.invoiceDate),"yyyy/MM/dd")]})]})]}),e.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[e.jsx("span",{className:"text-[10px] font-bold px-2 py-0.5 rounded-full",style:{background:s.solid,color:s.color,border:`1px solid ${s.glow}`},children:s.label}),t.status==="pending"&&e.jsxs(R,{size:"sm",variant:"outline",className:"h-7 text-xs",style:{borderColor:"rgba(59,130,246,0.40)",color:"#3B82F6"},onClick:()=>W.mutate({id:t.id,status:"verified"}),disabled:W.isPending,children:[e.jsx(se,{className:"w-3 h-3 mr-1"}),"تحقق"]}),t.manifestId&&e.jsx("button",{className:"h-7 w-7 rounded-lg flex items-center justify-center transition-all",style:{background:"rgba(99,102,241,0.10)",border:"1px solid rgba(99,102,241,0.30)",color:"#6366F1"},title:"طباعة بوالص الشحن",onClick:()=>me(t),children:e.jsx(X,{className:"w-3.5 h-3.5"})}),e.jsx("button",{className:"h-7 w-7 rounded-lg flex items-center justify-center transition-all",style:{background:"rgba(239,68,68,0.10)",border:"1px solid rgba(239,68,68,0.30)",color:"#EF4444"},title:"حذف الفاتورة",onClick:()=>I(t.id),children:e.jsx(K,{className:"w-3.5 h-3.5"})})]})]}),e.jsxs("div",{className:"grid grid-cols-3 gap-3 mt-3 pt-3",style:{borderTop:`1px solid ${s.glow}`},children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] mb-0.5",style:{color:"hsl(var(--muted-foreground))"},children:"الإيراد الإجمالي"}),e.jsx("p",{className:"text-sm font-bold text-emerald-500",children:u(t.grossRevenue)})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] mb-0.5",style:{color:"hsl(var(--muted-foreground))"},children:"رسوم الشحن + المرتجعات"}),e.jsx("p",{className:"text-sm font-bold text-rose-500",children:u(Number(t.shippingFees)+Number(t.returnFees))})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] mb-0.5",style:{color:"hsl(var(--muted-foreground))"},children:"صافي المستحق"}),e.jsx("p",{className:"text-sm font-black",style:{color:s.color,textShadow:`0 0 10px ${s.glow}`},children:u(t.netDue)})]})]}),e.jsxs("div",{className:"flex flex-wrap gap-4 mt-2 text-[10px]",style:{color:"hsl(var(--muted-foreground))"},children:[e.jsxs("span",{className:"flex items-center gap-1",children:[e.jsx($e,{className:"w-3 h-3"}),"إجمالي: ",t.totalOrders]}),e.jsxs("span",{className:"flex items-center gap-1 text-emerald-500",children:[e.jsx(se,{className:"w-3 h-3"}),"مسلّم: ",t.deliveredOrders]}),e.jsxs("span",{className:"flex items-center gap-1 text-rose-400",children:[e.jsx(Fe,{className:"w-3 h-3"}),"مرتجع: ",t.returnedOrders]})]}),t.status==="paid"&&e.jsxs("div",{className:"mt-2 pt-2 flex items-center gap-2",style:{borderTop:`1px solid ${s.glow}`},children:[e.jsx(te,{className:"w-3.5 h-3.5 text-emerald-500"}),e.jsxs("p",{className:"text-[10px] text-emerald-500",children:["تم إضافة ",u(y(t.paidAmount)||y(t.netDue))," للخزنة الرئيسية",t.paidAt?` · ${$(new Date(t.paidAt),"yyyy/MM/dd")}`:""]})]}),t.status==="pending"&&!T&&e.jsxs("div",{className:"mt-2 pt-2 flex items-center gap-2",style:{borderTop:`1px solid ${s.glow}`},children:[e.jsx(ee,{className:"w-3.5 h-3.5",style:{color:"#F59E0B"}}),e.jsxs("p",{className:"text-[10px]",style:{color:"#F59E0B"},children:["في انتظار إنشاء الخزنة الرئيسية لتحويل ",u(c)]})]})]},t.id)})})]})}export{Oe as default};
//# sourceMappingURL=finance-shipping-invoices-hy8uiX4A.js.map
