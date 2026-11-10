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
  storage_path: string | null;
  engagements: { title: string } | null;
};

export default async function MaterialsPage() {
  const { db } = await requireRole("student");
  const materials = rows(await db.from("materials").select("id,title,body,storage_path,engagements(title)")
    .order("published_at", { ascending: false }).returns<Material[]>(), "materials");
  return <>
    <header className="page-intro"><h1>Learning materials</h1><p>Handouts, worked examples, and notes shared by your tutor.</p></header>
    {materials.length > 0 ? <div className="stack content-column">
      {materials.map((material) => <article key={material.id} className="panel stack">
        {material.engagements && <p className="eyebrow">{material.engagements.title}</p>}
        <h2>{material.title}</h2>
        {material.body && <p className="prose-copy"><MathText text={material.body} /></p>}
        {material.storage_path && <a className="button secondary" href={`/portal/attachments/${material.id}`}>
          <Download size={16} aria-hidden /> Download attachment
        </a>}
      </article>)}
    </div> : <p className="empty">No learning materials have been shared with you yet.</p>}
  </>;
}
