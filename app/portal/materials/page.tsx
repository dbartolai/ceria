import type { Metadata } from "next";
import { Download } from "lucide-react";
import { MathText } from "@/components/math";
import { requireRole } from "@/lib/auth";
import { rows } from "@/lib/portal-data";

export const metadata: Metadata = { title: "Learning materials" };

type Material = {
  id: string;
  title: string;
  body: string;
  engagements: { title: string } | null;
  material_attachments: { id: string; filename: string; created_at: string }[];
};

export default async function MaterialsPage() {
  const { db } = await requireRole("student");
  const materials = rows(await db.from("materials").select("id,title,body,engagements(title),material_attachments(id,filename,created_at)")
    .order("published_at", { ascending: false }).returns<Material[]>(), "materials");
  return <>
    <header className="page-intro"><h1>Learning materials</h1><p>Handouts, worked examples, and notes shared by your tutor.</p></header>
    {materials.length > 0 ? <div className="stack content-column">
      {materials.map((material) => <article key={material.id} className="panel stack">
        {material.engagements && <p className="eyebrow">{material.engagements.title}</p>}
        <h2>{material.title}</h2>
        {material.body && <p className="prose-copy"><MathText text={material.body} /></p>}
        {material.material_attachments.length > 0 && <ul className="stack">
          {[...material.material_attachments].sort((a, b) => a.created_at.localeCompare(b.created_at)).map((attachment) => <li key={attachment.id}>
            <a className="button secondary" href={`/portal/files/${attachment.id}`}>
              <Download size={16} aria-hidden /> {attachment.filename}
            </a>
          </li>)}
        </ul>}
      </article>)}
    </div> : <p className="empty">No learning materials have been shared with you yet.</p>}
  </>;
}
