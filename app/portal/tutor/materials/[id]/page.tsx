import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { materialOptions } from "@/lib/materials/data";
import { ActionForm } from "@/lib/tutor/action-form";
import { Field, TutorIntro } from "@/lib/tutor/ui";
import { isUuid } from "@/lib/tutor/validation";
import { deleteMaterial, linkMaterialToSession, unlinkMaterialFromSession, publishMaterial, removeMaterialFile, unpublishMaterial } from "../actions";
import { FileUploader } from "../file-uploader";
import { MaterialForm } from "../form";

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { db } = await requireRole("tutor");
  const { data: material, error } = await db.from("materials")
    .select("id,title,body,interactive,engagement_id,session_id,student_id,published_at,material_attachments(id,filename,size_bytes,created_at),material_sessions(session_id)")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  if (!material) notFound();
  const attachments = [...material.material_attachments].sort((a, b) => a.created_at.localeCompare(b.created_at));
  const options = await materialOptions(db, material.engagement_id, material.student_id);
  const linked = new Set(material.material_sessions.map(row => row.session_id));
  const available = options.sessions.filter(session => !linked.has(session.id) && session.id !== material.session_id);

  return (
    <div className="stack">
      <TutorIntro title={material.title} description={material.published_at ? "Published · Saved edits are visible to students." : "Draft"} back={{ href: "/portal/tutor/materials", label: "Learning materials" }}>
        <a className="button secondary" href={`/portal/materials/${id}`} target="_blank" rel="noopener noreferrer">Open material preview</a>
      </TutorIntro>
      <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="stack">
          <section className="panel stack">
            <h2>Edit material</h2>
            <MaterialForm key={`${material.id}-${material.session_id}-${material.student_id}`} engagementId={material.engagement_id} material={material}
              sessions={options.sessions} students={options.students} sessionId={material.session_id ?? undefined} studentId={material.student_id ?? undefined} />
          </section>
          <section className="panel stack">
            <h2>Files</h2>
            {attachments.length > 0 ? <ul className="rule-list">
              {attachments.map((attachment) => <li className="row spread" key={attachment.id}>
                <a className="min-w-0 break-words" href={`/portal/files/${attachment.id}`} target="_blank" rel="noopener noreferrer">{attachment.filename}</a>
                <ActionForm action={removeMaterialFile} label="Remove file" secondary>
                  <input type="hidden" name="id" value={attachment.id} />
                </ActionForm>
              </li>)}
            </ul> : <p className="muted">No files added yet.</p>}
            <FileUploader materialId={id} />
          </section>
        </div>
        <div className="stack">
          <section className="panel stack">
          <h2>Publishing</h2>
          <ActionForm action={material.published_at ? unpublishMaterial : publishMaterial}
            label={material.published_at ? "Return to draft" : "Publish material"} secondary={!!material.published_at}>
            <input name="id" type="hidden" value={id} />
            {!material.published_at && <p className="muted">Review the saved version before sharing it with students.</p>}
          </ActionForm>
          </section>
          <section className="panel stack">
            <h2>Session links</h2>
            {material.session_id && <p><Link href={`/portal/tutor/sessions/${material.session_id}`}>{options.sessions.find(session => session.id === material.session_id)?.label ?? "Related session"}</Link><small className="muted block">Related session. Change it in the material editor.</small></p>}
            {options.sessions.filter(session => linked.has(session.id)).map(session => <div className="stack gap-2" key={session.id}>
              <Link href={`/portal/tutor/sessions/${session.id}`}>{session.label}</Link>
              <ActionForm action={unlinkMaterialFromSession} label="Remove session link" secondary>
                <input type="hidden" name="material_id" value={id} /><input type="hidden" name="session_id" value={session.id} />
              </ActionForm>
            </div>)}
            {available.length ? <ActionForm action={linkMaterialToSession} label="Link to session" secondary>
              <input type="hidden" name="material_id" value={id} />
              <Field name="link-material-session" label="Session"><select id="link-material-session" name="session_id" required defaultValue="">
                <option value="" disabled>Choose a session</option>
                {available.map(session => <option key={session.id} value={session.id}>{session.label}</option>)}
              </select></Field>
            </ActionForm> : <p className="muted">Schedule a session in this engagement to add another link.</p>}
          </section>
          <section className="panel stack">
            <h2>Delete material</h2>
            <p className="muted">Permanently removes the material, files, session links, and student work.</p>
            <ActionForm action={deleteMaterial} label="Delete material" secondary confirmMessage={`Permanently delete ${material.title}, its files, and all student work?`}>
              <input type="hidden" name="id" value={id} />
            </ActionForm>
          </section>
        </div>
      </div>
    </div>
  );
}
