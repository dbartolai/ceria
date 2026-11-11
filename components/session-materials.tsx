import { ExternalLink } from "lucide-react";
import type { SessionMaterialLink } from "@/lib/materials/data";

export function SessionMaterials({ materials }: { materials: SessionMaterialLink[] }) {
  if (!materials.length) return null;
  return <section className="stack gap-2">
    <h4>Materials</h4>
    {materials.map(material => <a className="section-link" href={`/portal/materials/${material.id}`} key={material.id} target="_blank" rel="noopener noreferrer">
      {material.title}{!material.published_at && " (draft)"} <ExternalLink size={14} aria-hidden />
    </a>)}
  </section>;
}
