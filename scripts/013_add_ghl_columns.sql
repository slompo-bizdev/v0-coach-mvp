-- Add GHL integration columns to calls table
ALTER TABLE calls
ADD COLUMN IF NOT EXISTS ghl_message_id TEXT,
ADD COLUMN IF NOT EXISTS ghl_contact_id TEXT,
ADD COLUMN IF NOT EXISTS ghl_location_id TEXT;

-- Create index for GHL message ID lookups
CREATE INDEX IF NOT EXISTS idx_calls_ghl_message_id ON calls(ghl_message_id);
CREATE INDEX IF NOT EXISTS idx_calls_ghl_contact_id ON calls(ghl_contact_id);
