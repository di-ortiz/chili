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

// Only sync lists from these project folders (active client work)
const PROJECT_FOLDERS = [
  "(Brazil) Projects",
  "(Panama) Projects",
  "(Panama INT) Projects",
  "(Mexico) Projects",
];

// Map folder names to BU codes
function folderToBU(folderName) {
  if (!folderName) return "INT";
  if (folderName.includes("Brazil")) return "BR";
  if (folderName.includes("Panama INT")) return "INT";
  if (folderName.includes("Panama")) return "PA_MX";
  if (folderName.includes("Mexico")) return "PA_MX";
  return "INT";
}

// Extract service type and client name from list name
// e.g. "SEO - Daikin" → { service: "SEO", client: "Daikin" }
// e.g. "PPC - sicoob.com.br" → { service: "PPC", client: "sicoob.com.br" }
function parseListName(name) {
  const prefixes = [
    "SEO/AEO", "SEO", "PPC", "SEM", "SMM", "CRO",
    "BKLinks", "EDM", "LP", "Social", "WEB", "WIKIPEDIA",
    "SEARCH", "PPC SEARCH", "Site",
  ];

  for (const prefix of prefixes) {
    const pattern = new RegExp(`^${prefix.replace("/", "/")}\\s*-\\s*(.+)$`, "i");
    const match = name.match(pattern);
    if (match) {
      const client = match[1].trim();
      // Map service prefix to our service types
      let service = prefix.toUpperCase();
      if (["SEM", "PPC SEARCH", "SEARCH"].includes(service)) service = "PPC";
      if (["SEO/AEO"].includes(service)) service = "SEO";
      if (["BKLINKS", "EDM", "LP", "SOCIAL", "WEB", "SMM", "WIKIPEDIA", "CRO", "SITE"].includes(service)) {
        service = "SEO"; // group ancillary services under SEO
      }
      return { service, client };
    }
  }

  return { service: null, client: name };
}

/**
 * Fetch the full ClickUp workspace structure: teams → spaces → folders → lists.
 */
async function fetchWorkspaceStructure() {
  const client = getClient();

  const { data: teamsData } = await client.get("/team");
  const teams = teamsData.teams || [];

  const allLists = [];
  const allMembers = [];

  for (const team of teams) {
    for (const member of team.members || []) {
      const u = member.user || member;
      allMembers.push({
        id: String(u.id),
        username: u.username,
        email: u.email,
        name: u.username || u.email,
      });
    }

    const { data: spacesData } = await client.get(`/team/${team.id}/space`, {
      params: { archived: false },
    });

    for (const space of spacesData.spaces || []) {
      const { data: foldersData } = await client.get(`/space/${space.id}/folder`, {
        params: { archived: false },
      });

      for (const folder of foldersData.folders || []) {
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

  const uniqueMembers = [...new Map(allMembers.map((m) => [m.id, m])).values()];
  return { lists: allLists, members: uniqueMembers };
}

/**
 * Filter lists to only active client project lists.
 */
function filterProjectLists(lists) {
  return lists.filter((list) => {
    // Must be in a recognized project folder
    if (!list.folder_name) return false;
    if (!PROJECT_FOLDERS.includes(list.folder_name)) return false;
    // Skip generic "List" names with 0 tasks
    if (list.name === "List" && list.task_count === 0) return false;
    return true;
  });
}

/**
 * Sync ClickUp project lists into the accounts table.
 * Only syncs lists from active project folders (Brazil/Panama/INT).
 * Extracts service type (SEO/PPC) and client name from list names.
 */
async function syncClickUpToAccounts() {
  const { lists, members } = await fetchWorkspaceStructure();
  const projectLists = filterProjectLists(lists);

  console.log(`[clickup-sync] Found ${lists.length} total lists, ${projectLists.length} client project lists, ${members.length} members`);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  const synced = [];

  for (const list of projectLists) {
    const { service, client } = parseListName(list.name);
    const bu = folderToBU(list.folder_name);

    // Check if account already exists
    const { data: existing } = await supabase
      .from("accounts")
      .select("id")
      .eq("clickup_list_id", list.clickup_list_id)
      .single();

    const accountData = {
      name: list.name,
      client_name: client,
      clickup_list_id: list.clickup_list_id,
      service_type: service,
      bu,
      active: true,
    };

    if (existing) {
      await supabase
        .from("accounts")
        .update(accountData)
        .eq("id", existing.id);
      updated++;
      synced.push({ ...accountData, action: "updated" });
    } else {
      const { error } = await supabase.from("accounts").insert({
        ...accountData,
        tier: "smb",
        leader_id: null,
      });

      if (error) {
        console.error(`[clickup-sync] Failed to insert ${list.name}:`, error.message);
        skipped++;
      } else {
        created++;
        synced.push({ ...accountData, action: "created" });
      }
    }
  }

  return { total: projectLists.length, created, updated, skipped, members, synced };
}

module.exports = { fetchWorkspaceStructure, syncClickUpToAccounts };
