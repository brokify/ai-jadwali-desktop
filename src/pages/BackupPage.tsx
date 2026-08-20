import { AlertTriangle, Check, DatabaseBackup, FolderOpen, HardDrive, RefreshCw, RotateCcw, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { desktopApi, isTauriRuntime, type BackupOverview } from "../lib/tauri";

const browserOverview: BackupOverview = { currentFileName: "school-demo.jadwali.db", automaticBackups: [] };

export function BackupPage() {
  const [overview, setOverview] = useState<BackupOverview>(browserOverview);
  const [loading, setLoading] = useState(isTauriRuntime());
  const [busy, setBusy] = useState("");
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    if (!isTauriRuntime()) return;
    try { setOverview(await desktopApi.getBackupOverview()); }
    catch (caught) { setError(typeof caught === "string" ? caught : "تعذر تحميل معلومات النسخ الاحتياطي."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);

  async function backup() {
    setBusy("backup"); setError(""); setMessage("");
    try {
      const result = isTauriRuntime() ? await desktopApi.createBackup() : { fileName: `jadwali-backup-${Date.now()}.jadwali-backup.db`, sizeBytes: 245760 };
      if (result) setMessage(`تم إنشاء النسخة الاحتياطية: ${result.fileName}`);
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر إنشاء النسخة الاحتياطية."); }
    finally { setBusy(""); }
  }

  async function restore() {
    setBusy("restore"); setError(""); setMessage("");
    try {
      const result = isTauriRuntime() ? await desktopApi.restoreBackup(true) : { fileName: "school-restored.jadwali-backup.db", sizeBytes: 245760 };
      if (result) { setMessage(`تمت الاستعادة من ${result.fileName}، وأنشئت نسخة تلقائية قبلها.`); setConfirmRestore(false); await load(); }
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر استعادة النسخة الاحتياطية."); }
    finally { setBusy(""); }
  }

  async function openFolder() {
    setError("");
    try { if (isTauriRuntime()) await desktopApi.openDataFolder(); else setMessage("تم فتح مجلد البيانات في تطبيق سطح المكتب."); }
    catch (caught) { setError(typeof caught === "string" ? caught : "تعذر فتح مجلد البيانات."); }
  }

  return <div className="page-stack backup-page">
    <section className="hero"><div><span className="eyebrow">حماية البيانات المحلية</span><h1>النسخ الاحتياطي</h1><p>صدّر ملف المدرسة إلى مكان تختاره، أو استعد نسخة سابقة بأمان.</p></div><span className="backup-health"><ShieldCheck />قاعدة البيانات محلية</span></section>
    {!isTauriRuntime() && <div className="browser-preview-notice">وضع معاينة المتصفح — عمليات الملفات محاكاة ولا تكتب على الجهاز.</div>}
    {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice saved"><Check />{message}</div>}
    <section className="backup-actions-grid">
      <article className="panel backup-action-card"><div className="backup-icon"><DatabaseBackup /></div><h2>إنشاء نسخة احتياطية</h2><p>اختر مكان الحفظ. تُضمّن النسخة أحدث تغييرات SQLite بعد إفراغ WAL بأمان.</p><button className="primary-button" onClick={() => void backup()} disabled={Boolean(busy)}>{busy === "backup" ? <RefreshCw className="spin" /> : <DatabaseBackup />}إنشاء نسخة الآن</button></article>
      <article className="panel backup-action-card restore"><div className="backup-icon"><RotateCcw /></div><h2>استعادة نسخة</h2><p>سيتحقق التطبيق من سلامة الملف وينشئ نسخة تلقائية من الحالة الحالية قبل الاستبدال.</p><button className="secondary-button" onClick={() => setConfirmRestore(true)} disabled={Boolean(busy)}><RotateCcw />اختيار نسخة للاستعادة</button></article>
      <article className="panel backup-action-card"><div className="backup-icon"><FolderOpen /></div><h2>مجلد البيانات</h2><p>الملف النشط: <strong>{loading ? "جارٍ التحميل…" : overview.currentFileName}</strong></p><button className="secondary-button" onClick={() => void openFolder()}><FolderOpen />فتح المجلد</button></article>
    </section>
    <section className="panel automatic-backups"><header><div><h2>النسخ التلقائية قبل الاستعادة</h2><p>يحتفظ التطبيق بهذه الملفات داخل مجلد بياناته المحلي.</p></div><HardDrive /></header>{overview.automaticBackups.length === 0 ? <div className="compact-empty">لا توجد نسخ تلقائية بعد.</div> : overview.automaticBackups.map((item) => <article key={item.fileName}><DatabaseBackup /><div><strong>{item.fileName}</strong><span>{(item.sizeBytes / 1024).toFixed(1)} KB</span></div><time>{item.modifiedAt ? new Date(item.modifiedAt).toLocaleString("ar") : "—"}</time></article>)}</section>
    {confirmRestore && <div className="modal-backdrop" onMouseDown={() => setConfirmRestore(false)}><section className="restore-dialog" role="dialog" aria-modal="true" aria-labelledby="restore-title" onMouseDown={(event) => event.stopPropagation()}><div className="warning-mark"><AlertTriangle /></div><h2 id="restore-title">تأكيد استعادة قاعدة البيانات</h2><p>سيُستبدل ملف المدرسة الحالي بالنسخة المحددة. سينشئ جدولي نسخة تلقائية قابلة للاسترجاع قبل تنفيذ العملية.</p><div><button className="ghost-button" onClick={() => setConfirmRestore(false)}>إلغاء</button><button className="danger-button" onClick={() => void restore()} disabled={busy === "restore"}>{busy === "restore" ? <RefreshCw className="spin" /> : <RotateCcw />}تأكيد الاستعادة</button></div></section></div>}
  </div>;
}
