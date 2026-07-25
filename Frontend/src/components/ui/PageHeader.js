import React from "react";

export default function PageHeader({ eyebrow, title, subtitle, onBack, backLabel = "Dashboard", actions }) {
  return (
    <header className="beta-page-header">
      <div>
        {onBack && (
          <button type="button" className="beta-back-link" onClick={onBack}>
            <span aria-hidden="true">←</span> {backLabel}
          </button>
        )}
        {eyebrow && <p className="beta-eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {subtitle && <p className="beta-page-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="beta-header-actions">{actions}</div>}
    </header>
  );
}
