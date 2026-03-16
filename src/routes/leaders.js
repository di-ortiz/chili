const { Router } = require("express");
const supabase = require("../db/supabase");

const router = Router();

// GET /leaders - List all team leaders
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("team_leaders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /leaders - Create a team leader
router.post("/", async (req, res) => {
  const { name, email, whatsapp, bu, services, frequency, channels } = req.body;

  if (!name || !email || !bu || !services) {
    return res.status(400).json({ error: "name, email, bu, and services are required" });
  }

  const { data, error } = await supabase
    .from("team_leaders")
    .insert({ name, email, whatsapp, bu, services, frequency, channels })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

// PATCH /leaders/:id - Update a team leader
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const { data, error } = await supabase
    .from("team_leaders")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
