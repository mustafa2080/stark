import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// ensure table exists
async function ensureTable() {
  await db.run(sql`
    CREATE TABLE IF NOT EXISTS clients_showcase (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      avatar TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT (datetime('now')),
      updated_at DATETIME NOT NULL DEFAULT (datetime('now'))
    )
  `);
}
ensureTable().catch(console.error);

// GET /clients-showcase  — public (used by landing page)
router.get("/clients-showcase", async (req, res) => {
  try {
    const rows = await db.all(sql`
      SELECT id, name, avatar, sort_order FROM clients_showcase ORDER BY sort_order ASC, id ASC
    `);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /clients-showcase
router.post("/clients-showcase", async (req, res) => {
  try {
    const { name, avatar, sort_order = 0 } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const result = await db.run(sql`
      INSERT INTO clients_showcase (name, avatar, sort_order) VALUES (${name}, ${avatar ?? null}, ${sort_order})
    `);
    res.json({ id: result.lastInsertRowid, name, avatar, sort_order });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /clients-showcase/:id
router.patch("/clients-showcase/:id", async (req, res) => {
  try {
    const { name, avatar, sort_order } = req.body;
    const { id } = req.params;
    await db.run(sql`
      UPDATE clients_showcase SET
        name       = COALESCE(${name ?? null}, name),
        avatar     = COALESCE(${avatar ?? null}, avatar),
        sort_order = COALESCE(${sort_order ?? null}, sort_order),
        updated_at = datetime('now')
      WHERE id = ${id}
    `);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /clients-showcase/:id
router.delete("/clients-showcase/:id", async (req, res) => {
  try {
    await db.run(sql`DELETE FROM clients_showcase WHERE id = ${req.params.id}`);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
