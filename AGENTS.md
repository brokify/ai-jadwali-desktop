# AI Jadwali Desktop — Agent Guide

## Scope

This repository is a local-first Tauri desktop application. Do not add cloud services, authentication, networking, telemetry, Base44, Supabase, or Firebase. Windows is the primary target; code should remain portable to macOS.

## Architecture

- `src/`: React + TypeScript renderer. UI, routing, Zustand state, pure scheduling logic, and typed wrappers around `invoke` only.
- `src/lib/tauri.ts`: the renderer's narrow typed IPC boundary.
- `src-tauri/src/`: Rust application code, input validation, filesystem access, SQLite access, backups, and exports.
- `src-tauri/migrations/`: immutable, ordered SQLite migrations.
- `e2e/`: Playwright user-flow tests.

The renderer must never contain SQL, filesystem calls, shell calls, Node APIs, or direct database access. Every external input must be validated again in Rust. Prefer specific Tauri commands and field allowlists over generic query or filesystem commands.

## Commands

```bash
npm install
npm run dev
npm run tauri dev
npm test
npm run test:e2e
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
```

## Development rules

1. Keep Arabic RTL as the default and preserve English localization readiness.
2. Add loading, empty, success, and error states to user-facing flows.
3. Use migrations for schema changes; never rewrite a migration already released.
4. Archive linked reference data rather than hard-deleting it.
5. Add Vitest coverage for pure scheduling/domain logic and Rust tests for SQLite services.
6. Add Playwright coverage for critical user flows.
7. Never log school content, file paths, or personally identifying data externally.
8. Update `PROGRESS.md` at the end of each implementation phase.

## Git workflow

Make small, logical commits after each completed phase. Before committing, run the relevant frontend tests, Rust tests, TypeScript build, and review `git diff --check`.
