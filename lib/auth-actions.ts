"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { serverDb } from "@/lib/auth";
import { supabaseConfig } from "@/lib/supabase-env";

const emailSchema = z.email().max(254);

export async function sendSignInLink(form: FormData) {
  const email = emailSchema.safeParse(String(form.get("email") || "").trim().toLowerCase());
  if (!email.success) redirect("/login?state=email");
  if (!supabaseConfig()) redirect("/login?state=setup");
  const db = await serverDb();
  const { error } = await db.auth.signInWithOtp({ email: email.data, options: { shouldCreateUser: false } });
  // Keep the response identical for provisioned and unknown email addresses.
  if (error && (error.status ?? 0) >= 500) redirect("/login?state=delivery");
  redirect("/login?state=sent");
}

export async function confirmSignIn(form: FormData) {
  const tokenHash = form.get("token_hash");
  const type = form.get("type");
  if (typeof tokenHash !== "string" || !/^[\w-]{20,256}$/.test(tokenHash)
      || (type !== "invite" && type !== "magiclink" && type !== "email")) {
    redirect("/login?state=expired");
  }
  const db = await serverDb();
  const { error } = await db.auth.verifyOtp({ token_hash: tokenHash, type });
  if (error) redirect("/login?state=expired");
  const { data: person, error: profileError } = await db.rpc("attach_person");
  if (!person || profileError) {
    await db.auth.signOut({ scope: "local" });
    redirect("/login?state=unassigned");
  }
  redirect("/portal");
}

export async function signOut() {
  const db = await serverDb();
  await db.auth.signOut({ scope: "local" });
  redirect("/login");
}
