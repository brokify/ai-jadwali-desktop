use crate::AppError;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

const SCHOOL_ID: &str = "primary-school";
const DAY_LABELS: [&str; 7] = [
    "الأحد",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleDay {
    weekday: u8,
    label: String,
    periods: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverRequirement {
    id: String,
    section_id: String,
    subject_id: String,
    teacher_id: Option<String>,
    room_id: Option<String>,
    periods_per_week: u16,
    consecutive_periods: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverTeacher {
    id: String,
    max_periods_per_day: Option<u8>,
    max_periods_per_week: Option<u16>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LookupItem {
    id: String,
    name: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConstraintRecord {
    id: String,
    constraint_type: String,
    strength: String,
    weight: u16,
    payload: Value,
    enabled: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SolverContext {
    days: Vec<ScheduleDay>,
    requirements: Vec<SolverRequirement>,
    teachers: Vec<SolverTeacher>,
    constraints: Vec<ConstraintRecord>,
    sections: Vec<LookupItem>,
    subjects: Vec<LookupItem>,
    teacher_names: Vec<LookupItem>,
    rooms: Vec<LookupItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ConstraintInput {
    id: Option<String>,
    constraint_type: String,
    strength: String,
    weight: u16,
    payload: Value,
    enabled: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GeneratedEntryInput {
    lesson_requirement_id: String,
    section_id: String,
    subject_id: String,
    teacher_id: Option<String>,
    room_id: Option<String>,
    weekday: u8,
    period_index: u8,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct GenerateRequest {
    name: String,
    solver_status: String,
    penalty_score: f64,
    entries: Vec<GeneratedEntryInput>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MoveRequest {
    version_id: String,
    entry_id: String,
    weekday: u8,
    period_index: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveValidation {
    valid: bool,
    message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimetableVersion {
    id: String,
    name: String,
    status: String,
    solver_status: Option<String>,
    penalty_score: Option<f64>,
    source_version_id: Option<String>,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimetableEntry {
    id: String,
    lesson_requirement_id: String,
    section_id: String,
    subject_id: String,
    teacher_id: Option<String>,
    room_id: Option<String>,
    weekday: u8,
    period_index: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimetableOverview {
    versions: Vec<TimetableVersion>,
    selected_version_id: Option<String>,
    entries: Vec<TimetableEntry>,
    can_undo: bool,
    can_redo: bool,
}

fn clean_id(value: &str, label: &str) -> Result<String, AppError> {
    let value = value.trim();
    if value.is_empty() || value.len() > 80 {
        return Err(AppError::Validation(format!("{label} غير صالح")));
    }
    Ok(value.to_owned())
}

fn schedule_days(connection: &Connection) -> Result<Vec<ScheduleDay>, AppError> {
    let raw: String = connection.query_row(
        "SELECT value_json FROM app_settings WHERE key = 'school_settings'",
        [],
        |row| row.get(0),
    )?;
    let settings: Value = serde_json::from_str(&raw)?;
    let working_days = settings["workingDays"]
        .as_array()
        .ok_or_else(|| AppError::Validation("أيام الدوام غير محفوظة".into()))?;
    let periods = settings["periodsByDay"]
        .as_object()
        .ok_or_else(|| AppError::Validation("عدد الحصص اليومي غير محفوظ".into()))?;
    let mut result = Vec::new();
    for day in working_days {
        let label = day
            .as_str()
            .ok_or_else(|| AppError::Validation("يوم دوام غير صالح".into()))?;
        let weekday = DAY_LABELS
            .iter()
            .position(|item| item == &label)
            .ok_or_else(|| AppError::Validation("يوم دوام غير صالح".into()))?
            as u8;
        let count = periods.get(label).and_then(Value::as_u64).unwrap_or(0) as u8;
        if !(1..=16).contains(&count) {
            return Err(AppError::Validation(format!("عدد حصص {label} غير صالح")));
        }
        result.push(ScheduleDay {
            weekday,
            label: label.to_owned(),
            periods: count,
        });
    }
    Ok(result)
}

fn lookup(connection: &Connection, table: &str) -> Result<Vec<LookupItem>, AppError> {
    let sql = match table {
        "sections" => "SELECT id, name FROM sections WHERE school_id = ?1 AND archived_at IS NULL ORDER BY name",
        "subjects" => "SELECT id, name FROM subjects WHERE school_id = ?1 AND archived_at IS NULL ORDER BY name",
        "teachers" => "SELECT id, name FROM teachers WHERE school_id = ?1 AND archived_at IS NULL ORDER BY name",
        "rooms" => "SELECT id, name FROM rooms WHERE school_id = ?1 AND archived_at IS NULL ORDER BY name",
        _ => return Err(AppError::Validation("نوع مرجع غير صالح".into())),
    };
    let mut statement = connection.prepare(sql)?;
    let records = statement
        .query_map([SCHOOL_ID], |row| {
            Ok(LookupItem {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(records)
}

pub fn list_constraints(connection: &Connection) -> Result<Vec<ConstraintRecord>, AppError> {
    let mut statement = connection.prepare(
        "SELECT id, constraint_type, strength, weight, payload_json, enabled FROM constraints WHERE school_id = ?1 AND archived_at IS NULL ORDER BY created_at DESC",
    )?;
    let records = statement
        .query_map([SCHOOL_ID], |row| {
            let payload: String = row.get(4)?;
            Ok(ConstraintRecord {
                id: row.get(0)?,
                constraint_type: row.get(1)?,
                strength: row.get(2)?,
                weight: row.get(3)?,
                payload: serde_json::from_str(&payload).unwrap_or(json!({})),
                enabled: row.get::<_, i64>(5)? == 1,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(records)
}

pub fn context(connection: &Connection) -> Result<SolverContext, AppError> {
    let mut requirements_statement = connection.prepare(
        "SELECT id, section_id, subject_id, teacher_id, preferred_room_id, periods_per_week, consecutive_periods FROM lesson_requirements WHERE school_id = ?1 AND archived_at IS NULL ORDER BY created_at",
    )?;
    let requirements = requirements_statement
        .query_map([SCHOOL_ID], |row| {
            Ok(SolverRequirement {
                id: row.get(0)?,
                section_id: row.get(1)?,
                subject_id: row.get(2)?,
                teacher_id: row.get(3)?,
                room_id: row.get(4)?,
                periods_per_week: row.get(5)?,
                consecutive_periods: row.get(6)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let mut teachers_statement = connection.prepare(
        "SELECT id, max_periods_per_day, max_periods_per_week FROM teachers WHERE school_id = ?1 AND archived_at IS NULL",
    )?;
    let teachers = teachers_statement
        .query_map([SCHOOL_ID], |row| {
            Ok(SolverTeacher {
                id: row.get(0)?,
                max_periods_per_day: row.get(1)?,
                max_periods_per_week: row.get(2)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(SolverContext {
        days: schedule_days(connection)?,
        requirements,
        teachers,
        constraints: list_constraints(connection)?,
        sections: lookup(connection, "sections")?,
        subjects: lookup(connection, "subjects")?,
        teacher_names: lookup(connection, "teachers")?,
        rooms: lookup(connection, "rooms")?,
    })
}

fn validate_constraint(
    connection: &Connection,
    input: &ConstraintInput,
) -> Result<Value, AppError> {
    if !matches!(input.strength.as_str(), "hard" | "soft") || !(1..=100).contains(&input.weight) {
        return Err(AppError::Validation("قوة القيد أو وزنه غير صالح".into()));
    }
    let payload = input
        .payload
        .as_object()
        .ok_or_else(|| AppError::Validation("بيانات القيد غير صالحة".into()))?;
    let allowed: &[&str] = match input.constraint_type.as_str() {
        "teacher_unavailable" => &["teacherId", "weekday", "periodIndex"],
        "room_unavailable" => &["roomId", "weekday", "periodIndex"],
        "prefer_distribution" => &["sectionId", "subjectId"],
        "avoid_last_period" => &["subjectId"],
        _ => return Err(AppError::Validation("نوع القيد غير مدعوم".into())),
    };
    if payload.keys().any(|key| !allowed.contains(&key.as_str())) {
        return Err(AppError::Validation(
            "يحتوي القيد على حقول غير مسموحة".into(),
        ));
    }
    if input.constraint_type.ends_with("_unavailable") {
        if input.strength != "hard" {
            return Err(AppError::Validation(
                "قيد عدم التوفر يجب أن يكون صارمًا".into(),
            ));
        }
        let weekday = payload.get("weekday").and_then(Value::as_u64).unwrap_or(8);
        let period = payload
            .get("periodIndex")
            .and_then(Value::as_u64)
            .unwrap_or(17);
        if weekday > 6 || period > 15 {
            return Err(AppError::Validation("وقت عدم التوفر غير صالح".into()));
        }
        validate_slot(connection, weekday as u8, period as u8)?;
        let (key, table) = if input.constraint_type == "teacher_unavailable" {
            ("teacherId", "teachers")
        } else {
            ("roomId", "rooms")
        };
        let id = payload.get(key).and_then(Value::as_str).unwrap_or("");
        let sql = if table == "teachers" {
            "SELECT EXISTS(SELECT 1 FROM teachers WHERE id = ?1 AND school_id = ?2 AND archived_at IS NULL)"
        } else {
            "SELECT EXISTS(SELECT 1 FROM rooms WHERE id = ?1 AND school_id = ?2 AND archived_at IS NULL)"
        };
        let exists: bool = connection.query_row(sql, params![id, SCHOOL_ID], |row| row.get(0))?;
        if !exists {
            return Err(AppError::Validation("مرجع القيد غير موجود".into()));
        }
    } else if input.strength != "soft" {
        return Err(AppError::Validation("قيد التفضيل يجب أن يكون مرنًا".into()));
    }
    Ok(Value::Object(payload.clone()))
}

pub fn save_constraint(
    connection: &mut Connection,
    input: ConstraintInput,
) -> Result<ConstraintRecord, AppError> {
    let payload = validate_constraint(connection, &input)?;
    let id = input
        .id
        .map(|value| clean_id(&value, "معرف القيد"))
        .transpose()?
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    let transaction = connection.transaction()?;
    transaction.execute(
        "INSERT INTO constraints (id, school_id, constraint_type, strength, weight, payload_json, enabled, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8) ON CONFLICT(id) DO UPDATE SET constraint_type = excluded.constraint_type, strength = excluded.strength, weight = excluded.weight, payload_json = excluded.payload_json, enabled = excluded.enabled, updated_at = excluded.updated_at WHERE school_id = ?2",
        params![id, SCHOOL_ID, input.constraint_type, input.strength, input.weight, payload.to_string(), input.enabled as i64, now],
    )?;
    audit(
        &transaction,
        "update",
        "constraint",
        &id,
        json!({"enabled": input.enabled}),
    )?;
    transaction.commit()?;
    list_constraints(connection)?
        .into_iter()
        .find(|constraint| constraint.id == id)
        .ok_or(AppError::NotFound)
}

pub fn archive_constraint(connection: &mut Connection, id: &str) -> Result<(), AppError> {
    let id = clean_id(id, "معرف القيد")?;
    let now = Utc::now().to_rfc3339();
    let transaction = connection.transaction()?;
    let changed = transaction.execute(
        "UPDATE constraints SET archived_at = ?1, archived_reason = 'أرشفة من شاشة القيود', updated_at = ?1 WHERE id = ?2 AND school_id = ?3 AND archived_at IS NULL",
        params![now, id, SCHOOL_ID],
    )?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    audit(&transaction, "archive", "constraint", &id, json!({}))?;
    transaction.commit()?;
    Ok(())
}

fn audit(
    transaction: &Transaction<'_>,
    action: &str,
    entity_type: &str,
    entity_id: &str,
    details: Value,
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    transaction.execute(
        "INSERT INTO audit_logs (id, school_id, action, entity_type, entity_id, details_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![Uuid::new_v4().to_string(), SCHOOL_ID, action, entity_type, entity_id, details.to_string(), now],
    )?;
    Ok(())
}

fn unavailable(
    connection: &Connection,
    kind: &str,
    id: Option<&str>,
    weekday: u8,
    period_index: u8,
) -> Result<bool, AppError> {
    let Some(id) = id else { return Ok(false) };
    let key = if kind == "teacher_unavailable" {
        "teacherId"
    } else {
        "roomId"
    };
    let mut statement = connection.prepare(
        "SELECT payload_json FROM constraints WHERE school_id = ?1 AND constraint_type = ?2 AND strength = 'hard' AND enabled = 1 AND archived_at IS NULL",
    )?;
    for raw in statement.query_map(params![SCHOOL_ID, kind], |row| row.get::<_, String>(0))? {
        let payload: Value = serde_json::from_str(&raw?)?;
        if payload[key] == id
            && payload["weekday"] == weekday
            && payload["periodIndex"] == period_index
        {
            return Ok(true);
        }
    }
    Ok(false)
}

fn validate_slot(connection: &Connection, weekday: u8, period_index: u8) -> Result<(), AppError> {
    let valid = schedule_days(connection)?
        .iter()
        .any(|day| day.weekday == weekday && period_index < day.periods);
    if !valid {
        return Err(AppError::Validation("وقت الحصة خارج أيام الدوام".into()));
    }
    Ok(())
}

pub fn generate(
    connection: &mut Connection,
    request: GenerateRequest,
) -> Result<TimetableOverview, AppError> {
    let name = request.name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(AppError::Validation("اسم نسخة الجدول غير صالح".into()));
    }
    if !matches!(
        request.solver_status.as_str(),
        "success" | "partial" | "failed"
    ) || !request.penalty_score.is_finite()
        || request.penalty_score < 0.0
        || request.entries.len() > 20_000
    {
        return Err(AppError::Validation("نتيجة المحرك غير صالحة".into()));
    }
    let mut section_slots = HashSet::new();
    let mut teacher_slots = HashSet::new();
    let mut room_slots = HashSet::new();
    let mut requirement_counts: HashMap<String, u16> = HashMap::new();
    let mut teacher_daily_counts: HashMap<(String, u8), u16> = HashMap::new();
    let mut teacher_weekly_counts: HashMap<String, u16> = HashMap::new();
    for entry in &request.entries {
        validate_slot(connection, entry.weekday, entry.period_index)?;
        let expected: Option<(String, String, Option<String>, Option<String>, u16)> = connection
            .query_row(
                "SELECT section_id, subject_id, teacher_id, preferred_room_id, periods_per_week FROM lesson_requirements WHERE id = ?1 AND school_id = ?2 AND archived_at IS NULL",
                params![entry.lesson_requirement_id, SCHOOL_ID],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)),
            )
            .optional()?;
        let Some((
            expected_section,
            expected_subject,
            expected_teacher,
            expected_room,
            expected_periods,
        )) = expected
        else {
            return Err(AppError::Validation(
                "متطلب الحصة غير موجود أو مؤرشف".into(),
            ));
        };
        if (
            expected_section,
            expected_subject,
            expected_teacher,
            expected_room,
        ) != (
            entry.section_id.clone(),
            entry.subject_id.clone(),
            entry.teacher_id.clone(),
            entry.room_id.clone(),
        ) {
            return Err(AppError::Validation(
                "بيانات حصة لا تطابق متطلبها الأصلي".into(),
            ));
        }
        let requirement_count = requirement_counts
            .entry(entry.lesson_requirement_id.clone())
            .or_default();
        *requirement_count += 1;
        if *requirement_count > expected_periods {
            return Err(AppError::Validation(
                "عدد حصص متطلب يتجاوز العدد الأسبوعي".into(),
            ));
        }
        let slot = (entry.weekday, entry.period_index);
        if !section_slots.insert((entry.section_id.clone(), slot))
            || entry
                .teacher_id
                .as_ref()
                .is_some_and(|id| !teacher_slots.insert((id.clone(), slot)))
            || entry
                .room_id
                .as_ref()
                .is_some_and(|id| !room_slots.insert((id.clone(), slot)))
        {
            return Err(AppError::Validation(
                "نتيجة المحرك تحتوي تعارضًا صارمًا".into(),
            ));
        }
        if unavailable(
            connection,
            "teacher_unavailable",
            entry.teacher_id.as_deref(),
            entry.weekday,
            entry.period_index,
        )? || unavailable(
            connection,
            "room_unavailable",
            entry.room_id.as_deref(),
            entry.weekday,
            entry.period_index,
        )? {
            return Err(AppError::Validation(
                "نتيجة المحرك تخالف قيد عدم توفر".into(),
            ));
        }
        if let Some(teacher_id) = &entry.teacher_id {
            *teacher_daily_counts
                .entry((teacher_id.clone(), entry.weekday))
                .or_default() += 1;
            *teacher_weekly_counts.entry(teacher_id.clone()).or_default() += 1;
        }
    }
    let mut requirement_statement = connection.prepare(
        "SELECT id, periods_per_week FROM lesson_requirements WHERE school_id = ?1 AND archived_at IS NULL",
    )?;
    let expected_requirements = requirement_statement
        .query_map([SCHOOL_ID], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, u16>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(requirement_statement);
    if request.solver_status == "success"
        && expected_requirements
            .iter()
            .any(|(id, expected)| requirement_counts.get(id).copied().unwrap_or(0) != *expected)
    {
        return Err(AppError::Validation(
            "نتيجة النجاح لا تغطي جميع الحصص الأسبوعية".into(),
        ));
    }
    for (teacher_id, weekly_count) in &teacher_weekly_counts {
        let limits: (Option<u16>, Option<u16>) = connection.query_row(
            "SELECT max_periods_per_day, max_periods_per_week FROM teachers WHERE id = ?1 AND school_id = ?2 AND archived_at IS NULL",
            params![teacher_id, SCHOOL_ID],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )?;
        if limits.1.is_some_and(|limit| *weekly_count > limit)
            || teacher_daily_counts.iter().any(|((id, _), count)| {
                id == teacher_id && limits.0.is_some_and(|limit| *count > limit)
            })
        {
            return Err(AppError::Validation(
                "نتيجة المحرك تتجاوز حمل المعلم المسموح".into(),
            ));
        }
    }
    let version_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let transaction = connection.transaction()?;
    transaction.execute(
        "INSERT INTO timetable_versions (id, school_id, name, status, solver_status, penalty_score, created_at, updated_at) VALUES (?1, ?2, ?3, 'draft', ?4, ?5, ?6, ?6)",
        params![version_id, SCHOOL_ID, name, request.solver_status, request.penalty_score, now],
    )?;
    for entry in request.entries {
        transaction.execute(
            "INSERT INTO timetable_entries (id, timetable_version_id, lesson_requirement_id, section_id, subject_id, teacher_id, room_id, weekday, period_index, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?10)",
            params![Uuid::new_v4().to_string(), version_id, entry.lesson_requirement_id, entry.section_id, entry.subject_id, entry.teacher_id, entry.room_id, entry.weekday, entry.period_index, now],
        )?;
    }
    audit(
        &transaction,
        "generate",
        "timetable_version",
        &version_id,
        json!({"solverStatus": request.solver_status, "penaltyScore": request.penalty_score}),
    )?;
    transaction.commit()?;
    overview(connection, Some(&version_id))
}

pub fn overview(
    connection: &Connection,
    selected: Option<&str>,
) -> Result<TimetableOverview, AppError> {
    let mut version_statement = connection.prepare(
        "SELECT id, name, status, solver_status, penalty_score, source_version_id, created_at FROM timetable_versions WHERE school_id = ?1 ORDER BY created_at DESC LIMIT 100",
    )?;
    let versions = version_statement
        .query_map([SCHOOL_ID], |row| {
            Ok(TimetableVersion {
                id: row.get(0)?,
                name: row.get(1)?,
                status: row.get(2)?,
                solver_status: row.get(3)?,
                penalty_score: row.get(4)?,
                source_version_id: row.get(5)?,
                created_at: row.get(6)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    let selected_id = selected
        .map(str::to_owned)
        .or_else(|| versions.first().map(|version| version.id.clone()));
    let entries = if let Some(version_id) = &selected_id {
        let mut entry_statement = connection.prepare(
            "SELECT id, lesson_requirement_id, section_id, subject_id, teacher_id, room_id, weekday, period_index FROM timetable_entries WHERE timetable_version_id = ?1 ORDER BY weekday, period_index",
        )?;
        let records = entry_statement
            .query_map([version_id], |row| {
                Ok(TimetableEntry {
                    id: row.get(0)?,
                    lesson_requirement_id: row.get(1)?,
                    section_id: row.get(2)?,
                    subject_id: row.get(3)?,
                    teacher_id: row.get(4)?,
                    room_id: row.get(5)?,
                    weekday: row.get(6)?,
                    period_index: row.get(7)?,
                })
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        records
    } else {
        Vec::new()
    };
    let (can_undo, can_redo) = if let Some(version_id) = &selected_id {
        (
            connection.query_row("SELECT EXISTS(SELECT 1 FROM timetable_change_sets WHERE timetable_version_id = ?1 AND reverted_at IS NULL)", [version_id], |row| row.get(0))?,
            connection.query_row("SELECT EXISTS(SELECT 1 FROM timetable_change_sets WHERE timetable_version_id = ?1 AND reverted_at IS NOT NULL)", [version_id], |row| row.get(0))?,
        )
    } else {
        (false, false)
    };
    Ok(TimetableOverview {
        versions,
        selected_version_id: selected_id,
        entries,
        can_undo,
        can_redo,
    })
}

fn validate_move_internal(
    connection: &Connection,
    request: &MoveRequest,
) -> Result<MoveValidation, AppError> {
    validate_slot(connection, request.weekday, request.period_index)?;
    let entry: Option<(String, Option<String>, Option<String>, u8)> = connection.query_row(
        "SELECT section_id, teacher_id, room_id, weekday FROM timetable_entries WHERE id = ?1 AND timetable_version_id = ?2",
        params![request.entry_id, request.version_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).optional()?;
    let Some((section_id, teacher_id, room_id, old_weekday)) = entry else {
        return Err(AppError::NotFound);
    };
    let collision: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM timetable_entries WHERE timetable_version_id = ?1 AND id <> ?2 AND weekday = ?3 AND period_index = ?4 AND (section_id = ?5 OR (?6 IS NOT NULL AND teacher_id = ?6) OR (?7 IS NOT NULL AND room_id = ?7)))",
        params![request.version_id, request.entry_id, request.weekday, request.period_index, section_id, teacher_id, room_id],
        |row| row.get(0),
    )?;
    if collision {
        return Ok(MoveValidation {
            valid: false,
            message: "يوجد تعارض للشعبة أو المعلم أو القاعة في هذا الوقت.".into(),
        });
    }
    if unavailable(
        connection,
        "teacher_unavailable",
        teacher_id.as_deref(),
        request.weekday,
        request.period_index,
    )? {
        return Ok(MoveValidation {
            valid: false,
            message: "المعلم غير متاح في هذا الوقت.".into(),
        });
    }
    if unavailable(
        connection,
        "room_unavailable",
        room_id.as_deref(),
        request.weekday,
        request.period_index,
    )? {
        return Ok(MoveValidation {
            valid: false,
            message: "القاعة غير متاحة في هذا الوقت.".into(),
        });
    }
    if let Some(teacher_id) = &teacher_id {
        if old_weekday != request.weekday {
            let limit: Option<u16> = connection.query_row(
                "SELECT max_periods_per_day FROM teachers WHERE id = ?1 AND school_id = ?2",
                params![teacher_id, SCHOOL_ID],
                |row| row.get(0),
            )?;
            let target_count: u16 = connection.query_row(
                "SELECT COUNT(*) FROM timetable_entries WHERE timetable_version_id = ?1 AND teacher_id = ?2 AND weekday = ?3 AND id <> ?4",
                params![request.version_id, teacher_id, request.weekday, request.entry_id],
                |row| row.get(0),
            )?;
            if limit.is_some_and(|maximum| target_count + 1 > maximum) {
                return Ok(MoveValidation {
                    valid: false,
                    message: "النقل يتجاوز الحد اليومي لحصص المعلم.".into(),
                });
            }
        }
    }
    Ok(MoveValidation {
        valid: true,
        message: "النقل صالح.".into(),
    })
}

pub fn validate_move(
    connection: &Connection,
    request: &MoveRequest,
) -> Result<MoveValidation, AppError> {
    validate_move_internal(connection, request)
}

pub fn move_lesson(
    connection: &mut Connection,
    request: MoveRequest,
) -> Result<TimetableOverview, AppError> {
    let validation = validate_move_internal(connection, &request)?;
    if !validation.valid {
        return Err(AppError::Validation(validation.message));
    }
    let before: (u8, u8) = connection.query_row(
        "SELECT weekday, period_index FROM timetable_entries WHERE id = ?1 AND timetable_version_id = ?2",
        params![request.entry_id, request.version_id], |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let now = Utc::now().to_rfc3339();
    let transaction = connection.transaction()?;
    transaction.execute("DELETE FROM timetable_change_sets WHERE timetable_version_id = ?1 AND reverted_at IS NOT NULL", [&request.version_id])?;
    let sequence: i64 = transaction.query_row(
        "SELECT COALESCE(MAX(sequence_number), -1) + 1 FROM timetable_change_sets WHERE timetable_version_id = ?1",
        [&request.version_id], |row| row.get(0),
    )?;
    transaction.execute(
        "UPDATE timetable_entries SET weekday = ?1, period_index = ?2, updated_at = ?3 WHERE id = ?4 AND timetable_version_id = ?5",
        params![request.weekday, request.period_index, now, request.entry_id, request.version_id],
    )?;
    transaction.execute(
        "INSERT INTO timetable_change_sets (id, timetable_version_id, sequence_number, action, before_json, after_json, created_at, updated_at) VALUES (?1, ?2, ?3, 'move', ?4, ?5, ?6, ?6)",
        params![Uuid::new_v4().to_string(), request.version_id, sequence, json!({"entryId": request.entry_id, "weekday": before.0, "periodIndex": before.1}).to_string(), json!({"entryId": request.entry_id, "weekday": request.weekday, "periodIndex": request.period_index}).to_string(), now],
    )?;
    audit(
        &transaction,
        "move lesson",
        "timetable_entry",
        &request.entry_id,
        json!({"versionId": request.version_id}),
    )?;
    transaction.commit()?;
    overview(connection, Some(&request.version_id))
}

fn apply_change(
    connection: &mut Connection,
    version_id: &str,
    redo: bool,
) -> Result<TimetableOverview, AppError> {
    let version_id = clean_id(version_id, "معرف النسخة")?;
    let query = if redo {
        "SELECT id, after_json FROM timetable_change_sets WHERE timetable_version_id = ?1 AND reverted_at IS NOT NULL ORDER BY sequence_number ASC LIMIT 1"
    } else {
        "SELECT id, before_json FROM timetable_change_sets WHERE timetable_version_id = ?1 AND reverted_at IS NULL ORDER BY sequence_number DESC LIMIT 1"
    };
    let change: Option<(String, String)> = connection
        .query_row(query, [&version_id], |row| Ok((row.get(0)?, row.get(1)?)))
        .optional()?;
    let Some((change_id, raw)) = change else {
        return Err(AppError::Validation(
            if redo {
                "لا يوجد تغيير لإعادته"
            } else {
                "لا يوجد تغيير للتراجع عنه"
            }
            .into(),
        ));
    };
    let payload: Value = serde_json::from_str(&raw)?;
    let entry_id = payload["entryId"]
        .as_str()
        .ok_or_else(|| AppError::Validation("سجل التغيير تالف".into()))?;
    let weekday = payload["weekday"]
        .as_u64()
        .ok_or_else(|| AppError::Validation("سجل التغيير تالف".into()))? as u8;
    let period = payload["periodIndex"]
        .as_u64()
        .ok_or_else(|| AppError::Validation("سجل التغيير تالف".into()))? as u8;
    validate_slot(connection, weekday, period)?;
    let now = Utc::now().to_rfc3339();
    let transaction = connection.transaction()?;
    transaction.execute("UPDATE timetable_entries SET weekday = ?1, period_index = ?2, updated_at = ?3 WHERE id = ?4 AND timetable_version_id = ?5", params![weekday, period, now, entry_id, version_id])?;
    if redo {
        transaction.execute(
            "UPDATE timetable_change_sets SET reverted_at = NULL, updated_at = ?1 WHERE id = ?2",
            params![now, change_id],
        )?;
    } else {
        transaction.execute(
            "UPDATE timetable_change_sets SET reverted_at = ?1, updated_at = ?1 WHERE id = ?2",
            params![now, change_id],
        )?;
    }
    audit(
        &transaction,
        if redo {
            "redo timetable change"
        } else {
            "undo timetable change"
        },
        "timetable_version",
        &version_id,
        json!({"changeId": change_id}),
    )?;
    transaction.commit()?;
    overview(connection, Some(&version_id))
}

pub fn undo(connection: &mut Connection, version_id: &str) -> Result<TimetableOverview, AppError> {
    apply_change(connection, version_id, false)
}
pub fn redo(connection: &mut Connection, version_id: &str) -> Result<TimetableOverview, AppError> {
    apply_change(connection, version_id, true)
}

pub fn revert(
    connection: &mut Connection,
    source_version_id: &str,
    name: &str,
) -> Result<TimetableOverview, AppError> {
    let source_version_id = clean_id(source_version_id, "معرف النسخة")?;
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 120 {
        return Err(AppError::Validation("اسم النسخة غير صالح".into()));
    }
    let source_exists: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM timetable_versions WHERE id = ?1 AND school_id = ?2)",
        params![source_version_id, SCHOOL_ID],
        |row| row.get(0),
    )?;
    if !source_exists {
        return Err(AppError::NotFound);
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let transaction = connection.transaction()?;
    transaction.execute("INSERT INTO timetable_versions (id, school_id, name, status, solver_status, penalty_score, source_version_id, created_at, updated_at) SELECT ?1, school_id, ?2, 'draft', solver_status, penalty_score, id, ?3, ?3 FROM timetable_versions WHERE id = ?4", params![id, name, now, source_version_id])?;
    transaction.execute("INSERT INTO timetable_entries (id, timetable_version_id, lesson_requirement_id, section_id, subject_id, teacher_id, room_id, weekday, period_index, created_at, updated_at) SELECT lower(hex(randomblob(16))), ?1, lesson_requirement_id, section_id, subject_id, teacher_id, room_id, weekday, period_index, ?2, ?2 FROM timetable_entries WHERE timetable_version_id = ?3", params![id, now, source_version_id])?;
    audit(
        &transaction,
        "revert timetable version",
        "timetable_version",
        &id,
        json!({"sourceVersionId": source_version_id}),
    )?;
    transaction.commit()?;
    overview(connection, Some(&id))
}

pub fn set_status(
    connection: &mut Connection,
    version_id: &str,
    status: &str,
) -> Result<TimetableOverview, AppError> {
    let version_id = clean_id(version_id, "معرف النسخة")?;
    if !matches!(status, "draft" | "published" | "archived") {
        return Err(AppError::Validation("حالة النسخة غير صالحة".into()));
    }
    let now = Utc::now().to_rfc3339();
    let transaction = connection.transaction()?;
    let changed = transaction.execute("UPDATE timetable_versions SET status = ?1, published_at = CASE WHEN ?1 = 'published' THEN ?2 ELSE published_at END, updated_at = ?2 WHERE id = ?3 AND school_id = ?4", params![status, now, version_id, SCHOOL_ID])?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    audit(
        &transaction,
        if status == "published" {
            "publish timetable"
        } else {
            "archive timetable"
        },
        "timetable_version",
        &version_id,
        json!({"status": status}),
    )?;
    transaction.commit()?;
    overview(connection, Some(&version_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    fn database() -> (tempfile::TempDir, Connection) {
        let temporary = tempfile::tempdir().unwrap();
        let connection = db::initialize(&temporary.path().join("school.db")).unwrap();
        let now = Utc::now().to_rfc3339();
        connection.execute("INSERT INTO schools (id, name, academic_year, language, created_at, updated_at) VALUES (?1, 'مدرسة', '2026', 'ar', ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        connection.execute("INSERT INTO app_settings (id, key, value_json, created_at, updated_at) VALUES ('settings', 'school_settings', ?1, ?2, ?2)", params![json!({"workingDays":["الأحد"],"periodsByDay":{"الأحد":2}}).to_string(), now]).unwrap();
        connection.execute("INSERT INTO grades (id, school_id, name, sort_order, created_at, updated_at) VALUES ('g', ?1, 'الأول', 1, ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        connection.execute("INSERT INTO sections (id, school_id, grade_id, name, created_at, updated_at) VALUES ('s', ?1, 'g', 'أ', ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        connection.execute("INSERT INTO subjects (id, school_id, name, created_at, updated_at) VALUES ('sub', ?1, 'رياضيات', ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        connection.execute("INSERT INTO teachers (id, school_id, name, created_at, updated_at) VALUES ('t', ?1, 'معلم', ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        connection.execute("INSERT INTO rooms (id, school_id, name, created_at, updated_at) VALUES ('r', ?1, 'قاعة', ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        connection.execute("INSERT INTO lesson_requirements (id, school_id, section_id, subject_id, teacher_id, preferred_room_id, periods_per_week, consecutive_periods, created_at, updated_at) VALUES ('lr', ?1, 's', 'sub', 't', 'r', 1, 1, ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        (temporary, connection)
    }

    #[test]
    fn persists_moves_and_supports_undo_redo_and_revert() {
        let (_temporary, mut connection) = database();
        let generated = generate(
            &mut connection,
            GenerateRequest {
                name: "مسودة 1".into(),
                solver_status: "success".into(),
                penalty_score: 0.0,
                entries: vec![GeneratedEntryInput {
                    lesson_requirement_id: "lr".into(),
                    section_id: "s".into(),
                    subject_id: "sub".into(),
                    teacher_id: Some("t".into()),
                    room_id: Some("r".into()),
                    weekday: 0,
                    period_index: 0,
                }],
            },
        )
        .unwrap();
        let version = generated.selected_version_id.unwrap();
        let entry = generated.entries[0].id.clone();
        let moved = move_lesson(
            &mut connection,
            MoveRequest {
                version_id: version.clone(),
                entry_id: entry,
                weekday: 0,
                period_index: 1,
            },
        )
        .unwrap();
        assert_eq!(moved.entries[0].period_index, 1);
        assert_eq!(
            undo(&mut connection, &version).unwrap().entries[0].period_index,
            0
        );
        assert_eq!(
            redo(&mut connection, &version).unwrap().entries[0].period_index,
            1
        );
        let reverted = revert(&mut connection, &version, "نسخة مستعادة").unwrap();
        assert_ne!(reverted.selected_version_id.unwrap(), version);
        assert_eq!(reverted.entries.len(), 1);
    }

    #[test]
    fn rejects_generation_that_breaks_unavailability() {
        let (_temporary, mut connection) = database();
        save_constraint(
            &mut connection,
            ConstraintInput {
                id: None,
                constraint_type: "teacher_unavailable".into(),
                strength: "hard".into(),
                weight: 1,
                payload: json!({"teacherId":"t","weekday":0,"periodIndex":0}),
                enabled: true,
            },
        )
        .unwrap();
        let result = generate(
            &mut connection,
            GenerateRequest {
                name: "مرفوض".into(),
                solver_status: "success".into(),
                penalty_score: 0.0,
                entries: vec![GeneratedEntryInput {
                    lesson_requirement_id: "lr".into(),
                    section_id: "s".into(),
                    subject_id: "sub".into(),
                    teacher_id: Some("t".into()),
                    room_id: Some("r".into()),
                    weekday: 0,
                    period_index: 0,
                }],
            },
        );
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn rejects_a_success_result_that_omits_required_periods() {
        let (_temporary, mut connection) = database();
        let result = generate(
            &mut connection,
            GenerateRequest {
                name: "نجاح ناقص".into(),
                solver_status: "success".into(),
                penalty_score: 0.0,
                entries: vec![],
            },
        );
        assert!(matches!(result, Err(AppError::Validation(_))));
    }
}
