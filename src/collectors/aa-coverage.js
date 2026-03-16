const { fetchCampaigns } = require("./agencyanalytics");
const supabase = require("../db/supabase");

/**
 * Check which accounts have matching AgencyAnalytics campaigns.
 * Returns a report of covered and uncovered accounts.
 *
 * @param {string} [leaderId] - Optional: filter to a specific leader's accounts
 * @returns {Promise<{ covered: Array, uncovered: Array }>}
 */
async function checkAACoverage(leaderId) {
  // Fetch accounts
  const query = supabase.from("accounts").select("*").eq("active", true);
  if (leaderId) query.eq("leader_id", leaderId);

  const { data: accounts, error } = await query;
  if (error) throw new Error(`Failed to fetch accounts: ${error.message}`);

  // Fetch AA campaigns
  let campaigns = [];
  try {
    campaigns = await fetchCampaigns();
    if (!Array.isArray(campaigns)) campaigns = [];
  } catch (err) {
    console.error("[aa-coverage] Failed to fetch AA campaigns:", err.message);
    return {
      covered: [],
      uncovered: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        client_name: a.client_name,
        reason: "Could not reach AgencyAnalytics API",
      })),
    };
  }

  const campaignNames = campaigns.map((c) => (c.company || "").toLowerCase());

  const covered = [];
  const uncovered = [];

  for (const account of accounts) {
    const clientName = (account.client_name || "").toLowerCase();

    const match = campaignNames.find(
      (name) => name.includes(clientName) || clientName.includes(name)
    );

    if (match) {
      covered.push({
        id: account.id,
        name: account.name,
        client_name: account.client_name,
        aa_campaign: match,
      });
    } else {
      uncovered.push({
        id: account.id,
        name: account.name,
        client_name: account.client_name,
        reason: "No matching campaign found in AgencyAnalytics",
      });
    }
  }

  return { covered, uncovered };
}

module.exports = { checkAACoverage };
