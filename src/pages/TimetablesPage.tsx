import { Archive, Check, ChevronDown, Clock3, Copy, Filter, Redo2, RefreshCw, Send, Undo2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { validateMove } from "../features/scheduler/solver";
import type { TimetableEntry } from "../features/scheduler/types";
import { desktopApi, isTauriRuntime, type LookupItem, type SolverContext, type TimetableOverview } from "../lib/tauri";
import { useScheduleStore } from "../store/scheduleStore";

type FilterType = "section" | "teacher" | "room";

export function TimetablesPage() {
  const storedContext = useScheduleStore((state) => state.context);
  const storedOverview = useScheduleStore((state) => state.overview);
  const setStoredContext = useScheduleStore((state) => state.setContext);
  const setStoredOverview = useScheduleStore((state) => state.setOverview);
  const [context, setContext] = useState<SolverContext | null>(storedContext);
  const [overview, setOverview] = useState<TimetableOverview | null>(storedOverview);
  const [filterType, setFilterType] = useState<FilterType>("section");
  const [filterId, setFilterId] = useState(storedContext?.sections[0]?.id ?? "");
  const [selectedEntry, setSelectedEntry] = useState("");
  const [loading, setLoading] = useState(isTauriRuntime());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [undoStack, setUndoStack] = useState<TimetableOverview[]>([]);
  const [redoStack, setRedoStack] = useState<TimetableOverview[]>([]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    Promise.all([desktopApi.getSolverContext(), desktopApi.getTimetableOverview()])
      .then(([nextContext, nextOverview]) => {
        setContext(nextContext); setStoredContext(nextContext); setOverview(nextOverview); setStoredOverview(nextOverview);
        setFilterId(nextContext.sections[0]?.id ?? "");
      })
      .catch((caught) => setError(typeof caught === "string" ? caught : "تعذر تحميل الجداول."))
      .finally(() => setLoading(false));
  }, []);

  const options: LookupItem[] = context ? filterType === "section" ? context.sections : filterType === "teacher" ? context.teacherNames : context.rooms : [];
  const entries = overview?.entries ?? [];
  const visibleEntries = useMemo(() => entries.filter((entry) => filterType === "section" ? entry.sectionId === filterId : filterType === "teacher" ? entry.teacherId === filterId : entry.roomId === filterId), [entries, filterId, filterType]);
  const maxPeriods = Math.max(0, ...(context?.days.map((day) => day.periods) ?? []));
  const selectedVersion = overview?.versions.find((version) => version.id === overview.selectedVersionId);

  function name(list: LookupItem[] | undefined, id: string | null) { return list?.find((item) => item.id === id)?.name ?? "—"; }
  function entryTitle(entry: TimetableEntry) { return name(context?.subjects, entry.subjectId); }
  function entryDetail(entry: TimetableEntry) {
    if (filterType === "section") return name(context?.teacherNames, entry.teacherId);
    if (filterType === "teacher") return name(context?.sections, entry.sectionId);
    return name(context?.sections, entry.sectionId);
  }

  function applyOverview(next: TimetableOverview) { setOverview(next); setStoredOverview(next); }

  async function move(entryId: string, weekday: number, periodIndex: number) {
    if (!overview?.selectedVersionId || !context) return;
    const current = entries.find((entry) => entry.id === entryId);
    if (!current || (current.weekday === weekday && current.periodIndex === periodIndex)) { setSelectedEntry(""); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      if (isTauriRuntime()) {
        const request = { versionId: overview.selectedVersionId, entryId, weekday, periodIndex };
        const validation = await desktopApi.validateLessonMove(request);
        if (!validation.valid) throw new Error(validation.message);
        applyOverview(await desktopApi.moveLesson(request));
        setMessage(validation.message);
      } else {
        const validation = validateMove(context, entries, entryId, weekday, periodIndex);
        if (!validation.valid) throw new Error(validation.message);
        setUndoStack((stack) => [...stack, overview]); setRedoStack([]);
        applyOverview({ ...overview, entries: entries.map((entry) => entry.id === entryId ? { ...entry, weekday, periodIndex } : entry), canUndo: true, canRedo: false });
        setMessage(validation.message);
      }
      setSelectedEntry("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : typeof caught === "string" ? caught : "تعذر نقل الحصة."); }
    finally { setBusy(false); }
  }

  async function undo() {
    if (!overview?.selectedVersionId) return;
    setBusy(true); setError("");
    try {
      if (isTauriRuntime()) applyOverview(await desktopApi.undoTimetableChange(overview.selectedVersionId));
      else {
        const previous = undoStack.at(-1); if (!previous) return;
        setRedoStack((stack) => [...stack, overview]); setUndoStack((stack) => stack.slice(0, -1));
        applyOverview({ ...previous, canUndo: undoStack.length > 1, canRedo: true });
      }
      setMessage("تم التراجع عن آخر نقل.");
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر التراجع."); }
    finally { setBusy(false); }
  }

  async function redo() {
    if (!overview?.selectedVersionId) return;
    setBusy(true); setError("");
    try {
      if (isTauriRuntime()) applyOverview(await desktopApi.redoTimetableChange(overview.selectedVersionId));
      else {
        const next = redoStack.at(-1); if (!next) return;
        setUndoStack((stack) => [...stack, overview]); setRedoStack((stack) => stack.slice(0, -1));
        applyOverview({ ...next, canUndo: true, canRedo: redoStack.length > 1 });
      }
      setMessage("تمت إعادة التغيير.");
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر إعادة التغيير."); }
    finally { setBusy(false); }
  }

  async function selectVersion(versionId: string) {
    setBusy(true); setError("");
    try {
      if (isTauriRuntime()) applyOverview(await desktopApi.getTimetableOverview(versionId));
      else if (overview) applyOverview({ ...overview, selectedVersionId: versionId });
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر فتح النسخة."); }
    finally { setBusy(false); }
  }

  async function status(nextStatus: "published" | "archived") {
    if (!overview?.selectedVersionId) return;
    setBusy(true); setError("");
    try {
      if (isTauriRuntime()) applyOverview(await desktopApi.setTimetableStatus(overview.selectedVersionId, nextStatus));
      else applyOverview({ ...overview, versions: overview.versions.map((version) => version.id === overview.selectedVersionId ? { ...version, status: nextStatus } : version) });
      setMessage(nextStatus === "published" ? "نُشرت النسخة محليًا." : "أُرشفت النسخة.");
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر تحديث النسخة."); }
    finally { setBusy(false); }
  }

  async function revert() {
    if (!overview?.selectedVersionId || !selectedVersion) return;
    setBusy(true); setError("");
    try {
      if (isTauriRuntime()) applyOverview(await desktopApi.revertTimetableVersion(overview.selectedVersionId, `استعادة ${selectedVersion.name} ${new Date().toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}`));
      else {
        const id = crypto.randomUUID();
        applyOverview({ ...overview, selectedVersionId: id, versions: [{ ...selectedVersion, id, name: `استعادة ${selectedVersion.name}`, status: "draft", sourceVersionId: selectedVersion.id, createdAt: new Date().toISOString() }, ...overview.versions], entries: entries.map((entry) => ({ ...entry, id: crypto.randomUUID() })), canUndo: false, canRedo: false });
      }
      setMessage("أُنشئت مسودة جديدة من النسخة المحددة.");
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر استعادة النسخة."); }
    finally { setBusy(false); }
  }

  return <div className="page-stack timetable-page">
    <section className="hero"><div><span className="eyebrow">المسودات والنسخ</span><h1>الجداول</h1><p>اعرض الجدول حسب الشعبة أو المعلم أو القاعة، وانقل الحصص مع تحقق فوري.</p></div>{selectedVersion && <span className={`version-status ${selectedVersion.status}`}>{selectedVersion.status === "draft" ? "مسودة" : selectedVersion.status === "published" ? "منشور" : "مؤرشف"}</span>}</section>
    {!isTauriRuntime() && <div className="browser-preview-notice">وضع معاينة المتصفح — النقل والتراجع مؤقتان داخل الجلسة.</div>}
    {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice saved"><Check />{message}</div>}
    {loading ? <section className="panel generation-state"><RefreshCw className="spin" /><h2>جارٍ تحميل الجدول</h2></section>
      : !overview?.versions.length ? <section className="panel generation-state"><Clock3 /><h2>لا توجد نسخة جدول بعد</h2><p>شغّل المحرك لإنشاء أول مسودة.</p><Link className="primary-button" to="/generate">توليد الجدول</Link></section>
        : <>
          <section className="panel timetable-toolbar">
            <label><span>نسخة الجدول</span><div className="select-shell"><select aria-label="نسخة الجدول" value={overview.selectedVersionId ?? ""} onChange={(event) => void selectVersion(event.target.value)}>{overview.versions.map((version) => <option value={version.id} key={version.id}>{version.name} · {version.status === "draft" ? "مسودة" : version.status === "published" ? "منشور" : "مؤرشف"}</option>)}</select><ChevronDown /></div></label>
            <label><span>العرض حسب</span><div className="select-shell"><select aria-label="العرض حسب" value={filterType} onChange={(event) => { const next = event.target.value as FilterType; setFilterType(next); const list = next === "section" ? context?.sections : next === "teacher" ? context?.teacherNames : context?.rooms; setFilterId(list?.[0]?.id ?? ""); }}><option value="section">الشعبة</option><option value="teacher">المعلم</option><option value="room">القاعة</option></select><Filter /></div></label>
            <label><span>التصفية</span><div className="select-shell"><select aria-label="التصفية" value={filterId} onChange={(event) => setFilterId(event.target.value)}>{options.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><ChevronDown /></div></label>
            <div className="history-actions"><button onClick={() => void undo()} disabled={busy || !(isTauriRuntime() ? overview.canUndo : undoStack.length)} aria-label="تراجع"><Undo2 />تراجع</button><button onClick={() => void redo()} disabled={busy || !(isTauriRuntime() ? overview.canRedo : redoStack.length)} aria-label="إعادة"><Redo2 />إعادة</button></div>
          </section>
          <section className="panel timetable-grid-panel">
            <header><div><h2>{options.find((item) => item.id === filterId)?.name ?? "الجدول الأسبوعي"}</h2><p>{visibleEntries.length} حصة · اسحب الحصة أو اخترها ثم اختر وقتًا جديدًا.</p></div><div className="version-actions"><button onClick={() => void revert()} disabled={busy}><Copy />استعادة كمسودة</button>{selectedVersion?.status !== "published" && <button onClick={() => void status("published")} disabled={busy}><Send />نشر</button>}{selectedVersion?.status !== "archived" && <button onClick={() => void status("archived")} disabled={busy}><Archive />أرشفة</button>}</div></header>
            <div className="weekly-grid" style={{ gridTemplateColumns: `72px repeat(${context?.days.length ?? 1}, minmax(145px, 1fr))` }}>
              <div className="grid-corner">الحصة</div>{context?.days.map((day) => <div className="day-header" key={day.weekday}><strong>{day.label}</strong><span>{day.periods} حصص</span></div>)}
              {Array.from({ length: maxPeriods }, (_, period) => <div className="grid-row-fragment" key={period} style={{ display: "contents" }}><div className="period-label"><strong>{period + 1}</strong><span>الحصة</span></div>{context?.days.map((day) => {
                const entry = visibleEntries.find((item) => item.weekday === day.weekday && item.periodIndex === period);
                const disabled = period >= day.periods;
                return <div key={`${day.weekday}-${period}`} className={`schedule-cell ${disabled ? "off" : ""} ${selectedEntry && !disabled ? "target" : ""}`} onDragOver={(event) => { if (!disabled) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); if (!disabled) void move(event.dataTransfer.getData("text/plain"), day.weekday, period); }} onClick={() => { if (selectedEntry && !disabled && !entry) void move(selectedEntry, day.weekday, period); }}>{entry && <button draggable className={`lesson-card ${selectedEntry === entry.id ? "selected" : ""}`} onDragStart={(event) => event.dataTransfer.setData("text/plain", entry.id)} onClick={(event) => { event.stopPropagation(); setSelectedEntry((current) => current === entry.id ? "" : entry.id); }}><strong>{entryTitle(entry)}</strong><span>{entryDetail(entry)}</span><small>{name(context?.rooms, entry.roomId)}</small></button>}</div>;
              })}</div>)}
            </div>
          </section>
        </>}
  </div>;
}
