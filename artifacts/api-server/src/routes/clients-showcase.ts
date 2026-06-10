import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAuth } from "../middlewares/requireAuth.js";

const router = Router();

// ensure table exists (MySQL syntax)
async function ensureTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS clients_showcase (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      avatar LONGTEXT,
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}
ensureTable().catch(console.error);

// GET /clients-showcase  — public (used by landing page)
router.get("/clients-showcase", async (req, res) => {
  try {
    const [rows] = await db.execute(sql`
      SELECT id, name, avatar, sort_order FROM clients_showcase ORDER BY sort_order ASC, id ASC
    `);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /clients-showcase
router.post("/clients-showcase", requireAuth, async (req, res) => {
  try {
    const { name, avatar, sort_order = 0 } = req.body;
    if (!name) return res.status(400).json({ error: "name required" });
    const [result]: any = await db.execute(sql`
      INSERT INTO clients_showcase (name, avatar, sort_order) VALUES (${name}, ${avatar ?? null}, ${sort_order})
    `);
    res.json({ id: result.insertId, name, avatar, sort_order });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /clients-showcase/:id
router.patch("/clients-showcase/:id", requireAuth, async (req, res) => {
  try {
    const { name, avatar, sort_order } = req.body;
    const { id } = req.params;
    await db.execute(sql`
      UPDATE clients_showcase SET
        name       = COALESCE(${name ?? null}, name),
        avatar     = COALESCE(${avatar ?? null}, avatar),
        sort_order = COALESCE(${sort_order ?? null}, sort_order),
        updated_at = NOW()
      WHERE id = ${id}
    `);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /clients-showcase/:id
router.delete("/clients-showcase/:id", requireAuth, async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM clients_showcase WHERE id = ${req.params.id}`);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
