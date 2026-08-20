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
