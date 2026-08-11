import {
  afterlightCoverageExpected,
  inspectionSubmissionEnabled,
  portfolioReportingEnabled,
} from "./servicePlanAccess";

test("Boutique excludes portfolio reporting even when stale client metadata says otherwise", () => {
  expect(portfolioReportingEnabled({
    serviceModel: "boutique",
    portfolioReportingIncluded: true,
  })).toBe(false);
  expect(portfolioReportingEnabled({
    serviceModel: "managed",
    portfolioReportingIncluded: false,
  })).toBe(false);
  expect(portfolioReportingEnabled({ serviceModel: "managed" })).toBe(true);
});

test("Boutique uses the Afterlight coverage queue", () => {
  expect(afterlightCoverageExpected("boutique")).toBe(true);
  expect(afterlightCoverageExpected("managed")).toBe(true);
  expect(afterlightCoverageExpected("platform")).toBe(false);
});

test("inspection launch access follows the plan and assignment context", () => {
  expect(inspectionSubmissionEnabled({
    serviceModel: "boutique",
    accountScope: "organization",
  })).toBe(false);
  expect(inspectionSubmissionEnabled({
    serviceModel: "boutique",
    accountScope: "organization",
    assignmentId: "legacy-assignment-1",
  })).toBe(true);
  expect(inspectionSubmissionEnabled({
    serviceModel: "boutique",
    accountScope: "afterlight_resource",
    assignmentId: "afterlight-assignment-1",
  })).toBe(true);
  expect(inspectionSubmissionEnabled({
    serviceModel: "managed",
    accountScope: "afterlight_resource",
  })).toBe(false);
  expect(inspectionSubmissionEnabled({
    serviceModel: "managed",
    accountScope: "organization",
  })).toBe(true);
});
