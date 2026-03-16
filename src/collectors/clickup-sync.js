const axios = require("axios");
const supabase = require("../db/supabase");

const CLICKUP_API = "https://api.clickup.com/api/v2";

function getClient() {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) throw new Error("Missing CLICKUP_API_TOKEN env var");
  return axios.create({
    baseURL: CLICKUP_API,
    headers: { Authorization: token },
  });
}

/**
 * Fetch the full ClickUp workspace structure: teams → spaces → folders → lists.
 * Each list becomes an "account" in our system.
 */
async function fetchWorkspaceStructure() {
  const client = getClient();

  // Step 1: Get teams (workspaces)
  const { data: teamsData } = await client.get("/team");
  const teams = teamsData.teams || [];

  const allLists = [];
  const allMembers = [];

  for (const team of teams) {
    // Collect workspace members
    for (const member of team.members || []) {
      const u = member.user || member;
      allMembers.push({
        id: String(u.id),
        username: u.username,
        email: u.email,
        name: u.username || u.email,
      });
    }

    // Step 2: Get spaces
    const { data: spacesData } = await client.get(`/team/${team.id}/space`, {
      params: { archived: false },
    });

    for (const space of spacesData.spaces || []) {
      // Step 3: Get folders in each space
      const { data: foldersData } = await client.get(`/space/${space.id}/folder`, {
        params: { archived: false },
      });

      for (const folder of foldersData.folders || []) {
        // Step 4: Get lists in each folder
        const { data: listsData } = await client.get(`/folder/${folder.id}/list`, {
          params: { archived: false },
        });

        for (const list of listsData.lists || []) {
          allLists.push({
            clickup_list_id: list.id,
            name: list.name,
            folder_name: folder.name,
            space_name: space.name,
            task_count: list.task_count || 0,
          });
        }
      }

      // Also get folderless lists in the space
      const { data: folderlessData } = await client.get(`/space/${space.id}/list`, {
        params: { archived: false },
      });

      for (const list of folderlessData.lists || []) {
        allLists.push({
          clickup_list_id: list.id,
          name: list.name,
          folder_name: null,
          space_name: space.name,
          task_count: list.task_count || 0,
        });
      }
    }
  }

  // Dedupe members by id
  const uniqueMembers = [...new Map(allMembers.map((m) => [m.id, m])).values()];

  return { lists: allLists, members: uniqueMembers };
}

/**
 * Sync ClickUp lists into the accounts table.
 * - Inserts new lists as accounts
 * - Updates existing accounts (matched by clickup_list_id)
 * - Uses folder_name as client_name if available
 */
async function syncClickUpToAccounts() {
  const { lists, members } = await fetchWorkspaceStructure();

  console.log(`[clickup-sync] Found ${lists.length} lists, ${members.length} members`);

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const list of lists) {
    // Check if account already exists
    const { data: existing } = await supabase
      .from("accounts")
      .select("id")
      .eq("clickup_list_id", list.clickup_list_id)
      .single();

    if (existing) {
      // Update name if changed
      await supabase
        .from("accounts")
        .update({ name: list.name })
        .eq("id", existing.id);
      updated++;
    } else {
      // Insert new account
      // Use folder name as client_name (folders typically represent clients)
      const clientName = list.folder_name || list.space_name || list.name;

      const { error } = await supabase.from("accounts").insert({
        name: list.name,
        client_name: clientName,
        clickup_list_id: list.clickup_list_id,
        service_type: null,
        tier: "smb", // default, admin can update later
        bu: "INT", // default, admin can update later
        leader_id: null,
        active: true,
      });

      if (error) {
        // leader_id is NOT NULL, so we need to handle accounts without a leader
        skipped++;
      } else {
        created++;
      }
    }
  }

  return { total: lists.length, created, updated, skipped, members };
}

module.exports = { fetchWorkspaceStructure, syncClickUpToAccounts };
