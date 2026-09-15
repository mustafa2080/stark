const login = await fetch("http://localhost:8000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "M3eO4J0pn1fjqUL9" }),
}).then(r => r.json());
const token = login.token;
const authHeaders = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

// 1) شوف تفاصيل العميل الأصلي id=1
const res1 = await fetch("http://localhost:8000/api/finance/clients/1", { headers: authHeaders });
const client1 = await res1.json();
console.log("Client 1 details:", JSON.stringify(client1, null, 2));
