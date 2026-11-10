import katex from "katex";

const math = /(\$\$[\s\S]+?\$\$|(?<!\\)\$(?:\\.|[^$\n\\])+?\$)/g;

export function MathText({ text }: { text: string }) {
  return <span className="math-text">{text.split(math).map((part, index) => {
    if (index % 2 === 0) return part;
    const displayMode = part.startsWith("$$");
    const markerLength = displayMode ? 2 : 1;
    const html = katex.renderToString(part.slice(markerLength, -markerLength), {
      displayMode, throwOnError: false, trust: false, maxExpand: 200, maxSize: 15,
    });
    return <span key={index} className={displayMode ? "math-block" : undefined}
      dangerouslySetInnerHTML={{ __html: html }} />;
  })}</span>;
}
