import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "./App";

test("renders the RTL dashboard shell", () => {
  render(<MemoryRouter><App /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "نظرة عامة" })).toBeInTheDocument();
  expect(screen.getByText("يعمل محليًا دون إنترنت")).toBeInTheDocument();
});
