const { Router } = require("express");
const { fetchWorkspaceStructure, syncClickUpToAccounts } = require("../collectors/clickup-sync");
const { checkAACoverage } = require("../collectors/aa-coverage");

const router = Router();

// GET /sync/clickup/preview — Preview what would be synced (lists + members)
router.get("/clickup/preview", async (_req, res) => {
  try {
    const structure = await fetchWorkspaceStructure();
    res.json(structure);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /sync/clickup — Run the sync: pull ClickUp lists into accounts table
router.post("/clickup", async (_req, res) => {
  try {
    const result = await syncClickUpToAccounts();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /sync/aa-coverage — Check which accounts have AgencyAnalytics campaigns
router.get("/aa-coverage", async (req, res) => {
  try {
    const leaderId = req.query.leader_id || null;
    const result = await checkAACoverage(leaderId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /sync/clickup/members — List ClickUp workspace members (for mapping to leaders)
router.get("/clickup/members", async (_req, res) => {
  try {
    const { members } = await fetchWorkspaceStructure();
    res.json(members);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
