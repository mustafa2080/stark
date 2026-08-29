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
        NODE_ENV: "production",
      },
    },
  ],
};
