"use server";

import { engagementKinds } from "@/lib/tutor/fields";
import { check, choice, idField, optionalId, requireClient, required, tutorAction, value } from "@/lib/tutor/validation";

export async function saveEngagement(form: FormData) {
  return tutorAction(async (db) => {
    const id = optionalId(form, "id");
    const engagement = {
      title: required(form, "title", "an engagement title", 120),
      kind: choice(form, "kind", engagementKinds),
      description: value(form, "description"),
    };
    if (id) {
      const { error } = await db.from("engagements").update(engagement).eq("id", id).select("id").single();
      check(error, "The engagement could not be updated.");
      return { message: "Engagement saved.", href: `/portal/tutor/engagements/${id}` };
    }
    const { data, error } = await db.from("engagements").insert(engagement).select("id").single();
    check(error, "The engagement could not be created.");
    return { message: "Engagement created.", href: `/portal/tutor/engagements/${data!.id}` };
  });
}

export async function addEnrollment(form: FormData) {
  return tutorAction(async (db) => {
    const engagement_id = idField(form, "engagement_id");
    const student_id = idField(form, "student_id");
    await requireClient(db, student_id, "student");
    const { error } = await db.from("engagement_students").upsert({ engagement_id, student_id },
      { onConflict: "engagement_id,student_id", ignoreDuplicates: true });
    check(error, "The student could not be enrolled.");
    return { message: "Student enrolled." };
  });
}

export async function removeEnrollment(form: FormData) {
  return tutorAction(async (db) => {
    const engagementId = idField(form, "engagement_id");
    const studentId = idField(form, "student_id");
    const { error } = await db.from("engagement_students").delete().eq("engagement_id", engagementId).eq("student_id", studentId);
    check(error, "The student could not be removed.");
    return { message: "Student removed from the engagement." };
  });
}
