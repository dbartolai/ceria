import Link from "next/link";
import type { ReactNode } from "react";
import type { FieldProps } from "./fields";

export function TutorIntro({ title, description, back, children }: {
  title: string;
  description?: string;
  back?: { href: string; label: string };
  children?: ReactNode;
}) {
  return (
    <header className="page-intro">
      {back && <Link className="muted" href={back.href}>← {back.label}</Link>}
      <h1>{title}</h1>
      {description && <p className="muted">{description}</p>}
      {children}
    </header>
  );
}

export function Field({ name, label, children }: FieldProps) {
  return <div className="grid min-w-0 gap-1.5"><label htmlFor={name}>{label}</label>{children}</div>;
}
