#!/usr/bin/env node
require("dotenv").config();

const supabase = require("../src/db/supabase");
const { fetchTasks } = require("../src/collectors/clickup");
const { fetchEvents } = require("../src/collectors/gcal");
const { fetchPerformanceForAccounts } = require("../src/collectors/agencyanalytics");
const { generateBriefing } = require("../src/collectors/pulse-brain");
const { sendWhatsAppBriefing } = require("../src/collectors/pulse-delivery");

const OWNER_WHATSAPP = "5548991081505";

async function run() {
  console.log("=== Chili Pulse Test Briefing ===\n");

  // Step 1: Create or find Sofia
  console.log("1. Setting up Sofia as team leader...");
  let sofia;

  const { data: existing } = await supabase
    .from("team_leaders")
    .select("*")
    .eq("name", "Sofia")
    .single();

  if (existing) {
    sofia = existing;
    console.log(`   Found existing Sofia: ${sofia.id}`);
  } else {
    const { data: created, error } = await supabase
      .from("team_leaders")
      .insert({
        name: "Sofia",
        email: "diego@chili.pa",
        whatsapp: OWNER_WHATSAPP,
        bu: "INT",
        services: "SEO",
        frequency: "daily",
        channels: "whatsapp",
        clickup_user_id: "42958201",
        active: true,
      })
      .select("*")
      .single();

    if (error) {
      console.error("   Failed to create Sofia:", error.message);
      process.exit(1);
    }
    sofia = created;
    console.log(`   Created Sofia: ${sofia.id}`);
  }

  // Make sure Sofia's WhatsApp points to owner
  if (sofia.whatsapp !== OWNER_WHATSAPP) {
    await supabase
      .from("team_leaders")
      .update({ whatsapp: OWNER_WHATSAPP, channels: "whatsapp" })
      .eq("id", sofia.id);
    sofia.whatsapp = OWNER_WHATSAPP;
    console.log("   Updated Sofia's WhatsApp to owner number");
  }

  // Step 2: Get accounts assigned to Sofia (or assign some)
  console.log("\n2. Checking accounts...");
  let { data: accounts } = await supabase
    .from("accounts")
    .select("*")
    .eq("leader_id", sofia.id)
    .eq("active", true);

  if (!accounts || accounts.length === 0) {
    console.log("   No accounts assigned to Sofia. Assigning first 10 active accounts...");
    const { data: allAccounts } = await supabase
      .from("accounts")
      .select("*")
      .eq("active", true)
      .limit(10);

    if (allAccounts && allAccounts.length > 0) {
      for (const acct of allAccounts) {
        await supabase
          .from("accounts")
          .update({ leader_id: sofia.id })
          .eq("id", acct.id);
      }
      accounts = allAccounts.map((a) => ({ ...a, leader_id: sofia.id }));
      console.log(`   Assigned ${accounts.length} accounts to Sofia`);
    } else {
      console.log("   No active accounts found in DB. Proceeding without accounts.");
      accounts = [];
    }
  } else {
    console.log(`   Sofia has ${accounts.length} accounts assigned`);
  }

  // Step 3: Collect data
  console.log("\n3. Collecting data...");

  const listIds = accounts.map((a) => a.clickup_list_id).filter(Boolean);
  console.log(`   ClickUp lists to query: ${listIds.length}`);

  let tasks = [];
  let events = [];
  let performance = [];

  // ClickUp tasks
  if (listIds.length > 0 && sofia.clickup_user_id) {
    try {
      tasks = await fetchTasks(listIds, sofia.clickup_user_id);
      console.log(`   ClickUp tasks found: ${tasks.length}`);
    } catch (err) {
      console.error(`   ClickUp error: ${err.message}`);
    }
  } else {
    console.log("   Skipping ClickUp (no lists or user ID)");
  }

  // Google Calendar
  if (sofia.email) {
    try {
      events = await fetchEvents(sofia.email);
      console.log(`   Calendar events found: ${events.length}`);
    } catch (err) {
      console.error(`   Calendar error: ${err.message}`);
    }
  }

  // AgencyAnalytics performance
  if (accounts.length > 0) {
    try {
      performance = await fetchPerformanceForAccounts(accounts);
      console.log(`   AA performance results: ${performance.length}`);
    } catch (err) {
      console.error(`   AA error: ${err.message}`);
    }
  }

  // Step 4: Generate briefing via Claude
  console.log("\n4. Generating briefing via Claude...");
  const collectedData = { tasks, events, performance, leader: sofia };

  let briefingText, logId;
  try {
    const result = await generateBriefing(collectedData);
    briefingText = result.text;
    logId = result.logId;
    console.log(`   Briefing generated (${briefingText.length} chars), log ID: ${logId}`);
    console.log("\n--- BRIEFING PREVIEW ---");
    console.log(briefingText);
    console.log("--- END PREVIEW ---\n");
  } catch (err) {
    console.error(`   Claude error: ${err.message}`);
    process.exit(1);
  }

  // Step 5: Send via WhatsApp
  console.log("5. Sending via WhatsApp to", OWNER_WHATSAPP, "...");
  try {
    const sent = await sendWhatsAppBriefing(OWNER_WHATSAPP, briefingText, logId);
    if (sent) {
      console.log("   WhatsApp sent successfully!");
    } else {
      console.log("   WhatsApp send returned false — check logs above");
    }
  } catch (err) {
    console.error(`   WhatsApp error: ${err.message}`);
  }

  console.log("\n=== Done ===");
}

run().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
