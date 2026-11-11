import { notFound } from "next/navigation";
import { MathText } from "@/components/math";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/lib/tutor/action-form";
import { TutorIntro } from "@/lib/tutor/ui";
import { isUuid } from "@/lib/tutor/validation";
import { publishMaterial, removeMaterialFile, unpublishMaterial } from "../actions";
import { FileUploader } from "../file-uploader";
import { MaterialForm } from "../form";

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { db } = await requireRole("tutor");
  const { data: material, error } = await db.from("materials")
    .select("id,title,body,engagement_id,published_at,material_attachments(id,filename,size_bytes,created_at)")
    .eq("id", id).maybeSingle();
  if (error) throw error;
  if (!material) notFound();
  const attachments = [...material.material_attachments].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <div className="stack">
      <TutorIntro title={material.title} description={material.published_at ? "Published" : "Draft"} back={{ href: "/portal/tutor/materials", label: "Learning materials" }} />
      <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div className="stack">
          <section className="panel stack">
            <h2>{material.published_at ? "Material" : "Edit draft"}</h2>
            {material.published_at ? material.body && <div className="prose-copy"><MathText text={material.body} /></div>
              : <MaterialForm key={material.id} engagementId={material.engagement_id} material={material} />}
          </section>
          <section className="panel stack">
            <h2>Files</h2>
            {attachments.length > 0 ? <ul className="rule-list">
              {attachments.map((attachment) => <li className="row spread" key={attachment.id}>
                <a className="min-w-0 break-words" href={`/portal/files/${attachment.id}`}>{attachment.filename}</a>
                {!material.published_at && <ActionForm action={removeMaterialFile} label="Remove file" secondary>
                  <input type="hidden" name="id" value={attachment.id} />
                </ActionForm>}
              </li>)}
            </ul> : <p className="muted">No files added yet.</p>}
            {!material.published_at && <FileUploader materialId={id} />}
          </section>
        </div>
        <section className="panel stack">
          <h2>Publishing</h2>
          <ActionForm action={material.published_at ? unpublishMaterial : publishMaterial}
            label={material.published_at ? "Return to draft" : "Publish material"} secondary={!!material.published_at}>
            <input name="id" type="hidden" value={id} />
            {!material.published_at && <p className="muted">Review the saved version before sharing it with students.</p>}
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
