import { notFound } from "next/navigation";
import { MathText } from "@/components/math";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/lib/tutor/action-form";
import { TutorIntro } from "@/lib/tutor/ui";
import { isUuid } from "@/lib/tutor/validation";
import { publishMaterial, unpublishMaterial } from "../actions";
import { MaterialForm } from "../form";

export default async function MaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { db } = await requireRole("tutor");
  const { data: material, error } = await db.from("materials")
    .select("id,title,body,storage_path,engagement_id,published_at").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!material) notFound();

  return (
    <div className="stack">
      <TutorIntro title={material.title} description={material.published_at ? "Published" : "Draft"} back={{ href: "/portal/tutor/materials", label: "Learning materials" }} />
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <section className="panel stack">
          <h2>{material.published_at ? "Material" : "Edit draft"}</h2>
          {material.published_at ? <div className="prose-copy"><MathText text={material.body} /></div>
            : <MaterialForm key={material.id} engagementId={material.engagement_id} material={material} />}
          {material.storage_path && <a href={`/portal/attachments/${id}`}>Download current attachment</a>}
        </section>
        <section className="panel stack self-start">
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
