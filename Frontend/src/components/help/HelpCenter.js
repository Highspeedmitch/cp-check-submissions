import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import PageHeader from "../ui/PageHeader";
import {
  getHelpAudience,
  matchesHelpSearch,
  visibleHelpArticles,
} from "../../services/helpAccess";

const ROLE_NAMES = {
  admin: "organization administrator",
  property_manager: "property manager",
  user: "submitter",
  contractor: "contractor",
  cleaner: "cleaner",
  client: "client",
};

function dashboardRoute(audience) {
  if (audience.platformRole === "platform_admin" && !audience.assumedOrganization) return "/platform";
  if (audience.accountScope === "afterlight_resource") return "/resource";
  return audience.role === "client" ? "/client/dashboard" : "/dashboard";
}
export default function HelpCenter() {
  const navigate = useNavigate();
  const audience = useMemo(() => getHelpAudience(), []);
  const [query, setQuery] = useState("");
  const visibleArticles = useMemo(() => visibleHelpArticles(audience), [audience]);
  const matchingArticles = useMemo(
    () => visibleArticles.filter((article) => matchesHelpSearch(article, query)),
    [query, visibleArticles]
  );
  const groupedArticles = useMemo(() => matchingArticles.reduce((groups, article) => {
    if (!groups[article.category]) groups[article.category] = [];
    groups[article.category].push(article);
    return groups;
  }, {}), [matchingArticles]);

  return (
    <div className="beta-page">
      <main className="beta-page-shell beta-help-center">
        <PageHeader
          onBack={() => navigate(dashboardRoute(audience))}
          title="Help Center"
          subtitle={audience.platformRole === "platform_admin" && !audience.assumedOrganization
            ? "Guides for Afterlight platform administration."
            : `Guides selected for your ${ROLE_NAMES[audience.role] || "account"} role.`}
        />

        <section className="beta-help-hero" aria-labelledby="help-search-heading">
          <div>
            <p className="beta-eyebrow">Afterlight support</p>
            <h2 id="help-search-heading">How can we help?</h2>
            <p>Search by task, status, or the name of a button you see on screen.</p>
          </div>
          <label className="beta-help-search">
            <span className="sr-only">Search help articles</span>
            <span aria-hidden="true" className="beta-help-search-icon">⌕</span>
            <input
              type="search"
              value={query}
              placeholder="Try “invoice,” “photos,” or “assignment”"
              onChange={(event) => setQuery(event.target.value)}
              autoComplete="off"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")}>Clear</button>
            )}
          </label>
        </section>

        {visibleArticles.length === 0 ? (
          <div className="beta-empty-state beta-help-empty">
            Help articles for this role are coming soon.
          </div>
        ) : matchingArticles.length === 0 ? (
          <div className="beta-empty-state beta-help-empty">
            <strong>No articles matched “{query}”.</strong>
            <span>Try a shorter term or the label shown on the screen.</span>
            <button type="button" className="beta-text-button" onClick={() => setQuery("")}>Show all articles</button>
          </div>
        ) : (
          Object.entries(groupedArticles).map(([category, categoryArticles]) => (
            <section className="beta-help-category" key={category}>
              <div className="beta-section-heading">
                <div>
                  <h2>{category}</h2>
                  <p>{categoryArticles.length} {categoryArticles.length === 1 ? "guide" : "guides"}</p>
                </div>
              </div>
              <div className="beta-help-grid">
                {categoryArticles.map((article) => (
                  <Link className="beta-help-card" to={`/help/${article.slug}`} key={article.slug}>
                    <div>
                      <span className="beta-status">{article.category}</span>
                      <span className="beta-help-time">{article.estimatedTime}</span>
                    </div>
                    <h3>{article.title}</h3>
                    <p>{article.summary}</p>
                    <span className="beta-help-card-action">Read guide <span aria-hidden="true">→</span></span>
                  </Link>
                ))}
              </div>
            </section>
          ))
        )}
      </main>
    </div>
  );
}
