"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, CalendarDays, ClipboardList, CreditCard, House, Layers3, LineChart, UsersRound } from "lucide-react";
import type { Role } from "@/lib/auth";

const tutorLinks = [
  ["/portal/tutor", "Overview", House],
  ["/portal/tutor/clients", "Clients", UsersRound],
  ["/portal/tutor/engagements", "Engagements", Layers3],
  ["/portal/tutor/sessions", "Sessions", CalendarDays],
  ["/portal/tutor/quizzes", "Quizzes", ClipboardList],
  ["/portal/tutor/materials", "Materials", BookOpen],
  ["/portal/tutor/billing", "Billing", CreditCard],
] as const;

const studentLinks = [
  ["/portal", "Overview", House],
  ["/portal/sessions", "Sessions", CalendarDays],
  ["/portal/assignments", "Practice", ClipboardList],
  ["/portal/study-plans", "Study plans", BookOpen],
  ["/portal/materials", "Materials", BookOpen],
  ["/portal/progress", "Progress", LineChart],
] as const;

const guardianLinks = [
  ["/portal", "Overview", House],
  ["/portal/study-plans", "Study plans", BookOpen],
  ["/portal/sessions", "Sessions", CalendarDays],
  ["/portal/billing", "Billing", CreditCard],
] as const;

export function PortalNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const links = role === "tutor" ? tutorLinks : role === "student" ? studentLinks : guardianLinks;
  return <nav className="portal-nav" aria-label="Portal">
    {links.map(([href, label, Icon], index) => {
      const active = pathname === href || (index !== 0 && pathname.startsWith(href + "/"));
      return <Link href={href} key={href} aria-current={active ? "page" : undefined}>
        <Icon size={17} strokeWidth={1.65} aria-hidden />
        {label}
      </Link>;
    })}
  </nav>;
}
