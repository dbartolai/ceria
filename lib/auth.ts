import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Settings } from "@/lib/settings";
import { supabaseConfig } from "@/lib/supabase-env";

export type Role = "tutor" | "student" | "guardian";
export type Person = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
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
    .eq("auth_user_id", data.claims.sub).is("deleted_at", null).maybeSingle<Person>();
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

export function authAdmin() {
  const config = supabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!config || !secret) throw new Error("Client sign-in links require the server-side Supabase secret key.");

  return createClient(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function emailAlreadyRegistered(error: { code?: string } | null) {
  return error?.code === "email_exists" || error?.code === "user_already_exists";
}

async function bindPortalAccount(db: SupabaseClient, clientId: string, userId: string, email: string | null) {
  const revoked = await db.from("people").select("id").eq("revoked_auth_user_id", userId).limit(1);
  if (revoked.error || revoked.data?.length) throw new Error("This Auth identity has been revoked.");
  let update = db.from("people").update({ auth_user_id: userId }).eq("id", clientId)
    .in("role", ["student", "guardian"]).is("deleted_at", null)
    .or(`auth_user_id.is.null,auth_user_id.eq.${userId}`);
  update = email ? update.eq("email", email) : update.is("email", null);
  const bound = await update.select("id").single();
  if (bound.error) throw new Error("The client changed while access was being created. Refresh and try again.");
}

export async function invitePerson(email: string) {
  const { db } = await requireRole("tutor");
  const normalizedEmail = email.trim().toLowerCase();
  const { data: person } = await db.from("people").select("id,auth_user_id").eq("email", normalizedEmail)
    .in("role", ["student", "guardian"]).is("deleted_at", null).maybeSingle();
  if (!person) throw new Error("Save the client before sending an invitation.");
  const admin = authAdmin();
  const invited = await admin.auth.admin.inviteUserByEmail(normalizedEmail);
  if (!invited.error && invited.data.user) {
    await bindPortalAccount(db, person.id, invited.data.user.id, normalizedEmail);
    return { sent: true };
  }
  if (emailAlreadyRegistered(invited.error)) {
    await generateSignInLink(normalizedEmail, person.auth_user_id, person.id);
    const { error } = await db.auth.signInWithOtp({ email: normalizedEmail, options: { shouldCreateUser: false } });
    if (!error) return { sent: true };
  }
  throw new Error("The invitation email could not be sent. Check your email configuration and try again.");
}

export async function generateSignInLink(email: string | null, authUserId: string | null, clientId: string) {
  const { db } = await requireRole("tutor");
  const admin = authAdmin();
  // A non-deliverable internal identifier lets Supabase authenticate a client
  // without requiring or inventing a contact email. No email is sent here.
  let loginEmail = email || `${clientId}@portal.ceria.invalid`;
  if (authUserId) {
    const existing = await admin.auth.admin.getUserById(authUserId);
    if (existing.error || !existing.data.user.email) throw new Error("The client's Auth account could not be loaded.");
    loginEmail = existing.data.user.email;
  }
  let result = await admin.auth.admin.generateLink({ email: loginEmail, type: authUserId ? "magiclink" : "invite" });
  if (!authUserId && emailAlreadyRegistered(result.error)) {
    result = await admin.auth.admin.generateLink({ email: loginEmail, type: "magiclink" });
  }
  const { user, properties } = result.data;
  if (result.error || !properties?.hashed_token || !user || (authUserId && user.id !== authUserId)) {
    throw new Error("Supabase could not generate a sign-in link for this client.");
  }
  await bindPortalAccount(db, clientId, user.id, email);
  const type = properties.verification_type;
  if (type !== "invite" && type !== "magiclink") throw new Error("Unexpected sign-in link type.");
  const site = new URL(properties.redirect_to);
  const localHttp = site.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(site.hostname);
  if (site.protocol !== "https:" && !localHttp) throw new Error("Supabase Site URL must use HTTPS.");
  const link = new URL("/auth/confirm", site.origin);
  link.searchParams.set("token_hash", properties.hashed_token);
  link.searchParams.set("type", type);
  return link.href;
}
