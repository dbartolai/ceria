import { CalendarDays, Clock3, ExternalLink, MapPin } from "lucide-react";
import { formatDateTime, safeWebUrl } from "@/lib/format";
import type { Session } from "@/lib/portal-data";

const labels = { scheduled: "Scheduled", completed: "Completed", cancelled: "Cancelled" };

export function SessionMeta({ session }: { session: Session }) {
  const meetingUrl = safeWebUrl(session.location);
  return <div className="session-meta">
    <span><Clock3 size={15} aria-hidden /><time dateTime={session.starts_at}>{formatDateTime(session.starts_at)}</time> · {session.duration_minutes} min</span>
    {session.location && session.status !== "cancelled" && <span><MapPin size={15} aria-hidden />
      {meetingUrl ? <a href={meetingUrl} target="_blank" rel="noreferrer">Join online <ExternalLink size={12} aria-hidden /></a> : session.location}
    </span>}
  </div>;
}

export function SessionStatus({ status }: { status: Session["status"] }) {
  return <span className={status === "cancelled" ? "status neutral" : status === "scheduled" ? "status warm" : "status"}>{labels[status]}</span>;
}

export function CalendarLink({ id }: { id: string }) {
  return <a href={`/portal/calendar/${id}`} className="button secondary">
    <CalendarDays size={16} aria-hidden /> Add to calendar
  </a>;
}

export function SessionHeading({ session }: { session: Pick<Session, "title" | "engagements"> }) {
  return <div className="session-heading">
    <h3>{session.engagements?.title ?? "Tutoring session"}</h3>
    {session.title && <p>{session.title}</p>}
  </div>;
}
