import mysql from "mysql2/promise";

const conn = await mysql.createConnection("mysql://root:123456@localhost:3306/stark_dev");
const [rows] = await conn.query(
  "SELECT id, username, display_name, role, is_active, tenant_id FROM users WHERE username LIKE '%mohamed%ahmed%' OR display_name LIKE '%محمد%أحمد%' OR display_name LIKE '%محمد احمد%'"
);
console.log(JSON.stringify(rows, null, 2));
await conn.end();
