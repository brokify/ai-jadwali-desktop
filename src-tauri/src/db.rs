use rusqlite::Connection;
use std::path::Path;

const INITIAL_MIGRATION: &str = include_str!("../migrations/001_initial.sql");
const USERS_MIGRATION: &str = include_str!("../migrations/002_users.sql");

pub fn initialize(path: &Path) -> rusqlite::Result<Connection> {
    let mut connection = Connection::open(path)?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.pragma_update(None, "journal_mode", "WAL")?;
    let transaction = connection.transaction()?;
    transaction.execute_batch(INITIAL_MIGRATION)?;
    transaction.execute_batch(USERS_MIGRATION)?;
    transaction.commit()?;
    Ok(connection)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migration_creates_all_required_tables() {
        let temporary = tempfile::tempdir().unwrap();
        let path = temporary.path().join("school.jadwali.db");
        let connection = initialize(&path).unwrap();
        let expected = [
            "schools",
            "grades",
            "sections",
            "subjects",
            "teachers",
            "rooms",
            "lesson_requirements",
            "constraints",
            "timetable_versions",
            "timetable_entries",
            "substitutions",
            "import_jobs",
            "import_row_errors",
            "import_templates",
            "audit_logs",
            "timetable_change_sets",
            "app_settings",
            "user_roles",
            "users",
        ];
        for table in expected {
            let count: i64 = connection
                .query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
                    [table],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(count, 1, "missing table: {table}");
        }
    }
}
