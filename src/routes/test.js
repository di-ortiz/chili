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

module.exports = router;
