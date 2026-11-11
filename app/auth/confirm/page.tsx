import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Brand } from "@/components/brand";
import { confirmSignIn } from "@/lib/auth-actions";

export default async function Confirm({
  searchParams,
}: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash: tokenHash, type } = await searchParams;
  const valid = typeof tokenHash === "string" && /^[\w-]{20,256}$/.test(tokenHash)
    && (type === "invite" || type === "magiclink" || type === "email");
  return <main className="confirm-wrap" id="main-content">
    <Brand />
    <div className="panel stack">
      <div>
        <h1>{valid ? "Open your portal" : "Request a new link"}</h1>
        <p className="muted">{valid
          ? "Confirm your sign-in to continue to your ceria workspace."
          : "This link is incomplete. Enter your email address to request another."}</p>
      </div>
      {valid ? <form action={confirmSignIn}>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="type" value={type} />
        <button className="button">Continue to portal <ArrowRight size={17} aria-hidden /></button>
      </form> : <Link className="button" href="/login">Back to sign in</Link>}
    </div>
  </main>;
}
