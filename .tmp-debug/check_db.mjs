import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  uri: "mysql://u144001284_caprina:Capitan@123456@lavender-armadillo-743548.hostingersite.com:3306/u144001284_caprina",
  connectTimeout: 15000,
});

console.log("== status distribution (all, not deleted) ==");
let [rows] = await conn.query("SELECT status, COUNT(*) c FROM shipments WHERE deleted_at IS NULL GROUP BY status ORDER BY c DESC");
console.log(rows);

console.log("== total ==");
[rows] = await conn.query("SELECT COUNT(*) c FROM shipments WHERE deleted_at IS NULL");
console.log(rows);

console.log("== date range ==");
[rows] = await conn.query("SELECT MIN(created_at) mn, MAX(created_at) mx FROM shipments WHERE deleted_at IS NULL");
console.log(rows);

console.log("== last 7 days count ==");
[rows] = await conn.query("SELECT COUNT(*) c FROM shipments WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL 7 DAY");
console.log(rows);

console.log("== last 7 days status distribution ==");
[rows] = await conn.query("SELECT status, COUNT(*) c FROM shipments WHERE deleted_at IS NULL AND created_at >= NOW() - INTERVAL 7 DAY GROUP BY status ORDER BY c DESC");
console.log(rows);

await conn.end();
