const login = await fetch("http://localhost:8000/api/auth/login", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ username: "admin", password: "M3eO4J0pn1fjqUL9" }),
}).then(r => r.json());
const token = login.token;

const res = await fetch("http://localhost:8000/api/finance/clients", {
  headers: { Authorization: `Bearer ${token}` },
});
const data = await res.json();
console.log(JSON.stringify(data.map(c => ({ id: c.id, name: c.name, hasAccount: c.hasAccount })), null, 2));
