"use server";

import { authAdmin, generateSignInLink, invitePerson, requireRole } from "@/lib/auth";
import { check, choice, FormError, idField, isUuid, required, tutorAction, value } from "@/lib/tutor/validation";

function optionalEmail(form: FormData) {
  const email = value(form, "email", 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new FormError("Enter a valid email address.");
  return email || null;
}

export async function createClient(form: FormData) {
  return tutorAction(async (db) => {
    const role = choice(form, "role", ["student", "guardian"] as const);
    const name = required(form, "name", "a name", 120);
    const email = optionalEmail(form);
    const { data, error } = await db.from("people").insert({ name, email, role }).select("id").single();
    check(error, error?.code === "23505" ? "A client already uses this email address." : "The client could not be created.");
    return { message: "Client created.", href: `/portal/tutor/clients/${data!.id}` };
  });
}

export async function updateClient(form: FormData) {
  return tutorAction(async (db) => {
    const id = idField(form, "id");
    const name = required(form, "name", "a name", 120);
    const { data: current, error: lookupError } = await db.from("people").select("email,auth_user_id")
      .eq("id", id).in("role", ["student", "guardian"]).is("deleted_at", null).single();
    check(lookupError, "The client could not be loaded.");
    const email = optionalEmail(form);
    if (current!.auth_user_id && current!.email && email !== current!.email) {
      throw new FormError("The email address belongs to this client's portal account.");
    }
    if (current!.auth_user_id && !current!.email && email) {
      const updated = await authAdmin().auth.admin.updateUserById(current!.auth_user_id, { email, email_confirm: true });
      check(updated.error, "The email could not be added to this portal account. Check whether another account uses it.");
    }
    const update = db.from("people").update({ name, email }).eq("id", id).in("role", ["student", "guardian"]).is("deleted_at", null);
    const { error } = await (current!.auth_user_id
      ? update.eq("auth_user_id", current!.auth_user_id)
      : update.is("auth_user_id", null)).select("id").single();
    check(error, error?.code === "23505" ? "A client already uses this email address." : "The client could not be updated. Refresh the profile and try again.");
    return { message: "Client saved.", href: `/portal/tutor/clients/${id}` };
  });
}

export async function sendClientInvitation(form: FormData) {
  return tutorAction(async (db) => {
    const id = idField(form, "id");
    const { data, error } = await db.from("people").select("email").eq("id", id)
      .in("role", ["student", "guardian"]).is("deleted_at", null).single();
    check(error, "Choose an existing client.");
    if (!data!.email) throw new FormError("Add an email address to this client before sending a sign-in link.");
    try {
      await invitePerson(data!.email);
    } catch {
      throw new FormError("The invitation could not be sent. Check the Supabase email setup or try again shortly.");
    }
    return { message: "Sign-in email sent." };
  });
}

export async function createClientSignInLink(id: string): Promise<{ link: string } | { error: string }> {
  const { db } = await requireRole("tutor");
  if (typeof id !== "string" || !isUuid(id)) return { error: "Choose an existing client." };
  const { data: client, error } = await db.from("people").select("email,auth_user_id").eq("id", id)
    .in("role", ["student", "guardian"]).is("deleted_at", null).maybeSingle();
  if (error || !client) return { error: "Choose an existing client." };
  try {
    return { link: await generateSignInLink(client.email, client.auth_user_id, id) };
  } catch {
    return { error: "ceria could not create a sign-in link. Check the Supabase Auth setup or try again shortly." };
  }
}

export async function linkGuardian(form: FormData) {
  return tutorAction(async (db) => {
    const student_id = idField(form, "student_id");
    const guardian_id = idField(form, "guardian_id");
    const { data: people, error: lookupError } = await db.from("people").select("id,role").in("id", [student_id, guardian_id]).is("deleted_at", null);
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

export async function deleteClient(form: FormData) {
  return tutorAction(async db => {
    const { data: authId, error } = await db.rpc("delete_client", { p_id: idField(form, "id") });
    check(error, "The client could not be deleted. Choose an active student or guardian.");
    if (authId) {
      const removed = await authAdmin().auth.admin.deleteUser(authId);
      if (removed.error) console.error("Client access revoked; Auth cleanup failed", removed.error.code);
    }
    return { message: "Client deleted and portal access revoked.", href: "/portal/tutor/clients" };
  });
}
