import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarLink, SessionHeading, SessionMeta, SessionStatus } from "@/components/session-card";
import { MathText } from "@/components/math";
import { SessionMaterials } from "@/components/session-materials";
import { sessionMaterialLinks, type SessionMaterialLink } from "@/lib/materials/data";
import { requirePerson } from "@/lib/auth";
import { getLinkedStudents, getRecaps, getSessions, partitionSessions, rows, type LinkedStudent, type Recap, type Session } from "@/lib/portal-data";

export const metadata: Metadata = { title: "Sessions" };

function SessionList({ sessions, recaps, materials, studentsBySession, linked, empty, showCalendar = false }: {
  sessions: Session[];
  recaps: Recap[];
  materials: SessionMaterialLink[];
  studentsBySession: Map<string, string[]>;
  linked: LinkedStudent[];
  empty: string;
  showCalendar?: boolean;
}) {
  if (!sessions.length) return <p className="empty">{empty}</p>;
  return <div className="stack">
    {sessions.map((session) => {
      const participants = studentsBySession.get(session.id);
      const names = linked.filter((student) => participants?.includes(student.id)).map((student) => student.name);
      const sessionRecaps = recaps.filter((recap) => recap.session_id === session.id);
      return <article key={session.id} className="panel stack">
        <div className="row spread align-start">
          <SessionHeading session={session} />
          <SessionStatus status={session.status} />
        </div>
        <SessionMeta session={session} />
        {names.length > 0 && <p className="muted">{names.join(", ")}</p>}
        {showCalendar && <CalendarLink id={session.id} />}
        <SessionMaterials materials={materials.filter(material => material.session_id === session.id)} />
        {sessionRecaps.length > 0 && <div className="recap-list rule-list">
          {sessionRecaps.map((recap) => {
            const name = linked.find((student) => student.id === recap.student_id)?.name;
            return <section className="stack recap" key={recap.id} id={`recap-${recap.id}`}>
              <h4>{name ? `Recap for ${name}` : "Session recap"}</h4>
              {recap.topics && <p className="muted">Topics covered · {recap.topics}</p>}
              <p className="prose-copy"><MathText text={recap.body} /></p>
            </section>;
          })}
        </div>}
      </article>;
    })}
  </div>;
}

export default async function SessionsPage() {
  const { person, db } = await requirePerson();
  if (person.role === "tutor") redirect("/portal/tutor/sessions");
  const guardian = person.role === "guardian";
  const [sessions, recaps, linked, roster] = await Promise.all([
    getSessions(db), getRecaps(db, guardian ? "guardian" : "student"),
    guardian ? getLinkedStudents(db) : [],
    guardian ? db.from("session_students").select("session_id,student_id") : { data: [], error: null },
  ]);
  const studentsBySession = new Map<string, string[]>();
  for (const row of rows(roster, "session participants")) {
    const students = studentsBySession.get(row.session_id) ?? [];
    students.push(row.student_id);
    studentsBySession.set(row.session_id, students);
  }
  const { upcoming, previous } = partitionSessions(sessions);
  const materials = guardian ? [] : await sessionMaterialLinks(db, sessions.map(session => session.id));
  const props = { recaps, materials, linked, studentsBySession };
  return <>
    <header className="page-intro"><h1>Sessions</h1><p>Upcoming tutoring sessions and approved lesson recaps.</p></header>
    <div className="stack-lg content-column">
      <section><h2 className="section-title">Upcoming</h2>
        <SessionList {...props} sessions={upcoming} showCalendar empty="There are no upcoming sessions." />
      </section>
      <section><h2 className="section-title">Session history</h2>
        <SessionList {...props} sessions={previous} empty="Previous sessions will appear here." />
      </section>
    </div>
  </>;
}
