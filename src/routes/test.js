const { Router } = require("express");
const supabase = require("../db/supabase");
const { collectDataForLeader } = require("../collectors/pulse-collector");
const { generateBriefing } = require("../collectors/pulse-brain");
const { sendWhatsAppBriefing } = require("../collectors/pulse-delivery");

const router = Router();

// GET /test/seed-and-send — Creates Diego as a test leader and sends a briefing
router.get("/seed-and-send", async (req, res) => {
  try {
    // Check if Diego already exists
    const { data: existing } = await supabase
      .from("team_leaders")
      .select("*")
      .eq("email", "diego@chili.pa")
      .single();

    let leader = existing;

    if (!leader) {
      const { data, error } = await supabase
        .from("team_leaders")
        .insert({
          name: "Diego",
          email: "diego@chili.pa",
          whatsapp: "5548991081505",
          bu: "INT",
          services: "BOTH",
          frequency: "daily",
          channels: "whatsapp",
        })
        .select()
        .single();

      if (error) return res.status(500).json({ step: "create_leader", error: error.message });
      leader = data;
    }

    // Collect data
    const collectedData = await collectDataForLeader(leader);

    // Generate briefing
    const { text, logId } = await generateBriefing(collectedData);

    // Send via WhatsApp
    let whatsappSent = false;
    if (leader.whatsapp) {
      whatsappSent = await sendWhatsAppBriefing(leader.whatsapp, text, logId);
    }

    res.json({
      leader: { id: leader.id, name: leader.name },
      briefing: text,
      tasks: collectedData.tasks.length,
      events: collectedData.events.length,
      delivered: { whatsapp: whatsappSent },
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// GET /test/sofia — Create Sofia, assign accounts, collect data, generate & send briefing
router.get("/sofia", async (req, res) => {
  try {
    const OWNER_WHATSAPP = "5548991081505";

    // Step 1: Find or create Sofia
    let { data: sofia } = await supabase
      .from("team_leaders")
      .select("*")
      .eq("name", "Sofia")
      .single();

    if (!sofia) {
      // Check if diego@chili.pa already exists (from seed-and-send)
      const { data: diego } = await supabase
        .from("team_leaders")
        .select("*")
        .eq("email", "diego@chili.pa")
        .single();

      if (diego) {
        // Rename existing to Sofia and update fields
        const { data, error } = await supabase
          .from("team_leaders")
          .update({
            name: "Sofia",
            whatsapp: OWNER_WHATSAPP,
            bu: "INT",
            services: "SEO",
            channels: "whatsapp",
            clickup_user_id: "42958201",
            active: true,
          })
          .eq("id", diego.id)
          .select("*")
          .single();

        if (error) return res.status(500).json({ step: "update_to_sofia", error: error.message });
        sofia = data;
      } else {
        const { data, error } = await supabase
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

        if (error) return res.status(500).json({ step: "create_sofia", error: error.message });
        sofia = data;
      }
    }

    // Ensure whatsapp is set to owner
    if (sofia.whatsapp !== OWNER_WHATSAPP) {
      await supabase
        .from("team_leaders")
        .update({ whatsapp: OWNER_WHATSAPP, channels: "whatsapp" })
        .eq("id", sofia.id);
      sofia.whatsapp = OWNER_WHATSAPP;
    }

    // Step 2: Read ALL active accounts (Sofia has visibility into everything, doesn't change ownership)
    const { data: allActive } = await supabase
      .from("accounts")
      .select("*")
      .eq("active", true);

    const accounts = allActive || [];

    // Step 2b: Get all team members' emails for calendar aggregation
    const { data: allLeaders } = await supabase
      .from("team_leaders")
      .select("email")
      .eq("active", true);

    const calendarEmails = (allLeaders || [])
      .map((l) => l.email)
      .filter((e) => e && e.endsWith("@chili.pa"));

    // Attach calendar emails to sofia for the collector
    sofia.calendar_emails = calendarEmails;

    // Step 3: Collect data (pass all accounts without changing ownership)
    const collectedData = await collectDataForLeader(sofia, { accounts });

    // Step 4: Generate briefing
    const { text, logId } = await generateBriefing(collectedData);

    // Step 5: Send via WhatsApp
    let whatsappSent = false;
    if (sofia.whatsapp) {
      whatsappSent = await sendWhatsAppBriefing(sofia.whatsapp, text, logId);
    }

    res.json({
      leader: { id: sofia.id, name: sofia.name, whatsapp: sofia.whatsapp },
      accounts_count: accounts ? accounts.length : 0,
      data_collected: {
        tasks_open: collectedData.taskSummary?.totalOpen || 0,
        tasks_overdue: collectedData.taskSummary?.totalOverdue || 0,
        tasks_due_soon: collectedData.taskSummary?.totalDueSoon || 0,
        events: collectedData.events.length,
        performance: collectedData.performance.length,
        coverage_gap: collectedData.coverageGap,
        contractual_flags: collectedData.contractualFlags?.length || 0,
      },
      briefing: text,
      delivered: { whatsapp: whatsappSent },
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

module.exports = router;
