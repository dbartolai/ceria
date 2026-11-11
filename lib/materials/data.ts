import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatDateTime } from "@/lib/format";

export async function materialOptions(db: SupabaseClient, engagementId: string, currentStudent?: string | null) {
  const results = await Promise.all([
    db.from("engagement_students").select("student_id").eq("engagement_id", engagementId),
    db.from("people").select("id,name,deleted_at").eq("role", "student").order("name"),
    db.from("sessions").select("id,title,starts_at").eq("engagement_id", engagementId).order("starts_at", { ascending: false }),
    db.from("session_students").select("session_id,student_id").eq("engagement_id", engagementId),
  ]);
  for (const result of results) if (result.error) throw new Error("Material sharing options could not be loaded.", { cause: result.error });
  const [enrollments, people, sessions, roster] = results;
  const enrolled = new Set(enrollments.data?.map(row => row.student_id));
  return {
    students: people.data!.filter(person => (enrolled.has(person.id) && !person.deleted_at) || person.id === currentStudent)
      .map(person => ({ id: person.id, name: person.name + (person.deleted_at ? " (deleted)" : "") })),
    sessions: sessions.data!.map(session => ({ id: session.id,
      label: `${session.title ? `${session.title} · ` : ""}${formatDateTime(session.starts_at)}`,
      participants: roster.data!.filter(row => row.session_id === session.id).map(row => row.student_id),
    })),
  };
}

export type SessionMaterialLink = { session_id: string; id: string; title: string; published_at: string | null };

export async function sessionMaterialLinks(db: SupabaseClient, sessionIds: string[]): Promise<SessionMaterialLink[]> {
  if (!sessionIds.length) return [];
  const [direct, linked] = await Promise.all([
    db.from("materials").select("id,title,session_id,published_at").in("session_id", sessionIds),
    db.from("material_sessions").select("session_id,materials(id,title,published_at)").in("session_id", sessionIds)
      .returns<{ session_id: string; materials: { id: string; title: string; published_at: string | null } | null }[]>(),
  ]);
  if (direct.error || linked.error) throw new Error("Session materials could not be loaded.", { cause: direct.error ?? linked.error });
  const links = new Map<string, SessionMaterialLink>();
  for (const material of direct.data!) links.set(`${material.session_id}:${material.id}`, material as SessionMaterialLink);
  for (const link of linked.data!) if (link.materials) links.set(`${link.session_id}:${link.materials.id}`, { ...link.materials, session_id: link.session_id });
  return [...links.values()];
}
