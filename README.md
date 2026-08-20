# AI Jadwali Desktop | جدولي لسطح المكتب

## العربية

تطبيق محلي أولًا لإدارة وإنشاء الجداول الدراسية. يعمل كتطبيق Tauri دون خدمات سحابية؛ تحفظ بيانات كل مدرسة في ملف SQLite محلي داخل بيانات التطبيق.

### المتطلبات

- Node.js 20 أو أحدث
- Rust stable وCargo
- متطلبات Tauri v2 الخاصة بالنظام: على Windows يلزم Microsoft C++ Build Tools وWebView2؛ وعلى macOS يلزم Xcode Command Line Tools.

### التشغيل والتطوير

```bash
npm install
npm run tauri dev
```

لتشغيل الواجهة في المتصفح فقط (لن تعمل أوامر الملفات أو SQLite):

```bash
npm run dev
```

### الاختبارات والبناء

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run test:e2e
npm run build
npm run tauri build
```

### الخصوصية

لا يتضمن المشروع تسجيل دخول أو مزامنة أو اتصالات بخادم. الواجهة لا تصل إلى قاعدة البيانات أو نظام الملفات مباشرة؛ تمر العمليات المحلية عبر أوامر Rust محددة ومتحقق منها.

---

## English

A local-first desktop application for creating and managing school timetables. It runs as a Tauri app without cloud services. Each school's data is stored in a local SQLite file under the operating system's application-data directory.

### Requirements

- Node.js 20+
- Stable Rust and Cargo
- Tauri v2 platform prerequisites: Microsoft C++ Build Tools and WebView2 on Windows; Xcode Command Line Tools on macOS.

### Run locally

```bash
npm install
npm run tauri dev
```

Browser-only UI development is available with `npm run dev`; native file and SQLite commands require Tauri.

### Test and build

```bash
npm test
cargo test --manifest-path src-tauri/Cargo.toml
npm run test:e2e
npm run build
npm run tauri build
```

### Architecture and privacy

React contains no SQL, filesystem, shell, or Node access. A narrow typed IPC layer invokes specific Rust commands, where inputs are validated and all local I/O occurs. No login, cloud synchronization, telemetry, or network service is included.
