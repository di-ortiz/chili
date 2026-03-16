const { Router } = require("express");
const supabase = require("../db/supabase");

const router = Router();

// GET /accounts - List all accounts
router.get("/", async (req, res) => {
  const { data, error } = await supabase
    .from("accounts")
    .select("*, team_leaders(name, email)")
    .order("name");

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /accounts - Create an account
router.post("/", async (req, res) => {
  const { name, client_name, clickup_list_id, service_type, tier, bu, leader_id } = req.body;

  if (!name || !client_name || !tier || !bu || !leader_id) {
    return res.status(400).json({
      error: "name, client_name, tier, bu, and leader_id are required",
    });
  }

  const { data, error } = await supabase
    .from("accounts")
    .insert({ name, client_name, clickup_list_id, service_type, tier, bu, leader_id })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
});

module.exports = router;
