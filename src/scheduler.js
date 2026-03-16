const cron = require("node-cron");
const supabase = require("./db/supabase");
const { collectDataForLeader } = require("./collectors/pulse-collector");
const { generateBriefing } = require("./collectors/pulse-brain");
const { sendWhatsAppBriefing } = require("./collectors/pulse-delivery");

async function processLeader(leader) {
  try {
    console.log(`[scheduler] Processing ${leader.name} (${leader.bu})`);
    const collectedData = await collectDataForLeader(leader);
    const { text, logId } = await generateBriefing(collectedData);

    if (leader.whatsapp && leader.channels === "whatsapp") {
      await sendWhatsAppBriefing(leader.whatsapp, text, logId);
    }

    console.log(`[scheduler] Done: ${leader.name}`);
  } catch (err) {
    console.error(`[scheduler] Failed for ${leader.name}:`, err.message);
  }
}

async function runBriefings(filter) {
  const { data: leaders, error } = await supabase
    .from("team_leaders")
    .select("*")
    .eq("active", true);

  if (error) {
    console.error("[scheduler] Failed to fetch leaders:", error.message);
    return;
  }

  const filtered = filter ? leaders.filter(filter) : leaders;
  console.log(`[scheduler] Running briefings for ${filtered.length} leaders`);

  for (const leader of filtered) {
    await processLeader(leader);
  }
}

function start() {
  // Daily at 7:30am BRT (10:30 UTC) — for daily leaders
  cron.schedule("30 10 * * *", () => {
    console.log("[scheduler] Daily briefing run started");
    runBriefings((leader) => leader.frequency === "daily");
  });

  // Monday at 7:30am BRT (10:30 UTC) — for weekly leaders
  cron.schedule("30 10 * * 1", () => {
    console.log("[scheduler] Weekly briefing run started");
    runBriefings((leader) => leader.frequency === "weekly");
  });

  console.log("[scheduler] Cron jobs scheduled (daily 10:30 UTC, weekly Mon 10:30 UTC)");
}

module.exports = { start, runBriefings, processLeader };
