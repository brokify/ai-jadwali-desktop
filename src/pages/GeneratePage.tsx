import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, Gauge, Play, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { localSolver } from "../features/scheduler/solver";
import { demoSolverContext } from "../features/scheduler/sample";
import type { SolverResult } from "../features/scheduler/types";
import { desktopApi, isTauriRuntime, type SolverContext, type TimetableOverview } from "../lib/tauri";
import { useScheduleStore } from "../store/scheduleStore";

export function GeneratePage() {
  const storedContext = useScheduleStore((state) => state.context);
  const setStoredContext = useScheduleStore((state) => state.setContext);
  const setOverview = useScheduleStore((state) => state.setOverview);
  const [context, setContext] = useState<SolverContext | null>(storedContext ?? (isTauriRuntime() ? null : demoSolverContext));
  const [name, setName] = useState(`مسودة ${new Date().toLocaleDateString("ar-AE")}`);
  const [result, setResult] = useState<SolverResult | null>(null);
  const [loading, setLoading] = useState(isTauriRuntime());
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!isTauriRuntime()) { if (context) setStoredContext(context); return; }
    desktopApi.getSolverContext().then((next) => { setContext(next); setStoredContext(next); })
      .catch((caught) => setError(typeof caught === "string" ? caught : "تعذر تحميل مدخلات الجدولة."))
      .finally(() => setLoading(false));
  }, []);

  const periodCount = useMemo(() => context?.requirements.reduce((sum, item) => sum + item.periodsPerWeek, 0) ?? 0, [context]);

  async function generate() {
    if (!context) return;
    setGenerating(true); setError(""); setSaved(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    try {
      const next = localSolver.generate(context);
      setResult(next);
      let overview: TimetableOverview;
      if (isTauriRuntime()) {
        overview = await desktopApi.generateTimetable({ name, solverStatus: next.status, penaltyScore: next.penaltyScore, entries: next.entries.map(({ id: _id, ...entry }) => entry) });
      } else {
        const versionId = crypto.randomUUID();
        overview = { versions: [{ id: versionId, name, status: "draft", solverStatus: next.status, penaltyScore: next.penaltyScore, sourceVersionId: null, createdAt: new Date().toISOString() }], selectedVersionId: versionId, entries: next.entries, canUndo: false, canRedo: false };
      }
      setOverview(overview); setSaved(true);
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر حفظ نتيجة التوليد."); }
    finally { setGenerating(false); }
  }

  return <div className="page-stack generate-page">
    <section className="hero"><div><span className="eyebrow">المحرك المحلي</span><h1>توليد الجدول</h1><p>محرك backtracking محلي يطبق القيود الصارمة ويقيس التفضيلات.</p></div><span className="solver-badge"><Sparkles />SolverAdapter · Local v1</span></section>
    {!isTauriRuntime() && <div className="browser-preview-notice">وضع معاينة المتصفح — يجري التوليد على بيانات نموذجية ولا يُحفظ على القرص.</div>}
    {error && <div className="notice error" role="alert">{error}</div>}
    <section className="solver-metrics">
      <article><CalendarDays /><div><strong>{context?.days.length ?? 0}</strong><span>أيام دوام</span></div></article>
      <article><Gauge /><div><strong>{periodCount}</strong><span>حصة مطلوبة</span></div></article>
      <article><CheckCircle2 /><div><strong>{context?.constraints.filter((item) => item.enabled).length ?? 0}</strong><span>قيد مفعّل</span></div></article>
      <article><Sparkles /><div><strong>{context?.requirements.length ?? 0}</strong><span>متطلب</span></div></article>
    </section>
    <section className="panel generate-control">
      <div><h2>نسخة جدول جديدة</h2><p>ستُحفظ النتيجة كمسودة مستقلة ويمكن إعادة التوليد دون تغيير النسخ السابقة.</p></div>
      <label><span>اسم النسخة</span><input aria-label="اسم نسخة الجدول" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} /></label>
      <button className="primary-button generate-button" onClick={() => void generate()} disabled={loading || generating || !context || !name.trim()}>{generating ? <RefreshCw className="spin" /> : <Play />} {generating ? "المحرك يعمل…" : result ? "إعادة التوليد" : "توليد الجدول الآن"}</button>
    </section>
    {loading && <section className="panel generation-state"><RefreshCw className="spin" /><h2>جارٍ تجهيز بيانات المدرسة</h2></section>}
    {!loading && context?.requirements.length === 0 && <section className="panel generation-state"><AlertTriangle /><h2>لا توجد متطلبات حصص</h2><p>أضف الشعب والمواد ومتطلبات الحصص قبل تشغيل المحرك.</p><Link className="secondary-button" to="/data">الانتقال إلى البيانات</Link></section>}
    {result && <section className={`panel solver-result ${result.status}`}>
      <header><div className="result-mark">{result.status === "success" ? <CheckCircle2 /> : <AlertTriangle />}</div><div><span className="eyebrow">نتيجة المحرك</span><h2>{result.status === "success" ? "اكتمل الجدول دون تعارضات صارمة" : result.status === "partial" ? "تم إنشاء جدول جزئي" : "تعذر إنشاء الجدول"}</h2><p>{saved ? "حُفظت النتيجة كمسودة محلية." : "جارٍ تجهيز النتيجة…"}</p></div><Link className="primary-button" to="/timetables">فتح الجدول <ArrowLeft /></Link></header>
      <div className="result-numbers"><span><strong>{result.entries.length}</strong> حصة مجدولة</span><span><strong>{result.conflicts.reduce((sum, conflict) => sum + conflict.missingPeriods, 0)}</strong> حصة غير مجدولة</span><span><strong>{result.penaltyScore}</strong> نقاط الجزاء</span><span><strong>{result.exploredNodes.toLocaleString("ar")}</strong> حالة بحث</span></div>
      {result.conflicts.length > 0 && <div className="conflict-list"><h3>تفسير التعارضات</h3>{result.conflicts.map((conflict, index) => <div key={`${conflict.requirementId}-${index}`}><AlertTriangle /><span>{conflict.message}</span></div>)}</div>}
    </section>}
  </div>;
}
