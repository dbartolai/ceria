import { notFound } from "next/navigation";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { MarkdownEditor } from "@/components/markdown-editor";
import { ActionForm } from "@/lib/tutor/action-form";
import { formatDateTime } from "@/lib/format";
import { saveMaterialResponse } from "../actions";
import { requirePerson } from "@/lib/auth";
import { isUuid } from "@/lib/tutor/validation";

type DocumentMaterial = { id: string; title: string; body: string; interactive: boolean; published_at: string | null; storage_path: string | null; engagements: { title: string } | null; material_attachments: { id: string; filename: string; created_at: string }[] };
type StudentWork = { student_id: string; body: string; updated_at: string; people: { name: string } | null };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { db, person } = await requirePerson();
  const { data: material, error } = await db.from("materials").select("id,title,body,interactive,published_at,storage_path,engagements(title),material_attachments(id,filename,created_at)").eq("id", id).maybeSingle<DocumentMaterial>();
  if (error) throw error;
  if (!material) notFound();
  const files = [...material.material_attachments].sort((a,b) => a.created_at.localeCompare(b.created_at))
    .map(file => ({ ...file, href: `/portal/files/${file.id}` }));
  if (!files.length && material.storage_path) files.push({ id, filename: material.storage_path.split("/").at(-1) || "Material file", created_at: "", href: `/portal/attachments/${id}` });
  const { data: responses, error: workError } = await db.from("material_responses").select("student_id,body,updated_at,people(name)").eq("material_id", id).order("updated_at", { ascending: false }).returns<StudentWork[]>();
  if (workError) throw workError;
  const work = responses?.find(response => response.student_id === person.id);
  return <div className="stack-lg content-column">
    <header className="page-intro"><p className="muted">{material.engagements?.title}</p><h1>{material.title}</h1>
      {person.role === "tutor" && <div className="row mt-4"><Link className="button secondary" href={`/portal/tutor/materials/${id}`}>Edit material</Link>{!material.published_at && <span className="status neutral">Draft</span>}</div>}
    </header>
    {material.body && <section className="panel"><Markdown text={material.body} /></section>}
    {files.map(file => <section className="panel stack" key={file.id}>
      <a className="section-link" href={file.href} target="_blank" rel="noopener noreferrer">{file.filename} <ExternalLink size={15} aria-hidden /></a>
      {/\.pdf$/i.test(file.filename) && <iframe className="document-pdf" src={file.href} title={file.filename} loading="lazy" />}
      {/\.txt$/i.test(file.filename) && <iframe className="document-text" src={file.href} title={file.filename} loading="lazy" sandbox="" />}
      {/\.(png|jpe?g|webp)$/i.test(file.filename) && <a href={file.href} target="_blank" rel="noopener noreferrer" aria-label={`Open ${file.filename}`}>
        {/* Authenticated document images use the file route so access is checked on every request. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="document-image" src={file.href} alt={file.filename} loading="lazy" />
      </a>}
    </section>)}
    {material.interactive && person.role === "student" && <section className="panel stack">
      <h2>Your work</h2><p className="muted">Write your answers and reasoning here. Only you and your tutor can see this workspace.</p>
      <ActionForm action={saveMaterialResponse} label="Save work">
        <input type="hidden" name="material_id" value={id} />
        <label htmlFor="student-material-work">Answers and working</label>
        <MarkdownEditor id="student-material-work" name="body" initial={work?.body} />
      </ActionForm>
      {work && <p className="muted text-sm">Last saved {formatDateTime(work.updated_at)}</p>}
    </section>}
    {person.role === "tutor" && (material.interactive || !!responses?.length) && <section className="panel stack">
      <h2>Student work</h2>
      {responses?.length ? responses.map(response => <article key={response.student_id} className="stack border-b border-[var(--border)] pb-4">
        <div><h3>{response.people?.name ?? "Student"}</h3><small className="muted">Saved {formatDateTime(response.updated_at)}</small></div>
        {response.body ? <Markdown text={response.body} /> : <p className="muted">The student cleared their answer workspace.</p>}
      </article>) : <p className="muted">{material.interactive ? "Saved student answers will appear here." : "Enable Interactive material in the editor to let students save their work."}</p>}
    </section>}
  </div>;
}
