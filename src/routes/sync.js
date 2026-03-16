const { Router } = require("express");
const { fetchWorkspaceStructure, syncClickUpToAccounts } = require("../collectors/clickup-sync");
const { checkAACoverage } = require("../collectors/aa-coverage");
const { fetchCampaigns } = require("../collectors/agencyanalytics");

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

// GET /sync/aa-campaigns — List all AgencyAnalytics campaigns
router.get("/aa-campaigns", async (_req, res) => {
  try {
    const campaigns = await fetchCampaigns();
    res.json(campaigns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /sync/crosscheck — Compare ClickUp clients vs AgencyAnalytics campaigns
router.get("/crosscheck", async (_req, res) => {
  try {
    const { lists } = await fetchWorkspaceStructure();

    // Filter to project lists only
    const projectFolders = ["(Brazil) Projects", "(Panama) Projects", "(Panama INT) Projects", "(Mexico) Projects"];
    const projectLists = lists.filter((l) => l.folder_name && projectFolders.includes(l.folder_name));

    // Extract unique client names from ClickUp
    const clickupClients = new Map();
    for (const list of projectLists) {
      const match = list.name.match(/^(?:SEO\/AEO|SEO|PPC|SEM|SMM|CRO|BKLinks|EDM|LP|Social|WEB|WIKIPEDIA|SEARCH|PPC SEARCH|Site)\s*-\s*(.+)$/i);
      const clientName = match ? match[1].trim() : list.name;
      if (!clickupClients.has(clientName.toLowerCase())) {
        clickupClients.set(clientName.toLowerCase(), {
          client_name: clientName,
          lists: [],
          folder: list.folder_name,
        });
      }
      clickupClients.get(clientName.toLowerCase()).lists.push(list.name);
    }

    // Fetch AA campaigns
    let aaCampaigns = [];
    try {
      aaCampaigns = await fetchCampaigns();
      if (!Array.isArray(aaCampaigns)) aaCampaigns = [];
    } catch (err) {
      return res.json({
        error_fetching_aa: err.message,
        clickup_clients: [...clickupClients.values()],
        aa_campaigns: [],
        matched: [],
        clickup_only: [...clickupClients.values()],
        aa_only: [],
      });
    }

    const aaCampaignNames = aaCampaigns.map((c) => ({
      name: (c.company || "").toLowerCase(),
      original: c.company,
      url: c.url,
      id: c.id,
    }));

    const matched = [];
    const clickupOnly = [];

    for (const [key, client] of clickupClients) {
      const aaMatch = aaCampaignNames.find(
        (c) => c.name.includes(key) || key.includes(c.name)
      );
      if (aaMatch) {
        matched.push({
          client_name: client.client_name,
          clickup_lists: client.lists,
          folder: client.folder,
          aa_campaign: aaMatch.original,
          aa_url: aaMatch.url,
        });
      } else {
        clickupOnly.push({
          client_name: client.client_name,
          clickup_lists: client.lists,
          folder: client.folder,
          status: "NO AA REPORTING",
        });
      }
    }

    // AA campaigns not matched to any ClickUp client
    const matchedAANames = matched.map((m) => m.aa_campaign.toLowerCase());
    const aaOnly = aaCampaignNames
      .filter((c) => !matchedAANames.includes(c.name))
      .map((c) => ({ aa_campaign: c.original, aa_url: c.url, status: "NOT IN CLICKUP" }));

    res.json({
      summary: {
        clickup_clients: clickupClients.size,
        aa_campaigns: aaCampaigns.length,
        matched: matched.length,
        clickup_without_aa: clickupOnly.length,
        aa_without_clickup: aaOnly.length,
      },
      matched,
      clickup_without_aa: clickupOnly,
      aa_without_clickup: aaOnly,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
