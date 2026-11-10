import Link from "next/link";
import { Bell, LogOut } from "lucide-react";
import { Brand } from "@/components/brand";
import { PortalNav } from "@/components/portal-nav";
import { requirePerson } from "@/lib/auth";
import { signOut } from "@/lib/auth-actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { person, db } = await requirePerson();
  const { count } = await db.from("notifications").select("id", { count: "exact", head: true })
    .eq("recipient_id", person.id).is("read_at", null);
  const isTutor = person.role === "tutor";
  return <>
    <header className="portal-header">
      <div className="portal-header-inner row spread">
        <Brand href={isTutor ? "/portal/tutor" : "/portal"} />
        <div className="row">
          <span className="account-name">{person.name}</span>
          {!isTutor && <Link className="header-action" href="/portal/notifications" aria-label={count ? `Notifications, ${count} unread` : "Notifications"}>
            <Bell size={17} aria-hidden /> {count ? <span className="notice-count" aria-hidden>{count}</span> : null}
          </Link>}
          <form action={signOut}>
            <button type="submit" className="header-action"><LogOut size={16} aria-hidden /> Sign out</button>
          </form>
        </div>
      </div>
    </header>
    <div className={isTutor ? "portal-grid tutor" : "portal-grid"}>
      <PortalNav role={person.role} />
      <main id="main-content" className="portal-main">{children}</main>
    </div>
  </>;
}
