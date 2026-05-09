ALTER TABLE usage_logs ALTER COLUMN api_key_id SET DEFAULT NULL;
UPDATE usage_logs SET api_key_id = NULL WHERE api_key_id = 0;