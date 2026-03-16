const { Router } = require("express");
const supabase = require("../db/supabase");
const { collectDataForLeader } = require("../collectors/pulse-collector");
const { generateBriefing } = require("../collectors/pulse-brain");

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

// POST /briefings/:leader_id/collect - Collect fresh data for a leader
router.post("/:leader_id/collect", async (req, res) => {
  const { leader_id } = req.params;

  const { data: leader, error } = await supabase
    .from("team_leaders")
    .select("*")
    .eq("id", leader_id)
    .single();

  if (error || !leader) {
    return res.status(404).json({ error: "Leader not found" });
  }

  try {
    const result = await collectDataForLeader(leader);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /briefings/:leader_id/generate - Collect data + generate briefing via Claude
router.post("/:leader_id/generate", async (req, res) => {
  const { leader_id } = req.params;

  const { data: leader, error } = await supabase
    .from("team_leaders")
    .select("*")
    .eq("id", leader_id)
    .single();

  if (error || !leader) {
    return res.status(404).json({ error: "Leader not found" });
  }

  try {
    const collectedData = await collectDataForLeader(leader);
    const briefing = await generateBriefing(collectedData);
    res.json({ briefing, tasks: collectedData.tasks.length, events: collectedData.events.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
