import { BarChart3, Check, Download, FileSpreadsheet, Gauge, Printer, RefreshCw, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { bytesToBase64, renderElementToPdf } from "../features/export/pdf";
import { demoSolverContext } from "../features/scheduler/sample";
import { localSolver } from "../features/scheduler/solver";
import { desktopApi, isTauriRuntime, type ReportsOverview, type SolverContext } from "../lib/tauri";
import { useScheduleStore } from "../store/scheduleStore";

type ExportView = "section" | "teacher" | "room";

function demoReports(context: SolverContext): ReportsOverview {
  const result = localSolver.generate(context);
  const totalSlots = context.days.reduce((sum, day) => sum + day.periods, 0);
  const teacherLoads = context.teacherNames.map((teacher) => { const scheduled = result.entries.filter((entry) => entry.teacherId === teacher.id).length; const target = context.teachers.find((item) => item.id === teacher.id)?.maxPeriodsPerWeek ?? null; return { ...teacher, scheduled, target, utilizationPercent: target ? scheduled / target * 100 : 0 }; });
  const roomUsage = context.rooms.map((room) => { const scheduled = result.entries.filter((entry) => entry.roomId === room.id).length; return { ...room, scheduled, target: totalSlots, utilizationPercent: scheduled / totalSlots * 100 }; });
  const sectionLoads = context.sections.map((section) => ({ ...section, required: context.requirements.filter((item) => item.sectionId === section.id).reduce((sum, item) => sum + item.periodsPerWeek, 0), scheduled: result.entries.filter((entry) => entry.sectionId === section.id).length }));
  const requiredPeriods = context.requirements.reduce((sum, item) => sum + item.periodsPerWeek, 0);
  return { versionId: "browser-version", teacherLoads, roomUsage, sectionLoads, quality: { versionName: "المسودة التجريبية", versionStatus: "draft", solverStatus: result.status, penaltyScore: result.penaltyScore, scheduledPeriods: result.entries.length, requiredPeriods, unfulfilledPeriods: requiredPeriods - result.entries.length, activeConstraints: context.constraints.filter((item) => item.enabled).length } };
}

export function ReportsPage() {
  const storedContext = useScheduleStore((state) => state.context);
  const storedOverview = useScheduleStore((state) => state.overview);
  const [context, setContext] = useState<SolverContext>(storedContext ?? demoSolverContext);
  const [reports, setReports] = useState<ReportsOverview>(() => demoReports(storedContext ?? demoSolverContext));
  const [view, setView] = useState<ExportView>("section");
  const [filterId, setFilterId] = useState((storedContext ?? demoSolverContext).sections[0]?.id ?? "");
  const [loading, setLoading] = useState(isTauriRuntime());
  const [exporting, setExporting] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    Promise.all([desktopApi.getSolverContext(), desktopApi.getReports(storedOverview?.selectedVersionId ?? undefined)])
      .then(([nextContext, nextReports]) => { setContext(nextContext); setReports(nextReports); setFilterId(nextContext.sections[0]?.id ?? ""); })
      .catch((caught) => setError(typeof caught === "string" ? caught : "تعذر تحميل التقارير."))
      .finally(() => setLoading(false));
  }, []);

  const options = view === "section" ? context.sections : view === "teacher" ? context.teacherNames : context.rooms;
  const selectedName = options.find((item) => item.id === filterId)?.name ?? "الجدول";
  const qualityPercent = reports.quality && reports.quality.requiredPeriods > 0 ? Math.round(reports.quality.scheduledPeriods / reports.quality.requiredPeriods * 100) : 0;
  const maxTeacherLoad = Math.max(1, ...reports.teacherLoads.map((item) => item.scheduled));
  const maxRoomLoad = Math.max(1, ...reports.roomUsage.map((item) => item.scheduled));

  async function exportPdf() {
    if (!reportRef.current) return;
    setExporting("pdf"); setError(""); setMessage("");
    try {
      const bytes = await renderElementToPdf(reportRef.current);
      const result = isTauriRuntime() ? await desktopApi.createPdfExport(`جدول-${selectedName}.pdf`, bytesToBase64(bytes)) : { fileName: `جدول-${selectedName}.pdf`, sizeBytes: bytes.length };
      if (result) setMessage(`تم تصدير PDF: ${result.fileName}`);
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر إنشاء ملف PDF."); }
    finally { setExporting(""); }
  }

  async function exportCsv() {
    if (!reports.versionId || !filterId) return;
    setExporting("csv"); setError(""); setMessage("");
    try {
      const result = isTauriRuntime() ? await desktopApi.createCsvExport(reports.versionId, view, filterId, `جدول-${selectedName}.csv`) : { fileName: `جدول-${selectedName}.csv`, sizeBytes: 1024 };
      if (result) setMessage(`تم تصدير CSV: ${result.fileName}`);
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر إنشاء ملف CSV."); }
    finally { setExporting(""); }
  }

  const quality = reports.quality;
  const summaryRows = useMemo(() => reports.sectionLoads, [reports.sectionLoads]);

  return <div className="page-stack reports-page">
    <section className="hero"><div><span className="eyebrow">تحليل الجدول</span><h1>التقارير والتصدير</h1><p>راقب حمل المعلمين واستخدام القاعات وجودة الجدول، ثم صدّر أو اطبع محليًا.</p></div><span className="quality-badge"><Gauge />جودة الاكتمال {qualityPercent}%</span></section>
    {!isTauriRuntime() && <div className="browser-preview-notice">وضع معاينة المتصفح — التصدير محاكاة، بينما تطبيق سطح المكتب يفتح نافذة حفظ محلية.</div>}
    {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice saved"><Check />{message}</div>}
    {loading ? <section className="panel generation-state"><RefreshCw className="spin" /><h2>جارٍ حساب التقارير</h2></section> : !quality ? <section className="panel generation-state"><BarChart3 /><h2>لا يوجد جدول لتحليله</h2><p>أنشئ نسخة جدول أولًا.</p></section> : <>
      <section className="report-kpis"><article><strong>{quality.scheduledPeriods}</strong><span>حصة مجدولة</span></article><article><strong>{quality.unfulfilledPeriods}</strong><span>غير مجدولة</span></article><article><strong>{quality.penaltyScore}</strong><span>جزاء مرن</span></article><article><strong>{quality.activeConstraints}</strong><span>قيد مفعّل</span></article></section>
      <section className="reports-grid">
        <article className="panel chart-card"><header><div><h2>حمل المعلمين</h2><p>الحصص المجدولة في النسخة الحالية.</p></div><Users /></header><div className="bar-list">{reports.teacherLoads.map((item) => <div key={item.id}><span>{item.name}</span><div><i style={{ width: `${item.scheduled / maxTeacherLoad * 100}%` }} /></div><strong>{item.scheduled}{item.target ? ` / ${item.target}` : ""}</strong></div>)}</div></article>
        <article className="panel chart-card"><header><div><h2>استخدام القاعات</h2><p>نسبة إشغال كل قاعة من الفترات المتاحة.</p></div><BarChart3 /></header><div className="bar-list rooms">{reports.roomUsage.map((item) => <div key={item.id}><span>{item.name}</span><div><i style={{ width: `${item.scheduled / maxRoomLoad * 100}%` }} /></div><strong>{Math.round(item.utilizationPercent)}%</strong></div>)}</div></article>
      </section>
      <section className="panel export-panel"><header><div><h2>التصدير والطباعة</h2><p>PDF يحافظ على اتجاه RTL، وCSV مناسب للمراجعة في برامج الجداول.</p></div><Download /></header><div className="export-controls"><label><span>نوع العرض</span><select aria-label="نوع عرض التصدير" value={view} onChange={(event) => { const next = event.target.value as ExportView; setView(next); const list = next === "section" ? context.sections : next === "teacher" ? context.teacherNames : context.rooms; setFilterId(list[0]?.id ?? ""); }}><option value="section">حسب الشعبة</option><option value="teacher">حسب المعلم</option><option value="room">حسب القاعة</option></select></label><label><span>العنصر</span><select aria-label="عنصر التصدير" value={filterId} onChange={(event) => setFilterId(event.target.value)}>{options.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button className="primary-button" onClick={() => void exportPdf()} disabled={Boolean(exporting)}>{exporting === "pdf" ? <RefreshCw className="spin" /> : <Download />}تصدير PDF</button><button className="secondary-button" onClick={() => void exportCsv()} disabled={Boolean(exporting)}><FileSpreadsheet />تصدير CSV</button><button className="ghost-button print-button" onClick={() => window.print()}><Printer />طباعة</button></div></section>
      <div className="print-report" ref={reportRef} dir="rtl"><header><div><strong>جدولي</strong><span>AI Jadwali Desktop</span></div><div><h2>تقرير الجدول — {selectedName}</h2><p>{quality.versionName} · {new Date().toLocaleDateString("ar-AE")}</p></div></header><section><article><strong>{quality.scheduledPeriods}</strong><span>حصة مجدولة</span></article><article><strong>{qualityPercent}%</strong><span>نسبة الاكتمال</span></article><article><strong>{quality.penaltyScore}</strong><span>درجة الجزاء</span></article></section><table><thead><tr><th>الشعبة</th><th>الحصص المطلوبة</th><th>الحصص المجدولة</th><th>الحالة</th></tr></thead><tbody>{summaryRows.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.required}</td><td>{item.scheduled}</td><td>{item.required === item.scheduled ? "مكتمل" : `ناقص ${item.required - item.scheduled}`}</td></tr>)}</tbody></table><footer>تم إنشاء هذا التقرير محليًا دون إرسال أي بيانات إلى الإنترنت.</footer></div>
    </>}
  </div>;
}
