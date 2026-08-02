import articles from "../content/helpArticles.json";

export const HELP_ARTICLES = articles;

export function getHelpAudience(storage = window.localStorage) {
  return {
    role: storage.getItem("role") || "user",
    orgType: storage.getItem("orgType") || "COM",
    accountScope: storage.getItem("accountScope") || "organization",
  };
}
export function isHelpArticleVisible(article, audience) {
  if (!article || !audience) return false;
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
