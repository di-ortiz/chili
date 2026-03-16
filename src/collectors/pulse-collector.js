const supabase = require("../db/supabase");
const { fetchTasks } = require("./clickup");
const { fetchEvents } = require("./gcal");

/**
 * Collect all briefing data for a given leader.
 *
 * @param {object} leader - A team_leaders row (must include id, email, clickup_user_id)
 * @returns {Promise<{ tasks: Array, events: Array, leader: object }>}
 */
async function collectDataForLeader(leader) {
  // Get the leader's active accounts to find ClickUp list IDs
  const { data: accounts, error } = await supabase
    .from("accounts")
    .select("clickup_list_id")
    .eq("leader_id", leader.id)
    .eq("active", true);

  if (error) throw new Error(`Failed to fetch accounts: ${error.message}`);

  const listIds = accounts
    .map((a) => a.clickup_list_id)
    .filter(Boolean);

  // Fetch ClickUp tasks and Google Calendar events in parallel
  const [tasks, events] = await Promise.all([
    listIds.length > 0 && leader.clickup_user_id
      ? fetchTasks(listIds, leader.clickup_user_id)
      : Promise.resolve([]),
    leader.email
      ? fetchEvents(leader.email)
      : Promise.resolve([]),
  ]);

  return { tasks, events, leader };
}

module.exports = { collectDataForLeader };
