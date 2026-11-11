import Link from "next/link";
import { ExternalLink } from "lucide-react";

export type MaterialListItem = {
  id: string; title: string; interactive: boolean; published_at: string | null;
  engagements: { title: string } | null; material_attachments: { id: string }[];
};

export function MaterialList({ materials, tutor = false }: { materials: MaterialListItem[]; tutor?: boolean }) {
  return <div className="stack content-column">
    {materials.map(material => <article key={material.id} className="panel material-row">
      <h2>{material.engagements?.title ?? "Learning material"}</h2>
      <div className="stack gap-2">
        <h2><a href={`/portal/materials/${material.id}`} target="_blank" rel="noopener noreferrer">{material.title} <ExternalLink size={16} aria-hidden /></a></h2>
        <small className="muted">{[
          material.material_attachments.length ? `${material.material_attachments.length} ${material.material_attachments.length === 1 ? "file" : "files"}` : null,
          material.interactive ? "Interactive" : null,
          tutor ? material.published_at ? "Published" : "Draft" : null,
        ].filter(Boolean).join(" · ")}</small>
        {tutor && <Link className="section-link" href={`/portal/tutor/materials/${material.id}`}>Edit material</Link>}
      </div>
    </article>)}
  </div>;
}
