import articles from "../content/helpArticles.json";

export const HELP_ARTICLES = articles;

export function getHelpAudience(storage = window.localStorage) {
  const accountScope = storage.getItem("accountScope") || "organization";
  return {
    role: accountScope === "afterlight_resource"
      ? "contractor"
      : storage.getItem("role") || "user",
    orgType: storage.getItem("orgType") || "COM",
    accountScope,
    platformRole: storage.getItem("platformRole") || "",
    assumedOrganization: storage.getItem("assumedOrganization") === "true",
  };
}
export function isHelpArticleVisible(article, audience) {
  if (!article || !audience) return false;
  const platformContext = audience.platformRole === "platform_admin"
    && !audience.assumedOrganization;
  const platformArticle = Array.isArray(article.platformRoles)
    && article.platformRoles.length > 0;
  if (platformContext !== platformArticle) return false;
  if (platformArticle && !article.platformRoles.includes(audience.platformRole)) return false;
  return article.roles.includes(audience.role)
    && article.accountScopes.includes(audience.accountScope || "organization")
    && article.orgTypes.includes(audience.orgType);
}

export function visibleHelpArticles(audience, allArticles = HELP_ARTICLES) {
  return allArticles.filter((article) => isHelpArticleVisible(article, audience));
}

export function helpArticleBySlug(slug, allArticles = HELP_ARTICLES) {
  return allArticles.find((article) => article.slug === slug) || null;
}

export function helpArticleByFile(file, allArticles = HELP_ARTICLES) {
  return allArticles.find((article) => article.file === file) || null;
}

export function matchesHelpSearch(article, query) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  if (!normalizedQuery) return true;
  const searchable = [
    article.title,
    article.summary,
    article.category,
    ...(article.keywords || []),
  ].join(" ").toLowerCase();
  return normalizedQuery.split(/\s+/).every((term) => searchable.includes(term));
}
