# AI Jadwali Desktop | جدولي لسطح المكتب

## العربية

تطبيق محلي أولًا لإدارة وإنشاء الجداول الدراسية. يعمل كتطبيق Tauri دون خدمات سحابية؛ تحفظ بيانات كل مدرسة في ملف SQLite محلي داخل بيانات التطبيق.

النسخة الحالية تدعم إنشاء وفتح ملف مدرسة، إعداد عدد الحصص لكل يوم، وإدارة البيانات واستيراد CSV/XLSX/XLS. كما تتضمن قيود عدم التوفر والتفضيلات، محرك جدولة محليًا خلف `SolverAdapter`، تشخيص التعارضات، نسخ جداول محلية، شبكة أسبوعية حسب الشعبة أو المعلم أو القاعة، نقل الحصص، undo/redo، النشر والأرشفة والاستعادة. وتكتمل الدورة بإدارة البدائل، تقارير حمل المعلمين واستخدام القاعات، تصدير PDF وCSV والطباعة، والنسخ الاحتياطي والاستعادة الآمنة، وإدارة ملفات المستخدمين والأدوار والصلاحيات محليًا.

إدارة المستخدمين تشغيلية داخل ملف المدرسة ولا تتضمن تسجيل دخول أو كلمات مرور أو حسابات سحابية. الأدوار والصلاحيات مهيأة لحوكمة بيانات المدرسة المحلية مع سجل تدقيق لكل تغيير.

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

إرشادات تجهيز الإصدار ومثبت Windows موثقة في [`RELEASE.md`](RELEASE.md).

### الخصوصية

لا يتضمن المشروع تسجيل دخول أو مزامنة أو اتصالات بخادم. الواجهة لا تصل إلى قاعدة البيانات أو نظام الملفات مباشرة؛ تمر العمليات المحلية عبر أوامر Rust محددة ومتحقق منها.

---

## English

A local-first desktop application for creating and managing school timetables. It runs as a Tauri app without cloud services. Each school's data is stored in a local SQLite file under the operating system's application-data directory.

The current build supports school files, per-day period counts, local data management, and CSV/XLSX/XLS imports. It also includes availability and preference constraints, a local solver behind `SolverAdapter`, conflict diagnostics, persisted timetable versions, weekly section/teacher/room views, validated lesson moves, undo/redo, publish/archive states, and version reverts. The workflow is completed by absence substitutions, teacher-load and room-usage reports, PDF/CSV/print export, validated backup and restore, and local user/role/permission management.

User management is operational governance stored inside the school file; it does not add login, passwords, cloud identities, or remote authentication. Every user and role change is recorded in the local audit log.

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

Release packaging and Windows installer instructions are documented in [`RELEASE.md`](RELEASE.md).

### Architecture and privacy

React contains no SQL, filesystem, shell, or Node access. A narrow typed IPC layer invokes specific Rust commands, where inputs are validated and all local I/O occurs. No login, cloud synchronization, telemetry, or network service is included.
