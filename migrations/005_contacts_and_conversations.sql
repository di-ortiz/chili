-- Migration: contacts table + conversation memory for WhatsApp routing
-- Sofia uses this to know if a sender is a team leader or a client

-- Unified contacts registry
-- Every WhatsApp number that talks to Sofia gets an entry here
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'unknown' CHECK (role IN ('leader', 'client', 'unknown')),
  -- Links to the relevant record depending on role
  leader_id UUID REFERENCES team_leaders(id) ON DELETE SET NULL,
  -- For clients: store their account/company info
  client_company TEXT,
  client_account_ids TEXT[], -- array of account IDs they have access to
  language TEXT DEFAULT 'en', -- en, pt, es
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversation memory — stores recent messages per contact
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message TEXT NOT NULL,
  wa_message_id TEXT, -- Meta's message ID for deduplication
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_whatsapp ON contacts(whatsapp);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_id ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at ON conversations(created_at);

-- Auto-populate contacts from existing team_leaders
INSERT INTO contacts (whatsapp, name, role, leader_id, language)
SELECT
  whatsapp,
  name,
  'leader',
  id,
  CASE
    WHEN bu = 'BR' THEN 'pt'
    WHEN bu = 'PA_MX' THEN 'es'
    ELSE 'en'
  END
FROM team_leaders
WHERE whatsapp IS NOT NULL
ON CONFLICT (whatsapp) DO UPDATE SET
  role = 'leader',
  leader_id = EXCLUDED.leader_id,
  name = EXCLUDED.name;
