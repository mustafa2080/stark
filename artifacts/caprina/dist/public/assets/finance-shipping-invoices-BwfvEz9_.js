import{j as e,b as ge,u as K,c as J}from"./vendor-query-8HrXCEMH.js";import{u as he,i as ue,x as be,B,h as y}from"./index-HKN0r7Zx.js";import{u as fe,r as Q,L as V}from"./vendor-router-D4U-j562.js";import{C as Z}from"./card-BZkWknIF.js";import{S as we,a as ye,b as ve,c as je,d as C}from"./select-DQKC3d5Q.js";import{ac as Y,aq as Ne,al as X,bl as ee,i as te,s as se,j as _,Z as ke,ai as $e,b7 as ae,c as Fe,af as De}from"./vendor-icons-Das5eZSG.js";import{f as j}from"./format-CzfXRGH8.js";import"./vendor-ui-DmOBVzer.js";import"./vendor-charts-DPRqk5Qj.js";const Ae={pending:{label:"في انتظار التسوية",color:"#F59E0B",glow:"rgba(245,158,11,0.25)",solid:"rgba(245,158,11,0.15)"},verified:{label:"تم التحقق",color:"#3B82F6",glow:"rgba(59,130,246,0.25)",solid:"rgba(59,130,246,0.15)"},paid:{label:"تم التحويل للخزنة",color:"#10B981",glow:"rgba(16,185,129,0.25)",solid:"rgba(16,185,129,0.15)"},disputed:{label:"متنازع عليها",color:"#EF4444",glow:"rgba(239,68,68,0.25)",solid:"rgba(239,68,68,0.15)"}},g=R=>new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:0}).format(Number(R));function Me(){const{isAdmin:R,can:re}=he();if(!R&&!re("finance.view"))return e.jsxs("div",{className:"flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4",children:[e.jsx("div",{className:"w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center",children:e.jsx("span",{className:"text-3xl",children:"🔒"})}),e.jsx("h2",{className:"text-xl font-bold",children:"غير مصرح بالوصول"}),e.jsx("p",{className:"text-muted-foreground text-sm max-w-xs",children:"ليس لديك صلاحية لعرض صفحة الماليات. تواصل مع المدير."})]});const b=ge(),{toast:v}=ue(),[,ie]=fe(),{brand:Ce}=be(),[S,ne]=Q.useState("all"),[P,E]=Q.useState(null),[N,oe]=Q.useState(new Set),le=t=>{oe(l=>{const a=new Set(l);return a.has(t)?a.delete(t):a.add(t),a})},{data:f=[],isLoading:de}=K({queryKey:["finance-shipping-invoices"],queryFn:()=>y("/finance/shipping-invoices")}),{data:W=[]}=K({queryKey:["shipping"],queryFn:()=>y("/shipping-companies")}),{data:ce}=K({queryKey:["/api/cash-registers"],queryFn:()=>y("/cash-registers")}),z=ce?.registers?.find(t=>t.type==="main"),G=J({mutationFn:({id:t,status:l})=>y(`/finance/shipping-invoices/${t}`,{method:"PATCH",body:JSON.stringify({status:l})}),onSuccess:()=>{b.invalidateQueries({queryKey:["finance-shipping-invoices"]}),b.invalidateQueries({queryKey:["/api/cash-registers"]}),b.invalidateQueries({queryKey:["/api/cash-registers/alerts"]}),b.invalidateQueries({queryKey:["finance-hub"]}),v({title:"✅ تم تحديث حالة الفاتورة"})},onError:t=>v({title:"❌ خطأ",description:t.message,variant:"destructive"})}),k=J({mutationFn:t=>y(`/finance/shipping-invoices/${t}`,{method:"DELETE"}),onSuccess:()=>{b.invalidateQueries({queryKey:["finance-shipping-invoices"]}),b.invalidateQueries({queryKey:["/api/cash-registers"]}),b.invalidateQueries({queryKey:["finance-hub"]}),E(null),v({title:"✅ تم حذف الفاتورة بنجاح"})},onError:t=>{E(null),v({title:"❌ فشل الحذف",description:t.message,variant:"destructive"})}}),M=S==="all"?f:f.filter(t=>t.status===S),w=t=>{const l=parseFloat(String(t??0));return isNaN(l)?0:l},q=f.filter(t=>t.status==="pending").reduce((t,l)=>t+w(l.netDue)-w(l.paidAmount),0),pe=f.filter(t=>t.status==="paid").reduce((t,l)=>t+w(l.netDue),0),xe=async()=>{if(N.size===0)return;const t=f.filter(i=>N.has(i.id)),l=await new Promise(i=>{const o=new Image;o.crossOrigin="anonymous",o.onload=()=>{const c=document.createElement("canvas");c.width=o.width,c.height=o.height;const d=c.getContext("2d");d.drawImage(o,0,0);const s=d.getImageData(0,0,c.width,c.height);for(let n=0;n<s.data.length;n+=4){const p=s.data[n],h=s.data[n+1],x=s.data[n+2];p<40&&h<40&&x<40&&(s.data[n+3]=0)}d.putImageData(s,0,0),i(c.toDataURL("image/png"))},o.onerror=()=>i(`${window.location.origin}/logo.jpg`),o.src=`${window.location.origin}/logo.jpg`}),a=i=>new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(Number(i||0)),$=(await Promise.all(t.map(async i=>{let o=[];if(i.manifestId)try{const c=await y(`/shipping-manifests/${i.manifestId}`);o=c?.orders??c?.shipments??[]}catch{}return{inv:i,shipments:o}}))).map(({inv:i,shipments:o})=>{const c=W.find(r=>r.id===i.shippingCompanyId),d=i.createdAt?j(new Date(i.createdAt),"yyyy/MM/dd"):"",s=o.reduce((r,u)=>r+Number(u.shippingFee||0),0),n=o.reduce((r,u)=>r+Number(u.codAmount||0),0),p=Number(i.netDue||0);Number(i.paidAmount||0);const h=o.slice(0,12).map((r,u)=>{const D=r.receiverName||r.customerName||"—",A=r.receiverCity||r.city||"—",O=Number(r.shippingFee||0),L=Number(r.totalAmount||0)||O+Number(r.codAmount||0),T=r.status==="returned",H=r.canOpen!==null&&r.canOpen!==void 0?r.canOpen===0||r.canOpen==="0"?"غير مسموح":"مسموح":"—",U=r.isDivisible!==null&&r.isDivisible!==void 0?r.isDivisible===1||r.isDivisible==="1"?"قابلة":"غير قابلة":"—";return`<tr class="${T?"ret":""}">
          <td>${u+1}</td>
          <td class="name">${D}${r.isReplacementRequested?' <span class="repl-badge">🔄 استبدال</span>':""}</td>
          <td>${A}</td>
          <td><span class="badge">${H}</span></td>
          <td><span class="badge">${U}</span></td>
          <td class="tot">${a(L)}</td>
        </tr>`}).join(""),x=i.status==="paid"?"مدفوعة":i.status==="verified"?"تم التحقق":i.status==="disputed"?"متنازع":"انتظار";return`
        <div class="inv-card">
          <div class="inv-header">
            <div>
              <div class="inv-title">فاتورة شحن</div>
              <div class="inv-meta">${i.invoiceNumber} · ${c?.name??"—"} · ${d}</div>
              <div class="inv-meta">عدد الشحنات: ${o.length} · الحالة: ${x}</div>
            </div>
            <img src="${l}" class="logo" onerror="this.style.display='none'"/>
          </div>
          <table>
            <thead><tr>
              <th>#</th><th class="name">المستلم</th><th>المحافظة</th><th>حالة الفتح</th><th>التجزئة</th><th>الإجمالي</th>
            </tr></thead>
            <tbody>${h}${o.length>12?`<tr><td colspan="6" style="text-align:center;color:#888;font-style:italic">... و${o.length-12} شحنة أخرى</td></tr>`:""}</tbody>
          </table>
          <div class="summary">
            <div class="s-row"><span>إجمالي رسوم الشحن</span><span>${a(s)} ج</span></div>
            <div class="s-row"><span>إجمالي COD</span><span>${a(n)} ج</span></div>
            <div class="s-row total"><span>صافي المستحق</span><span class="green">${a(p)} ج</span></div>
          </div>
        </div>`}).join(""),F=window.open("","_blank");F&&(F.document.write(`<!DOCTYPE html>
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
.repl-badge{font-size:6.5px;padding:1px 5px;border-radius:8px;background:#7c3aed;color:#fff;font-weight:800;white-space:nowrap;display:inline-block}

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
${$}
</div>
<script>window.onload=()=>{setTimeout(()=>window.print(),800);}<\/script>
</body></html>`),F.document.close())},I=f.find(t=>t.id===P),me=async t=>{const l=await new Promise(s=>{const n=new Image;n.crossOrigin="anonymous",n.onload=()=>{const p=document.createElement("canvas");p.width=n.width,p.height=n.height;const h=p.getContext("2d");h.drawImage(n,0,0);const x=h.getImageData(0,0,p.width,p.height);for(let r=0;r<x.data.length;r+=4){const u=x.data[r],D=x.data[r+1],A=x.data[r+2];u<40&&D<40&&A<40&&(x.data[r+3]=0)}h.putImageData(x,0,0),s(p.toDataURL("image/png"))},n.onerror=()=>s(`${window.location.origin}/logo.jpg`),n.src=`${window.location.origin}/logo.jpg`}),a=s=>new Intl.NumberFormat("en-US",{maximumFractionDigits:0}).format(Number(s||0));let m=[];if(t.manifestId)try{const s=await y(`/shipping-manifests/${t.manifestId}`);m=s?.orders??s?.shipments??[]}catch{v({title:"⚠️ تعذر جلب الشحنات",variant:"destructive"});return}if(!m.length){v({title:"⚠️ لا توجد شحنات مرتبطة بهذه الفاتورة"});return}const $=t.createdAt?j(new Date(t.createdAt),"yyyy/MM/dd HH:mm"):j(new Date,"yyyy/MM/dd HH:mm"),F=m.map((s,n)=>{const p=s.receiverName||s.customerName||"—",h=s.receiverCity||s.city||"—",x=Number(s.shippingFee||0),r=Number(s.codAmount||0),u=Number(s.totalAmount||0)||x+r,D=s.status==="returned",A=s.canOpen!==null&&s.canOpen!==void 0,O=s.canOpen===1||s.canOpen==="1",L=s.isDivisible!==null&&s.isDivisible!==void 0,T=s.isDivisible===1||s.isDivisible==="1",H=A?`<span class="flag-badge ${O?"flag-green":"flag-red"}">${O?"مسموح بالفتح":"غير مسموح"}</span>`:'<span class="flag-badge flag-neutral">—</span>',U=L?`<span class="flag-badge ${T?"flag-green":"flag-red"}">${T?"قابلة للتجزئة":"غير قابلة"}</span>`:'<span class="flag-badge flag-neutral">—</span>';return`
        <tr class="${D?"row-returned":""}">
          <td>${n+1}</td>
          <td class="name">${p}</td>
          <td>${h}</td>
          <td>${H}</td>
          <td>${U}</td>
          <td class="total-cell">${a(u)}</td>
        </tr>`}).join("");m.reduce((s,n)=>s+Number(n.shippingFee||0),0),m.reduce((s,n)=>s+Number(n.codAmount||0),0);const i=Number(t.netDue||0),o=Number(t.paidAmount||0),c=i-o,d=window.open("","_blank");d&&(d.document.write(`<!DOCTYPE html>
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
.info-bar{background:#fafafa;border:1px solid #ddd;color:#111;border-radius:8px;padding:12px 20px;display:flex;justify-content:center;align-items:center;margin-bottom:18px;gap:16px;flex-wrap:wrap}
.info-item{text-align:center}
.info-item .i-label{font-size:11px;color:#666;font-weight:600;margin-bottom:3px}
.info-item .i-value{font-size:16px;font-weight:900;color:#111}
.info-item .i-value.highlight{color:#111}
.info-item .i-value.green{color:#111}

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
.flag-badge{display:inline-block;padding:4px 11px;border-radius:20px;font-size:11.5px;font-weight:800;border:1.3px solid}
.flag-green{background:#f0fdf4;border-color:#22c55e;color:#15803d}
.flag-red{background:#fef2f2;border-color:#ef4444;color:#b91c1c}
.flag-neutral{background:#f3f4f6;border-color:#d1d5db;color:#6b7280}

/* ── SUMMARY ── */
.summary-wrap{display:flex;justify-content:flex-start;margin-bottom:18px}
.summary-table{width:400px;border:1px solid #ccc;border-radius:6px;overflow:hidden}
.s-row{display:flex;justify-content:space-between;align-items:center;padding:11px 16px;font-size:15px;border-bottom:1px solid #e4e4e4}
.s-row:last-child{border:none;background:#fff;border-top:2px solid #111;color:#111;font-size:17px;font-weight:900;padding:13px 16px}
.s-row:last-child .s-val{color:#111}
.s-lbl{font-weight:600;color:#444}
.s-row:last-child .s-lbl{color:#111;font-weight:700}
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
        التاريخ: ${$}<br>
        عدد الشحنات: ${m.length}
      </div>
    </div>
    <div class="header-right">
      <img class="logo" src="${l}" alt="Logo" onerror="this.style.display='none'"/>
    </div>
  </div>

  <!-- INFO BAR -->
  <div class="info-bar">
    <div class="info-item">
      <div class="i-label">عدد الشحنات</div>
      <div class="i-value highlight">${m.length}</div>
    </div>
  </div>

  <!-- SHIPMENTS TABLE -->
  <table>
    <thead>
      <tr>
        <th style="width:36px">#</th>
        <th style="text-align:right">المستلم</th>
        <th>المحافظة</th>
        <th>حالة الشحنة</th>
        <th>تجزئة الشحنة</th>
        <th>الإجمالي</th>
      </tr>
    </thead>
    <tbody>${F}</tbody>
  </table>

  <!-- SUMMARY -->
  <div class="summary-wrap">
    <div class="summary-table">
      <div class="s-row"><span class="s-lbl">إجمالي مستحق</span><span class="s-val">${a(i)}</span></div>
      <div class="s-row"><span class="s-lbl">المدفوع</span><span class="s-val green">${a(o)}</span></div>
      <div class="s-row"><span class="s-lbl">المتبقي</span><span class="s-val ${c>0?"red":"green"}">${a(c)}</span></div>
    </div>
  </div>

  <!-- FOOTER -->
  <div class="footer">طُبع في: ${j(new Date,"yyyy/MM/dd HH:mm")}</div>

</div>
</body></html>`),d.document.close(),d.onload=()=>{d.document.fonts?.ready?d.document.fonts.ready.then(()=>{setTimeout(()=>{d.focus(),d.print()},300)}):setTimeout(()=>{d.focus(),d.print()},1200)})};return e.jsxs("div",{className:"space-y-5 animate-in fade-in duration-500",dir:"rtl",children:[P!==null&&I&&e.jsx("div",{className:"fixed inset-0 z-50 flex items-center justify-center p-4",style:{background:"rgba(0,0,0,0.65)",backdropFilter:"blur(4px)"},children:e.jsxs("div",{className:"relative w-full max-w-sm rounded-[24px] p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-200",style:{background:"hsl(var(--card))",border:"1.5px solid rgba(239,68,68,0.40)",boxShadow:"0 24px 60px rgba(239,68,68,0.20)"},children:[e.jsx("div",{className:"absolute inset-x-12 top-0 h-px",style:{background:"linear-gradient(90deg, transparent, #EF4444, transparent)"}}),e.jsx("div",{className:"w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center",style:{background:"rgba(239,68,68,0.15)",border:"1px solid rgba(239,68,68,0.35)"},children:e.jsx(Y,{className:"w-7 h-7",style:{color:"#EF4444"}})}),e.jsx("h3",{className:"text-lg font-black text-center mb-1",children:"حذف الفاتورة"}),e.jsx("p",{className:"text-sm text-center text-muted-foreground mb-1",children:"هل أنت متأكد من حذف الفاتورة"}),e.jsx("p",{className:"text-center font-bold mb-1",style:{color:"#EF4444"},children:I.invoiceNumber}),I.status==="paid"&&e.jsxs("div",{className:"mt-2 mb-3 rounded-xl px-3 py-2 text-xs text-center",style:{background:"rgba(245,158,11,0.12)",border:"1px solid rgba(245,158,11,0.30)",color:"#F59E0B"},children:["⚠️ هذه الفاتورة مدفوعة — سيتم خصم ",g(I.paidAmount)," من الخزنة تلقائياً"]}),e.jsx("p",{className:"text-xs text-center text-muted-foreground mb-5",children:"هذا الإجراء لا يمكن التراجع عنه"}),e.jsxs("div",{className:"flex gap-3",children:[e.jsx(B,{className:"flex-1 h-10 font-bold",variant:"outline",onClick:()=>E(null),disabled:k.isPending,children:"إلغاء"}),e.jsxs("button",{className:"flex-1 h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all",style:{background:"rgba(239,68,68,0.20)",border:"1.5px solid rgba(239,68,68,0.50)",color:"#EF4444",opacity:k.isPending?.6:1},onClick:()=>k.mutate(P),disabled:k.isPending,children:[e.jsx(Y,{className:"w-4 h-4"}),k.isPending?"جاري الحذف...":"تأكيد الحذف"]})]})]})}),e.jsxs("div",{className:"flex items-center justify-between flex-wrap gap-3",children:[e.jsxs("div",{children:[e.jsxs("button",{onClick:()=>ie("/finance"),className:"flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2",children:[e.jsx(Ne,{className:"w-4 h-4"}),"لوحة الماليات"]}),e.jsx("h1",{className:"text-2xl font-bold",children:"فواتير شركات الشحن"}),e.jsx("p",{className:"text-muted-foreground text-sm",children:"الفواتير المالية المُنشأة تلقائياً عند إقفال بيانات الشحن"})]}),e.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[N.size>0&&e.jsxs("button",{onClick:xe,className:"flex items-center gap-2 h-9 px-4 rounded-xl font-bold text-sm transition-all",style:{background:"rgba(99,102,241,0.15)",border:"1.5px solid rgba(99,102,241,0.40)",color:"#818cf8"},children:[e.jsx(X,{className:"w-4 h-4"}),"طباعة المحدد (",N.size,")"]}),e.jsx(V,{href:"/shipping",children:e.jsxs(B,{variant:"outline",className:"gap-2 border-border",children:[e.jsx(ee,{className:"w-4 h-4"}),"إدارة بيانات الشحن"]})})]})]}),e.jsxs("div",{className:"grid grid-cols-1 sm:grid-cols-3 gap-3",children:[e.jsxs("div",{className:"relative overflow-hidden rounded-[20px] p-4 transition-all duration-300",style:{background:"linear-gradient(135deg, rgba(245,158,11,0.38) 0%, rgba(245,158,11,0.14) 52%, rgba(255,255,255,0.05) 100%)",border:"1px solid rgba(245,158,11,0.28)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.15), 0 10px 28px rgba(245,158,11,0.22)",backdropFilter:"blur(12px)"},children:[e.jsx("div",{className:"absolute inset-x-8 top-0 h-px",style:{background:"linear-gradient(90deg, transparent, #F59E0B, transparent)"}}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"w-9 h-9 rounded-xl flex items-center justify-center shrink-0",style:{background:"rgba(245,158,11,0.20)",border:"1px solid rgba(245,158,11,0.35)"},children:e.jsx(te,{className:"w-4 h-4",style:{color:"#F59E0B"}})}),e.jsxs("div",{children:[e.jsx("p",{className:"text-xs font-bold",style:{color:"rgba(255,255,255,0.60)"},children:"في انتظار التسوية"}),e.jsx("p",{className:"text-lg font-black",style:{color:"#F59E0B",textShadow:"0 0 14px rgba(245,158,11,0.55)"},children:g(q)})]})]})]}),e.jsxs("div",{className:"relative overflow-hidden rounded-[20px] p-4 transition-all duration-300",style:{background:"linear-gradient(135deg, rgba(16,185,129,0.38) 0%, rgba(16,185,129,0.14) 52%, rgba(255,255,255,0.05) 100%)",border:"1px solid rgba(16,185,129,0.28)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.15), 0 10px 28px rgba(16,185,129,0.22)",backdropFilter:"blur(12px)"},children:[e.jsx("div",{className:"absolute inset-x-8 top-0 h-px",style:{background:"linear-gradient(90deg, transparent, #10B981, transparent)"}}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"w-9 h-9 rounded-xl flex items-center justify-center shrink-0",style:{background:"rgba(16,185,129,0.20)",border:"1px solid rgba(16,185,129,0.35)"},children:e.jsx(se,{className:"w-4 h-4",style:{color:"#10B981"}})}),e.jsxs("div",{children:[e.jsx("p",{className:"text-xs font-bold",style:{color:"rgba(255,255,255,0.60)"},children:"تم التحويل للخزنة"}),e.jsx("p",{className:"text-lg font-black",style:{color:"#10B981",textShadow:"0 0 14px rgba(16,185,129,0.55)"},children:g(pe)})]})]})]}),e.jsxs("div",{className:"relative overflow-hidden rounded-[20px] p-4 transition-all duration-300",style:{background:"linear-gradient(135deg, rgba(99,102,241,0.38) 0%, rgba(99,102,241,0.14) 52%, rgba(255,255,255,0.05) 100%)",border:"1px solid rgba(99,102,241,0.28)",boxShadow:"inset 0 1px 0 rgba(255,255,255,0.15), 0 10px 28px rgba(99,102,241,0.22)",backdropFilter:"blur(12px)"},children:[e.jsx("div",{className:"absolute inset-x-8 top-0 h-px",style:{background:"linear-gradient(90deg, transparent, #6366F1, transparent)"}}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("div",{className:"w-9 h-9 rounded-xl flex items-center justify-center shrink-0",style:{background:"rgba(99,102,241,0.20)",border:"1px solid rgba(99,102,241,0.35)"},children:e.jsx(_,{className:"w-4 h-4",style:{color:"#6366F1"}})}),e.jsxs("div",{children:[e.jsx("p",{className:"text-xs font-bold",style:{color:"rgba(255,255,255,0.60)"},children:"رصيد الخزنة الرئيسية"}),e.jsx("p",{className:"text-lg font-black",style:{color:"#6366F1",textShadow:"0 0 14px rgba(99,102,241,0.55)"},children:z?g(z.balance):e.jsx("span",{className:"text-xs",style:{color:"rgba(255,255,255,0.40)"},children:"لا توجد خزنة رئيسية"})})]})]})]})]}),!z&&q>0&&e.jsxs(Z,{className:"p-4 border-amber-500/30 bg-amber-500/5 flex items-start gap-3",children:[e.jsx(ke,{className:"w-5 h-5 text-amber-500 shrink-0 mt-0.5"}),e.jsxs("div",{children:[e.jsx("p",{className:"text-sm font-bold text-amber-700 dark:text-amber-400",children:"لا توجد خزنة رئيسية"}),e.jsxs("p",{className:"text-xs text-muted-foreground mt-0.5",children:["يوجد ",g(q)," في انتظار التحويل. أنشئ خزنة رئيسية من قسم الخزنة وسيتم تحويل المبالغ إليها تلقائياً."]}),e.jsx(V,{href:"/finance/cash",children:e.jsxs(B,{size:"sm",className:"mt-2 h-7 text-xs gap-1",children:[e.jsx($e,{className:"w-3 h-3"}),"إنشاء خزنة رئيسية"]})})]})]}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsxs(we,{value:S,onValueChange:ne,children:[e.jsx(ye,{className:"w-48 h-9 text-sm border-border",children:e.jsx(ve,{})}),e.jsxs(je,{children:[e.jsxs(C,{value:"all",children:["كل الفواتير (",f.length,")"]}),e.jsx(C,{value:"pending",children:"في انتظار التسوية"}),e.jsx(C,{value:"paid",children:"تم التحويل للخزنة"}),e.jsx(C,{value:"verified",children:"تم التحقق"}),e.jsx(C,{value:"disputed",children:"متنازع عليها"})]})]}),e.jsxs("span",{className:"text-xs text-muted-foreground",children:[M.length," فاتورة"]})]}),de?e.jsx("div",{className:"p-8 text-center text-muted-foreground",children:"جاري التحميل..."}):M.length===0?e.jsxs(Z,{className:"p-10 text-center border-dashed border-border",children:[e.jsx(_,{className:"w-10 h-10 text-muted-foreground/40 mx-auto mb-3"}),e.jsx("p",{className:"text-muted-foreground text-sm",children:S==="all"?"لا توجد فواتير بعد. ستظهر هنا تلقائياً عند إقفال بيانات الشحن.":"لا توجد فواتير بهذه الحالة."})]}):e.jsx("div",{className:"space-y-3",children:M.map(t=>{const l=W.find($=>$.id===t.shippingCompanyId),a=Ae[t.status]??{label:t.status,color:"#6B7280",glow:"rgba(107,114,128,0.25)",solid:"rgba(107,114,128,0.15)"},m=w(t.netDue)-w(t.paidAmount);return e.jsxs("div",{className:"group relative overflow-hidden rounded-[20px] p-4 transition-all duration-200 hover:-translate-y-0.5",style:{background:`linear-gradient(135deg, ${a.solid} 0%, rgba(255,255,255,0.03) 100%)`,border:`1px solid ${a.glow}`,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.10), 0 6px 24px ${a.glow}`,backdropFilter:"blur(10px)"},children:[e.jsx("div",{className:"absolute inset-x-10 top-0 h-px pointer-events-none",style:{background:`linear-gradient(90deg, transparent, ${a.color}, transparent)`}}),e.jsxs("div",{className:"flex items-start justify-between gap-3 flex-wrap",children:[e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("input",{type:"checkbox",checked:N.has(t.id),onChange:()=>le(t.id),className:"w-4 h-4 rounded cursor-pointer shrink-0 mt-3",style:{accentColor:"#6366f1"}}),e.jsx("div",{className:"w-10 h-10 rounded-xl flex items-center justify-center shrink-0",style:{background:a.solid,border:`1px solid ${a.glow.replace("0.25","0.40")}`},children:e.jsx(_,{className:"w-5 h-5",style:{color:a.color}})}),e.jsxs("div",{children:[e.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[e.jsx("p",{className:"font-bold text-sm",style:{color:"hsl(var(--foreground))"},children:t.invoiceNumber}),t.manifestId&&e.jsx(V,{href:"/shipping",children:e.jsxs("span",{className:"text-[9px] px-1.5 py-0.5 rounded cursor-pointer flex items-center gap-1",style:{color:a.color,border:`1px solid ${a.glow}`,background:a.solid},children:[e.jsx(ee,{className:"w-2.5 h-2.5"}),"بيان شحن مرتبط"]})})]}),e.jsxs("p",{className:"text-xs mt-0.5",style:{color:"hsl(var(--muted-foreground))"},children:[l?.name??"—"," · ",j(new Date(t.invoiceDate),"yyyy/MM/dd")]})]})]}),e.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[e.jsx("span",{className:"text-[10px] font-bold px-2 py-0.5 rounded-full",style:{background:a.solid,color:a.color,border:`1px solid ${a.glow}`},children:a.label}),t.status==="pending"&&e.jsxs(B,{size:"sm",variant:"outline",className:"h-7 text-xs",style:{borderColor:"rgba(59,130,246,0.40)",color:"#3B82F6"},onClick:()=>G.mutate({id:t.id,status:"verified"}),disabled:G.isPending,children:[e.jsx(ae,{className:"w-3 h-3 mr-1"}),"تحقق"]}),t.manifestId&&e.jsx("button",{className:"h-7 w-7 rounded-lg flex items-center justify-center transition-all",style:{background:"rgba(99,102,241,0.10)",border:"1px solid rgba(99,102,241,0.30)",color:"#6366F1"},title:"طباعة بوالص الشحن",onClick:()=>me(t),children:e.jsx(X,{className:"w-3.5 h-3.5"})}),e.jsx("button",{className:"h-7 w-7 rounded-lg flex items-center justify-center transition-all",style:{background:"rgba(239,68,68,0.10)",border:"1px solid rgba(239,68,68,0.30)",color:"#EF4444"},title:"حذف الفاتورة",onClick:()=>E(t.id),children:e.jsx(Y,{className:"w-3.5 h-3.5"})})]})]}),e.jsxs("div",{className:"grid grid-cols-3 gap-3 mt-3 pt-3",style:{borderTop:`1px solid ${a.glow}`},children:[e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] mb-0.5",style:{color:"hsl(var(--muted-foreground))"},children:"الإيراد الإجمالي"}),e.jsx("p",{className:"text-sm font-bold text-emerald-500",children:g(t.grossRevenue)})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] mb-0.5",style:{color:"hsl(var(--muted-foreground))"},children:"رسوم الشحن + المرتجعات"}),e.jsx("p",{className:"text-sm font-bold text-rose-500",children:g(Number(t.shippingFees)+Number(t.returnFees))})]}),e.jsxs("div",{children:[e.jsx("p",{className:"text-[10px] mb-0.5",style:{color:"hsl(var(--muted-foreground))"},children:"صافي المستحق"}),e.jsx("p",{className:"text-sm font-black",style:{color:a.color,textShadow:`0 0 10px ${a.glow}`},children:g(t.netDue)})]})]}),e.jsxs("div",{className:"flex flex-wrap gap-4 mt-2 text-[10px]",style:{color:"hsl(var(--muted-foreground))"},children:[e.jsxs("span",{className:"flex items-center gap-1",children:[e.jsx(Fe,{className:"w-3 h-3"}),"إجمالي: ",t.totalOrders]}),e.jsxs("span",{className:"flex items-center gap-1 text-emerald-500",children:[e.jsx(ae,{className:"w-3 h-3"}),"مسلّم: ",t.deliveredOrders]}),e.jsxs("span",{className:"flex items-center gap-1 text-rose-400",children:[e.jsx(De,{className:"w-3 h-3"}),"مرتجع: ",t.returnedOrders]})]}),t.status==="paid"&&e.jsxs("div",{className:"mt-2 pt-2 flex items-center gap-2",style:{borderTop:`1px solid ${a.glow}`},children:[e.jsx(se,{className:"w-3.5 h-3.5 text-emerald-500"}),e.jsxs("p",{className:"text-[10px] text-emerald-500",children:["تم إضافة ",g(w(t.paidAmount)||w(t.netDue))," للخزنة الرئيسية",t.paidAt?` · ${j(new Date(t.paidAt),"yyyy/MM/dd")}`:""]})]}),t.status==="pending"&&!z&&e.jsxs("div",{className:"mt-2 pt-2 flex items-center gap-2",style:{borderTop:`1px solid ${a.glow}`},children:[e.jsx(te,{className:"w-3.5 h-3.5",style:{color:"#F59E0B"}}),e.jsxs("p",{className:"text-[10px]",style:{color:"#F59E0B"},children:["في انتظار إنشاء الخزنة الرئيسية لتحويل ",g(m)]})]})]},t.id)})})]})}export{Me as default};
//# sourceMappingURL=finance-shipping-invoices-BwfvEz9_.js.map
