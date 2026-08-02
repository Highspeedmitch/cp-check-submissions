import {
  HELP_ARTICLES,
  helpArticleByFile,
  helpArticleBySlug,
  matchesHelpSearch,
  visibleHelpArticles,
} from "./helpAccess";

test("filters help articles by exact role and organization type", () => {
  expect(visibleHelpArticles({ role: "user", orgType: "COM" }).map(({ slug }) => slug)).toEqual([
    "complete-and-submit-an-inspection",
    "prepare-and-send-an-invoice",
    "revise-a-declined-invoice",
  ]);
  expect(visibleHelpArticles({ role: "user", orgType: "STR" }).map(({ slug }) => slug)).toEqual([
    "complete-and-submit-an-inspection",
  ]);
  expect(visibleHelpArticles({ role: "property_manager", orgType: "COM" }).map(({ slug }) => slug)).toEqual([
    "review-an-invoice",
    "review-property-submissions",
    "create-a-scheduler-assignment",
  ]);
  expect(visibleHelpArticles({ role: "admin", orgType: "COM" }).map(({ slug }) => slug)).toEqual([
    "review-property-submissions",
    "create-a-scheduler-assignment",
  ]);
  expect(visibleHelpArticles({ role: "client", orgType: "STR" })).toEqual([]);
  expect(visibleHelpArticles({
    role: "contractor",
    orgType: "COM",
    accountScope: "afterlight_resource",
  }).map(({ slug }) => slug)).toEqual([
    "resource-account-setup",
    "use-the-resource-portal",
    "complete-a-resource-assignment",
    "understand-resource-earnings",
  ]);
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
