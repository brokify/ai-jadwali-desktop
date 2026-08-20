# Implementation Progress

## Phase 1 — Bootstrap

Status: complete and locally validated on macOS (Apple Silicon).

### Completed

- Created an independent Git repository.
- Added Tauri v2, React, TypeScript, Vite, Tailwind CSS, Zustand, and React Router scaffolding.
- Added a responsive Arabic RTL shell with all eleven requested navigation destinations.
- Added dashboard, school setup form, and intentional later-phase placeholder states.
- Added a typed, narrow renderer-to-Rust IPC boundary.
- Added Rust commands for creating/opening a school database and reading/saving settings.
- Added SQLite initialization with foreign keys, WAL mode, and migration tracking.
- Added the full initial schema for all seventeen requested tables, relationships, constraints, and indexes.
- Added a bundled Noto Kufi Arabic font so the UI remains offline-capable.
- Added Vitest, Rust migration, and Playwright shell smoke tests.
- Added bilingual documentation and repository safety guidance.

### Deferred to later phases

- Substitutions, reports, exports, and backups.
- Full critical-path Playwright test, which depends on later-phase features.

### Known issues / decisions

- The initial database is created under the OS application-data directory. User-selected export and backup destinations are deferred to the backup phase.
- Opening an existing school database uses a Rust-native file picker and accepts only `.db` files.
- Scheduling is implemented as a pure TypeScript module behind `SolverAdapter`; persistence and defensive validation remain in Rust.

### Validation

- `npm test`: passed (1 Vitest smoke test).
- `npm run build`: passed (TypeScript and Vite production build).
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed (SQLite migration test).
- `npm run test:e2e`: passed (1 Playwright navigation flow).
- `npm audit`: passed with 0 known vulnerabilities.
- `npm run tauri dev`: compiled and launched the desktop executable successfully.

### Phase 1 refinements

- School setup now supports a different number of periods for each selected working day.
- Older school settings without per-day counts are normalized to the default period count when opened.

## Phase 2 — School data

Status: complete and locally validated on macOS (Apple Silicon).

### Completed

- Added a production data-management page for grades, sections, subjects, teachers, rooms, and lesson requirements.
- Added create and edit forms with per-field validation, duplicate-name prevention, reference selectors, loading, empty, search, error, and archived states.
- Added archive/restore without hard-delete paths for all six entity types.
- Added opening an existing school database and saving school settings into the active file.
- Added typed Tauri IPC wrappers for `list_entities`, `create_entity`, `update_entity`, `archive_entity`, and `restore_entity`.
- Added Rust-side entity and payload allowlists with `deny_unknown_fields` and static SQL per entity type.
- Added UUID identifiers and atomic AuditLog writes for create, update, archive, and restore actions.
- Added an in-memory browser preview; persisted operations remain exclusive to Rust/SQLite in the Tauri runtime.

### Validation

- `npm test`: passed (3 UI tests).
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed (6 Rust/SQLite tests).
- `npm run test:e2e`: passed (school setup plus grade create/archive/restore flow).
- `npm run build`: passed.
- `npm audit`: passed with 0 known vulnerabilities.
- `npm run tauri dev`: compiled and launched the desktop executable with the new IPC commands.

## Phase 3 — Spreadsheet import

Status: complete and locally validated on macOS (Apple Silicon).

### Completed

- Added a four-step Arabic RTL import workflow for CSV, XLSX, and legacy XLS files.
- Added Rust-native file selection and bounded local file reads; the React renderer receives only a typed base64 packet.
- Added worksheet selection, automatic Arabic/English column suggestions, manual mapping, and reusable mapping templates.
- Added Arabic/Persian digit normalization, name normalization, required-field checks, reference resolution, numeric validation, and duplicate detection.
- Added preview statuses before commit and partial imports that preserve valid rows while recording rejected rows.
- Added SQLite-backed import jobs, row errors, saved templates, and audit events.
- Added a local import-history screen and an in-memory sample workbook for browser-only UI development.
- Lazy-loaded the spreadsheet parser so the main application bundle remains compact.

### Validation

- `npm test`: passed (7 unit and UI tests).
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed (8 Rust/SQLite tests).
- `npm run test:e2e`: passed (school setup, data lifecycle, and spreadsheet import flow).
- `npm run build`: passed.
- `npm audit`: passed with 0 known vulnerabilities.
- `npm run tauri dev`: compiled and launched the desktop executable with the import IPC commands.

## Phase 4 — Solver and timetables

Status: complete and locally validated on macOS (Apple Silicon).

### Completed

- Added a testable `SolverAdapter` contract with a deterministic local backtracking/heuristic implementation.
- Added hard collision checks for sections, teachers, and rooms, teacher daily/weekly limits, and teacher/room unavailability.
- Added soft penalties for spreading a subject across days and avoiding the final period.
- Added `success`, `partial`, and `failed` results with Arabic conflict explanations and bounded search nodes.
- Added a constraints page for hard unavailability and soft scheduling preferences.
- Added Rust-side constraint payload allowlists, reference checks, working-slot validation, archive paths, and audit events.
- Added local timetable version persistence with defensive revalidation of every generated entry.
- Added a weekly RTL grid filtered by section, teacher, or room, including days with different period counts.
- Added drag/click lesson moves with immediate validation, session feedback, persisted undo/redo, draft/published/archived states, and revert-to-new-draft.
- Added browser-only sample scheduling data for UI preview without weakening the Tauri/SQLite persistence boundary.
- Lazy-loaded all phase-four pages into small route-specific bundles.

### Validation

- `npm test`: passed (12 solver, import, and UI tests).
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed (11 Rust/SQLite tests).
- `npm run test:e2e`: passed (school setup, data lifecycle, import, generation, valid lesson move, and undo availability).
- `npm run build`: passed.
- `npm audit`: passed with 0 known vulnerabilities.
- `npm run tauri dev`: compiled and launched the desktop executable with the scheduling IPC commands.

## Phase 5 — Desktop operations and release completion

Status: complete and locally validated on macOS (Apple Silicon).

### Completed

- Added absence-driven substitutions with date-aware lesson lookup, collision and availability checks, ranked replacement candidates, notes, history, and audit events.
- Added timetable reports for teacher load, room usage, section coverage, completion, hard conflicts, and soft-penalty quality.
- Added RTL PDF generation, filtered UTF-8 CSV export, and a print-optimized report layout.
- Added Rust-native save/open dialogs so the renderer never receives unrestricted filesystem access.
- Added SQLite backup with WAL checkpointing, integrity validation, automatic pre-restore safety copies, and explicit restore confirmation.
- Added local application preferences and a recent audit-log view.
- Added responsive Arabic RTL interfaces for substitutions, reports, backup/restore, and settings.
- Kept PDF libraries route- and action-lazy-loaded to preserve a compact startup bundle.
- Extended the critical browser workflow through generation, timetable editing, reporting, PDF export, and backup simulation.

### Validation

- `npm test`: passed (14 unit and UI tests).
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed (14 Rust/SQLite tests).
- `npm run test:e2e`: passed (1 complete critical-path Playwright flow).
- `npm run build`: passed with route-specific bundles.
- `npm audit`: passed with 0 known vulnerabilities.
- `npm run tauri dev`: compiled and launched the final desktop executable successfully.

## Enhancement — Local user management

Status: complete and locally validated on macOS (Apple Silicon).

### Completed

- Added an ordered SQLite migration for local users and roles that upgrades existing school files without rewriting prior migrations.
- Added three protected roles: system administrator, timetable coordinator, and report viewer.
- Added custom roles with an explicit allowlist of eleven school-operation permissions.
- Added create/edit, search, status filtering, role assignment, activation, and non-destructive deactivation for local users.
- Added safeguards requiring the first user to be an administrator and preventing deactivation of the last active administrator.
- Prevented demoting the last active administrator or removing the final effective management permission through a custom-role edit.
- Added safeguards preventing system-role edits and preventing role archival while users remain assigned.
- Added local audit events for every user and role mutation without external logging.
- Added responsive Arabic RTL desktop and mobile interfaces, including loading, empty, success, validation, and error states.
- Kept the feature local and operational: no passwords, login, cloud accounts, networking, or authentication service were introduced.

### Validation

- `npm test`: passed (15 unit and UI tests).
- `cargo test --manifest-path src-tauri/Cargo.toml`: passed (16 Rust/SQLite tests).
- `npm run test:e2e`: passed (critical path including local user creation).
- `npm run build`: passed with the user-management page in a lazy route bundle.
- `npm run tauri dev`: compiled and launched the desktop executable with the new migration and IPC commands.

## Release preparation — Version 1.0.0

Status: packaging configuration complete; macOS bundle validated; Windows installer build prepared for execution on Windows.

### Completed

- Synchronized version `1.0.0` across npm, Cargo, and Tauri metadata.
- Connected the complete Jadwali icon set to application and installer bundles.
- Added education-category, publisher, copyright, and local-first package descriptions.
- Configured Windows NSIS/MSI packaging, current-user installation, LZMA compression, offline WebView2 installation, and downgrade prevention.
- Added repeatable macOS and Windows bundle scripts plus an automated release-metadata verifier.
- Added a guarded PowerShell pipeline for clean Windows builds, tests, audits, and installer generation.
- Added a manual GitHub Actions Windows runner that builds and uploads both `.exe` and `.msi` as a private workflow artifact without publishing a release.
- Added Windows prerequisites, artifact locations, acceptance testing, and signing guidance in `RELEASE.md`.
- Produced and inspected the macOS `.app` and `AI Jadwali Desktop_1.0.0_aarch64.dmg` artifacts.

### Platform boundary

- Final `.exe` and `.msi` artifacts must be built and acceptance-tested on Windows 10/11 with MSVC and the Windows SDK. macOS cannot provide a trustworthy final verification of Windows-native installers.

### Validation

- `npm run release:verify`: passed with synchronized versions, icons, CSP, and offline Windows settings.
- `npm run check`: passed (15 frontend tests, production build, and 16 Rust/SQLite tests).
- `npm run test:e2e`: passed (complete critical local workflow).
- `npm audit`: passed with 0 known vulnerabilities.
- `npm run bundle:macos`: produced a 13 MB native application and a 4.8 MB arm64 DMG.
- Bundle metadata verified identifier `com.aijadwali.desktop`, version `1.0.0`, education category, and the configured Jadwali icon.
