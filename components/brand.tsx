import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return <Link className="brand" href={href} aria-label="Ceria home">
    <svg viewBox="0 0 34 34" width="34" height="34" aria-hidden="true" fill="none">
      <rect x=".5" y=".5" width="33" height="33" rx="11" fill="currentColor" />
      <path d="M17 7v20m-10-10h20M10 10l14 14m0-14L10 24" stroke="#FAF8F3" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="17" cy="17" r="3.5" fill="#EFB54E" />
    </svg>
    <span>Ceria</span>
  </Link>;
}
