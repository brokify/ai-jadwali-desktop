import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "./App";

test("renders the RTL dashboard shell", () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "نظرة عامة" })).toBeInTheDocument();
  expect(screen.getByText("يعمل محليًا دون إنترنت")).toBeInTheDocument();
});

test("allows a different period count for each working day", () => {
  render(<MemoryRouter initialEntries={["/school"]}><App /></MemoryRouter>);
  const thursdayPeriods = screen.getByLabelText("عدد حصص الخميس");
  expect(thursdayPeriods).toHaveValue(7);
  fireEvent.change(thursdayPeriods, { target: { value: "5" } });
  expect(thursdayPeriods).toHaveValue(5);
  expect(screen.getAllByLabelText(/^عدد حصص /)).toHaveLength(5);
});

test("creates and archives a grade in browser preview mode", async () => {
  render(<MemoryRouter initialEntries={["/data"]}><App /></MemoryRouter>);
  fireEvent.click(screen.getAllByRole("button", { name: "إضافة صف" })[0]);
  fireEvent.change(screen.getByLabelText(/اسم الصف/), { target: { value: "الصف الأول" } });
  fireEvent.change(screen.getByLabelText("ترتيب العرض"), { target: { value: "1" } });
  fireEvent.click(screen.getByRole("button", { name: /^إضافة$/ }));
  expect(await screen.findByText("الصف الأول")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "أرشفة الصف الأول" }));
  expect(screen.queryByText("الصف الأول")).not.toBeInTheDocument();
});

test("previews a spreadsheet and flags duplicate import rows", async () => {
  render(<MemoryRouter initialEntries={["/import"]}><App /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "تحميل نموذج تجريبي" }));
  expect(await screen.findByText("التعيين مكتمل")).toBeInTheDocument();
  expect(screen.getByText("صف مكرر")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "استيراد 3 صف" }));
  expect(await screen.findByText("تم قبول 2 صف، وتسجيل 1 خطأ.")).toBeInTheDocument();
});

test("generates a local timetable and opens the weekly grid", async () => {
  render(<MemoryRouter initialEntries={["/generate"]}><App /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "توليد الجدول الآن" }));
  expect(await screen.findByText("اكتمل الجدول دون تعارضات صارمة")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: /فتح الجدول/ }));
  expect(await screen.findByRole("heading", { name: "الجداول" })).toBeInTheDocument();
  expect(screen.getAllByText("الأول أ").length).toBeGreaterThan(0);
});

test("simulates a local backup in browser preview mode", async () => {
  render(<MemoryRouter initialEntries={["/backup"]}><App /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "إنشاء نسخة الآن" }));
  expect(await screen.findByText(/تم إنشاء النسخة الاحتياطية/)).toBeInTheDocument();
});

test("saves local application preferences", async () => {
  render(<MemoryRouter initialEntries={["/settings"]}><App /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "حفظ التفضيلات" }));
  expect(await screen.findByText("حُفظت تفضيلات التطبيق محليًا.")).toBeInTheDocument();
});

test("adds a local user and a custom role", async () => {
  render(<MemoryRouter initialEntries={["/users"]}><App /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("button", { name: "إضافة مستخدم" }));
  fireEvent.change(screen.getByLabelText("الاسم الكامل"), { target: { value: "سارة محمد" } });
  fireEvent.change(screen.getByLabelText("اسم المستخدم"), { target: { value: "sara.local" } });
  fireEvent.click(screen.getByRole("button", { name: "حفظ المستخدم" }));
  expect(await screen.findByText("سارة محمد")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "الأدوار والصلاحيات" }));
  fireEvent.click(screen.getByRole("button", { name: "دور مخصص" }));
  fireEvent.change(screen.getByLabelText("اسم الدور"), { target: { value: "مراجع محلي" } });
  fireEvent.click(screen.getByRole("button", { name: "حفظ الدور" }));
  expect(await screen.findByText("مراجع محلي")).toBeInTheDocument();
});
