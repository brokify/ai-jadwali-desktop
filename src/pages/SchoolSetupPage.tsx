import { useState, type FormEvent } from "react";
import { Database, FolderOpen, LoaderCircle, Save } from "lucide-react";
import { desktopApi, isTauriRuntime, type SchoolSettings } from "../lib/tauri";
import { useAppStore } from "../store/appStore";

const weekDays = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

const initialSettings: SchoolSettings = {
  schoolName: "",
  academicYear: "2026–2027",
  workingDays: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس"],
  periodsPerDay: 7,
  periodsByDay: {
    الأحد: 7,
    الاثنين: 7,
    الثلاثاء: 7,
    الأربعاء: 7,
    الخميس: 7,
  },
  periodDurationMinutes: 45,
  dayStartTime: "07:30",
  language: "ar",
};

export function SchoolSetupPage() {
  const [settings, setSettings] = useState(initialSettings);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState("");
  const setSchool = useAppStore((state) => state.setSchool);
  const databasePath = useAppStore((state) => state.databasePath);

  function update<Key extends keyof SchoolSettings>(key: Key, value: SchoolSettings[Key]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function toggleWorkingDay(day: string, checked: boolean) {
    setSettings((current) => {
      const periodsByDay = { ...current.periodsByDay };
      if (checked) periodsByDay[day] = periodsByDay[day] ?? current.periodsPerDay;
      else delete periodsByDay[day];

      return {
        ...current,
        workingDays: checked
          ? weekDays.filter((weekDay) => current.workingDays.includes(weekDay) || weekDay === day)
          : current.workingDays.filter((item) => item !== day),
        periodsByDay,
      };
    });
  }

  function updateDayPeriods(day: string, periods: number) {
    setSettings((current) => ({
      ...current,
      periodsByDay: { ...current.periodsByDay, [day]: periods },
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!settings.schoolName.trim()) { setStatus("error"); setMessage("أدخل اسم المدرسة."); return; }
    setStatus("saving");
    try {
      if (!isTauriRuntime()) {
        setStatus("error"); setMessage("إنشاء قاعدة البيانات متاح داخل تطبيق سطح المكتب فقط."); return;
      }
      const cleanSettings = { ...settings, schoolName: settings.schoolName.trim() };
      if (databasePath) {
        const saved = await desktopApi.saveSchoolSettings(cleanSettings);
        setSchool(saved, databasePath);
        setStatus("saved"); setMessage("تم حفظ إعدادات المدرسة.");
      } else {
        const result = await desktopApi.createSchoolDatabase(cleanSettings);
        setSchool(result.settings, result.path);
        setStatus("saved"); setMessage("تم إنشاء ملف المدرسة محليًا بنجاح.");
      }
    } catch (error) {
      setStatus("error"); setMessage(typeof error === "string" ? error : "تعذر إنشاء ملف المدرسة.");
    }
  }

  async function openExisting() {
    setStatus("saving");
    setMessage("");
    try {
      if (!isTauriRuntime()) {
        setStatus("error"); setMessage("فتح الملفات متاح داخل تطبيق سطح المكتب فقط."); return;
      }
      const result = await desktopApi.openSchoolDatabase();
      if (!result) { setStatus("idle"); return; }
      setSettings(result.settings);
      setSchool(result.settings, result.path);
      setStatus("saved"); setMessage("تم فتح ملف المدرسة بنجاح.");
    } catch (error) {
      setStatus("error"); setMessage(typeof error === "string" ? error : "تعذر فتح ملف المدرسة.");
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
          <label><span>عدد الحصص الافتراضي</span><input type="number" min="1" max="16" value={settings.periodsPerDay} onChange={(e) => update("periodsPerDay", Number(e.target.value))} /></label>
          <label><span>مدة الحصة بالدقائق</span><input type="number" min="10" max="180" value={settings.periodDurationMinutes} onChange={(e) => update("periodDurationMinutes", Number(e.target.value))} /></label>
          <label><span>بداية اليوم</span><input type="time" value={settings.dayStartTime} onChange={(e) => update("dayStartTime", e.target.value)} /></label>
          <fieldset className="wide"><legend>أيام الدوام</legend><div className="days">{weekDays.map((day) => <label key={day}><input type="checkbox" checked={settings.workingDays.includes(day)} onChange={(e) => toggleWorkingDay(day, e.target.checked)} />{day}</label>)}</div></fieldset>
          {settings.workingDays.length > 0 && (
            <fieldset className="wide day-periods-fieldset">
              <legend>عدد الحصص لكل يوم</legend>
              <p className="field-help">عدّل الأيام القصيرة فقط، واترك بقية الأيام على العدد المعتاد.</p>
              <div className="day-periods-grid">
                {settings.workingDays.map((day) => (
                  <label className="day-period-card" key={day}>
                    <span>{day}</span>
                    <input
                      aria-label={`عدد حصص ${day}`}
                      type="number"
                      min="1"
                      max="16"
                      value={settings.periodsByDay[day] ?? settings.periodsPerDay}
                      onChange={(event) => updateDayPeriods(day, Number(event.target.value))}
                    />
                    <small>حصة</small>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
        </div>
        {message && <div role="status" className={`notice ${status}`}>{message}</div>}
        <div className="form-actions school-form-actions"><button className="primary-button" disabled={status === "saving"}>{status === "saving" ? <LoaderCircle className="spin" /> : <Save />}{databasePath ? "حفظ الإعدادات" : "إنشاء ملف المدرسة"}</button><button type="button" className="secondary-button" onClick={() => void openExisting()} disabled={status === "saving"}><FolderOpen />فتح ملف مدرسة</button></div>
      </form>
    </div>
  );
}
