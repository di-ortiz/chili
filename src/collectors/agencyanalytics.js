const axios = require("axios");

// Try both the new API and legacy v3
const AA_NEW_API = "https://apirequest.app/query";
const AA_V3_API = "https://api.clientseoreport.com/v3";

function getApiKey() {
  const apiKey = process.env.AGENCYANALYTICS_API_KEY;
  if (!apiKey) throw new Error("Missing AGENCYANALYTICS_API_KEY env var");
  return apiKey;
}

function getBasicAuth() {
  const encoded = Buffer.from(`:${getApiKey()}`).toString("base64");
  return `Basic ${encoded}`;
}

/**
 * Try the legacy v3 REST API first, fall back to new query API.
 */
async function fetchCampaigns() {
  // Try v3 API first: GET /campaigns
  try {
    const { data } = await axios.get(`${AA_V3_API}/campaigns`, {
      headers: { Authorization: getBasicAuth() },
    });
    const campaigns = data.data || data.campaigns || data || [];
    if (Array.isArray(campaigns) && campaigns.length > 0) {
      console.log(`[agencyanalytics] v3 API returned ${campaigns.length} campaigns`);
      return campaigns;
    }
  } catch (err) {
    console.log(`[agencyanalytics] v3 API failed: ${err.response?.status || err.message}`);
  }

  // Try new query API
  try {
    const { data } = await axios.post(
      AA_NEW_API,
      { asset: "campaign" },
      { headers: { Authorization: getBasicAuth(), "Content-Type": "application/json" } }
    );
    const campaigns = data.data || data || [];
    if (Array.isArray(campaigns)) {
      console.log(`[agencyanalytics] New API returned ${campaigns.length} campaigns`);
      return campaigns;
    }
  } catch (err) {
    console.log(`[agencyanalytics] New API failed: ${err.response?.status || err.message}`);
  }

  // Try new API with different body formats
  const formats = [
    { query: "campaign" },
    { model: "campaign" },
    { type: "campaign", action: "list" },
  ];

  for (const body of formats) {
    try {
      const { data } = await axios.post(AA_NEW_API, body, {
        headers: { Authorization: getBasicAuth(), "Content-Type": "application/json" },
      });
      const campaigns = data.data || data || [];
      if (Array.isArray(campaigns) && campaigns.length > 0) {
        console.log(`[agencyanalytics] Format ${JSON.stringify(body)} worked: ${campaigns.length} campaigns`);
        return campaigns;
      }
    } catch (err) {
      // continue trying
    }
  }

  throw new Error("All AgencyAnalytics API formats failed. Check your API key and plan.");
}

/**
 * Fetch keyword rankings for a specific campaign.
 */
async function fetchKeywordRankings(campaignId) {
  // Try v3 first
  try {
    const { data } = await axios.get(`${AA_V3_API}/campaigns/${campaignId}/keyword-rankings`, {
      headers: { Authorization: getBasicAuth() },
    });
    return data.data || data || [];
  } catch (err) {
    console.log(`[agencyanalytics] v3 keyword-rankings failed: ${err.response?.status}`);
  }

  // Try new API
  try {
    const { data } = await axios.post(
      AA_NEW_API,
      { asset: "keyword-rankings", filters: { campaign_id: campaignId } },
      { headers: { Authorization: getBasicAuth(), "Content-Type": "application/json" } }
    );
    return data.data || data || [];
  } catch (err) {
    console.log(`[agencyanalytics] New API keyword-rankings failed: ${err.response?.status}`);
    return [];
  }
}

/**
 * Debug endpoint: try all API formats and return what works.
 */
async function debugApiConnection() {
  const results = {};

  // v3 campaigns
  try {
    const { data, status } = await axios.get(`${AA_V3_API}/campaigns`, {
      headers: { Authorization: getBasicAuth() },
    });
    results.v3_campaigns = { status, count: (data.data || data || []).length, sample: (data.data || data || []).slice(0, 2) };
  } catch (err) {
    results.v3_campaigns = { error: err.response?.status, message: err.response?.data || err.message };
  }

  // New API - asset format
  try {
    const { data, status } = await axios.post(
      AA_NEW_API,
      { asset: "campaign" },
      { headers: { Authorization: getBasicAuth(), "Content-Type": "application/json" } }
    );
    results.new_api_asset = { status, data: typeof data === "object" ? data : "non-object" };
  } catch (err) {
    results.new_api_asset = { error: err.response?.status, message: err.response?.data || err.message };
  }

  // New API - with fields
  try {
    const { data, status } = await axios.post(
      AA_NEW_API,
      { asset: "campaign", fields: ["id", "company", "url"] },
      { headers: { Authorization: getBasicAuth(), "Content-Type": "application/json" } }
    );
    results.new_api_with_fields = { status, data: typeof data === "object" ? data : "non-object" };
  } catch (err) {
    results.new_api_with_fields = { error: err.response?.status, message: err.response?.data || err.message };
  }

  return results;
}

/**
 * Match accounts to AA campaigns and fetch performance data.
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
    const clientName = (account.client_name || "").toLowerCase();
    const matched = campaigns.find((c) => {
      const company = (c.company || "").toLowerCase();
      return company.includes(clientName) || clientName.includes(company);
    });

    if (!matched) continue;

    try {
      const rankings = await fetchKeywordRankings(matched.id);

      let improved = 0;
      let declined = 0;
      let unchanged = 0;
      const topChanges = [];

      for (const kw of rankings) {
        const rank = Number(kw.rank) || 0;
        const prev = Number(kw.previous_rank) || 0;
        if (prev === 0 || rank === 0) continue;

        const diff = prev - rank;
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

module.exports = { fetchCampaigns, fetchKeywordRankings, fetchPerformanceForAccounts, debugApiConnection };
