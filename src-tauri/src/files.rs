use crate::{db, AppError};
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::Utc;
use rusqlite::{params, Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use uuid::Uuid;

const SCHOOL_ID: &str = "primary-school";

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct PdfExportRequest {
    file_name: String,
    bytes_base64: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct CsvExportRequest {
    version_id: String,
    view_type: String,
    filter_id: String,
    file_name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileOperationResult {
    file_name: String,
    size_bytes: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupItem {
    file_name: String,
    size_bytes: u64,
    modified_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupOverview {
    current_file_name: String,
    automatic_backups: Vec<BackupItem>,
}

fn safe_name(value: &str, fallback: &str, extension: &str) -> String {
    let stem = value.trim().trim_end_matches(extension);
    let clean: String = stem
        .chars()
        .filter(|character| character.is_alphanumeric() || matches!(character, ' ' | '-' | '_'))
        .take(80)
        .collect();
    format!(
        "{}{}",
        if clean.trim().is_empty() {
            fallback
        } else {
            clean.trim()
        },
        extension
    )
}

fn write_pdf(path: &Path, bytes: &[u8]) -> Result<FileOperationResult, AppError> {
    if bytes.len() < 5 || !bytes.starts_with(b"%PDF-") || bytes.len() > 25 * 1024 * 1024 {
        return Err(AppError::Validation(
            "ملف PDF الناتج غير صالح أو كبير جدًا".into(),
        ));
    }
    std::fs::write(path, bytes).map_err(|error| AppError::File(error.to_string()))?;
    Ok(FileOperationResult {
        file_name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        size_bytes: bytes.len() as u64,
    })
}

pub fn save_pdf(request: PdfExportRequest) -> Result<Option<FileOperationResult>, AppError> {
    if request.bytes_base64.len() > 36 * 1024 * 1024 {
        return Err(AppError::Validation("بيانات PDF كبيرة جدًا".into()));
    }
    let bytes = STANDARD
        .decode(request.bytes_base64)
        .map_err(|_| AppError::Validation("ترميز PDF غير صالح".into()))?;
    let file_name = safe_name(&request.file_name, "jadwali-timetable", ".pdf");
    let Some(path) = rfd::FileDialog::new()
        .set_file_name(&file_name)
        .add_filter("PDF", &["pdf"])
        .save_file()
    else {
        return Ok(None);
    };
    Ok(Some(write_pdf(&path, &bytes)?))
}

fn csv_cell(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\"\""))
}

fn csv_bytes(connection: &Connection, request: &CsvExportRequest) -> Result<Vec<u8>, AppError> {
    if !matches!(request.view_type.as_str(), "section" | "teacher" | "room") {
        return Err(AppError::Validation("نوع تصدير CSV غير صالح".into()));
    }
    let (column, label) = match request.view_type.as_str() {
        "section" => ("e.section_id", "الشعبة"),
        "teacher" => ("e.teacher_id", "المعلم"),
        _ => ("e.room_id", "القاعة"),
    };
    let sql = format!(
        "SELECT e.weekday, e.period_index, sec.name, sub.name, COALESCE(t.name, ''), COALESCE(r.name, '') FROM timetable_entries e JOIN timetable_versions v ON v.id = e.timetable_version_id JOIN sections sec ON sec.id = e.section_id JOIN subjects sub ON sub.id = e.subject_id LEFT JOIN teachers t ON t.id = e.teacher_id LEFT JOIN rooms r ON r.id = e.room_id WHERE e.timetable_version_id = ?1 AND {column} = ?2 AND v.school_id = ?3 ORDER BY e.weekday, e.period_index"
    );
    let mut statement = connection.prepare(&sql)?;
    let rows = statement
        .query_map(
            params![request.version_id, request.filter_id, SCHOOL_ID],
            |row| {
                Ok((
                    row.get::<_, u8>(0)?,
                    row.get::<_, u8>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if rows.is_empty() {
        return Err(AppError::Validation(format!(
            "لا توجد حصص في عرض {label} المحدد"
        )));
    }
    let days = [
        "الأحد",
        "الاثنين",
        "الثلاثاء",
        "الأربعاء",
        "الخميس",
        "الجمعة",
        "السبت",
    ];
    let mut csv = String::from("اليوم,الحصة,الشعبة,المادة,المعلم,القاعة\r\n");
    for (weekday, period, section, subject, teacher, room) in rows {
        let values = [
            days.get(weekday as usize).unwrap_or(&"").to_string(),
            (period + 1).to_string(),
            section,
            subject,
            teacher,
            room,
        ];
        csv.push_str(
            &values
                .iter()
                .map(|value| csv_cell(value))
                .collect::<Vec<_>>()
                .join(","),
        );
        csv.push_str("\r\n");
    }
    Ok([vec![0xEF, 0xBB, 0xBF], csv.into_bytes()].concat())
}

pub fn save_csv(
    connection: &Connection,
    request: CsvExportRequest,
) -> Result<Option<FileOperationResult>, AppError> {
    let bytes = csv_bytes(connection, &request)?;
    let file_name = safe_name(&request.file_name, "jadwali-timetable", ".csv");
    let Some(path) = rfd::FileDialog::new()
        .set_file_name(&file_name)
        .add_filter("CSV", &["csv"])
        .save_file()
    else {
        return Ok(None);
    };
    std::fs::write(&path, &bytes).map_err(|error| AppError::File(error.to_string()))?;
    Ok(Some(FileOperationResult {
        file_name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        size_bytes: bytes.len() as u64,
    }))
}

fn audit(connection: &mut Connection, action: &str, details: Value) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO audit_logs (id, school_id, action, entity_type, details_json, created_at, updated_at) VALUES (?1, ?2, ?3, 'school_database', ?4, ?5, ?5)",
        params![Uuid::new_v4().to_string(), SCHOOL_ID, action, details.to_string(), now],
    )?;
    Ok(())
}

fn checkpoint(connection: &Connection) -> Result<(), AppError> {
    connection.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
    Ok(())
}

fn copy_database(source: &Path, destination: &Path) -> Result<FileOperationResult, AppError> {
    let size =
        std::fs::copy(source, destination).map_err(|error| AppError::File(error.to_string()))?;
    Ok(FileOperationResult {
        file_name: destination
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        size_bytes: size,
    })
}

pub fn create_backup(current_path: &Path) -> Result<Option<FileOperationResult>, AppError> {
    let suggested = format!(
        "jadwali-backup-{}.jadwali-backup.db",
        Utc::now().format("%Y%m%d-%H%M%S")
    );
    let Some(destination) = rfd::FileDialog::new()
        .set_file_name(&suggested)
        .add_filter("Jadwali backup", &["db"])
        .save_file()
    else {
        return Ok(None);
    };
    let mut connection = db::initialize(current_path)?;
    audit(
        &mut connection,
        "backup",
        json!({"fileName": destination.file_name().unwrap_or_default().to_string_lossy()}),
    )?;
    checkpoint(&connection)?;
    drop(connection);
    Ok(Some(copy_database(current_path, &destination)?))
}

fn validate_database(path: &Path) -> Result<(), AppError> {
    let connection = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let integrity: String = connection.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(AppError::Validation("ملف النسخة الاحتياطية تالف".into()));
    }
    for table in ["schools", "app_settings", "timetable_versions"] {
        let exists: bool = connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
            [table],
            |row| row.get(0),
        )?;
        if !exists {
            return Err(AppError::Validation(
                "الملف المحدد ليس نسخة جدولي صالحة".into(),
            ));
        }
    }
    Ok(())
}

fn automatic_backup_path(app_data: &Path) -> Result<PathBuf, AppError> {
    let directory = app_data.join("backups");
    std::fs::create_dir_all(&directory).map_err(|error| AppError::File(error.to_string()))?;
    Ok(directory.join(format!(
        "auto-before-restore-{}.jadwali-backup.db",
        Utc::now().format("%Y%m%d-%H%M%S")
    )))
}

pub fn restore_backup(
    current_path: &Path,
    app_data: &Path,
    confirmed: bool,
) -> Result<Option<FileOperationResult>, AppError> {
    if !confirmed {
        return Err(AppError::Validation("يجب تأكيد الاستعادة أولًا".into()));
    }
    let Some(source) = rfd::FileDialog::new()
        .add_filter("Jadwali backup", &["db"])
        .pick_file()
    else {
        return Ok(None);
    };
    validate_database(&source)?;
    let auto_path = automatic_backup_path(app_data)?;
    {
        let mut connection = db::initialize(current_path)?;
        audit(
            &mut connection,
            "backup before restore",
            json!({"fileName": auto_path.file_name().unwrap_or_default().to_string_lossy()}),
        )?;
        checkpoint(&connection)?;
    }
    copy_database(current_path, &auto_path)?;
    let temporary = current_path.with_extension("restore.tmp");
    std::fs::copy(&source, &temporary).map_err(|error| AppError::File(error.to_string()))?;
    if let Err(error) = validate_database(&temporary) {
        let _ = std::fs::remove_file(&temporary);
        return Err(error);
    }
    if let Err(error) = std::fs::copy(&temporary, current_path) {
        let _ = std::fs::copy(&auto_path, current_path);
        let _ = std::fs::remove_file(&temporary);
        return Err(AppError::File(error.to_string()));
    }
    let _ = std::fs::remove_file(&temporary);
    let mut restored = db::initialize(current_path)?;
    audit(
        &mut restored,
        "restore",
        json!({"fileName": source.file_name().unwrap_or_default().to_string_lossy(), "automaticBackup": auto_path.file_name().unwrap_or_default().to_string_lossy()}),
    )?;
    Ok(Some(FileOperationResult {
        file_name: source
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        size_bytes: std::fs::metadata(current_path)
            .map_err(|error| AppError::File(error.to_string()))?
            .len(),
    }))
}

pub fn overview(current_path: &Path, app_data: &Path) -> Result<BackupOverview, AppError> {
    let directory = app_data.join("backups");
    let mut automatic_backups = Vec::new();
    if directory.exists() {
        for entry in
            std::fs::read_dir(&directory).map_err(|error| AppError::File(error.to_string()))?
        {
            let entry = entry.map_err(|error| AppError::File(error.to_string()))?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("db") {
                continue;
            }
            let metadata = entry
                .metadata()
                .map_err(|error| AppError::File(error.to_string()))?;
            automatic_backups.push(BackupItem {
                file_name: entry.file_name().to_string_lossy().into_owned(),
                size_bytes: metadata.len(),
                modified_at: metadata
                    .modified()
                    .ok()
                    .map(chrono::DateTime::<Utc>::from)
                    .map(|date| date.to_rfc3339()),
            });
        }
        automatic_backups.sort_by(|a, b| b.modified_at.cmp(&a.modified_at));
        automatic_backups.truncate(20);
    }
    Ok(BackupOverview {
        current_file_name: current_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        automatic_backups,
    })
}

pub fn open_folder(path: &Path) -> Result<(), AppError> {
    #[cfg(target_os = "windows")]
    let mut command = std::process::Command::new("explorer");
    #[cfg(target_os = "macos")]
    let mut command = std::process::Command::new("open");
    #[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
    let mut command = std::process::Command::new("xdg-open");
    command
        .arg(path)
        .spawn()
        .map_err(|error| AppError::File(error.to_string()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_only_valid_pdf_bytes() {
        let temporary = tempfile::tempdir().unwrap();
        let path = temporary.path().join("test.pdf");
        assert!(write_pdf(&path, b"not-pdf").is_err());
        let result = write_pdf(&path, b"%PDF-1.4\n%%EOF").unwrap();
        assert_eq!(result.size_bytes, 14);
    }

    #[test]
    fn validates_and_copies_a_local_database_backup() {
        let temporary = tempfile::tempdir().unwrap();
        let source = temporary.path().join("source.db");
        let destination = temporary.path().join("backup.db");
        let connection = db::initialize(&source).unwrap();
        let now = Utc::now().to_rfc3339();
        connection.execute("INSERT INTO schools (id, name, academic_year, language, created_at, updated_at) VALUES (?1, 'مدرسة', '2026', 'ar', ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        drop(connection);
        copy_database(&source, &destination).unwrap();
        validate_database(&destination).unwrap();
    }
}
