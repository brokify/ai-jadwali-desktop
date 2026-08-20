use crate::AppError;
use chrono::Utc;
#[cfg(test)]
use rusqlite::OptionalExtension;
use rusqlite::{params, Connection, Row, Transaction};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

const SCHOOL_ID: &str = "primary-school";

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EntityKind {
    Grades,
    Sections,
    Subjects,
    Teachers,
    Rooms,
    LessonRequirements,
}

impl EntityKind {
    fn table(self) -> &'static str {
        match self {
            Self::Grades => "grades",
            Self::Sections => "sections",
            Self::Subjects => "subjects",
            Self::Teachers => "teachers",
            Self::Rooms => "rooms",
            Self::LessonRequirements => "lesson_requirements",
        }
    }

    fn audit_name(self) -> &'static str {
        match self {
            Self::Grades => "grade",
            Self::Sections => "section",
            Self::Subjects => "subject",
            Self::Teachers => "teacher",
            Self::Rooms => "room",
            Self::LessonRequirements => "lesson_requirement",
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EntityRecord {
    id: String,
    entity_type: String,
    fields: Value,
    created_at: String,
    updated_at: String,
    archived_at: Option<String>,
    archived_reason: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct GradeInput {
    name: String,
    #[serde(default)]
    sort_order: i64,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct SectionInput {
    name: String,
    grade_id: String,
    capacity: Option<i64>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SubjectInput {
    name: String,
    code: Option<String>,
    color: Option<String>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct TeacherInput {
    name: String,
    employee_code: Option<String>,
    max_periods_per_day: Option<i64>,
    max_periods_per_week: Option<i64>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RoomInput {
    name: String,
    room_type: Option<String>,
    capacity: Option<i64>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RequirementInput {
    section_id: String,
    subject_id: String,
    teacher_id: Option<String>,
    preferred_room_id: Option<String>,
    periods_per_week: i64,
    #[serde(default = "one")]
    consecutive_periods: i64,
}

fn one() -> i64 {
    1
}

fn parse<T: DeserializeOwned>(payload: Value) -> Result<T, AppError> {
    serde_json::from_value(payload).map_err(|error| AppError::Validation(error.to_string()))
}

fn required_name(value: &str, label: &str) -> Result<String, AppError> {
    let clean = value.trim();
    if clean.is_empty() {
        return Err(AppError::Validation(format!("{label} مطلوب")));
    }
    if clean.chars().count() > 120 {
        return Err(AppError::Validation(format!("{label} طويل جدًا")));
    }
    Ok(clean.to_owned())
}

fn optional_text(
    value: Option<String>,
    max: usize,
    label: &str,
) -> Result<Option<String>, AppError> {
    value
        .map(|value| {
            let clean = value.trim();
            if clean.is_empty() {
                Ok(None)
            } else if clean.chars().count() > max {
                Err(AppError::Validation(format!("{label} طويل جدًا")))
            } else {
                Ok(Some(clean.to_owned()))
            }
        })
        .transpose()
        .map(Option::flatten)
}

fn positive_optional(value: Option<i64>, max: i64, label: &str) -> Result<Option<i64>, AppError> {
    if let Some(number) = value {
        if !(1..=max).contains(&number) {
            return Err(AppError::Validation(format!(
                "{label} يجب أن يكون بين 1 و{max}"
            )));
        }
    }
    Ok(value)
}

fn audit(
    transaction: &Transaction<'_>,
    action: &str,
    kind: EntityKind,
    id: &str,
    details: Value,
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    transaction.execute(
        "INSERT INTO audit_logs (id, school_id, action, entity_type, entity_id, details_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![Uuid::new_v4().to_string(), SCHOOL_ID, action, kind.audit_name(), id, details.to_string(), now],
    )?;
    Ok(())
}

fn common(row: &Row<'_>, entity_type: &str, fields: Value) -> rusqlite::Result<EntityRecord> {
    Ok(EntityRecord {
        id: row.get("id")?,
        entity_type: entity_type.to_owned(),
        fields,
        created_at: row.get("created_at")?,
        updated_at: row.get("updated_at")?,
        archived_at: row.get("archived_at")?,
        archived_reason: row.get("archived_reason")?,
    })
}

pub fn list(
    connection: &Connection,
    kind: EntityKind,
    include_archived: bool,
) -> Result<Vec<EntityRecord>, AppError> {
    let archived_filter = if include_archived {
        ""
    } else {
        " AND archived_at IS NULL"
    };
    let mut records = Vec::new();
    match kind {
        EntityKind::Grades => {
            let sql = format!("SELECT id, name, sort_order, created_at, updated_at, archived_at, archived_reason FROM grades WHERE school_id = ?1{archived_filter} ORDER BY sort_order, name");
            let mut statement = connection.prepare(&sql)?;
            let rows = statement.query_map([SCHOOL_ID], |row| {
                common(row, "grades", json!({ "name": row.get::<_, String>("name")?, "sortOrder": row.get::<_, i64>("sort_order")? }))
            })?;
            records.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        }
        EntityKind::Sections => {
            let sql = format!("SELECT id, name, grade_id, capacity, created_at, updated_at, archived_at, archived_reason FROM sections WHERE school_id = ?1{archived_filter} ORDER BY name");
            let mut statement = connection.prepare(&sql)?;
            let rows = statement.query_map([SCHOOL_ID], |row| {
                common(row, "sections", json!({ "name": row.get::<_, String>("name")?, "gradeId": row.get::<_, String>("grade_id")?, "capacity": row.get::<_, Option<i64>>("capacity")? }))
            })?;
            records.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        }
        EntityKind::Subjects => {
            let sql = format!("SELECT id, name, code, color, created_at, updated_at, archived_at, archived_reason FROM subjects WHERE school_id = ?1{archived_filter} ORDER BY name");
            let mut statement = connection.prepare(&sql)?;
            let rows = statement.query_map([SCHOOL_ID], |row| {
                common(row, "subjects", json!({ "name": row.get::<_, String>("name")?, "code": row.get::<_, Option<String>>("code")?, "color": row.get::<_, Option<String>>("color")? }))
            })?;
            records.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        }
        EntityKind::Teachers => {
            let sql = format!("SELECT id, name, employee_code, max_periods_per_day, max_periods_per_week, created_at, updated_at, archived_at, archived_reason FROM teachers WHERE school_id = ?1{archived_filter} ORDER BY name");
            let mut statement = connection.prepare(&sql)?;
            let rows = statement.query_map([SCHOOL_ID], |row| {
                common(row, "teachers", json!({ "name": row.get::<_, String>("name")?, "employeeCode": row.get::<_, Option<String>>("employee_code")?, "maxPeriodsPerDay": row.get::<_, Option<i64>>("max_periods_per_day")?, "maxPeriodsPerWeek": row.get::<_, Option<i64>>("max_periods_per_week")? }))
            })?;
            records.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        }
        EntityKind::Rooms => {
            let sql = format!("SELECT id, name, room_type, capacity, created_at, updated_at, archived_at, archived_reason FROM rooms WHERE school_id = ?1{archived_filter} ORDER BY name");
            let mut statement = connection.prepare(&sql)?;
            let rows = statement.query_map([SCHOOL_ID], |row| {
                common(row, "rooms", json!({ "name": row.get::<_, String>("name")?, "roomType": row.get::<_, Option<String>>("room_type")?, "capacity": row.get::<_, Option<i64>>("capacity")? }))
            })?;
            records.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        }
        EntityKind::LessonRequirements => {
            let sql = format!("SELECT id, section_id, subject_id, teacher_id, preferred_room_id, periods_per_week, consecutive_periods, created_at, updated_at, archived_at, archived_reason FROM lesson_requirements WHERE school_id = ?1{archived_filter} ORDER BY created_at DESC");
            let mut statement = connection.prepare(&sql)?;
            let rows = statement.query_map([SCHOOL_ID], |row| {
                common(row, "lesson_requirements", json!({ "sectionId": row.get::<_, String>("section_id")?, "subjectId": row.get::<_, String>("subject_id")?, "teacherId": row.get::<_, Option<String>>("teacher_id")?, "preferredRoomId": row.get::<_, Option<String>>("preferred_room_id")?, "periodsPerWeek": row.get::<_, i64>("periods_per_week")?, "consecutivePeriods": row.get::<_, i64>("consecutive_periods")? }))
            })?;
            records.extend(rows.collect::<rusqlite::Result<Vec<_>>>()?);
        }
    }
    Ok(records)
}

pub fn create(
    connection: &mut Connection,
    kind: EntityKind,
    payload: Value,
) -> Result<EntityRecord, AppError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let transaction = connection.transaction()?;
    match kind {
        EntityKind::Grades => {
            let input: GradeInput = parse(payload)?;
            let name = required_name(&input.name, "اسم الصف")?;
            transaction.execute("INSERT INTO grades (id, school_id, name, sort_order, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?5)", params![id, SCHOOL_ID, name, input.sort_order, now])?;
        }
        EntityKind::Sections => {
            let input: SectionInput = parse(payload)?;
            let name = required_name(&input.name, "اسم الشعبة")?;
            let capacity = positive_optional(input.capacity, 5000, "السعة")?;
            transaction.execute("INSERT INTO sections (id, school_id, grade_id, name, capacity, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)", params![id, SCHOOL_ID, input.grade_id, name, capacity, now])?;
        }
        EntityKind::Subjects => {
            let input: SubjectInput = parse(payload)?;
            let name = required_name(&input.name, "اسم المادة")?;
            let code = optional_text(input.code, 30, "رمز المادة")?;
            let color = optional_text(input.color, 20, "اللون")?;
            transaction.execute("INSERT INTO subjects (id, school_id, name, code, color, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)", params![id, SCHOOL_ID, name, code, color, now])?;
        }
        EntityKind::Teachers => {
            let input: TeacherInput = parse(payload)?;
            let name = required_name(&input.name, "اسم المعلم")?;
            let code = optional_text(input.employee_code, 40, "الرقم الوظيفي")?;
            let daily = positive_optional(input.max_periods_per_day, 16, "الحد اليومي")?;
            let weekly = positive_optional(input.max_periods_per_week, 100, "الحد الأسبوعي")?;
            transaction.execute("INSERT INTO teachers (id, school_id, name, employee_code, max_periods_per_day, max_periods_per_week, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)", params![id, SCHOOL_ID, name, code, daily, weekly, now])?;
        }
        EntityKind::Rooms => {
            let input: RoomInput = parse(payload)?;
            let name = required_name(&input.name, "اسم القاعة")?;
            let room_type = optional_text(input.room_type, 60, "نوع القاعة")?;
            let capacity = positive_optional(input.capacity, 5000, "السعة")?;
            transaction.execute("INSERT INTO rooms (id, school_id, name, room_type, capacity, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)", params![id, SCHOOL_ID, name, room_type, capacity, now])?;
        }
        EntityKind::LessonRequirements => {
            let input: RequirementInput = parse(payload)?;
            if !(1..=100).contains(&input.periods_per_week)
                || !(1..=8).contains(&input.consecutive_periods)
            {
                return Err(AppError::Validation(
                    "أعداد الحصص في المتطلب غير صالحة".into(),
                ));
            }
            transaction.execute("INSERT INTO lesson_requirements (id, school_id, section_id, subject_id, teacher_id, preferred_room_id, periods_per_week, consecutive_periods, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)", params![id, SCHOOL_ID, input.section_id, input.subject_id, input.teacher_id, input.preferred_room_id, input.periods_per_week, input.consecutive_periods, now])?;
        }
    }
    audit(&transaction, "create", kind, &id, json!({}))?;
    transaction.commit()?;
    get(connection, kind, &id)
}

pub fn update(
    connection: &mut Connection,
    kind: EntityKind,
    id: &str,
    payload: Value,
) -> Result<EntityRecord, AppError> {
    let now = Utc::now().to_rfc3339();
    let transaction = connection.transaction()?;
    let changed = match kind {
        EntityKind::Grades => {
            let input: GradeInput = parse(payload)?;
            let name = required_name(&input.name, "اسم الصف")?;
            transaction.execute("UPDATE grades SET name = ?1, sort_order = ?2, updated_at = ?3 WHERE id = ?4 AND school_id = ?5", params![name, input.sort_order, now, id, SCHOOL_ID])?
        }
        EntityKind::Sections => {
            let input: SectionInput = parse(payload)?;
            let name = required_name(&input.name, "اسم الشعبة")?;
            let capacity = positive_optional(input.capacity, 5000, "السعة")?;
            transaction.execute("UPDATE sections SET name = ?1, grade_id = ?2, capacity = ?3, updated_at = ?4 WHERE id = ?5 AND school_id = ?6", params![name, input.grade_id, capacity, now, id, SCHOOL_ID])?
        }
        EntityKind::Subjects => {
            let input: SubjectInput = parse(payload)?;
            let name = required_name(&input.name, "اسم المادة")?;
            let code = optional_text(input.code, 30, "رمز المادة")?;
            let color = optional_text(input.color, 20, "اللون")?;
            transaction.execute("UPDATE subjects SET name = ?1, code = ?2, color = ?3, updated_at = ?4 WHERE id = ?5 AND school_id = ?6", params![name, code, color, now, id, SCHOOL_ID])?
        }
        EntityKind::Teachers => {
            let input: TeacherInput = parse(payload)?;
            let name = required_name(&input.name, "اسم المعلم")?;
            let code = optional_text(input.employee_code, 40, "الرقم الوظيفي")?;
            let daily = positive_optional(input.max_periods_per_day, 16, "الحد اليومي")?;
            let weekly = positive_optional(input.max_periods_per_week, 100, "الحد الأسبوعي")?;
            transaction.execute("UPDATE teachers SET name = ?1, employee_code = ?2, max_periods_per_day = ?3, max_periods_per_week = ?4, updated_at = ?5 WHERE id = ?6 AND school_id = ?7", params![name, code, daily, weekly, now, id, SCHOOL_ID])?
        }
        EntityKind::Rooms => {
            let input: RoomInput = parse(payload)?;
            let name = required_name(&input.name, "اسم القاعة")?;
            let room_type = optional_text(input.room_type, 60, "نوع القاعة")?;
            let capacity = positive_optional(input.capacity, 5000, "السعة")?;
            transaction.execute("UPDATE rooms SET name = ?1, room_type = ?2, capacity = ?3, updated_at = ?4 WHERE id = ?5 AND school_id = ?6", params![name, room_type, capacity, now, id, SCHOOL_ID])?
        }
        EntityKind::LessonRequirements => {
            let input: RequirementInput = parse(payload)?;
            if !(1..=100).contains(&input.periods_per_week)
                || !(1..=8).contains(&input.consecutive_periods)
            {
                return Err(AppError::Validation(
                    "أعداد الحصص في المتطلب غير صالحة".into(),
                ));
            }
            transaction.execute("UPDATE lesson_requirements SET section_id = ?1, subject_id = ?2, teacher_id = ?3, preferred_room_id = ?4, periods_per_week = ?5, consecutive_periods = ?6, updated_at = ?7 WHERE id = ?8 AND school_id = ?9", params![input.section_id, input.subject_id, input.teacher_id, input.preferred_room_id, input.periods_per_week, input.consecutive_periods, now, id, SCHOOL_ID])?
        }
    };
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    audit(&transaction, "update", kind, id, json!({}))?;
    transaction.commit()?;
    get(connection, kind, id)
}

pub fn set_archived(
    connection: &mut Connection,
    kind: EntityKind,
    id: &str,
    reason: Option<String>,
    archived: bool,
) -> Result<EntityRecord, AppError> {
    let now = Utc::now().to_rfc3339();
    let transaction = connection.transaction()?;
    let table = kind.table();
    let sql = if archived {
        format!("UPDATE {table} SET archived_at = ?1, archived_reason = ?2, updated_at = ?1 WHERE id = ?3 AND school_id = ?4")
    } else {
        format!("UPDATE {table} SET archived_at = NULL, archived_reason = NULL, updated_at = ?1 WHERE id = ?3 AND school_id = ?4")
    };
    let changed = transaction.execute(&sql, params![now, reason, id, SCHOOL_ID])?;
    if changed == 0 {
        return Err(AppError::NotFound);
    }
    audit(
        &transaction,
        if archived { "archive" } else { "restore" },
        kind,
        id,
        json!({ "reason": reason }),
    )?;
    transaction.commit()?;
    get(connection, kind, id)
}

fn get(connection: &Connection, kind: EntityKind, id: &str) -> Result<EntityRecord, AppError> {
    list(connection, kind, true)?
        .into_iter()
        .find(|record| record.id == id)
        .ok_or(AppError::NotFound)
}

#[cfg(test)]
fn audit_count(connection: &Connection, action: &str) -> Result<i64, AppError> {
    Ok(connection
        .query_row(
            "SELECT COUNT(*) FROM audit_logs WHERE action = ?1",
            [action],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(0))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> (tempfile::TempDir, Connection) {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("entities.jadwali.db");
        let connection = crate::db::initialize(&path).unwrap();
        connection
            .execute(
                "INSERT INTO schools (id, name, academic_year, language, created_at, updated_at) VALUES (?1, 'مدرسة', '2026-2027', 'ar', ?2, ?2)",
                params![SCHOOL_ID, Utc::now().to_rfc3339()],
            )
            .unwrap();
        (directory, connection)
    }

    #[test]
    fn grade_lifecycle_writes_audit_events() {
        let (_directory, mut connection) = database();
        let created = create(
            &mut connection,
            EntityKind::Grades,
            json!({ "name": "الأول", "sortOrder": 1 }),
        )
        .unwrap();
        assert_eq!(created.fields["name"], "الأول");

        let updated = update(
            &mut connection,
            EntityKind::Grades,
            &created.id,
            json!({ "name": "الصف الأول", "sortOrder": 1 }),
        )
        .unwrap();
        assert_eq!(updated.fields["name"], "الصف الأول");

        let archived = set_archived(
            &mut connection,
            EntityKind::Grades,
            &created.id,
            Some("غير مستخدم".into()),
            true,
        )
        .unwrap();
        assert!(archived.archived_at.is_some());

        let restored = set_archived(
            &mut connection,
            EntityKind::Grades,
            &created.id,
            None,
            false,
        )
        .unwrap();
        assert!(restored.archived_at.is_none());
        assert_eq!(audit_count(&connection, "create").unwrap(), 1);
        assert_eq!(audit_count(&connection, "update").unwrap(), 1);
        assert_eq!(audit_count(&connection, "archive").unwrap(), 1);
        assert_eq!(audit_count(&connection, "restore").unwrap(), 1);
    }

    #[test]
    fn rejects_unknown_payload_fields() {
        let (_directory, mut connection) = database();
        let result = create(
            &mut connection,
            EntityKind::Subjects,
            json!({ "name": "رياضيات", "unsafeSql": "DROP TABLE subjects" }),
        );
        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn creates_the_full_reference_chain_and_lesson_requirement() {
        let (_directory, mut connection) = database();
        let grade = create(
            &mut connection,
            EntityKind::Grades,
            json!({ "name": "الأول", "sortOrder": 1 }),
        )
        .unwrap();
        let section = create(
            &mut connection,
            EntityKind::Sections,
            json!({ "name": "أ", "gradeId": grade.id, "capacity": 28 }),
        )
        .unwrap();
        let subject = create(
            &mut connection,
            EntityKind::Subjects,
            json!({ "name": "الرياضيات", "code": "MATH", "color": "#0b7168" }),
        )
        .unwrap();
        let teacher = create(
            &mut connection,
            EntityKind::Teachers,
            json!({ "name": "أحمد", "employeeCode": "T-01", "maxPeriodsPerDay": 6, "maxPeriodsPerWeek": 24 }),
        )
        .unwrap();
        let room = create(
            &mut connection,
            EntityKind::Rooms,
            json!({ "name": "قاعة 101", "roomType": "فصل", "capacity": 30 }),
        )
        .unwrap();
        let requirement = create(
            &mut connection,
            EntityKind::LessonRequirements,
            json!({ "sectionId": section.id, "subjectId": subject.id, "teacherId": teacher.id, "preferredRoomId": room.id, "periodsPerWeek": 5, "consecutivePeriods": 1 }),
        )
        .unwrap();

        assert_eq!(requirement.fields["periodsPerWeek"], 5);
        assert_eq!(
            list(&connection, EntityKind::LessonRequirements, false)
                .unwrap()
                .len(),
            1
        );
        assert_eq!(audit_count(&connection, "create").unwrap(), 6);
    }
}
