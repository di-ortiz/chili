const supabase = require("../db/supabase");
const axios = require("axios");
const { fetchPerformanceForAccounts, fetchCampaigns } = require("../collectors/agencyanalytics");

/**
 * Tool definitions for Claude tool-use.
 * Sofia uses these to fetch real data when answering questions.
 */

const TOOL_DEFINITIONS = [
  {
    name: "get_clickup_tasks",
    description:
      "Fetch tasks from ClickUp for specific accounts or team members. Can filter by assignee name, status, overdue, or list/client name. Returns real task data including name, status, due date, assignees, priority, and URL.",
    input_schema: {
      type: "object",
      properties: {
        assignee_name: {
          type: "string",
          description: "Filter tasks by assignee name (e.g. 'Gabriel', 'Hannah'). Case-insensitive partial match.",
        },
        client_name: {
          type: "string",
          description: "Filter tasks by client/account name (e.g. 'Chili'). Case-insensitive partial match.",
        },
        overdue_only: {
          type: "boolean",
          description: "If true, only return overdue tasks.",
        },
        list_ids: {
          type: "array",
          items: { type: "string" },
          description: "Specific ClickUp list IDs to query. If not provided, queries all accounts for the leader.",
        },
      },
    },
  },
  {
    name: "get_accounts",
    description:
      "Fetch the list of active client accounts from the database. Can filter by leader, BU, tier, or service type.",
    input_schema: {
      type: "object",
      properties: {
        leader_name: {
          type: "string",
          description: "Filter by leader name (partial match).",
        },
        bu: {
          type: "string",
          description: "Filter by business unit: BR, INT, or PA_MX.",
        },
        tier: {
          type: "string",
          description: "Filter by tier: honeymoon, escalation, enterprise, smb.",
        },
      },
    },
  },
  {
    name: "get_team_leaders",
    description: "Fetch the list of active team leaders with their details.",
    input_schema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Filter by leader name (partial match).",
        },
        bu: {
          type: "string",
          description: "Filter by BU.",
        },
      },
    },
  },
  {
    name: "get_performance",
    description:
      "Fetch SEO/PPC performance data from AgencyAnalytics for specific accounts. Returns keyword rankings, changes, improvements and declines.",
    input_schema: {
      type: "object",
      properties: {
        client_name: {
          type: "string",
          description: "Filter by client name (partial match).",
        },
      },
    },
  },
];

// Subset of tools available to clients (they only see their own data)
const CLIENT_TOOL_DEFINITIONS = [
  {
    name: "get_my_performance",
    description: "Fetch SEO/PPC performance data for the client's own campaigns.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_my_tasks",
    description: "Fetch the current task status for the client's project.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
];

/**
 * Execute a tool call and return the result.
 */
async function executeTool(toolName, toolInput, context) {
  switch (toolName) {
    case "get_clickup_tasks":
      return await executeGetClickUpTasks(toolInput, context);
    case "get_accounts":
      return await executeGetAccounts(toolInput, context);
    case "get_team_leaders":
      return await executeGetTeamLeaders(toolInput);
    case "get_performance":
      return await executeGetPerformance(toolInput, context);
    case "get_my_performance":
      return await executeGetClientPerformance(context);
    case "get_my_tasks":
      return await executeGetClientTasks(context);
    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

async function executeGetClickUpTasks(input, context) {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) return { error: "ClickUp API not configured" };

  const client = axios.create({
    baseURL: "https://api.clickup.com/api/v2",
    headers: { Authorization: token },
  });

  // Get list IDs to query
  let listIds = input.list_ids;
  if (!listIds || listIds.length === 0) {
    // Get all account list IDs for this leader (or all if admin)
    let query = supabase.from("accounts").select("clickup_list_id, client_name").eq("active", true);
    if (context.leader_id) {
      query = query.eq("leader_id", context.leader_id);
    }
    const { data: accounts } = await query;
    listIds = (accounts || []).map((a) => a.clickup_list_id).filter(Boolean);
  }

  if (listIds.length === 0) return { tasks: [], message: "No ClickUp lists found for this leader." };

  const now = Date.now();
  const allTasks = [];

  for (const listId of listIds) {
    try {
      const { data } = await client.get(`/list/${listId}/task`, {
        params: { statuses: [], include_closed: false, subtasks: true },
      });

      for (const task of data.tasks || []) {
        const status = task.status?.status?.toLowerCase();
        if (status === "complete" || status === "closed") continue;

        const dueDate = task.due_date ? Number(task.due_date) : null;
        const assignees = (task.assignees || []).map((a) => a.username || a.email || "unknown");

        // Apply filters
        if (input.assignee_name) {
          const filterName = input.assignee_name.toLowerCase();
          const matches = assignees.some((a) => a.toLowerCase().includes(filterName));
          if (!matches) continue;
        }

        if (input.client_name) {
          const filterClient = input.client_name.toLowerCase();
          const listName = (task.list?.name || "").toLowerCase();
          if (!listName.includes(filterClient)) continue;
        }

        if (input.overdue_only && (!dueDate || dueDate >= now)) continue;

        allTasks.push({
          name: task.name,
          status: task.status?.status || "unknown",
          due_date: dueDate ? new Date(dueDate).toISOString().split("T")[0] : null,
          overdue: dueDate ? dueDate < now : false,
          priority: task.priority?.priority || "none",
          assignees,
          client: task.list?.name || "unknown",
          url: task.url,
        });
      }
    } catch (err) {
      console.error(`[sofia-tools] ClickUp list ${listId} error: ${err.message}`);
    }
  }

  // Sort: overdue first, then by due date
  allTasks.sort((a, b) => {
    if (a.overdue && !b.overdue) return -1;
    if (!a.overdue && b.overdue) return 1;
    return new Date(a.due_date || "9999") - new Date(b.due_date || "9999");
  });

  return {
    total: allTasks.length,
    overdue: allTasks.filter((t) => t.overdue).length,
    tasks: allTasks.slice(0, 50), // Cap at 50 for context window
  };
}

async function executeGetAccounts(input, context) {
  let query = supabase.from("accounts").select("*, team_leaders(name, email, bu)").eq("active", true);

  if (input.leader_name) {
    // Need to filter by leader name after fetch (Supabase FK filter limitation)
  }
  if (input.bu) query = query.eq("bu", input.bu);
  if (input.tier) query = query.eq("tier", input.tier);

  // If the context is a leader (not admin), scope to their accounts
  if (context.role === "leader" && context.leader_id) {
    query = query.eq("leader_id", context.leader_id);
  }

  const { data, error } = await query;
  if (error) return { error: error.message };

  let accounts = data || [];

  // Post-filter by leader name if specified
  if (input.leader_name) {
    const filter = input.leader_name.toLowerCase();
    accounts = accounts.filter((a) => a.team_leaders?.name?.toLowerCase().includes(filter));
  }

  return {
    total: accounts.length,
    accounts: accounts.map((a) => ({
      client_name: a.client_name,
      service_type: a.service_type,
      tier: a.tier,
      bu: a.bu,
      leader: a.team_leaders?.name || "unassigned",
      clickup_list_id: a.clickup_list_id,
    })),
  };
}

async function executeGetTeamLeaders(input) {
  let query = supabase.from("team_leaders").select("*").eq("active", true);

  if (input.bu) query = query.eq("bu", input.bu);

  const { data, error } = await query;
  if (error) return { error: error.message };

  let leaders = data || [];

  if (input.name) {
    const filter = input.name.toLowerCase();
    leaders = leaders.filter((l) => l.name.toLowerCase().includes(filter));
  }

  return {
    total: leaders.length,
    leaders: leaders.map((l) => ({
      name: l.name,
      email: l.email,
      bu: l.bu,
      services: l.services,
    })),
  };
}

async function executeGetPerformance(input, context) {
  // Get accounts to check performance for
  let query = supabase.from("accounts").select("*").eq("active", true);

  if (context.role === "leader" && context.leader_id) {
    query = query.eq("leader_id", context.leader_id);
  }

  const { data: accounts } = await query;
  let filtered = accounts || [];

  if (input.client_name) {
    const filter = input.client_name.toLowerCase();
    filtered = filtered.filter((a) => (a.client_name || "").toLowerCase().includes(filter));
  }

  if (filtered.length === 0) return { message: "No matching accounts found." };

  const performance = await fetchPerformanceForAccounts(filtered);
  return { total: performance.length, performance };
}

async function executeGetClientPerformance(context) {
  if (!context.client_account_ids || context.client_account_ids.length === 0) {
    return { message: "No accounts linked to your profile yet. Ask your account manager to set this up." };
  }

  const { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .in("id", context.client_account_ids)
    .eq("active", true);

  if (!accounts || accounts.length === 0) return { message: "No active accounts found." };

  const performance = await fetchPerformanceForAccounts(accounts);
  return { total: performance.length, performance };
}

async function executeGetClientTasks(context) {
  if (!context.client_account_ids || context.client_account_ids.length === 0) {
    return { message: "No accounts linked to your profile yet." };
  }

  const { data: accounts } = await supabase
    .from("accounts")
    .select("clickup_list_id, client_name")
    .in("id", context.client_account_ids)
    .eq("active", true);

  const listIds = (accounts || []).map((a) => a.clickup_list_id).filter(Boolean);
  if (listIds.length === 0) return { message: "No ClickUp projects linked." };

  // Reuse the same executor but with limited scope
  return await executeGetClickUpTasks({ list_ids: listIds }, context);
}

module.exports = { TOOL_DEFINITIONS, CLIENT_TOOL_DEFINITIONS, executeTool };
