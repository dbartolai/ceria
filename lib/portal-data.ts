import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AssignmentSummary } from "@/lib/quizzes/types";
import type { Settings } from "@/lib/settings";

export type Session = {
  id: string;
  engagement_id: string;
  title: string;
  starts_at: string;
  duration_minutes: number;
  location: string;
  status: "scheduled" | "completed" | "cancelled";
  engagements: { title: string } | null;
};

export type Recap = {
  id: string;
  session_id: string;
  student_id: string | null;
  audience: "student" | "guardian";
  body: string;
  topics: string;
  published_at: string;
};

const linkedStudentSchema = z.object({ id: z.string(), name: z.string() });
export type LinkedStudent = z.infer<typeof linkedStudentSchema>;

export function rows<T>(result: { data: T[] | null; error: unknown }, description: string): T[] {
  if (result.error) throw new Error(`Could not load ${description}.`, { cause: result.error });
  return result.data ?? [];
}

export async function getSessions(db: SupabaseClient) {
  return rows(await db.from("sessions").select(
    "id,engagement_id,title,starts_at,duration_minutes,location,status,engagements(title)",
  ).order("starts_at", { ascending: false }).returns<Session[]>(), "sessions");
}

export async function getRecaps(db: SupabaseClient, audience: Recap["audience"]) {
  return rows(await db.from("recaps").select("id,session_id,student_id,audience,body,topics,published_at")
    .eq("audience", audience).not("published_at", "is", null)
    .order("published_at", { ascending: false }).returns<Recap[]>(), "session recaps");
}

export async function getAssignments(db: SupabaseClient) {
  return rows(await db.from("assignments").select(
    "id,title,engagement_id,due_at,published_at,submissions(id,submitted_at,score,total,pending_count)",
  ).order("due_at", { ascending: true, nullsFirst: false }).order("published_at", { ascending: false }).returns<AssignmentSummary[]>(), "assignments");
}

export async function getLinkedStudents(db: SupabaseClient) {
  const { data, error } = await db.rpc("linked_students").order("name");
  if (error) throw new Error("Could not load linked students.", { cause: error });
  return z.array(linkedStudentSchema).parse(data);
}

export type Enrollment = {
  settings: Partial<Settings>;
  engagements: { id: string; title: string; kind: string; settings: Partial<Settings> } | null;
};

export async function getEnrollments(db: SupabaseClient) {
  return rows(await db.from("engagement_students").select("settings,engagements(id,title,kind,settings)")
    .returns<Enrollment[]>(), "engagements");
}

export function isUpcoming(session: Session, now: number) {
  return session.status === "scheduled" && Date.parse(session.starts_at) >= now;
}

export function partitionSessions(sessions: Session[]) {
  const now = Date.now();
  const upcoming = sessions.filter((session) => isUpcoming(session, now)).reverse();
  const previous = sessions.filter((session) => !isUpcoming(session, now));
  return { upcoming, previous };
}
