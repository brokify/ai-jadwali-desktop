import { utils, write } from "xlsx";
import { describe, expect, test } from "vitest";
import { normalizeDigits, normalizeName, parseSheet, prepareRows, readWorkbook, suggestMapping } from "./importUtils";
import type { EntityKind, EntityRecord } from "../../lib/tauri";

const emptyRecords = Object.fromEntries(
  ["grades", "sections", "subjects", "teachers", "rooms", "lesson_requirements"].map((kind) => [kind, []]),
) as unknown as Record<EntityKind, EntityRecord[]>;

describe("import normalization", () => {
  test("normalizes Arabic and Persian digits", () => {
    expect(normalizeDigits("١٢۳")).toBe("123");
    expect(normalizeName("  الصــفُ الأول  ")).toBe("الصف الاول");
  });

  test("parses a workbook, suggests mapping, and detects duplicates", () => {
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([
      ["اسم الصف", "الترتيب"],
      ["الأول", "١"],
      ["الأول", "٢"],
    ]), "الصفوف");
    const bytes = write(workbook, { type: "array", bookType: "xlsx" });
    const parsedWorkbook = readWorkbook(new Uint8Array(bytes));
    const sheet = parseSheet(parsedWorkbook, "الصفوف");
    const mapping = suggestMapping(sheet.headers, "grades");
    const rows = prepareRows(sheet, mapping, "grades", emptyRecords);
    expect(mapping).toEqual({ "اسم الصف": "name", "الترتيب": "sortOrder" });
    expect(rows[0].payload.sortOrder).toBe(1);
    expect(rows[1].duplicate).toBe(true);
  });

  test("parses UTF-8 CSV data", () => {
    const workbook = readWorkbook(new TextEncoder().encode("اسم الصف,الترتيب\nالثالث,٣"));
    const sheet = parseSheet(workbook, workbook.SheetNames[0]);
    expect(sheet.headers).toEqual(["اسم الصف", "الترتيب"]);
    expect(sheet.rows[0].values["اسم الصف"]).toBe("الثالث");
  });
});
