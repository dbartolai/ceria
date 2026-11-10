import type { Metadata } from "next";
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

function StudyFigure() {
  return <svg viewBox="0 0 530 560" className="study-figure" role="img"
    aria-label="An annotated unit circle showing the sine and cosine of an angle">
    <defs>
      <pattern id="study-grid" width="19" height="19" patternUnits="userSpaceOnUse">
        <circle cx="1" cy="1" r="1" fill="#397f7d" fillOpacity=".24" />
      </pattern>
      <pattern id="study-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
        <path d="M0 0V6" stroke="#397f7d" strokeWidth="1" strokeOpacity=".28" />
      </pattern>
    </defs>
    <rect x="32" y="32" width="466" height="496" fill="url(#study-grid)" />
    <circle cx="264" cy="275" r="174" fill="#F7FAF6" fillOpacity=".62" stroke="#397f7d" strokeWidth="1.2" />
    <circle cx="264" cy="275" r="190" fill="none" stroke="#397f7d" strokeOpacity=".28" strokeDasharray="2 5" />
    <path d="M50 275h427m-213-214v401" stroke="#397f7d" strokeWidth="1.15" />
    <path d="m471 271 6 4-6 4M260 67l4-6 4 6" stroke="#397f7d" strokeWidth="1.2" fill="none" />
    <path d="M264 275 387 152v123Z" fill="#B7DAD6" fillOpacity=".53" />
    <path d="M264 275 387 152v123Z" fill="url(#study-hatch)" />
    <path d="M264 275 387 152" stroke="#397f7d" strokeWidth="2" />
    <path d="M387 152v123H264" stroke="#397f7d" strokeWidth="1.25" strokeDasharray="4 5" fill="none" />
    <path d="M318 275a54 54 0 0 0-16-38l-38 38Z" fill="#EFB54E" fillOpacity=".4" />
    <path d="M318 275a54 54 0 0 0-16-38" stroke="#9b681e" fill="none" />
    <path d="M375 275v-12h12" stroke="#397f7d" fill="none" />
    <circle cx="387" cy="152" r="5.5" fill="#EFB54E" stroke="#8b6227" />
    <circle cx="264" cy="275" r="3.5" fill="#397f7d" />
    <g fill="#306461" fontFamily="Cormorant Garamond Variable, Georgia, serif" fontSize="24" fontStyle="italic">
      <text x="485" y="284">x</text><text x="272" y="67">y</text>
      <text x="313" y="253" fill="#80561b">θ</text><text x="397" y="220">sin θ</text>
      <text x="306" y="302">cos θ</text><text x="245" y="299">O</text>
      <text x="321" y="205">1</text>
    </g>
    <path d="M92 482h58m229 0h59" stroke="#397f7d" strokeOpacity=".37" />
    <text x="264" y="487" textAnchor="middle" fill="#306461" fontFamily="DM Sans Variable, sans-serif"
      fontSize="10" letterSpacing="3">THE UNIT CIRCLE</text>
  </svg>;
}

export default async function Login({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (await getPerson()) redirect("/portal");
  const { state } = await searchParams;
  const message = state && Object.hasOwn(messages, state) ? messages[state] : undefined;
  return <main className="auth-layout" id="main-content">
    <div className="auth-main">
      <Brand />
      <div className="auth-content">
        <div className="eyebrow auth-eyebrow"><span /> Private tutoring portal</div>
        <h1>Welcome to Ceria.</h1>
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
    <aside className="auth-art"><StudyFigure /></aside>
  </main>;
}
