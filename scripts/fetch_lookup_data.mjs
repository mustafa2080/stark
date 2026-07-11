import { readFileSync } from 'fs';
import { createConnection } from 'mysql2/promise';

const envContent = readFileSync('../.env', 'utf8');
const rawUrl = envContent.match(/DATABASE_URL\s*=\s*([^\n\r]+)/)[1].trim();
const protoStripped = rawUrl.replace(/^mysql:\/\//, '');
const lastAt = protoStripped.lastIndexOf('@');
const userPass = protoStripped.substring(0, lastAt);
const hostPortDb = protoStripped.substring(lastAt + 1);
const colonInUp = userPass.indexOf(':');
const user = userPass.substring(0, colonInUp);
const password = userPass.substring(colonInUp + 1);
const slashIdx = hostPortDb.indexOf('/');
const hostPort = hostPortDb.substring(0, slashIdx);
const database = hostPortDb.substring(slashIdx + 1).split('?')[0];
const colonInHp = hostPort.lastIndexOf(':');
const host = hostPort.substring(0, colonInHp) || 'localhost';
const port = parseInt(hostPort.substring(colonInHp + 1)) || 3306;

const conn = await createConnection({ host, port, user, password, database });

console.log('--- Warehouses ---');
const [warehouses] = await conn.execute('SELECT id, name, tenant_id FROM warehouses LIMIT 10');
console.log(JSON.stringify(warehouses, null, 2));

console.log('--- Shipment Zones ---');
const [zones] = await conn.execute('SELECT id, name, tenant_id FROM shipment_zones LIMIT 10');
console.log(JSON.stringify(zones, null, 2));

console.log('--- Parcel Type Pricing ---');
const [types] = await conn.execute('SELECT * FROM parcel_type_pricing LIMIT 10');
console.log(JSON.stringify(types, null, 2));

console.log('--- Sample Clients ---');
const [clients] = await conn.execute('SELECT id, name, phone, city, region, address, tenant_id FROM clients LIMIT 5');
console.log(JSON.stringify(clients, null, 2));

await conn.end();
