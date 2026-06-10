import { useState } from "react";
import { useLocation } from "wouter";
import {
  ChevronDown, ChevronUp, FileText, Shield, Truck, Clock, CreditCard,
  AlertTriangle, RefreshCw, Lock, Scale, Phone, Mail, MapPin, ArrowRight
} from "lucide-react";
import { Navbar, Footer, SocialFloat } from "./home";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Article {
  id: number;
  title: string;
  icon: React.ElementType;
  content: string[];
}

// ─── Contract Articles ────────────────────────────────────────────────────────
const articles: Article[] = [
  {
    id: 1,
    title: "موضوع العقد",
    icon: FileText,
    content: [
      "تتعهد شركة STARK للشحن بتقديم خدمات الشحن والنقل والتوصيل للعميل وفقاً للشروط والأحكام المنصوص عليها في هذا العقد.",
      "تشمل الخدمات: الاستلام من مقر العميل أو المستودع، النقل البري داخل جمهورية مصر العربية، التوصيل للعنوان المحدد، والتتبع اللحظي للشحنات.",
      "يسري هذا العقد اعتباراً من تاريخ توقيعه وينتهي بانتهاء المدة المتفق عليها أو بإخطار مسبق وفق ما هو منصوص عليه.",
    ],
  },
  {
    id: 2,
    title: "التزامات الشركة",
    icon: Shield,
    content: [
      "الالتزام بمواعيد الاستلام والتسليم المحددة مسبقاً مع إشعار العميل بأي تأخير قد يطرأ.",
      "توفير نظام تتبع إلكتروني يتيح للعميل متابعة شحناته في الوقت الفعلي على مدار الساعة.",
      "الحفاظ على سلامة البضائع المشحونة وتوفير التغليف المناسب عند الطلب.",
      "تقديم تقارير دورية عن حالة الشحنات وأي مستجدات تخص عمليات التسليم.",
      "توفير خدمة عملاء متاحة طوال أيام الأسبوع للرد على الاستفسارات وحل المشكلات.",
    ],
  },
  {
    id: 3,
    title: "التزامات العميل",
    icon: Truck,
    content: [
      "تقديم بيانات صحيحة ودقيقة عن الشحنة (النوع، الوزن، الأبعاد، القيمة) عند الحجز.",
      "ضمان أن البضائع المشحونة مطابقة للقوانين واللوائح المعمول بها في جمهورية مصر العربية.",
      "الالتزام بسداد الرسوم المستحقة في المواعيد المتفق عليها.",
      "إخطار الشركة فوراً بأي تغييرات في بيانات التسليم أو إلغاء الشحنة وفق المهلة المحددة.",
      "توفير وصول مناسب لمركبات الشحن في مواقع الاستلام والتسليم.",
    ],
  },
  {
    id: 4,
    title: "الرسوم وشروط الدفع",
    icon: CreditCard,
    content: [
      "تُحسب الرسوم وفقاً للتعرفة المعتمدة من الشركة بناءً على الوزن والأبعاد والمسافة ونوع الخدمة.",
      "يستحق السداد خلال 30 يوم من تاريخ الفاتورة ما لم يُتفق على غير ذلك خطياً.",
      "تُفرض غرامة تأخير بنسبة 2% شهرياً على المبالغ غير المسددة بعد انتهاء مهلة الدفع.",
      "تحتفظ الشركة بحق تعليق الخدمات في حالة التأخر في السداد لمدة تزيد عن 45 يوماً.",
      "تُعاد مراجعة الأسعار مرة واحدة سنوياً مع إشعار العميل قبل 30 يوماً من تطبيق أي تعديل.",
    ],
  },
  {
    id: 5,
    title: "المواد والبضائع المحظورة",
    icon: AlertTriangle,
    content: [
      "يُحظر شحن المواد المتفجرة والمواد الكيميائية الخطرة والأسلحة بكافة أنواعها.",
      "يُحظر شحن الأموال النقدية والمجوهرات والمعادن الثمينة إلا بموافقة خطية مسبقة وتغطية تأمينية كافية.",
      "يُحظر شحن أي مواد مخدرة أو ممنوعة قانونياً في جمهورية مصر العربية.",
      "العميل مسؤول مسؤولية كاملة عن أي بضائع محظورة يتم اكتشافها، وتحتفظ الشركة بحق إبلاغ الجهات المختصة.",
    ],
  },
  {
    id: 6,
    title: "المسؤولية والتعويض",
    icon: Scale,
    content: [
      "تتحمل الشركة المسؤولية عن الأضرار الناجمة عن إهمالها المثبت، وتكون قيمة التعويض محددة بقيمة البضاعة المُعلنة أو الحد الأقصى المنصوص عليه في وثيقة الشحن.",
      "لا تتحمل الشركة المسؤولية عن التأخيرات الناجمة عن ظروف قاهرة كالكوارث الطبيعية والاضطرابات الأمنية.",
      "يُشترط لقبول أي مطالبة تعويض تقديمها كتابياً خلال 7 أيام من تاريخ الاستلام أو من الموعد المحدد للتسليم.",
      "الحد الأقصى للتعويض عن الشحنة الواحدة هو 5,000 جنيه مصري إلا إذا تم الإعلان عن قيمة أعلى مقابل رسوم إضافية.",
    ],
  },
  {
    id: 7,
    title: "مدة العقد والتجديد",
    icon: RefreshCw,
    content: [
      "يُبرم هذا العقد لمدة سنة ميلادية كاملة تبدأ من تاريخ التوقيع.",
      "يتجدد العقد تلقائياً لمدد مماثلة ما لم يُخطر أحد الطرفين الآخر برغبته في عدم التجديد قبل 30 يوماً من تاريخ الانتهاء.",
      "يحق لأي من الطرفين إنهاء العقد قبل انتهاء مدته بإشعار خطي مسبق لمدة 60 يوماً.",
      "في حالة الإنهاء المبكر من جانب العميل دون مسوّغ مشروع، يستحق تعويض يعادل 10% من قيمة الخدمات المتبقية.",
    ],
  },
  {
    id: 8,
    title: "السرية وحماية البيانات",
    icon: Lock,
    content: [
      "تلتزم الشركة بالحفاظ على سرية جميع المعلومات التجارية والشخصية الخاصة بالعميل.",
      "لا يجوز مشاركة أي بيانات مع أطراف ثالثة إلا بموافقة خطية مسبقة من العميل أو بموجب أمر قضائي.",
      "تُطبق الشركة أعلى معايير الأمن المعلوماتي لحماية بيانات العملاء المخزنة إلكترونياً.",
    ],
  },
  {
    id: 9,
    title: "تسوية النزاعات والقانون الواجب التطبيق",
    icon: Scale,
    content: [
      "يخضع هذا العقد لأحكام القانون المصري وتختص محاكم القاهرة بالنظر في أي نزاع ينشأ عنه.",
      "في حالة نشوء أي نزاع، يتفق الطرفان على اللجوء أولاً إلى التفاوض الودي خلال 30 يوماً.",
      "إذا تعذّر حل النزاع ودياً، يُحال إلى التحكيم وفق لائحة مركز القاهرة الإقليمي للتحكيم التجاري الدولي.",
    ],
  },
];

// ─── Accordion Item ───────────────────────────────────────────────────────────
function AccordionItem({
  article,
  isOpen,
  onToggle,
  darkMode,
}: {
  article: Article;
  isOpen: boolean;
  onToggle: () => void;
  darkMode: boolean;
}) {
  const Icon = article.icon;
  return (
    <div
      className={`border rounded-2xl overflow-hidden transition-all duration-300 ${
        darkMode
          ? `bg-[#0d0d0d] border-[#222] ${isOpen ? "border-[#444]" : ""}`
          : `bg-white border-gray-200 ${isOpen ? "border-gray-400" : ""}`
      }`}
    >
      {/* Header */}
      <button
        onClick={onToggle}
        className={`w-full flex items-center justify-between gap-4 px-6 py-5 text-right transition-colors ${
          darkMode ? "hover:bg-white/5" : "hover:bg-gray-50"
        }`}
        dir="rtl"
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              isOpen
                ? darkMode
                  ? "bg-white text-black"
                  : "bg-black text-white"
                : darkMode
                ? "bg-white/10 text-gray-400"
                : "bg-gray-100 text-gray-500"
            } transition-all duration-300`}
          >
            <Icon size={18} />
          </div>
          <div className="text-right">
            <span className={`text-xs font-medium ${darkMode ? "text-gray-600" : "text-gray-400"}`}>
              المادة {article.id}
            </span>
            <h3 className={`font-bold text-base leading-tight ${darkMode ? "text-white" : "text-black"}`}>
              {article.title}
            </h3>
          </div>
        </div>
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300 ${
            isOpen
              ? darkMode ? "bg-white/15" : "bg-black/10"
              : darkMode ? "bg-white/5" : "bg-gray-100"
          }`}
        >
          {isOpen ? (
            <ChevronUp size={16} className={darkMode ? "text-white" : "text-black"} />
          ) : (
            <ChevronDown size={16} className={darkMode ? "text-gray-400" : "text-gray-500"} />
          )}
        </div>
      </button>

      {/* Body */}
      <div
        style={{
          maxHeight: isOpen ? "600px" : "0",
          overflow: "hidden",
          transition: "max-height 0.4s cubic-bezier(0.4,0,0.2,1)",
        }}
      >
        <div className={`px-6 pb-6 pt-1 border-t ${darkMode ? "border-[#1a1a1a]" : "border-gray-100"}`} dir="rtl">
          <ul className="space-y-3 mt-4">
            {article.content.map((point, i) => (
              <li key={i} className="flex gap-3">
                <span
                  className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    darkMode ? "bg-gray-500" : "bg-gray-400"
                  }`}
                />
                <p className={`text-sm leading-relaxed ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                  {point}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ContractPage() {
  const [darkMode, setDarkMode] = useState(true);
  const [openId, setOpenId] = useState<number | null>(1);
  const [, navigate] = useLocation();

  const toggleDarkMode = () => setDarkMode(d => !d);
  const toggle = (id: number) => setOpenId(prev => (prev === id ? null : id));

  return (
    <div className={`min-h-screen ${darkMode ? "bg-black text-white" : "bg-white text-black"}`} dir="rtl">
      <Navbar darkMode={darkMode} toggleDarkMode={toggleDarkMode} />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className={`pt-32 pb-16 ${darkMode ? "bg-[#050505]" : "bg-gray-50"}`}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          {/* badge */}
          <div className="inline-flex items-center gap-2 mb-6">
            <span
              className={`text-xs font-bold px-4 py-1.5 rounded-full border ${
                darkMode ? "border-white/20 text-gray-300 bg-white/5" : "border-gray-300 text-gray-500 bg-gray-100"
              }`}
            >
              وثيقة رسمية معتمدة
            </span>
          </div>

          {/* title */}
          <h1 className={`text-4xl md:text-5xl font-black mb-4 leading-tight ${darkMode ? "text-white" : "text-black"}`}>
            عقد خدمات الشحن
            <br />
            <span className={darkMode ? "text-gray-400" : "text-gray-500"}>شركة STARK للشحن</span>
          </h1>
          <p className={`text-base mb-8 ${darkMode ? "text-gray-500" : "text-gray-500"}`}>
            اقرأ جميع بنود العقد بعناية قبل التوقيع • يُعدّ هذا العقد ملزماً قانونياً لكلا الطرفين
          </p>

          {/* meta cards */}
          <div className="flex flex-wrap justify-center gap-3 mb-4">
            {[
              { label: "رقم العقد", value: "STARK-2026-001" },
              { label: "تاريخ الإصدار", value: "يناير 2026" },
              { label: "عدد المواد", value: "9 مواد" },
            ].map((m, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm ${
                  darkMode ? "bg-[#0d0d0d] border-[#222] text-gray-300" : "bg-white border-gray-200 text-gray-600"
                }`}
              >
                <span className={`font-medium ${darkMode ? "text-gray-500" : "text-gray-400"}`}>{m.label}:</span>
                <span className="font-bold">{m.value}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Articles ─────────────────────────────────────────────────────── */}
      <section className={`py-12 ${darkMode ? "bg-black" : "bg-white"}`}>
        <div className="max-w-4xl mx-auto px-4">

          {/* preamble */}
          <div
            className={`mb-8 p-6 rounded-2xl border ${
              darkMode ? "bg-[#0d0d0d] border-[#222]" : "bg-gray-50 border-gray-200"
            }`}
            dir="rtl"
          >
            <h2 className={`font-bold mb-3 ${darkMode ? "text-white" : "text-black"}`}>ديباجة العقد</h2>
            <p className={`text-sm leading-loose ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
              هذا العقد مبرم بين <strong className={darkMode ? "text-white" : "text-black"}>شركة STARK للشحن</strong> (الطرف الأول)
              وبين العميل الموقع أدناه (الطرف الثاني)، اتفق الطرفان على الالتزام بجميع البنود والشروط الواردة فيه والعمل
              بموجبها ابتداءً من تاريخ التوقيع.
            </p>
          </div>

          {/* accordion */}
          <div className="space-y-3">
            {articles.map(article => (
              <AccordionItem
                key={article.id}
                article={article}
                isOpen={openId === article.id}
                onToggle={() => toggle(article.id)}
                darkMode={darkMode}
              />
            ))}
          </div>

          {/* expand all hint */}
          <div className="mt-4 text-center">
            <button
              onClick={() => setOpenId(null)}
              className={`text-xs transition-colors ${darkMode ? "text-gray-600 hover:text-gray-400" : "text-gray-400 hover:text-gray-600"}`}
            >
              طيّ جميع البنود
            </button>
          </div>
        </div>
      </section>

      {/* ── Signature Section ─────────────────────────────────────────────── */}
      <section className={`py-16 ${darkMode ? "bg-[#050505]" : "bg-gray-50"}`}>
        <div className="max-w-4xl mx-auto px-4">
          <h2 className={`text-center text-2xl font-black mb-10 ${darkMode ? "text-white" : "text-black"}`}>
            التوقيع والاعتماد
          </h2>

          <div className="grid md:grid-cols-2 gap-6 mb-10">
            {/* Party 1 */}
            <div className={`p-6 rounded-2xl border ${darkMode ? "bg-[#0d0d0d] border-[#222]" : "bg-white border-gray-200"}`} dir="rtl">
              <p className={`text-xs font-bold mb-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>الطرف الأول</p>
              <h3 className={`font-black text-lg mb-4 ${darkMode ? "text-white" : "text-black"}`}>شركة STARK للشحن</h3>
              <div className={`space-y-2 mb-6 text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                <div className="flex items-center gap-2"><MapPin size={14}/> القاهرة، جمهورية مصر العربية</div>
                <div className="flex items-center gap-2"><Phone size={14}/> 01XXXXXXXXX</div>
                <div className="flex items-center gap-2"><Mail size={14}/> info@starkvector.com</div>
              </div>
              <div className={`border-t pt-4 ${darkMode ? "border-[#1a1a1a]" : "border-gray-100"}`}>
                <p className={`text-xs mb-6 ${darkMode ? "text-gray-600" : "text-gray-400"}`}>توقيع المفوّض</p>
                <div className={`h-px w-32 ${darkMode ? "bg-[#333]" : "bg-gray-300"}`} />
              </div>
            </div>

            {/* Party 2 */}
            <div className={`p-6 rounded-2xl border ${darkMode ? "bg-[#0d0d0d] border-[#222]" : "bg-white border-gray-200"}`} dir="rtl">
              <p className={`text-xs font-bold mb-1 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>الطرف الثاني</p>
              <h3 className={`font-black text-lg mb-4 ${darkMode ? "text-white" : "text-black"}`}>العميل</h3>
              <div className="space-y-3 mb-6">
                {["الاسم الكامل / اسم الشركة", "العنوان", "رقم الهاتف"].map((label, i) => (
                  <div key={i} dir="rtl">
                    <p className={`text-xs mb-1 ${darkMode ? "text-gray-600" : "text-gray-400"}`}>{label}</p>
                    <div className={`h-px w-full ${darkMode ? "bg-[#2a2a2a]" : "bg-gray-200"}`} />
                  </div>
                ))}
              </div>
              <div className={`border-t pt-4 ${darkMode ? "border-[#1a1a1a]" : "border-gray-100"}`}>
                <p className={`text-xs mb-6 ${darkMode ? "text-gray-600" : "text-gray-400"}`}>توقيع العميل</p>
                <div className={`h-px w-32 ${darkMode ? "bg-[#333]" : "bg-gray-300"}`} />
              </div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center space-y-4">
            <p className={`text-sm ${darkMode ? "text-gray-500" : "text-gray-500"}`}>
              للتعاقد الآن تواصل معنا عبر واتساب أو أرسل بريداً إلكترونياً
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <a
                href="https://wa.me/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 font-bold px-7 py-3.5 rounded-xl transition-all bg-[#25D366] text-white hover:bg-[#20b95a]"
                style={{ boxShadow: "0 4px 20px rgba(37,211,102,0.35)" }}
              >
                تواصل عبر واتساب
                <ArrowRight size={16} />
              </a>
              <a
                href="mailto:info@starkvector.com"
                className={`inline-flex items-center gap-2 font-bold px-7 py-3.5 rounded-xl transition-all border ${
                  darkMode
                    ? "border-[#333] text-gray-300 hover:border-[#666] hover:text-white"
                    : "border-gray-300 text-gray-600 hover:border-gray-600 hover:text-black"
                }`}
              >
                <Mail size={16} /> مراسلة بالبريد
              </a>
            </div>
          </div>
        </div>
      </section>

      <Footer />
      <SocialFloat darkMode={darkMode} />
    </div>
  );
}
