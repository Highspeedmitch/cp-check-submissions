import {
  HELP_ARTICLES,
  helpArticleByFile,
  helpArticleBySlug,
  matchesHelpSearch,
  visibleHelpArticles,
  getHelpAudience,
} from "./helpAccess";

test("filters help articles by exact role and organization type", () => {
  expect(visibleHelpArticles({ role: "user", orgType: "COM" }).map(({ slug }) => slug)).toEqual([
    "complete-and-submit-an-inspection",
    "connect-my-calendar",
  ]);
  expect(visibleHelpArticles({ role: "user", orgType: "STR" }).map(({ slug }) => slug)).toEqual([
    "complete-and-submit-an-inspection",
    "connect-my-calendar",
  ]);
  expect(visibleHelpArticles({ role: "property_manager", orgType: "COM" }).map(({ slug }) => slug)).toEqual([
    "review-an-invoice",
    "review-property-submissions",
    "create-a-scheduler-assignment",
  ]);
  expect(visibleHelpArticles({ role: "admin", orgType: "COM" }).map(({ slug }) => slug)).toEqual([
    "review-property-submissions",
    "create-a-scheduler-assignment",
    "request-a-service-model-change",
  ]);
  expect(visibleHelpArticles({ role: "client", orgType: "STR" })).toEqual([]);
  expect(visibleHelpArticles({
    role: "contractor",
    orgType: "COM",
    accountScope: "afterlight_resource",
  }).map(({ slug }) => slug)).toEqual([
    "connect-my-calendar",
    "resource-account-setup",
    "use-the-resource-portal",
    "complete-a-resource-assignment",
    "understand-resource-earnings",
  ]);
});

test("owner and employee resources receive non-payable guidance instead of earnings guidance", () => {
  const slugs = visibleHelpArticles({
    role: "contractor",
    orgType: "COM",
    accountScope: "afterlight_resource",
    resourceType: "owner",
  }).map(({ slug }) => slug);
  expect(slugs).toEqual([
    "connect-my-calendar",
    "resource-account-setup",
    "use-the-resource-portal",
    "complete-a-resource-assignment",
    "afterlight-owner-employee-resource-work",
  ]);
  expect(slugs).not.toContain("understand-resource-earnings");
});

test("a dual-workspace submitter is treated as a contractor inside the Resource Portal", () => {
  const storage = {
    getItem: (key) => ({
      role: "user",
      orgType: "COM",
      accountScope: "afterlight_resource",
    })[key] || null,
  };
  const audience = getHelpAudience(storage);
  expect(audience.role).toBe("contractor");
  expect(visibleHelpArticles(audience).map(({ slug }) => slug)).toEqual([
    "connect-my-calendar",
    "resource-account-setup",
    "use-the-resource-portal",
    "complete-a-resource-assignment",
    "understand-resource-earnings",
  ]);
});

test("platform guidance is isolated from organization and assumed-access help", () => {
  const platformAudience = {
    role: "admin",
    orgType: "COM",
    accountScope: "organization",
    platformRole: "platform_admin",
    assumedOrganization: false,
  };
  expect(visibleHelpArticles(platformAudience).map(({ slug }) => slug)).toEqual([
    "process-afterlight-service-invoices",
    "manage-resources-and-payables",
    "configure-gusto-contractor-payments",
    "review-service-model-change-requests",
  ]);
  expect(visibleHelpArticles({ role: "admin", orgType: "COM", accountScope: "organization" })
    .some(({ slug }) => slug === "process-afterlight-service-invoices")).toBe(false);
  expect(visibleHelpArticles({ ...platformAudience, assumedOrganization: true })
    .some(({ slug }) => slug === "manage-resources-and-payables")).toBe(false);
});
test("finds registered articles by slug and source file", () => {
  const article = helpArticleBySlug("review-an-invoice");
  expect(article.title).toBe("Review, approve, or decline an invoice");
  expect(helpArticleByFile(article.file)).toBe(article);
  expect(helpArticleBySlug("missing-article")).toBeNull();
});

test("searches titles, summaries, categories, and keywords", () => {
  const invoiceArticle = HELP_ARTICLES.find(({ slug }) => slug === "prepare-and-send-an-invoice");
  expect(matchesHelpSearch(invoiceArticle, "invoice approval")).toBe(true);
  expect(matchesHelpSearch(invoiceArticle, "photos")).toBe(false);
  expect(matchesHelpSearch(invoiceArticle, "")).toBe(true);
});
