import{u as H,j as i}from"./vendor-query-8HrXCEMH.js";import{h as ke}from"./api-CE5KFM2N.js";import{q as $e,o as W,B as G,s as Ne,a as je}from"./index-Dze9rcpB.js";import{r as g}from"./vendor-router-D4U-j562.js";import{C as K}from"./card-B0o4-Pn2.js";import{B as ze}from"./badge-BIValIOS.js";import{S as Se,a as Ce,b as Pe,c as Fe,d as Q}from"./select-DSNfSk_6.js";import{af as Ae,a6 as de,ao as le,T as Ie}from"./vendor-icons-CsE31v8z.js";import{f as V}from"./format-CzfXRGH8.js";import"./vendor-ui-B6Uk5PbZ.js";import"./vendor-charts-BgmbPIKF.js";const Y=z=>{const L=Math.round(z*100)/100,p=L%1===0;return new Intl.NumberFormat("en-US",{minimumFractionDigits:p?0:2,maximumFractionDigits:2}).format(L)+" ج.م"},Me={waiting:"انتظار",confirmed:"مؤكدة",picked_up:"تم الاستلام",in_transit:"قيد الشحن",out_for_delivery:"خرجت للتسليم",delivered:"تم التسليم",delayed:"متأخرة",returned:"مرتجع",cancelled:"ملغية",warehouse_ready:"قيد الشحن في المخزن"},De={waiting:"bg-amber-100  dark:bg-amber-900/40   text-amber-800   dark:text-amber-300   border-amber-400   dark:border-amber-700",confirmed:"bg-amber-100  dark:bg-amber-900/40   text-amber-800   dark:text-amber-300   border-amber-400   dark:border-amber-700",picked_up:"bg-teal-600   dark:bg-teal-700       text-white        dark:text-white        border-teal-700    dark:border-teal-600",in_transit:"bg-sky-100    dark:bg-sky-900/40     text-sky-800     dark:text-sky-300     border-sky-400     dark:border-sky-700",out_for_delivery:"bg-sky-100    dark:bg-sky-900/40     text-sky-800     dark:text-sky-300     border-sky-400     dark:border-sky-700",delivered:"bg-emerald-100 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-400 dark:border-emerald-700",delayed:"bg-indigo-600 dark:bg-indigo-700       text-white        dark:text-white        border-indigo-700    dark:border-indigo-600",returned:"bg-red-100    dark:bg-red-900/40     text-red-800     dark:text-red-300     border-red-400     dark:border-red-700",cancelled:"bg-red-100    dark:bg-red-900/40     text-red-800     dark:text-red-300     border-red-400     dark:border-red-700",warehouse_ready:"bg-teal-600   dark:bg-teal-700       text-white        dark:text-white        border-teal-700    dark:border-teal-600"};function Ve(){const{brand:z}=$e(),p=new URLSearchParams(typeof window<"u"?window.location.search:"").get("invoiceNumber"),[Te,Le]=g.useState("orders"),[ce,me]=g.useState(p?new Set([p]):new Set),[w,Oe]=g.useState("all"),[F,pe]=g.useState(4),[N,O]=g.useState(new Set),{data:R,isLoading:J}=ke({status:w!=="all"?w:void 0}),{data:X}=H({queryKey:["shipping"],queryFn:Ne.list}),{data:v,isLoading:Z}=H({queryKey:["invoice-direct-print",p],queryFn:()=>W.byInvoice(p),enabled:!!p}),{data:A,isLoading:ee}=H({queryKey:["shipments-invoices"],queryFn:()=>je("/shipments?status=warehouse_ready&limit=200"),enabled:!0}),k=g.useMemo(()=>A?.data??(Array.isArray(A)?A:[]),[A]),te=g.useMemo(()=>R?R.filter(t=>!(w!=="all"&&t.status!==w||w==="all"&&t.status!=="warehouse_ready")):[],[R,w]),y=g.useMemo(()=>{const t=new Map;for(const a of te){const r=a.invoiceNumber??`solo-${a.id}`;if(t.has(r)){const o=t.get(r);o.orders.some(c=>c.id===a.id)||(o.orders=[...o.orders,a])}else{const o=a._invoiceOrders,n=o&&o.length>0?o:[a];t.set(r,{rep:a,orders:n})}}return p&&v?.length&&!t.has(p)&&t.set(p,{rep:v[0],orders:v}),Array.from(t.entries()).map(([a,{rep:r,orders:o}])=>({invoiceNumber:a,representativeId:r.id,orders:o,customerName:r.customerName,totalPrice:o.reduce((n,c)=>n+c.totalPrice,0),status:r.status,createdAt:r.createdAt,phone:r.phone??null,city:r.city??null,shippingCompanyId:r.shippingCompanyId??null}))},[te,v,p]),ie=g.useMemo(()=>y,[y]),[I,ae]=g.useState(new Map),_=g.useRef(new Set);g.useEffect(()=>{if(!y.length)return;const t=y.filter(a=>a.invoiceNumber&&!a.invoiceNumber.startsWith("solo-")&&!_.current.has(a.invoiceNumber));t.length&&(t.forEach(a=>_.current.add(a.invoiceNumber)),Promise.all(t.map(async a=>{try{const r=await W.byInvoice(a.invoiceNumber);return{key:a.invoiceNumber,orders:r.length>0?r:a.orders}}catch{return{key:a.invoiceNumber,orders:a.orders}}})).then(a=>{ae(r=>{const o=new Map(r);return a.forEach(n=>o.set(n.key,n.orders)),o})}))},[y,w]),g.useEffect(()=>{ae(new Map),_.current=new Set},[w]),g.useMemo(()=>ie.reduce((t,a)=>t+a.totalPrice,0),[ie]);const ge=async(t=ce)=>{const a=y.filter(s=>t.has(s.invoiceNumber));if(!a.length){alert("اختر فواتير للطباعة أولاً.");return}const r=new Map;await Promise.all(a.map(async s=>{if(s.invoiceNumber.startsWith("solo-")){r.set(s.invoiceNumber,s.orders);return}try{const l=await W.byInvoice(s.invoiceNumber);if(l?.length){r.set(s.invoiceNumber,l);return}}catch{}if(I.has(s.invoiceNumber)){r.set(s.invoiceNumber,I.get(s.invoiceNumber));return}if(v?.length&&v[0].invoiceNumber===s.invoiceNumber){r.set(s.invoiceNumber,v);return}r.set(s.invoiceNumber,s.orders)}));let o="";const n=z.logoUrl||"/logo.jpg";try{const l=await(await fetch(n)).blob();o=await new Promise(d=>{const u=new FileReader;u.onload=()=>d(u.result),u.readAsDataURL(l)})}catch{}const c=z.name||"CAPRINA",U=z.tagline||"WIN OR DIE",b=[];for(let s=0;s<a.length;s+=F)b.push(a.slice(s,s+F));const e=window.open("","_blank");if(!e)return;const h=`
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
    `,$=s=>{const l=r.get(s.invoiceNumber)??s.orders,d=l[0],u=X?.find(m=>m.id===d.shippingCompanyId),C=d.trackingNumber??d.tracking_number??"",M=d.notes??d.note??d.orderNotes??"",x=d.shippingCost??d.shipping_cost??0,D=V(new Date(s.createdAt),"yyyy/MM/dd");o?`${o}${c}`:`${c.substring(0,2)}`;const E=d.address??"",q=String(d.id).padStart(4,"0"),se=d.city??"",T="7",f="0.7mm 1.2mm",be="1.5mm 2.5mm",he="1mm 2.5mm",j="0.4mm 1.2mm",B="5.5",oe="12mm",ue=l.length+(x>0?1:0),xe=()=>l.map(m=>{const P=m.color??"",ye=m.size??"",ne=m.partialQuantity??null,we=ne!=null?`${ne} / ${m.quantity}`:`${m.quantity}`;return`<tr><td class="name-col" style="padding:${f}">${m.product}</td><td style="padding:${f}">${ye||"&#8212;"}</td><td style="padding:${f}">${P||"&#8212;"}</td><td style="font-weight:900;padding:${f}">${we}</td><td style="padding:${f}">${Math.round(m.unitPrice*100)/100%1===0?m.unitPrice.toLocaleString("en-US"):m.unitPrice.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td><td style="font-weight:900;padding:${f}">${Math.round(m.totalPrice*100)/100%1===0?m.totalPrice.toLocaleString("en-US"):m.totalPrice.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>`}).join("");l.reduce((m,P)=>m+P.quantity,0);const ve=l.reduce((m,P)=>m+P.totalPrice,0);return{html:()=>`<div class="inv"><div class="inv-hdr" style="padding:${be}"><div class="hdr-logo"><div style="width:${oe};height:${oe};flex-shrink:0">${o?`<img src="${o}" style="width:100%;height:100%;object-fit:contain;border-radius:1.5mm;background:white;padding:0.5mm;" alt="${c}" />`:`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.1);border-radius:1.5mm;font-size:7pt;font-weight:900;color:white;">${c.substring(0,2)}</div>`}</div><div style="text-align:left;line-height:1.2;margin-right:2mm"><div class="logo-txt" style="font-size:11pt">${c}</div><div class="logo-sub">${U}</div></div></div><div class="hdr-date" style="font-size:8pt">${D}<br/><span style="font-size:5pt;opacity:0.5">ORDER #${q}</span></div></div><div class="cust-row" style="padding:${he}"><div class="cust-name" style="font-size:12pt">${s.customerName}</div><div class="cust-phone" style="font-size:13pt">&#128222; ${s.phone??"&#8212;"}</div></div><div class="inv-body"><div class="table-wrap"><table class="prod-table" style="font-size:${T}pt"><thead><tr><th style="width:30%;padding:${f}">الصنف</th><th style="width:14%;padding:${f}">المقاس</th><th style="width:18%;padding:${f}">اللون</th><th style="width:10%;padding:${f}">العدد</th><th style="width:14%;padding:${f}">السعر</th><th style="width:14%;padding:${f}">الإجمالي</th></tr></thead><tbody>${xe()}${x>0?`<tr><td class="name-col" colspan="4" style="color:#777;font-size:${(parseFloat(T)*.85).toFixed(1)}pt;padding:${f}">مصاريف الشحن</td><td colspan="2" style="font-weight:700;padding:${f}">${x.toLocaleString("en-US")}</td></tr>`:""}</tbody></table></div><div class="total-bar-wrap"><div style="flex-shrink:0;display:flex;justify-content:space-between;align-items:center;background:#1a1a1a;border:1px solid #000;border-radius:1mm;padding:1.2mm 2.5mm;font-size:10pt;font-weight:900;color:#fff;margin-bottom:0.5mm"><span>الإجمالي الكلي</span><span style="font-size:12pt;letter-spacing:1px">${(ve+x).toLocaleString("en-US",{minimumFractionDigits:0,maximumFractionDigits:2})}</span></div></div></div><div class="inv-mid-spacer"></div><div class="inv-bottom" style="font-size:${B}pt"><div class="info-strip"><div class="info-cell" style="padding:${j}"><span class="info-lbl">المحافظة</span><span class="info-val">${se||"&#8212;"}</span></div><div class="info-cell" style="padding:${j}"><span class="info-lbl">شركة الشحن</span><span class="info-val">${u?u.name:"&#8212;"}</span></div><div class="info-cell" style="padding:${j}"><span class="info-lbl">رقم التتبع</span><span class="info-val" style="direction:ltr;text-align:right">${C||"&#8212;"}</span></div></div><div class="addr-box" style="padding:${j}"><div class="addr-lbl">العنوان بالتفصيل</div><div class="addr-val">${E||"&#8212;"}</div></div><div class="notes-box" style="padding:${j};font-size:${B}pt"><b>&#128203; ملاحظات:</b><span>${M||"&#8212;"}</span></div><div class="confirm-box" style="padding:${j};font-size:${B}pt"><span class="cb-lbl">&#10003; التاكيد علي الشحن:</span><span>تم التاكيد مع العميل &#8212; في حاله عدم الاستلام بيتم دفع مصاريف الشحن كامله المتفق عليها</span></div></div><div class="inv-footer"><div class="policy-txt">الاسترجاع فقط اثناء تواجد المندوب &middot; الاستبدال خلال 7 أيام &middot; ضمان 6 أشهر &middot; احتفظ بالفاتورة</div><div class="footer-brand">${c}</div></div></div>`,rowCount:ue}},S=b.map(s=>{const l=F===1?1:2,d=s.map(x=>$(x));let u="";for(let x=0;x<d.length;x+=l){const D=d.slice(x,x+l),E=D.map(T=>T.html()).join(""),q=D.length<l?'<div class="empty-slot"></div>':"";u+=`<div class="inv-row${l===1?" single":""}">${E}${q}</div>`}return`<div class="${Math.ceil(s.length/l)<=1?"page single-row":"page"}">${u}</div>`}).join("");e.document.write(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>فواتير ${c}</title><link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;900&display=swap" rel="stylesheet"><style>${h}</style></head><body>${S}</body></html>`),e.document.close(),e.onload=()=>{setTimeout(()=>{e.focus(),e.print()},600)}},re=g.useRef(!1),fe=async()=>{const t=k.filter(e=>N.has(e.id));if(!t.length){alert("اختر شحنات للطباعة أولاً.");return}const a=await new Promise(e=>{const h=new Image;h.crossOrigin="anonymous",h.onload=()=>{const $=document.createElement("canvas");$.width=h.width,$.height=h.height,$.getContext("2d").drawImage(h,0,0),e($.toDataURL("image/png"))},h.onerror=()=>e(`${window.location.origin}/logo.jpg`),h.src=`${window.location.origin}/logo.jpg`}),r=e=>new Intl.NumberFormat("ar-EG",{style:"currency",currency:"EGP",maximumFractionDigits:0}).format(Number(e||0)),o=e=>{const h=e.shipmentNumber??`SHP#${String(e.id).padStart(4,"0")}`,$=e.trackingNumber||e.tracking_number||h,S=e.createdAt?V(new Date(e.createdAt),"yyyy/MM/dd HH:mm"):"",s=e.paymentMethod==="cod"?"عند الاستلام":e.paymentMethod==="prepaid"?"مدفوع مسبقاً":"لاحقاً",l=Number(e.shippingFee||0),d=Number(e.codAmount||0),u=Number(e.insuranceFee||0),C=Number(e.totalAmount||0),M=C>0?C:l+d+u;return`
<div class="page">
  <div class="header">
    <div class="header-title">
      بوليصة شحن
      <span>رقم الشحنة: ${h} &nbsp;|&nbsp; ${S}</span>
    </div>
    <img class="logo" src="${a}" alt="Logo" onerror="this.style.display='none'"/>
  </div>
  <div class="tracking-bar">
    <div class="tracking-item"><div class="t-label">رقم التتبع</div><div class="t-value highlight">${$}</div></div>
    <div class="tracking-item"><div class="t-label">طريقة الدفع</div><div class="t-value">${s}</div></div>
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
  <div class="details-row">
    <div class="detail-box"><div class="d-label">نوع الشحنة</div><div class="d-value">${e.parcelType||"—"}</div></div>
    <div class="detail-box"><div class="d-label">${e.weight?"الوزن":"عدد القطع"}</div><div class="d-value">${e.weight?`${e.weight} كجم`:e.pieces||"—"}</div></div>
    <div class="detail-box"><div class="d-label">رسوم الشحن</div><div class="d-value">${r(l)}</div></div>
    <div class="detail-box highlight"><div class="d-label">الإجمالي</div><div class="d-value">${r(M)}</div></div>
  </div>
  ${d>0?`
  <div class="details-row" style="grid-template-columns:1fr 1fr;margin-bottom:4px">
    <div class="detail-box" style="background:#fffbeb;border-color:#f59e0b"><div class="d-label" style="color:#92400e">مبلغ COD</div><div class="d-value" style="color:#b45309">${r(d)}</div></div>
    ${u>0?`<div class="detail-box"><div class="d-label">رسوم التأمين</div><div class="d-value">${r(u)}</div></div>`:"<div></div>"}
  </div>`:""}
  ${e.notes?`<div class="notes-box"><div class="n-title">ملاحظات</div><div class="n-text">${e.notes}</div></div>`:""}
  <div class="footer">
    <span>شحنة رقم: <strong>${h}</strong>${e.assignedUserName?` &nbsp;|&nbsp; المندوب: <strong>${e.assignedUserName}</strong>`:""}</span>
    <span class="date">طُبع في: ${S}</span>
  </div>
</div>`},n=t.map(e=>o(e)),c=[];for(let e=0;e<n.length;e+=4)c.push(`<div class="sheet">${n.slice(e,e+4).join("")}</div>`);const U=c.join(""),b=window.open("","_blank");b&&(b.document.write(`<!DOCTYPE html>
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
.detail-box.highlight{background:#111;border-color:#111}
.detail-box.highlight .d-label{color:#aaa}
.detail-box.highlight .d-value{color:#f0c040;font-size:12.5px}
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
<body>${U}</body></html>`),b.document.close(),b.onload=()=>{b.document.fonts?.ready?b.document.fonts.ready.then(()=>{setTimeout(()=>{b.focus(),b.print()},300)}):setTimeout(()=>{b.focus(),b.print()},1200)})};return g.useEffect(()=>{if(!p||re.current||J||Z||!y.length||!y.some(c=>c.invoiceNumber===p))return;const t=y.find(c=>c.invoiceNumber===p),a=I.has(p),r=v&&v.length>0;if(!(a||r||t&&t.orders.length>1))return;const n=new Set([p]);me(n),re.current=!0,ge(n)},[p,J,Z,y,I,v]),i.jsxs("div",{className:"space-y-4 animate-in fade-in duration-500",dir:"rtl",children:[i.jsxs("div",{className:"flex items-center justify-between flex-wrap gap-3",children:[i.jsxs("div",{children:[i.jsx("h1",{className:"text-2xl font-bold",children:"فواتير الشحنات"}),i.jsx("p",{className:"text-muted-foreground text-sm mt-0.5",children:"تظهر الشحنات في مرحلة «قيد الشحن في المخزن»"})]}),i.jsxs("div",{className:"flex items-center gap-2 flex-wrap",children:[i.jsx("span",{className:"text-xs text-muted-foreground whitespace-nowrap",children:"فواتير/صفحة:"}),i.jsxs(Se,{value:String(F),onValueChange:t=>pe(Number(t)),children:[i.jsx(Ce,{className:"w-28 h-9 text-sm bg-card border-border",children:i.jsx(Pe,{})}),i.jsxs(Fe,{children:[i.jsx(Q,{value:"1",children:"1 فاتورة"}),i.jsx(Q,{value:"2",children:"2 فواتير"}),i.jsx(Q,{value:"4",children:"4 فواتير"})]})]}),i.jsxs(G,{onClick:()=>{fe()},className:"gap-2 font-bold text-sm h-9",disabled:N.size===0,children:[i.jsx(Ae,{className:"w-4 h-4"}),"طباعة (",N.size,")"]})]})]}),i.jsxs("div",{className:"space-y-3",children:[i.jsx(K,{className:"border-border overflow-hidden",children:i.jsxs("div",{className:"p-3 flex items-center gap-2 flex-wrap",children:[i.jsxs(G,{variant:"outline",size:"sm",className:"h-8 text-xs gap-1 border-border",onClick:()=>O(new Set(k.map(t=>t.id))),children:[i.jsx(de,{className:"w-3.5 h-3.5"}),"تحديد الكل (",k.length,")"]}),N.size>0&&i.jsxs(G,{variant:"ghost",size:"sm",className:"h-8 text-xs gap-1",onClick:()=>O(new Set),children:[i.jsx(le,{className:"w-3.5 h-3.5"}),"إلغاء التحديد"]}),N.size>0&&i.jsxs("span",{className:"text-xs text-primary font-bold",children:[N.size," محدد"]}),!ee&&i.jsxs("span",{className:"text-xs text-muted-foreground mr-auto",children:[k.length," شحنة",k.length>0&&i.jsxs("span",{className:"mr-1 text-primary font-bold",children:["· ",Y(k.reduce((t,a)=>t+(parseFloat(a.codAmount)||0),0))," COD"]})]})]})}),ee?i.jsx("div",{className:"p-8 text-center text-muted-foreground text-sm",children:"جاري التحميل..."}):k.length>0?i.jsx("div",{className:"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3",children:k.map(t=>{const a=N.has(t.id),r=X?.find(o=>o.id===t.shippingCompanyId);return i.jsxs(K,{onClick:()=>O(o=>{const n=new Set(o);return n.has(t.id)?n.delete(t.id):n.add(t.id),n}),className:`border p-4 cursor-pointer transition-all select-none ${a?"border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20":"border-border bg-card hover:border-primary/40 hover:bg-muted/10"}`,children:[i.jsxs("div",{className:"flex items-start justify-between gap-2",children:[i.jsxs("div",{className:"flex items-center gap-2",children:[a?i.jsx(de,{className:"w-4 h-4 text-primary shrink-0"}):i.jsx(le,{className:"w-4 h-4 text-muted-foreground shrink-0"}),i.jsxs("div",{children:[i.jsx("p",{className:"font-bold text-sm leading-tight",children:t.senderName}),i.jsxs("p",{className:"text-[10px] text-muted-foreground font-mono mt-0.5",children:["#",t.shipmentNumber??String(t.id).padStart(4,"0")]})]})]}),i.jsx(ze,{variant:"outline",className:`text-[9px] font-bold border shrink-0 ${De[t.status]||""}`,children:Me[t.status]??t.status})]}),i.jsxs("div",{className:"mt-3 space-y-1.5 text-xs text-muted-foreground",children:[i.jsxs("div",{className:"flex justify-between items-center",children:[i.jsx("span",{className:"text-foreground font-medium",children:"COD"}),i.jsx("span",{className:"font-bold text-primary",children:Y(parseFloat(t.codAmount)||0)})]}),(parseFloat(t.shippingFee)||0)>0&&i.jsxs("div",{className:"flex justify-between items-center",children:[i.jsx("span",{children:"رسوم الشحن"}),i.jsx("span",{className:"font-semibold",children:Y(parseFloat(t.shippingFee)||0)})]}),t.description&&i.jsxs("p",{className:"text-foreground font-medium truncate",children:["📦 ",t.description]}),i.jsxs("div",{className:"flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5",children:[r&&i.jsxs("span",{className:"flex items-center gap-0.5",children:["🚚 ",r.name]}),t.receiverPhone&&i.jsxs("span",{className:"font-mono text-[11px]",children:["📞 ",t.receiverPhone]}),t.receiverCity&&i.jsxs("span",{children:["📍 ",t.receiverCity]})]}),t.trackingNumber&&i.jsxs("p",{className:"font-mono text-[10px] opacity-70 dir-ltr text-left",children:["🔎 ",t.trackingNumber]}),i.jsx("p",{className:"text-[10px] opacity-60",children:t.createdAt?V(new Date(t.createdAt),"yyyy/MM/dd"):""})]})]},t.id)})}):i.jsxs(K,{className:"border-border p-12 text-center",children:[i.jsx(Ie,{className:"w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-20"}),i.jsx("p",{className:"font-bold",children:"لا توجد شحنات"}),i.jsx("p",{className:"text-sm text-muted-foreground mt-1",children:"سيظهر هنا الشحنات التي حالتها «قيد الشحن في المخزن»"})]})]})]})}export{Ve as default};
//# sourceMappingURL=invoices-C4lILO-i.js.map
