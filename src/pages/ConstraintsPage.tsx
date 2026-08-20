import { Archive, Ban, Check, Plus, RefreshCw, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { desktopApi, isTauriRuntime, type ConstraintInput, type SolverContext } from "../lib/tauri";
import { demoSolverContext } from "../features/scheduler/sample";
import type { ScheduleConstraint } from "../features/scheduler/types";

const labels = {
  teacher_unavailable: "عدم توفر معلم",
  room_unavailable: "عدم توفر قاعة",
  prefer_distribution: "تفضيل توزيع الحصص",
  avoid_last_period: "تفضيل عدم وضع مادة آخر اليوم",
} as const;

type ConstraintType = keyof typeof labels;

export function ConstraintsPage() {
  const [context, setContext] = useState<SolverContext>(demoSolverContext);
  const [constraints, setConstraints] = useState<ScheduleConstraint[]>(isTauriRuntime() ? [] : demoSolverContext.constraints);
  const [type, setType] = useState<ConstraintType>("teacher_unavailable");
  const [resourceId, setResourceId] = useState("");
  const [weekday, setWeekday] = useState(0);
  const [periodIndex, setPeriodIndex] = useState(0);
  const [weight, setWeight] = useState(3);
  const [loading, setLoading] = useState(isTauriRuntime());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!isTauriRuntime()) return;
    Promise.all([desktopApi.getSolverContext(), desktopApi.listConstraints()])
      .then(([nextContext, nextConstraints]) => { setContext(nextContext); setConstraints(nextConstraints); setWeekday(nextContext.days[0]?.weekday ?? 0); })
      .catch((caught) => setError(typeof caught === "string" ? caught : "تعذر تحميل القيود."))
      .finally(() => setLoading(false));
  }, []);

  const resources = type === "teacher_unavailable" ? context.teacherNames
    : type === "room_unavailable" ? context.rooms
      : type === "avoid_last_period" ? context.subjects : [];
  const day = context.days.find((item) => item.weekday === weekday) ?? context.days[0];
  const isUnavailable = type.endsWith("_unavailable");

  function inputFor(existing?: ScheduleConstraint): ConstraintInput {
    const payload: Record<string, string | number | null> = {};
    if (type === "teacher_unavailable") Object.assign(payload, { teacherId: resourceId || resources[0]?.id, weekday, periodIndex });
    if (type === "room_unavailable") Object.assign(payload, { roomId: resourceId || resources[0]?.id, weekday, periodIndex });
    if (type === "avoid_last_period" && (resourceId || resources[0]?.id)) payload.subjectId = resourceId || resources[0]?.id;
    return { id: existing?.id, constraintType: type, strength: isUnavailable ? "hard" : "soft", weight: isUnavailable ? 1 : weight, payload, enabled: existing?.enabled ?? true };
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setError(""); setSaved("");
    try {
      if (isUnavailable && !(resourceId || resources[0]?.id)) throw new Error("أضف المورد المطلوب في شاشة البيانات أولًا.");
      const input = inputFor();
      const record = isTauriRuntime() ? await desktopApi.saveConstraint(input) : { ...input, id: crypto.randomUUID() } as ScheduleConstraint;
      setConstraints((current) => [record, ...current]);
      setSaved("تم حفظ القيد وسيطبقه المحرك في التوليد التالي.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : typeof caught === "string" ? caught : "تعذر حفظ القيد."); }
    finally { setSaving(false); }
  }

  async function toggle(constraint: ScheduleConstraint) {
    setError("");
    try {
      const input = { ...constraint, enabled: !constraint.enabled };
      const updated = isTauriRuntime() ? await desktopApi.saveConstraint(input) : input;
      setConstraints((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر تحديث القيد."); }
  }

  async function archive(id: string) {
    setError("");
    try {
      if (isTauriRuntime()) await desktopApi.archiveConstraint(id);
      setConstraints((current) => current.filter((item) => item.id !== id));
    } catch (caught) { setError(typeof caught === "string" ? caught : "تعذر أرشفة القيد."); }
  }

  function describe(constraint: ScheduleConstraint) {
    const payload = constraint.payload;
    if (constraint.constraintType === "teacher_unavailable") return `${context.teacherNames.find((item) => item.id === payload.teacherId)?.name ?? "معلم"} · ${context.days.find((item) => item.weekday === payload.weekday)?.label ?? "يوم"} · الحصة ${Number(payload.periodIndex) + 1}`;
    if (constraint.constraintType === "room_unavailable") return `${context.rooms.find((item) => item.id === payload.roomId)?.name ?? "قاعة"} · ${context.days.find((item) => item.weekday === payload.weekday)?.label ?? "يوم"} · الحصة ${Number(payload.periodIndex) + 1}`;
    if (constraint.constraintType === "avoid_last_period") return context.subjects.find((item) => item.id === payload.subjectId)?.name ?? "كل المواد";
    return "توزيع حصص المادة على أيام مختلفة قدر الإمكان";
  }

  const activeCount = useMemo(() => constraints.filter((item) => item.enabled).length, [constraints]);

  return <div className="page-stack constraints-page">
    <section className="hero"><div><span className="eyebrow">قواعد المحرك</span><h1>القيود</h1><p>أضف القيود الصارمة والتفضيلات التي توجه توليد الجدول.</p></div><div className="constraint-summary"><strong>{activeCount}</strong><span>قيد مفعّل</span></div></section>
    {!isTauriRuntime() && <div className="browser-preview-notice">وضع معاينة المتصفح — القيود التجريبية مؤقتة.</div>}
    {error && <div className="notice error" role="alert">{error}</div>}{saved && <div className="notice saved"><Check />{saved}</div>}
    <section className="constraint-layout">
      <form className="panel constraint-form" onSubmit={save}>
        <header><div className="step-number"><Plus /></div><div><h2>إضافة قيد</h2><p>يُعاد التحقق منه داخل Rust قبل الحفظ.</p></div></header>
        <label><span>نوع القيد</span><select aria-label="نوع القيد" value={type} onChange={(event) => { setType(event.target.value as ConstraintType); setResourceId(""); }}>{Object.entries(labels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {resources.length > 0 && <label><span>{type === "teacher_unavailable" ? "المعلم" : type === "room_unavailable" ? "القاعة" : "المادة"}</span><select aria-label="المورد" value={resourceId} onChange={(event) => setResourceId(event.target.value)}>{resources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
        {isUnavailable && <div className="constraint-time"><label><span>اليوم</span><select aria-label="يوم القيد" value={weekday} onChange={(event) => { setWeekday(Number(event.target.value)); setPeriodIndex(0); }}>{context.days.map((item) => <option value={item.weekday} key={item.weekday}>{item.label}</option>)}</select></label><label><span>الحصة</span><select aria-label="حصة القيد" value={periodIndex} onChange={(event) => setPeriodIndex(Number(event.target.value))}>{Array.from({ length: day?.periods ?? 0 }, (_, index) => <option value={index} key={index}>الحصة {index + 1}</option>)}</select></label></div>}
        {!isUnavailable && <label><span>وزن التفضيل: {weight}</span><input aria-label="وزن التفضيل" type="range" min="1" max="10" value={weight} onChange={(event) => setWeight(Number(event.target.value))} /></label>}
        <button className="primary-button" disabled={saving || loading}>{saving ? <RefreshCw className="spin" /> : <Plus />}حفظ القيد</button>
      </form>
      <section className="panel constraint-list"><header><div><h2>القيود الحالية</h2><p>القيود الصارمة لا يمكن للمحرك خرقها.</p></div><SlidersHorizontal /></header>{loading ? <div className="compact-empty"><RefreshCw className="spin" /> جارٍ التحميل…</div> : constraints.length === 0 ? <div className="compact-empty">لا توجد قيود مخصصة بعد.</div> : constraints.map((constraint) => <article key={constraint.id} className={!constraint.enabled ? "disabled" : ""}><div className={`constraint-icon ${constraint.strength}`} >{constraint.strength === "hard" ? <Ban /> : <SlidersHorizontal />}</div><div><strong>{labels[constraint.constraintType]}</strong><span>{describe(constraint)}</span><small>{constraint.strength === "hard" ? "صارم" : `مرن · الوزن ${constraint.weight}`}</small></div><button className={`toggle-button ${constraint.enabled ? "on" : ""}`} onClick={() => void toggle(constraint)} type="button" aria-label={`${constraint.enabled ? "تعطيل" : "تفعيل"} ${labels[constraint.constraintType]}`}>{constraint.enabled ? "مفعّل" : "معطّل"}</button><button className="icon-action" onClick={() => void archive(constraint.id)} type="button" aria-label={`أرشفة ${labels[constraint.constraintType]}`}><Archive /></button></article>)}</section>
    </section>
  </div>;
}
