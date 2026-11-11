import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/lib/tutor/action-form";
import { Field, TutorIntro } from "@/lib/tutor/ui";
import { createClient } from "./actions";

export default async function ClientsPage() {
  const { db } = await requireRole("tutor");
  const { data: people, error } = await db.from("people").select("id,name,email,role,auth_user_id")
    .in("role", ["student", "guardian"]).is("deleted_at", null).order("name");
  if (error) throw error;

  return (
    <div className="stack">
      <TutorIntro title="Clients" description="Manage students, guardians, and access to the portal." />
      <div className="grid items-start gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel stack">
          <h2>Client directory</h2>
          {!people?.length && <p className="muted">Add a student or guardian to get started.</p>}
          {!!people?.length && <ul className="divide-y divide-[var(--border)]">
            {people.map((person) => (
              <li key={person.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <Link href={`/portal/tutor/clients/${person.id}`}>{person.name}</Link>
                  {person.email && <p className="muted text-sm break-all">{person.email}</p>}
                </div>
                <span className="muted text-sm capitalize">{person.role}</span>
              </li>
            ))}
          </ul>}
        </section>
        <section className="panel stack">
          <h2>Add a client</h2>
          <ActionForm action={createClient} label="Create client">
            <Field name="client-name" label="Name"><input id="client-name" name="name" maxLength={120} autoComplete="off" required /></Field>
            <Field name="client-email" label="Email (optional)"><input id="client-email" name="email" type="email" maxLength={254} autoComplete="off" /></Field>
            <Field name="client-role" label="Role">
              <select id="client-role" name="role"><option value="student">Student</option><option value="guardian">Guardian</option></select>
            </Field>
          </ActionForm>
        </section>
      </div>
    </div>
  );
}
