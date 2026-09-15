// صفحة مؤقتة لمعاينة generateShipmentShareImage بدون تشغيل التطبيق كامل
// (بدون توثيق / بدون داتابيز). تُحذف بعد ما نخلص ضبط التصميم.
import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { generateShipmentShareImage, type ShipmentShareData } from "@/lib/shipment-share-card";

const sample: ShipmentShareData = {
  id: 1,
  shipmentNumber: "SHP26090211",
  status: "returned",
  receiverName: "سارة علي",
  receiverCity: "أسوان",
  zoneLabel: "أسيوط",
  note: "العميل رفض الاستلام بعد المعاينة ولم يدفع تكلفة الشحن",
};

function Preview() {
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    generateShipmentShareImage(sample).then(setUrl).catch((e) => setErr(String(e?.stack || e)));
  }, []);

  return (
    <div style={{ background: "#333", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: 20 }}>
      {err && <pre style={{ color: "red", whiteSpace: "pre-wrap" }}>{err}</pre>}
      {url && <img src={url} alt="preview" style={{ boxShadow: "0 0 20px rgba(0,0,0,0.5)" }} />}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<Preview />);
