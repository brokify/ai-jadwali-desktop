import { Check, History, RefreshCw, Save, Settings2, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { desktopApi, isTauriRuntime, type AppPreferences, type AuditRecord } from "../lib/tauri";

const defaults: AppPreferences = { confirmBeforePublish: true, defaultExportView: "section", compactTimetable: false };
const actionLabels: Record<string, string> = { create: "إنشاء", update: "تحديث", archive: "أرشفة", restore: "استعادة", import: "استيراد", generate: "توليد جدول", "move lesson": "نقل حصة", substitution: "تبديل", backup: "نسخة احتياطية", "backup before restore": "نسخة تلقائية", "revert timetable version": "استعادة نسخة", "publish timetable": "نشر جدول", "archive timetable": "أرشفة جدول" };

export function SettingsPage() {
  const [preferences, setPreferences] = useState(defaults);
  const [audit, setAudit] = useState<AuditRecord[]>([]);
  const [loading, setLoading] = useState(isTauriRuntime());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (!isTauriRuntime()) { setAudit([{ id: "demo", action: "generate", entityType: "timetable_version", createdAt: new Date().toISOString() }]); return; }
    Promise.all([desktopApi.getAppPreferences(), desktopApi.getAuditLogs()]).then(([next, logs]) => { setPreferences(next); setAudit(logs); }).catch((caught) => setError(typeof caught === "string" ? caught : "تعذر تحميل الإعدادات.")).finally(() => setLoading(false));
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try { const next = isTauriRuntime() ? await desktopApi.saveAppPreferences(preferences) : preferences; setPreferences(next); setMessage("حُفظت تفضيلات التطبيق محليًا."); }
    catch (caught) { setError(typeof caught === "string" ? caught : "تعذر حفظ الإعدادات."); }
    finally { setSaving(false); }
  }
  return <div className="page-stack settings-page"><section className="hero"><div><span className="eyebrow">تفضيلات محلية</span><h1>الإعدادات</h1><p>خصص سلوك التطبيق وراجع سجل العمليات المحفوظ داخل ملف المدرسة.</p></div><span className="backup-health"><ShieldCheck />لا مزامنة سحابية</span></section>{!isTauriRuntime() && <div className="browser-preview-notice">وضع معاينة المتصفح — التفضيلات مؤقتة.</div>}{error && <div className="notice error">{error}</div>}{message && <div className="notice saved"><Check />{message}</div>}{loading ? <section className="panel generation-state"><RefreshCw className="spin" /></section> : <section className="settings-layout"><form className="panel preferences-card" onSubmit={save}><header><Settings2 /><div><h2>تفضيلات العمل</h2><p>تُحفظ في قاعدة بيانات المدرسة الحالية.</p></div></header><label className="setting-toggle"><div><strong>تأكيد قبل نشر الجدول</strong><span>يمنع نشر المسودة بالخطأ.</span></div><input type="checkbox" checked={preferences.confirmBeforePublish} onChange={(event) => setPreferences((current) => ({ ...current, confirmBeforePublish: event.target.checked }))} /></label><label className="setting-toggle"><div><strong>عرض جدول مدمج</strong><span>تقليل المسافات عند العرض والطباعة.</span></div><input type="checkbox" checked={preferences.compactTimetable} onChange={(event) => setPreferences((current) => ({ ...current, compactTimetable: event.target.checked }))} /></label><label className="setting-select"><span>عرض التصدير الافتراضي</span><select value={preferences.defaultExportView} onChange={(event) => setPreferences((current) => ({ ...current, defaultExportView: event.target.value as AppPreferences["defaultExportView"] }))}><option value="section">الشعبة</option><option value="teacher">المعلم</option><option value="room">القاعة</option></select></label><button className="primary-button" disabled={saving}>{saving ? <RefreshCw className="spin" /> : <Save />}حفظ التفضيلات</button></form><section className="panel audit-card"><header><History /><div><h2>سجل العمليات</h2><p>آخر 100 حدث محلي دون بيانات حساسة.</p></div></header>{audit.length === 0 ? <div className="compact-empty">لا توجد أحداث بعد.</div> : <div className="audit-list">{audit.map((item) => <article key={item.id}><i /><div><strong>{actionLabels[item.action] ?? item.action}</strong><span>{item.entityType}</span></div><time>{new Date(item.createdAt).toLocaleString("ar")}</time></article>)}</div>}</section></section>}</div>;
}
