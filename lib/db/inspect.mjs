import mysql from 'mysql2/promise';
const c = await mysql.createConnection('mysql://root:123456@localhost:3306/stark_dev');
const [tenants] = await c.query('SELECT id, name, slug FROM tenants');
console.log('TENANTS:', JSON.stringify(tenants));
const [companies] = await c.query('SELECT id, name FROM shipping_companies');
console.log('SHIPPING_COMPANIES:', JSON.stringify(companies));
const [users] = await c.query('SELECT id, username, role, tenant_id FROM users');
console.log('USERS:', JSON.stringify(users));
await c.end();
