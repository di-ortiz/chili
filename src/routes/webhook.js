const express = require("express");
const axios = require("axios");
const { handleIncomingMessage } = require("../sofia/conversation");
const { identifyContact } = require("../sofia/contact-router");

const router = express.Router();

// No-Touch Agency endpoint for client/unknown messages
const NO_TOUCH_WEBHOOK = "https://no-touch-agency-production.up.railway.app/webhook/whatsapp";

/**
 * GET /webhook — Meta webhook verification.
 * Meta sends a challenge to verify the endpoint.
 */
router.get("/", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[webhook] Verification successful");
    return res.status(200).send(challenge);
  }

  console.warn("[webhook] Verification failed — token mismatch");
  return res.sendStatus(403);
});

/**
 * POST /webhook — Receive incoming WhatsApp messages from Meta.
 *
 * Meta sends a payload like:
 * { entry: [{ changes: [{ value: { messages: [{ from, text, id }] } }] }] }
 */
router.post("/", async (req, res) => {
  // Always respond 200 quickly — Meta retries if we're slow
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages) return; // Not a message event (could be status update)

    for (const message of value.messages) {
      const senderNumber = message.from; // e.g. "5511999999999"

      // Identify contact to decide routing
      const contact = await identifyContact(senderNumber);
      const role = contact?.role || "unknown";

      console.log(`[webhook] Incoming from ${senderNumber} (role: ${role})`);

      if (role === "leader") {
        // Leaders → handle here in Chili Pulse (ClickUp, briefings, backend)
        if (message.type !== "text") {
          console.log(`[webhook] Ignoring non-text message type: ${message.type}`);
          continue;
        }

        const messageText = message.text?.body;
        const waMessageId = message.id;
        if (!messageText) continue;

        console.log(`[webhook] Processing leader message: ${messageText.slice(0, 100)}`);

        processAndReply(senderNumber, messageText, waMessageId).catch((err) => {
          console.error(`[webhook] Failed to process message from ${senderNumber}:`, err.message);
        });
      } else {
        // Clients & unknown → forward to No-Touch Agency
        console.log(`[webhook] Forwarding ${role} message to No-Touch Agency`);

        forwardToNoTouch(req.body).catch((err) => {
          console.error(`[webhook] Failed to forward to No-Touch Agency:`, err.message);
        });
        break; // Full payload forwarded, no need to iterate further
      }
    }
  } catch (err) {
    console.error("[webhook] Error processing webhook:", err.message);
  }
});

/**
 * Process an incoming message and send the reply back via WhatsApp.
 */
async function processAndReply(senderNumber, messageText, waMessageId) {
  // Mark as read
  await markAsRead(waMessageId);

  // Get Sofia's response (may take a few seconds due to tool calls)
  const responseText = await handleIncomingMessage(senderNumber, messageText, waMessageId);

  if (!responseText) return;

  // Send reply via WhatsApp
  const { sendWhatsAppBriefing } = require("../collectors/pulse-delivery");
  await sendWhatsAppBriefing(senderNumber, responseText);
}

/**
 * Send a "read" receipt so the user sees blue checkmarks.
 */
async function markAsRead(waMessageId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) return;

  try {
    await axios.post(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: waMessageId,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (err) {
    // Non-critical, don't fail
    console.warn("[webhook] Failed to mark as read:", err.message);
  }
}

/**
 * Forward the raw webhook payload to No-Touch Agency for client-facing handling.
 */
async function forwardToNoTouch(payload) {
  try {
    await axios.post(NO_TOUCH_WEBHOOK, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });
    console.log("[webhook] Successfully forwarded to No-Touch Agency");
  } catch (err) {
    console.error("[webhook] No-Touch Agency forward failed:", err.message);
  }
}

module.exports = router;
