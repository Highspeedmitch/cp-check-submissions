import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import ProspectAssessments from "./ProspectAssessments";
import { api } from "../services/api";

jest.mock("../services/api", () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("./ui/SortableFieldList", () => ({ fields, onChange, renderField, emptyMessage }) => {
  const React = require("react");
  if (!fields.length) return <div>{emptyMessage}</div>;
  const moveLater = (index) => {
    const next = [...fields];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    onChange(next.map((field, order) => ({ ...field, order })));
  };
  return <div>{fields.map((field, index) => (
    <article key={field.key}>
      {field.locked
        ? <span>Locked</span>
        : <>
          <button type="button" aria-label={`Drag ${field.label} to reorder`}>Drag</button>
          <button type="button" aria-label={`Move ${field.label} later`}
            disabled={!fields[index + 1] || fields[index + 1].locked}
            onClick={() => moveLater(index)}>Move later</button>
        </>}
      {renderField(field)}
    </article>
  ))}</div>;
});

const fields = [
  { key: "businessName", label: "Shopping Center Name", reportLabel: "Shopping Center Name", type: "text", section: "Property Details", required: true, locked: true },
  { key: "propertyAddress", label: "Property Address", reportLabel: "Property Address", type: "text", section: "Property Details", required: true, locked: true },
  { key: "graffiti", label: "Is there graffiti?", reportLabel: "Graffiti", type: "yes_no_issue", section: "Property Condition", allowPhotos: true, locked: false },
  { key: "dumpsters", label: "Are dumpsters overflowing?", reportLabel: "Dumpsters", type: "yes_no_issue", section: "Property Condition", allowPhotos: true, locked: false },
  { key: "generalObservations", label: "General Observations", reportLabel: "General Observations", type: "textarea", section: "Additional Observations", allowPhotos: true, locked: true },
];

const template = {
  _id: "template-1",
  name: "Prospect Property Assessment",
  title: "Complimentary Exterior Property Assessment",
  version: 3,
  fields,
};

beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockImplementation((url) => Promise.resolve(
    url.endsWith("prospect-template") ? template : []
  ));
  api.put.mockImplementation((_url, payload) => Promise.resolve({
    ...template,
    ...payload,
    version: 4,
  }));
});

test("complimentary assessment uses the sectioned submission form architecture", async () => {
  render(<ProspectAssessments />);
  fireEvent.click(await screen.findByRole("button", { name: "New assessment" }));

  expect(screen.getByRole("heading", { name: "Property Details" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Property Condition" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Additional Observations" })).toBeInTheDocument();
  expect(screen.getByText(/Bedrock will create the concise first-page summary/)).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Is there graffiti?"), { target: { value: "yes" } });
  expect(screen.getByLabelText("Describe the opportunity")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Generate assessment PDF" })).toBeInTheDocument();
});

test("platform admin can reorder unlocked complimentary fields and publish the version", async () => {
  render(<ProspectAssessments />);
  fireEvent.click(await screen.findByRole("button", { name: "Template" }));

  expect(screen.getByRole("button", { name: "Drag Is there graffiti? to reorder" })).toBeInTheDocument();
  expect(screen.getAllByText("Locked")).toHaveLength(3);
  const generalCard = screen.getByText(/Maps to the PDF General Observations area/).closest("article");
  expect(within(generalCard).getByLabelText("Question or field label")).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Move Is there graffiti? later" }));
  fireEvent.click(screen.getByRole("button", { name: "Publish template version" }));

  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
  const payload = api.put.mock.calls[0][1];
  expect(payload.fields.map((field) => field.key)).toEqual([
    "businessName",
    "propertyAddress",
    "dumpsters",
    "graffiti",
    "generalObservations",
  ]);
  expect(await screen.findByText("Prospect template version 4 is active.")).toBeInTheDocument();
});
