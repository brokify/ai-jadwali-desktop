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

- Solver, timetable editor, substitutions, reports, exports, and backups.
- Full critical-path Playwright test, which depends on later-phase features.

### Known issues / decisions

- The initial database is created under the OS application-data directory. User-selected export and backup destinations are deferred to the backup phase.
- Opening an existing school database uses a Rust-native file picker and accepts only `.db` files.
- Scheduling remains a pure TypeScript module planned for phase 4 behind `SolverAdapter`.

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

### Deferred to phase 4+

- Local scheduling solver, constraint checks, diagnostics, and generated timetable persistence.
