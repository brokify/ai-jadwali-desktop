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
