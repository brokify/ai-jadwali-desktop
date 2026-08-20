# AI Jadwali Desktop — Release Guide

## Release identity

- Product: AI Jadwali Desktop | جدولي
- Version: 1.0.0
- Identifier: `com.aijadwali.desktop`
- Data model: one local SQLite file per school
- Network services: none

## Windows build environment

Build Windows installers on a Windows 10/11 x64 machine. Cross-building the final MSI/NSIS installers from macOS is not a supported release verification path.

Install:

1. Node.js 20 or newer.
2. Rust stable with the `x86_64-pc-windows-msvc` target.
3. Microsoft Visual Studio Build Tools with **Desktop development with C++** and the Windows SDK.
4. WebView2 is bundled using Tauri's offline installer mode, so the produced installer can install without internet access.

Then run:

```powershell
npm ci
npm run release:verify
npm run check
npm audit
npm run test:e2e
npm run bundle:windows
```

Expected artifacts are written under:

```text
src-tauri\target\release\bundle\nsis\
src-tauri\target\release\bundle\msi\
```

## macOS verification build

On macOS with Xcode Command Line Tools:

```bash
npm ci
npm run release:verify
npm run check
npm audit
npm run test:e2e
npm run bundle:macos
```

Expected artifacts:

```text
src-tauri/target/release/bundle/macos/
src-tauri/target/release/bundle/dmg/
```

For a one-command Windows release after installing the prerequisites, run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

## Windows acceptance checklist

- Install from both the NSIS executable and MSI package on a clean Windows user account.
- Confirm the installer and Start menu shortcut use the Jadwali icon.
- Launch with the network disconnected and create a new school file.
- Verify Arabic RTL text, bundled Noto Kufi font, and window scaling at 100%, 125%, and 150%.
- Import representative CSV, XLSX, and XLS school files containing Arabic text.
- Generate a timetable containing days with different period counts.
- Move a lesson, undo/redo, publish, archive, and revert a timetable version.
- Register an absence substitution and export PDF and UTF-8 CSV reports.
- Create a backup, close the application, reopen it, and restore the backup.
- Create users and custom roles; verify the last-administrator safeguards.
- Confirm the application performs no network requests during normal use.
- Uninstall and confirm the installer removes application binaries. School database files should be backed up before uninstall testing.

## Signing before external distribution

The project intentionally contains no signing certificate or private key. Before distributing outside a controlled test group, obtain a Windows code-signing certificate and configure the CI/release machine through secure environment variables or the certificate store. Never commit certificate files, passwords, or signing secrets to this repository.
