const Anthropic = require("@anthropic-ai/sdk");
const supabase = require("../db/supabase");

const client = new Anthropic();

const SYSTEM_PROMPT = `You are Chili Pulse, the daily briefing assistant for Chili Digital account managers. Be concise, direct, and action-oriented. Write in the leader's language based on their BU: BR = Portuguese, PA_MX = Spanish, INT = English. Format for WhatsApp: use *bold* for urgency, emojis sparingly, max 300 words.`;

function buildUserPrompt({ leader, tasks, events }) {
  const taskSummary =
    tasks.length > 0
      ? tasks
          .map(
            (t) =>
              `- ${t.name} | Due: ${t.due_date} | Priority: ${t.priority} | List: ${t.list_name} | ${t.overdue ? "OVERDUE" : "Due soon"} | ${t.url}`
          )
          .join("\n")
      : "No overdue or urgent tasks.";

  const eventSummary =
    events.length > 0
      ? events
          .map(
            (e) =>
              `- ${e.title} | ${e.start} | Attendees: ${e.attendees.join(", ")} ${e.meet_link ? `| Meet: ${e.meet_link}` : ""}`
          )
          .join("\n")
      : "No meetings today.";

  return `Generate today's briefing for ${leader.name}, ${leader.bu} team leader.

OVERDUE/URGENT TASKS:
${taskSummary}

TODAY'S MEETINGS:
${eventSummary}

Prioritize escalation-tier accounts. End with one clear top action for the day.`;
}

/**
 * Generate a briefing for a leader using Claude and log it to Supabase.
 *
 * @param {{ tasks: Array, events: Array, leader: object }} collectedData
 *   Output from collectDataForLeader()
 * @returns {Promise<string>} The generated briefing text
 */
async function generateBriefing(collectedData) {
  const userPrompt = buildUserPrompt(collectedData);

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const briefingText = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  // Log to briefing_logs
  const { error } = await supabase.from("briefing_logs").insert({
    leader_id: collectedData.leader.id,
    content: briefingText,
    status: "generated",
  });

  if (error) {
    console.error("Failed to log briefing:", error.message);
  }

  return briefingText;
}

module.exports = { generateBriefing };
