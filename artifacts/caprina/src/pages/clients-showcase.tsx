import React, { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Upload, GripVertical } from "lucide-react";

interface Client { id: number; name: string; avatar: string | null; sort_order: number; }

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json", ...(opts?.body instanceof FormData ? {} : {}) },
    credentials: "include",
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX = 300;
        const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
        canvas.width = img.width * ratio;
        canvas.height = img.height * ratio;
        canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      };
      img.src = e.target!.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function ClientsShowcasePage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["clients-showcase"],
    queryFn: () => apiFetch("/clients-showcase"),
  });

  const addMutation = useMutation({
    mutationFn: (body: { name: string; avatar: string | null }) =>
      apiFetch("/clients-showcase", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients-showcase"] }); setName(""); setAvatar(null); setPreview(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/clients-showcase/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients-showcase"] }),
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const b64 = await compressImage(file);
    setAvatar(b64);
    setPreview(b64);
  };

  const handleAdd = () => {
    if (!name.trim()) return;
    addMutation.mutate({ name: name.trim(), avatar });
  };


  return (
    <div className="p-6 max-w-4xl mx-auto" dir="rtl">
      <h1 className="text-2xl font-black text-white mb-1">عملاؤنا</h1>
      <p className="text-sm text-gray-500 mb-8">إدارة شعارات العملاء التي تظهر في الصفحة الرئيسية</p>

      {/* Add form */}
      <div className="bg-[#111] border border-[#222] rounded-2xl p-5 mb-8">
        <h2 className="text-sm font-bold text-gray-300 mb-4">إضافة عميل جديد</h2>
        <div className="flex flex-wrap gap-3 items-end">
          {/* Avatar picker */}
          <div
            onClick={() => fileRef.current?.click()}
            className="w-16 h-16 rounded-full border border-dashed border-[#333] flex items-center justify-center cursor-pointer hover:border-white/30 transition-colors overflow-hidden"
            style={{ background: "#0d0d0d" }}
          >
            {preview
              ? <img src={preview} alt="" className="w-full h-full object-cover rounded-full" />
              : <Upload size={18} className="text-gray-600" />}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

          {/* Name */}
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="اسم العميل / الشركة"
            className="flex-1 min-w-[200px] bg-[#0d0d0d] border border-[#2a2a2a] rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-white/20"
          />

          <button
            onClick={handleAdd}
            disabled={addMutation.isPending || !name.trim()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-white text-black hover:bg-gray-100 disabled:opacity-40 transition-colors"
          >
            <Plus size={16} /> إضافة
          </button>
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <p className="text-center text-gray-600 py-16">جاري التحميل...</p>
      ) : clients.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-[#222] rounded-2xl">
          <p className="text-gray-600 text-sm">لا يوجد عملاء بعد — ابدأ بالإضافة</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
          {clients.map(c => (
            <div key={c.id} className="flex flex-col items-center gap-2 group">
              <div className="relative">
                <div
                  className="w-20 h-20 rounded-full overflow-hidden flex items-center justify-center"
                  style={{
                    background: "linear-gradient(135deg,#1a1a1a,#111)",
                    border: "1px solid rgba(192,192,192,0.15)",
                    boxShadow: "0 0 18px rgba(192,192,192,0.08), 0 8px 24px rgba(0,0,0,0.6)",
                  }}
                >
                  {c.avatar
                    ? <img src={c.avatar} alt={c.name} className="w-full h-full object-cover" />
                    : <span className="text-gray-600 text-xs font-bold">{c.name.slice(0, 2)}</span>}
                </div>
                <button
                  onClick={() => deleteMutation.mutate(c.id)}
                  className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-red-600 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                >
                  <Trash2 size={11} />
                </button>
              </div>
              <span className="text-xs text-gray-400 text-center max-w-[80px] truncate">{c.name}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
