import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  FileSpreadsheet,
  History,
  LoaderCircle,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { utils, write, type WorkBook } from "xlsx";
import {
  decodeBase64,
  importEntityConfig,
  parseSheet,
  prepareRows,
  readWorkbook,
  suggestMapping,
  type ParsedSheet,
} from "../features/import/importUtils";
import {
  desktopApi,
  isTauriRuntime,
  type EntityKind,
  type ImportCommitResult,
  type ImportOverview,
} from "../lib/tauri";
import { entityKinds, useDataStore } from "../store/dataStore";

const entityLabels: Record<EntityKind, string> = {
  grades: "الصفوف",
  sections: "الشُعب",
  subjects: "المواد",
  teachers: "المعلمون",
  rooms: "القاعات",
  lesson_requirements: "متطلبات الحصص",
};

function sampleWorkbook() {
  const workbook = utils.book_new();
  utils.book_append_sheet(
    workbook,
    utils.aoa_to_sheet([
      ["اسم الصف", "الترتيب"],
      ["الصف الأول", "١"],
      ["الصف الثاني", "٢"],
      ["الصف الثاني", "٣"],
    ]),
    "الصفوف",
  );
  const bytes = write(workbook, { type: "array", bookType: "xlsx" });
  return readWorkbook(new Uint8Array(bytes));
}

const emptyOverview: ImportOverview = { jobs: [], templates: [], errors: [] };

export function ImportPage() {
  const [entityType, setEntityType] = useState<EntityKind>("grades");
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const [fileName, setFileName] = useState("");
  const [worksheet, setWorksheet] = useState("");
  const [sheet, setSheet] = useState<ParsedSheet>({ headers: [], rows: [] });
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [templateName, setTemplateName] = useState("");
  const [overview, setOverview] = useState<ImportOverview>(emptyOverview);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<"import" | "history">("import");
  const records = useDataStore((state) => state.records);
  const setRecords = useDataStore((state) => state.setRecords);

  async function loadContext() {
    if (!isTauriRuntime()) return;
    try {
      const [data, importOverview] = await Promise.all([
        Promise.all(entityKinds.map(async (kind) => [kind, await desktopApi.listEntities(kind, true)] as const)),
        desktopApi.getImportOverview(),
      ]);
      data.forEach(([kind, items]) => setRecords(kind, items));
      setOverview(importOverview);
    } catch (caught) {
      setError(typeof caught === "string" ? caught : "تعذر تحميل سياق الاستيراد.");
    }
  }

  useEffect(() => { void loadContext(); }, []);

  function applyWorkbook(nextWorkbook: WorkBook, nextFileName: string) {
    const firstSheet = nextWorkbook.SheetNames[0] ?? "";
    const parsed = parseSheet(nextWorkbook, firstSheet);
    setWorkbook(nextWorkbook);
    setFileName(nextFileName);
    setWorksheet(firstSheet);
    setSheet(parsed);
    setMapping(suggestMapping(parsed.headers, entityType));
    setResult(null);
    setError(parsed.headers.length ? "" : "لم أجد صف عناوين في ورقة العمل.");
  }

  async function chooseFile() {
    setLoading(true);
    setError("");
    try {
      if (!isTauriRuntime()) {
        applyWorkbook(sampleWorkbook(), "نموذج-الصفوف.xlsx");
        return;
      }
      const file = await desktopApi.importParseFile();
      if (!file) return;
      applyWorkbook(readWorkbook(decodeBase64(file.bytesBase64)), file.fileName);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : typeof caught === "string" ? caught : "تعذر تحليل الملف.");
    } finally {
      setLoading(false);
    }
  }

  function changeWorksheet(name: string) {
    if (!workbook) return;
    const parsed = parseSheet(workbook, name);
    setWorksheet(name);
    setSheet(parsed);
    setMapping(suggestMapping(parsed.headers, entityType));
    setResult(null);
  }

  function changeEntityType(kind: EntityKind) {
    setEntityType(kind);
    setMapping(suggestMapping(sheet.headers, kind));
    setResult(null);
  }

  function changeMapping(header: string, field: string) {
    setMapping((current) => {
      const next = { ...current };
      if (field) next[header] = field;
      else delete next[header];
      return next;
    });
  }

  function applyTemplate(templateId: string) {
    const template = overview.templates.find((item) => item.id === templateId);
    if (template) setMapping(template.mapping);
  }

  const preparedRows = useMemo(
    () => prepareRows(sheet, mapping, entityType, records),
    [sheet, mapping, entityType, records],
  );
  const validRows = preparedRows.filter((row) => row.errors.length === 0);
  const invalidRows = preparedRows.filter((row) => row.errors.length > 0);
  const mappedTargets = new Set(Object.values(mapping));
  const missingRequired = importEntityConfig[entityType].fields.filter(
    (field) => field.required && !mappedTargets.has(field.key),
  );

  async function commitImport() {
    if (!preparedRows.length || missingRequired.length) return;
    setCommitting(true);
    setError("");
    try {
      if (!isTauriRuntime()) {
        setResult({
          jobId: "browser-preview",
          totalRows: preparedRows.length,
          importedRows: validRows.length,
          errorRows: invalidRows.length,
          errors: invalidRows.map((row) => ({ rowNumber: row.rowNumber, message: row.errors.join("، ") })),
        });
        return;
      }
      const nextResult = await desktopApi.importCommit({
        entityType,
        fileName,
        worksheet,
        mapping,
        templateName: templateName.trim() || undefined,
        rows: preparedRows.map((row) => ({ rowNumber: row.rowNumber, payload: row.payload })),
      });
      setResult(nextResult);
      await loadContext();
    } catch (caught) {
      setError(typeof caught === "string" ? caught : "تعذر إتمام الاستيراد.");
    } finally {
      setCommitting(false);
    }
  }

  const templateOptions = overview.templates.filter((template) => template.entityType === entityType);

  return (
    <div className="page-stack import-page">
      <section className="hero">
        <div><span className="eyebrow">CSV / XLSX</span><h1>الاستيراد</h1><p>راجع البيانات وعيّن الأعمدة قبل حفظ أي صف في ملف المدرسة.</p></div>
        <div className="import-view-switch"><button className={view === "import" ? "active" : ""} onClick={() => setView("import")}><Upload />استيراد جديد</button><button className={view === "history" ? "active" : ""} onClick={() => setView("history")}><History />السجل</button></div>
      </section>

      {!isTauriRuntime() && <div className="browser-preview-notice">وضع معاينة المتصفح — زر الملف يحمّل نموذجًا تجريبيًا، واختيار ملفات الجهاز متاح في تطبيق سطح المكتب.</div>}
      {error && <div className="notice error" role="alert">{error}</div>}

      {view === "history" ? (
        <section className="import-history-grid">
          <article className="panel import-history-card"><header><div><h2>عمليات الاستيراد</h2><p>آخر 50 عملية محلية</p></div><History /></header>{overview.jobs.length ? <div className="history-list">{overview.jobs.map((job) => <div key={job.id}><span className={`job-status ${job.status}`}>{job.status === "completed" ? "مكتمل" : "فشل"}</span><div><strong>{job.fileName}</strong><small>{entityLabels[job.entityType as EntityKind] ?? job.entityType} · {job.importedRows}/{job.totalRows} صف</small></div><time>{new Date(job.createdAt).toLocaleDateString("ar")}</time></div>)}</div> : <div className="compact-empty">لا توجد عمليات استيراد بعد.</div>}</article>
          <article className="panel import-history-card"><header><div><h2>قوالب التعيين</h2><p>قوالب محفوظة حسب نوع البيانات</p></div><Save /></header>{overview.templates.length ? <div className="template-list">{overview.templates.map((template) => <span key={template.id}>{template.name}<small>{entityLabels[template.entityType as EntityKind] ?? template.entityType}</small></span>)}</div> : <div className="compact-empty">لم تُحفظ قوالب بعد.</div>}</article>
          <article className="panel import-history-card full"><header><div><h2>أخطاء الصفوف الأخيرة</h2><p>تفاصيل قابلة للمراجعة دون إيقاف بقية الصفوف</p></div><AlertCircle /></header>{overview.errors.length ? <div className="error-history-list">{overview.errors.map((item, index) => <div key={`${item.importJobId}-${item.rowNumber}-${index}`}><strong>الصف {item.rowNumber}</strong><span>{item.message}</span></div>)}</div> : <div className="compact-empty">لا توجد أخطاء مسجلة.</div>}</article>
        </section>
      ) : (
        <>
          <section className="import-steps" aria-label="خطوات الاستيراد"><span className="done"><strong>1</strong>نوع البيانات</span><ChevronLeft /><span className={workbook ? "done" : "active"}><strong>2</strong>الملف والورقة</span><ChevronLeft /><span className={workbook ? "active" : ""}><strong>3</strong>تعيين الأعمدة</span><ChevronLeft /><span className={preparedRows.length ? "active" : ""}><strong>4</strong>المعاينة</span></section>

          <section className="panel import-source-panel">
            <div className="import-section-heading"><div><span className="step-number">1</span><div><h2>نوع البيانات</h2><p>اختر الجدول الذي ستُضاف إليه الصفوف.</p></div></div></div>
            <div className="import-entity-options">{entityKinds.map((kind) => <button key={kind} className={entityType === kind ? "active" : ""} onClick={() => changeEntityType(kind)}>{entityLabels[kind]}</button>)}</div>
            <div className="import-file-zone"><FileSpreadsheet /><div><h3>{fileName || "اختر ملف CSV أو Excel"}</h3><p>{workbook ? `${sheet.rows.length} صف · ${workbook.SheetNames.length} ورقة عمل` : "حتى 20 ميجابايت، والبيانات لا تغادر جهازك."}</p></div><button className="secondary-button" onClick={() => void chooseFile()} disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <Upload />}{isTauriRuntime() ? "اختيار ملف" : "تحميل نموذج تجريبي"}</button></div>
            {workbook && <div className="import-source-controls"><label><span>ورقة العمل</span><select value={worksheet} onChange={(event) => changeWorksheet(event.target.value)}>{workbook.SheetNames.map((name) => <option key={name}>{name}</option>)}</select></label>{templateOptions.length > 0 && <label><span>استخدام قالب محفوظ</span><select defaultValue="" onChange={(event) => applyTemplate(event.target.value)}><option value="">اختر قالبًا</option>{templateOptions.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>}</div>}
          </section>

          {workbook && <section className="panel mapping-panel"><div className="import-section-heading"><div><span className="step-number">2</span><div><h2>تعيين الأعمدة</h2><p>اربط عناوين الملف بحقول {entityLabels[entityType]}.</p></div></div><span className={missingRequired.length ? "mapping-warning" : "mapping-ready"}>{missingRequired.length ? `${missingRequired.length} حقول مطلوبة` : "التعيين مكتمل"}</span></div><div className="mapping-grid">{sheet.headers.map((header) => <div className="mapping-row" key={header}><div><strong>{header}</strong><small>{sheet.rows[0]?.values[header] || "—"}</small></div><ChevronLeft /><select aria-label={`تعيين ${header}`} value={mapping[header] ?? ""} onChange={(event) => changeMapping(header, event.target.value)}><option value="">تجاهل العمود</option>{importEntityConfig[entityType].fields.map((field) => <option key={field.key} value={field.key} disabled={mappedTargets.has(field.key) && mapping[header] !== field.key}>{field.label}{field.required ? " *" : ""}</option>)}</select></div>)}</div><label className="template-name-field"><span>حفظ التعيين كقالب اختياري</span><input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder={`مثال: قالب ${entityLabels[entityType]}`} maxLength={80} /></label></section>}

          {workbook && <section className="panel import-preview-panel"><div className="import-section-heading"><div><span className="step-number">3</span><div><h2>معاينة الصفوف</h2><p>لن تُخفى الأخطاء؛ تُسجل مع رقم الصف عند الالتزام.</p></div></div><div className="preview-stats"><span><strong>{preparedRows.length}</strong>الإجمالي</span><span className="valid"><strong>{validRows.length}</strong>صالح</span><span className="invalid"><strong>{invalidRows.length}</strong>يحتاج مراجعة</span></div></div><div className="import-table-wrap"><table className="import-table"><thead><tr><th>الصف</th>{sheet.headers.slice(0, 5).map((header) => <th key={header}>{header}</th>)}<th>الحالة</th></tr></thead><tbody>{preparedRows.slice(0, 12).map((row) => { const raw = sheet.rows.find((item) => item.rowNumber === row.rowNumber); return <tr key={row.rowNumber} className={row.errors.length ? "invalid" : ""}><td>{row.rowNumber}</td>{sheet.headers.slice(0, 5).map((header) => <td key={header}>{raw?.values[header] || "—"}</td>)}<td>{row.errors.length ? <span className="row-error" title={row.errors.join("، ")}><AlertCircle />{row.errors[0]}</span> : <span className="row-valid"><CheckCircle2 />صالح</span>}</td></tr>; })}</tbody></table></div>{preparedRows.length > 12 && <p className="table-footnote">تظهر أول 12 صفًا من أصل {preparedRows.length}.</p>} {result && <div className={`import-result ${result.errorRows ? "partial" : "success"}`}><CheckCircle2 /><div><strong>{isTauriRuntime() ? "اكتملت عملية الاستيراد" : "اكتملت المحاكاة"}</strong><span>تم قبول {result.importedRows} صف، وتسجيل {result.errorRows} خطأ.</span></div></div>}<footer className="import-actions"><div><Sparkles /><span>سيُطبق التطبيع والتحقق مرة أخرى داخل Rust.</span></div><button className="primary-button" onClick={() => void commitImport()} disabled={committing || !preparedRows.length || Boolean(missingRequired.length)}>{committing ? <LoaderCircle className="spin" /> : <Upload />}استيراد {preparedRows.length} صف</button></footer></section>}
        </>
      )}
    </div>
  );
}
