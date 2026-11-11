import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type EngagementRow = { id: string; title: string; kind: string; description: string;
  engagement_students: { student_id: string; people: { name: string; deleted_at: string | null } | null }[] };

export async function tutorEngagements(db: SupabaseClient) {
  const { data, error } = await db.from("engagements")
    .select("id,title,kind,description,engagement_students(student_id,people(name,deleted_at))").order("title").returns<EngagementRow[]>();
  if (error) throw new Error("Engagements could not be loaded.", { cause: error });
  return data.map(({ engagement_students, ...engagement }) => ({ ...engagement,
    students: engagement_students.filter(row => row.people && !row.people.deleted_at).map(row => ({ id: row.student_id, name: row.people!.name })).sort((a,b) => a.name.localeCompare(b.name)),
  }));
}

export function engagementLabel(engagement: { title: string; students: { name: string }[] }) {
  return [engagement.title, engagement.students.map(student => student.name).join(", ")].filter(Boolean).join(" · ");
}
