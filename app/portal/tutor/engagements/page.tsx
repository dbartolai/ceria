import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { tutorEngagements } from "@/lib/tutor/engagements";
import { TutorIntro } from "@/lib/tutor/ui";
import { EngagementForm } from "./form";

export default async function EngagementsPage() {
  const { db } = await requireRole("tutor");
  const engagements = await tutorEngagements(db);

  return (
    <div className="stack">
      <TutorIntro title="Engagements" description="Organize one-off lessons, ongoing tutoring, and group programs." />
      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel stack">
          <h2>All engagements</h2>
          {!engagements.length && <p className="muted">Create an engagement, then add its students.</p>}
          {!!engagements.length && <ul className="divide-y divide-[var(--border)]">
            {engagements.map((engagement) => {
              const count = engagement.students.length;
              return (
                <li key={engagement.id} className="py-3">
                  <Link href={`/portal/tutor/engagements/${engagement.id}`}>{engagement.title}</Link>
                  <p className="text-sm">{engagement.students.map(student => student.name).join(", ") || "No students enrolled"}</p>
                  <p className="muted text-sm capitalize">{engagement.kind} · {count} {count === 1 ? "student" : "students"}</p>
                </li>
              );
            })}
          </ul>}
        </section>
        <section className="panel stack">
          <h2>New engagement</h2>
          <EngagementForm />
        </section>
      </div>
    </div>
  );
}
