INSERT INTO users (email, password_hash, role, is_active)
VALUES (
  'test@test',
  encode(sha256(('deway-secret-2024' || 'test@test')::bytea), 'hex'),
  'admin',
  TRUE
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = encode(sha256(('deway-secret-2024' || 'test@test')::bytea), 'hex'),
  role = 'admin',
  is_active = TRUE;
