import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import PageHeader from "../ui/PageHeader";
import {
  getHelpAudience,
  helpArticleByFile,
  helpArticleBySlug,
  isHelpArticleVisible,
} from "../../services/helpAccess";

function publicHelpUrl(relativePath) {
  const prefix = (process.env.PUBLIC_URL || "").replace(/\/$/, "");
  return `${prefix}/help/${String(relativePath || "").replace(/^\.\//, "")}`;
}

function withoutTitle(markdown) {
  return String(markdown || "").replace(/^#\s+[^\r\n]+\r?\n+/, "");
}

export default function HelpArticle() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const audience = useMemo(() => getHelpAudience(), []);
  const article = helpArticleBySlug(slug);
  const visible = isHelpArticleVisible(article, audience);
  const [markdown, setMarkdown] = useState("");
  const [loading, setLoading] = useState(Boolean(article && visible));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!article || !visible) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(publicHelpUrl(article.file), { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("The help article could not be loaded.");
        return response.text();
      })
      .then((content) => setMarkdown(withoutTitle(content)))
      .catch((requestError) => {
        if (requestError.name !== "AbortError") {
          setError(requestError.message || "The help article could not be loaded.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [article, visible]);

  if (!article || !visible) return <Navigate to="/help" replace />;

  const markdownComponents = {
    a: ({ href = "", children, ...props }) => {
      const normalizedFile = href.replace(/^\.\//, "");
      if (normalizedFile === "README.md") return <Link to="/help">{children}</Link>;
      if (normalizedFile.endsWith(".md")) {
        const linkedArticle = helpArticleByFile(normalizedFile);
        return linkedArticle && isHelpArticleVisible(linkedArticle, audience)
          ? <Link to={`/help/${linkedArticle.slug}`}>{children}</Link>
          : <span>{children}</span>;
      }
      const external = /^https?:\/\//i.test(href);
      return <a href={href} {...(external ? { target: "_blank", rel: "noreferrer" } : {})} {...props}>{children}</a>;
    },
    img: ({ src = "", alt = "", ...props }) => (
      <img src={publicHelpUrl(src)} alt={alt} loading="lazy" {...props} />
    ),
    table: ({ children }) => <div className="beta-help-table-wrap"><table>{children}</table></div>,
  };

  return (
    <div className="beta-page">
      <main className="beta-page-shell beta-help-article-page">
        <PageHeader
          onBack={() => navigate("/help")}
          backLabel="Help Center"
          eyebrow={article.category}
          title={article.title}
          subtitle={article.summary}
          actions={<span className="beta-status">{article.estimatedTime}</span>}
        />

        {loading && <div className="beta-empty-state beta-help-loading" role="status">Loading guide…</div>}
        {error && (
          <div className="beta-alert error beta-help-load-error" role="alert">
            <p>{error}</p>
            <button className="beta-button secondary compact" type="button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </div>
        )}
        {!loading && !error && (
          <article className="beta-panel beta-help-article">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {markdown}
            </ReactMarkdown>
          </article>
        )}
      </main>
    </div>
  );
}
