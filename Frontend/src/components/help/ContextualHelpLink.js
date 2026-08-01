import React from "react";
import { Link } from "react-router-dom";
import {
  getHelpAudience,
  helpArticleBySlug,
  isHelpArticleVisible,
} from "../../services/helpAccess";

export default function ContextualHelpLink({ slug, label = "Need help?", className = "" }) {
  const audience = getHelpAudience();
  const article = slug ? helpArticleBySlug(slug) : null;

  if (article && !isHelpArticleVisible(article, audience)) return null;

  return (
    <Link
      className={`beta-help-link${className ? ` ${className}` : ""}`}
      to={article ? `/help/${article.slug}` : "/help"}
      target={article ? "_blank" : undefined}
      rel={article ? "noreferrer" : undefined}
      aria-label={article ? `${label} (opens in a new tab)` : label}
    >
      <span aria-hidden="true">?</span>
      {label}
    </Link>
  );
}
