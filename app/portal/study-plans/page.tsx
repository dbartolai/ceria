import { redirect } from "next/navigation";
import Link from "next/link";
import { sessionLabel } from "@/lib/sessions";
import { requirePerson } from "@/lib/auth";
import { getLinkedStudents, getSessions, rows } from "@/lib/portal-data";
import { StudyPlanTasks } from "@/components/study-plan";
import { MathText } from "@/components/math";
import type { StudyPlan } from "@/lib/study-plans/contracts";

export default async function StudyPlansPage() {
  const { person, db } = await requirePerson();
  if (person.role === "tutor") redirect("/portal/tutor/sessions");
  const [plansResult, students, sessions] = await Promise.all([
    db.from("study_plans").select("*,study_plan_items(*)").not("published_at", "is", null).order("published_at", { ascending: false }).returns<StudyPlan[]>(),
    person.role === "guardian" ? getLinkedStudents(db) : [], getSessions(db),
  ]);
  const plans = rows(plansResult, "study plans");
  return <div className="stack-lg">
    <header className="page-intro"><h1>Study plans</h1><p>Focused practice and next steps from your tutor.</p></header>
    {plans.length ? plans.map(plan => <article className="panel stack content-column" key={plan.id}>
      <p className="eyebrow">{person.role === "guardian" ? `${students.find(student => student.id === plan.student_id)?.name ?? "Student"} · ` : ""}
        {sessionLabel(sessions.find(session => session.id === plan.session_id))}</p>
      <h2>{plan.title}</h2>
      {plan.summary && <div className="prose-copy"><MathText text={plan.summary} /></div>}
      <StudyPlanTasks plan={plan} canComplete={person.role === "student"} />
      {person.role === "student" && <Link className="section-link" href="/portal/materials">Open learning materials</Link>}
    </article>) : <p className="empty">Your tutor’s published study plans will appear here.</p>}
  </div>;
}
