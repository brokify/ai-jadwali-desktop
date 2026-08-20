use crate::AppError;
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

const SCHOOL_ID: &str = "primary-school";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadReport {
    id: String,
    name: String,
    scheduled: u16,
    target: Option<u16>,
    utilization_percent: f64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SectionReport {
    id: String,
    name: String,
    required: u16,
    scheduled: u16,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityReport {
    version_name: String,
    version_status: String,
    solver_status: Option<String>,
    penalty_score: f64,
    scheduled_periods: u16,
    required_periods: u16,
    unfulfilled_periods: u16,
    active_constraints: u16,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportsOverview {
    version_id: Option<String>,
    teacher_loads: Vec<LoadReport>,
    room_usage: Vec<LoadReport>,
    section_loads: Vec<SectionReport>,
    quality: Option<QualityReport>,
}

fn selected_version(
    connection: &Connection,
    requested: Option<&str>,
) -> Result<Option<String>, AppError> {
    if let Some(id) = requested {
        let exists: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM timetable_versions WHERE id = ?1 AND school_id = ?2)",
            params![id, SCHOOL_ID],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::NotFound);
        }
        return Ok(Some(id.to_owned()));
    }
    Ok(connection.query_row(
        "SELECT id FROM timetable_versions WHERE school_id = ?1 ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, created_at DESC LIMIT 1",
        [SCHOOL_ID], |row| row.get(0),
    ).optional()?)
}

pub fn overview(
    connection: &Connection,
    requested: Option<&str>,
) -> Result<ReportsOverview, AppError> {
    let version_id = selected_version(connection, requested)?;
    let Some(version) = &version_id else {
        return Ok(ReportsOverview {
            version_id: None,
            teacher_loads: vec![],
            room_usage: vec![],
            section_loads: vec![],
            quality: None,
        });
    };
    let mut teacher_statement = connection.prepare(
        "SELECT t.id, t.name, COUNT(e.id), t.max_periods_per_week FROM teachers t LEFT JOIN timetable_entries e ON e.teacher_id = t.id AND e.timetable_version_id = ?1 WHERE t.school_id = ?2 AND t.archived_at IS NULL GROUP BY t.id ORDER BY COUNT(e.id) DESC, t.name",
    )?;
    let teacher_loads = teacher_statement
        .query_map(params![version, SCHOOL_ID], |row| {
            let scheduled: u16 = row.get(2)?;
            let target: Option<u16> = row.get(3)?;
            Ok(LoadReport {
                id: row.get(0)?,
                name: row.get(1)?,
                scheduled,
                target,
                utilization_percent: target
                    .filter(|value| *value > 0)
                    .map(|value| scheduled as f64 / value as f64 * 100.0)
                    .unwrap_or(0.0),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let total_slots: u16 = connection.query_row(
        "SELECT COALESCE(SUM(CAST(json_extract(value.value, '$') AS INTEGER)), 0) FROM app_settings, json_each(json_extract(app_settings.value_json, '$.periodsByDay')) value WHERE app_settings.key = 'school_settings'",
        [], |row| row.get(0),
    ).unwrap_or(0);
    let mut room_statement = connection.prepare(
        "SELECT r.id, r.name, COUNT(e.id) FROM rooms r LEFT JOIN timetable_entries e ON e.room_id = r.id AND e.timetable_version_id = ?1 WHERE r.school_id = ?2 AND r.archived_at IS NULL GROUP BY r.id ORDER BY COUNT(e.id) DESC, r.name",
    )?;
    let room_usage = room_statement
        .query_map(params![version, SCHOOL_ID], |row| {
            let scheduled: u16 = row.get(2)?;
            Ok(LoadReport {
                id: row.get(0)?,
                name: row.get(1)?,
                scheduled,
                target: Some(total_slots),
                utilization_percent: if total_slots > 0 {
                    scheduled as f64 / total_slots as f64 * 100.0
                } else {
                    0.0
                },
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut section_statement = connection.prepare(
        "SELECT s.id, s.name, COALESCE((SELECT SUM(lr.periods_per_week) FROM lesson_requirements lr WHERE lr.section_id = s.id AND lr.archived_at IS NULL), 0), COUNT(e.id) FROM sections s LEFT JOIN timetable_entries e ON e.section_id = s.id AND e.timetable_version_id = ?1 WHERE s.school_id = ?2 AND s.archived_at IS NULL GROUP BY s.id ORDER BY s.name",
    )?;
    let section_loads = section_statement
        .query_map(params![version, SCHOOL_ID], |row| {
            Ok(SectionReport {
                id: row.get(0)?,
                name: row.get(1)?,
                required: row.get(2)?,
                scheduled: row.get(3)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let (version_name, version_status, solver_status, penalty_score): (
        String,
        String,
        Option<String>,
        Option<f64>,
    ) = connection.query_row(
        "SELECT name, status, solver_status, penalty_score FROM timetable_versions WHERE id = ?1",
        [version],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    )?;
    let required_periods: u16 = section_loads.iter().map(|item| item.required).sum();
    let scheduled_periods: u16 = section_loads.iter().map(|item| item.scheduled).sum();
    let active_constraints: u16 = connection.query_row(
        "SELECT COUNT(*) FROM constraints WHERE school_id = ?1 AND enabled = 1 AND archived_at IS NULL",
        [SCHOOL_ID], |row| row.get(0),
    )?;
    Ok(ReportsOverview {
        version_id,
        teacher_loads,
        room_usage,
        section_loads,
        quality: Some(QualityReport {
            version_name,
            version_status,
            solver_status,
            penalty_score: penalty_score.unwrap_or(0.0),
            scheduled_periods,
            required_periods,
            unfulfilled_periods: required_periods.saturating_sub(scheduled_periods),
            active_constraints,
        }),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use chrono::Utc;
    use serde_json::json;

    #[test]
    fn calculates_local_quality_and_load_reports() {
        let temporary = tempfile::tempdir().unwrap();
        let connection = db::initialize(&temporary.path().join("reports.db")).unwrap();
        let now = Utc::now().to_rfc3339();
        connection.execute("INSERT INTO schools (id, name, academic_year, language, created_at, updated_at) VALUES (?1, 'مدرسة', '2026', 'ar', ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        connection.execute("INSERT INTO app_settings (id, key, value_json, created_at, updated_at) VALUES ('settings', 'school_settings', ?1, ?2, ?2)", params![json!({"periodsByDay":{"الأحد":2}}).to_string(), now]).unwrap();
        connection.execute("INSERT INTO grades (id, school_id, name, sort_order, created_at, updated_at) VALUES ('g', ?1, 'الأول', 1, ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        connection.execute("INSERT INTO sections (id, school_id, grade_id, name, created_at, updated_at) VALUES ('s', ?1, 'g', 'أ', ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        connection.execute("INSERT INTO subjects (id, school_id, name, created_at, updated_at) VALUES ('sub', ?1, 'رياضيات', ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        connection.execute("INSERT INTO teachers (id, school_id, name, max_periods_per_week, created_at, updated_at) VALUES ('t', ?1, 'معلم', 10, ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        connection.execute("INSERT INTO rooms (id, school_id, name, created_at, updated_at) VALUES ('r', ?1, 'قاعة', ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        connection.execute("INSERT INTO lesson_requirements (id, school_id, section_id, subject_id, teacher_id, preferred_room_id, periods_per_week, consecutive_periods, created_at, updated_at) VALUES ('lr', ?1, 's', 'sub', 't', 'r', 2, 1, ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        connection.execute("INSERT INTO timetable_versions (id, school_id, name, status, solver_status, penalty_score, created_at, updated_at) VALUES ('v', ?1, 'نسخة', 'published', 'partial', 2, ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        connection.execute("INSERT INTO timetable_entries (id, timetable_version_id, lesson_requirement_id, section_id, subject_id, teacher_id, room_id, weekday, period_index, created_at, updated_at) VALUES ('e', 'v', 'lr', 's', 'sub', 't', 'r', 0, 0, ?1, ?1)", [&now]).unwrap();
        let report = overview(&connection, Some("v")).unwrap();
        assert_eq!(report.quality.unwrap().unfulfilled_periods, 1);
        assert_eq!(report.teacher_loads[0].scheduled, 1);
        assert_eq!(report.room_usage[0].target, Some(2));
    }
}
