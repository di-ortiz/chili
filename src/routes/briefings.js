const { Router } = require("express");
const supabase = require("../db/supabase");

const router = Router();

// GET /briefings/:leader_id - Get briefing logs for a leader
router.get("/:leader_id", async (req, res) => {
  const { leader_id } = req.params;

  const { data, error } = await supabase
    .from("briefing_logs")
    .select("*")
    .eq("leader_id", leader_id)
    .order("generated_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

module.exports = router;
