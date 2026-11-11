"use server";

import { sessionStatuses } from "@/lib/tutor/fields";
import { check, choice, FormError, idField, idList, optionalId, required, tutorAction, value } from "@/lib/tutor/validation";

export async function saveSession(form: FormData) {
  return tutorAction(async (db) => {
    const id = optionalId(form, "id");
    const engagementId = idField(form, "engagement_id");
    const startsAt = new Date(required(form, "starts_at", "a start date and time", 40));
    const duration = Number(required(form, "duration_minutes", "a duration", 3));
    const students = idList(form, "students");
    if (!Number.isFinite(startsAt.getTime())) throw new FormError("Enter a valid start date and time.");
    if (!Number.isInteger(duration) || duration < 5 || duration > 480) throw new FormError("Enter a duration between 5 and 480 minutes.");
    if (!students.length) throw new FormError("Select at least one student.");

    const { data, error } = await db.rpc("save_session", {
      p_id: id,
      p_engagement_id: engagementId,
      p_title: value(form, "focus", 120),
      p_starts_at: startsAt.toISOString(),
      p_duration_minutes: duration,
      p_location: value(form, "location", 500),
      p_status: id ? choice(form, "status", sessionStatuses) : "scheduled",
      p_students: students,
    });
    check(error, error?.code === "23503"
      ? "A removed participant has notes or materials tied to this session. Keep the participant selected to preserve that history."
      : "The session could not be saved. Check that the selected students are enrolled in this engagement.");
    return { message: "Session saved.", href: id ? undefined : `/portal/tutor/sessions/${data}` };
  });
}

export async function saveNotes(form: FormData) {
  return tutorAction(async (db) => {
    const session_id = idField(form, "session_id");
    const student_id = optionalId(form, "student_id");
    const notes = {
      session_id,
      student_id,
      topics: value(form, "topics"),
      strengths: value(form, "strengths"),
      weaknesses: value(form, "weaknesses"),
      next_steps: value(form, "next_steps"),
    };
    const { error } = await db.from("session_notes").upsert(notes, { onConflict: "session_id,student_id" });
    check(error, "The notes could not be saved. Confirm that the student attended this session.");
    return { message: "Private notes saved." };
  });
}

export async function saveRecap(form: FormData) {
  return tutorAction(async (db) => {
    const id = optionalId(form, "id");
    const session_id = idField(form, "session_id");
    const body = required(form, "body", "a recap", 12000);
    const topics = value(form, "topics", 1500);

    if (id) {
      const { error } = await db.from("recaps").update({ body, topics }).eq("id", id).eq("session_id", session_id)
        .is("published_at", null).select("id").single();
      check(error, "The draft could not be saved. Published recaps must be returned to draft first.");
      return { message: "Recap draft saved." };
    }
    const { error } = await db.from("recaps").insert({
      session_id, body, topics,
      student_id: optionalId(form, "student_id"),
      audience: choice(form, "audience", ["student", "guardian"] as const),
    });
    check(error, error?.code === "23505"
      ? "A recap already exists for this audience and participant. Edit the existing recap below."
      : "The draft could not be created. Check that the selected student attended this session.");
    return { message: "Recap draft created. Open the draft to review and publish." };
  });
}

export async function publishRecap(form: FormData) {
  return tutorAction(async (db) => {
    const p_id = idField(form, "id");
    const { error } = await db.rpc("publish_recap", { p_id });
    check(error, "The recap could not be published.");
    return { message: "Recap published." };
  });
}

export async function unpublishRecap(form: FormData) {
  return tutorAction(async (db) => {
    const id = idField(form, "id");
    const { error } = await db.from("recaps").update({ published_at: null }).eq("id", id).select("id").single();
    check(error, "The recap could not be returned to draft.");
    return { message: "Recap returned to draft." };
  });
}
