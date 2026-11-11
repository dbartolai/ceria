import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { ActionForm } from "@/lib/tutor/action-form";
import { Field, TutorIntro } from "@/lib/tutor/ui";
import { isUuid } from "@/lib/tutor/validation";
import { deleteClient, linkGuardian, sendClientInvitation, unlinkGuardian, updateClient } from "../actions";
import { CopySignInLink } from "../copy-sign-in-link";

export default async function ClientPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}) {
  const { id } = await params;
  const editing = (await searchParams).edit === "1";
  if (!isUuid(id)) notFound();
  const { db } = await requireRole("tutor");
  const { data: client, error } = await db.from("people").select("id,name,email,role,auth_user_id")
    .eq("id", id).in("role", ["student", "guardian"]).is("deleted_at", null).maybeSingle();
  if (error) throw error;
  if (!client) notFound();

  const isStudent = client.role === "student";
  const ownerKey = isStudent ? "student_id" : "guardian_id";
  const counterpartKey = isStudent ? "guardian_id" : "student_id";
  const results = await Promise.all([
    db.from("guardians").select("student_id,guardian_id").eq(ownerKey, id),
    db.from("people").select("id,name").eq("role", isStudent ? "guardian" : "student").is("deleted_at", null).order("name"),
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
      <TutorIntro title={client.name} description={client.email ?? undefined} back={{ href: "/portal/tutor/clients", label: "Clients" }} />
      <div className="grid items-start gap-6 lg:grid-cols-[1.45fr_1fr]">
        <section className="panel stack">
          <div className="row spread">
            <h2>Profile</h2>
            {!editing && <Link className="button secondary" href={`/portal/tutor/clients/${id}?edit=1`}>Edit profile</Link>}
          </div>
          {editing ? <>
            <ActionForm action={updateClient} label="Save profile">
              <input type="hidden" name="id" value={id} />
              <Field name="profile-name" label="Name"><input id="profile-name" name="name" defaultValue={client.name} maxLength={120} required /></Field>
              <Field name="profile-email" label="Email (optional)">
                <input id="profile-email" name="email" type="email" defaultValue={client.email ?? ""} maxLength={254} readOnly={!!client.auth_user_id && !!client.email} />
                {client.auth_user_id && client.email && <small className="muted">This email is linked to the portal account.</small>}
              </Field>
            </ActionForm>
            <Link className="button secondary" href={`/portal/tutor/clients/${id}`}>Cancel</Link>
          </> : <dl className="stack">
            <div><dt className="muted text-sm">Name</dt><dd>{client.name}</dd></div>
            <div><dt className="muted text-sm">Email</dt><dd className="break-all">{client.email || "No email added"}</dd></div>
            <div><dt className="muted text-sm">Role</dt><dd className="capitalize">{client.role}</dd></div>
          </dl>}
        </section>
        <div className="stack">
          <section className="panel stack">
            <h2>Portal access</h2>
            <p className="muted">Share a one-time dashboard link directly. Email is optional.</p>
            <CopySignInLink key={id} clientId={id} emailLess={!client.email} />
            {client.email ? <ActionForm action={sendClientInvitation} label={client.auth_user_id ? "Send sign-in link" : "Send invitation"} secondary>
              <input type="hidden" name="id" value={id} />
            </ActionForm> : <Link className="section-link" href={`/portal/tutor/clients/${id}?edit=1`}>Add email</Link>}
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
          <section className="panel stack">
            <h2>Delete client</h2>
            <p className="muted">Removes the client from your directory and revokes access on every device. Lesson and billing history is kept.</p>
            <ActionForm action={deleteClient} label="Delete client" secondary confirmMessage={`Delete ${client.name} and revoke their portal access? Lesson and billing history will be kept.`}>
              <input type="hidden" name="id" value={id} />
            </ActionForm>
          </section>
        </div>
      </div>
    </div>
  );
}
