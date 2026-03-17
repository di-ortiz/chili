const axios = require("axios");
const supabase = require("../db/supabase");

const WA_MAX_LENGTH = 4000; // WhatsApp limit is 4096, leave margin

function getApiUrl() {
  return `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
}

/**
 * Clean phone number: remove spaces, dashes, plus sign, parentheses.
 */
function cleanNumber(number) {
  return number.replace(/[\s\-\+\(\)]/g, "");
}

/**
 * Split a long message into chunks that fit WhatsApp's limit.
 * Splits at section breaks (---) or newlines to avoid cutting mid-sentence.
 */
function splitMessage(text) {
  if (text.length <= WA_MAX_LENGTH) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= WA_MAX_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Find a good split point (section break or double newline)
    let splitAt = remaining.lastIndexOf("\n---\n", WA_MAX_LENGTH);
    if (splitAt === -1 || splitAt < WA_MAX_LENGTH * 0.3) {
      splitAt = remaining.lastIndexOf("\n\n", WA_MAX_LENGTH);
    }
    if (splitAt === -1 || splitAt < WA_MAX_LENGTH * 0.3) {
      splitAt = remaining.lastIndexOf("\n", WA_MAX_LENGTH);
    }
    if (splitAt === -1) {
      splitAt = WA_MAX_LENGTH;
    }

    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n*-*\n*/, ""); // trim leading breaks
  }

  // Add part indicators if multiple chunks
  if (chunks.length > 1) {
    return chunks.map((chunk, i) => `(${i + 1}/${chunks.length})\n${chunk}`);
  }
  return chunks;
}

/**
 * Send a WhatsApp briefing via Meta Cloud API.
 * Splits long messages automatically. Updates briefing_logs on success.
 */
async function sendWhatsAppBriefing(whatsappNumber, briefingText, briefingLogId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    console.error("[pulse-delivery] Missing WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
    return false;
  }

  const cleanedNumber = cleanNumber(whatsappNumber);
  const chunks = splitMessage(briefingText);

  console.log(`[pulse-delivery] Sending ${chunks.length} message(s) to ${cleanedNumber}`);

  let allSent = true;

  for (let i = 0; i < chunks.length; i++) {
    try {
      const response = await axios.post(
        getApiUrl(),
        {
          messaging_product: "whatsapp",
          to: cleanedNumber,
          type: "text",
          text: { body: chunks[i] },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      const messageId = response.data?.messages?.[0]?.id;
      const contactWaId = response.data?.contacts?.[0]?.wa_id;
      console.log(`[pulse-delivery] Part ${i + 1}/${chunks.length} sent to ${cleanedNumber} | msg_id: ${messageId} | wa_id: ${contactWaId}`);

      // If wa_id doesn't match, the number might be wrong
      if (contactWaId && contactWaId !== cleanedNumber) {
        console.warn(`[pulse-delivery] WARNING: wa_id (${contactWaId}) differs from target (${cleanedNumber})`);
      }

      // Small delay between chunks to maintain order
      if (i < chunks.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err) {
      const detail = err.response?.data || err.message;
      console.error(`[pulse-delivery] Part ${i + 1} FAILED for ${cleanedNumber}:`, JSON.stringify(detail));
      allSent = false;
    }
  }

  // Mark as delivered in briefing_logs
  if (allSent && briefingLogId) {
    const { error } = await supabase
      .from("briefing_logs")
      .update({ delivered_whatsapp: true })
      .eq("id", briefingLogId);

    if (error) {
      console.error("[pulse-delivery] Failed to update briefing log:", error.message);
    }
  }

  return allSent;
}

module.exports = { sendWhatsAppBriefing };
