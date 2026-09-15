import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const newHash = await bcrypt.hash("123456", 10);

const [result] = await conn.query(
  "UPDATE users SET password_hash = ? WHERE id = 1",
  [newHash]
);
console.log("UPDATE result:", JSON.stringify(result, null, 2));

const [rows] = await conn.query(
  "SELECT id, username, display_name, role, is_active FROM users WHERE id = 1"
);
console.log("USER:", JSON.stringify(rows, null, 2));

await conn.end();
