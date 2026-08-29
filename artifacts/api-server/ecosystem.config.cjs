// ─── PM2 ecosystem config — starkvector-api ──────────────────────────────────
// السيرفر عنده 2 CPU cores بس، ومشارك مع caprina-api على نفس الجهاز. كان شغال
// fork mode بـ instance واحد قبل كده — ده أكبر عنق زجاجة لتحمّل عدد كبير من
// اليوزرز لأن Node.js single-threaded: أي CPU-bound work (حسابات analytics أو
// clientAccountBalance الطويلة) بتوقف الـ event loop بالكامل وتأخر أي طلب تاني.
//
// اخترنا instances: 2 (مش عدد الـ cores كامل) لأن caprina-api كمان شغالة على
// نفس الجهاز — لو الاتنين شغّلوا cluster بعدد cores كامل (2 لكل واحدة) هيبقى
// عندنا 4 Node processes على 2 cores بس (oversubscription)، وده هيسبب context
// switching زيادة بدل ما يحسّن الأداء. نبدأ بـ 2 instances هنا ونراقب الأداء
// (pm2 monit) قبل أي زيادة إضافية.
//
// ⚠️ إصلاح (2026-08-29): قبل الانتقال لـ ecosystem file، الـ process كان
// بيتشغّل بأمر `pm2 start dist/index.mjs` مباشر، وPM2 كان بياخد الـ env vars
// (DATABASE_URL, JWT_SECRET, ALLOWED_ORIGINS...) تلقائيًا من الـ .env الموجود
// جنب الملف. لما اتحول لـ ecosystem.config.cjs، PM2 مبيقراش .env تلقائيًا خالص
// إلا لو اتحدد صراحة — فالـ process كان بيقوم من غير أي env، وده كان بيكرش على
// "DATABASE_URL must be set" في كل الـ instances. بنقرأ الملف يدويًا هنا
// ونحقنه في env عشان نضمن نفس السلوك القديم بالظبط.
const fs = require("node:fs");
const path = require("node:path");

function loadEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    // شيل quotes لو موجودة حوالين القيمة
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const envFromFile = loadEnvFile(path.join(__dirname, ".env"));

module.exports = {
  apps: [
    {
      name: "starkvector-api",
      script: "./dist/index.mjs",
      cwd: "/root/starkvector/artifacts/api-server",
      exec_mode: "cluster",
      instances: 2,
      // Heap usage كان لاحظنا وصل 94.73% في القياس الأخير — max_memory_restart
      // بيعمل restart تلقائي للـ instance لو تعدّى الحد ده، بدل ما يفضل يتراكم
      // لحد ما يقع بالكامل (OOM) ويوقف كل الطلبات لحد ما PM2 يعيد تشغيله.
      max_memory_restart: "400M",
      env: {
        ...envFromFile,
        NODE_ENV: "production",
      },
    },
  ],
};
