import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { emptyPreparation, preparationSchema, type StudyPlan } from "@/lib/study-plans/contracts";
import { preparationMaterials, sessionStudent } from "@/lib/study-plans/data";
import { TutorIntro } from "@/lib/tutor/ui";
import { isUuid } from "@/lib/tutor/validation";
import { SessionWorkspace } from "./workspace";

export const maxDuration = 120;

export default async function PreparePage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ student?: string }>;
}) {
  const { id } = await params, { student: selected } = await searchParams;
  if (!isUuid(id)) notFound();
  const { db } = await requireRole("tutor");
  const { data: session, error } = await db.from("sessions").select("id,title").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!session) notFound();
  const { data: roster, error: rosterError } = await db.from("session_students").select("student_id").eq("session_id", id);
  if (rosterError) throw rosterError;
  const ids = roster.map(row => row.student_id);
  const { data: students, error: peopleError } = ids.length
    ? await db.from("people").select("id,name").in("id", ids).order("name") : { data: [], error: null };
  if (peopleError) throw peopleError;
  const studentId = selected ?? students?.[0]?.id;
  if (selected && !ids.includes(selected)) notFound();
  let workspace = null;
  if (studentId) {
    const details = await sessionStudent(db, id, studentId);
    const [preparation, plan, materials] = await Promise.all([
      db.from("session_preparations").select("summary,topics").eq("session_id", id).eq("student_id", studentId).maybeSingle(),
      db.from("study_plans").select("*,study_plan_items(*)").eq("session_id", id).eq("student_id", studentId).maybeSingle(),
      preparationMaterials(db, details.engagement_id, id, studentId),
    ]);
    if (preparation.error || plan.error) throw preparation.error ?? plan.error;
    workspace = <SessionWorkspace key={studentId} sessionId={id} studentId={studentId}
      initialPreparation={preparation.data ? preparationSchema.parse(preparation.data) : emptyPreparation}
      savedPlan={plan.data as StudyPlan | null}
      materials={materials.map(material => ({ id: material.id, title: material.title, fileCount: material.material_attachments.length, related: material.session_id === id }))}
      aiReady={!!process.env.OPENAI_API_KEY} />;
  }
  return <div className="stack-lg">
    <TutorIntro title="Prepare session" description={session.title} back={{ href: `/portal/tutor/sessions/${id}`, label: "Session" }} />
    {students && students.length > 1 && <nav className="row flex-wrap" aria-label="Session students">
      {students.map(student => <Link className={`button ${student.id === studentId ? "" : "secondary"}`} aria-current={student.id === studentId ? "page" : undefined}
        key={student.id} href={`/portal/tutor/sessions/${id}/prepare?student=${student.id}`}>{student.name}</Link>)}
    </nav>}
    {studentId ? <p className="muted">Preparing for {students?.find(student => student.id === studentId)?.name}. Preparation and observations are private to you.</p>
      : <p className="empty">Add a student to the session to start preparing.</p>}
    {workspace}
  </div>;
}
