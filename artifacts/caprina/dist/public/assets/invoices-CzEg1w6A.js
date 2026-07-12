import{u as H,j as i}from"./vendor-query-8HrXCEMH.js";import{h as ke}from"./api-DtAZ4V2m.js";import{x as $e,o as W,B as G,s as Ne,h as je}from"./index-HKN0r7Zx.js";import{r as f}from"./vendor-router-D4U-j562.js";import{C as K}from"./card-BZkWknIF.js";import{B as ze}from"./badge-Cx7_wvM7.js";import{S as Se,a as Pe,b as Ce,c as Fe,d as Q}from"./select-DQKC3d5Q.js";import{al as Ae,ad as ne,au as de,j as De}from"./vendor-icons-Das5eZSG.js";import{f as V}from"./format-CzfXRGH8.js";import"./vendor-ui-DmOBVzer.js";import"./vendor-charts-DPRqk5Qj.js";const le=S=>{const L=Math.round(S*100)/100,m=L%1===0;return new Intl.NumberFormat("en-US",{minimumFractionDigits:m?0:2,maximumFractionDigits:2}).format(L)+" ج.م"},Oe={waiting:"انتظار",confirmed:"مؤكدة",picked_up:"تم الاستلام",in_transit:"قيد الشحن",out_for_delivery:"خرجت للتسليم",delivered:"تم التسليم",delayed:"متأخرة",returned:"مرتجع",cancelled:"ملغية",warehouse_ready:"قيد الشحن في المخزن"},Ie={waiting:"bg-amber-100  dark:bg-amber-900/40   text-amber-800   dark:text-amber-300   border-amber-400   dark:border-amber-700",confirmed:"bg-amber-100  dark:bg-amber-900/40   text-amber-800   dark:text-amber-300   border-amber-400   dark:border-amber-700",picked_up:"bg-teal-600   dark:bg-teal-700       text-white        dark:text-white        border-teal-700    dark:border-teal-600",in_transit:"bg-sky-100    dark:bg-sky-900/40     text-sky-800     dark:text-sky-300     border-sky-400     dark:border-sky-700",out_for_delivery:"bg-sky-100    dark:bg-sky-900/40     text-sky-800     dark:text-sky-300     border-sky-400     dark:border-sky-700",delivered:"bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-400 dark:border-emerald-700",delayed:"bg-indigo-600 dark:bg-indigo-700       text-white        dark:text-white        border-indigo-700    dark:border-indigo-600",returned:"bg-red-100    dark:bg-red-900/40     text-red-800     dark:text-red-300     border-red-400     dark:border-red-700",cancelled:"bg-red-100    dark:bg-red-900/40     text-red-800     dark:text-red-300     border-red-400     dark:border-red-700",warehouse_ready:"bg-teal-600   dark:bg-teal-700       text-white        dark:text-white        border-teal-700    dark:border-teal-600"};function Ve(){const{brand:S}=$e(),m=new URLSearchParams(typeof window<"u"?window.location.search:"").get("invoiceNumber"),[Me,Re]=f.useState("orders"),[ce,pe]=f.useState(m?new Set([m]):new Set),[w,Le]=f.useState("all"),[F,me]=f.useState(4),[N,T]=f.useState(new Set),{data:_,isLoading:Y}=ke({status:w!=="all"?w:void 0}),{data:J}=H({queryKey:["shipping"],queryFn:Ne.list}),{data:v,isLoading:X}=H({queryKey:["invoice-direct-print",m],queryFn:()=>W.byInvoice(m),enabled:!!m}),{data:A,isLoading:Z}=H({queryKey:["shipments-invoices"],queryFn:()=>je("/shipments?status=warehouse_ready&limit=200"),enabled:!0}),k=f.useMemo(()=>A?.data??(Array.isArray(A)?A:[]),[A]),ee=f.useMemo(()=>_?_.filter(t=>!(w!=="all"&&t.status!==w||w==="all"&&t.status!=="warehouse_ready")):[],[_,w]),y=f.useMemo(()=>{const t=new Map;for(const r of ee){const o=r.invoiceNumber??`solo-${r.id}`;if(t.has(o)){const s=t.get(o);s.orders.some(l=>l.id===r.id)||(s.orders=[...s.orders,r])}else{const s=r._invoiceOrders,n=s&&s.length>0?s:[r];t.set(o,{rep:r,orders:n})}}return m&&v?.length&&!t.has(m)&&t.set(m,{rep:v[0],orders:v}),Array.from(t.entries()).map(([r,{rep:o,orders:s}])=>({invoiceNumber:r,representativeId:o.id,orders:s,customerName:o.customerName,totalPrice:s.reduce((n,l)=>n+l.totalPrice,0),status:o.status,createdAt:o.createdAt,phone:o.phone??null,city:o.city??null,shippingCompanyId:o.shippingCompanyId??null}))},[ee,v,m]),te=f.useMemo(()=>y,[y]),[D,ie]=f.useState(new Map),E=f.useRef(new Set);f.useEffect(()=>{if(!y.length)return;const t=y.filter(r=>r.invoiceNumber&&!r.invoiceNumber.startsWith("solo-")&&!E.current.has(r.invoiceNumber));t.length&&(t.forEach(r=>E.current.add(r.invoiceNumber)),Promise.all(t.map(async r=>{try{const o=await W.byInvoice(r.invoiceNumber);return{key:r.invoiceNumber,orders:o.length>0?o:r.orders}}catch{return{key:r.invoiceNumber,orders:r.orders}}})).then(r=>{ie(o=>{const s=new Map(o);return r.forEach(n=>s.set(n.key,n.orders)),s})}))},[y,w]),f.useEffect(()=>{ie(new Map),E.current=new Set},[w]),f.useMemo(()=>te.reduce((t,r)=>t+r.totalPrice,0),[te]);const ge=async(t=ce)=>{const r=y.filter(a=>t.has(a.invoiceNumber));if(!r.length){alert("اختر فواتير للطباعة أولاً.");return}const o=new Map;await Promise.all(r.map(async a=>{if(a.invoiceNumber.startsWith("solo-")){o.set(a.invoiceNumber,a.orders);return}try{const c=await W.byInvoice(a.invoiceNumber);if(c?.length){o.set(a.invoiceNumber,c);return}}catch{}if(D.has(a.invoiceNumber)){o.set(a.invoiceNumber,D.get(a.invoiceNumber));return}if(v?.length&&v[0].invoiceNumber===a.invoiceNumber){o.set(a.invoiceNumber,v);return}o.set(a.invoiceNumber,a.orders)}));let s="";const n=S.logoUrl||"/logo.jpg";try{const c=await(await fetch(n)).blob();s=await new Promise(d=>{const h=new FileReader;h.onload=()=>d(h.result),h.readAsDataURL(c)})}catch{}const l=S.name||"CAPRINA",O=S.tagline||"WIN OR DIE",I=[];for(let a=0;a<r.length;a+=F)I.push(r.slice(a,a+F));const g=window.open("","_blank");if(!g)return;const e=`
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap');
      @page { size: A4 landscape; margin: 0; }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: 'Cairo', 'Segoe UI', Tahoma, Arial, sans-serif; direction: rtl; background: white; color: #000; font-size: 9pt; font-weight: 600; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .page { display: grid; grid-template-rows: 1fr 1fr; gap: 2mm; width: 297mm; height: 210mm; padding: 2mm 3mm; page-break-after: always; box-sizing: border-box; }
      .page:last-child { page-break-after: avoid; }
      .page.single-row { grid-template-rows: 1fr; height: 105mm; }
      .inv-row { display: grid; grid-template-columns: 1fr 1fr; gap: 2mm; align-items: stretch; min-height: 0; height: 100%; }
      .inv-row.single { grid-template-columns: 1fr; }
      .empty-slot { border: 2px dashed #ddd; border-radius: 2mm; background: #fafafa; width: 100%; height: 100%; min-height: 0; }
      .inv { border: 2px solid #000; border-radius: 2mm; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; background: white; width: 100%; height: 100%; min-height: 0; }
      .inv-hdr { background: #1a1a1a; color: white; display: flex; align-items: center; justify-content: space-between; padding: 1.5mm 2.5mm; gap: 2mm; flex-shrink: 0; }
      .hdr-date { font-size: 7pt; font-weight: 700; white-space: nowrap; direction: ltr; text-align: right; }
      .hdr-logo { display: flex; align-items: center; gap: 1.5mm; }
      .logo-img { width: 12mm; height: 12mm; object-fit: contain; border-radius: 1.5mm; background: white; padding: 0.5mm; box-shadow: 0 0 0 1px rgba(255,255,255,0.2); }
      .logo-txt { font-size: 10pt; font-weight: 900; letter-spacing: 2px; line-height: 1; }
      .repl-badge-inv { display: inline-block; font-size: 6.5pt; font-weight: 900; color: #7c3aed; background: #f3e8ff; border: 1px solid #c4b5fd; border-radius: 3px; padding: 0.5mm 1.5mm; margin-inline-start: 1.5mm; vertical-align: middle; }
      .logo-sub { font-size: 4.5pt; font-weight: 700; opacity: 0.7; letter-spacing: 2px; }
      .cust-row { display: flex; align-items: center; justify-content: space-between; padding: 1mm 2.5mm; border-bottom: 1.5px solid #000; background: #f0f0f0; flex-shrink: 0; gap: 2mm; }
      .cust-phone { font-size: 9pt; font-weight: 800; direction: ltr; color: #000; }
      .cust-name { font-size: 11pt; font-weight: 900; color: #000; }
      .inv-body { padding: 0.8mm 2.5mm 0.3mm; flex: 1 1 auto; display: flex; flex-direction: column; justify-content: space-between; overflow: visible; }
      .inv-mid-spacer { display: none; }
      .total-bar-wrap { margin-top: auto; }
      .inv-bottom { padding: 0.4mm 2.5mm; flex-shrink: 0; display: flex; flex-direction: column; gap: 0.6mm; border-top: 1px solid #ddd; background: #fafafa; justify-content: space-evenly; }
      .inv-footer { border-top: 2px solid #1a1a1a; background: #1a1a1a; padding: 0.8mm 2.5mm; flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; gap: 2mm; }
      .table-wrap { overflow: visible; }
      .total-bar { flex-shrink: 0; }
      .prod-table { width: 100%; border-collapse: collapse; }
      .prod-table th { background: #1a1a1a; color: white; border: 1px solid #333; padding: 0.7mm 1.2mm; font-weight: 800; font-size: 7pt; text-align: center; }
      .prod-table td { border: 1px solid #bbb; padding: 0.7mm 1.2mm; text-align: center; font-size: 7pt; font-weight: 700; vertical-align: middle; line-height: 1.2; color: #000; }
      .prod-table td.name-col { text-align: right; font-weight: 800; }
      .prod-table .total-row td { background: #e0e0e0; font-weight: 900; font-size: 8.5pt; border-color: #888; color: #000; }
      .prod-table .total-row td.t-label { text-align: right; }
      .info-strip { display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1px solid #bbb; border-radius: 1mm; overflow: hidden; flex-shrink: 0; }
      .info-cell { padding: 0.6mm 1.5mm; border-left: 1px solid #bbb; display: flex; flex-direction: column; }
      .info-cell:last-child { border-left: none; }
      .info-lbl { font-size: 5.5pt; font-weight: 700; color: #555; }
      .info-val { font-size: 7pt; font-weight: 800; color: #000; min-height: 2.5mm; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .addr-box { border: 1px solid #bbb; border-radius: 1mm; padding: 0.6mm 1.5mm; flex-shrink: 0; }
      .addr-lbl { font-size: 5.5pt; font-weight: 700; color: #555; }
      .addr-val { font-size: 7pt; font-weight: 800; color: #000; word-break: break-word; line-height: 1.3; }
      .notes-box { background: #fff8e1; border: 1px solid #ffe082; border-right: 3px solid #f59e0b; border-radius: 1mm; padding: 0.5mm 2mm; font-size: 5.5pt; font-weight: 700; color: #222; display: flex; gap: 1.5mm; flex-shrink: 0; line-height: 1.3; }
      .notes-box b { color: #92400e; white-space: nowrap; font-size: 6pt; font-weight: 900; }
      .confirm-box { border: 1px solid #999; border-radius: 1mm; padding: 0.5mm 2mm; font-size: 5pt; font-weight: 700; color: #111; flex-shrink: 0; display: flex; gap: 1.5mm; align-items: flex-start; line-height: 1.3; background: #f5f5f5; }
      .confirm-box .cb-lbl { font-weight: 900; color: #000; font-size: 5.5pt; white-space: nowrap; }
      .policy-txt { font-size: 6pt; font-weight: 600; color: #ccc; text-align: left; line-height: 1.5; }
      .footer-brand { font-size: 8pt; font-weight: 900; color: #fff; letter-spacing: 2px; }
      .empty-slot { border: 1px dashed #ddd; border-radius: 2mm; background: #fafafa; }
    `,u=a=>{const c=o.get(a.invoiceNumber)??a.orders,d=c[0],h=J?.find(p=>p.id===d.shippingCompanyId),j=d.trackingNumber??d.tracking_number??"",P=d.notes??d.note??d.orderNotes??"",x=d.shippingCost??d.shipping_cost??0,M=V(new Date(a.createdAt),"yyyy/MM/dd");s?`${s}${l}`:`${l.substring(0,2)}`;const U=d.address??"",q=String(d.id).padStart(4,"0"),ae=d.city??"",R="7",b="0.7mm 1.2mm",be="1.5mm 2.5mm",ue="1mm 2.5mm",z="0.4mm 1.2mm",B="5.5",oe="12mm",xe=c.length+(x>0?1:0),he=()=>c.map(p=>{const C=p.color??"",ye=p.size??"",se=p.partialQuantity??null,we=se!=null?`${se} / ${p.quantity}`:`${p.quantity}`;return`<tr><td class="name-col" style="padding:${b}">${p.product}</td><td style="padding:${b}">${ye||"&#8212;"}</td><td style="padding:${b}">${C||"&#8212;"}</td><td style="font-weight:900;padding:${b}">${we}</td><td style="padding:${b}">${Math.round(p.unitPrice*100)/100%1===0?p.unitPrice.toLocaleString("en-US"):p.unitPrice.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td><td style="font-weight:900;padding:${b}">${Math.round(p.totalPrice*100)/100%1===0?p.totalPrice.toLocaleString("en-US"):p.totalPrice.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>`}).join("");c.reduce((p,C)=>p+C.quantity,0);const ve=c.reduce((p,C)=>p+C.totalPrice,0);return{html:()=>`<div class="inv"><div class="inv-hdr" style="padding:${be}"><div class="hdr-logo"><div style="width:${oe};height:${oe};flex-shrink:0">${s?`<img src="${s}" style="width:100%;height:100%;object-fit:contain;border-radius:1.5mm;background:white;padding:0.5mm;" alt="${l}" />`:`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.1);border-radius:1.5mm;font-size:7pt;font-weight:900;color:white;">${l.substring(0,2)}</div>`}</div><div style="text-align:left;line-height:1.2;margin-right:2mm"><div class="logo-txt" style="font-size:11pt">${l}</div><div class="logo-sub">${O}</div></div></div><div class="hdr-date" style="font-size:8pt">${M}<br/><span style="font-size:5pt;opacity:0.5">ORDER #${q}</span>${d.isReplacementRequested?'<span class="repl-badge-inv">🔄 استبدال</span>':""}</div></div><div class="cust-row" style="padding:${ue}"><div class="cust-name" style="font-size:12pt">${a.customerName}</div><div class="cust-phone" style="font-size:13pt">&#128222; ${a.phone??"&#8212;"}</div></div><div class="inv-body"><div class="table-wrap"><table class="prod-table" style="font-size:${R}pt"><thead><tr><th style="width:30%;padding:${b}">الصنف</th><th style="width:14%;padding:${b}">المقاس</th><th style="width:18%;padding:${b}">اللون</th><th style="width:10%;padding:${b}">العدد</th><th style="width:14%;padding:${b}">السعر</th><th style="width:14%;padding:${b}">الإجمالي</th></tr></thead><tbody>${he()}${x>0?`<tr><td class="name-col" colspan="4" style="color:#777;font-size:${(parseFloat(R)*.85).toFixed(1)}pt;padding:${b}">مصاريف الشحن</td><td colspan="2" style="font-weight:700;padding:${b}">${x.toLocaleString("en-US")}</td></tr>`:""}</tbody></table></div><div class="total-bar-wrap"><div style="flex-shrink:0;display:flex;justify-content:space-between;align-items:center;background:#1a1a1a;border:1px solid #000;border-radius:1mm;padding:1.2mm 2.5mm;font-size:10pt;font-weight:900;color:#fff;margin-bottom:0.5mm"><span>الإجمالي الكلي</span><span style="font-size:12pt;letter-spacing:1px">${(ve+x).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:2})}</span></div></div></div><div class="inv-mid-spacer"></div><div class="inv-bottom" style="font-size:${B}pt"><div class="info-strip"><div class="info-cell" style="padding:${z}"><span class="info-lbl">المحافظة</span><span class="info-val">${ae||"&#8212;"}</span></div><div class="info-cell" style="padding:${z}"><span class="info-lbl">شركة الشحن</span><span class="info-val">${h?h.name:"&#8212;"}</span></div><div class="info-cell" style="padding:${z}"><span class="info-lbl">رقم التتبع</span><span class="info-val" style="direction:ltr;text-align:right">${j||"&#8212;"}</span></div></div><div class="addr-box" style="padding:${z}"><div class="addr-lbl">العنوان بالتفصيل</div><div class="addr-val">${U||"&#8212;"}</div></div><div class="notes-box" style="padding:${z};font-size:${B}pt"><b>&#128203; ملاحظات:</b><span>${P||"&#8212;"}</span></div><div class="confirm-box" style="padding:${z};font-size:${B}pt"><span class="cb-lbl">&#10003; التاكيد علي الشحن:</span><span>تم التاكيد مع العميل &#8212; في حاله عدم الاستلام بيتم دفع مصاريف الشحن كامله المتفق عليها</span></div></div><div class="inv-footer"><div class="policy-txt">الاسترجاع فقط اثناء تواجد المندوب &middot; الاستبدال خلال 7 أيام &middot; ضمان 6 أشهر &middot; احتفظ بالفاتورة</div><div class="footer-brand">${l}</div></div></div>`,rowCount:xe}},$=I.map(a=>{const c=F===1?1:2,d=a.map(x=>u(x));let h="";for(let x=0;x<d.length;x+=c){const M=d.slice(x,x+c),U=M.map(R=>R.html()).join(""),q=M.length<c?'<div class="empty-slot"></div>':"";h+=`<div class="inv-row${c===1?" single":""}">${U}${q}</div>`}return`<div class="${Math.ceil(a.length/c)<=1?"page single-row":"page"}">${h}</div>`}).join("");g.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>فواتير ${l}</title><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap" rel="stylesheet"><style>${e}</style></head><body>${$}</body></html>`),g.document.close(),g.onload=()=>{setTimeout(()=>{g.focus(),g.print()},600)}},re=f.useRef(!1),fe=async()=>{const t=k.filter(e=>N.has(e.id));if(!t.length){alert("اختر شحنات للطباعة أولاً.");return}const r=await new Promise(e=>{const u=new Image;u.crossOrigin="anonymous",u.onload=()=>{const $=document.createElement("canvas");$.width=u.width,$.height=u.height,$.getContext("2d").drawImage(u,0,0),e($.toDataURL("image/png"))},u.onerror=()=>e(`${window.location.origin}/logo.jpg`),u.src=`${window.location.origin}/logo.jpg`}),o=e=>new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:0}).format(Number(e||0)),s={document:"مستندات",normal:"عادي",regular:"عادي",fragile:"قابل للكسر",heavy:"ثقيل",electronics:"إلكترونيات",clothing:"ملابس",food:"طعام",other:"أخرى"},n=e=>{const u=e.shipmentNumber??`SHP#${String(e.id).padStart(4,"0")}`,$=e.trackingNumber||e.tracking_number||u,a=e.createdAt?V(new Date(e.createdAt),"yyyy/MM/dd HH:mm"):"",c=e.paymentMethod==="cod"?"عند الاستلام":e.paymentMethod==="prepaid"?"مدفوع مسبقاً":"لاحقاً",d=Number(e.shippingFee||0),h=Number(e.codAmount||0),j=Number(e.insuranceFee||0),P=Number(e.totalAmount||0),x=P>0?P:d+h+j;return`
<div class="page">
  <div class="header">
    <div class="header-title">
      بوليصة شحن
      ${e.isReplacementRequested?'<span class="repl-badge-print">🔄 طلب استبدال</span>':""}
      <span>رقم الشحنة: ${u} &nbsp;|&nbsp; ${a}</span>
    </div>
    <img class="logo" src="${r}" alt="Logo" onerror="this.style.display='none'"/>
  </div>
  <div class="tracking-bar">
    <div class="tracking-item"><div class="t-label">رقم التتبع</div><div class="t-value highlight">${$}</div></div>
    <div class="tracking-item"><div class="t-label">طريقة الدفع</div><div class="t-value">${c}</div></div>
    <div class="tracking-item"><div class="t-value brand">STARK</div></div>
  </div>
  <div class="parties">
    <div class="party-box receiver">
      <div class="party-title">📦 المستلم</div>
      <div class="party-name">${e.receiverName||"—"}</div>
      ${[e.receiverPhone,e.receiverPhone2].filter(Boolean).length?`<div class="party-row"><span class="icon">📞</span><span class="val phone">${[e.receiverPhone,e.receiverPhone2].filter(Boolean).join("  -  ")}</span></div>`:""}
      ${e.receiverCity?`<div class="party-row"><span class="icon">📍</span><span class="val">${e.receiverCity}</span></div>`:""}
      ${e.receiverAddress?`<div class="party-row"><span class="icon">🏠</span><span class="val addr">${e.receiverAddress}</span></div>`:""}
    </div>
    <div class="party-box">
      <div class="party-title">📤 الراسل</div>
      <div class="party-name">${e.senderName||"—"}</div>
      ${[e.senderPhone,e.senderPhone2].filter(Boolean).length?`<div class="party-row"><span class="icon">📞</span><span class="val phone">${[e.senderPhone,e.senderPhone2].filter(Boolean).join("  -  ")}</span></div>`:""}
      ${e.senderCity?`<div class="party-row"><span class="icon">📍</span><span class="val">${e.senderCity}</span></div>`:""}
    </div>
  </div>
  <div class="details-row" style="grid-template-columns:1fr 1fr">
    <div class="detail-box"><div class="d-label">نوع الشحنة</div><div class="d-value">${s[e.parcelType]||e.parcelType||"—"}</div></div>
    <div class="detail-box highlight"><div class="d-label">الإجمالي</div><div class="d-value">${o(x)}</div></div>
  </div>
  ${e.canOpen!==null&&e.canOpen!==void 0||e.isDivisible!==null&&e.isDivisible!==void 0||e.rejectionPolicy?`
  <div class="details-row" style="grid-template-columns:1fr 1fr 1fr;margin-bottom:4px">
    ${e.canOpen!==null&&e.canOpen!==void 0?`<div class="detail-box" style="background:#fff;${e.canOpen===0||e.canOpen==="0"?"border-color:#ef4444":"border-color:#22c55e"}"><div class="d-label" style="${e.canOpen===0||e.canOpen==="0"?"color:#991b1b":"color:#166534"}">حالة الشحنة (الفتح)</div><div class="d-value" style="${e.canOpen===0||e.canOpen==="0"?"color:#dc2626":"color:#16a34a"}">${e.canOpen===0||e.canOpen==="0"?"غير مسموح بفتح الشحنة":"مسموح بفتح الشحنة"}</div></div>`:"<div></div>"}
    ${e.isDivisible!==null&&e.isDivisible!==void 0?`<div class="detail-box" style="background:#fff;${e.isDivisible===1||e.isDivisible==="1"?"border-color:#22c55e":"border-color:#ef4444"}"><div class="d-label" style="${e.isDivisible===1||e.isDivisible==="1"?"color:#166534":"color:#991b1b"}">تجزئة الشحنة</div><div class="d-value" style="${e.isDivisible===1||e.isDivisible==="1"?"color:#16a34a":"color:#dc2626"}">${e.isDivisible===1||e.isDivisible==="1"?"الشحنة قابلة للتجزئة":"الشحنة غير قابلة للتجزئة"}</div></div>`:"<div></div>"}
    ${e.rejectionPolicy?`<div class="detail-box" style="background:#fff;${e.rejectionPolicy==="free"?"border-color:#22c55e":"border-color:#f59e0b"}"><div class="d-label" style="${e.rejectionPolicy==="free"?"color:#166534":"color:#92400e"}">حالة الرفض</div><div class="d-value" style="${e.rejectionPolicy==="free"?"color:#16a34a":"color:#b45309"}">${e.rejectionPolicy==="free"?"الشحن مجانا":"يتم دفع مبلغ الشحن كاملا"}</div></div>`:"<div></div>"}
  </div>`:""}
  ${j>0?`
  <div class="details-row" style="grid-template-columns:1fr 1fr;margin-bottom:4px">
    <div class="detail-box"><div class="d-label">رسوم التأمين</div><div class="d-value">${o(j)}</div></div>
    <div></div>
  </div>`:""}
  ${e.notes?`<div class="notes-box"><div class="n-title">ملاحظات</div><div class="n-text">${e.notes}</div></div>`:""}
  <div class="footer">
    <span>شحنة رقم: <strong>${u}</strong>${e.assignedUserName?` &nbsp;|&nbsp; المندوب: <strong>${e.assignedUserName}</strong>`:""}</span>
    <span class="date">طُبع في: ${a}</span>
  </div>
</div>`},l=t.map(e=>n(e)),O=[];for(let e=0;e<l.length;e+=4)O.push(`<div class="sheet">${l.slice(e,e+4).join("")}</div>`);const I=O.join(""),g=window.open("","_blank");g&&(g.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8"/>
<title>بوليصة شحن</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;margin:0;padding:0}
body{font-family:'Cairo',Tahoma,Arial,sans-serif;background:#fff;color:#111;direction:rtl;font-size:15px}
.sheet{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:2mm;width:297mm;height:210mm;padding:2mm;box-sizing:border-box;page-break-after:always}
.sheet:last-child{page-break-after:auto}
.page{border:1.5px solid #111;border-radius:2mm;padding:8px 9px;background:#fff;display:flex;flex-direction:column;overflow:hidden;min-height:0}
.header{display:flex;justify-content:space-between;align-items:center;padding-bottom:4px;border-bottom:2.5px solid #111;margin-bottom:5px}
.header-title{font-size:16px;font-weight:900;letter-spacing:-0.5px}
.header-title span{font-size:8px;font-weight:700;color:#555;display:block;margin-top:2px}
.repl-badge-print{display:inline-block;font-size:9px;font-weight:800;color:#7c3aed;background:#f3e8ff;border:1px solid #c4b5fd;border-radius:4px;padding:1px 6px;margin-inline-start:6px;vertical-align:middle}
.logo{width:48px;height:48px;object-fit:contain;border-radius:5px}
.tracking-bar{background:#111;color:#fff;border-radius:5px;padding:4px 7px;display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;gap:6px;flex-wrap:wrap}
.tracking-item{text-align:center}
.tracking-item .t-label{font-size:7px;color:#ccc;font-weight:700;margin-bottom:1px}
.tracking-item .t-value{font-size:10px;font-weight:900;color:#fff}
.tracking-item .t-value.highlight{color:#f0c040;font-size:13px}
.tracking-item .t-value.green{color:#4ade80}
.tracking-item .t-value.brand{font-size:18px;font-weight:900;letter-spacing:4px;color:#fff;font-style:italic}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:4px}
.party-box{border:1.5px solid #111;border-radius:3px;padding:5px 6px}
.party-box.receiver{border-width:2px}
.party-title{font-size:7px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;padding-bottom:1px;border-bottom:1px solid #e0e0e0}
.party-name{font-size:13px;font-weight:900;color:#111;margin-bottom:2px;line-height:1.15}
.party-row{display:flex;align-items:center;gap:3px;font-size:9px;font-weight:800;color:#333;margin-bottom:1px}
.party-row .icon{font-size:9px;flex-shrink:0}
.party-row .val{font-size:10px;font-weight:900;color:#111}
.party-row .val.phone{direction:ltr;display:inline-block}
.party-row .val.addr{font-size:8.5px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.details-row{display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:4px}
.detail-box{border:1px solid #ddd;border-radius:2px;padding:4px;text-align:center;background:#fafafa}
.detail-box .d-label{font-size:7px;font-weight:800;color:#666;margin-bottom:1px}
.detail-box .d-value{font-size:12px;font-weight:900;color:#111}
.detail-box.highlight{background:#fff;border-color:#111;border-width:1.5px}
.detail-box.highlight .d-label{color:#666}
.detail-box.highlight .d-value{color:#111;font-size:12.5px}
.notes-box{border:1px dashed #ccc;border-radius:3px;padding:3px 6px;margin-bottom:3px;font-size:9px;font-weight:800;color:#333;line-height:1.3}
.notes-box .n-title{font-size:7px;font-weight:800;color:#888;margin-bottom:1px}
.notes-box .n-text{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:1;overflow:hidden;word-break:break-word}
.footer{border-top:1.5px solid #ddd;padding-top:3px;margin-top:auto;display:flex;justify-content:space-between;align-items:center;font-size:9px;font-weight:800;color:#555}
.footer .date{font-size:8px}
@media print{
  @page{size:A4 landscape;margin:0}
  html,body{width:297mm;height:210mm;overflow:hidden}
  .sheet{width:297mm;height:210mm;padding:2mm;gap:2mm}
  .page{padding:7px 8px}
  .header-title{font-size:15px}
  .logo{width:42px;height:42px}
  .tracking-bar{padding:3px 6px;margin-bottom:4px}
  .tracking-item .t-value{font-size:9.5px}
  .tracking-item .t-value.highlight{font-size:12px}
  .footer{padding-top:3px;font-size:8.5px}
  .header,.tracking-bar,.parties,.details-row,.notes-box{page-break-inside:avoid}
}
</style>
</head>
<body>${I}</body></html>`),g.document.close(),g.onload=()=>{g.document.fonts?.ready?g.document.fonts.ready.then(()=>{setTimeout(()=>{g.focus(),g.print()},300)}):setTimeout(()=>{g.focus(),g.print()},1200)})};return f.useEffect(()=>{if(!m||re.current||Y||X||!y.length||!y.some(l=>l.invoiceNumber===m))return;const t=y.find(l=>l.invoiceNumber===m),r=D.has(m),o=v&&v.length>0;if(!(r||o||t&&t.orders.length>1))return;const n=new Set([m]);pe(n),re.current=!0,ge(n)},[m,Y,X,y,D,v]),i.jsxs("div",{className:"space-y-4 animate-in fade-in duration-500",dir:"rtl",children:[i.jsxs("div",{className:"flex items-center justify-between flex-wrap gap-3",children:[i.jsxs("div",{children:[i.jsx("h1",{className:"text-2xl font-bold",children:"فواتير الشحنات"}),i.jsx("p",{className:"text-muted-foreground text-sm mt-0.5",children:"تظهر الشحنات في مرحلة «قيد الشحن في المخزن»"})]}),i.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[i.jsx("span",{className:"text-xs text-muted-foreground whitespace-nowrap",children:"فواتير/صفحة:"}),i.jsxs(Se,{value:String(F),onValueChange:t=>me(Number(t)),children:[i.jsx(Pe,{className:"w-28 h-9 text-sm bg-card border-border",children:i.jsx(Ce,{})}),i.jsxs(Fe,{children:[i.jsx(Q,{value:"1",children:"1 فاتورة"}),i.jsx(Q,{value:"2",children:"2 فواتير"}),i.jsx(Q,{value:"4",children:"4 فواتير"})]})]}),i.jsxs(G,{onClick:()=>{fe()},className:"gap-2 font-bold text-sm h-9",disabled:N.size===0,children:[i.jsx(Ae,{className:"w-4 h-4"}),"طباعة (",N.size,")"]})]})]}),i.jsxs("div",{className:"space-y-3",children:[i.jsx(K,{className:"border-border overflow-hidden",children:i.jsxs("div",{className:"p-3 flex items-center gap-2 flex-wrap",children:[i.jsxs(G,{variant:"outline",size:"sm",className:"h-8 text-xs gap-1 border-border",onClick:()=>T(new Set(k.map(t=>t.id))),children:[i.jsx(ne,{className:"w-3.5 h-3.5"}),"تحديد الكل (",k.length,")"]}),N.size>0&&i.jsxs(G,{variant:"ghost",size:"sm",className:"h-8 text-xs gap-1",onClick:()=>T(new Set),children:[i.jsx(de,{className:"w-3.5 h-3.5"}),"إلغاء التحديد"]}),N.size>0&&i.jsxs("span",{className:"text-xs text-primary font-bold",children:[N.size," محدد"]}),!Z&&i.jsxs("span",{className:"text-xs text-muted-foreground mr-auto",children:[k.length," شحنة",k.length>0&&i.jsxs("span",{className:"mr-1 text-primary font-bold",children:["· ",le(k.reduce((t,r)=>t+(parseFloat(r.codAmount)||0),0))," COD"]})]})]})}),Z?i.jsx("div",{className:"p-8 text-center text-muted-foreground text-sm",children:"جاري التحميل..."}):k.length>0?i.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3",children:k.map(t=>{const r=N.has(t.id),o=J?.find(s=>s.id===t.shippingCompanyId);return i.jsxs(K,{onClick:()=>T(s=>{const n=new Set(s);return n.has(t.id)?n.delete(t.id):n.add(t.id),n}),className:`border p-4 cursor-pointer transition-all select-none ${r?"border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20":"border-border bg-card hover:border-primary/40 hover:bg-muted/10"}`,children:[i.jsxs("div",{className:"flex items-start justify-between gap-2",children:[i.jsxs("div",{className:"flex items-center gap-2",children:[r?i.jsx(ne,{className:"w-4 h-4 text-primary shrink-0"}):i.jsx(de,{className:"w-4 h-4 text-muted-foreground shrink-0"}),i.jsxs("div",{children:[i.jsx("p",{className:"font-bold text-sm leading-tight",children:t.receiverName||"—"}),i.jsxs("p",{className:"text-[10px] text-muted-foreground font-mono mt-0.5",children:["#",t.shipmentNumber??String(t.id).padStart(4,"0")]})]})]}),i.jsx(ze,{variant:"outline",className:`text-[9px] font-bold border shrink-0 ${Ie[t.status]||""}`,children:Oe[t.status]??t.status})]}),t.isReplacementRequested?i.jsx("div",{className:"mt-2",children:i.jsx("span",{className:"inline-flex items-center gap-1 text-[10px] font-bold text-purple-400 bg-purple-900/20 border border-purple-600 rounded-full px-2 py-0.5",children:"🔄 طلب استبدال"})}):null,i.jsxs("div",{className:"mt-3 space-y-1.5 text-xs text-muted-foreground",children:[i.jsxs("div",{className:"flex flex-wrap items-center gap-x-3 gap-y-0.5",children:[t.receiverPhone&&i.jsxs("span",{className:"font-mono text-[11px] text-foreground",children:["📞 ",t.receiverPhone]}),t.receiverCity&&i.jsxs("span",{className:"font-semibold text-foreground",children:["📍 ",t.receiverCity]})]}),i.jsxs("div",{className:"flex justify-between items-center pt-1 border-t border-border/40",children:[i.jsx("span",{className:"text-foreground font-medium",children:"الإجمالي"}),i.jsx("span",{className:"font-bold text-primary",children:le(parseFloat(t.totalAmount)||(parseFloat(t.shippingFee)||0)+(parseFloat(t.codAmount)||0)+(parseFloat(t.insuranceFee)||0))})]}),t.description&&i.jsxs("p",{className:"text-foreground font-medium truncate",children:["📦 ",t.description]}),i.jsx("div",{className:"flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5",children:o&&i.jsxs("span",{className:"flex items-center gap-0.5",children:["🚚 ",o.name]})}),t.trackingNumber&&i.jsxs("p",{className:"font-mono text-[10px] opacity-70 dir-ltr text-left",children:["🔎 ",t.trackingNumber]}),i.jsx("p",{className:"text-[10px] opacity-60",children:t.createdAt?V(new Date(t.createdAt),"yyyy/MM/dd"):""})]})]},t.id)})}):i.jsxs(K,{className:"border-border p-12 text-center",children:[i.jsx(De,{className:"w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20"}),i.jsx("p",{className:"font-bold",children:"لا توجد شحنات"}),i.jsx("p",{className:"text-sm text-muted-foreground mt-1",children:"سيظهر هنا الشحنات التي حالتها «قيد الشحن في المخزن»"})]})]})]})}export{Ve as default};
//# sourceMappingURL=invoices-CzEg1w6A.js.map
