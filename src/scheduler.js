const cron = require("node-cron");
const supabase = require("./db/supabase");
const { collectDataForLeader } = require("./collectors/pulse-collector");
const { generateBriefing, generateEveningBriefing } = require("./collectors/pulse-brain");
const { sendWhatsAppBriefing } = require("./collectors/pulse-delivery");
const { syncClickUpToAccounts } = require("./collectors/clickup-sync");

/**
 * BU timezone mapping:
 * BR     → America/Sao_Paulo (UTC-3)
 * PA_MX  → America/Panama (UTC-5)
 * INT    → America/New_York (UTC-5/4)
 *
 * Schedule (in UTC):
 *   BR morning:  10:30 UTC = 07:30 BRT
 *   BR evening:  21:30 UTC = 18:30 BRT
 *   PA_MX morning: 12:30 UTC = 07:30 EST
 *   PA_MX evening: 23:30 UTC = 18:30 EST
 *   INT morning: 12:30 UTC = 07:30 EST
 *   INT evening: 23:30 UTC = 18:30 EST
 */

const BU_SCHEDULE = {
  BR: { morningUTC: "30 10", eveningUTC: "30 21" },
  PA_MX: { morningUTC: "30 12", eveningUTC: "30 23" },
  INT: { morningUTC: "30 12", eveningUTC: "30 23" },
};

async function processLeaderMorning(leader) {
  try {
    console.log(`[scheduler] Morning briefing for ${leader.name} (${leader.bu})`);
    const collectedData = await collectDataForLeader(leader);
    const { text, logId } = await generateBriefing(collectedData);

    if (leader.whatsapp && (leader.channels === "whatsapp" || leader.channels?.includes("whatsapp"))) {
      await sendWhatsAppBriefing(leader.whatsapp, text, logId);
    }

    console.log(`[scheduler] Morning done: ${leader.name}`);
  } catch (err) {
    console.error(`[scheduler] Morning failed for ${leader.name}:`, err.message);
  }
}

async function processLeaderEvening(leader) {
  try {
    console.log(`[scheduler] Evening briefing for ${leader.name} (${leader.bu})`);
    const collectedData = await collectDataForLeader(leader);
    const { text, logId } = await generateEveningBriefing(collectedData);

    if (leader.whatsapp && (leader.channels === "whatsapp" || leader.channels?.includes("whatsapp"))) {
      await sendWhatsAppBriefing(leader.whatsapp, text, logId);
    }

    console.log(`[scheduler] Evening done: ${leader.name}`);
  } catch (err) {
    console.error(`[scheduler] Evening failed for ${leader.name}:`, err.message);
  }
}

async function runMorningBriefings(buFilter) {
  const { data: leaders, error } = await supabase
    .from("team_leaders")
    .select("*")
    .eq("active", true);

  if (error) {
    console.error("[scheduler] Failed to fetch leaders:", error.message);
    return;
  }

  // Filter by BU — a leader's BU field can contain multiple BUs (e.g. "BR,INT,PA_MX")
  const filtered = leaders.filter((l) => {
    const leaderBUs = (l.bu || "").split(",").map((b) => b.trim());
    return leaderBUs.includes(buFilter) || leaderBUs.some((b) => b === buFilter);
  });

  console.log(`[scheduler] Morning briefings for BU=${buFilter}: ${filtered.length} leaders`);

  for (const leader of filtered) {
    await processLeaderMorning(leader);
  }
}

async function runEveningBriefings(buFilter) {
  const { data: leaders, error } = await supabase
    .from("team_leaders")
    .select("*")
    .eq("active", true);

  if (error) {
    console.error("[scheduler] Failed to fetch leaders:", error.message);
    return;
  }

  const filtered = leaders.filter((l) => {
    const leaderBUs = (l.bu || "").split(",").map((b) => b.trim());
    return leaderBUs.includes(buFilter) || leaderBUs.some((b) => b === buFilter);
  });

  console.log(`[scheduler] Evening briefings for BU=${buFilter}: ${filtered.length} leaders`);

  for (const leader of filtered) {
    await processLeaderEvening(leader);
  }
}

function start() {
  // Daily ClickUp sync at 09:00 UTC (before any briefings)
  cron.schedule("0 9 * * 1-5", async () => {
    console.log("[scheduler] Daily ClickUp sync started");
    try {
      const result = await syncClickUpToAccounts();
      console.log(`[scheduler] ClickUp sync done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
    } catch (err) {
      console.error("[scheduler] ClickUp sync failed:", err.message);
    }
  });

  // BR Morning: 10:30 UTC (07:30 BRT) Mon-Fri
  cron.schedule("30 10 * * 1-5", () => {
    console.log("[scheduler] BR morning briefings");
    runMorningBriefings("BR");
  });

  // BR Evening: 21:30 UTC (18:30 BRT) Mon-Fri
  cron.schedule("30 21 * * 1-5", () => {
    console.log("[scheduler] BR evening briefings");
    runEveningBriefings("BR");
  });

  // PA_MX Morning: 12:30 UTC (07:30 Panama) Mon-Fri
  cron.schedule("30 12 * * 1-5", () => {
    console.log("[scheduler] PA_MX morning briefings");
    runMorningBriefings("PA_MX");
  });

  // PA_MX Evening: 23:30 UTC (18:30 Panama) Mon-Fri
  cron.schedule("30 23 * * 1-5", () => {
    console.log("[scheduler] PA_MX evening briefings");
    runEveningBriefings("PA_MX");
  });

  // INT Morning: 12:30 UTC (07:30 EST) Mon-Fri
  cron.schedule("30 12 * * 1-5", () => {
    console.log("[scheduler] INT morning briefings");
    runMorningBriefings("INT");
  });

  // INT Evening: 23:30 UTC (18:30 EST) Mon-Fri
  cron.schedule("30 23 * * 1-5", () => {
    console.log("[scheduler] INT evening briefings");
    runEveningBriefings("INT");
  });

  console.log("[scheduler] Cron jobs scheduled:");
  console.log("  ClickUp sync: 09:00 UTC Mon-Fri");
  console.log("  BR morning: 10:30 UTC (07:30 BRT) Mon-Fri");
  console.log("  BR evening: 21:30 UTC (18:30 BRT) Mon-Fri");
  console.log("  PA_MX/INT morning: 12:30 UTC (07:30 EST) Mon-Fri");
  console.log("  PA_MX/INT evening: 23:30 UTC (18:30 EST) Mon-Fri");
}

module.exports = { start, runMorningBriefings, runEveningBriefings, processLeaderMorning, processLeaderEvening };
