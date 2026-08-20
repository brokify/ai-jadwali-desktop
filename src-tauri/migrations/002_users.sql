INSERT OR IGNORE INTO schema_migrations (version, applied_at)
VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE IF NOT EXISTS user_roles (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT,
  permissions_json TEXT NOT NULL CHECK (json_valid(permissions_json)),
  is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  full_name TEXT NOT NULL,
  username TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  employee_number TEXT,
  role_id TEXT NOT NULL REFERENCES user_roles(id) ON DELETE RESTRICT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  UNIQUE (school_id, username),
  UNIQUE (school_id, email),
  UNIQUE (school_id, employee_number)
);

CREATE INDEX IF NOT EXISTS idx_users_school_active ON users(school_id, is_active);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_school ON user_roles(school_id, archived_at);
