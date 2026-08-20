use crate::AppError;
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::json;
use uuid::Uuid;

const SCHOOL_ID: &str = "primary-school";
const PERMISSIONS: [&str; 11] = [
    "manage_school",
    "manage_data",
    "manage_constraints",
    "generate_timetables",
    "manage_timetables",
    "manage_substitutions",
    "view_reports",
    "export_reports",
    "manage_backups",
    "manage_users",
    "manage_settings",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserRole {
    id: String,
    name: String,
    description: Option<String>,
    permissions: Vec<String>,
    is_system: bool,
    user_count: i64,
    archived_at: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalUser {
    id: String,
    full_name: String,
    username: String,
    email: Option<String>,
    phone: Option<String>,
    employee_number: Option<String>,
    role_id: String,
    role_name: String,
    notes: Option<String>,
    is_active: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserOverview {
    users: Vec<LocalUser>,
    roles: Vec<UserRole>,
    total_users: i64,
    active_users: i64,
    administrator_count: i64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct UserInput {
    id: Option<String>,
    full_name: String,
    username: String,
    email: Option<String>,
    phone: Option<String>,
    employee_number: Option<String>,
    role_id: String,
    notes: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RoleInput {
    id: Option<String>,
    name: String,
    description: Option<String>,
    permissions: Vec<String>,
}

fn required(value: &str, label: &str, max: usize) -> Result<String, AppError> {
    let clean = value.trim();
    if clean.is_empty() {
        return Err(AppError::Validation(format!("{label} مطلوب")));
    }
    if clean.chars().count() > max {
        return Err(AppError::Validation(format!("{label} طويل جدًا")));
    }
    Ok(clean.to_owned())
}

fn optional(value: Option<String>, label: &str, max: usize) -> Result<Option<String>, AppError> {
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

fn validate_username(value: &str) -> Result<String, AppError> {
    let clean = value.trim().to_lowercase();
    if !(3..=40).contains(&clean.chars().count()) {
        return Err(AppError::Validation(
            "اسم المستخدم يجب أن يكون بين 3 و40 حرفًا".into(),
        ));
    }
    if clean
        .chars()
        .any(|character| !(character.is_alphanumeric() || "._-".contains(character)))
    {
        return Err(AppError::Validation(
            "اسم المستخدم يقبل الحروف والأرقام والنقطة والشرطة فقط".into(),
        ));
    }
    Ok(clean)
}

fn validate_email(value: Option<String>) -> Result<Option<String>, AppError> {
    let email = optional(value, "البريد الإلكتروني", 160)?.map(|value| value.to_lowercase());
    if let Some(email) = &email {
        let parts: Vec<&str> = email.split('@').collect();
        if parts.len() != 2 || parts[0].is_empty() || !parts[1].contains('.') {
            return Err(AppError::Validation("البريد الإلكتروني غير صالح".into()));
        }
    }
    Ok(email)
}

fn validate_permissions(values: Vec<String>) -> Result<Vec<String>, AppError> {
    let mut clean = values;
    clean.sort();
    clean.dedup();
    if clean
        .iter()
        .any(|value| !PERMISSIONS.contains(&value.as_str()))
    {
        return Err(AppError::Validation("توجد صلاحية غير معروفة".into()));
    }
    Ok(clean)
}

fn ensure_default_roles(connection: &Connection) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    let defaults = [
        (
            "role-administrator",
            "مدير النظام",
            "وصول كامل إلى جميع وظائف المدرسة المحلية.",
            PERMISSIONS.to_vec(),
        ),
        (
            "role-scheduler",
            "منسق الجداول",
            "إدارة البيانات والقيود والجداول والبدائل والتقارير.",
            PERMISSIONS[..8].to_vec(),
        ),
        (
            "role-viewer",
            "مشاهد التقارير",
            "عرض التقارير وتصديرها دون تعديل البيانات.",
            vec!["view_reports", "export_reports"],
        ),
    ];
    for (id, name, description, permissions) in defaults {
        connection.execute(
            "INSERT OR IGNORE INTO user_roles (id, school_id, name, description, permissions_json, is_system, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)",
            params![id, SCHOOL_ID, name, description, serde_json::to_string(&permissions)?, now],
        )?;
    }
    Ok(())
}

fn audit(
    transaction: &Transaction<'_>,
    action: &str,
    entity_type: &str,
    entity_id: &str,
) -> Result<(), AppError> {
    let now = Utc::now().to_rfc3339();
    transaction.execute(
        "INSERT INTO audit_logs (id, school_id, action, entity_type, entity_id, details_json, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
        params![Uuid::new_v4().to_string(), SCHOOL_ID, action, entity_type, entity_id, json!({ "source": "local_user_management" }).to_string(), now],
    )?;
    Ok(())
}

fn role_has_permission(
    connection: &Connection,
    role_id: &str,
    permission: &str,
) -> Result<bool, AppError> {
    let raw: Option<String> = connection
        .query_row(
            "SELECT permissions_json FROM user_roles WHERE id = ?1 AND school_id = ?2 AND archived_at IS NULL",
            params![role_id, SCHOOL_ID],
            |row| row.get(0),
        )
        .optional()?;
    let Some(raw) = raw else {
        return Err(AppError::Validation("الدور المحدد غير متاح".into()));
    };
    Ok(serde_json::from_str::<Vec<String>>(&raw)?
        .iter()
        .any(|value| value == permission))
}

fn read_user(connection: &Connection, id: &str) -> Result<LocalUser, AppError> {
    connection
        .query_row(
            "SELECT u.id, u.full_name, u.username, u.email, u.phone, u.employee_number, u.role_id, r.name, u.notes, u.is_active, u.created_at, u.updated_at FROM users u JOIN user_roles r ON r.id = u.role_id WHERE u.id = ?1 AND u.school_id = ?2",
            params![id, SCHOOL_ID],
            |row| {
                Ok(LocalUser {
                    id: row.get(0)?,
                    full_name: row.get(1)?,
                    username: row.get(2)?,
                    email: row.get(3)?,
                    phone: row.get(4)?,
                    employee_number: row.get(5)?,
                    role_id: row.get(6)?,
                    role_name: row.get(7)?,
                    notes: row.get(8)?,
                    is_active: row.get::<_, i64>(9)? == 1,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                })
            },
        )
        .optional()?
        .ok_or(AppError::NotFound)
}

pub fn overview(connection: &Connection) -> Result<UserOverview, AppError> {
    ensure_default_roles(connection)?;
    let mut user_statement = connection.prepare(
        "SELECT u.id, u.full_name, u.username, u.email, u.phone, u.employee_number, u.role_id, r.name, u.notes, u.is_active, u.created_at, u.updated_at FROM users u JOIN user_roles r ON r.id = u.role_id WHERE u.school_id = ?1 ORDER BY u.is_active DESC, u.full_name",
    )?;
    let users = user_statement
        .query_map([SCHOOL_ID], |row| {
            Ok(LocalUser {
                id: row.get(0)?,
                full_name: row.get(1)?,
                username: row.get(2)?,
                email: row.get(3)?,
                phone: row.get(4)?,
                employee_number: row.get(5)?,
                role_id: row.get(6)?,
                role_name: row.get(7)?,
                notes: row.get(8)?,
                is_active: row.get::<_, i64>(9)? == 1,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut role_statement = connection.prepare(
        "SELECT r.id, r.name, r.description, r.permissions_json, r.is_system, COUNT(u.id), r.archived_at FROM user_roles r LEFT JOIN users u ON u.role_id = r.id WHERE r.school_id = ?1 GROUP BY r.id ORDER BY r.is_system DESC, r.name",
    )?;
    let roles = role_statement
        .query_map([SCHOOL_ID], |row| {
            let permissions: String = row.get(3)?;
            Ok(UserRole {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                permissions: serde_json::from_str(&permissions).unwrap_or_default(),
                is_system: row.get::<_, i64>(4)? == 1,
                user_count: row.get(5)?,
                archived_at: row.get(6)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let total_users = users.len() as i64;
    let active_users = users.iter().filter(|user| user.is_active).count() as i64;
    let administrator_count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM users u JOIN user_roles r ON r.id = u.role_id WHERE u.school_id = ?1 AND u.is_active = 1 AND EXISTS (SELECT 1 FROM json_each(r.permissions_json) WHERE value = 'manage_users')",
        [SCHOOL_ID],
        |row| row.get(0),
    )?;
    Ok(UserOverview {
        users,
        roles,
        total_users,
        active_users,
        administrator_count,
    })
}

pub fn save_user(connection: &mut Connection, input: UserInput) -> Result<LocalUser, AppError> {
    ensure_default_roles(connection)?;
    let full_name = required(&input.full_name, "الاسم الكامل", 120)?;
    let username = validate_username(&input.username)?;
    let email = validate_email(input.email)?;
    let phone = optional(input.phone, "رقم الهاتف", 32)?;
    let employee_number = optional(input.employee_number, "الرقم الوظيفي", 40)?;
    let notes = optional(input.notes, "الملاحظات", 500)?;
    let can_manage_users = role_has_permission(connection, &input.role_id, "manage_users")?;
    let active_count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM users WHERE school_id = ?1 AND is_active = 1",
        [SCHOOL_ID],
        |row| row.get(0),
    )?;
    if input.id.is_none() && active_count == 0 && !can_manage_users {
        return Err(AppError::Validation(
            "يجب أن يكون المستخدم الأول مديرًا للنظام".into(),
        ));
    }
    if let Some(existing_id) = input.id.as_deref() {
        let existing = read_user(connection, existing_id)?;
        if existing.is_active
            && role_has_permission(connection, &existing.role_id, "manage_users")?
            && !can_manage_users
        {
            let administrators: i64 = connection.query_row(
                "SELECT COUNT(*) FROM users u JOIN user_roles r ON r.id = u.role_id WHERE u.school_id = ?1 AND u.is_active = 1 AND EXISTS (SELECT 1 FROM json_each(r.permissions_json) WHERE value = 'manage_users')",
                [SCHOOL_ID],
                |row| row.get(0),
            )?;
            if administrators <= 1 {
                return Err(AppError::Validation("لا يمكن تغيير دور آخر مدير نشط".into()));
            }
        }
    }
    let now = Utc::now().to_rfc3339();
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let transaction = connection.transaction()?;
    let existing: bool = transaction
        .query_row(
            "SELECT 1 FROM users WHERE id = ?1 AND school_id = ?2",
            params![id, SCHOOL_ID],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false);
    if existing {
        transaction.execute(
            "UPDATE users SET full_name = ?1, username = ?2, email = ?3, phone = ?4, employee_number = ?5, role_id = ?6, notes = ?7, updated_at = ?8 WHERE id = ?9 AND school_id = ?10",
            params![full_name, username, email, phone, employee_number, input.role_id, notes, now, id, SCHOOL_ID],
        )?;
        audit(&transaction, "update", "user", &id)?;
    } else {
        transaction.execute(
            "INSERT INTO users (id, school_id, full_name, username, email, phone, employee_number, role_id, notes, is_active, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1, ?10, ?10)",
            params![id, SCHOOL_ID, full_name, username, email, phone, employee_number, input.role_id, notes, now],
        )?;
        audit(&transaction, "create", "user", &id)?;
    }
    transaction.commit()?;
    read_user(connection, &id)
}

pub fn set_user_active(
    connection: &mut Connection,
    id: &str,
    active: bool,
) -> Result<LocalUser, AppError> {
    let user = read_user(connection, id)?;
    if !active && user.is_active && role_has_permission(connection, &user.role_id, "manage_users")?
    {
        let administrators: i64 = connection.query_row(
            "SELECT COUNT(*) FROM users u JOIN user_roles r ON r.id = u.role_id WHERE u.school_id = ?1 AND u.is_active = 1 AND EXISTS (SELECT 1 FROM json_each(r.permissions_json) WHERE value = 'manage_users')",
            [SCHOOL_ID],
            |row| row.get(0),
        )?;
        if administrators <= 1 {
            return Err(AppError::Validation("لا يمكن تعطيل آخر مدير نشط".into()));
        }
    }
    let now = Utc::now().to_rfc3339();
    let transaction = connection.transaction()?;
    transaction.execute(
        "UPDATE users SET is_active = ?1, archived_at = ?2, updated_at = ?3 WHERE id = ?4 AND school_id = ?5",
        params![active as i64, if active { None::<String> } else { Some(now.clone()) }, now, id, SCHOOL_ID],
    )?;
    audit(
        &transaction,
        if active { "restore" } else { "archive" },
        "user",
        id,
    )?;
    transaction.commit()?;
    read_user(connection, id)
}

pub fn save_role(connection: &mut Connection, input: RoleInput) -> Result<UserRole, AppError> {
    ensure_default_roles(connection)?;
    let name = required(&input.name, "اسم الدور", 80)?;
    let description = optional(input.description, "وصف الدور", 240)?;
    let permissions = validate_permissions(input.permissions)?;
    if permissions.is_empty() {
        return Err(AppError::Validation("اختر صلاحية واحدة على الأقل".into()));
    }
    if let Some(existing_id) = input.id.as_deref() {
        let existing_permissions: Option<String> = connection
            .query_row(
                "SELECT permissions_json FROM user_roles WHERE id = ?1 AND school_id = ?2",
                params![existing_id, SCHOOL_ID],
                |row| row.get(0),
            )
            .optional()?;
        let previously_managed_users = existing_permissions
            .map(|raw| serde_json::from_str::<Vec<String>>(&raw))
            .transpose()?
            .unwrap_or_default()
            .iter()
            .any(|value| value == "manage_users");
        if previously_managed_users && !permissions.iter().any(|value| value == "manage_users") {
            let all_administrators: i64 = connection.query_row(
                "SELECT COUNT(*) FROM users u JOIN user_roles r ON r.id = u.role_id WHERE u.school_id = ?1 AND u.is_active = 1 AND EXISTS (SELECT 1 FROM json_each(r.permissions_json) WHERE value = 'manage_users')",
                [SCHOOL_ID],
                |row| row.get(0),
            )?;
            let affected_administrators: i64 = connection.query_row(
                "SELECT COUNT(*) FROM users WHERE school_id = ?1 AND role_id = ?2 AND is_active = 1",
                params![SCHOOL_ID, existing_id],
                |row| row.get(0),
            )?;
            if all_administrators <= affected_administrators {
                return Err(AppError::Validation(
                    "لا يمكن إزالة صلاحية الإدارة من آخر دور إداري نشط".into(),
                ));
            }
        }
    }
    let now = Utc::now().to_rfc3339();
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let transaction = connection.transaction()?;
    let system: Option<i64> = transaction
        .query_row(
            "SELECT is_system FROM user_roles WHERE id = ?1 AND school_id = ?2",
            params![id, SCHOOL_ID],
            |row| row.get(0),
        )
        .optional()?;
    if system == Some(1) {
        return Err(AppError::Validation(
            "الأدوار الأساسية محمية من التعديل".into(),
        ));
    }
    if system.is_some() {
        transaction.execute(
            "UPDATE user_roles SET name = ?1, description = ?2, permissions_json = ?3, updated_at = ?4 WHERE id = ?5 AND school_id = ?6",
            params![name, description, serde_json::to_string(&permissions)?, now, id, SCHOOL_ID],
        )?;
        audit(&transaction, "update", "user_role", &id)?;
    } else {
        transaction.execute(
            "INSERT INTO user_roles (id, school_id, name, description, permissions_json, is_system, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?6)",
            params![id, SCHOOL_ID, name, description, serde_json::to_string(&permissions)?, now],
        )?;
        audit(&transaction, "create", "user_role", &id)?;
    }
    transaction.commit()?;
    overview(connection)?
        .roles
        .into_iter()
        .find(|role| role.id == id)
        .ok_or(AppError::NotFound)
}

pub fn archive_role(connection: &mut Connection, id: &str) -> Result<(), AppError> {
    ensure_default_roles(connection)?;
    let role: Option<(i64, i64)> = connection
        .query_row(
            "SELECT r.is_system, COUNT(u.id) FROM user_roles r LEFT JOIN users u ON u.role_id = r.id WHERE r.id = ?1 AND r.school_id = ?2 GROUP BY r.id",
            params![id, SCHOOL_ID],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let Some((is_system, user_count)) = role else {
        return Err(AppError::NotFound);
    };
    if is_system == 1 {
        return Err(AppError::Validation(
            "الأدوار الأساسية محمية من الأرشفة".into(),
        ));
    }
    if user_count > 0 {
        return Err(AppError::Validation(
            "انقل المستخدمين إلى دور آخر قبل أرشفة هذا الدور".into(),
        ));
    }
    let now = Utc::now().to_rfc3339();
    let transaction = connection.transaction()?;
    transaction.execute(
        "UPDATE user_roles SET archived_at = ?1, updated_at = ?1 WHERE id = ?2 AND school_id = ?3",
        params![now, id, SCHOOL_ID],
    )?;
    audit(&transaction, "archive", "user_role", id)?;
    transaction.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn database() -> (tempfile::TempDir, Connection) {
        let temporary = tempfile::tempdir().unwrap();
        let path = temporary.path().join("users.jadwali.db");
        let connection = crate::db::initialize(&path).unwrap();
        let now = Utc::now().to_rfc3339();
        connection.execute("INSERT INTO schools (id, name, academic_year, language, created_at, updated_at) VALUES (?1, 'مدرسة', '2026', 'ar', ?2, ?2)", params![SCHOOL_ID, now]).unwrap();
        (temporary, connection)
    }

    #[test]
    fn manages_users_roles_and_protects_the_last_administrator() {
        let (_temporary, mut connection) = database();
        let first = overview(&connection).unwrap();
        assert_eq!(first.roles.len(), 3);
        let administrator = first
            .roles
            .iter()
            .find(|role| role.id == "role-administrator")
            .unwrap();
        let user = save_user(
            &mut connection,
            UserInput {
                id: None,
                full_name: "مدير المدرسة".into(),
                username: "admin.local".into(),
                email: Some("admin@example.test".into()),
                phone: None,
                employee_number: Some("A-1".into()),
                role_id: administrator.id.clone(),
                notes: None,
            },
        )
        .unwrap();
        assert!(user.is_active);
        assert!(set_user_active(&mut connection, &user.id, false).is_err());
        let viewer = overview(&connection)
            .unwrap()
            .roles
            .into_iter()
            .find(|role| role.id == "role-viewer")
            .unwrap();
        let demotion = save_user(
            &mut connection,
            UserInput {
                id: Some(user.id.clone()),
                full_name: user.full_name,
                username: user.username,
                email: user.email,
                phone: user.phone,
                employee_number: user.employee_number,
                role_id: viewer.id,
                notes: user.notes,
            },
        );
        assert!(demotion.is_err());
        assert_eq!(overview(&connection).unwrap().administrator_count, 1);
    }

    #[test]
    fn rejects_unknown_permissions_and_non_admin_first_user() {
        let (_temporary, mut connection) = database();
        let first = overview(&connection).unwrap();
        let viewer = first
            .roles
            .iter()
            .find(|role| role.id == "role-viewer")
            .unwrap();
        let result = save_user(
            &mut connection,
            UserInput {
                id: None,
                full_name: "مشاهد".into(),
                username: "viewer".into(),
                email: None,
                phone: None,
                employee_number: None,
                role_id: viewer.id.clone(),
                notes: None,
            },
        );
        assert!(result.is_err());
        let role = save_role(
            &mut connection,
            RoleInput {
                id: None,
                name: "غير صالح".into(),
                description: None,
                permissions: vec!["unknown".into()],
            },
        );
        assert!(role.is_err());
    }
}
