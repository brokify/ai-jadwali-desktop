mod db;
mod entities;
mod files;
mod imports;
mod preferences;
mod reports;
mod substitutions;
mod timetables;
mod users;

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, path::PathBuf, sync::Mutex};
use tauri::{Manager, State};
use thiserror::Error;

struct DatabaseState(Mutex<Option<PathBuf>>);

const WEEK_DAYS: [&str; 7] = [
    "الأحد",
    "الاثنين",
    "الثلاثاء",
    "الأربعاء",
    "الخميس",
    "الجمعة",
    "السبت",
];

#[derive(Debug, Error)]
enum AppError {
    #[error("لا يوجد ملف مدرسة مفتوح.")]
    DatabaseNotOpen,
    #[error("تعذر الوصول إلى مجلد بيانات التطبيق: {0}")]
    AppData(String),
    #[error("خطأ في قاعدة البيانات: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("إعدادات المدرسة غير صالحة: {0}")]
    Validation(String),
    #[error("خطأ في البيانات: {0}")]
    Json(#[from] serde_json::Error),
    #[error("تعذر قراءة الملف: {0}")]
    File(String),
    #[error("العنصر المطلوب غير موجود.")]
    NotFound,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        let message = match self {
            AppError::Database(rusqlite::Error::SqliteFailure(error, _))
                if error.code == rusqlite::ErrorCode::ConstraintViolation =>
            {
                "تعذر الحفظ: توجد قيمة مكررة أو علاقة مطلوبة غير صالحة.".to_owned()
            }
            _ => self.to_string(),
        };
        serializer.serialize_str(&message)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SchoolSettings {
    school_name: String,
    academic_year: String,
    working_days: Vec<String>,
    periods_per_day: u8,
    #[serde(default)]
    periods_by_day: BTreeMap<String, u8>,
    period_duration_minutes: u16,
    day_start_time: String,
    language: String,
}

#[derive(Debug, Serialize)]
struct SchoolDatabase {
    path: String,
    settings: SchoolSettings,
}

fn validate_settings(settings: &SchoolSettings) -> Result<(), AppError> {
    if settings.school_name.trim().is_empty() {
        return Err(AppError::Validation("اسم المدرسة مطلوب".into()));
    }
    if settings.academic_year.trim().is_empty() {
        return Err(AppError::Validation("السنة الأكاديمية مطلوبة".into()));
    }
    if settings.working_days.is_empty() {
        return Err(AppError::Validation("اختر يوم دوام واحدًا على الأقل".into()));
    }
    if !(1..=16).contains(&settings.periods_per_day) {
        return Err(AppError::Validation(
            "عدد الحصص يجب أن يكون بين 1 و16".into(),
        ));
    }
    if settings
        .working_days
        .iter()
        .any(|day| !WEEK_DAYS.contains(&day.as_str()))
    {
        return Err(AppError::Validation("يوجد يوم دوام غير صالح".into()));
    }
    let mut unique_days = settings.working_days.clone();
    unique_days.sort();
    unique_days.dedup();
    if unique_days.len() != settings.working_days.len() {
        return Err(AppError::Validation("لا يمكن تكرار يوم الدوام".into()));
    }
    for day in &settings.working_days {
        let periods = settings.periods_by_day.get(day).copied().unwrap_or(0);
        if !(1..=16).contains(&periods) {
            return Err(AppError::Validation(format!(
                "عدد حصص {day} يجب أن يكون بين 1 و16"
            )));
        }
    }
    if !(10..=180).contains(&settings.period_duration_minutes) {
        return Err(AppError::Validation(
            "مدة الحصة يجب أن تكون بين 10 و180 دقيقة".into(),
        ));
    }
    if !matches!(settings.language.as_str(), "ar" | "en") {
        return Err(AppError::Validation("اللغة غير مدعومة".into()));
    }
    Ok(())
}

fn normalize_settings(mut settings: SchoolSettings) -> SchoolSettings {
    settings
        .periods_by_day
        .retain(|day, _| settings.working_days.contains(day));
    for day in &settings.working_days {
        settings
            .periods_by_day
            .entry(day.clone())
            .or_insert(settings.periods_per_day);
    }
    settings
}

fn slug(value: &str) -> String {
    let clean: String = value
        .chars()
        .filter(|character| character.is_alphanumeric() || *character == '-' || *character == '_')
        .take(32)
        .collect();
    if clean.is_empty() {
        "school".into()
    } else {
        clean
    }
}

fn store_settings(connection: &Connection, settings: &SchoolSettings) -> Result<(), AppError> {
    let json = serde_json::to_string(settings)?;
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO app_settings (id, key, value_json, created_at, updated_at) VALUES ('school-settings', 'school_settings', ?1, ?2, ?2) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
        params![json, now],
    )?;
    connection.execute(
        "INSERT INTO schools (id, name, academic_year, language, created_at, updated_at) VALUES ('primary-school', ?1, ?2, ?3, ?4, ?4) ON CONFLICT(id) DO UPDATE SET name = excluded.name, academic_year = excluded.academic_year, language = excluded.language, updated_at = excluded.updated_at",
        params![settings.school_name.trim(), settings.academic_year.trim(), settings.language, now],
    )?;
    Ok(())
}

fn load_settings(connection: &Connection) -> Result<SchoolSettings, AppError> {
    let json: String = connection.query_row(
        "SELECT value_json FROM app_settings WHERE key = 'school_settings'",
        [],
        |row| row.get(0),
    )?;
    Ok(normalize_settings(serde_json::from_str(&json)?))
}

fn current_path(state: &State<DatabaseState>) -> Result<PathBuf, AppError> {
    state
        .0
        .lock()
        .map_err(|_| AppError::DatabaseNotOpen)?
        .clone()
        .ok_or(AppError::DatabaseNotOpen)
}

#[tauri::command]
fn create_school_database(
    app: tauri::AppHandle,
    state: State<DatabaseState>,
    settings: SchoolSettings,
) -> Result<SchoolDatabase, AppError> {
    let settings = normalize_settings(settings);
    validate_settings(&settings)?;
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::AppData(error.to_string()))?;
    std::fs::create_dir_all(&directory).map_err(|error| AppError::AppData(error.to_string()))?;
    let path = directory.join(format!(
        "{}-{}.jadwali.db",
        slug(&settings.school_name),
        Utc::now().format("%Y%m%d%H%M%S")
    ));
    let connection = db::initialize(&path)?;
    store_settings(&connection, &settings)?;
    *state.0.lock().map_err(|_| AppError::DatabaseNotOpen)? = Some(path.clone());
    Ok(SchoolDatabase {
        path: path.to_string_lossy().into_owned(),
        settings,
    })
}

#[tauri::command]
fn open_school_database(state: State<DatabaseState>) -> Result<Option<SchoolDatabase>, AppError> {
    let selected = rfd::FileDialog::new()
        .add_filter("Jadwali school database", &["db"])
        .pick_file();
    let Some(path) = selected else {
        return Ok(None);
    };
    let connection = db::initialize(&path)?;
    let settings = load_settings(&connection)?;
    *state.0.lock().map_err(|_| AppError::DatabaseNotOpen)? = Some(path.clone());
    Ok(Some(SchoolDatabase {
        path: path.to_string_lossy().into_owned(),
        settings,
    }))
}

#[tauri::command]
fn get_school_settings(state: State<DatabaseState>) -> Result<SchoolSettings, AppError> {
    let connection = db::initialize(&current_path(&state)?)?;
    load_settings(&connection)
}

#[tauri::command]
fn save_school_settings(
    state: State<DatabaseState>,
    settings: SchoolSettings,
) -> Result<SchoolSettings, AppError> {
    let settings = normalize_settings(settings);
    validate_settings(&settings)?;
    let connection = db::initialize(&current_path(&state)?)?;
    store_settings(&connection, &settings)?;
    Ok(settings)
}

#[tauri::command]
fn list_entities(
    state: State<DatabaseState>,
    entity_type: entities::EntityKind,
    include_archived: bool,
) -> Result<Vec<entities::EntityRecord>, AppError> {
    let connection = db::initialize(&current_path(&state)?)?;
    entities::list(&connection, entity_type, include_archived)
}

#[tauri::command]
fn create_entity(
    state: State<DatabaseState>,
    entity_type: entities::EntityKind,
    payload: serde_json::Value,
) -> Result<entities::EntityRecord, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    entities::create(&mut connection, entity_type, payload)
}

#[tauri::command]
fn update_entity(
    state: State<DatabaseState>,
    entity_type: entities::EntityKind,
    id: String,
    payload: serde_json::Value,
) -> Result<entities::EntityRecord, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    entities::update(&mut connection, entity_type, &id, payload)
}

#[tauri::command]
fn archive_entity(
    state: State<DatabaseState>,
    entity_type: entities::EntityKind,
    id: String,
    reason: Option<String>,
) -> Result<entities::EntityRecord, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    entities::set_archived(&mut connection, entity_type, &id, reason, true)
}

#[tauri::command]
fn restore_entity(
    state: State<DatabaseState>,
    entity_type: entities::EntityKind,
    id: String,
) -> Result<entities::EntityRecord, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    entities::set_archived(&mut connection, entity_type, &id, None, false)
}

#[tauri::command]
fn import_parse_file() -> Result<Option<imports::ImportFile>, AppError> {
    imports::pick_and_read_file()
}

#[tauri::command]
fn import_commit(
    state: State<DatabaseState>,
    request: imports::ImportCommitRequest,
) -> Result<imports::ImportCommitResult, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    imports::commit(&mut connection, request)
}

#[tauri::command]
fn get_import_overview(state: State<DatabaseState>) -> Result<imports::ImportOverview, AppError> {
    let connection = db::initialize(&current_path(&state)?)?;
    imports::overview(&connection)
}

#[tauri::command]
fn get_solver_context(state: State<DatabaseState>) -> Result<timetables::SolverContext, AppError> {
    let connection = db::initialize(&current_path(&state)?)?;
    timetables::context(&connection)
}

#[tauri::command]
fn list_constraints(
    state: State<DatabaseState>,
) -> Result<Vec<timetables::ConstraintRecord>, AppError> {
    let connection = db::initialize(&current_path(&state)?)?;
    timetables::list_constraints(&connection)
}

#[tauri::command]
fn save_constraint(
    state: State<DatabaseState>,
    input: timetables::ConstraintInput,
) -> Result<timetables::ConstraintRecord, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    timetables::save_constraint(&mut connection, input)
}

#[tauri::command]
fn archive_constraint(state: State<DatabaseState>, id: String) -> Result<(), AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    timetables::archive_constraint(&mut connection, &id)
}

#[tauri::command]
fn generate_timetable(
    state: State<DatabaseState>,
    request: timetables::GenerateRequest,
) -> Result<timetables::TimetableOverview, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    timetables::generate(&mut connection, request)
}

#[tauri::command]
fn get_timetable_overview(
    state: State<DatabaseState>,
    version_id: Option<String>,
) -> Result<timetables::TimetableOverview, AppError> {
    let connection = db::initialize(&current_path(&state)?)?;
    timetables::overview(&connection, version_id.as_deref())
}

#[tauri::command]
fn validate_lesson_move(
    state: State<DatabaseState>,
    request: timetables::MoveRequest,
) -> Result<timetables::MoveValidation, AppError> {
    let connection = db::initialize(&current_path(&state)?)?;
    timetables::validate_move(&connection, &request)
}

#[tauri::command]
fn move_lesson(
    state: State<DatabaseState>,
    request: timetables::MoveRequest,
) -> Result<timetables::TimetableOverview, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    timetables::move_lesson(&mut connection, request)
}

#[tauri::command]
fn undo_timetable_change(
    state: State<DatabaseState>,
    version_id: String,
) -> Result<timetables::TimetableOverview, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    timetables::undo(&mut connection, &version_id)
}

#[tauri::command]
fn redo_timetable_change(
    state: State<DatabaseState>,
    version_id: String,
) -> Result<timetables::TimetableOverview, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    timetables::redo(&mut connection, &version_id)
}

#[tauri::command]
fn revert_timetable_version(
    state: State<DatabaseState>,
    source_version_id: String,
    name: String,
) -> Result<timetables::TimetableOverview, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    timetables::revert(&mut connection, &source_version_id, &name)
}

#[tauri::command]
fn set_timetable_status(
    state: State<DatabaseState>,
    version_id: String,
    status: String,
) -> Result<timetables::TimetableOverview, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    timetables::set_status(&mut connection, &version_id, &status)
}

#[tauri::command]
fn get_substitution_overview(
    state: State<DatabaseState>,
    absence_date: String,
    absent_teacher_id: String,
) -> Result<substitutions::SubstitutionOverview, AppError> {
    let connection = db::initialize(&current_path(&state)?)?;
    substitutions::overview(&connection, &absence_date, &absent_teacher_id)
}

#[tauri::command]
fn create_substitution(
    state: State<DatabaseState>,
    request: substitutions::SubstitutionRequest,
) -> Result<substitutions::SubstitutionRecord, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    substitutions::create(&mut connection, request)
}

#[tauri::command]
fn get_reports(
    state: State<DatabaseState>,
    version_id: Option<String>,
) -> Result<reports::ReportsOverview, AppError> {
    let connection = db::initialize(&current_path(&state)?)?;
    reports::overview(&connection, version_id.as_deref())
}

#[tauri::command]
fn create_pdf_export(
    request: files::PdfExportRequest,
) -> Result<Option<files::FileOperationResult>, AppError> {
    files::save_pdf(request)
}

#[tauri::command]
fn create_csv_export(
    state: State<DatabaseState>,
    request: files::CsvExportRequest,
) -> Result<Option<files::FileOperationResult>, AppError> {
    let connection = db::initialize(&current_path(&state)?)?;
    files::save_csv(&connection, request)
}

#[tauri::command]
fn create_backup(
    state: State<DatabaseState>,
) -> Result<Option<files::FileOperationResult>, AppError> {
    files::create_backup(&current_path(&state)?)
}

#[tauri::command]
fn restore_backup(
    app: tauri::AppHandle,
    state: State<DatabaseState>,
    confirmed: bool,
) -> Result<Option<files::FileOperationResult>, AppError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::AppData(error.to_string()))?;
    files::restore_backup(&current_path(&state)?, &app_data, confirmed)
}

#[tauri::command]
fn get_backup_overview(
    app: tauri::AppHandle,
    state: State<DatabaseState>,
) -> Result<files::BackupOverview, AppError> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| AppError::AppData(error.to_string()))?;
    files::overview(&current_path(&state)?, &app_data)
}

#[tauri::command]
fn open_data_folder(state: State<DatabaseState>) -> Result<(), AppError> {
    let path = current_path(&state)?;
    files::open_folder(
        path.parent()
            .ok_or_else(|| AppError::File("مجلد البيانات غير صالح".into()))?,
    )
}

#[tauri::command]
fn get_app_preferences(
    state: State<DatabaseState>,
) -> Result<preferences::AppPreferences, AppError> {
    let connection = db::initialize(&current_path(&state)?)?;
    preferences::get(&connection)
}

#[tauri::command]
fn save_app_preferences(
    state: State<DatabaseState>,
    preferences: preferences::AppPreferences,
) -> Result<preferences::AppPreferences, AppError> {
    let connection = db::initialize(&current_path(&state)?)?;
    preferences::save(&connection, preferences)
}

#[tauri::command]
fn get_audit_logs(state: State<DatabaseState>) -> Result<Vec<preferences::AuditRecord>, AppError> {
    let connection = db::initialize(&current_path(&state)?)?;
    preferences::audit_logs(&connection)
}

#[tauri::command]
fn get_user_overview(state: State<DatabaseState>) -> Result<users::UserOverview, AppError> {
    let connection = db::initialize(&current_path(&state)?)?;
    users::overview(&connection)
}

#[tauri::command]
fn save_local_user(
    state: State<DatabaseState>,
    input: users::UserInput,
) -> Result<users::LocalUser, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    users::save_user(&mut connection, input)
}

#[tauri::command]
fn set_local_user_active(
    state: State<DatabaseState>,
    id: String,
    active: bool,
) -> Result<users::LocalUser, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    users::set_user_active(&mut connection, &id, active)
}

#[tauri::command]
fn save_user_role(
    state: State<DatabaseState>,
    input: users::RoleInput,
) -> Result<users::UserRole, AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    users::save_role(&mut connection, input)
}

#[tauri::command]
fn archive_user_role(state: State<DatabaseState>, id: String) -> Result<(), AppError> {
    let mut connection = db::initialize(&current_path(&state)?)?;
    users::archive_role(&mut connection, &id)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DatabaseState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            create_school_database,
            open_school_database,
            get_school_settings,
            save_school_settings,
            list_entities,
            create_entity,
            update_entity,
            archive_entity,
            restore_entity,
            import_parse_file,
            import_commit,
            get_import_overview,
            get_solver_context,
            list_constraints,
            save_constraint,
            archive_constraint,
            generate_timetable,
            get_timetable_overview,
            validate_lesson_move,
            move_lesson,
            undo_timetable_change,
            redo_timetable_change,
            revert_timetable_version,
            set_timetable_status,
            get_substitution_overview,
            create_substitution,
            get_reports,
            create_pdf_export,
            create_csv_export,
            create_backup,
            restore_backup,
            get_backup_overview,
            open_data_folder,
            get_app_preferences,
            save_app_preferences,
            get_audit_logs,
            get_user_overview,
            save_local_user,
            set_local_user_active,
            save_user_role,
            archive_user_role
        ])
        .run(tauri::generate_context!())
        .expect("error while running AI Jadwali Desktop");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn settings() -> SchoolSettings {
        SchoolSettings {
            school_name: "مدرسة الاختبار".into(),
            academic_year: "2026-2027".into(),
            working_days: vec!["الأحد".into(), "الخميس".into()],
            periods_per_day: 7,
            periods_by_day: BTreeMap::from([("الأحد".into(), 7), ("الخميس".into(), 5)]),
            period_duration_minutes: 45,
            day_start_time: "07:30".into(),
            language: "ar".into(),
        }
    }

    #[test]
    fn accepts_different_period_counts_per_working_day() {
        assert!(validate_settings(&settings()).is_ok());
    }

    #[test]
    fn fills_missing_day_counts_for_older_settings() {
        let mut old_settings = settings();
        old_settings.periods_by_day.clear();
        let normalized = normalize_settings(old_settings);
        assert_eq!(normalized.periods_by_day["الأحد"], 7);
        assert_eq!(normalized.periods_by_day["الخميس"], 7);
    }
}
