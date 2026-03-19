const Anthropic = require("@anthropic-ai/sdk");
const { identifyContact, getConversationHistory, saveMessage } = require("./contact-router");
const { TOOL_DEFINITIONS, CLIENT_TOOL_DEFINITIONS, executeTool } = require("./tools");

const client = new Anthropic();

const LEADER_SYSTEM_PROMPT = `You are Sofia, the AI operations assistant for Chili Digital. You are chatting with a team leader via WhatsApp.

YOU HAVE TOOLS. You MUST use them. You have direct access to:
- get_clickup_tasks — fetches real ClickUp tasks. Use it whenever someone asks about tasks, updates, status, workload, or anything ClickUp-related.
- get_accounts — fetches client accounts from the database.
- get_team_leaders — fetches team leader info.
- get_performance — fetches SEO/PPC performance data from AgencyAnalytics.

CRITICAL RULES:
1. ALWAYS call a tool BEFORE responding. Never say "I don't have access" or "I can't" — you DO have access via your tools.
2. When someone asks for a "ClickUp update" or "update on tasks", they want a STATUS REPORT. Call get_clickup_tasks immediately, then summarize the results.
3. NEVER offer options or ask clarifying questions when you can just fetch the data. Just do it.
4. NEVER mention Google Docs, CSV files, or manual workarounds — you fetch live data directly.
5. Format for WhatsApp: use *bold* for headers, keep messages concise.
6. Write in the leader's language: PT for BR, ES for PA_MX, EN for INT.
7. When showing task lists, include: task name, status, due date, assignee, and priority.
8. If a tool returns no data, say so honestly — don't fabricate results.

You know the full internal picture of Chili Digital. You can discuss any account, any team member's tasks, performance across all clients.`;

const CLIENT_SYSTEM_PROMPT = `You are Sofia, the AI assistant for Chama.media. You are chatting with a client via WhatsApp.

You have access ONLY to this client's own data:
- Their campaign performance (keyword rankings, improvements, declines)
- Their project task status (what's being worked on, what's completed)

IMPORTANT RULES:
1. Always USE YOUR TOOLS to fetch real data. NEVER make up data.
2. You can ONLY show this client their own account data. Never reveal other clients, internal team info, or operational details.
3. Be professional, friendly, and concise. Format for WhatsApp.
4. If asked about things outside their account scope, politely explain you can help with their campaign.
5. You can take requests: "I want to change my ad copy", "Can we target new keywords?" — acknowledge and log the request.
6. Language: match the client's language.

You represent Chama.media — a professional AI-powered PPC/SEO agency.`;

const UNKNOWN_SYSTEM_PROMPT = `You are Sofia, a friendly AI assistant. Someone has messaged you on WhatsApp but you don't recognize their number.

Respond warmly and ask if they are:
1. A Chili Digital team member (in which case, ask them to have their admin add their WhatsApp number to the leaders dashboard)
2. A Chama.media client (ask for their company name so you can look them up)

Be brief. One or two sentences max. Match their language if you can detect it.`;

/**
 * Handle an incoming WhatsApp message and generate a response.
 * Uses Claude with tools so Sofia can fetch real data.
 */
async function handleIncomingMessage(senderNumber, messageText, waMessageId) {
  // 1. Identify the sender
  const contact = await identifyContact(senderNumber);
  console.log(`[sofia] Message from ${contact.name || senderNumber} (role: ${contact.role}, id: ${contact.id}, leader_id: ${contact.leader_id || "none"})`);

  // 2. Save inbound message
  if (contact.id) {
    await saveMessage(contact.id, "inbound", messageText, waMessageId);
  }

  // 3. Get conversation history for context
  const history = contact.id ? await getConversationHistory(contact.id, 8) : [];

  // 4. Build messages array with history
  // Filter out poisoned assistant messages that refused to use tools (old bug)
  const TOXIC_PATTERNS = [
    "I don't have direct integration",
    "I don't have access to ClickUp",
    "I can't access ClickUp",
    "Google Doc",
    "Google Docs",
    "formatted document",
    "copy-paste into ClickUp",
  ];
  const messages = [];
  for (const msg of history) {
    // Skip the message we just saved (it's the current one)
    if (msg.wa_message_id === waMessageId) continue;
    // Skip poisoned assistant responses that refused tool use
    if (msg.direction === "outbound" && TOXIC_PATTERNS.some((p) => msg.message.includes(p))) {
      console.log(`[sofia] Skipping poisoned history message: "${msg.message.slice(0, 60)}..."`);
      continue;
    }
    messages.push({
      role: msg.direction === "inbound" ? "user" : "assistant",
      content: msg.message,
    });
  }
  // Add current message
  messages.push({ role: "user", content: messageText });

  // 5. Determine system prompt and tools based on role
  let systemPrompt;
  let tools;
  let toolContext;

  switch (contact.role) {
    case "leader": {
      const leader = contact.team_leaders || {};
      const lang = contact.language === "pt" ? "Portuguese" : contact.language === "es" ? "Spanish" : "English";
      systemPrompt = LEADER_SYSTEM_PROMPT + `\n\nCurrent leader: ${contact.name || leader.name} (${leader.bu || "unknown"} team). Respond in ${lang}.`;
      tools = TOOL_DEFINITIONS;
      toolContext = {
        role: "leader",
        leader_id: contact.leader_id,
        contact_id: contact.id,
      };
      break;
    }
    case "client":
      systemPrompt = CLIENT_SYSTEM_PROMPT + `\n\nClient: ${contact.name || "unknown"} (${contact.client_company || "unknown company"}).`;
      tools = CLIENT_TOOL_DEFINITIONS;
      toolContext = {
        role: "client",
        contact_id: contact.id,
        client_account_ids: contact.client_account_ids || [],
      };
      break;
    default:
      systemPrompt = UNKNOWN_SYSTEM_PROMPT;
      tools = [];
      toolContext = { role: "unknown" };
  }

  // 6. Call Claude with tool-use
  console.log(`[sofia] Calling Claude with ${tools.length} tools, ${messages.length} messages`);
  let response;
  try {
    response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: systemPrompt,
      tools: tools.length > 0 ? tools : undefined,
      messages,
    });
  } catch (err) {
    console.error("[sofia] Claude API error:", err.message);
    return "Sorry, I'm having trouble right now. Please try again in a moment.";
  }

  // 7. Handle tool-use loop (Claude may call tools, we execute them and feed results back)
  let currentMessages = [...messages];
  let currentResponse = response;
  let iterations = 0;
  const MAX_ITERATIONS = 5;

  while (currentResponse.stop_reason === "tool_use" && iterations < MAX_ITERATIONS) {
    iterations++;

    // Collect all tool calls from the response
    const toolUseBlocks = currentResponse.content.filter((b) => b.type === "tool_use");
    const toolResults = [];

    for (const toolUse of toolUseBlocks) {
      console.log(`[sofia] Tool call: ${toolUse.name}(${JSON.stringify(toolUse.input)})`);
      const result = await executeTool(toolUse.name, toolUse.input, toolContext);
      console.log(`[sofia] Tool result: ${JSON.stringify(result).slice(0, 200)}...`);

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(result),
      });
    }

    // Add assistant message with tool calls + user message with results
    currentMessages.push({ role: "assistant", content: currentResponse.content });
    currentMessages.push({ role: "user", content: toolResults });

    // Call Claude again with tool results
    try {
      currentResponse = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2048,
        system: systemPrompt,
        tools: tools.length > 0 ? tools : undefined,
        messages: currentMessages,
      });
    } catch (err) {
      console.error("[sofia] Claude API error in tool loop:", err.message);
      return "I found the data but had trouble formatting it. Please try again.";
    }
  }

  // 8. Extract final text response
  const responseText = currentResponse.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  // 9. Save outbound message
  if (contact.id) {
    await saveMessage(contact.id, "outbound", responseText);
  }

  return responseText;
}

module.exports = { handleIncomingMessage };
