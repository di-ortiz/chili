-- Add morning_snapshot column to store task counts at start of day
-- Used by evening briefing to compare progress
ALTER TABLE briefing_logs ADD COLUMN IF NOT EXISTS morning_snapshot JSONB DEFAULT NULL;

-- Update status to support 'morning' and 'evening' values
-- (status is TEXT, so no schema change needed, just documenting valid values)
COMMENT ON COLUMN briefing_logs.status IS 'Briefing status: morning, evening, generated';
