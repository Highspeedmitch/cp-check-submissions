import { issueCoverageLabel } from "./reportingPresentation";

test("issue coverage labels explain the numerator and denominator", () => {
  expect(issueCoverageLabel({
    totalIssueOccurrences: 7,
    reportableIssueSubmissionCount: 10,
  })).toBe("7 issues across 10 inspections");
});

test("issue coverage labels use singular wording and support older API responses", () => {
  expect(issueCoverageLabel({
    totalIssueOccurrences: 1,
    reportableIssueSubmissionCount: 1,
  })).toBe("1 issue across 1 inspection");
  expect(issueCoverageLabel(
    { reportableIssueSubmissionCount: 2 },
    [{ occurrences: 1 }, { occurrences: 2 }]
  )).toBe("3 issues across 2 inspections");
});
