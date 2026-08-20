import { CalendarDays, Check, RefreshCw, Search, UserCheck, UserX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { demoSolverContext } from "../features/scheduler/sample";
import { localSolver } from "../features/scheduler/solver";
import { desktopApi, isTauriRuntime, type SolverContext, type SubstitutionOverview, type SubstitutionRecord } from "../lib/tauri";
import { useScheduleStore } from "../store/scheduleStore";

function browserOpportunities(context: SolverContext, date: string, teacherId: string, history: SubstitutionRecord[]): SubstitutionOverview {
  const result = localSolver.generate(context);
  const weekday = new Date(`${date}T12:00:00`).getDay();
  const opportunities = result.entries.filter((entry) => entry.teacherId === teacherId && entry.weekday === weekday).map((entry) => {
    const candidates = context.teacherNames.filter((teacher) => teacher.id !== teacherId && !result.entries.some((other) => other.teacherId === teacher.id && other.weekday === weekday && other.periodIndex === entry.periodIndex));
    return { entryId: entry.id, sectionName: context.sections.find((item) => item.id === entry.sectionId)?.name ?? "شعبة", subjectName: context.subjects.find((item) => item.id === entry.subjectId)?.name ?? "مادة", absentTeacherId: teacherId, absentTeacherName: context.teacherNames.find((item) => item.id === teacherId)?.name ?? "معلم", weekday, periodIndex: entry.periodIndex, candidates };
  });
  return { versionId: "browser-version", opportunities, history };
}

export function SubstitutionsPage() {
  const storedContext = useScheduleStore((state) => state.context);
  const [context, setContext] = useState<SolverContext>(storedContext ?? demoSolverContext);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [teacherId, setTeacherId] = useState((storedContext ?? demoSolverContext).teacherNames[0]?.id ?? "");
  const [overview, setOverview] = useState<SubstitutionOverview>({ versionId: null, opportunities: [], history: [] });
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(isTauriRuntime());
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isTauriRuntime()) return;
    desktopApi.getSolverContext().then((next) => { setContext(next); setTeacherId((current) => current || next.teacherNames[0]?.id || ""); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!teacherId) return;
    setLoading(true); setError("");
    if (isTauriRuntime()) {
      desktopApi.getSubstitutionOverview(date, teacherId).then(setOverview).catch((caught) => setError(typeof caught === "string" ? caught : "تعذر تحميل فرص التبديل.")).finally(() => setLoading(false));
    } else {
      setOverview((current) => browserOpportunities(context, date, teacherId, current.history)); setLoading(false);
    }
  }, [context, date, teacherId]);

  async function save(entryId: string) {
    const opportunity = overview.opportunities.find((item) => item.entryId === entryId); if (!opportunity) return;
    setSavingId(entryId); setError(""); setMessage("");
    try {
      const request = { timetableEntryId: entryId, absentTeacherId: opportunity.absentTeacherId, substituteTeacherId: selected[entryId] || undefined, absenceDate: date, notes: notes[entryId] || undefined };
      const record = isTauriRuntime() ? await desktopApi.createSubstitution(request) : { id: crypto.randomUUID(), absenceDate: date, sectionName: opportunity.sectionName, subjectName: opportunity.subjectName, absentTeacherName: opportunity.absentTeacherName, substituteTeacherName: opportunity.candidates.find((item) => item.id === selected[entryId])?.name ?? null, periodIndex: opportunity.periodIndex, notes: notes[entryId] || null, createdAt: new Date().toISOString() };
      setOverview((current) => ({ ...current, history: [record, ...current.history], opportunities: current.opportunities.filter((item) => item.entryId !== entryId) }));
      setMessage("تم تسجيل التبديل محليًا.");
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر تسجيل التبديل."); }
    finally { setSavingId(""); }
  }

  const teacherName = context.teacherNames.find((item) => item.id === teacherId)?.name;
  const todayHistory = useMemo(() => overview.history.filter((item) => item.absenceDate === date), [date, overview.history]);

  return <div className="page-stack substitutions-page">
    <section className="hero"><div><span className="eyebrow">إدارة الغياب</span><h1>التبديلات</h1><p>اعرض حصص المعلم الغائب واختر بديلًا لا يملك تعارضًا في الوقت نفسه.</p></div><span className="substitution-count"><UserCheck />{todayHistory.length} تبديل في اليوم</span></section>
    {!isTauriRuntime() && <div className="browser-preview-notice">وضع معاينة المتصفح — التبديلات مؤقتة داخل الجلسة.</div>}
    {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice saved"><Check />{message}</div>}
    <section className="panel absence-filter"><div><CalendarDays /><label><span>تاريخ الغياب</span><input aria-label="تاريخ الغياب" type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div><div><UserX /><label><span>المعلم الغائب</span><select aria-label="المعلم الغائب" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>{context.teacherNames.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select></label></div><button className="secondary-button" onClick={() => setDate(new Date().toISOString().slice(0, 10))}><Search />اليوم</button></section>
    <section className="substitution-layout">
      <section className="panel opportunity-panel"><header><div><h2>حصص {teacherName ?? "المعلم"}</h2><p>{date} · البدلاء مرتّبون حسب الحمل الأقل.</p></div><UserCheck /></header>{loading ? <div className="compact-empty"><RefreshCw className="spin" /> جارٍ البحث…</div> : overview.opportunities.length === 0 ? <div className="compact-empty"><Check />لا توجد حصص لهذا المعلم في التاريخ المحدد.</div> : overview.opportunities.map((item) => <article key={item.entryId}><div className="period-orb"><strong>{item.periodIndex + 1}</strong><span>الحصة</span></div><div className="opportunity-main"><strong>{item.subjectName}</strong><span>{item.sectionName}</span><label><span>المعلم البديل</span><select aria-label={`بديل ${item.subjectName} ${item.periodIndex + 1}`} value={selected[item.entryId] ?? ""} onChange={(event) => setSelected((current) => ({ ...current, [item.entryId]: event.target.value }))}><option value="">دون بديل حاليًا</option>{item.candidates.map((teacher) => <option value={teacher.id} key={teacher.id}>{teacher.name}</option>)}</select></label><input aria-label={`ملاحظات الحصة ${item.periodIndex + 1}`} placeholder="ملاحظات اختيارية" value={notes[item.entryId] ?? ""} onChange={(event) => setNotes((current) => ({ ...current, [item.entryId]: event.target.value }))} /></div><button className="primary-button" onClick={() => void save(item.entryId)} disabled={savingId === item.entryId}>{savingId === item.entryId ? <RefreshCw className="spin" /> : <UserCheck />}تسجيل</button></article>)}</section>
      <section className="panel substitution-history"><header><div><h2>سجل التبديلات</h2><p>آخر العمليات المحفوظة في ملف المدرسة.</p></div><CalendarDays /></header>{overview.history.length === 0 ? <div className="compact-empty">لا توجد تبديلات مسجلة.</div> : overview.history.map((item) => <article key={item.id}><time>{item.absenceDate}</time><div><strong>{item.subjectName} · {item.sectionName}</strong><span>{item.absentTeacherName} ← {item.substituteTeacherName ?? "دون بديل"}</span><small>الحصة {item.periodIndex + 1}{item.notes ? ` · ${item.notes}` : ""}</small></div></article>)}</section>
    </section>
  </div>;
}
