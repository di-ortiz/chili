# CLAUDE.md — Chili Pulse

## Project Identity
- **Chili Pulse** is the internal ops & briefing engine for Chili Digital (digital marketing agency)
- Part of the **SOFIA ecosystem**: this repo is the backend brain handling ClickUp tasks, briefings, performance data, and the leader-facing WhatsApp AI assistant
- No-Touch Agency is the sibling project: handles client-facing WhatsApp (onboarding, ads, competitor analysis, image generation)
- No-Touch forwards owner/leader messages to Chili Pulse via `POST /webhook/owner` for ClickUp/ops requests
- Owner phone: ends in `1505` (Diego). Leaders: Hannah (`447393056612`), Sofia/Diego (`554891081505`)

## Stack & Infrastructure
- **Runtime**: Node.js with Express 5
- **AI**: Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) via `@anthropic-ai/sdk` — used for briefings and interactive Sofia
- **Database**: Supabase (PostgreSQL) — tables: `team_leaders`, `accounts`, `briefing_logs`, `contacts`, `conversations`
- **APIs**: ClickUp (task management), Google Calendar (via service account JWT), AgencyAnalytics (SEO/PPC performance), Meta WhatsApp Cloud API
- **Scheduling**: `node-cron` for automated morning/evening briefings
- **Hosting**: Railway.app (Procfile: `web: node src/index.js`)
- **Env vars**: `PORT`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `CLICKUP_API_TOKEN`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `ANTHROPIC_API_KEY`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `ADMIN_USER`, `ADMIN_PASS`, `AGENCYANALYTICS_API_KEY`, `CHILI_PULSE_SECRET`

## What Has Been Built
- **Scheduled briefings**: Morning (07:30 local) and evening (18:30 local) for BR, PA_MX, INT business units
- **Sofia AI assistant**: WhatsApp chatbot for leaders with 4 tools: `get_clickup_tasks`, `get_accounts`, `get_team_leaders`, `get_performance`
- **Client Sofia**: Limited assistant for clients with 2 tools: `get_my_performance`, `get_my_tasks`
- **Data collection pipeline**: `pulse-collector.js` aggregates ClickUp tasks, Google Calendar, AgencyAnalytics, contractual compliance
- **Briefing generation**: `pulse-brain.js` generates morning/evening briefings via Claude with structured prompts
- **WhatsApp delivery**: `pulse-delivery.js` sends messages via Meta Cloud API, auto-splits at 4000 chars
- **ClickUp sync**: Traverses workspace → spaces → folders → lists, maps to accounts table with BU and tier
- **Contact routing**: Identifies WhatsApp senders by number, upgrades unknown→leader if found in team_leaders
- **Toxic message filtering**: Skips old Sofia responses that refused to use tools (conversation.js lines 72-89)
- **Owner forwarding endpoint**: `POST /webhook/owner` accepts messages from No-Touch, returns AI response
- **Admin dashboard**: HTTP Basic Auth protected (admin route)
- **REST API**: CRUD for leaders, accounts, briefings, sync endpoints

## What Is Pending or Broken
- **ClickUp API 401**: Token expired — all ClickUp task fetches fail with `Request failed with status code 401` (visible in logs since 2026-03-18)
- **Google Calendar**: Fails with "Method doesn't allow unregistered callers" — service account not properly registered
- **wa_id mismatch**: Owner's stored number `5548991081505` vs actual WhatsApp ID `554891081505` (extra `9` in stored number)
- **No-Touch integration**: `POST /webhook/owner` endpoint deployed but No-Touch hasn't been updated to call it yet — owner messages still go to No-Touch's handleCommand which lacks ClickUp tools
- **Duplicate briefings**: Hannah gets briefed 3x (once per BU she belongs to: BR, INT, PA_MX) — scheduler runs her for each BU match

## Key Decisions Made
- **Claude Haiku 4.5** for all AI calls (briefings + interactive Sofia) — fast and cheap enough for WhatsApp latency
- **Tool-use pattern**: Sofia MUST call tools before responding; never says "I can't access" — enforced via system prompt + toxic pattern filtering
- **4-tier priority system**: honeymoon → escalation → enterprise → SMB (briefings always prioritize in this order)
- **Split architecture**: Chili Pulse = internal ops, No-Touch = client-facing. Separated because different tools and access levels
- **Conversation history**: Kept in `conversations` table, last 8 messages loaded as context for Sofia
- **No webhook direct from Meta**: Meta sends to No-Touch which forwards to Chili Pulse (single Meta webhook endpoint)

## File Structure
- `src/index.js` — Express app setup, route registration, scheduler start
- `src/scheduler.js` — Cron jobs for morning/evening briefings per BU (BR at UTC 10:30/21:30, PA_MX/INT at UTC 12:30/23:30)
- `src/routes/webhook.js` — WhatsApp webhook (Meta verification + message handling + `/owner` endpoint)
- `src/routes/briefings.js` — Manual briefing trigger endpoints
- `src/routes/leaders.js` — Team leader CRUD
- `src/routes/accounts.js` — Client accounts CRUD
- `src/routes/sync.js` — ClickUp/AgencyAnalytics sync endpoints
- `src/routes/admin.js` — HTTP Basic Auth admin dashboard
- `src/routes/test.js` — Seed data and test send endpoints
- `src/sofia/conversation.js` — Main AI handler: identifies sender, loads history, calls Claude with tools, loops up to 5 tool iterations
- `src/sofia/tools.js` — Tool definitions + `executeTool()` for ClickUp queries, account lookups, performance data
- `src/sofia/contact-router.js` — WhatsApp number → contact/leader lookup, conversation history save/load
- `src/collectors/pulse-collector.js` — Orchestrates data from all sources for a leader
- `src/collectors/pulse-brain.js` — Claude briefing generation (morning + evening system prompts)
- `src/collectors/pulse-delivery.js` — WhatsApp message sending with auto-split at 4000 chars
- `src/collectors/clickup.js` — ClickUp API wrapper (tasks by user, filtered by due date)
- `src/collectors/clickup-sync.js` — Full workspace traversal and accounts table sync
- `src/collectors/gcal.js` — Google Calendar via service account JWT with domain delegation
- `src/collectors/agencyanalytics.js` — Campaign + keyword ranking fetcher (paginated)
- `src/collectors/aa-coverage.js` — Cross-check ClickUp accounts vs AgencyAnalytics campaigns
- `src/config/contractual-tasks.js` — SEO/PPC deliverable checklists by frequency (honeymoon/monthly/quarterly/yearly)
- `src/db/supabase.js` — Supabase client initialization
- `migrations/` — 5 SQL migration files for schema setup

## Rules — Never Do This
- **Never say "I don't have access to ClickUp"** in Sofia's responses — tools exist, use them
- **Never fabricate data** — if a tool returns empty, say so honestly
- **Never reveal internal ops to clients** — client Sofia has restricted tools only
- **Never expose other clients' data** — strict per-client isolation in client tools
- **Never skip the tool-use loop** — Sofia must always call tools before answering data questions
- **Never add Google Docs/CSV workarounds** — Sofia fetches live data, no manual exports
- **Toxic patterns to filter from history**: "I don't have direct integration", "I can't access ClickUp", "Google Doc", "formatted document", "copy-paste into ClickUp"
- **Never push to main without testing** — use feature branches
- **WhatsApp message limit**: 4000 chars max per message (split at section breaks)
- **Max 5 tool iterations** per conversation turn (hardcoded in conversation.js)
