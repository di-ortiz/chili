-- Allow accounts to exist without a leader (for ClickUp auto-sync)
ALTER TABLE accounts ALTER COLUMN leader_id DROP NOT NULL;
