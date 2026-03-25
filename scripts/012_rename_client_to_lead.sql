-- Rename client_name column to lead_name
ALTER TABLE calls RENAME COLUMN client_name TO lead_name;

-- Drop old index and create new one
DROP INDEX IF EXISTS idx_calls_client_name;
CREATE INDEX IF NOT EXISTS idx_calls_lead_name ON calls(lead_name);
