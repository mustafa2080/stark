import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { setAuthTokenGetter } from "@workspace/api-client-react";

setAuthTokenGetter(() => localStorage.getItem("caprina_token"));

// ─── Service Worker Registration ─────────────────────────────────────────────
if ("serviceWorker" in navigator) {
  let refreshing = false;

  // لما الـ SW الجديد ياخد التحكم فعليًا (بعد skipWaiting) — نعمل reload
  // مرة واحدة بس عشان نضمن كل التابات بتاخد أحدث نسخة من الكود تلقائيًا
  // من غير ما نستنى المستخدم يعمل refresh يدوي (كان بيسبب استخدام نسخة
  // قديمة من الملفات المبنية بعد كل deploy).
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    const swUrl = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker
      .register(swUrl, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        console.info("[PWA] Service worker registered", reg.scope);

        // لو فيه SW تاني مستني بالفعل (مثلاً من تاب اتفتح قبل كده) — فعّله فورًا
        if (reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        // لما يلاقي SW جديد وهو خلص التنصيب — نطلب منه ياخد التحكم فورًا
        reg.addEventListener("updatefound", () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
              console.info("[PWA] New version found — activating automatically");
              newWorker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });

        // نتأكد كل شوية إن مفيش نسخة أحدث ماتفعلتش (مفيد للتابات المفتوحة لفترة طويلة)
        setInterval(() => reg.update().catch(() => {}), 60_000);
      })
      .catch((err) => console.warn("[PWA] SW registration failed:", err));
  });
}
createRoot(document.getElementById("root")!).render(<App />);
