import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Settings } from "@/lib/settings";
import { supabaseConfig } from "@/lib/supabase-env";

export type Role = "tutor" | "student" | "guardian";
export type Person = {
  id: string;
  auth_user_id: string | null;
  email: string;
  name: string;
  role: Role;
  settings: Partial<Settings>;
};

export async function serverDb() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase environment variables are missing.");
  const cookieStore = await cookies();
  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(items) {
        try {
          for (const { name, value, options } of items) {
            cookieStore.set(name, value, { ...options, httpOnly: true });
          }
        } catch {
          // Server Components rely on the proxy to refresh cookies.
        }
      },
    },
  });
}

export const getPerson = cache(async () => {
  if (!supabaseConfig()) return null;
  const db = await serverDb();
  const { data } = await db.auth.getClaims();
  if (!data?.claims.sub) return null;

  const { data: person, error } = await db.from("people").select("*")
    .eq("auth_user_id", data.claims.sub).maybeSingle<Person>();
  if (error) throw new Error("Your portal profile could not be loaded.", { cause: error });
  return person ? { db, person } : null;
});

export async function requirePerson() {
  const context = await getPerson();
  if (!context) redirect("/login");
  return context;
}

export async function requireRole(role: Role) {
  const context = await requirePerson();
  if (context.person.role !== role) redirect("/portal");
  return context;
}

export async function invitePerson(email: string) {
  const { db } = await requireRole("tutor");
  const normalizedEmail = email.trim().toLowerCase();
  const { data: person } = await db.from("people").select("id").eq("email", normalizedEmail)
    .in("role", ["student", "guardian"]).maybeSingle();
  if (!person) throw new Error("Save the client before sending an invitation.");
  const config = supabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!config || !secret) throw new Error("Email invitations require the server-side Supabase secret key.");

  const admin = createClient(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const invited = await admin.auth.admin.inviteUserByEmail(normalizedEmail);
  if (!invited.error) return { sent: true };
  if (invited.error.code === "email_exists" || invited.error.code === "user_already_exists") {
    const { error } = await db.auth.signInWithOtp({ email: normalizedEmail, options: { shouldCreateUser: false } });
    if (!error) return { sent: true };
  }
  throw new Error("The invitation email could not be sent. Check your email configuration and try again.");
}
