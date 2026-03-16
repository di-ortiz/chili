const axios = require("axios");
const supabase = require("../db/supabase");

const WHATSAPP_API_URL = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

/**
 * Send a WhatsApp briefing via Meta Cloud API.
 * Updates briefing_logs.delivered_whatsapp on success.
 *
 * @param {string} whatsappNumber - Recipient phone number (with country code, e.g. "5511999999999")
 * @param {string} briefingText - The briefing content to send
 * @param {string} briefingLogId - The briefing_logs row ID to update on success
 */
async function sendWhatsAppBriefing(whatsappNumber, briefingText, briefingLogId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error("[pulse-delivery] Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
    return false;
  }

  try {
    await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: "whatsapp",
        to: whatsappNumber,
        type: "text",
        text: { body: briefingText },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );

    // Mark as delivered in briefing_logs
    if (briefingLogId) {
      const { error } = await supabase
        .from("briefing_logs")
        .update({ delivered_whatsapp: true })
        .eq("id", briefingLogId);

      if (error) {
        console.error("[pulse-delivery] Failed to update briefing log:", error.message);
      }
    }

    console.log(`[pulse-delivery] WhatsApp sent to ${whatsappNumber}`);
    return true;
  } catch (err) {
    const detail = err.response?.data?.error?.message || err.message;
    console.error(`[pulse-delivery] WhatsApp send failed for ${whatsappNumber}:`, detail);
    return false;
  }
}

module.exports = { sendWhatsAppBriefing };
