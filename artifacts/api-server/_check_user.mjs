import mysql from "mysql2/promise";

const conn = await mysql.createConnection("mysql://root:123456@localhost:3306/stark_dev");
const [rows] = await conn.execute(
  "SELECT id, username, role, isActive FROM users WHERE username LIKE ?",
  ["%mohamed%ahmed%"]
);
console.log(JSON.stringify(rows, null, 2));
await conn.end();
