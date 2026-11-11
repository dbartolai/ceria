import Image from "next/image";
import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return <Link className="brand" href={href} aria-label="ceria home">
    <Image src="/branding/ceria-wordmark.webp" alt="" width={132} height={58} unoptimized />
  </Link>;
}
