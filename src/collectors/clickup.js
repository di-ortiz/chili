const axios = require("axios");

const CLICKUP_API = "https://api.clickup.com/api/v2";
const token = process.env.CLICKUP_API_TOKEN;

function getClient() {
  if (!token) throw new Error("Missing CLICKUP_API_TOKEN env var");
  return axios.create({
    baseURL: CLICKUP_API,
    headers: { Authorization: token },
  });
}

/**
 * Fetch overdue or due-soon tasks for a leader from given ClickUp list IDs.
 * @param {string[]} listIds - ClickUp list IDs to query
 * @param {string} clickupUserId - The leader's ClickUp user ID
 * @returns {Promise<Array>} Filtered tasks
 */
async function fetchTasks(listIds, clickupUserId) {
  const client = getClient();
  const now = Date.now();
  const threeDaysFromNow = now + 3 * 24 * 60 * 60 * 1000;

  const allTasks = [];

  for (const listId of listIds) {
    const { data } = await client.get(`/list/${listId}/task`, {
      params: {
        assignees: [clickupUserId],
        statuses: [],
        include_closed: false,
        subtasks: true,
      },
    });

    const tasks = (data.tasks || [])
      .filter((task) => {
        const status = task.status?.status?.toLowerCase();
        if (status === "complete" || status === "closed") return false;

        const dueDate = task.due_date ? Number(task.due_date) : null;
        if (!dueDate) return false;

        // Overdue OR due within 3 days
        return dueDate <= threeDaysFromNow;
      })
      .map((task) => ({
        id: task.id,
        name: task.name,
        due_date: task.due_date ? new Date(Number(task.due_date)).toISOString() : null,
        overdue: task.due_date ? Number(task.due_date) < now : false,
        priority: task.priority?.priority || "none",
        list_name: task.list?.name || null,
        url: task.url,
      }));

    allTasks.push(...tasks);
  }

  // Sort: overdue first, then by due date ascending
  allTasks.sort((a, b) => {
    if (a.overdue && !b.overdue) return -1;
    if (!a.overdue && b.overdue) return 1;
    return new Date(a.due_date) - new Date(b.due_date);
  });

  return allTasks;
}

module.exports = { fetchTasks };
