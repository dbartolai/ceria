"use client";

import { useState } from "react";
import { Markdown } from "./markdown";

export function MarkdownEditor({ id, name, initial = "", maxLength = 50000, rows = 10 }: {
  id: string; name: string; initial?: string; maxLength?: number; rows?: number;
}) {
  const [text, setText] = useState(initial);
  return <div className="stack gap-2">
    <textarea id={id} name={name} value={text} onChange={event => setText(event.target.value)} rows={rows} maxLength={maxLength} />
    <small className="muted">Markdown supports headings, lists, tables, links, images, and code. Use $x^2$ for inline math or $$x^2$$ on separate lines for display equations.</small>
    <details className="markdown-preview"><summary>Preview formatting</summary>
      {text ? <Markdown text={text} /> : <p className="muted">Start writing to preview your formatting.</p>}
    </details>
  </div>;
}
