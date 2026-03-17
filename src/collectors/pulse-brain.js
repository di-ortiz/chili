const Anthropic = require("@anthropic-ai/sdk");
const supabase = require("../db/supabase");

const client = new Anthropic();

const MORNING_SYSTEM_PROMPT = `You are Sofia, the AI briefing assistant for Chili Digital. You send daily morning WhatsApp briefings to team leaders with actionable intelligence about their accounts.

Write in the leader's language based on their BU: BR = Portuguese, PA_MX = Spanish, INT = English. If BU contains multiple (e.g. "BR,INT,PA_MX"), default to English.

Format for WhatsApp: use *bold* for headers and key numbers, emojis sparingly but effectively. Max 600 words.

Your MORNING briefing MUST follow this exact structure:

1. *PORTFOLIO OVERVIEW*
   - X active accounts on ClickUp vs Y accounts on AgencyAnalytics
   - List accounts missing AA reporting (this is a gap that needs fixing)

2. *TASKS & PRIORITIES*
   - Total open tasks: X | Overdue: Y | Due soon: Z
   - Group by tier priority (honeymoon first, then escalation, enterprise, SMB)
   - For each tier with issues, list the overdue/urgent tasks with client name and who is assigned
   - Be specific: "OVERDUE: [Task Name] for [Client] - due [date] - assigned to [person]"

3. *CONTRACTUAL DELIVERABLES*
   - Flag missing or potentially late contractual tasks
   - Compare what exists in ClickUp vs what the contract requires
   - Prioritize honeymoon accounts (they need onboarding tasks completed)
   - Call out recurring tasks that may be missing (monthly reports, biweekly meetings, etc.)

4. *WEEK CALENDAR*
   - Summarize meetings for each day this week
   - Highlight client-facing meetings vs internal meetings
   - Flag days that are overbooked or have no client meetings

5. *PERFORMANCE & RED FLAGS*
   - Accounts with keyword ranking drops (flag for attention)
   - Accounts with 0 keywords tracked (reporting gap)
   - Accounts with improvements (celebrate wins briefly)
   - Any signs of underperformance that need optimization
   - Missing reporting: accounts without AA campaigns

6. *TOP 3 ACTIONS FOR TODAY*
   - Based on everything above, give 3 specific, prioritized actions
   - Action 1 should always be the most urgent (overdue honeymoon/escalation task, or critical red flag)

Be direct, not verbose. Every sentence should be actionable or informative. No fluff.`;

const EVENING_SYSTEM_PROMPT = `You are Sofia, the AI briefing assistant for Chili Digital. You send daily evening WhatsApp briefings summarizing what was accomplished during the day.

Write in the leader's language based on their BU: BR = Portuguese, PA_MX = Spanish, INT = English. If BU contains multiple (e.g. "BR,INT,PA_MX"), default to English.

Format for WhatsApp: use *bold* for headers and key numbers, emojis sparingly but effectively. Max 400 words.

Your EVENING briefing MUST follow this exact structure:

1. *DAY RECAP*
   - Tasks completed today vs tasks that were open this morning
   - Highlight who completed what (by assignee)
   - Flag tasks that were overdue this morning and are STILL overdue

2. *PROGRESS SCORE*
   - Give a simple score: X tasks completed out of Y that were due/overdue
   - Call out wins (completed on time) and concerns (still pending)

3. *STILL PENDING*
   - List remaining overdue tasks with owner and client
   - These carry over to tomorrow's morning briefing

4. *TOMORROW'S PRIORITIES*
   - Based on what's still pending + what's coming due tomorrow
   - Flag any meetings scheduled for tomorrow

Be concise and celebratory where earned, direct about what fell behind.`;

function buildUserPrompt({ leader, tasks, taskSummary, events, performance, coverageGap, contractualFlags, accounts }) {
  const tierOrder = ["honeymoon", "escalation", "enterprise", "smb"];
  let taskDetails = "";
  if (taskSummary) {
    taskDetails = `TASK SUMMARY:
- Total open tasks: ${taskSummary.totalOpen}
- Total overdue: ${taskSummary.totalOverdue}
- Total due in next 3 days: ${taskSummary.totalDueSoon}

TASKS BY TIER PRIORITY:\n`;
    for (const tier of tierOrder) {
      const group = taskSummary.byTier[tier];
      if (!group) continue;
      const overdueList = group.overdue
        .map((t) => `  OVERDUE: ${t.name} | Due: ${t.due_date} | Priority: ${t.priority} | Client: ${t.list_name} | Assigned: ${(t.assignees || []).join(", ") || "unassigned"} | ${t.url}`)
        .join("\n");
      const dueSoonList = group.dueSoon
        .map((t) => `  DUE SOON: ${t.name} | Due: ${t.due_date} | Priority: ${t.priority} | Client: ${t.list_name} | Assigned: ${(t.assignees || []).join(", ") || "unassigned"} | ${t.url}`)
        .join("\n");
      if (overdueList || dueSoonList) {
        taskDetails += `\n[${tier.toUpperCase()}]\n${overdueList}\n${dueSoonList}\n`;
      }
    }
    if (taskSummary.totalOverdue === 0 && taskSummary.totalDueSoon === 0) {
      taskDetails += "No overdue or urgent tasks across any tier.\n";
    }
  }

  let coverageDetails = "COVERAGE GAP DATA NOT AVAILABLE";
  if (coverageGap) {
    coverageDetails = `PORTFOLIO COVERAGE:
- Active accounts on ClickUp: ${coverageGap.totalAccounts}
- Active campaigns on AgencyAnalytics: ${coverageGap.totalAA}
- Matched (ClickUp ↔ AA): ${coverageGap.covered.length}
- MISSING AA reporting: ${coverageGap.uncovered.length}`;
    if (coverageGap.uncovered.length > 0) {
      coverageDetails += `\n\nAccounts WITHOUT AgencyAnalytics:\n${coverageGap.uncovered
        .map((u) => `  - ${u.account} (${u.service || "unknown"}, ${u.tier || "unknown"})`)
        .join("\n")}`;
    }
  }

  let eventDetails = "No calendar data available.";
  if (events && events.length > 0) {
    const byDay = {};
    for (const e of events) {
      const day = e.start ? e.start.split("T")[0] : "unknown";
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(e);
    }
    eventDetails = "WEEKLY CALENDAR:\n";
    for (const [day, dayEvents] of Object.entries(byDay).sort()) {
      eventDetails += `\n${day}:\n`;
      for (const e of dayEvents) {
        const time = e.start ? e.start.split("T")[1]?.slice(0, 5) : "";
        eventDetails += `  - ${time} ${e.title} | Attendees: ${e.attendees.join(", ")} ${e.meet_link ? `| Meet: ${e.meet_link}` : ""}\n`;
      }
    }
  } else {
    eventDetails = "WEEKLY CALENDAR:\nNo meetings scheduled this week.";
  }

  let perfDetails = "No performance data available.";
  if (performance && performance.length > 0) {
    perfDetails = "CLIENT PERFORMANCE (AgencyAnalytics):\n" +
      performance
        .map((p) => {
          let summary = `- ${p.client_name} (${p.tier || "unknown"}) | Keywords: ${p.total_keywords} | Improved: ${p.improved} | Declined: ${p.declined} | Unchanged: ${p.unchanged}`;
          if (p.total_keywords === 0) summary += " | ⚠️ NO KEYWORDS TRACKED";
          if (p.top_changes.length > 0) {
            const changes = p.top_changes
              .map((c) => `  "${c.keyword}": ${c.previous_rank} → ${c.rank} (${c.change > 0 ? "+" : ""}${c.change})`)
              .join("\n");
            summary += `\n${changes}`;
          }
          return summary;
        })
        .join("\n");
  }

  let contractDetails = "No contractual compliance data.";
  if (contractualFlags && contractualFlags.length > 0) {
    contractDetails = "CONTRACTUAL COMPLIANCE FLAGS:\n" +
      contractualFlags
        .map((f) => {
          let detail = `- ${f.account} (${f.tier || "unknown"}, ${f.service || "unknown"}) — Missing ${f.missingCount}/${f.totalExpected} recurring deliverables`;
          if (f.topMissing.length > 0) {
            detail += "\n" + f.topMissing
              .map((m) => `  ⚠️ Missing: ${m.task} (${m.frequency}, assigned to ${m.responsible})`)
              .join("\n");
          }
          return detail;
        })
        .join("\n");
  }

  const accountList = (accounts || [])
    .map((a) => `- ${a.client_name || a.name} | Service: ${a.service_type || "unknown"} | Tier: ${a.tier || "unknown"}`)
    .join("\n");

  return `Generate today's briefing for ${leader.name}, ${leader.bu} team leader.

ACCOUNTS:
${accountList}

${coverageDetails}

${taskDetails}

${contractDetails}

${eventDetails}

${perfDetails}

Remember: Prioritize honeymoon and escalation accounts. Be specific about what needs attention today. End with 3 clear actions.`;
}

function buildEveningPrompt({ leader, morningSnapshot, currentData }) {
  const morning = morningSnapshot || {};
  const current = currentData || {};

  const morningOverdue = morning.totalOverdue || 0;
  const morningOpen = morning.totalOpen || 0;
  const currentOverdue = current.taskSummary?.totalOverdue || 0;
  const currentOpen = current.taskSummary?.totalOpen || 0;

  const completed = morningOpen > currentOpen ? morningOpen - currentOpen : 0;
  const resolvedOverdue = morningOverdue > currentOverdue ? morningOverdue - currentOverdue : 0;

  // List still-overdue tasks
  const stillOverdue = (current.tasks?.overdue || [])
    .map((t) => `- ${t.name} | Client: ${t.list_name} | Assigned: ${(t.assignees || []).join(", ") || "unassigned"} | Due: ${t.due_date}`)
    .join("\n") || "None";

  // Tomorrow's events
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const tomorrowEvents = (current.events || [])
    .filter((e) => e.start && e.start.startsWith(tomorrowStr))
    .map((e) => `- ${e.start.split("T")[1]?.slice(0, 5)} ${e.title}`)
    .join("\n") || "No meetings tomorrow";

  // Tasks due tomorrow
  const tomorrowTasks = (current.tasks?.dueSoon || [])
    .filter((t) => t.due_date && t.due_date.startsWith(tomorrowStr))
    .map((t) => `- ${t.name} | Client: ${t.list_name} | Assigned: ${(t.assignees || []).join(", ") || "unassigned"}`)
    .join("\n") || "No tasks due tomorrow";

  return `Generate the EVENING recap for ${leader.name}, ${leader.bu} team leader.

MORNING vs NOW:
- Morning open tasks: ${morningOpen}
- Current open tasks: ${currentOpen}
- Tasks completed today: ${completed}
- Morning overdue: ${morningOverdue}
- Current overdue: ${currentOverdue}
- Overdue tasks resolved: ${resolvedOverdue}

STILL OVERDUE:
${stillOverdue}

TOMORROW'S MEETINGS:
${tomorrowEvents}

TASKS DUE TOMORROW:
${tomorrowTasks}

Be concise. Celebrate completions, flag what's still pending.`;
}

/**
 * Generate a morning briefing for a leader.
 */
async function generateBriefing(collectedData) {
  const userPrompt = buildUserPrompt(collectedData);

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system: MORNING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const briefingText = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  // Log to briefing_logs with morning snapshot for evening comparison
  const snapshot = {
    totalOpen: collectedData.taskSummary?.totalOpen || 0,
    totalOverdue: collectedData.taskSummary?.totalOverdue || 0,
    totalDueSoon: collectedData.taskSummary?.totalDueSoon || 0,
  };

  const { data: logEntry, error } = await supabase
    .from("briefing_logs")
    .insert({
      leader_id: collectedData.leader.id,
      content: briefingText,
      status: "morning",
      morning_snapshot: snapshot,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to log briefing:", error.message);
  }

  return { text: briefingText, logId: logEntry?.id || null };
}

/**
 * Generate an evening briefing comparing morning state vs current state.
 */
async function generateEveningBriefing(collectedData) {
  // Get this morning's snapshot
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: morningLog } = await supabase
    .from("briefing_logs")
    .select("morning_snapshot")
    .eq("leader_id", collectedData.leader.id)
    .eq("status", "morning")
    .gte("generated_at", today.toISOString())
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  const morningSnapshot = morningLog?.morning_snapshot || {
    totalOpen: 0,
    totalOverdue: 0,
    totalDueSoon: 0,
  };

  const userPrompt = buildEveningPrompt({
    leader: collectedData.leader,
    morningSnapshot,
    currentData: collectedData,
  });

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: EVENING_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const briefingText = message.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const { data: logEntry, error } = await supabase
    .from("briefing_logs")
    .insert({
      leader_id: collectedData.leader.id,
      content: briefingText,
      status: "evening",
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to log evening briefing:", error.message);
  }

  return { text: briefingText, logId: logEntry?.id || null };
}

module.exports = { generateBriefing, generateEveningBriefing };
