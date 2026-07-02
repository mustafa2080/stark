import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

export interface AppNotification {
  id: number;
  tenantId: number | null;
  type: string;
  severity: "info" | "success" | "warning" | "critical";
  title: string;
  message: string | null;
  entityType: string | null;
  entityId: number | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

// ─── صوت إشعار احترافي عالمي (Web Audio API — بدون ملفات mp3) ────────────────
function playNotificationChime(severity: string) {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    const tone = (freq: number, start: number, dur: number, vol: number, type: OscillatorType = "sine") => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = type;
      o.frequency.setValueAtTime(freq, now + start);
      g.gain.setValueAtTime(0, now + start);
      g.gain.linearRampToValueAtTime(vol, now + start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      o.start(now + start);
      o.stop(now + start + dur + 0.05);
    };
    if (severity === "critical") {
      // نغمة تنبيه حادة (شحنة مرتجعة)
      tone(1046.5, 0, 0.14, 0.5, "triangle");
      tone(1318.5, 0.13, 0.14, 0.5, "triangle");
      tone(1046.5, 0.26, 0.22, 0.5, "triangle");
    } else if (severity === "warning") {
      tone(880, 0, 0.16, 0.4, "sine");
      tone(1046.5, 0.15, 0.22, 0.4, "sine");
    } else {
      // نغمة هادئة راقية (شحنة جديدة/نجاح)
      tone(783.99, 0, 0.13, 0.35, "sine");
      tone(1046.5, 0.1, 0.24, 0.35, "sine");
    }
  } catch (_) { /* الصوت اختياري — أي فشل يتجاهل بصمت */ }
}

export function useNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const esRef = useRef<EventSource | null>(null);

  const loadInitial = useCallback(async () => {
    try {
      const { notificationsApi } = await import("@/lib/api");
      const [listRes, countRes] = await Promise.all([
        notificationsApi.list(30),
        notificationsApi.unreadCount(),
      ]);
      setNotifications(listRes.notifications as AppNotification[]);
      setUnreadCount(countRes.count);
    } catch (_) { /* silent */ }
    finally { setIsLoading(false); }
  }, []);

  const markRead = useCallback(async (id: number) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      const { notificationsApi } = await import("@/lib/api");
      await notificationsApi.markRead(id);
    } catch (_) {}
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      const { notificationsApi } = await import("@/lib/api");
      await notificationsApi.markAllRead();
    } catch (_) {}
  }, []);

  useEffect(() => {
    if (!user) return;
    loadInitial();

    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    if (!token) return;

    const base = import.meta.env.VITE_API_URL || "";
    const url = `${base}/notifications/sse?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.addEventListener("notification", (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as AppNotification;
        setNotifications((prev) => [data, ...prev].slice(0, 50));
        setUnreadCount((c) => c + 1);
        playNotificationChime(data.severity);
        toast({
          title: data.title,
          description: data.message || undefined,
          variant: data.severity === "critical" ? "destructive" : "default",
        });
      } catch (_) {}
    });

    es.onerror = () => {
      es.close();
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [user, loadInitial, toast]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markRead,
    markAllRead,
    refresh: loadInitial,
  };
}
