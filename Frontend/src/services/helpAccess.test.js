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
    "enable-notifications",
    "authenticator-verification",
  ]);
  expect(visibleHelpArticles({ role: "user", orgType: "STR" }).map(({ slug }) => slug)).toEqual([
    "complete-and-submit-an-inspection",
    "connect-my-calendar",
    "enable-notifications",
    "authenticator-verification",
  ]);
  expect(visibleHelpArticles({ role: "property_manager", orgType: "COM" }).map(({ slug }) => slug)).toEqual([
    "review-an-invoice",
    "review-property-submissions",
    "review-portfolio-reporting",
    "manage-inspection-form-templates",
    "create-a-scheduler-assignment",
    "request-and-manage-property-bids",
    "enable-notifications",
    "authenticator-verification",
  ]);
  expect(visibleHelpArticles({ role: "admin", orgType: "COM" }).map(({ slug }) => slug)).toEqual([
    "review-property-submissions",
    "review-portfolio-reporting",
    "manage-inspection-form-templates",
    "create-a-scheduler-assignment",
    "manage-property-regions-routes",
    "request-and-manage-property-bids",
    "request-a-service-model-change",
    "enable-notifications",
    "manage-organization-users",
    "onboard-customer-field-operators",
    "complete-organization-setup",
    "manage-administrator-seats",
    "configure-property-delivery",
    "authenticator-verification",
    "bulk-onboard-users-properties",
  ]);
  expect(visibleHelpArticles({ role: "client", orgType: "STR" }).map(({ slug }) => slug)).toEqual([
    "use-short-term-rental-owner-portal",
    "enable-notifications",
    "authenticator-verification",
  ]);
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
    "enable-notifications",
    "authenticator-verification",
  ]);
});

test("shows customer-contractor billing guidance to normalized Field Operator accounts", () => {
  expect(visibleHelpArticles({
    role: "user",
    orgType: "COM",
    accountScope: "organization",
    capabilities: ["customer_contractor_billing"],
  }).map(({ slug }) => slug)).toEqual([
    "complete-and-submit-an-inspection",
    "prepare-and-send-an-invoice",
    "revise-a-declined-invoice",
    "connect-my-calendar",
    "enable-notifications",
    "authenticator-verification",
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
    "enable-notifications",
    "authenticator-verification",
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
    "enable-notifications",
    "authenticator-verification",
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
    "calculate-preliminary-service-pricing",
    "create-complimentary-prospect-reports",
    "review-service-model-change-requests",
    "create-and-access-an-organization",
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

test("Boutique organizations do not receive portfolio reporting guidance", () => {
  const articles = visibleHelpArticles({
    role: "property_manager",
    orgType: "COM",
    accountScope: "organization",
    serviceModel: "boutique",
  });
  expect(articles.map(({ slug }) => slug)).not.toContain("review-portfolio-reporting");
});
