const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SUMMARY_MAX_CHARACTERS,
  SUMMARY_MAX_TOKENS,
  SUMMARY_DISCLAIMER,
  SUMMARY_FALLBACK,
  inspectionSummaryMode,
  inspectionSummaryOrganizationAllowlist,
  isInspectionSummaryOrganizationAllowed,
  buildInspectionSummarySource,
  normalizeGeneratedSummary,
  ensureInspectionSummary,
} = require("../services/inspectionSummary");

function template() {
  return {
    fields: [
      { key: "businessName", label: "Property", type: "text" },
      { key: "propertyAddress", label: "Address", type: "text" },
      { key: "graffiti", label: "Is there graffiti?", reportLabel: "Graffiti", type: "yes_no_issue" },
      { key: "securityLights", label: "Are security lights out?", reportLabel: "Security Lights", type: "yes_no_issue" },
      { key: "potholes", label: "Are there potholes?", reportLabel: "Potholes", type: "yes_no_issue" },
      { key: "homelessActivity", label: "Homeless activity", type: "textarea" },
    ],
  };
}

function job(overrides = {}) {
  return {
    _id: "inspection-job-1",
    organizationId: "org-picor",
    orgType: "COM",
    pdfKey: "",
    submissionData: {
      businessName: "Test Center",
      propertyAddress: "1 Private Street",
      graffiti: "yes",
      graffitiDescription: "Markings were observed near the west wall.",
      securityLights: "no",
      potholes: "",
      homelessActivity: "No activity was observed during this visit.",
    },
    templateSnapshot: template(),
    aiSummary: null,
    saves: 0,
    async save() { this.saves += 1; },
    ...overrides,
  };
}

const PICOR = { _id: "org-picor", name: "Picor" };

function aiEnv(mode, overrides = {}) {
  return {
    INSPECTION_AI_SUMMARY_MODE: mode,
    INSPECTION_AI_SUMMARY_ORGANIZATION_ALLOWLIST: "Picor",
    ...overrides,
  };
}

test("summary mode is explicitly gated and defaults invalid values to off", () => {
  assert.equal(inspectionSummaryMode({}), "off");
  assert.equal(inspectionSummaryMode({ INSPECTION_AI_SUMMARY_MODE: "DEV-PREVIEW" }), "dev-preview");
  assert.equal(inspectionSummaryMode({ INSPECTION_AI_SUMMARY_MODE: "unexpected" }), "off");
});

test("summary organization allowlist is exact, case-insensitive, and fail-closed", () => {
  assert.deepEqual([...inspectionSummaryOrganizationAllowlist({})], []);
  assert.equal(isInspectionSummaryOrganizationAllowed(job(), PICOR, {
    INSPECTION_AI_SUMMARY_ORGANIZATION_ALLOWLIST: "Other Tenant, PICOR",
  }), true);
  assert.equal(isInspectionSummaryOrganizationAllowed(job(), PICOR, {
    INSPECTION_AI_SUMMARY_ORGANIZATION_ALLOWLIST: "Picor West",
  }), false);
  assert.equal(isInspectionSummaryOrganizationAllowed(job(), PICOR, {
    INSPECTION_AI_SUMMARY_ORGANIZATION_ALLOWLIST: "org-picor",
  }), true);
});

test("summary source contains findings and notes without property identity fields", () => {
  const source = buildInspectionSummarySource(job().submissionData, template());
  assert.deepEqual(source.counts, { attention: 1, ok: 1, notAssessed: 1 });
  assert.deepEqual(source.attentionItems, [{
    area: "Graffiti",
    description: "Markings were observed near the west wall.",
  }]);
  assert.deepEqual(source.observations, [{
    label: "Homeless activity",
    value: "No activity was observed during this visit.",
  }]);
  assert.doesNotMatch(JSON.stringify(source), /Private Street|Test Center/);
});

test("generated summaries are normalized to the 300-character contract", () => {
  assert.equal(
    normalizeGeneratedSummary('Summary: "One issue was recorded."'),
    "One issue was recorded."
  );
  const bounded = normalizeGeneratedSummary("word ".repeat(100));
  assert.ok(bounded.length <= SUMMARY_MAX_CHARACTERS);
  assert.ok(bounded.endsWith("…"));
});

test("DEV preview generates, persists, and renders a Bedrock summary", async () => {
  let commandInput;
  const client = {
    async send(command) {
      commandInput = command.input;
      return {
        stopReason: "end_turn",
        output: { message: { content: [{ text: "Graffiti was noted near the west wall. Other recorded checks were satisfactory." }] } },
        usage: { inputTokens: 420, outputTokens: 22 },
        metrics: { latencyMs: 310 },
      };
    },
  };
  const inspectionJob = job();
  const result = await ensureInspectionSummary(inspectionJob, {
    client,
    organization: PICOR,
    env: aiEnv("dev-preview", {
      INSPECTION_AI_SUMMARY_MODEL_ID: "us.amazon.nova-micro-v1:0",
      INSPECTION_AI_SUMMARY_TIMEOUT_MS: "8000",
      AWS_REGION: "us-east-2",
    }),
    now: new Date("2026-08-06T12:00:00Z"),
  });

  assert.equal(commandInput.modelId, "us.amazon.nova-micro-v1:0");
  assert.equal(commandInput.inferenceConfig.maxTokens, SUMMARY_MAX_TOKENS);
  assert.equal(commandInput.inferenceConfig.temperature, 0);
  assert.equal(inspectionJob.aiSummary.status, "generated");
  assert.equal(inspectionJob.aiSummary.inputTokens, 420);
  assert.equal(inspectionJob.saves, 1);
  assert.equal(result.coverSummary.disclaimer, SUMMARY_DISCLAIMER);
  assert.equal(result.coverSummary.aiGenerated, true);
});

test("shadow mode reuses a matching stored result without rendering or reinvoking", async () => {
  const inspectionJob = job();
  const env = aiEnv("shadow");
  const generated = await ensureInspectionSummary(inspectionJob, {
    env,
    organization: PICOR,
    client: {
      async send() {
        return {
          stopReason: "end_turn",
          output: { message: { content: [{ text: "One item was flagged for review." }] } },
          usage: {},
          metrics: {},
        };
      },
    },
  });
  assert.equal(generated.coverSummary, null);

  const reused = await ensureInspectionSummary(inspectionJob, {
    env,
    organization: PICOR,
    client: { async send() { throw new Error("should not be called"); } },
  });
  assert.equal(reused.summary.text, "One item was flagged for review.");
  assert.equal(reused.coverSummary, null);
  assert.equal(inspectionJob.saves, 1);
});

test("Bedrock failures are recorded but return a non-AI PDF fallback", async () => {
  const inspectionJob = job();
  const result = await ensureInspectionSummary(inspectionJob, {
    env: aiEnv("dev-preview"),
    organization: PICOR,
    client: { async send() { throw new Error("Bedrock is temporarily unavailable"); } },
  });

  assert.equal(inspectionJob.aiSummary.status, "failed");
  assert.match(inspectionJob.aiSummary.lastError, /temporarily unavailable/);
  assert.equal(result.coverSummary.text, SUMMARY_FALLBACK);
  assert.equal(result.coverSummary.disclaimer, "");
  assert.equal(result.coverSummary.aiGenerated, false);
  assert.equal(inspectionJob.saves, 1);
});

test("a non-allowlisted organization never invokes Bedrock or mutates the job", async () => {
  const inspectionJob = job();
  const result = await ensureInspectionSummary(inspectionJob, {
    env: aiEnv("live", {
      INSPECTION_AI_SUMMARY_ORGANIZATION_ALLOWLIST: "Another Organization",
    }),
    organization: PICOR,
    client: { async send() { throw new Error("should not be called"); } },
  });
  assert.equal(result.mode, "live");
  assert.equal(result.coverSummary, null);
  assert.equal(inspectionJob.aiSummary, null);
  assert.equal(inspectionJob.saves, 0);
});

test("off mode never invokes Bedrock or mutates the job", async () => {
  const inspectionJob = job();
  const result = await ensureInspectionSummary(inspectionJob, {
    env: { INSPECTION_AI_SUMMARY_MODE: "off" },
    client: { async send() { throw new Error("should not be called"); } },
  });
  assert.equal(result.coverSummary, null);
  assert.equal(inspectionJob.aiSummary, null);
  assert.equal(inspectionJob.saves, 0);
});

test("non-commercial reports do not purchase an unused cover summary", async () => {
  const inspectionJob = job({ orgType: "LTR" });
  const result = await ensureInspectionSummary(inspectionJob, {
    env: aiEnv("dev-preview"),
    organization: PICOR,
    client: { async send() { throw new Error("should not be called"); } },
  });
  assert.equal(result.coverSummary, null);
  assert.equal(inspectionJob.aiSummary, null);
  assert.equal(inspectionJob.saves, 0);
});
