use crate::{entities, AppError};
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::Path;
use uuid::Uuid;

const SCHOOL_ID: &str = "primary-school";
const MAX_IMPORT_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportFile {
    file_name: String,
    extension: String,
    bytes_base64: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRowInput {
    row_number: i64,
    payload: Value,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCommitRequest {
    entity_type: entities::EntityKind,
    file_name: String,
    worksheet: String,
    mapping: Value,
    template_name: Option<String>,
    rows: Vec<ImportRowInput>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRowError {
    row_number: i64,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCommitResult {
    job_id: String,
    total_rows: usize,
    imported_rows: usize,
    error_rows: usize,
    errors: Vec<ImportRowError>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportJobSummary {
    id: String,
    file_name: String,
    entity_type: String,
    status: String,
    total_rows: i64,
    imported_rows: i64,
    error_rows: i64,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportTemplateSummary {
    id: String,
    name: String,
    entity_type: String,
    mapping: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredImportError {
    import_job_id: String,
    row_number: i64,
    message: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOverview {
    jobs: Vec<ImportJobSummary>,
    templates: Vec<ImportTemplateSummary>,
    errors: Vec<StoredImportError>,
}

fn clean_file_name(path: &Path) -> Result<(String, String), AppError> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| AppError::Validation("اسم الملف غير صالح".into()))?
        .to_owned();
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !matches!(extension.as_str(), "csv" | "xlsx" | "xls") {
        return Err(AppError::Validation(
            "الملف يجب أن يكون CSV أو XLSX أو XLS".into(),
        ));
    }
    Ok((file_name, extension))
}

pub fn pick_and_read_file() -> Result<Option<ImportFile>, AppError> {
    let selected = rfd::FileDialog::new()
        .add_filter("Spreadsheet", &["csv", "xlsx", "xls"])
        .pick_file();
    let Some(path) = selected else {
        return Ok(None);
    };
    let (file_name, extension) = clean_file_name(&path)?;
    let metadata = std::fs::metadata(&path).map_err(|error| AppError::File(error.to_string()))?;
    if metadata.len() > MAX_IMPORT_BYTES {
        return Err(AppError::Validation(
            "حجم ملف الاستيراد يتجاوز 20 ميجابايت".into(),
        ));
    }
    let bytes = std::fs::read(path).map_err(|error| AppError::File(error.to_string()))?;
    Ok(Some(ImportFile {
        file_name,
        extension,
        bytes_base64: STANDARD.encode(bytes),
    }))
}

pub fn commit(
    connection: &mut Connection,
    request: ImportCommitRequest,
) -> Result<ImportCommitResult, AppError> {
    if request.rows.is_empty() {
        return Err(AppError::Validation("لا توجد صفوف صالحة للاستيراد".into()));
    }
    if request.rows.len() > 20_000 {
        return Err(AppError::Validation(
            "الحد الأقصى للاستيراد هو 20,000 صف".into(),
        ));
    }
    let allowed_targets: &[&str] = match request.entity_type {
        entities::EntityKind::Grades => &["name", "sortOrder"],
        entities::EntityKind::Sections => &["name", "gradeId", "capacity"],
        entities::EntityKind::Subjects => &["name", "code", "color"],
        entities::EntityKind::Teachers => &[
            "name",
            "employeeCode",
            "maxPeriodsPerDay",
            "maxPeriodsPerWeek",
        ],
        entities::EntityKind::Rooms => &["name", "roomType", "capacity"],
        entities::EntityKind::LessonRequirements => &[
            "sectionId",
            "subjectId",
            "teacherId",
            "preferredRoomId",
            "periodsPerWeek",
            "consecutivePeriods",
        ],
    };
    let mapping = request
        .mapping
        .as_object()
        .ok_or_else(|| AppError::Validation("تعيين الأعمدة غير صالح".into()))?;
    if mapping.len() > 100
        || mapping.iter().any(|(header, target)| {
            header.chars().count() > 255
                || target
                    .as_str()
                    .is_none_or(|value| !allowed_targets.contains(&value))
        })
    {
        return Err(AppError::Validation("تعيين الأعمدة غير مسموح".into()));
    }
    if request.worksheet.trim().is_empty() || request.worksheet.chars().count() > 255 {
        return Err(AppError::Validation("اسم ورقة العمل غير صالح".into()));
    }
    if request
        .rows
        .iter()
        .any(|row| row.row_number < 1 || row.payload.to_string().len() > 65_536)
    {
        return Err(AppError::Validation("بيانات أحد الصفوف غير صالحة".into()));
    }
    let file_name = request.file_name.trim();
    if file_name.is_empty() || file_name.chars().count() > 255 {
        return Err(AppError::Validation("اسم الملف غير صالح".into()));
    }

    let job_id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    let mapping_json = request.mapping.to_string();
    connection.execute(
        "INSERT INTO import_jobs (id, school_id, file_name, entity_type, status, total_rows, imported_rows, error_rows, mapping_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 'preview', ?5, 0, 0, ?6, ?7, ?7)",
        params![job_id, SCHOOL_ID, file_name, request.entity_type.key(), request.rows.len() as i64, mapping_json, now],
    )?;

    let mut imported_rows = 0usize;
    let mut errors = Vec::new();
    for row in request.rows {
        match entities::create(connection, request.entity_type, row.payload.clone()) {
            Ok(_) => imported_rows += 1,
            Err(error) => {
                let message = error.to_string();
                let error_id = Uuid::new_v4().to_string();
                let error_json = serde_json::json!([{ "message": message }]);
                connection.execute(
                    "INSERT INTO import_row_errors (id, import_job_id, row_number, raw_json, errors_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
                    params![error_id, job_id, row.row_number, row.payload.to_string(), error_json.to_string(), Utc::now().to_rfc3339()],
                )?;
                errors.push(ImportRowError {
                    row_number: row.row_number,
                    message,
                });
            }
        }
    }

    let status = if imported_rows == 0 {
        "failed"
    } else {
        "completed"
    };
    connection.execute(
        "UPDATE import_jobs SET status = ?1, imported_rows = ?2, error_rows = ?3, updated_at = ?4 WHERE id = ?5",
        params![status, imported_rows as i64, errors.len() as i64, Utc::now().to_rfc3339(), job_id],
    )?;

    if let Some(template_name) = request.template_name {
        let clean = template_name.trim();
        if !clean.is_empty() && clean.chars().count() <= 80 {
            connection.execute(
                "INSERT INTO import_templates (id, school_id, name, entity_type, mapping_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6) ON CONFLICT(school_id, name, entity_type) DO UPDATE SET mapping_json = excluded.mapping_json, updated_at = excluded.updated_at, archived_at = NULL, archived_reason = NULL",
                params![Uuid::new_v4().to_string(), SCHOOL_ID, clean, request.entity_type.key(), request.mapping.to_string(), Utc::now().to_rfc3339()],
            )?;
        }
    }

    connection.execute(
        "INSERT INTO audit_logs (id, school_id, action, entity_type, entity_id, details_json, created_at, updated_at) VALUES (?1, ?2, 'import', 'import_job', ?3, ?4, ?5, ?5)",
        params![Uuid::new_v4().to_string(), SCHOOL_ID, job_id, serde_json::json!({ "worksheet": request.worksheet, "importedRows": imported_rows, "errorRows": errors.len() }).to_string(), Utc::now().to_rfc3339()],
    )?;

    Ok(ImportCommitResult {
        job_id,
        total_rows: imported_rows + errors.len(),
        imported_rows,
        error_rows: errors.len(),
        errors,
    })
}

pub fn overview(connection: &Connection) -> Result<ImportOverview, AppError> {
    let mut jobs_statement = connection.prepare("SELECT id, file_name, entity_type, status, total_rows, imported_rows, error_rows, created_at FROM import_jobs WHERE school_id = ?1 ORDER BY created_at DESC LIMIT 50")?;
    let jobs = jobs_statement
        .query_map([SCHOOL_ID], |row| {
            Ok(ImportJobSummary {
                id: row.get(0)?,
                file_name: row.get(1)?,
                entity_type: row.get(2)?,
                status: row.get(3)?,
                total_rows: row.get(4)?,
                imported_rows: row.get(5)?,
                error_rows: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut templates_statement = connection.prepare("SELECT id, name, entity_type, mapping_json FROM import_templates WHERE school_id = ?1 AND archived_at IS NULL ORDER BY updated_at DESC")?;
    let templates = templates_statement
        .query_map([SCHOOL_ID], |row| {
            let mapping_json: String = row.get(3)?;
            Ok(ImportTemplateSummary {
                id: row.get(0)?,
                name: row.get(1)?,
                entity_type: row.get(2)?,
                mapping: serde_json::from_str(&mapping_json).unwrap_or(Value::Null),
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut errors_statement = connection.prepare("SELECT import_job_id, row_number, errors_json FROM import_row_errors WHERE import_job_id IN (SELECT id FROM import_jobs WHERE school_id = ?1) ORDER BY created_at DESC LIMIT 100")?;
    let errors = errors_statement
        .query_map([SCHOOL_ID], |row| {
            let errors_json: String = row.get(2)?;
            let message = serde_json::from_str::<Value>(&errors_json)
                .ok()
                .and_then(|value| value.get(0)?.get("message")?.as_str().map(str::to_owned))
                .unwrap_or_else(|| "خطأ غير معروف".into());
            Ok(StoredImportError {
                import_job_id: row.get(0)?,
                row_number: row.get(1)?,
                message,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    Ok(ImportOverview {
        jobs,
        templates,
        errors,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> (tempfile::TempDir, Connection) {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("imports.jadwali.db");
        let connection = crate::db::initialize(&path).unwrap();
        connection.execute("INSERT INTO schools (id, name, academic_year, language, created_at, updated_at) VALUES (?1, 'مدرسة', '2026-2027', 'ar', ?2, ?2)", params![SCHOOL_ID, Utc::now().to_rfc3339()]).unwrap();
        (directory, connection)
    }

    #[test]
    fn commits_valid_rows_and_records_invalid_rows() {
        let (_directory, mut connection) = database();
        let result = commit(
            &mut connection,
            ImportCommitRequest {
                entity_type: entities::EntityKind::Grades,
                file_name: "grades.csv".into(),
                worksheet: "Sheet1".into(),
                mapping: serde_json::json!({ "الاسم": "name" }),
                template_name: Some("قالب الصفوف".into()),
                rows: vec![
                    ImportRowInput {
                        row_number: 2,
                        payload: serde_json::json!({ "name": "الأول", "sortOrder": 1 }),
                    },
                    ImportRowInput {
                        row_number: 3,
                        payload: serde_json::json!({ "name": "", "sortOrder": 2 }),
                    },
                ],
            },
        )
        .unwrap();
        assert_eq!(result.imported_rows, 1);
        assert_eq!(result.error_rows, 1);
        let overview = overview(&connection).unwrap();
        assert_eq!(overview.jobs.len(), 1);
        assert_eq!(overview.templates.len(), 1);
        assert_eq!(overview.errors.len(), 1);
    }

    #[test]
    fn rejects_mapping_targets_outside_the_entity_allowlist() {
        let (_directory, mut connection) = database();
        let result = commit(
            &mut connection,
            ImportCommitRequest {
                entity_type: entities::EntityKind::Grades,
                file_name: "grades.csv".into(),
                worksheet: "Sheet1".into(),
                mapping: serde_json::json!({ "الاسم": "unsafeSql" }),
                template_name: None,
                rows: vec![ImportRowInput {
                    row_number: 2,
                    payload: serde_json::json!({ "name": "الأول", "sortOrder": 1 }),
                }],
            },
        );
        assert!(matches!(result, Err(AppError::Validation(_))));
    }
}
