import Image from "next/image";
import Link from "next/link";

export function Brand({ href = "/", wordmark = false }: { href?: string; wordmark?: boolean }) {
  return <Link className="brand" href={href} aria-label="Ceria home">
    {wordmark ? (
      <Image src="/branding/ceria-wordmark.webp" alt="" width={132} height={58} unoptimized />
    ) : (
      <>
        <Image src="/branding/ceria-mark.webp" alt="" width={36} height={36} unoptimized />
        <span>Ceria</span>
      </>
    )}
  </Link>;
}
