import {
  formatInspectionIssuePercent,
  inspectionIssueCoverageLabel,
} from "./reportingPresentation";

test("inspection issue coverage labels explain the numerator and denominator", () => {
  expect(inspectionIssueCoverageLabel({
    inspectionsWithIssuesCount: 7,
    reportableIssueSubmissionCount: 10,
  })).toBe("7 of 10 reportable inspections");
});

test("inspection issue coverage labels use singular wording", () => {
  expect(inspectionIssueCoverageLabel({
    inspectionsWithIssuesCount: 1,
    reportableIssueSubmissionCount: 1,
  })).toBe("1 of 1 reportable inspection");
});

test("inspection issue percentages display clean whole and decimal percentages", () => {
  expect(formatInspectionIssuePercent({ inspectionsWithIssuesPercent: 70 })).toBe("70%");
  expect(formatInspectionIssuePercent({ inspectionsWithIssuesPercent: 66.7 })).toBe("66.7%");
  expect(formatInspectionIssuePercent({})).toBe("0%");
});
