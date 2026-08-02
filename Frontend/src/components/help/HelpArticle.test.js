import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import HelpArticle from "./HelpArticle";

jest.mock("react-markdown", () => {
  const React = require("react");
  return function MockReactMarkdown({ components }) {
    return React.createElement(
      "div",
      null,
      React.createElement("p", null, "Article introduction."),
      components.img({ src: "images/inspection-checklist.svg", alt: "Inspection example" }),
      components.a({ href: "submitter-submit-invoice.md", children: "Prepare an invoice" }),
      components.a({ href: "README.md", children: "Back to the knowledge base" })
    );
  };
});
jest.mock("remark-gfm", () => () => {});

function renderArticle(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/help/:slug" element={<HelpArticle />} />
        <Route path="/help" element={<div>Help landing</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  localStorage.clear();
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    text: async () => [
      "# Complete and submit an inspection",
      "",
      "Article introduction.",
      "",
      "![Inspection example](images/inspection-checklist.svg)",
      "",
      "[Prepare an invoice](submitter-submit-invoice.md)",
      "",
      "[Back to the knowledge base](README.md)",
    ].join("\n"),
  });
});

afterEach(() => {
  delete global.fetch;
});

test("loads Markdown and routes local article and image links through the Help Center", async () => {
  localStorage.setItem("role", "user");
  localStorage.setItem("orgType", "COM");
  renderArticle("/help/complete-and-submit-an-inspection");

  expect(await screen.findByText("Article introduction.")).toBeInTheDocument();
  expect(screen.getByRole("img", { name: "Inspection example" })).toHaveAttribute(
    "src",
    "/help/images/inspection-checklist.svg"
  );
  expect(screen.getByRole("link", { name: "Prepare an invoice" })).toHaveAttribute(
    "href",
    "/help/prepare-and-send-an-invoice"
  );
  expect(screen.getByRole("link", { name: "Back to the knowledge base" })).toHaveAttribute("href", "/help");
});

test("redirects a role that cannot view the requested article", async () => {
  localStorage.setItem("role", "property_manager");
  localStorage.setItem("orgType", "COM");
  renderArticle("/help/complete-and-submit-an-inspection");

  expect(await screen.findByText("Help landing")).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});

test("loads the public contractor setup article before sign-in", async () => {
  renderArticle("/help/resource-account-setup");

  expect(await screen.findByText("Article introduction.")).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith(
    "/help/resource-account-setup.md",
    expect.objectContaining({ signal: expect.any(AbortSignal) })
  );
});
