"use client";

import { useState, type ReactNode } from "react";

export interface ProductTabPanel {
  id: string;
  label: string;
  content: ReactNode;
}

/** Real client-side tabs for the product page. Panels are rendered
 *  server-side and passed in; this component owns only the selection. */
export default function ProductTabs({ panels }: { panels: ProductTabPanel[] }) {
  const [active, setActive] = useState(panels[0]?.id);
  return (
    <div className="ptabs">
      <div className="ptab-list" role="tablist" aria-label="Product details">
        {panels.map((p) => (
          <button
            key={p.id}
            role="tab"
            id={`ptab-${p.id}`}
            aria-selected={active === p.id}
            aria-controls={`ppanel-${p.id}`}
            className="ptab"
            onClick={() => setActive(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>
      {panels.map((p) => (
        <div
          key={p.id}
          role="tabpanel"
          id={`ppanel-${p.id}`}
          aria-labelledby={`ptab-${p.id}`}
          className="ptab-panel"
          hidden={active !== p.id}
        >
          {p.content}
        </div>
      ))}
    </div>
  );
}
