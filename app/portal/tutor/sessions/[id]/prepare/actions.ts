"use server";

import { planDraftSchema, preparationSchema } from "@/lib/study-plans/contracts";
import { sessionStudent } from "@/lib/study-plans/data";
import { check, FormError, idField, tutorAction, value } from "@/lib/tutor/validation";

function parseJson(input: string) {
  try { return JSON.parse(input); } catch { throw new FormError("Check the draft and try again."); }
}

export async function savePreparation(form: FormData) {
  return tutorAction(async db => {
    const session_id = idField(form, "session_id"), student_id = idField(form, "student_id");
    await sessionStudent(db, session_id, student_id);
    const parsed = preparationSchema.safeParse(parseJson(value(form, "preparation", 100000)));
    if (!parsed.success) throw new FormError("Check the preparation. Topics need names, and notes must fit their length limits.");
    const { error } = await db.from("session_preparations").upsert({ session_id, student_id, ...parsed.data, updated_at: new Date().toISOString() });
    check(error, "The preparation could not be saved.");
    return { message: "Preparation and observations saved." };
  });
}

export async function saveStudyPlan(form: FormData) {
  return tutorAction(async db => {
    const sessionId = idField(form, "session_id"), studentId = idField(form, "student_id");
    await sessionStudent(db, sessionId, studentId);
    const parsed = planDraftSchema.safeParse(parseJson(value(form, "plan", 120000)));
    if (!parsed.success) throw new FormError("Add at least one named task. Check task dates, lengths, and estimated minutes.");
    const { title, summary, items } = parsed.data;
    const { error } = await db.rpc("save_study_plan", { p_session_id: sessionId, p_student_id: studentId, p_title: title, p_summary: summary, p_items: items });
    check(error, "The study plan could not be saved. Return a published plan to draft before editing.");
    return { message: "Study plan draft saved." };
  });
}

export async function publishStudyPlan(form: FormData) {
  return tutorAction(async db => {
    const { error } = await db.rpc("publish_study_plan", { p_id: idField(form, "id") });
    check(error, "The saved plan could not be published. Add a study task first.");
    return { message: "Study plan published to the student and linked guardians." };
  });
}

export async function unpublishStudyPlan(form: FormData) {
  return tutorAction(async db => {
    const { error } = await db.from("study_plans").update({ published_at: null }).eq("id", idField(form, "id")).select("id").single();
    check(error, "The study plan could not be returned to draft.");
    return { message: "Study plan returned to draft." };
  });
}
