"use server";

import { invitePerson } from "@/lib/auth";
import { check, choice, FormError, idField, required, settingsFromForm, tutorAction } from "@/lib/tutor/validation";

export async function createClient(form: FormData) {
  return tutorAction(async (db) => {
    const role = choice(form, "role", ["student", "guardian"] as const);
    const name = required(form, "name", "a name", 120);
    const email = required(form, "email", "an email address", 254).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FormError("Enter a valid email address.");
    const { data, error } = await db.from("people").insert({ name, email, role }).select("id").single();
    check(error, error?.code === "23505" ? "A client already uses this email address." : "The client could not be created.");
    return { message: "Client created.", href: `/portal/tutor/clients/${data!.id}` };
  });
}

export async function updateClient(form: FormData) {
  return tutorAction(async (db) => {
    const id = idField(form, "id");
    const name = required(form, "name", "a name", 120);
    const { error } = await db.from("people").update({ name, settings: settingsFromForm(form) })
      .eq("id", id).in("role", ["student", "guardian"]).select("id").single();
    check(error, "The client could not be updated.");
    return { message: "Client saved." };
  });
}

export async function sendClientInvitation(form: FormData) {
  return tutorAction(async (db) => {
    const id = idField(form, "id");
    const { data, error } = await db.from("people").select("email").eq("id", id)
      .in("role", ["student", "guardian"]).single();
    check(error, "Choose an existing client.");
    try {
      await invitePerson(data!.email);
    } catch {
      throw new FormError("The invitation could not be sent. Check the Supabase email setup or try again shortly.");
    }
    return { message: "Sign-in email sent." };
  });
}

export async function linkGuardian(form: FormData) {
  return tutorAction(async (db) => {
    const student_id = idField(form, "student_id");
    const guardian_id = idField(form, "guardian_id");
    const { data: people, error: lookupError } = await db.from("people").select("id,role").in("id", [student_id, guardian_id]);
    check(lookupError, "The student and guardian could not be loaded.");
    if (!people?.some((person) => person.id === student_id && person.role === "student")
      || !people.some((person) => person.id === guardian_id && person.role === "guardian")) {
      throw new FormError("Choose an existing student and guardian.");
    }
    const { error } = await db.from("guardians").upsert({ student_id, guardian_id }, { onConflict: "guardian_id,student_id", ignoreDuplicates: true });
    check(error, "The guardian could not be linked.");
    return { message: "Guardian linked." };
  });
}

export async function unlinkGuardian(form: FormData) {
  return tutorAction(async (db) => {
    const studentId = idField(form, "student_id");
    const guardianId = idField(form, "guardian_id");
    const { error } = await db.from("guardians").delete().eq("student_id", studentId).eq("guardian_id", guardianId);
    check(error, "The guardian could not be unlinked.");
    return { message: "Guardian link removed." };
  });
}
