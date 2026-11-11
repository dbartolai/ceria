import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { Brand } from "@/components/brand";
import { getPerson } from "@/lib/auth";
import { sendSignInLink } from "@/lib/auth-actions";
import { supabaseConfig } from "@/lib/supabase-env";

export const metadata: Metadata = { title: "Sign in" };

const messages: Record<string, string> = {
  sent: "If your email is registered, a sign-in link is on its way. Check your inbox and spam folder.",
  expired: "This link is invalid or has already been used. Request a fresh one below.",
  email: "Enter a valid email address.",
  delivery: "The sign-in email could not be delivered. Please try again.",
  unassigned: "Your account has no portal profile yet. Contact your tutor for access.",
  setup: "The portal needs a Supabase connection before you can sign in.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (await getPerson()) redirect("/portal");
  const { state } = await searchParams;
  const message = state && Object.hasOwn(messages, state) ? messages[state] : undefined;
  return <main className="auth-layout" id="main-content">
    <div className="auth-main">
      <Brand />
      <div className="auth-content">
        <div className="eyebrow auth-eyebrow"><span /> Private tutoring portal</div>
        <h1>Welcome to ceria.</h1>
        <p className="auth-description">Your sessions, learning materials, and next steps in one place.</p>
        <form className="stack auth-form" action={sendSignInLink}>
          {message && <p className={state === "sent" ? "notice" : "notice error"} role="status">{message}</p>}
          {!supabaseConfig() && !message && <p className="notice" role="status">The portal is awaiting its Supabase connection.</p>}
          <label>Email address
            <input name="email" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} />
          </label>
          <button className="button auth-button" type="submit">Email me a sign-in link <ArrowRight size={17} aria-hidden /></button>
        </form>
        <p className="auth-footnote"><LockKeyhole size={14} aria-hidden /> Use the email address you shared with your tutor.</p>
      </div>
    </div>
    <aside className="auth-art" aria-hidden="true">
      <Image src="/branding/ceria-artwork.webp" alt="" fill sizes="(max-width: 780px) 100vw, 51vw" loading="eager" />
    </aside>
  </main>;
}
