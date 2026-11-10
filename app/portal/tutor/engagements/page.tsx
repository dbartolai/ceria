import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { TutorIntro } from "@/lib/tutor/ui";
import { EngagementForm } from "./form";

export default async function EngagementsPage() {
  const { db } = await requireRole("tutor");
  const results = await Promise.all([
    db.from("engagements").select("id,title,kind,description").order("title"),
    db.from("engagement_students").select("engagement_id"),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [engagements, enrollments] = results;
  const counts = new Map<string, number>();
  for (const { engagement_id } of enrollments.data ?? []) {
    counts.set(engagement_id, (counts.get(engagement_id) ?? 0) + 1);
  }

  return (
    <div className="stack">
      <TutorIntro title="Engagements" description="Organize one-off lessons, ongoing tutoring, and group programs." />
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel stack">
          <h2>All engagements</h2>
          {!engagements.data?.length && <p className="muted">Create an engagement, then add its students.</p>}
          {!!engagements.data?.length && <ul className="divide-y divide-[var(--border)]">
            {engagements.data.map((engagement) => {
              const count = counts.get(engagement.id) ?? 0;
              return (
                <li key={engagement.id} className="py-3">
                  <Link href={`/portal/tutor/engagements/${engagement.id}`}>{engagement.title}</Link>
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
