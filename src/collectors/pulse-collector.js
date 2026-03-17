const supabase = require("../db/supabase");
const { fetchTasks } = require("./clickup");
const { fetchEvents } = require("./gcal");
const { fetchPerformanceForAccounts, fetchCampaigns } = require("./agencyanalytics");
const { SEO_TASKS, PPC_TASKS } = require("../config/contractual-tasks");

/**
 * Collect all briefing data for a given leader.
 * Returns enriched data: tasks, events, performance, coverage gap, contractual compliance.
 *
 * @param {object} leader - A team_leaders row
 * @param {object} [options]
 * @param {Array}  [options.accounts] - Override accounts (e.g. pass all accounts for Sofia)
 */
async function collectDataForLeader(leader, options = {}) {
  let accounts;

  if (options.accounts) {
    // Use provided accounts (Sofia mode: read-only view of all accounts)
    accounts = options.accounts;
  } else {
    // Normal mode: fetch leader's own accounts
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .eq("leader_id", leader.id)
      .eq("active", true);
    if (error) throw new Error(`Failed to fetch accounts: ${error.message}`);
    accounts = data;
  }

  const listIds = accounts.map((a) => a.clickup_list_id).filter(Boolean);

  // Determine which emails to fetch calendars for
  const calendarEmails = leader.calendar_emails
    ? leader.calendar_emails
    : leader.email
      ? [leader.email]
      : [];

  // Fetch all data sources in parallel, each with graceful error handling
  const [allTasks, events, performance, aaCampaigns] = await Promise.all([
    listIds.length > 0
      ? fetchAllTasks(listIds).catch((err) => {
          console.error(`[pulse-collector] ClickUp error: ${err.message}`);
          return { overdue: [], dueSoon: [], allOpen: [] };
        })
      : { overdue: [], dueSoon: [], allOpen: [] },
    calendarEmails.length > 0
      ? fetchAllCalendars(calendarEmails).catch((err) => {
          console.error(`[pulse-collector] Calendar error: ${err.message}`);
          return [];
        })
      : [],
    process.env.AGENCYANALYTICS_API_KEY
      ? fetchPerformanceForAccounts(accounts).catch((err) => {
          console.error(`[pulse-collector] AA error: ${err.message}`);
          return [];
        })
      : [],
    process.env.AGENCYANALYTICS_API_KEY
      ? fetchCampaigns().catch((err) => {
          console.error(`[pulse-collector] AA campaigns error: ${err.message}`);
          return [];
        })
      : [],
  ]);

  // Build coverage gap: ClickUp accounts vs AA campaigns
  const coverageGap = buildCoverageGap(accounts, aaCampaigns);

  // Build task summary with tier-based prioritization
  const taskSummary = buildTaskSummary(allTasks, accounts);

  // Check contractual compliance
  const contractualFlags = checkContractualCompliance(allTasks.allOpen, accounts);

  return {
    tasks: allTasks,
    taskSummary,
    events,
    performance,
    coverageGap,
    contractualFlags,
    leader,
    accounts,
  };
}

/**
 * Fetch calendar events from multiple @chili.pa emails, deduplicated.
 */
async function fetchAllCalendars(emails) {
  const allEvents = [];
  const seenIds = new Set();

  for (const email of emails) {
    try {
      const events = await fetchEvents(email);
      for (const event of events) {
        if (!seenIds.has(event.id)) {
          seenIds.add(event.id);
          allEvents.push(event);
        }
      }
    } catch (err) {
      console.error(`[pulse-collector] Calendar error for ${email}: ${err.message}`);
    }
  }

  // Sort by start time
  allEvents.sort((a, b) => new Date(a.start) - new Date(b.start));
  return allEvents;
}

/**
 * Fetch ALL open tasks (not just overdue) for richer analysis.
 */
async function fetchAllTasks(listIds) {
  const axios = require("axios");
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) return { overdue: [], dueSoon: [], allOpen: [] };

  const client = axios.create({
    baseURL: "https://api.clickup.com/api/v2",
    headers: { Authorization: token },
  });

  const now = Date.now();
  const threeDaysFromNow = now + 3 * 24 * 60 * 60 * 1000;
  const allOpen = [];

  for (const listId of listIds) {
    try {
      const { data } = await client.get(`/list/${listId}/task`, {
        params: {
          statuses: [],
          include_closed: false,
          subtasks: true,
        },
      });

      const tasks = (data.tasks || [])
        .filter((task) => {
          const status = task.status?.status?.toLowerCase();
          return status !== "complete" && status !== "closed";
        })
        .map((task) => ({
          id: task.id,
          name: task.name,
          due_date: task.due_date ? new Date(Number(task.due_date)).toISOString() : null,
          overdue: task.due_date ? Number(task.due_date) < now : false,
          due_soon: task.due_date
            ? Number(task.due_date) >= now && Number(task.due_date) <= threeDaysFromNow
            : false,
          priority: task.priority?.priority || "none",
          status: task.status?.status || "unknown",
          list_name: task.list?.name || null,
          assignees: (task.assignees || []).map((a) => a.username || a.email || "unassigned"),
          url: task.url,
        }));

      allOpen.push(...tasks);
    } catch (err) {
      console.error(`[pulse-collector] Failed to fetch tasks for list ${listId}: ${err.message}`);
    }
  }

  const overdue = allOpen.filter((t) => t.overdue);
  const dueSoon = allOpen.filter((t) => t.due_soon && !t.overdue);

  // Sort: overdue first by due date, then due soon
  overdue.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  dueSoon.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  return { overdue, dueSoon, allOpen };
}

/**
 * Build task summary with tier-based prioritization.
 */
function buildTaskSummary(tasks, accounts) {
  const tierOrder = ["honeymoon", "escalation", "enterprise", "smb"];
  const accountTierMap = {};
  for (const acct of accounts) {
    if (acct.name) accountTierMap[acct.name.toLowerCase()] = acct.tier || "smb";
    if (acct.client_name) accountTierMap[acct.client_name.toLowerCase()] = acct.tier || "smb";
  }

  // Try to match tasks to accounts by list_name
  function getTier(task) {
    if (!task.list_name) return "smb";
    const listName = task.list_name.toLowerCase();
    for (const [name, tier] of Object.entries(accountTierMap)) {
      if (listName.includes(name) || name.includes(listName)) return tier;
    }
    return "smb";
  }

  // Group overdue and due-soon by tier
  const prioritized = {};
  for (const tier of tierOrder) {
    prioritized[tier] = {
      overdue: tasks.overdue.filter((t) => getTier(t) === tier),
      dueSoon: tasks.dueSoon.filter((t) => getTier(t) === tier),
    };
  }

  return {
    totalOpen: tasks.allOpen.length,
    totalOverdue: tasks.overdue.length,
    totalDueSoon: tasks.dueSoon.length,
    byTier: prioritized,
  };
}

/**
 * Compare ClickUp accounts vs AA campaigns to find gaps.
 */
function buildCoverageGap(accounts, aaCampaigns) {
  if (!Array.isArray(aaCampaigns)) return { covered: [], uncovered: [], totalAccounts: accounts.length, totalAA: 0 };

  const campaignNames = aaCampaigns.map((c) => ({
    name: (c.company || "").toLowerCase(),
    original: c.company,
  }));

  const covered = [];
  const uncovered = [];

  for (const account of accounts) {
    const clientName = (account.client_name || account.name || "").toLowerCase();
    const match = campaignNames.find(
      (c) => c.name.includes(clientName) || clientName.includes(c.name)
    );

    if (match) {
      covered.push({ account: account.client_name || account.name, aa_campaign: match.original });
    } else {
      uncovered.push({ account: account.client_name || account.name, service: account.service_type, tier: account.tier });
    }
  }

  return {
    totalAccounts: accounts.length,
    totalAA: aaCampaigns.length,
    covered,
    uncovered,
  };
}

/**
 * Check contractual compliance: which recurring deliverables might be missing.
 * Compares ClickUp task names against expected contractual tasks for each account's service type.
 */
function checkContractualCompliance(allOpenTasks, accounts) {
  const taskNames = allOpenTasks.map((t) => t.name.toLowerCase());

  const flags = [];

  for (const account of accounts) {
    const serviceType = (account.service_type || "").toUpperCase();
    const contractualTasks = serviceType.includes("PPC") ? PPC_TASKS : SEO_TASKS;
    const accountName = account.client_name || account.name || "";

    // Check recurring tasks (monthly, biweekly, quarterly) — these should always have open instances
    const recurringTasks = contractualTasks.filter((ct) =>
      ["monthly", "biweekly", "quarterly"].includes(ct.frequency)
    );

    const missing = [];
    for (const ct of recurringTasks) {
      const found = taskNames.some((tn) => {
        const ctLower = ct.task.toLowerCase();
        // Fuzzy match: task name contains the contractual task name or vice versa
        return tn.includes(ctLower) || ctLower.includes(tn);
      });
      if (!found) {
        missing.push({ task: ct.task, frequency: ct.frequency, responsible: ct.responsible });
      }
    }

    if (missing.length > 0) {
      flags.push({
        account: accountName,
        tier: account.tier,
        service: serviceType,
        missingCount: missing.length,
        totalExpected: recurringTasks.length,
        // Only include top 5 most critical missing tasks
        topMissing: missing.slice(0, 5),
      });
    }
  }

  // Sort by tier priority: honeymoon > escalation > enterprise > smb
  const tierWeight = { honeymoon: 0, escalation: 1, enterprise: 2, smb: 3 };
  flags.sort((a, b) => (tierWeight[a.tier] || 3) - (tierWeight[b.tier] || 3));

  return flags;
}

module.exports = { collectDataForLeader };
