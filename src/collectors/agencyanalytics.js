const axios = require("axios");

const AA_API_URL = "https://apirequest.app/query";

function getAuthHeader() {
  const apiKey = process.env.AGENCYANALYTICS_API_KEY;
  if (!apiKey) throw new Error("Missing AGENCYANALYTICS_API_KEY env var");
  // Basic auth: no username, API key as password → base64(":apikey")
  const encoded = Buffer.from(`:${apiKey}`).toString("base64");
  return `Basic ${encoded}`;
}

/**
 * Run a query against the AgencyAnalytics API.
 */
async function aaQuery(asset, filters = {}, fields = []) {
  const { data } = await axios.post(
    AA_API_URL,
    { asset, filters, fields },
    { headers: { Authorization: getAuthHeader(), "Content-Type": "application/json" } }
  );
  return data;
}

/**
 * Fetch all campaigns (clients) from AgencyAnalytics.
 */
async function fetchCampaigns() {
  const data = await aaQuery("campaign", {}, ["id", "company", "url", "date_created"]);
  return data.data || data || [];
}

/**
 * Fetch keyword rankings for a specific campaign.
 */
async function fetchKeywordRankings(campaignId) {
  const data = await aaQuery(
    "keyword-rankings",
    { campaign_id: campaignId },
    ["keyword_phrase", "rank", "previous_rank", "search_engine", "date"]
  );
  return data.data || data || [];
}

/**
 * Match accounts to AA campaigns by approximate name and fetch performance data.
 *
 * @param {Array} accounts - Account rows from Supabase (with client_name)
 * @returns {Promise<Array>} Performance summaries per matched account
 */
async function fetchPerformanceForAccounts(accounts) {
  if (!accounts || accounts.length === 0) return [];

  let campaigns;
  try {
    campaigns = await fetchCampaigns();
  } catch (err) {
    console.error("[agencyanalytics] Failed to fetch campaigns:", err.message);
    return [];
  }

  if (!Array.isArray(campaigns)) return [];

  const results = [];

  for (const account of accounts) {
    // Approximate match: case-insensitive includes
    const clientName = (account.client_name || "").toLowerCase();
    const matched = campaigns.find((c) => {
      const company = (c.company || "").toLowerCase();
      return (
        company.includes(clientName) ||
        clientName.includes(company) ||
        levenshteinClose(company, clientName)
      );
    });

    if (!matched) continue;

    try {
      const rankings = await fetchKeywordRankings(matched.id);

      // Summarize: count improved, declined, unchanged
      let improved = 0;
      let declined = 0;
      let unchanged = 0;
      const topChanges = [];

      for (const kw of rankings) {
        const rank = Number(kw.rank) || 0;
        const prev = Number(kw.previous_rank) || 0;
        if (prev === 0 || rank === 0) continue;

        const diff = prev - rank; // positive = improved
        if (diff > 0) improved++;
        else if (diff < 0) declined++;
        else unchanged++;

        if (Math.abs(diff) >= 3) {
          topChanges.push({
            keyword: kw.keyword_phrase,
            rank,
            previous_rank: prev,
            change: diff,
          });
        }
      }

      // Sort by biggest change
      topChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

      results.push({
        account_name: account.name,
        client_name: account.client_name,
        tier: account.tier,
        aa_campaign: matched.company,
        total_keywords: rankings.length,
        improved,
        declined,
        unchanged,
        top_changes: topChanges.slice(0, 5),
      });
    } catch (err) {
      console.error(`[agencyanalytics] Failed rankings for ${matched.company}:`, err.message);
    }
  }

  return results;
}

/**
 * Simple check if two strings are "close enough" (within 3 char edits for short strings).
 */
function levenshteinClose(a, b) {
  if (Math.abs(a.length - b.length) > 3) return false;
  let dist = 0;
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    if (a[i] !== b[i]) dist++;
    if (dist > 3) return false;
  }
  return true;
}

module.exports = { fetchCampaigns, fetchKeywordRankings, fetchPerformanceForAccounts };
