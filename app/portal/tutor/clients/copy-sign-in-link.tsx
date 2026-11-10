"use client";

import { useState, useTransition } from "react";
import { createClientSignInLink } from "./actions";

type Feedback = { message: string } | { error: string } | { link: string };

export function CopySignInLink({ clientId }: { clientId: string }) {
  const [feedback, setFeedback] = useState<Feedback>();
  const [pending, startTransition] = useTransition();

  function copyLink() {
    if (pending) return;
    setFeedback(undefined);
    startTransition(async () => {
      let result;
      try {
        result = await createClientSignInLink(clientId);
      } catch {
        setFeedback({ error: "The request could not be completed. Try again in a moment." });
        return;
      }
      if ("error" in result) {
        setFeedback(result);
        return;
      }
      try {
        await navigator.clipboard.writeText(result.link);
        setFeedback({ message: "Sign-in link copied. Paste it into your email to this client." });
      } catch {
        setFeedback(result);
      }
    });
  }

  return (
    <div className="stack">
      <button className="button" type="button" onClick={copyLink} disabled={pending}>
        {pending ? "Creating link…" : "Copy sign-in link"}
      </button>
      {feedback && "message" in feedback && <p className="muted" role="status">{feedback.message}</p>}
      {feedback && "error" in feedback && <p className="notice error" role="alert">{feedback.error}</p>}
      {feedback && "link" in feedback && (
        <label>
          Copy this one-time sign-in link
          <input readOnly value={feedback.link} onFocus={(event) => event.currentTarget.select()} />
        </label>
      )}
    </div>
  );
}
