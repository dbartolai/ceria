"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { ActionResult } from "./fields";

export function ActionForm({
  action,
  children,
  label,
  secondary = false,
  reset = false,
  disabled = false,
  confirmMessage,
}: {
  action: (form: FormData) => Promise<ActionResult>;
  children?: ReactNode;
  label: string;
  secondary?: boolean;
  reset?: boolean;
  disabled?: boolean;
  confirmMessage?: string;
}) {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult>();
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || disabled) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setResult(undefined);
    startTransition(async () => {
      try {
        const response = await action(data);
        setResult(response);
        if ("message" in response) {
          if (reset) form.reset();
          if (response.href) router.push(response.href);
        }
      } catch {
        setResult({ error: "The request could not be completed. Try signing in again if the problem continues." });
      }
    });
  }

  return (
    <form method="post" className="stack" onSubmit={submit}>
      {children}
      <div>
        <button className={secondary ? "button secondary" : "button"} disabled={pending || disabled} type="submit">
          {pending ? "Working…" : label}
        </button>
        {result && ("error" in result ? (
          <p className="notice error mt-2" role="alert">{result.error}</p>
        ) : (
          <p className="muted mt-2" role="status">{result.message}</p>
        ))}
      </div>
    </form>
  );
}
