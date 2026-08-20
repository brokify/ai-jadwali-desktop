import { useState, type FormEvent } from "react";
import { Database, LoaderCircle, Save } from "lucide-react";
import { desktopApi, isTauriRuntime, type SchoolSettings } from "../lib/tauri";
import { useAppStore } from "../store/appStore";

const initialSettings: SchoolSettings = {
  schoolName: "",
  academicYear: "2026–2027",
  workingDays: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"],
  periodsPerDay: 7,
  periodDurationMinutes: 45,
  dayStartTime: "07:30",
  language: "ar",
};

export function SchoolSetupPage() {
  const [settings, setSettings] = useState(initialSettings);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const setSchool = useAppStore((state) => state.setSchool);

  function update<Key extends keyof SchoolSettings>(key: Key, value: SchoolSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!settings.schoolName.trim()) { setStatus("error"); setMessage("أدخل اسم المدرسة."); return; }
    setStatus("saving");
    try {
      if (!isTauriRuntime()) {
        setStatus("error"); setMessage("إنشاء قاعدة البيانات متاح داخل تطبيق سطح المكتب فقط."); return;
      }
      const result = await desktopApi.createSchoolDatabase({ ...settings, schoolName: settings.schoolName.trim() });
      setSchool(result.settings, result.path);
      setStatus("saved"); setMessage("تم إنشاء ملف المدرسة محليًا بنجاح.");
    } catch (error) {
      setStatus("error"); setMessage(typeof error === "string" ? error : "تعذر إنشاء ملف المدرسة.");
    }
  }

  return (
    <div className="page-stack">
      <section className="page-heading"><span className="eyebrow">الخطوة الأولى</span><h1>إعداد المدرسة</h1><p>تُحفظ هذه الإعدادات في قاعدة بيانات محلية خاصة بالمدرسة.</p></section>
      <form className="panel form-panel" onSubmit={submit}>
        <div className="section-title"><div className="stat-icon"><Database /></div><div><h2>بيانات المدرسة</h2><p>يمكن تعديلها لاحقًا من الإعدادات.</p></div></div>
        <div className="form-grid">
          <label className="wide"><span>اسم المدرسة</span><input value={settings.schoolName} onChange={(e) => update("schoolName", e.target.value)} placeholder="مثال: مدرسة المستقبل" autoFocus /></label>
          <label><span>السنة الأكاديمية</span><input value={settings.academicYear} onChange={(e) => update("academicYear", e.target.value)} /></label>
          <label><span>لغة التطبيق</span><select value={settings.language} onChange={(e) => update("language", e.target.value as "ar" | "en")}><option value="ar">العربية</option><option value="en">English</option></select></label>
          <label><span>عدد الحصص يوميًا</span><input type="number" min="1" max="16" value={settings.periodsPerDay} onChange={(e) => update("periodsPerDay", Number(e.target.value))} /></label>
          <label><span>مدة الحصة بالدقائق</span><input type="number" min="10" max="180" value={settings.periodDurationMinutes} onChange={(e) => update("periodDurationMinutes", Number(e.target.value))} /></label>
          <label><span>بداية اليوم</span><input type="time" value={settings.dayStartTime} onChange={(e) => update("dayStartTime", e.target.value)} /></label>
          <fieldset className="wide"><legend>أيام الدوام</legend><div className="days">{["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"].map((day) => <label key={day}><input type="checkbox" checked={settings.workingDays.includes(day)} onChange={(e) => update("workingDays", e.target.checked ? [...settings.workingDays, day] : settings.workingDays.filter((item) => item !== day))} />{day}</label>)}</div></fieldset>
        </div>
        {message && <div role="status" className={`notice ${status}`}>{message}</div>}
        <div className="form-actions"><button className="primary-button" disabled={status === "saving"}>{status === "saving" ? <LoaderCircle className="spin" /> : <Save />}إنشاء ملف المدرسة</button></div>
      </form>
    </div>
  );
}
