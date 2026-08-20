use crate::AppError;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AppPreferences {
    confirm_before_publish: bool,
    default_export_view: String,
    compact_timetable: bool,
}

impl Default for AppPreferences {
    fn default() -> Self {
        Self {
            confirm_before_publish: true,
            default_export_view: "section".into(),
            compact_timetable: false,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditRecord {
    id: String,
    action: String,
    entity_type: String,
    created_at: String,
}

pub fn get(connection: &Connection) -> Result<AppPreferences, AppError> {
    let raw: Option<String> = connection
        .query_row(
            "SELECT value_json FROM app_settings WHERE key = 'app_preferences'",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(raw
        .map(|value| serde_json::from_str(&value))
        .transpose()?
        .unwrap_or_default())
}

pub fn save(
    connection: &Connection,
    preferences: AppPreferences,
) -> Result<AppPreferences, AppError> {
    if !matches!(
        preferences.default_export_view.as_str(),
        "section" | "teacher" | "room"
    ) {
        return Err(AppError::Validation("عرض التصدير الافتراضي غير صالح".into()));
    }
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO app_settings (id, key, value_json, created_at, updated_at) VALUES (?1, 'app_preferences', ?2, ?3, ?3) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        params![Uuid::new_v4().to_string(), serde_json::to_string(&preferences)?, now],
    )?;
    Ok(preferences)
}

pub fn audit_logs(connection: &Connection) -> Result<Vec<AuditRecord>, AppError> {
    let mut statement = connection.prepare(
        "SELECT id, action, entity_type, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 100",
    )?;
    let records = statement
        .query_map([], |row| {
            Ok(AuditRecord {
                id: row.get(0)?,
                action: row.get(1)?,
                entity_type: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(records)
}
