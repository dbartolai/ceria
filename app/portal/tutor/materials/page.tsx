import Link from "next/link";
import { MaterialList, type MaterialListItem } from "@/components/material-list";
import { requireRole } from "@/lib/auth";
import { materialOptions } from "@/lib/materials/data";
import { engagementLabel, tutorEngagements } from "@/lib/tutor/engagements";
import { TutorIntro } from "@/lib/tutor/ui";
import { MaterialForm } from "./form";

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ engagement?: string; session?: string }> }) {
  const params = await searchParams;
  const { db } = await requireRole("tutor");
  const results = await Promise.all([
    tutorEngagements(db).then(data => ({ data, error: null })),
    db.from("materials").select("id,title,interactive,published_at,engagements(title),material_attachments(id)").order("title").returns<MaterialListItem[]>(),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [engagements, materials] = results;
  const selected = engagements.data?.find((item) => item.id === params.engagement);
  let students: { id: string; name: string }[] = [];
  let sessions: { id: string; label: string; participants: string[] }[] = [];

  if (selected) {
    ({ students, sessions } = await materialOptions(db, selected.id));
  }

  return (
    <div className="stack">
      <TutorIntro title="Learning materials" description="Draft lesson plans and handouts, then share approved materials with students." />
        <details className="panel stack content-column" open={!!selected}>
          <summary>New material</summary>
          {selected ? <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link href={`/portal/tutor/engagements/${selected.id}`}>{engagementLabel(selected)}</Link>
              <Link className="muted text-sm" href="/portal/tutor/materials">Change engagement</Link>
            </div>
            <MaterialForm key={`${selected.id}-${params.session ?? ""}`} engagementId={selected.id} students={students} sessions={sessions}
              sessionId={sessions.find((item) => item.id === params.session)?.id} />
          </> : engagements.data?.length ? (
            <form action="/portal/tutor/materials" className="stack">
              <label htmlFor="material-engagement">Engagement</label>
              <select id="material-engagement" name="engagement" required defaultValue="">
                <option value="" disabled>Choose an engagement</option>
                {engagements.data.map((item) => <option key={item.id} value={item.id}>{engagementLabel(item)}</option>)}
              </select>
              <div><button className="button secondary">Continue</button></div>
            </form>
          ) : <Link href="/portal/tutor/engagements">Create an engagement first</Link>}
        </details>
        {materials.data?.length ? <MaterialList materials={materials.data} tutor /> : <p className="empty">No learning materials yet.</p>}
    </div>
  );
}
