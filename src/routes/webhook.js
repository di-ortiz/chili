const express = require("express");
const axios = require("axios");
const { handleIncomingMessage } = require("../sofia/conversation");
const { identifyContact } = require("../sofia/contact-router");

const router = express.Router();

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
 * POST /webhook — Receive forwarded WhatsApp payloads from No-Touch Agency.
 *
 * No-Touch Agency receives the Meta webhook and forwards the raw payload here.
 * We only process messages from team leaders (Sofia); everything else is ignored
 * since No-Touch Agency already handles clients independently.
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
        // Clients & unknown → ignore here, No-Touch Agency handles them
        console.log(`[webhook] Ignoring ${role} message — handled by No-Touch Agency`);
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
 * POST /webhook/owner — Accept forwarded owner messages from No-Touch Agency.
 *
 * No-Touch forwards the owner's WhatsApp messages here so Chili Pulse's Sofia
 * (which has ClickUp, accounts, briefings tools) can handle them.
 * Returns the AI response text for No-Touch to send back via WhatsApp.
 */
router.post("/owner", async (req, res) => {
  // Simple shared-secret auth so only No-Touch can call this
  const secret = process.env.CHILI_PULSE_SECRET;
  if (secret) {
    const provided = req.headers["x-chili-secret"] || req.query.secret;
    if (provided !== secret) {
      return res.status(403).json({ error: "Unauthorized" });
    }
  }

  const { from, body, waMessageId } = req.body;

  if (!from || !body) {
    return res.status(400).json({ error: "Missing 'from' or 'body'" });
  }

  console.log(`[webhook/owner] Owner message forwarded from No-Touch: "${body.slice(0, 100)}"`);

  try {
    const responseText = await handleIncomingMessage(from, body, waMessageId || null);
    return res.json({ reply: responseText || "" });
  } catch (err) {
    console.error("[webhook/owner] Error processing owner message:", err.message);
    return res.status(500).json({ error: "Failed to process message" });
  }
});

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


module.exports = router;
