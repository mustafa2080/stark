import mysql from 'mysql2/promise';
const DB = 'mysql://u144001284_caprina:Capitan@123456@lavender-armadillo-743548.hostingersite.com:3306/u144001284_caprina';
const conn = await mysql.createConnection(DB);
const [rows] = await conn.execute('SELECT id, name, phone, city, region, address FROM clients WHERE name LIKE ? LIMIT 5', ['%JESY%']);
console.log(JSON.stringify(rows, null, 2));
await conn.end();
