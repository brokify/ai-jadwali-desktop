mod db;

use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Mutex};
use tauri::{Manager, State};
use thiserror::Error;

struct DatabaseState(Mutex<Option<PathBuf>>);

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
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SchoolSettings {
    school_name: String,
    academic_year: String,
    working_days: Vec<String>,
    periods_per_day: u8,
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
    Ok(serde_json::from_str(&json)?)
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
    validate_settings(&settings)?;
    let connection = db::initialize(&current_path(&state)?)?;
    store_settings(&connection, &settings)?;
    Ok(settings)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DatabaseState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            create_school_database,
            open_school_database,
            get_school_settings,
            save_school_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running AI Jadwali Desktop");
}
