import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

export function Markdown({ text }: { text: string }) {
  return <div className="markdown-content">
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[[rehypeKatex, { trust: false, maxExpand: 200, maxSize: 15 }]]}
      skipHtml components={{
        a: ({ children, href, title, id, "aria-label": label }) => <a href={href} title={title} id={id} aria-label={label}
          target={href?.startsWith("#") ? undefined : "_blank"} rel="noopener noreferrer">{children}</a>,
        table: ({ children }) => <div className="table-scroll"><table>{children}</table></div>,
      }}>{text}</ReactMarkdown>
  </div>;
}
