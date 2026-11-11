import type { Metadata } from "next";
import { ExternalLink } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { rows } from "@/lib/portal-data";

export const metadata: Metadata = { title: "Learning materials" };
type Material = { id: string; title: string; engagements: { title: string } | null; material_attachments: { id: string }[] };

export default async function MaterialsPage() {
  const { db } = await requireRole("student");
  const materials = rows(await db.from("materials").select("id,title,engagements(title),material_attachments(id)")
    .order("published_at", { ascending: false }).returns<Material[]>(), "materials");
  return <>
    <header className="page-intro"><h1>Learning materials</h1><p>Open your tutor’s documents and handouts in a new tab.</p></header>
    {materials.length ? <div className="stack content-column">
      {materials.map(material => <article key={material.id} className="panel material-row">
        <h2>{material.engagements?.title ?? "Learning material"}</h2>
        <div className="stack gap-1">
          <h2><a href={`/portal/materials/${material.id}`} target="_blank" rel="noopener noreferrer">{material.title} <ExternalLink size={16} aria-hidden /></a></h2>
          {!!material.material_attachments.length && <small className="muted">{material.material_attachments.length} {material.material_attachments.length === 1 ? "file" : "files"}</small>}
        </div>
      </article>)}
    </div> : <p className="empty">No learning materials have been shared with you yet.</p>}
  </>;
}
