import { useState, useEffect, useCallback } from "react";

// ─── تحويل الـ VAPID public key من base64url لـ Uint8Array (المتصفح محتاجها بالشكل ده) ──
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export type PushSupportStatus = "unsupported" | "ios-needs-install" | "supported";

function detectSupportStatus(): PushSupportStatus {
  const hasSW = "serviceWorker" in navigator && "PushManager" in window;
  if (!hasSW) return "unsupported";
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
  if (isIos && !isStandalone) return "ios-needs-install"; // آيفون لازم "إضافة للشاشة الرئيسية" الأول
  return "supported";
}

export function usePushNotifications() {
  const [status, setStatus] = useState<PushSupportStatus>("unsupported");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");

  useEffect(() => {
    setStatus(detectSupportStatus());
    if ("Notification" in window) setPermission(Notification.permission);
  }, []);

  // ── لو المستخدم مسجّل بالفعل، اعرض الحالة الصح من أول تحميل ──────────────
  useEffect(() => {
    if (status !== "supported") return;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!sub);
      } catch (_) { /* silent */ }
    })();
  }, [status]);

  const subscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { notificationsApi } = await import("@/lib/api");
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return false;

      const { publicKey } = await notificationsApi.getVapidKey();
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }
      const json = sub.toJSON();
      await notificationsApi.subscribe({
        endpoint: json.endpoint!,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      });
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error("[usePushNotifications] subscribe failed:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // لا نطلب الإذن تلقائياً: المتصفحات تمنع ذلك وقد تعتبره تجربة مزعجة.
  // لكن إذا كان الأدمن وافق عليه سابقاً، نعيد تسجيل الاشتراك تلقائياً عند فتح
  // التطبيق. هذا يصلح حالة أن اشتراكاً قديماً فشل بسبب إعداد السيرفر أو تغيّر
  // endpoint بعد تحديث المتصفح.
  const ensureSubscribed = useCallback(async (): Promise<boolean> => {
    if (!("Notification" in window) || detectSupportStatus() !== "supported" || Notification.permission !== "granted") return false;
    try {
      const { notificationsApi } = await import("@/lib/api");
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (!existing) {
        const { publicKey } = await notificationsApi.getVapidKey();
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        const json = sub.toJSON();
        await notificationsApi.subscribe({
          endpoint: json.endpoint!,
          keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
        });
      } else {
        // نعيد إرساله دائماً: السيرفر قد يكون فقد الـ subscription بعد deploy.
        const json = existing.toJSON();
        await notificationsApi.subscribe({
          endpoint: json.endpoint!,
          keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
        });
      }
      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.warn("[usePushNotifications] automatic subscription sync failed:", err);
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    try {
      const { notificationsApi } = await import("@/lib/api");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await notificationsApi.unsubscribe(sub.endpoint);
        await sub.unsubscribe();
      }
      setIsSubscribed(false);
      return true;
    } catch (err) {
      console.error("[usePushNotifications] unsubscribe failed:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { status, isSubscribed, isLoading, permission, subscribe, unsubscribe, ensureSubscribed };
}
