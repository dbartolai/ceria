"use client";

export default function PortalError({ reset }: { error: Error; reset: () => void }) {
  return <section className="panel stack" aria-live="polite">
    <h1>Something went wrong</h1>
    <p className="muted">Your portal could not load this page. Please try again.</p>
    <button className="button" type="button" onClick={reset}>Try again</button>
  </section>;
}
