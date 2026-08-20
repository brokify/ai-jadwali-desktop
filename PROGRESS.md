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

### Deferred to phase 2+

- Entity CRUD and archive/restore services.
- Audit event writes.
- Import workflow, solver, timetable editor, substitutions, reports, exports, and backups.
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
