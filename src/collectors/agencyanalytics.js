const axios = require("axios");

const AA_API = "https://apirequest.app/query";

function getApiKey() {
  const apiKey = process.env.AGENCYANALYTICS_API_KEY;
  if (!apiKey) throw new Error("Missing AGENCYANALYTICS_API_KEY env var");
  return apiKey;
}

function getBasicAuth() {
  const encoded = Buffer.from(`:${getApiKey()}`).toString("base64");
  return `Basic ${encoded}`;
}

function getHeaders() {
  return { Authorization: getBasicAuth(), "Content-Type": "application/json" };
}

/**
 * Fetch all campaigns via the AgencyAnalytics query API.
 * Paginates through all results (50 per page).
 */
async function fetchCampaigns() {
  const allCampaigns = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const { data } = await axios.post(
      AA_API,
      {
        provider: "agency-analytics-v2",
        asset: "campaign",
        operation: "read",
        sort: [{ id: "desc" }],
        offset,
        limit,
      },
      { headers: getHeaders() }
    );

    const rows = data?.results?.rows || [];
    allCampaigns.push(...rows);

    const totalRecords = data?.results?.metadata?.total_records || 0;
    console.log(`[agencyanalytics] Fetched ${allCampaigns.length}/${totalRecords} campaigns`);

    if (allCampaigns.length >= totalRecords || rows.length < limit) break;
    offset += limit;
  }

  // Filter to active, real campaigns only
  return allCampaigns.filter((c) => c.status === "active" && c.type === "real");
}

/**
 * Fetch keyword rankings for a specific campaign.
 */
async function fetchKeywordRankings(campaignId) {
  try {
    const { data } = await axios.post(
      AA_API,
      {
        provider: "agency-analytics-v2",
        asset: "keyword",
        operation: "read",
        filter: [{ campaign_id: campaignId }],
        sort: [{ id: "desc" }],
        limit: 200,
      },
      { headers: getHeaders() }
    );
    return data?.results?.rows || [];
  } catch (err) {
    console.log(`[agencyanalytics] keyword rankings failed for campaign ${campaignId}: ${err.response?.status || err.message}`);
    return [];
  }
}

/**
 * Debug endpoint: test API connection and list available assets.
 */
async function debugApiConnection() {
  const results = {};

  const assets = ["campaign", "keyword", "campaign_group", "integration"];
  for (const asset of assets) {
    try {
      const { data, status } = await axios.post(
        AA_API,
        { provider: "agency-analytics-v2", asset, operation: "read", limit: 1 },
        { headers: getHeaders() }
      );
      results[asset] = {
        status,
        success: true,
        total_records: data?.results?.metadata?.total_records,
        sample: data?.results?.rows?.[0] ? Object.keys(data.results.rows[0]) : [],
      };
    } catch (err) {
      results[asset] = {
        error: err.response?.status,
        message: err.response?.data?.results?.messages || err.message,
      };
    }
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
