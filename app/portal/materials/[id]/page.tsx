import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { MathText } from "@/components/math";
import { requirePerson } from "@/lib/auth";
import { isUuid } from "@/lib/tutor/validation";

type DocumentMaterial = { id: string; title: string; body: string; engagements: { title: string } | null; material_attachments: { id: string; filename: string; created_at: string }[] };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { db } = await requirePerson();
  const { data: material, error } = await db.from("materials").select("id,title,body,engagements(title),material_attachments(id,filename,created_at)").eq("id", id).maybeSingle<DocumentMaterial>();
  if (error) throw error;
  if (!material) notFound();
  const files = [...material.material_attachments].sort((a,b) => a.created_at.localeCompare(b.created_at));
  return <div className="stack-lg content-column">
    <header className="page-intro"><p className="muted">{material.engagements?.title}</p><h1>{material.title}</h1></header>
    {material.body && <section className="panel prose-copy"><MathText text={material.body} /></section>}
    {files.map(file => <section className="panel stack" key={file.id}>
      <a className="section-link" href={`/portal/files/${file.id}`} target="_blank" rel="noopener noreferrer">{file.filename} <ExternalLink size={15} aria-hidden /></a>
      {/\.pdf$/i.test(file.filename) && <iframe className="document-pdf" src={`/portal/files/${file.id}`} title={file.filename} loading="lazy" />}
      {/\.(png|jpe?g|webp)$/i.test(file.filename) && <a href={`/portal/files/${file.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.filename}`}>
        {/* Authenticated document images use the file route so access is checked on every request. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="document-image" src={`/portal/files/${file.id}`} alt={file.filename} loading="lazy" />
      </a>}
    </section>)}
  </div>;
}
