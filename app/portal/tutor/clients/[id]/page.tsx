import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/lib/tutor/action-form";
import { Field, SettingsFields, TutorIntro } from "@/lib/tutor/ui";
import { isUuid } from "@/lib/tutor/validation";
import { linkGuardian, sendClientInvitation, unlinkGuardian, updateClient } from "../actions";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { db } = await requireRole("tutor");
  const { data: client, error } = await db.from("people").select("id,name,email,role,auth_user_id,settings")
    .eq("id", id).in("role", ["student", "guardian"]).maybeSingle();
  if (error) throw error;
  if (!client) notFound();

  const isStudent = client.role === "student";
  const ownerKey = isStudent ? "student_id" : "guardian_id";
  const counterpartKey = isStudent ? "guardian_id" : "student_id";
  const results = await Promise.all([
    db.from("guardians").select("student_id,guardian_id").eq(ownerKey, id),
    db.from("people").select("id,name").eq("role", isStudent ? "guardian" : "student").order("name"),
    isStudent
      ? db.from("engagement_students").select("engagement_id,engagements(title)").eq("student_id", id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const [relationships, counterparts, enrollments] = results;
  const linkedIds = new Set(relationships.data?.map((row) => row[counterpartKey]));
  const linked = counterparts.data?.filter((candidate) => linkedIds.has(candidate.id)) ?? [];
  const available = counterparts.data?.filter((candidate) => !linkedIds.has(candidate.id)) ?? [];

  return (
    <div className="stack">
      <TutorIntro title={client.name} description={client.email} back={{ href: "/portal/tutor/clients", label: "Clients" }} />
      <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
        <section className="panel stack">
          <h2>Profile</h2>
          <ActionForm action={updateClient} label="Save profile">
            <input type="hidden" name="id" value={id} />
            <Field name="profile-name" label="Name"><input id="profile-name" name="name" defaultValue={client.name} maxLength={120} required /></Field>
            {isStudent && <SettingsFields prefix="profile" settings={client.settings} />}
          </ActionForm>
        </section>
        <div className="stack">
          <section className="panel stack">
            <h2>Portal access</h2>
            <p className="muted">{client.auth_user_id ? "This client has signed in before." : "This client has yet to sign in."}</p>
            <ActionForm action={sendClientInvitation} label={client.auth_user_id ? "Send sign-in link" : "Send invitation"} secondary>
              <input type="hidden" name="id" value={id} />
            </ActionForm>
          </section>
          <section className="panel stack">
            <h2>{isStudent ? "Linked guardians" : "Linked students"}</h2>
            {!linked.length && <p className="muted">No {isStudent ? "guardians" : "students"} linked yet.</p>}
            {linked.map((person) => (
              <div className="flex flex-wrap items-center justify-between gap-2" key={person.id}>
                <Link href={`/portal/tutor/clients/${person.id}`}>{person.name}</Link>
                <ActionForm action={unlinkGuardian} label="Unlink" secondary>
                  <input type="hidden" name={ownerKey} value={id} />
                  <input type="hidden" name={counterpartKey} value={person.id} />
                </ActionForm>
              </div>
            ))}
            {!!available.length && <ActionForm action={linkGuardian} label={isStudent ? "Link guardian" : "Link student"} reset>
              <input type="hidden" name={ownerKey} value={id} />
              <Field name="link-client" label={isStudent ? "Guardian" : "Student"}>
                <select id="link-client" name={counterpartKey} defaultValue="" required>
                  <option value="" disabled>Choose a client</option>
                  {available.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
                </select>
              </Field>
            </ActionForm>}
          </section>
          {isStudent && <section className="panel stack">
            <h2>Engagements</h2>
            {!enrollments.data?.length && <p className="muted">This student has no active engagements.</p>}
            {enrollments.data?.map((item) => (
              <Link key={item.engagement_id} href={`/portal/tutor/engagements/${item.engagement_id}`}>
                {(item.engagements as unknown as { title: string } | null)?.title ?? "View engagement"}
              </Link>
            ))}
            <Link href="/portal/tutor/engagements">Manage enrollments</Link>
          </section>}
        </div>
      </div>
    </div>
  );
}
