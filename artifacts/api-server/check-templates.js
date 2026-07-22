import mysql from 'mysql2/promise';

(async () => {
  const c = await mysql.createConnection('mysql://u144001284_caprina:Capitan@123456@lavender-armadillo-743548.hostingersite.com:3306/u144001284_caprina');
  const [rows] = await c.execute("SELECT `key`, `value` FROM app_settings WHERE `key` LIKE 'whatsapp_templates%'");
  for (const row of rows) {
    console.log("=== KEY:", row.key, "===");
    try {
      const parsed = JSON.parse(row.value);
      for (const t of parsed) {
        console.log(" - name:", JSON.stringify(t.name), " id:", t.id, " bodyLen:", t.body?.length);
      }
    } catch (e) {
      console.log("PARSE ERROR:", e.message, "RAW:", row.value?.slice(0, 200));
    }
  }
  if (rows.length === 0) console.log("NO ROWS FOUND");
  await c.end();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
