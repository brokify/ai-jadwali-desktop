CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_migrations (version, applied_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE IF NOT EXISTS schools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  academic_year TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'ar' CHECK (language IN ('ar', 'en')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS grades (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  archived_reason TEXT,
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  grade_id TEXT NOT NULL REFERENCES grades(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  archived_reason TEXT,
  UNIQUE (grade_id, name)
);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  code TEXT,
  color TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  archived_reason TEXT,
  UNIQUE (school_id, name),
  UNIQUE (school_id, code)
);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  employee_code TEXT,
  max_periods_per_day INTEGER CHECK (max_periods_per_day IS NULL OR max_periods_per_day > 0),
  max_periods_per_week INTEGER CHECK (max_periods_per_week IS NULL OR max_periods_per_week > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  archived_reason TEXT,
  UNIQUE (school_id, name),
  UNIQUE (school_id, employee_code)
);

CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  room_type TEXT,
  capacity INTEGER CHECK (capacity IS NULL OR capacity > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  archived_reason TEXT,
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS lesson_requirements (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  teacher_id TEXT REFERENCES teachers(id) ON DELETE RESTRICT,
  preferred_room_id TEXT REFERENCES rooms(id) ON DELETE RESTRICT,
  periods_per_week INTEGER NOT NULL CHECK (periods_per_week > 0),
  consecutive_periods INTEGER NOT NULL DEFAULT 1 CHECK (consecutive_periods > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  archived_reason TEXT,
  UNIQUE (section_id, subject_id, teacher_id)
);

CREATE TABLE IF NOT EXISTS constraints (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  constraint_type TEXT NOT NULL,
  strength TEXT NOT NULL CHECK (strength IN ('hard', 'soft')),
  weight INTEGER NOT NULL DEFAULT 1 CHECK (weight > 0),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  archived_reason TEXT
);

CREATE TABLE IF NOT EXISTS timetable_versions (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  solver_status TEXT CHECK (solver_status IN ('success', 'partial', 'failed')),
  penalty_score REAL,
  source_version_id TEXT REFERENCES timetable_versions(id) ON DELETE SET NULL,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (school_id, name)
);

CREATE TABLE IF NOT EXISTS timetable_entries (
  id TEXT PRIMARY KEY,
  timetable_version_id TEXT NOT NULL REFERENCES timetable_versions(id) ON DELETE CASCADE,
  lesson_requirement_id TEXT NOT NULL REFERENCES lesson_requirements(id) ON DELETE RESTRICT,
  section_id TEXT NOT NULL REFERENCES sections(id) ON DELETE RESTRICT,
  subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
  teacher_id TEXT REFERENCES teachers(id) ON DELETE RESTRICT,
  room_id TEXT REFERENCES rooms(id) ON DELETE RESTRICT,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  period_index INTEGER NOT NULL CHECK (period_index >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (timetable_version_id, section_id, weekday, period_index),
  UNIQUE (timetable_version_id, teacher_id, weekday, period_index),
  UNIQUE (timetable_version_id, room_id, weekday, period_index)
);

CREATE TABLE IF NOT EXISTS substitutions (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  timetable_entry_id TEXT NOT NULL REFERENCES timetable_entries(id) ON DELETE RESTRICT,
  absent_teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  substitute_teacher_id TEXT REFERENCES teachers(id) ON DELETE RESTRICT,
  absence_date TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_jobs (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  file_name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('preview', 'completed', 'failed')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  error_rows INTEGER NOT NULL DEFAULT 0,
  mapping_json TEXT CHECK (mapping_json IS NULL OR json_valid(mapping_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS import_row_errors (
  id TEXT PRIMARY KEY,
  import_job_id TEXT NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL CHECK (row_number > 0),
  raw_json TEXT NOT NULL CHECK (json_valid(raw_json)),
  errors_json TEXT NOT NULL CHECK (json_valid(errors_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (import_job_id, row_number)
);

CREATE TABLE IF NOT EXISTS import_templates (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  mapping_json TEXT NOT NULL CHECK (json_valid(mapping_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  archived_reason TEXT,
  UNIQUE (school_id, name, entity_type)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  school_id TEXT REFERENCES schools(id) ON DELETE RESTRICT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT CHECK (details_json IS NULL OR json_valid(details_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS timetable_change_sets (
  id TEXT PRIMARY KEY,
  timetable_version_id TEXT NOT NULL REFERENCES timetable_versions(id) ON DELETE CASCADE,
  sequence_number INTEGER NOT NULL CHECK (sequence_number >= 0),
  action TEXT NOT NULL,
  before_json TEXT CHECK (before_json IS NULL OR json_valid(before_json)),
  after_json TEXT CHECK (after_json IS NULL OR json_valid(after_json)),
  reverted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (timetable_version_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS app_settings (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value_json TEXT NOT NULL CHECK (json_valid(value_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sections_grade ON sections(grade_id);
CREATE INDEX IF NOT EXISTS idx_requirements_section ON lesson_requirements(section_id);
CREATE INDEX IF NOT EXISTS idx_requirements_teacher ON lesson_requirements(teacher_id);
CREATE INDEX IF NOT EXISTS idx_constraints_school ON constraints(school_id, constraint_type);
CREATE INDEX IF NOT EXISTS idx_entries_version ON timetable_entries(timetable_version_id);
CREATE INDEX IF NOT EXISTS idx_substitutions_date ON substitutions(school_id, absence_date);
CREATE INDEX IF NOT EXISTS idx_audit_school_created ON audit_logs(school_id, created_at);
