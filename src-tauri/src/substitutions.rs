use crate::AppError;
use chrono::{Datelike, NaiveDate, Utc};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

const SCHOOL_ID: &str = "primary-school";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateTeacher {
    id: String,
    name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubstitutionOpportunity {
    entry_id: String,
    section_name: String,
    subject_name: String,
    absent_teacher_id: String,
    absent_teacher_name: String,
    weekday: u8,
    period_index: u8,
    candidates: Vec<CandidateTeacher>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubstitutionRecord {
    id: String,
    absence_date: String,
    section_name: String,
    subject_name: String,
    absent_teacher_name: String,
    substitute_teacher_name: Option<String>,
    period_index: u8,
    notes: Option<String>,
    created_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubstitutionOverview {
    version_id: Option<String>,
    opportunities: Vec<SubstitutionOpportunity>,
    history: Vec<SubstitutionRecord>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SubstitutionRequest {
    timetable_entry_id: String,
    absent_teacher_id: String,
    substitute_teacher_id: Option<String>,
    absence_date: String,
    notes: Option<String>,
}

fn parse_date(value: &str) -> Result<NaiveDate, AppError> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| AppError::Validation("تاريخ الغياب غير صالح".into()))
}

fn active_version(connection: &Connection) -> Result<Option<String>, AppError> {
    Ok(connection
        .query_row(
            "SELECT id FROM timetable_versions WHERE school_id = ?1 ORDER BY CASE status WHEN 'published' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, created_at DESC LIMIT 1",
            [SCHOOL_ID],
            |row| row.get(0),
        )
        .optional()?)
}

fn candidates(
    connection: &Connection,
    version_id: &str,
    absent_teacher_id: &str,
    weekday: u8,
    period_index: u8,
) -> Result<Vec<CandidateTeacher>, AppError> {
    let mut statement = connection.prepare(
        "SELECT t.id, t.name FROM teachers t WHERE t.school_id = ?1 AND t.archived_at IS NULL AND t.id <> ?2
         AND NOT EXISTS (SELECT 1 FROM timetable_entries e WHERE e.timetable_version_id = ?3 AND e.teacher_id = t.id AND e.weekday = ?4 AND e.period_index = ?5)
         AND NOT EXISTS (SELECT 1 FROM constraints c WHERE c.school_id = ?1 AND c.constraint_type = 'teacher_unavailable' AND c.enabled = 1 AND c.archived_at IS NULL AND json_extract(c.payload_json, '$.teacherId') = t.id AND json_extract(c.payload_json, '$.weekday') = ?4 AND json_extract(c.payload_json, '$.periodIndex') = ?5)
         ORDER BY (SELECT COUNT(*) FROM timetable_entries load WHERE load.timetable_version_id = ?3 AND load.teacher_id = t.id), t.name",
    )?;
    let records = statement
        .query_map(
            params![
                SCHOOL_ID,
                absent_teacher_id,
                version_id,
                weekday,
                period_index
            ],
            |row| {
                Ok(CandidateTeacher {
                    id: row.get(0)?,
                    name: row.get(1)?,
                })
            },
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(records)
}

fn history(connection: &Connection) -> Result<Vec<SubstitutionRecord>, AppError> {
    let mut statement = connection.prepare(
        "SELECT s.id, s.absence_date, sec.name, sub.name, absent.name, replacement.name, e.period_index, s.notes, s.created_at
         FROM substitutions s JOIN timetable_entries e ON e.id = s.timetable_entry_id JOIN sections sec ON sec.id = e.section_id JOIN subjects sub ON sub.id = e.subject_id JOIN teachers absent ON absent.id = s.absent_teacher_id LEFT JOIN teachers replacement ON replacement.id = s.substitute_teacher_id
         WHERE s.school_id = ?1 ORDER BY s.absence_date DESC, e.period_index LIMIT 200",
    )?;
    let records = statement
        .query_map([SCHOOL_ID], |row| {
            Ok(SubstitutionRecord {
                id: row.get(0)?,
                absence_date: row.get(1)?,
                section_name: row.get(2)?,
                subject_name: row.get(3)?,
                absent_teacher_name: row.get(4)?,
                substitute_teacher_name: row.get(5)?,
                period_index: row.get(6)?,
                notes: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(records)
}

pub fn overview(
    connection: &Connection,
    absence_date: &str,
    absent_teacher_id: &str,
) -> Result<SubstitutionOverview, AppError> {
    let date = parse_date(absence_date)?;
    let weekday = date.weekday().num_days_from_sunday() as u8;
    let version_id = active_version(connection)?;
    let mut opportunities = Vec::new();
    if let Some(version_id) = &version_id {
        let mut statement = connection.prepare(
            "SELECT e.id, sec.name, sub.name, t.id, t.name, e.weekday, e.period_index FROM timetable_entries e JOIN sections sec ON sec.id = e.section_id JOIN subjects sub ON sub.id = e.subject_id JOIN teachers t ON t.id = e.teacher_id WHERE e.timetable_version_id = ?1 AND e.teacher_id = ?2 AND e.weekday = ?3 ORDER BY e.period_index",
        )?;
        let rows = statement
            .query_map(params![version_id, absent_teacher_id, weekday], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, u8>(5)?,
                    row.get::<_, u8>(6)?,
                ))
            })?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        drop(statement);
        for (
            entry_id,
            section_name,
            subject_name,
            teacher_id,
            teacher_name,
            weekday,
            period_index,
        ) in rows
        {
            opportunities.push(SubstitutionOpportunity {
                entry_id,
                section_name,
                subject_name,
                absent_teacher_id: teacher_id.clone(),
                absent_teacher_name: teacher_name,
                weekday,
                period_index,
                candidates: candidates(connection, version_id, &teacher_id, weekday, period_index)?,
            });
        }
    }
    Ok(SubstitutionOverview {
        version_id,
        opportunities,
        history: history(connection)?,
    })
}

fn audit(transaction: &Transaction<'_>, id: &str, date: &str) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    transaction.execute(
        "INSERT INTO audit_logs (id, school_id, action, entity_type, entity_id, details_json, created_at, updated_at) VALUES (?1, ?2, 'substitution', 'substitution', ?3, ?4, ?5, ?5)",
        params![Uuid::new_v4().to_string(), SCHOOL_ID, id, json!({"absenceDate": date}).to_string(), now],
    )?;
    Ok(())
}

pub fn create(
    connection: &mut Connection,
    request: SubstitutionRequest,
) -> Result<SubstitutionRecord, AppError> {
    let date = parse_date(&request.absence_date)?;
    let notes = request
        .notes
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty());
    if notes
        .as_ref()
        .is_some_and(|value| value.chars().count() > 500)
    {
        return Err(AppError::Validation("ملاحظات التبديل طويلة جدًا".into()));
    }
    let entry: Option<(String, u8, u8, String)> = connection.query_row(
        "SELECT timetable_version_id, weekday, period_index, teacher_id FROM timetable_entries WHERE id = ?1",
        [&request.timetable_entry_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).optional()?;
    let Some((version_id, weekday, period_index, original_teacher)) = entry else {
        return Err(AppError::NotFound);
    };
    if original_teacher != request.absent_teacher_id
        || date.weekday().num_days_from_sunday() as u8 != weekday
    {
        return Err(AppError::Validation(
            "الحصة لا تطابق المعلم أو يوم الغياب".into(),
        ));
    }
    let duplicate: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM substitutions WHERE timetable_entry_id = ?1 AND absence_date = ?2)",
        params![request.timetable_entry_id, request.absence_date], |row| row.get(0),
    )?;
    if duplicate {
        return Err(AppError::Validation(
            "تم تسجيل تبديل لهذه الحصة في التاريخ نفسه".into(),
        ));
    }
    if let Some(substitute_id) = &request.substitute_teacher_id {
        if substitute_id == &request.absent_teacher_id
            || !candidates(
                connection,
                &version_id,
                &request.absent_teacher_id,
                weekday,
                period_index,
            )?
            .iter()
            .any(|candidate| &candidate.id == substitute_id)
        {
            return Err(AppError::Validation(
                "المعلم البديل غير متاح لهذه الحصة".into(),
            ));
        }
    }
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let transaction = connection.transaction()?;
    transaction.execute(
        "INSERT INTO substitutions (id, school_id, timetable_entry_id, absent_teacher_id, substitute_teacher_id, absence_date, notes, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)",
        params![id, SCHOOL_ID, request.timetable_entry_id, request.absent_teacher_id, request.substitute_teacher_id, request.absence_date, notes, now],
    )?;
    audit(&transaction, &id, &request.absence_date)?;
    transaction.commit()?;
    history(connection)?
        .into_iter()
        .find(|item| item.id == id)
        .ok_or(AppError::NotFound)
}
