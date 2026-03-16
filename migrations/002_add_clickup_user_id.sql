-- Migration: Add clickup_user_id to team_leaders for ClickUp integration
ALTER TABLE team_leaders ADD COLUMN IF NOT EXISTS clickup_user_id TEXT;
