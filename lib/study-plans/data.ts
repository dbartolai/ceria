import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { FormError } from "@/lib/tutor/validation";

export async function sessionStudent(db: SupabaseClient, sessionId: string, studentId: string) {
  const [session, participant, student] = await Promise.all([
    db.from("sessions").select("id,engagement_id,duration_minutes").eq("id", sessionId).single(),
    db.from("session_students").select("student_id").eq("session_id", sessionId).eq("student_id", studentId).single(),
    db.from("people").select("id").eq("id", studentId).is("deleted_at", null).single(),
  ]);
  if (session.error || participant.error || student.error) throw new FormError("Choose a student participating in this session.");
  return session.data;
}

export async function preparationMaterials(db: SupabaseClient, engagementId: string, sessionId: string, studentId: string) {
  const { data, error } = await db.from("materials")
    .select("id,title,body,student_id,session_id,material_attachments(id,filename,storage_path,size_bytes)")
    .eq("engagement_id", engagementId).order("title");
  if (error) throw new FormError("The session materials could not be loaded.");
  return data.filter(material => (!material.student_id || material.student_id === studentId)
    && (!material.session_id || material.session_id === sessionId));
}
