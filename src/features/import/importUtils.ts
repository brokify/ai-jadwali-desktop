import * as XLSX from "xlsx";
import type { EntityFields, EntityKind, EntityRecord } from "../../lib/tauri";

export type ImportField = {
  key: string;
  label: string;
  required?: boolean;
  type?: "text" | "number" | "reference";
  source?: EntityKind;
  aliases: string[];
};

export const importEntityConfig: Record<EntityKind, { label: string; fields: ImportField[] }> = {
  grades: {
    label: "الصفوف",
    fields: [
      { key: "name", label: "اسم الصف", required: true, aliases: ["الصف", "اسم الصف", "grade", "name"] },
      { key: "sortOrder", label: "الترتيب", type: "number", aliases: ["الترتيب", "ترتيب", "sort", "order"] },
    ],
  },
  sections: {
    label: "الشُعب",
    fields: [
      { key: "name", label: "اسم الشعبة", required: true, aliases: ["الشعبة", "اسم الشعبة", "section", "name"] },
      { key: "gradeId", label: "اسم الصف", required: true, type: "reference", source: "grades", aliases: ["الصف", "اسم الصف", "grade"] },
      { key: "capacity", label: "السعة", type: "number", aliases: ["السعة", "عدد الطلاب", "capacity"] },
    ],
  },
  subjects: {
    label: "المواد",
    fields: [
      { key: "name", label: "اسم المادة", required: true, aliases: ["المادة", "اسم المادة", "subject", "name"] },
      { key: "code", label: "الرمز", aliases: ["الرمز", "رمز المادة", "code"] },
      { key: "color", label: "اللون", aliases: ["اللون", "color"] },
    ],
  },
  teachers: {
    label: "المعلمون",
    fields: [
      { key: "name", label: "اسم المعلم", required: true, aliases: ["المعلم", "اسم المعلم", "teacher", "name"] },
      { key: "employeeCode", label: "الرقم الوظيفي", aliases: ["الرقم الوظيفي", "رقم الموظف", "employee code", "code"] },
      { key: "maxPeriodsPerDay", label: "الحد اليومي", type: "number", aliases: ["الحد اليومي", "حصص يومية", "daily max"] },
      { key: "maxPeriodsPerWeek", label: "الحد الأسبوعي", type: "number", aliases: ["الحد الأسبوعي", "حصص أسبوعية", "weekly max"] },
    ],
  },
  rooms: {
    label: "القاعات",
    fields: [
      { key: "name", label: "اسم القاعة", required: true, aliases: ["القاعة", "اسم القاعة", "room", "name"] },
      { key: "roomType", label: "نوع القاعة", aliases: ["النوع", "نوع القاعة", "type"] },
      { key: "capacity", label: "السعة", type: "number", aliases: ["السعة", "capacity"] },
    ],
  },
  lesson_requirements: {
    label: "متطلبات الحصص",
    fields: [
      { key: "sectionId", label: "اسم الشعبة", required: true, type: "reference", source: "sections", aliases: ["الشعبة", "اسم الشعبة", "section"] },
      { key: "subjectId", label: "اسم المادة", required: true, type: "reference", source: "subjects", aliases: ["المادة", "اسم المادة", "subject"] },
      { key: "teacherId", label: "اسم المعلم", type: "reference", source: "teachers", aliases: ["المعلم", "اسم المعلم", "teacher"] },
      { key: "preferredRoomId", label: "القاعة المفضلة", type: "reference", source: "rooms", aliases: ["القاعة", "القاعة المفضلة", "room"] },
      { key: "periodsPerWeek", label: "الحصص أسبوعيًا", required: true, type: "number", aliases: ["الحصص أسبوعيا", "عدد الحصص", "periods", "weekly periods"] },
      { key: "consecutivePeriods", label: "الحصص المتتالية", type: "number", aliases: ["متتالية", "الحصص المتتالية", "consecutive"] },
    ],
  },
};

export type ParsedSheet = {
  headers: string[];
  rows: { rowNumber: number; values: Record<string, string> }[];
};

export type PreparedImportRow = {
  rowNumber: number;
  payload: EntityFields;
  errors: string[];
  duplicate: boolean;
};

export function decodeBase64(value: string) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function readWorkbook(bytes: Uint8Array) {
  const isZipWorkbook = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isLegacyWorkbook = bytes[0] === 0xd0 && bytes[1] === 0xcf;
  if (!isZipWorkbook && !isLegacyWorkbook) {
    const csvText = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
    return XLSX.read(csvText, { type: "string", cellDates: false, dense: true });
  }
  return XLSX.read(bytes, { type: "array", cellDates: false, dense: true });
}

export function parseSheet(workbook: XLSX.WorkBook, sheetName: string): ParsedSheet {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return { headers: [], rows: [] };
  const matrix = XLSX.utils.sheet_to_json<(string | number | boolean)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
  const firstRow = matrix[0] ?? [];
  const seen = new Map<string, number>();
  const headers = firstRow.map((value, index) => {
    const base = cleanText(value) || `عمود ${index + 1}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count ? `${base} (${count + 1})` : base;
  });
  const rows = matrix.slice(1).map((values, index) => ({
    rowNumber: index + 2,
    values: Object.fromEntries(headers.map((header, column) => [header, cleanText(values[column] ?? "")])),
  })).filter((row) => Object.values(row.values).some(Boolean));
  return { headers, rows };
}

export function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeDigits(value: unknown) {
  const arabic = "٠١٢٣٤٥٦٧٨٩";
  const persian = "۰۱۲۳۴۵۶۷۸۹";
  return cleanText(value).replace(/[٠-٩۰-۹]/g, (digit) => {
    const arabicIndex = arabic.indexOf(digit);
    return String(arabicIndex >= 0 ? arabicIndex : persian.indexOf(digit));
  });
}

export function normalizeName(value: unknown) {
  return normalizeDigits(value)
    .normalize("NFKC")
    .replace(/[ـًٌٍَُِّْ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .toLocaleLowerCase("ar");
}

export function suggestMapping(headers: string[], kind: EntityKind) {
  const mapping: Record<string, string> = {};
  for (const header of headers) {
    const normalizedHeader = normalizeName(header);
    const match = importEntityConfig[kind].fields.find((field) =>
      field.aliases.some((alias) => normalizeName(alias) === normalizedHeader),
    );
    if (match && !Object.values(mapping).includes(match.key)) mapping[header] = match.key;
  }
  return mapping;
}

function resolveReference(
  value: string,
  source: EntityKind,
  records: Record<EntityKind, EntityRecord[]>,
) {
  const normalized = normalizeName(value);
  return records[source].find(
    (record) => !record.archivedAt && normalizeName(record.fields.name) === normalized,
  )?.id;
}

function duplicateKey(kind: EntityKind, payload: EntityFields) {
  if (kind === "lesson_requirements") {
    return [payload.sectionId, payload.subjectId, payload.teacherId ?? ""].join("|");
  }
  return normalizeName(payload.name);
}

export function prepareRows(
  sheet: ParsedSheet,
  mapping: Record<string, string>,
  kind: EntityKind,
  records: Record<EntityKind, EntityRecord[]>,
) {
  const fields = importEntityConfig[kind].fields;
  const existingKeys = new Set(
    records[kind].filter((record) => !record.archivedAt).map((record) => duplicateKey(kind, record.fields)),
  );
  const fileKeys = new Set<string>();

  return sheet.rows.map<PreparedImportRow>((row) => {
    const payload: EntityFields = {};
    const errors: string[] = [];
    for (const field of fields) {
      const header = Object.keys(mapping).find((column) => mapping[column] === field.key);
      const raw = header ? row.values[header] ?? "" : "";
      if (!raw) {
        if (field.required) errors.push(`${field.label} مفقود`);
        payload[field.key] = field.key === "sortOrder" ? 0 : field.key === "consecutivePeriods" ? 1 : null;
      } else if (field.type === "number") {
        const number = Number(normalizeDigits(raw));
        if (!Number.isFinite(number) || number < 0) {
          errors.push(`${field.label} ليس رقمًا صالحًا`);
          payload[field.key] = null;
        } else payload[field.key] = number;
      } else if (field.type === "reference" && field.source) {
        const id = resolveReference(raw, field.source, records);
        if (!id && field.required) errors.push(`${field.label} «${raw}» غير موجود`);
        else if (!id && raw) errors.push(`${field.label} «${raw}» غير موجود`);
        payload[field.key] = id ?? null;
      } else payload[field.key] = cleanText(raw);
    }
    const key = duplicateKey(kind, payload);
    const duplicate = Boolean(key) && (existingKeys.has(key) || fileKeys.has(key));
    if (duplicate) errors.push("صف مكرر");
    if (key) fileKeys.add(key);
    return { rowNumber: row.rowNumber, payload, errors, duplicate };
  });
}
