import {
  Archive,
  ArchiveRestore,
  BookOpen,
  Building2,
  Layers3,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  desktopApi,
  isTauriRuntime,
  type EntityFields,
  type EntityKind,
  type EntityRecord,
} from "../lib/tauri";
import { entityKinds, useDataStore } from "../store/dataStore";

type FieldDefinition = {
  key: string;
  label: string;
  type?: "text" | "number" | "color" | "select";
  required?: boolean;
  min?: number;
  max?: number;
  source?: EntityKind;
  optional?: boolean;
};

const entityConfig: Record<
  EntityKind,
  { label: string; singular: string; icon: typeof Layers3; fields: FieldDefinition[] }
> = {
  grades: {
    label: "الصفوف",
    singular: "صف",
    icon: Layers3,
    fields: [
      { key: "name", label: "اسم الصف", required: true },
      { key: "sortOrder", label: "ترتيب العرض", type: "number", min: 0, max: 100 },
    ],
  },
  sections: {
    label: "الشُعب",
    singular: "شعبة",
    icon: Users,
    fields: [
      { key: "name", label: "اسم الشعبة", required: true },
      { key: "gradeId", label: "الصف", type: "select", source: "grades", required: true },
      { key: "capacity", label: "سعة الشعبة", type: "number", min: 1, max: 5000, optional: true },
    ],
  },
  subjects: {
    label: "المواد",
    singular: "مادة",
    icon: BookOpen,
    fields: [
      { key: "name", label: "اسم المادة", required: true },
      { key: "code", label: "رمز المادة", optional: true },
      { key: "color", label: "لون المادة", type: "color", optional: true },
    ],
  },
  teachers: {
    label: "المعلمون",
    singular: "معلم",
    icon: Users,
    fields: [
      { key: "name", label: "اسم المعلم", required: true },
      { key: "employeeCode", label: "الرقم الوظيفي", optional: true },
      { key: "maxPeriodsPerDay", label: "الحد اليومي للحصص", type: "number", min: 1, max: 16, optional: true },
      { key: "maxPeriodsPerWeek", label: "الحد الأسبوعي للحصص", type: "number", min: 1, max: 100, optional: true },
    ],
  },
  rooms: {
    label: "القاعات",
    singular: "قاعة",
    icon: Building2,
    fields: [
      { key: "name", label: "اسم القاعة", required: true },
      { key: "roomType", label: "نوع القاعة", optional: true },
      { key: "capacity", label: "السعة", type: "number", min: 1, max: 5000, optional: true },
    ],
  },
  lesson_requirements: {
    label: "متطلبات الحصص",
    singular: "متطلب حصص",
    icon: RefreshCw,
    fields: [
      { key: "sectionId", label: "الشعبة", type: "select", source: "sections", required: true },
      { key: "subjectId", label: "المادة", type: "select", source: "subjects", required: true },
      { key: "teacherId", label: "المعلم", type: "select", source: "teachers", optional: true },
      { key: "preferredRoomId", label: "القاعة المفضلة", type: "select", source: "rooms", optional: true },
      { key: "periodsPerWeek", label: "الحصص أسبوعيًا", type: "number", min: 1, max: 100, required: true },
      { key: "consecutivePeriods", label: "حصص متتالية", type: "number", min: 1, max: 8, required: true },
    ],
  },
};

function emptyForm(kind: EntityKind): Record<string, string> {
  return Object.fromEntries(
    entityConfig[kind].fields.map((field) => [
      field.key,
      field.key === "sortOrder" ? "0" : field.key === "periodsPerWeek" || field.key === "consecutivePeriods" ? "1" : field.type === "color" ? "#0b7168" : "",
    ]),
  );
}

function browserRecord(kind: EntityKind, fields: EntityFields, existing?: EntityRecord): EntityRecord {
  const now = new Date().toISOString();
  return {
    id: existing?.id ?? crypto.randomUUID(),
    entityType: kind,
    fields,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    archivedAt: existing?.archivedAt ?? null,
    archivedReason: existing?.archivedReason ?? null,
  };
}

export function DataPage() {
  const [activeKind, setActiveKind] = useState<EntityKind>("grades");
  const [loading, setLoading] = useState(isTauriRuntime());
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<EntityRecord | null | undefined>(undefined);
  const [form, setForm] = useState<Record<string, string>>(emptyForm("grades"));
  const [saving, setSaving] = useState(false);
  const records = useDataStore((state) => state.records);
  const setRecords = useDataStore((state) => state.setRecords);
  const upsertRecord = useDataStore((state) => state.upsertRecord);

  async function loadEntities() {
    if (!isTauriRuntime()) return;
    setLoading(true);
    setError("");
    try {
      const results = await Promise.all(
        entityKinds.map(async (kind) => [kind, await desktopApi.listEntities(kind, true)] as const),
      );
      results.forEach(([kind, items]) => setRecords(kind, items));
    } catch (caught) {
      setError(typeof caught === "string" ? caught : "تعذر تحميل بيانات المدرسة.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEntities();
  }, []);

  const visibleRecords = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ar");
    return records[activeKind].filter((record) => {
      if (!showArchived && record.archivedAt) return false;
      if (!query) return true;
      return Object.values(record.fields).some((value) =>
        String(value ?? "").toLocaleLowerCase("ar").includes(query),
      );
    });
  }, [activeKind, records, search, showArchived]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm(activeKind));
    setError("");
  }

  function openEdit(record: EntityRecord) {
    setEditing(record);
    setForm(
      Object.fromEntries(
        entityConfig[activeKind].fields.map((field) => [field.key, String(record.fields[field.key] ?? "")]),
      ),
    );
    setError("");
  }

  function payloadFromForm(): EntityFields {
    const payload: EntityFields = {};
    for (const field of entityConfig[activeKind].fields) {
      const raw = form[field.key]?.trim() ?? "";
      if (field.required && !raw) throw new Error(`${field.label} مطلوب.`);
      if (field.type === "number") {
        if (!raw && field.optional) payload[field.key] = null;
        else {
          const number = Number(raw);
          if (!Number.isFinite(number) || (field.min !== undefined && number < field.min) || (field.max !== undefined && number > field.max)) {
            throw new Error(`${field.label} غير صالح.`);
          }
          payload[field.key] = number;
        }
      } else {
        payload[field.key] = raw || null;
      }
    }
    return payload;
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const payload = payloadFromForm();
      const duplicateName = payload.name && records[activeKind].some(
        (record) => record.id !== editing?.id && !record.archivedAt && record.fields.name === payload.name,
      );
      if (duplicateName) throw new Error("يوجد عنصر نشط بالاسم نفسه.");
      const record = isTauriRuntime()
        ? editing
          ? await desktopApi.updateEntity(activeKind, editing.id, payload)
          : await desktopApi.createEntity(activeKind, payload)
        : browserRecord(activeKind, payload, editing ?? undefined);
      upsertRecord(activeKind, record);
      setEditing(undefined);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : typeof caught === "string" ? caught : "تعذر حفظ العنصر.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(record: EntityRecord) {
    setError("");
    try {
      const updated = isTauriRuntime()
        ? record.archivedAt
          ? await desktopApi.restoreEntity(activeKind, record.id)
          : await desktopApi.archiveEntity(activeKind, record.id, "أرشفة من شاشة البيانات")
        : {
            ...record,
            archivedAt: record.archivedAt ? null : new Date().toISOString(),
            archivedReason: record.archivedAt ? null : "أرشفة من شاشة البيانات",
            updatedAt: new Date().toISOString(),
          };
      upsertRecord(activeKind, updated);
    } catch (caught) {
      setError(typeof caught === "string" ? caught : "تعذر تغيير حالة الأرشفة.");
    }
  }

  function referenceName(kind: EntityKind, id: unknown) {
    return records[kind].find((record) => record.id === id)?.fields.name ?? "—";
  }

  function title(record: EntityRecord) {
    if (activeKind === "lesson_requirements") {
      return `${referenceName("subjects", record.fields.subjectId)} — ${referenceName("sections", record.fields.sectionId)}`;
    }
    return String(record.fields.name ?? "عنصر");
  }

  function detail(record: EntityRecord) {
    const fields = record.fields;
    switch (activeKind) {
      case "grades": return `ترتيب ${fields.sortOrder ?? 0}`;
      case "sections": return `${referenceName("grades", fields.gradeId)}${fields.capacity ? ` · السعة ${fields.capacity}` : ""}`;
      case "subjects": return String(fields.code || "دون رمز");
      case "teachers": return String(fields.employeeCode || "دون رقم وظيفي");
      case "rooms": return `${fields.roomType || "قاعة عامة"}${fields.capacity ? ` · السعة ${fields.capacity}` : ""}`;
      case "lesson_requirements": return `${fields.periodsPerWeek} حصة أسبوعيًا · ${referenceName("teachers", fields.teacherId)}`;
    }
  }

  const config = entityConfig[activeKind];
  const ActiveIcon = config.icon;

  return (
    <div className="page-stack data-page">
      <section className="hero data-heading">
        <div><span className="eyebrow">بيانات المدرسة</span><h1>البيانات</h1><p>إدارة العناصر المرجعية ومتطلبات الحصص مع الأرشفة والاستعادة.</p></div>
        <button className="primary-button" onClick={openCreate}><Plus size={18} />إضافة {config.singular}</button>
      </section>

      {!isTauriRuntime() && <div className="browser-preview-notice">وضع معاينة المتصفح — التغييرات مؤقتة حتى تشغيل تطبيق سطح المكتب.</div>}
      {error && <div className="notice error data-error" role="alert">{error}{error.includes("ملف مدرسة") && <Link to="/school">إعداد المدرسة</Link>}</div>}

      <section className="entity-tabs" aria-label="أنواع البيانات">
        {entityKinds.map((kind) => {
          const item = entityConfig[kind];
          const Icon = item.icon;
          const activeCount = records[kind].filter((record) => !record.archivedAt).length;
          return <button key={kind} className={activeKind === kind ? "active" : ""} onClick={() => { setActiveKind(kind); setSearch(""); }}><Icon /><span>{item.label}</span><strong>{activeCount}</strong></button>;
        })}
      </section>

      <section className="panel data-panel">
        <div className="data-toolbar">
          <div><h2>{config.label}</h2><p>{records[activeKind].filter((record) => !record.archivedAt).length} عنصر نشط</p></div>
          <div className="data-tools">
            <label className="search-box"><Search /><input aria-label="بحث" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`بحث في ${config.label}`} /></label>
            <label className="archive-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />إظهار المؤرشف</label>
          </div>
        </div>

        {loading ? <div className="data-state"><RefreshCw className="spin" /><h3>جارٍ تحميل البيانات</h3></div>
          : visibleRecords.length === 0 ? <div className="data-state"><ActiveIcon /><h3>{search ? "لا توجد نتائج مطابقة" : `لا توجد ${config.label} بعد`}</h3><p>{search ? "جرّب كلمة بحث أخرى." : `أضف أول ${config.singular} للبدء.`}</p>{!search && <button className="secondary-button" onClick={openCreate}><Plus size={17} />إضافة {config.singular}</button>}</div>
          : <div className="entity-list">{visibleRecords.map((record) => <article className={`entity-row ${record.archivedAt ? "archived" : ""}`} key={record.id}><div className="entity-avatar">{title(record).slice(0, 1)}</div><div className="entity-main"><strong>{title(record)}</strong><span>{detail(record)}</span></div>{record.archivedAt && <span className="archived-pill">مؤرشف</span>}<div className="entity-actions"><button aria-label={`تعديل ${title(record)}`} onClick={() => openEdit(record)} disabled={Boolean(record.archivedAt)}><Pencil /></button><button aria-label={record.archivedAt ? `استعادة ${title(record)}` : `أرشفة ${title(record)}`} onClick={() => void toggleArchive(record)}>{record.archivedAt ? <ArchiveRestore /> : <Archive />}</button></div></article>)}</div>}
      </section>

      {editing !== undefined && <div className="modal-backdrop" onMouseDown={() => setEditing(undefined)}><section className="entity-modal" role="dialog" aria-modal="true" aria-labelledby="entity-dialog-title" onMouseDown={(event) => event.stopPropagation()}><header><div><span className="eyebrow">{editing ? "تعديل" : "إضافة جديدة"}</span><h2 id="entity-dialog-title">{editing ? `تعديل ${config.singular}` : `إضافة ${config.singular}`}</h2></div><button className="icon-button light" onClick={() => setEditing(undefined)} aria-label="إغلاق"><X /></button></header><form onSubmit={save}><div className="modal-form-grid">{config.fields.map((field) => <label key={field.key}><span>{field.label}{field.required && <b> *</b>}</span>{field.type === "select" && field.source ? <select value={form[field.key] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} required={field.required}><option value="">{field.optional ? "بدون" : "اختر"}</option>{records[field.source].filter((record) => !record.archivedAt).map((record) => <option value={record.id} key={record.id}>{String(record.fields.name ?? "عنصر")}</option>)}</select> : <input type={field.type ?? "text"} min={field.min} max={field.max} value={form[field.key] ?? ""} onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))} required={field.required} />}</label>)}</div>{error && <div className="notice error" role="alert">{error}</div>}<footer><button type="button" className="ghost-button" onClick={() => setEditing(undefined)}>إلغاء</button><button className="primary-button" disabled={saving}>{saving && <RefreshCw className="spin" />}{editing ? "حفظ التعديلات" : "إضافة"}</button></footer></form></section></div>}
    </div>
  );
}
