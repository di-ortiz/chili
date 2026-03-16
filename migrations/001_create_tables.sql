-- Migration: Create core tables for chili-pulse

-- Team leaders table
CREATE TABLE IF NOT EXISTS team_leaders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  whatsapp TEXT,
  bu TEXT NOT NULL CHECK (bu IN ('BR', 'INT', 'PA_MX')),
  services TEXT NOT NULL CHECK (services IN ('SEO', 'PPC', 'BOTH')),
  frequency TEXT NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly')),
  channels TEXT NOT NULL DEFAULT 'email' CHECK (channels IN ('whatsapp', 'email', 'gchat')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  clickup_list_id TEXT,
  service_type TEXT,
  tier TEXT NOT NULL CHECK (tier IN ('honeymoon', 'escalation', 'enterprise', 'smb')),
  bu TEXT NOT NULL CHECK (bu IN ('BR', 'INT', 'PA_MX')),
  leader_id UUID NOT NULL REFERENCES team_leaders(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true
);

-- Briefing logs table
CREATE TABLE IF NOT EXISTS briefing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id UUID NOT NULL REFERENCES team_leaders(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  content TEXT NOT NULL,
  delivered_whatsapp BOOLEAN NOT NULL DEFAULT false,
  delivered_email BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending'
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_accounts_leader_id ON accounts(leader_id);
CREATE INDEX IF NOT EXISTS idx_briefing_logs_leader_id ON briefing_logs(leader_id);
CREATE INDEX IF NOT EXISTS idx_briefing_logs_generated_at ON briefing_logs(generated_at);
